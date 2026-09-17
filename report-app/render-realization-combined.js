'use strict';
/**
 * render-realization-combined.js — HTML-рендерер дашборда /report/realization-full
 * ("Реализация — весь год"). Сводит /report/realization (склад) и /report/realization-legacy
 * (до склада) в один месячный ряд. Детальные разбивки (по складам / по выставкам) — только
 * на исходных дашбордах, сюда ведут прямые ссылки.
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav, isFinanceViewer } = require('./nav');
const { fmtRub, fmtRubClientSrc } = require('./format');

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

const COLOR_WAREHOUSE = '#4a5df9';
const COLOR_LEGACY = '#e67e22';

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

  .legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }

  .note { background: #eef1fe; border: 1px solid #cdd6fb; border-radius: 4px; padding: 16px 20px; font-size: 13px; color: #35408f; margin-top: 20px; }
  .note.warn { background: #fdf3e7; border-color: #f3ddb8; color: #7a5a1e; }
  .note code { background: #fff; padding: 1px 5px; border-radius: 3px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
  }
`;

function renderRealizationCombined(data, viewer) {
  const { token, isDirector } = viewer || {};
  const { available, months, totals, arkhMoskva, warehouseAvailable, legacyAvailable, updatedAt, error } = data;

  if (!available) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация — весь год · Потолкуем?</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация — весь год</h1>
  <nav class="hero-nav">${renderNav('realizationFull', isDirector, isFinanceViewer(viewer))}</nav>
</div>
<div class="container">
  <div class="note warn">Не удалось получить данные.${error ? ` Ошибка: <code>${escHtml(error)}</code>` : ''}</div>
</div>
${bxBootstrap(token)}
</body>
</html>`;
  }

  const updatedStr = new Date(updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const chartLabels = JSON.stringify(months.map(m => monthLabel(m.month)));
  const warehouseData = JSON.stringify(months.map(m => Math.round(m.warehouseSum)));
  const legacyData = JSON.stringify(months.map(m => Math.round(m.legacySum)));
  const monthTotalsJson = JSON.stringify(months.map(m => Math.round(m.total)));

  const tableRows = [...months].reverse().map(m => `<tr>
      <td>${escHtml(monthLabel(m.month))}</td>
      <td class="num">${m.warehouseSum > 0 ? fmtRub(m.warehouseSum) : '—'}</td>
      <td class="num">${m.legacySum > 0 ? fmtRub(m.legacySum) : '—'}</td>
      <td class="num" style="font-weight:600">${fmtRub(m.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация — весь год · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Реализация — весь год</h1>
  <div class="hero-sub">Склад (с мая 2026) + до склада (по февраль–апрель и «Прочее»), одним рядом по месяцам</div>
  <nav class="hero-nav">
    ${renderNav('realizationFull', isDirector, isFinanceViewer(viewer))}
    <span class="fetched-at">обновлено ${updatedStr}</span>
  </nav>
</div>

<div class="container">

<div class="note">
  Сводный обзор. Детальная разбивка по складам — на <a href="/report/realization" style="color:inherit">«Реализация по складам»</a>,
  по ранним выставкам до склада — на <a href="/report/realization-legacy" style="color:inherit">«Реализация (до склада)»</a>.
  Здесь только месячные итоги, без пересечений.
</div>

${arkhMoskva ? `
<div class="note warn">
  <b>АРХ МОСКВА (май 2026) сознательно не включена в сумму «до склада» здесь</b> — часть её сделок
  (≈300 689 ₽ по CRM) уже частично отражена в складских отгрузках мая, добавление привело бы к
  задвоению. Полная сумма по CRM: ${fmtRub(arkhMoskva.sum)}. Подробности и разбивка — на дашборде
  «Реализация (до склада)».
</div>` : ''}

<div class="section" style="margin-top:24px">
  <div class="kpi-grid">
    <div class="kpi-card orange">
      <div class="kpi-label">Реализовано за весь период</div>
      <div class="kpi-value">${fmtRub(totals.total)}</div>
      <div class="kpi-sub">по ${months.length} мес.</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Склад</div>
      <div class="kpi-value">${fmtRub(totals.warehouseSum)}</div>
      <div class="kpi-sub">${warehouseAvailable ? 'с мая 2026, pbi.php' : 'нет данных'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">До склада</div>
      <div class="kpi-value">${fmtRub(totals.legacySum)}</div>
      <div class="kpi-sub">${legacyAvailable ? 'ранние выставки + «Прочее»' : 'нет данных'}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Реализация по месяцам</div>
  <div class="chart-card">
    <h3>
      <span class="legend-dot" style="background:${COLOR_WAREHOUSE}"></span>Склад &nbsp;
      <span class="legend-dot" style="background:${COLOR_LEGACY}"></span>До склада
    </h3>
    <div class="chart-wrap"><canvas id="chartCombined"></canvas></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Таблица по месяцам</div>
  <table class="data-table">
    <thead><tr><th>Месяц</th><th class="num">Склад</th><th class="num">До склада</th><th class="num">Итого</th></tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td>Итого за период</td>
        <td class="num">${fmtRub(totals.warehouseSum)}</td>
        <td class="num">${fmtRub(totals.legacySum)}</td>
        <td class="num">${fmtRub(totals.total)}</td>
      </tr>
    </tfoot>
  </table>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Реализация — весь год · БюроОБП</div>

<script>
${fmtRubClientSrc}
(function() {
  new Chart(document.getElementById('chartCombined'), {
    type: 'bar',
    data: {
      labels: ${chartLabels},
      datasets: [
        { label: 'Склад', data: ${warehouseData}, backgroundColor: '${COLOR_WAREHOUSE}8c', borderColor: '${COLOR_WAREHOUSE}', borderWidth: 1, borderRadius: 3, stack: 'total' },
        { label: 'До склада', data: ${legacyData}, backgroundColor: '${COLOR_LEGACY}8c', borderColor: '${COLOR_LEGACY}', borderWidth: 1, borderRadius: 3, stack: 'total' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + fmtRub(ctx.raw),
            footer: items => {
              const idx = items[0].dataIndex;
              const total = ${monthTotalsJson}[idx];
              return 'Итого за месяц: ' + fmtRub(total);
            },
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#7b79a0', callback: v => fmtRub(v) }, grid: { color: '#e0daf7' } }
      }
    }
  });
})();
</script>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderRealizationCombined };
