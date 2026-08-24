'use strict';
/**
 * nas-auth.js — серверный логин на Synology DSM/QuickConnect через Web API
 * (SYNO.API.Auth), чтобы /report/nas встраивал NAS БЕЗ формы логина DSM внутри
 * окна Б24 — прозрачный SSO.
 *
 * ИЗМЕНЕНО 19.08.2026 (уточнение владельца, было готово и задеплоено с ОДНОЙ
 * общей служебной учёткой на всех — владелец явно отклонил этот вариант):
 * НЕ один общий служебный аккаунт NAS на всех. Каждый Б24-сотрудник, которому
 * положен доступ, получает СВОЮ пару логин/пароль DSM — сервер смотрит, КТО
 * открыл окно в Б24 (uid из bxt-токена, тот же сигнал, что уже даёт isDirector
 * в bx-auth.js), и логинится на NAS именно под его учёткой. Кто не в списке —
 * видит "доступ не настроен для вас", не чужую сессию.
 *
 * Тот же принцип, что и bxBootstrap для Б24: токен/sid едет в URL query,
 * пароль никогда не покидает сервер.
 *
 * ОБЯЗАТЕЛЬНОЕ УСЛОВИЕ (делает владелец руками в DSM, не код): для каждого
 * сотрудника из карты — отдельный пользователь DSM с урезанными правами
 * (НЕ шарить чужой admin-аккаунт). Пары логин/пароль живут ТОЛЬКО в файле
 * NAS_ACCOUNTS_FILE на сервере (гитигнорится, см. .gitignore) — никогда в
 * git, никогда в клиентский JS/HTML, в браузер отдаётся только sid.
 *
 * 2FA на служебном аккаунте ЛОМАЕТ этот механизм для этого конкретного
 * сотрудника — Synology Auth API не проходит логин с включённым OTP без
 * интерактивного второго шага. Это решение владельца по каждой учётке
 * отдельно (compromise между security и transparency), не код.
 *
 * Переменные окружения (report-app/.env на сервере — НЕ коммитить):
 *   NAS_BASE_URL      — адрес DSM API, например https://xxx.quickconnect.to:5001
 *                       auth.cgi ожидается по {NAS_BASE_URL}/webapi/auth.cgi
 *   NAS_ACCOUNTS_FILE — путь к JSON-карте "Б24 uid" → {account, password},
 *                       по умолчанию nas-accounts.json рядом с этим файлом
 *   NAS_TARGET_URL    — (опционально) конкретная страница/приложение DSM
 *   NAS_API_VERSION   — версия SYNO.API.Auth, по умолчанию '6'
 *
 * Формат NAS_ACCOUNTS_FILE (создаёт и наполняет владелец вручную на сервере,
 * права 600, НЕ через чат — пароль не должен идти через контекст агента):
 *   { "134": {"account": "ivanov_nas", "password": "..."},
 *     "18":  {"account": "petrov_nas", "password": "..."} }
 * Ключ — строковый Б24 user ID (тот же ID, что в BX_DIRECTOR_IDS).
 *
 * НЕ ПРОВЕРЕНО ВЖИВУЮ (нет доступа к реальному NAS — служебные учётки
 * владелец пока не завёл, см. открытый вопрос в итоговой выжимке):
 *  - У DSM 7.x путь логина иногда webapi/entry.cgi вместо webapi/auth.cgi.
 *  - Приём sid целевой страницей DSM/QuickConnect как query-параметр `_sid=`
 *    может отличаться версии DSM (в части версий нужна cookie на домен NAS
 *    вместо query — а cookie на чужой домен наш сервер выставить не может,
 *    его должен выставить сам NAS при обращении браузера, так что если query
 *    не сработает на практике, вариант с cookie потребует отдельного решения,
 *    например reverse-proxy запроса на NAS через report-app).
 *  - Ответ 403 при login у Synology обычно означает "нужен OTP" (2FA), 404 —
 *    "неверный OTP-токен" — используется как эвристика для user-facing
 *    сообщения ниже, но точный код стоит сверить на реальном DSM владельца.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

function loadAccountsMap() {
  const file = process.env.NAS_ACCOUNTS_FILE || path.join(__dirname, 'nas-accounts.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    // Файла нет или битый JSON — не поднимаем процесс, просто "нет карты
    // учёток вообще", тот же смысл что раньше был у пустого NAS_ACCOUNT.
    return null;
  }
}

async function nasLogin(bxUserId) {
  const baseUrl = process.env.NAS_BASE_URL;
  const apiVersion = process.env.NAS_API_VERSION || '6';

  if (!baseUrl) {
    return { configured: false, reason: 'no_base_url' };
  }

  const accountsMap = loadAccountsMap();
  const pair = accountsMap && bxUserId != null ? accountsMap[String(bxUserId)] : null;

  if (!pair || !pair.account || !pair.password) {
    // Явно другое сообщение, чем "NAS вообще не настроен" — карта может
    // быть настроена и рабочей для других сотрудников, просто не для
    // ЭТОГО конкретного uid. Никогда не подставляем чужую пару по умолчанию.
    return { configured: true, ok: false, reason: 'no_account_for_user', bxUserId };
  }

  const account = pair.account;
  const passwd = pair.password;

  const authUrl = `${baseUrl.replace(/\/$/, '')}/webapi/auth.cgi`;
  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: apiVersion,
    method: 'login',
    account,
    passwd,
    // 'FileStation', не 'DSM' — владельцу нужен именно File Station, не вся
    // DSM-консоль. Заодно код 402 ("Denied permission") при session='DSM'
    // может объясняться правами приложений именно на полный DSM-доступ у
    // служебного аккаунта (см. официальный DSM Login Web API Guide, стр.18,
    // и proj log --project talk 19.08) — не гарантия, но правдоподобно.
    session: 'FileStation',
    format: 'sid',
  });

  let json;
  try {
    const res = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    json = await res.json();
  } catch (err) {
    console.error('[nas-auth] запрос к NAS упал:', err.message);
    return { configured: true, ok: false, reason: 'network', detail: err.message };
  }

  if (!json || json.success !== true || !json.data || !json.data.sid) {
    const code = json && json.error && json.error.code;
    console.error('[nas-auth] DSM login FAIL, код ошибки:', code, JSON.stringify(json));
    // 403 = обычно "нужен OTP", 404 = "неверный OTP-токен" (эвристика Synology API, см. комментарий выше)
    const hint = (code === 403 || code === 404)
      ? '2FA включена на служебном аккаунте DSM — блокирует автоматический логин. Отключить 2FA на этом служебном пользователе (снижает защиту) или прозрачный SSO работать не будет.'
      : '';
    return { configured: true, ok: false, reason: 'login_failed', code, hint };
  }

  return {
    configured: true,
    ok: true,
    sid: json.data.sid,
    targetUrl: process.env.NAS_TARGET_URL || baseUrl,
  };
}

module.exports = { nasLogin };
