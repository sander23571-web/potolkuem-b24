#!/usr/bin/env python3
"""
Б24 <=> Synology DSM reverse proxy с совмещённой авторизацией.

Идея: пользователь заходит на этот прокси, проходит OAuth-авторизацию
в Битрикс24, сервис по e-mail находит его учётку на NAS (или использует
служебную учётку) и «проксирует» веб-интерфейс Synology DSM, убирая
запрещающие iframe-заголовки (X-Frame-Options / CSP).

Запуск:  python3 app.py
Зависимости: см. requirements.txt (flask, requests)
"""

import json
import logging
import os
import urllib.parse

import requests
from flask import Flask, Response, redirect, request, session

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG = logging.getLogger("b24syno")


def load_json(name, required=True):
    path = os.path.join(BASE_DIR, name)
    if not os.path.exists(path):
        if required:
            raise SystemExit("Нет файла %s рядом с app.py" % name)
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


CFG = load_json("config.json")
USER_MAP = load_json("users.json", required=False)

app = Flask(__name__)
app.secret_key = CFG.get("FLASK_SECRET", "insecure-default")

PORTAL = CFG["PORTAL"].rstrip("/")
CLIENT_ID = CFG["APP_CLIENT_ID"]
CLIENT_SECRET = CFG["APP_CLIENT_SECRET"]
REDIRECT_URI = CFG.get("APP_REDIRECT_URI")

SYNO_BASE = (
    ("https://" if CFG.get("SYNO_HTTPS", True) else "http://")
    + CFG["SYNO_HOST"]
    + ":"
    + str(CFG["SYNO_PORT"])
)
SYNO_VERIFY = not CFG.get("SYNO_DISABLE_VERIFY", False)
AUTH_MODE = CFG.get("AUTH_MODE", "service")

# HTTP-заголовки, которые не нужно пробрасывать на запрос к NAS
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}

LOG.info("Synology target: %s (verify=%s)", SYNO_BASE, SYNO_VERIFY)

syno_session = requests.Session()


def b24_authorize_url():
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
    }
    return "%s/oauth/authorize/?%s" % (PORTAL, urllib.parse.urlencode(params))


def b24_exchange_code(code):
    """Обмениваем авторизационный код на токен доступа пользователя."""
    data = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }
    r = requests.post(PORTAL + "/oauth/token/", data=data, timeout=30)
    r.raise_for_status()
    return r.json()


def b24_current_user(access_token):
    """Узнаём, какой пользователь портала прошёл OAuth."""
    r = requests.get(
        PORTAL + "/rest/user.current",
        params={"auth": access_token},
        timeout=30,
    )
    r.raise_for_status()
    payload = r.json()
    if payload.get("error"):
        raise RuntimeError(payload.get("error_description") or payload.get("error"))
    return payload["result"]


def syno_login(account, passwd):
    """Логинимся в DSM, сохраняем SID в общей сессии requests."""
    url = SYNO_BASE + "/webapi/auth.cgi"
    params = {
        "api": "SYNO.API.Auth",
        "version": "6",
        "method": "login",
        "format": "sid",
    }
    data = {"account": account, "passwd": passwd}
    syno_session.cookies.clear()
    r = syno_session.post(url, params=params, data=data, verify=SYNO_VERIFY, timeout=30)
    j = r.json()
    if not j.get("success"):
        raise RuntimeError("Ошибка входа в DSM: %s" % j)
    return j


def credentials_for(b24_email):
    """Определяем учётку NAS для пользователя портала."""
    if AUTH_MODE == "per-user":
        entry = USER_MAP.get(b24_email)
        if not entry:
            raise PermissionError(
                "Для пользователя %s не задана учётка NAS" % b24_email
            )
        return entry["account"], entry["passwd"]
    # service mode: все пользователи работают под одной служебной учёткой
    return CFG["SYNO_SERVICE_ACCOUNT"], CFG["SYNO_SERVICE_PASSWORD"]


def proxy_request(path):
    """Пересылаем запрос на DSM, убираем запрещающие iframe-заголовки."""
    target = SYNO_BASE + path
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    headers["Host"] = urllib.parse.urlparse(SYNO_BASE).netloc

    try:
        upstream = syno_session.request(
            method=request.method,
            url=target,
            params=request.args.to_dict(),
            data=request.get_data(),
            headers=headers,
            timeout=60,
            allow_redirects=False,
            verify=SYNO_VERIFY,
        )
    except requests.exceptions.SSLError:
        return Response("Ошибка TLS-подключения к NAS. Проверьте сертификат.", status=502)
    except requests.exceptions.ConnectionError as exc:
        return Response("Нет связи с NAS (%s)." % exc, status=502)

    # Перенаправления переписываем, чтобы вести пользователя через прокси
    if upstream.status_code in (301, 302, 303, 307, 308):
        location = upstream.headers.get("Location", "")
        if location.startswith(SYNO_BASE):
            location = location[len(SYNO_BASE):]
        return Response(status=upstream.status_code, headers={"Location": location})

    resp_headers = {}
    for k, v in upstream.headers.items():
        lk = k.lower()
        if lk in ("x-frame-options", "content-security-policy"):
            continue
        if lk in HOP_BY_HOP:
            continue
        resp_headers[k] = v

    return Response(
        upstream.content,
        status=upstream.status_code,
        headers=resp_headers,
        content_type=upstream.headers.get("Content-Type", "application/octet-stream"),
    )


@app.route("/")
def index():
    if "b24_email" not in session:
        return redirect(b24_authorize_url())
    return redirect("/webman/index.cgi")


@app.route("/b24/callback")
def b24_callback():
    code = request.args.get("code")
    if not code:
        return "Нет кода авторизации", 400
    try:
        tok = b24_exchange_code(code)
        user = b24_current_user(tok["access_token"])
        b24_email = user.get("EMAIL") or user.get("LOGIN")
        account, passwd = credentials_for(b24_email)
        syno_login(account, passwd)
        session["b24_email"] = b24_email
    except Exception as exc:  # noqa: BLE001
        LOG.exception("auth error")
        return "Не удалось авторизовать: %s" % exc, 500
    return redirect("/")


@app.route("/logout")
def logout():
    session.clear()
    syno_session.cookies.clear()
    return redirect("/")


@app.route("/<path:path>")
def catch_all(path):
    if "b24_email" not in session:
        return redirect(b24_authorize_url())
    return proxy_request("/" + path)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Для продакшена запускайте через gunicorn / nginx + HTTPS.
    app.run(
        host=CFG.get("LISTEN_HOST", "0.0.0.0"),
        port=int(CFG.get("LISTEN_PORT", 8443)),
        debug=False,
        ssl_context="adhoc" if CFG.get("LISTEN_SSL", False) else None,
    )
