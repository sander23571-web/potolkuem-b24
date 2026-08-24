'use strict';
/**
 * nas-bx-auth.js — вход из ОТДЕЛЬНОГО локального приложения «NAS» (свой пункт
 * меню в Б24, свой client_id/client_secret), не из report-app.
 *
 * Проще, чем bx-auth.js::bxEntry — не нужен JWT/bxt-сессия, потому что у
 * этого приложения нет других страниц, между которыми нужно перемещаться:
 * одно открытие = один рендер NAS-страницы, и всё. Личность резолвится один
 * раз через profile(AUTH_ID), сразу используется для nasLogin(uid), дальше
 * не хранится и никуда не передаётся.
 *
 * Секреты этого приложения — /opt/b24configs/potolkuem/nas-app.env
 * (NAS_APP_CLIENT_ID/NAS_APP_CLIENT_SECRET), права 600, не в git.
 * BX_PORTAL_DOMAIN/BX_MEMBER_ID переиспользуются из report-app/.env — это
 * атрибуты ПОРТАЛА potolkuem, не конкретного приложения, тот же портал для
 * обоих локальных приложений.
 *
 * client_secret этим кодом не используется — profile(AUTH_ID) работает так
 * же, как в bx-auth.js, без обмена на access_token. client_id/client_secret
 * всё равно обязательны при регистрации в Б24, храним на случай если
 * понадобятся другому методу REST API в будущем.
 */
const fetch = require('node-fetch');
const { nasLogin } = require('./nas-auth');
const { renderNas } = require('./render-nas');

function directorIds() {
  return (process.env.BX_DIRECTOR_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function callProfile(baseUrl, authId) {
  const r = await fetch(`${baseUrl}profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth: authId }),
  });
  const json = await r.json();
  if (!json.result) throw new Error(json.error_description || `profile (${baseUrl}) не вернул результат`);
  return json.result;
}

// ── POST /nas-app/entry — и первичная установка, и каждое открытие ────────────
async function nasAppEntry(req, res) {
  const AUTH_ID = req.body && req.body.AUTH_ID;
  const memberId = req.body && req.body.member_id;
  const serverEndpoint = req.body && req.body.SERVER_ENDPOINT;
  const expectedMemberId = process.env.BX_MEMBER_ID;

  if (!AUTH_ID || !memberId || !serverEndpoint || (expectedMemberId && memberId !== expectedMemberId)) {
    console.warn('[nas-app-entry] отказ: member_id=%s AUTH_ID=%s ожидали=%s body=%j',
      memberId, AUTH_ID ? '(есть)' : '(нет)', expectedMemberId, req.body);
    return res.status(403).send('Доступ запрещён: неизвестный портал Битрикс24.');
  }

  let user;
  try {
    const domainBase = `https://${process.env.BX_PORTAL_DOMAIN}/rest/`;
    try {
      user = await callProfile(domainBase, AUTH_ID);
    } catch (domainErr) {
      console.warn('[nas-app-entry] profile через DOMAIN не удался (%s), пробуем SERVER_ENDPOINT: %s', domainBase, domainErr.message);
      user = await callProfile(serverEndpoint, AUTH_ID);
    }
  } catch (err) {
    console.error('[ERR] /nas-app/entry profile:', err.message);
    return res.status(401).send('Не удалось подтвердить пользователя Битрикс24.');
  }

  const uid = String(user.ID);
  const isDirector = directorIds().includes(uid);
  const viewer = { uid, isDirector, token: null };

  try {
    const nasSession = await nasLogin(uid);
    res.send(renderNas(viewer, nasSession, { standalone: true }));
  } catch (err) {
    console.error('[ERR] /nas-app/entry nasLogin:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
}

module.exports = { nasAppEntry };
