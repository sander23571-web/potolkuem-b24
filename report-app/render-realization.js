'use strict';
/**
 * render-realization.js — HTML-рендерер дашборда /report/realization ("Реализация по складам").
 *
 * Столбчатая диаграмма по месяцам, реализация разбита по складам (сгруппированные
 * столбцы — один месяц = группа столбцов, один столбец = один склад).
 *
 * Источник данных — статический CSV-файл, обновляемый вручную (см. realization-data.js
 * про причину: временная схема "по-старинке" до расширения зеркала gigaclaude).
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav } = require('./nav');
const { fmtRub, fmtRubClientSrc } = require('./format');
const { REALIZATION_DIR } = require('./realization-data');

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const MONTH_NAMES = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

const PALETTE = ['#4a5df9', '#e67e22', '#27ae60', '#c0392b', '#8e44ad', '#16a085', '#7b79a0'];

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
  .chart-wrap { height: 380px; position: relative; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #ccc; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 14px; text-align: left; font-weight: 400; white-space: nowrap; }
  .data-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table tfoot td { border-top: 2px solid var(--border); border-bottom: none; font-weight: 600; }

  .note { background: #fdf3e7; border: 1px solid #f3ddb8; border-radius: 4px; padding: 16px 20px; font-size: 13px; color: #7a5a1e; margin-top: 24px; }
  .note code { background: #fff; padding: 1px 5px; border-radius: 3px; }

  .empty { text-align: center; padding: 80px 20px; color: var(--muted); }
  .empty h2 { font-weight: 400; font-size: 20px; margin-bottom: 12px; color: var(--text); }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
  }
`;

function renderRealization(data, viewer) {
  const { token, isDirector } = viewer || {};
  const { available, rows, months, stores, totals, updatedAt, sourceFile } = data;

  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  if (!available) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация · Потолкуем?</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация по складам</h1>
  <div class="hero-sub">Данных пока нет</div>
  <nav class="hero-nav">${renderNav('realization', isDirector)}</nav>
</div>
<div class="container">
  <div class="empty">
    <h2>Файл с данными не найден</h2>
    <p>Данные заполняются вручную: SQL выполняется в Битрикс24 → BI Constructor → SQL Lab,
    результат экспортируется в CSV и кладётся в<br><code>${escHtml(REALIZATION_DIR)}</code></p>
  </div>
</div>
${bxBootstrap(token)}
</body>
</html>`;
  }

  // Данные для сгруппированной столбчатой диаграммы: labels = месяцы, один dataset на склад.
  const chartLabels = JSON.stringify(months.map(monthLabel));
  const chartDatasets = stores.map((store, i) => {
    const byMonth = new Map(rows.filter(r => r.store === store).map(r => [r.month, r.sum]));
    const data = months.map(m => Math.round(byMonth.get(m) || 0));
    const color = PALETTE[i % PALETTE.length];
    return { label: store, data, backgroundColor: color + '8c', borderColor: color, borderWidth: 1, borderRadius: 3 };
  });

  const tableRows = [...months].reverse().map(m => {
    const monthRows = rows.filter(r => r.month === m).sort((a, b) => b.sum - a.sum);
    const monthTotal = monthRows.reduce((acc, r) => acc + r.sum, 0);
    return monthRows.map((r, i) => `<tr>
      ${i === 0 ? `<td rowspan="${monthRows.length}" style="vertical-align:top;font-weight:600">${escHtml(monthLabel(m))}</td>` : ''}
      <td>${escHtml(r.store)}</td>
      <td class="num">${fmt(r.qty)}</td>
      <td class="num" style="color:var(--orange)">${fmtRub(r.sum)}</td>
      ${i === 0 ? `<td rowspan="${monthRows.length}" class="num" style="vertical-align:top;color:var(--muted)">${fmtRub(monthTotal)}</td>` : ''}
    </tr>`).join('');
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация по складам</h1>
  <div class="hero-sub">Помесячно, разбивка по складам</div>
  <nav class="hero-nav">
    ${renderNav('realization', isDirector)}
    <span class="fetched-at">обновлено ${updatedStr}</span>
  </nav>
</div>

<div class="container">

<div class="section" style="margin-top:32px">
  <div class="kpi-grid">
    <div class="kpi-card orange">
      <div class="kpi-label">Реализовано всего</div>
      <div class="kpi-value">${fmtRub(totals.sum)}</div>
      <div class="kpi-sub">за ${months.length} мес.</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Единиц реализовано</div>
      <div class="kpi-value">${fmt(totals.qty)}</div>
      <div class="kpi-sub">по всем складам</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Складов в разбивке</div>
      <div class="kpi-value">${stores.length}</div>
      <div class="kpi-sub">${escHtml(stores.join(', '))}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Реализация по месяцам и складам</div>
  <div class="chart-card">
    <h3>Сумма реализации, ₽</h3>
    <div class="chart-wrap"><canvas id="chartRealization"></canvas></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Таблица по месяцам</div>
  <table class="data-table">
    <thead><tr><th>Месяц</th><th>Склад</th><th class="num">Штук</th><th class="num">Сумма</th><th class="num">Итого за месяц</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="note">
    Данные обновляются вручную: SQL выполняется в BI Constructor → SQL Lab портала, CSV
    кладётся в <code>${escHtml(REALIZATION_DIR)}</code> (сейчас — файл <code>${escHtml(sourceFile)}</code>).
    Автоматической синхронизации пока нет — временное решение до расширения зеркала gigaclaude
    на документы реализации (задача в очереди).
  </div>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Реализация · БюроОБП</div>

<script>
${fmtRubClientSrc}
(function() {
  new Chart(document.getElementById('chartRealization'), {
    type: 'bar',
    data: { labels: ${chartLabels}, datasets: ${JSON.stringify(chartDatasets)} },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#7b79a0', font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtRub(ctx.raw) } }
      },
      scales: {
        x: { ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#7b79a0', callback: v => fmtRub(v) }, grid: { color: '#e0daf7' } }
      }
    }
  });
})();
</script>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderRealization };
