'use strict';
/**
 * bx-auth.js — мост между локальным приложением Б24 и report-app.
 *
 * Б24 при каждом открытии приложения шлёт POST на /bx/entry. Важно: поля DOMAIN
 * там НЕТ (устаревшее предположение) — вместо него member_id (постоянный ID
 * портала, не меняется в отличие от домена) и SERVER_ENDPOINT (общий OAuth-шлюз
 * вида https://oauth.bitrix24.tech/rest/, а не домен портала напрямую).
 * AUTH_ID используется один раз — только чтобы через user.current узнать,
 * кто открыл приложение. Дальше личность/права живут в собственном
 * коротком JWT (?bxt=...), который пробрасывается через ссылки (см. bx-embed.js) —
 * cookie не используем, iframe на чужом домене подпадает под блокировку
 * third-party cookies в части браузеров.
 */
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

const SESSION_TTL = '2h';

function directorIds() {
  return (process.env.BX_DIRECTOR_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// ── POST /bx/entry — вход из левого меню Б24 ───────────────────────────────────
async function bxEntry(req, res) {
  const AUTH_ID = req.body && req.body.AUTH_ID;
  const memberId = req.body && req.body.member_id;
  const serverEndpoint = req.body && req.body.SERVER_ENDPOINT;
  const expectedMemberId = process.env.BX_MEMBER_ID;

  if (!AUTH_ID || !memberId || !serverEndpoint || (expectedMemberId && memberId !== expectedMemberId)) {
    console.warn('[bx-entry] отказ: member_id=%s AUTH_ID=%s ожидали=%s body=%j',
      memberId, AUTH_ID ? '(есть)' : '(нет)', expectedMemberId, req.body);
    return res.status(403).send('Доступ запрещён: неизвестный портал Битрикс24.');
  }

  async function callProfile(baseUrl) {
    const r = await fetch(`${baseUrl}profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth: AUTH_ID }),
    });
    const json = await r.json();
    if (!json.result) throw new Error(json.error_description || `profile (${baseUrl}) не вернул результат`);
    return json.result;
  }

  let user;
  try {
    // Общий OAuth-шлюз oauth.bitrix24.tech (SERVER_ENDPOINT) для этого портала
    // не отдаёт user.current (ERROR_METHOD_NOT_FOUND) и отвечает ACCESS_DENIED
    // на profile — стабильно работает только вызов напрямую на домен портала.
    // SERVER_ENDPOINT оставлен как резервный вариант на случай смены инфраструктуры.
    const domainBase = `https://${process.env.BX_PORTAL_DOMAIN}/rest/`;
    try {
      user = await callProfile(domainBase);
    } catch (domainErr) {
      console.warn('[bx-entry] profile через DOMAIN не удался (%s), пробуем SERVER_ENDPOINT: %s', domainBase, domainErr.message);
      user = await callProfile(serverEndpoint);
    }
  } catch (err) {
    console.error('[ERR] /bx/entry profile:', err.message);
    return res.status(401).send('Не удалось подтвердить пользователя Битрикс24.');
  }

  const isDirector = directorIds().includes(String(user.ID));
  const name = `${user.NAME || ''} ${user.LAST_NAME || ''}`.trim() || `Пользователь #${user.ID}`;
  const token = jwt.sign(
    { uid: String(user.ID), name, isDirector },
    process.env.BX_SESSION_SECRET,
    { expiresIn: SESSION_TTL }
  );

  const target = '/report?bxt=' + encodeURIComponent(token);
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Потолкуем? — Отчёты</title></head>
<body style="font-family:sans-serif;color:#888;background:#0f0b2e">
<script src="https://api.bitrix24.com/api/v1/"></script>
<script>
function go() { window.location.replace(${JSON.stringify(target)}); }
if (window.BX24) {
  BX24.init(function() {
    try { BX24.installFinish(); } catch (e) {}
    try { BX24.fitWindow(); } catch (e) {}
    go();
  });
} else {
  go();
}
</script>
</body></html>`);
}

// ── hybridAuth: bxt (из Б24) ИЛИ Basic Auth (фолбэк для прямого захода) ────────
function createHybridAuth(authMiddleware) {
  return function hybridAuth(req, res, next) {
    // bxt приходит в query (переход по ссылке/select) или в теле POST-формы
    // (перехватчик сабмита в bx-embed.js добавляет его как hidden input).
    const bxt = req.query.bxt || (req.body && req.body.bxt);
    if (bxt) {
      try {
        const payload = jwt.verify(bxt, process.env.BX_SESSION_SECRET);
        req.viewer = { uid: payload.uid, name: payload.name, isDirector: !!payload.isDirector, token: bxt };
        return next();
      } catch (err) {
        // токен просрочен/невалиден — падаем на Basic Auth ниже
      }
    }
    authMiddleware(req, res, () => {
      req.viewer = {
        uid: null,
        name: req.auth && req.auth.user,
        isDirector: !!(req.auth && req.auth.user === process.env.REPORT_ADMIN_USER),
        token: null,
      };
      next();
    });
  };
}

// ── Доступ к закрытым разделам (Расходы руководству) ───────────────────────────
function requireDirector(req, res, next) {
  if (req.viewer && req.viewer.isDirector) return next();
  return res.status(403).send('Доступ запрещён. Раздел доступен только руководству.');
}

module.exports = { bxEntry, createHybridAuth, requireDirector };
