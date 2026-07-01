#!/usr/bin/env python3
"""
task_require_result_cron.py — ставит requireResult=True на задачи,
в которых участвует Юмангулова Алина (id=132).

Запуск: каждую минуту через cron (на 155.212.143.68).
Логика: берём задачи с CHANGED_DATE за последние 3 мин + MEMBER=132,
проверяем requireResult через REST 3.0, при необходимости ставим.
"""
import json
import logging
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

# ── Конфиг ───────────────────────────────────────────────────────────────────
WEBHOOK_V2 = "https://potolkuem.bitrix24.ru/rest/134/gj6y27ehe0f42jeb/"
WEBHOOK_V3 = "https://potolkuem.bitrix24.ru/rest/api/134/gj6y27ehe0f42jeb/"

ALINA_ID       = 132
WINDOW_MINUTES = 3


# ── API helpers ───────────────────────────────────────────────────────────────
def _call(base: str, method: str, params: dict) -> dict:
    data = json.dumps(params).encode()
    req  = urllib.request.Request(
        base + method,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def b24(method: str, params: dict) -> dict:
    """REST v2 — list, стандартные операции."""
    return _call(WEBHOOK_V2, method, params)


def b24v3(method: str, params: dict) -> dict:
    """REST v3 — requireResult и task.result.*"""
    return _call(WEBHOOK_V3, method, params)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    since     = datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)
    since_str = since.strftime("%Y-%m-%dT%H:%M:%S+00:00")

    # Задачи за последние 3 минуты, где Алина — участник в любой роли
    resp  = b24("tasks.task.list", {
        "order":  {"ID": "desc"},
        "filter": {
            ">=CHANGED_DATE": since_str,
            "MEMBER": ALINA_ID,
        },
        "select": ["ID", "TITLE"],
        "limit":  100,
    })

    tasks = resp.get("result", {}).get("tasks", [])
    logging.info("Задач за %d мин с участием Алины: %d", WINDOW_MINUTES, len(tasks))

    for task in tasks:
        task_id = int(task["id"])

        # Проверяем requireResult через REST v3
        detail = b24v3("tasks.task.get", {
            "id":     task_id,
            "select": ["id", "requireResult"],
        })
        item = detail.get("result", {}).get("item", {})

        if item.get("requireResult") is True:
            logging.info("taskId=%s — requireResult уже True, пропуск", task_id)
            continue

        # Ставим флаг
        result = b24v3("tasks.task.update", {
            "id":     task_id,
            "fields": {"requireResult": True},
        })
        ok = result.get("result", {}).get("result", False)
        logging.info(
            "taskId=%s (%s) → requireResult=True | ok=%s",
            task_id, task.get("title", "")[:40], ok,
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        logging.error("Критическая ошибка: %s", exc, exc_info=True)
        sys.exit(1)
