'use strict';
/**
 * nas-auth.js — серверный логин на Synology DSM/QuickConnect через Web API
 * (SYNO.API.Auth), чтобы /report/nas встраивал NAS БЕЗ формы логина DSM внутри
 * окна Б24 — прозрачный SSO, по требованию владельца (уточнение 19.08.2026,
 * пришло уже в процессе реализации задачи A — исходный голый iframe заменён
 * на это до деплоя).
 *
 * Тот же принцип, что и bxBootstrap для Б24: токен/sid едет в URL query,
 * пароль никогда не покидает сервер.
 *
 * ОБЯЗАТЕЛЬНОЕ УСЛОВИЕ (должен сделать владелец руками в DSM, не код):
 * отдельный служебный пользователь DSM с урезанными правами — НЕ admin-
 * аккаунт. Логин/пароль этого пользователя живут только в серверном
 * report-app/.env (гитигнорится, см. .gitignore) — тот же паттерн, что
 * B24_WEBHOOK и REPORT_PASSWORD. Никогда не в git, никогда не уходят в
 * клиентский JS/HTML — в браузер отдаётся только sid.
 *
 * 2FA на служебном аккаунте ЛОМАЕТ этот механизм — Synology Auth API не
 * проходит логин с включённым OTP без интерактивного второго шага. Если
 * 2FA нужна из соображений безопасности — прозрачного SSO не будет,
 * пользователю придётся логиниться вручную через форму DSM. Это решение
 * владельца (compromise между security и transparency), не код.
 *
 * Переменные окружения (report-app/.env на сервере — НЕ коммитить):
 *   NAS_BASE_URL    — адрес DSM API, например https://xxxxx.quickconnect.to
 *                     или https://<ip>:5001 (порт HTTPS DSM веб-интерфейса).
 *                     auth.cgi ожидается по адресу {NAS_BASE_URL}/webapi/auth.cgi
 *   NAS_ACCOUNT     — логин служебного пользователя DSM (НЕ admin)
 *   NAS_PASSWORD    — пароль служебного пользователя
 *   NAS_TARGET_URL  — (опционально) конкретная страница/приложение DSM,
 *                     которую встраиваем в iframe; если не задана —
 *                     используется NAS_BASE_URL как есть
 *   NAS_API_VERSION — версия SYNO.API.Auth, по умолчанию '6'
 *
 * НЕ ПРОВЕРЕНО ВЖИВУЮ (нет доступа к реальному NAS — ни адреса, ни служебной
 * учётки владелец пока не дал, см. открытый вопрос в итоговой выжимке):
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

const fetch = require('node-fetch');

async function nasLogin() {
  const baseUrl = process.env.NAS_BASE_URL;
  const account = process.env.NAS_ACCOUNT;
  const passwd  = process.env.NAS_PASSWORD;
  const apiVersion = process.env.NAS_API_VERSION || '6';

  if (!baseUrl || !account || !passwd) {
    return { configured: false };
  }

  const authUrl = `${baseUrl.replace(/\/$/, '')}/webapi/auth.cgi`;
  const body = new URLSearchParams({
    api: 'SYNO.API.Auth',
    version: apiVersion,
    method: 'login',
    account,
    passwd,
    session: 'DSM',
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
