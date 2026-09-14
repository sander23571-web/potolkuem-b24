'use strict';
/**
 * render-realization-legacy.js — HTML-рендерер дашборда /report/realization-legacy
 * ("Реализация — до склада"). См. realization-legacy-data.js для источника и оговорок.
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav, isFinanceViewer } = require('./nav');
const { fmtRub, fmtRubClientSrc } = require('./format');

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtRuDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PALETTE = ['#4a5df9', '#e67e22', '#27ae60', '#c0392b', '#8e44ad'];

const BASE_CSS = `
  :root {
    --black: #0f0b2e; --dark: #1e1a3a; --accent: #4a5df9; --accent2: #3d4de6;
    --red: #c0392b; --green: #27ae60; --orange: #e67e22;
    --bg: #f5f3ff; --card: #ffffff; --border: #e0daf7; --text: #1e1a3a; --muted: #7b79a0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia','Times New Roman',serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.6; }

  .hero { background: var(--black); color: #fff; padding: 36px 60px 32px; }
  .hero-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .hero h1 { font-size: 36px; font-weight: 400; letter-spacing: 1px; line-height: 1.1; margin-bottom: 6px; }
  .hero-sub { font-size: 14px; color: #888; margin-top: 6px; }
  .hero-nav { margin-top: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .nav-btn { color: #9eabfa; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 14px; font-size: 13px; text-decoration: none; letter-spacing: 1px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent); }
  .nav-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .fetched-at { font-size: 11px; color: #666; margin-left: auto; }

  .container { max-width: 1200px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 16px; margin-top: 24px; }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-sub { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { height: 340px; position: relative; }

  .ex-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px,1fr)); gap: 20px; margin-top: 20px; }
  .ex-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px; }
  .ex-card h3 { font-size: 18px; font-weight: 400; margin-bottom: 4px; }
  .ex-dates { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
  .ex-totals { display: flex; gap: 24px; margin-bottom: 16px; }
  .ex-totals div { font-size: 12px; color: var(--muted); }
  .ex-totals b { display: block; font-size: 20px; color: var(--black); font-weight: 400; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #ccc; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 14px; text-align: left; font-weight: 400; white-space: nowrap; }
  .data-table td { padding: 8px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table tr.undefined td { color: var(--muted); font-style: italic; }

  .note { background: #fdf3e7; border: 1px solid #f3ddb8; border-radius: 4px; padding: 14px 18px; font-size: 12.5px; color: #7a5a1e; margin-top: 14px; }
  .note.info { background: #eef1fe; border-color: #cdd6fb; color: #35408f; }
  .note code { background: #fff; padding: 1px 5px; border-radius: 3px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
  }
`;

function renderExhibitionCard(ex, color) {
  const itemRows = ex.items.map(it => `<tr${it.name === 'Не определено' ? ' class="undefined"' : ''}>
      <td>${escHtml(it.name)}</td>
      <td class="num">${fmt(it.qty)}</td>
      <td class="num" style="color:var(--orange)">${fmtRub(it.sum)}</td>
    </tr>`).join('');

  const dates = ex.begindate
    ? `${fmtRuDate(ex.begindate)}${ex.closedate && ex.closedate !== ex.begindate ? ' — ' + fmtRuDate(ex.closedate) : ''}`
    : null;

  return `<div class="ex-card">
    <h3><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px"></span>${escHtml(ex.title)}</h3>
    ${dates ? `<div class="ex-dates">${dates}</div>` : ''}
    <div class="ex-totals">
      <div>Выручка<b style="color:var(--orange)">${fmtRub(ex.sum)}</b></div>
      <div>Сделок<b>${ex.dealCount}</b></div>
      <div>Позиций разобрано<b>${ex.items.length}</b></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Игра / позиция</th><th class="num">Сделок</th><th class="num">Сумма</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${ex.overlapNote ? `<div class="note">${escHtml(ex.overlapNote)}</div>` : ''}
  </div>`;
}

function renderRealizationLegacy(data, viewer) {
  const { token, isDirector } = viewer || {};
  const { available, exhibitions, totals, updatedAt, error } = data;

  if (!available) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация до склада · Потолкуем?</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация — до склада</h1>
  <nav class="hero-nav">${renderNav('realizationLegacy', isDirector, isFinanceViewer(viewer))}</nav>
</div>
<div class="container">
  <div class="note">Не удалось получить данные.${error ? ` Ошибка: <code>${escHtml(error)}</code>` : ''}</div>
</div>
${bxBootstrap(token)}
</body>
</html>`;
  }

  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const colorOf = Object.fromEntries(exhibitions.map((ex, i) => [ex.id, PALETTE[i % PALETTE.length]]));
  const chartLabels = JSON.stringify(exhibitions.map(ex => ex.title));
  const chartValues = JSON.stringify(exhibitions.map(ex => Math.round(ex.sum)));
  const chartColors = JSON.stringify(exhibitions.map(ex => colorOf[ex.id]));

  const cards = exhibitions.map(ex => renderExhibitionCard(ex, colorOf[ex.id])).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация до склада · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация — до склада</h1>
  <div class="hero-sub">4 ранние выставки + одиночные продажи, до появления складского учёта в Б24</div>
  <nav class="hero-nav">
    ${renderNav('realizationLegacy', isDirector, isFinanceViewer(viewer))}
    <span class="fetched-at">обновлено ${updatedStr}</span>
  </nav>
</div>

<div class="container">

<div class="note info">
  Дополнение к <a href="/report/realization" style="color:inherit">«Реализация по складам»</a>, не замена.
  Тот дашборд читает реальные складские отгрузки (появились в Б24 с мая 2026); эти сделки —
  из воронки «Розничные продажи» без товарных позиций и склада вообще, единственные данные —
  название и сумма сделки. Разбивка по игре — эвристика по тексту названия сделки, не по
  каталогу товаров: часть позиций не удаётся разобрать (см. «Не определено»).
</div>

<div class="section" style="margin-top:24px">
  <div class="kpi-grid">
    <div class="kpi-card orange">
      <div class="kpi-label">Выручка всего</div>
      <div class="kpi-value">${fmtRub(totals.sum)}</div>
      <div class="kpi-sub">по ${exhibitions.length} разделам</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Сделок</div>
      <div class="kpi-value">${totals.dealCount}</div>
      <div class="kpi-sub">воронка «Розничные продажи», WON</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Выручка по разделам</div>
  <div class="chart-card">
    <div class="chart-wrap"><canvas id="chartExhibitions"></canvas></div>
  </div>
</div>

<div class="section">
  <div class="section-title">По разделам</div>
  <div class="ex-grid">${cards}</div>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Реализация до склада · БюроОБП</div>

<script>
${fmtRubClientSrc}
(function() {
  new Chart(document.getElementById('chartExhibitions'), {
    type: 'bar',
    data: {
      labels: ${chartLabels},
      datasets: [{ data: ${chartValues}, backgroundColor: ${chartColors}, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + fmtRub(ctx.raw) } }
      },
      scales: {
        x: { ticks: { color: '#7b79a0', callback: v => fmtRub(v) }, grid: { color: '#e0daf7' } },
        y: { ticks: { color: '#7b79a0', font: { size: 12 } }, grid: { display: false } }
      }
    }
  });
})();
</script>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderRealizationLegacy };
