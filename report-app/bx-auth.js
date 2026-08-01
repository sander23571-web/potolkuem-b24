'use strict';
/**
 * bx-auth.js — мост между локальным приложением Б24 и report-app.
 *
 * Б24 при каждом открытии приложения шлёт POST на /bx/entry с AUTH_ID/DOMAIN.
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
  const DOMAIN = req.body && req.body.DOMAIN;
  const expectedDomain = process.env.BX_PORTAL_DOMAIN;

  if (!AUTH_ID || !DOMAIN || (expectedDomain && DOMAIN !== expectedDomain)) {
    return res.status(403).send('Доступ запрещён: неизвестный портал Битрикс24.');
  }

  let user;
  try {
    const r = await fetch(`https://${DOMAIN}/rest/user.current?auth=${encodeURIComponent(AUTH_ID)}`);
    const json = await r.json();
    if (!json.result) throw new Error(json.error_description || 'user.current не вернул результат');
    user = json.result;
  } catch (err) {
    console.error('[ERR] /bx/entry user.current:', err.message);
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
    const bxt = req.query.bxt;
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
