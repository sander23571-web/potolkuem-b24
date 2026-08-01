'use strict';

const { bxBootstrap } = require('./bx-embed');

// ── Shared with render.js ─────────────────────────────────────────────────────
const BASE_CSS = `
  :root {
    --black:   #0f0b2e;
    --dark:    #1e1a3a;
    --accent:  #4a5df9;
    --red:     #c0392b;
    --green:   #27ae60;
    --bg:      #f5f3ff;
    --card:    #ffffff;
    --border:  #e0daf7;
    --text:    #1e1a3a;
    --muted:   #7b79a0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia','Times New Roman',serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.6; }
  .hero { background: var(--black); color: #fff; padding: 28px 48px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .hero h1 { font-size: 22px; font-weight: normal; letter-spacing: .5px; }
  .hero .meta { font-size: 12px; color: #aaa; }
  nav { background: var(--dark); padding: 0 48px; display: flex; gap: 4px; }
  nav a { color: #ccc; text-decoration: none; padding: 10px 16px; font-size: 13px; display: inline-block; border-bottom: 3px solid transparent; }
  nav a:hover, nav a.active { color: #fff; border-bottom-color: var(--accent); }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 32px 48px 64px; }
  .section-title { font-size: 17px; font-weight: bold; margin: 36px 0 16px; color: var(--dark); border-bottom: 2px solid var(--border); padding-bottom: 8px; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; }
  .kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 4px; }
  .kpi .val { font-size: 26px; font-weight: bold; color: var(--dark); }
  .kpi .sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .kpi .pos { color: var(--green); }
  .kpi .neg { color: var(--red); }
  .accounts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
  .acc-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .acc-card .acc-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .acc-card .acc-head img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
  .acc-card .acc-head .acc-name { font-weight: bold; font-size: 14px; }
  .acc-card .acc-head .acc-type { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
  .acc-card .acc-head a { text-decoration: none; color: inherit; }
  .acc-card .acc-stats { display: grid; grid-template-columns: repeat(4, 1fr); padding: 14px 20px; gap: 8px; border-bottom: 1px solid var(--border); }
  .acc-card .acc-stats .s { text-align: center; }
  .acc-card .acc-stats .s .sv { font-size: 18px; font-weight: bold; }
  .acc-card .acc-stats .s .sl { font-size: 10px; color: var(--muted); text-transform: uppercase; margin-top: 2px; }
  .acc-card .chart-wrap { padding: 16px 20px; }
  .acc-card .chart-wrap canvas { width: 100% !important; height: 140px !important; }
  .watched-table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
  .watched-table th { background: var(--dark); color: #fff; font-size: 12px; font-weight: normal; padding: 10px 14px; text-align: left; text-transform: uppercase; letter-spacing: .5px; }
  .watched-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .watched-table tr:last-child td { border-bottom: none; }
  .watched-table tr:hover td { background: #f0eeff; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: .4px; }
  .badge-vk { background: #e3eeff; color: #1a56c4; }
  .badge-tg { background: #e3f3ff; color: #0a84c1; }
  .badge-dz { background: #fff0e3; color: #c45a1a; }
  .badge-tt { background: #e8f8ff; color: #010101; }
  .badge-mx { background: #e8f0ff; color: #3b4aaa; }
  .refresh-btn { background: var(--accent); color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-block; }
  .refresh-btn:hover { background: #3d4de6; }
  .fetched { font-size: 11px; color: var(--muted); }
  .period-bar { background: #fff; border-bottom: 1px solid var(--border); padding: 8px 48px; display: flex; align-items: center; gap: 6px; }
  .period-btn { border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; font-size: 12px; color: var(--muted); text-decoration: none; }
  .period-btn:hover { border-color: var(--accent); color: var(--accent); }
  .period-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
`;

function fmt(n)  { return n != null ? Math.round(n).toLocaleString('ru-RU') : '—'; }
function fmtF(n, d=2) { return n != null ? Number(n).toFixed(d) : '—'; }

function typeBadge(type) {
  if (type === 'vk_group') return '<span class="badge badge-vk">VK</span>';
  if (type === 'telegram')  return '<span class="badge badge-tg">TG</span>';
  if (type === 'dzen')      return '<span class="badge badge-dz">Дзен</span>';
  if (type === 'tiktok')    return '<span class="badge badge-tt">TikTok</span>';
  if (type === 'max')       return '<span class="badge badge-mx">MAX</span>';
  return `<span class="badge">${type}</span>`;
}

function sign(n) {
  if (n == null) return '—';
  return (n > 0 ? '+' : '') + Math.round(n).toLocaleString('ru-RU');
}

function signClass(n) {
  if (n == null || n === 0) return '';
  return n > 0 ? 'pos' : 'neg';
}

// ── Chart data builders ───────────────────────────────────────────────────────
function buildSubChart(id, hist, type) {
  if (!hist || !hist.length) return '<p style="color:var(--muted);font-size:13px;padding:8px 0">Нет данных</p>';

  const rows = [...hist].reverse();
  const labels = rows.map(r => r.created ? r.created.slice(5) : '');
  const vals   = rows.map(r => r.followers ?? null);

  const chartId = `chart_sub_${id}`;
  return `
    <canvas id="${chartId}"></canvas>
    <script>
    (function(){
      const ctx = document.getElementById('${chartId}').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [{
            label: 'Подписчики',
            data: ${JSON.stringify(vals)},
            borderColor: '#4a5df9',
            backgroundColor: 'rgba(74,93,249,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { font: { size: 10 } }, grid: { color: '#eee' } }
          }
        }
      });
    })();
    </script>`;
}

function buildReachChart(id, hist) {
  if (!hist || !hist.length) return '';
  const rows = [...hist].reverse().filter(r => r.reach && r.reach.total);
  if (!rows.length) return '';

  const labels = rows.map(r => r.created ? r.created.slice(5) : '');
  const vals   = rows.map(r => r.reach.total);

  const chartId = `chart_reach_${id}`;
  return `
    <div style="margin-top:10px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Охват по дням</div>
      <canvas id="${chartId}" style="height:80px!important"></canvas>
    </div>
    <script>
    (function(){
      const ctx = document.getElementById('${chartId}').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [{
            label: 'Охват',
            data: ${JSON.stringify(vals)},
            backgroundColor: 'rgba(74,93,249,0.5)',
            borderRadius: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
            y: { ticks: { font: { size: 9 } }, grid: { color: '#eee' } }
          }
        }
      });
    })();
    </script>`;
}

// ── Account card ──────────────────────────────────────────────────────────────
function renderAccCard(acc, days) {
  const a   = acc.ana30 || {};
  const diff = a.followers_diff ?? null;

  const stats = [
    { v: fmt(a.followers),      l: 'Подписчиков' },
    { v: sign(diff),            l: `Прирост ${days}д`, cls: signClass(diff) },
    { v: fmtF(a.er, 2) + '%',  l: `ER ${days}д` },
    { v: fmt(a.posts),          l: `Постов ${days}д` },
  ];

  const reachChart = acc.type === 'vk_group' ? buildReachChart(acc.id, acc.hist90) : '';

  return `
  <div class="acc-card">
    <div class="acc-head">
      <img src="${acc.img}" alt="">
      <div>
        <div class="acc-type">${typeBadge(acc.type)}</div>
        <div class="acc-name"><a href="${acc.url}" target="_blank">${acc.name}</a></div>
      </div>
    </div>
    <div class="acc-stats">
      ${stats.map(s => `
        <div class="s">
          <div class="sv ${s.cls || ''}">${s.v}</div>
          <div class="sl">${s.l}</div>
        </div>`).join('')}
    </div>
    <div class="chart-wrap">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Динамика подписчиков</div>
      ${buildSubChart(acc.id, acc.hist90)}
      ${reachChart}
    </div>
  </div>`;
}

// ── Watched accounts table ────────────────────────────────────────────────────
function renderWatchedTable(watched, days) {
  const rows = watched.map(acc => {
    const a    = acc.ana30 || {};
    const diff = a.followers_diff ?? null;
    return `
      <tr>
        <td>${typeBadge(acc.type)}</td>
        <td><a href="${acc.url}" target="_blank" style="color:var(--accent);text-decoration:none">${acc.name}</a></td>
        <td style="text-align:right">${fmt(a.followers)}</td>
        <td style="text-align:right;color:${diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'inherit'}">${sign(diff)}</td>
        <td style="text-align:right">${fmtF(a.er, 2)}%</td>
        <td style="text-align:right">${fmt(a.posts)}</td>
      </tr>`;
  }).join('');

  return `
  <table class="watched-table">
    <thead><tr>
      <th>Площадка</th><th>Аккаунт</th>
      <th style="text-align:right">Подписчиков</th>
      <th style="text-align:right">Прирост ${days}д</th>
      <th style="text-align:right">ER</th>
      <th style="text-align:right">Постов 30д</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderSocial(data, token) {
  const { own, watched, fetchedAt, days, from } = data;

  const totalSubs   = own.reduce((s, a) => s + (a.ana30?.followers || 0), 0);
  const totalGrowth = own.reduce((s, a) => s + (a.ana30?.followers_diff || 0), 0);
  const avgER       = own.length ? (own.reduce((s, a) => s + (a.ana30?.er || 0), 0) / own.length) : 0;

  const periodBtns = [7, 14, 30, 60, 90].map(d =>
    `<a href="/social?days=${d}" class="period-btn${days === d ? ' active' : ''}">${d} дн.</a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SMM Дашборд — Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div>
    <h1>SMM Дашборд — Потолкуем?</h1>
    <div class="meta">Данные: LiveDune · за последние ${days} дней (с ${from})</div>
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <span class="fetched">Обновлено: ${new Date(fetchedAt).toLocaleString('ru-RU')}</span>
    <form method="POST" action="/social/refresh" style="display:inline">
      <input type="hidden" name="days" value="${days}">
      <button class="refresh-btn" type="submit">Обновить</button>
    </form>
  </div>
</div>

<nav>
  <a href="/report">Выставки</a>
  <a href="/social" class="active">SMM</a>
</nav>

<div class="period-bar">
  <span style="font-size:12px;color:var(--muted);margin-right:4px">Период:</span>
  ${periodBtns}
</div>

<div class="wrap">

  <div class="kpi-row">
    <div class="kpi">
      <div class="label">Всего подписчиков</div>
      <div class="val">${fmt(totalSubs)}</div>
      <div class="sub">по всем площадкам</div>
    </div>
    <div class="kpi">
      <div class="label">Прирост за ${days} дней</div>
      <div class="val ${signClass(totalGrowth)}">${sign(totalGrowth)}</div>
      <div class="sub">суммарно</div>
    </div>
    <div class="kpi">
      <div class="label">Средний ER</div>
      <div class="val">${fmtF(avgER, 2)}%</div>
      <div class="sub">по собственным аккаунтам</div>
    </div>
    <div class="kpi">
      <div class="label">Площадок</div>
      <div class="val">${own.length}</div>
      <div class="sub">VK · Telegram · Дзен</div>
    </div>
  </div>

  <div class="section-title">Собственные аккаунты</div>
  <div class="accounts-grid">
    ${own.map(acc => renderAccCard(acc, days)).join('')}
  </div>

  <div class="section-title">Отслеживаемые аккаунты</div>
  ${renderWatchedTable(watched, days)}

</div>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderSocial };
