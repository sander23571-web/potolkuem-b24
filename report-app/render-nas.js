'use strict';
/**
 * render-nas.js — HTML-рендерер страницы /report/nas: Synology QuickConnect
 * встроенный в отдельное окно Б24, тем же паттерном, что /report/warehouse
 * (BASE_CSS-хедер + nav + bxBootstrap для auto-height/токена внутри Б24).
 *
 * Это НЕ дашборд с данными — статичная страница с <iframe> на QuickConnect.
 * Ничего не ходит в Б24 REST API, поэтому низкий риск (см. задача A в БЗ talk).
 *
 * URL QuickConnect не хардкожен — берётся из NAS_QUICKCONNECT_URL (.env).
 * На момент внедрения (19.08.2026) сам URL/quickconnect ID нигде в БЗ не найден
 * (proj search "QuickConnect"/"Synology" — пусто), это открытый вопрос к
 * владельцу, а не догадка. Пока переменная не задана — страница показывает
 * понятное сообщение вместо битого iframe.
 *
 * ВАЖНО (потенциальная проблема, см. отчёт задачи A): это iframe-в-iframe —
 * QuickConnect встраивается в окно report-app, которое само уже внутри iframe
 * Б24. Если на стороне DSM/QuickConnect выставлен X-Frame-Options/CSP
 * frame-ancestors, запрещающий встраивание с чужого домена — iframe ниже
 * останется пустым молча (кросс-доменно это не отловить через JS/onerror).
 * Поэтому рядом всегда есть ссылка "Открыть в новой вкладке" как запасной путь.
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav } = require('./nav');

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE_CSS = `
  :root {
    --black:   #0f0b2e;
    --dark:    #1e1a3a;
    --accent:  #4a5df9;
    --accent2: #3d4de6;
    --red:     #c0392b;
    --green:   #27ae60;
    --orange:  #e67e22;
    --bg:      #f5f3ff;
    --card:    #ffffff;
    --border:  #e0daf7;
    --text:    #1e1a3a;
    --muted:   #7b79a0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'Georgia','Times New Roman',serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.6; display: flex; flex-direction: column; }

  .hero { background: var(--black); color: #fff; padding: 36px 60px 32px; flex: 0 0 auto; }
  .hero-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .hero h1 { font-size: 36px; font-weight: 400; letter-spacing: 1px; line-height: 1.1; margin-bottom: 6px; }
  .hero-sub { font-size: 14px; color: #888; margin-top: 6px; }
  .hero-nav { margin-top: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .nav-btn { color: #9eabfa; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 14px; font-size: 13px; text-decoration: none; letter-spacing: 1px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent); }
  .nav-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  .nas-toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; padding: 14px 32px; border-bottom: 1px solid var(--border); background: var(--card); }
  .nas-toolbar .ext-link { color: var(--accent); text-decoration: none; font-size: 13px; border: 1px solid var(--border); border-radius: 3px; padding: 4px 12px; white-space: nowrap; }
  .nas-toolbar .ext-link:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .nas-toolbar .hint { font-size: 12px; color: var(--muted); }

  .nas-frame-wrap { flex: 1 1 auto; min-height: 640px; }
  .nas-frame-wrap iframe { display: block; width: 100%; height: 100%; min-height: 640px; border: none; }

  .nas-missing { max-width: 640px; margin: 60px auto; padding: 0 24px; text-align: center; }
  .nas-missing h2 { font-size: 20px; font-weight: 400; margin-bottom: 16px; }
  .nas-missing p { color: var(--muted); }
  .nas-missing code { background: var(--card); border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 16px; border-top: 1px solid var(--border); flex: 0 0 auto; letter-spacing: 1px; }
`;

function renderNas(viewer) {
  const { token, isDirector } = viewer || {};
  const qcUrl = process.env.NAS_QUICKCONNECT_URL || '';

  const body = qcUrl
    ? `
<div class="nas-toolbar">
  <a class="ext-link" href="${escHtml(qcUrl)}" target="_blank" rel="noopener">Открыть в новой вкладке ↗</a>
  <span class="hint">Если ниже пусто — Synology блокирует встраивание в iframe чужого домена, используйте ссылку слева.</span>
</div>
<div class="nas-frame-wrap">
  <iframe src="${escHtml(qcUrl)}" title="Synology QuickConnect" loading="lazy" allow="fullscreen"></iframe>
</div>`
    : `
<div class="nas-missing">
  <h2>NAS ещё не подключён</h2>
  <p>Не задан адрес QuickConnect — переменная окружения <code>NAS_QUICKCONNECT_URL</code> в
  <code>report-app/.env</code> пустая или отсутствует. Открытый вопрос к владельцу: QuickConnect ID
  (или прямой URL) и логин NAS нигде в базе знаний не найдены (проверено: <code>proj search
  "QuickConnect"</code>, <code>proj search "Synology"</code>). Как только адрес будет известен —
  добавить его в .env и перезапустить report-app (pm2 restart report-app), код менять не нужно.</p>
</div>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NAS · Потолкуем?</title>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>NAS</h1>
  <div class="hero-sub">Synology QuickConnect</div>
  <nav class="hero-nav">
    ${renderNav('nas', isDirector)}
  </nav>
</div>
${body}
<div class="footer">Потолкуем? · NAS · БюроОБП</div>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderNas };
