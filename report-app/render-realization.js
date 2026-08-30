'use strict';
/**
 * render-realization.js — HTML-рендерер дашборда /report/realization ("Реализация по складам").
 *
 * Единый столбец на месяц, разбитый на цветные сегменты по складу (stacked bar),
 * с подписью склада на сегменте (если сегмент не совсем узкий) и общей суммой месяца
 * над столбцом. Плюс выбор диапазона дат (period.js, тот же паттерн, что в /report/marketing).
 *
 * Источник данных — BI-аналитика (pbi.php), напрямую с портала, см. realization-data.js.
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav } = require('./nav');
const { fmtRub, fmtRubClientSrc } = require('./format');
const { PRESETS, rangeQueryString } = require('./period');

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const MONTH_NAMES = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function fmtRuDateFull(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function periodLabel(range) {
  const from = fmtRuDateFull(range.from);
  const to   = fmtRuDateFull(range.to);
  if (!from && !to) return 'за всё время';
  if (from && to)   return `${from} — ${to}`;
  if (from)         return `с ${from}`;
  return `по ${to}`;
}
function renderPeriodBar(basePath, range) {
  const buttons = PRESETS.map(p => {
    const active = range.preset === p.key;
    return `<a class="period-btn${active ? ' active' : ''}" href="${basePath}?range=${p.key}">${p.label}</a>`;
  }).join('');
  return `<div class="period-bar">
    <div class="period-presets">${buttons}</div>
    <form class="period-custom" method="GET" action="${basePath}">
      <input type="date" name="from" value="${range.from || ''}">
      <span>—</span>
      <input type="date" name="to" value="${range.to || ''}">
      <button type="submit">Применить</button>
    </form>
    <div class="period-label">Период: ${periodLabel(range)}</div>
  </div>`;
}

const PALETTE = ['#4a5df9', '#e67e22', '#27ae60', '#c0392b', '#8e44ad', '#16a085', '#7b79a0', '#2aabee', '#c2185b', '#8d6e63', '#607d8b', '#f39c12'];

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

  .period-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 14px 18px; margin-top: 24px; }
  .period-presets { display: flex; gap: 6px; flex-wrap: wrap; }
  .period-btn { font-family: inherit; font-size: 12px; letter-spacing: .5px; color: var(--muted); text-decoration: none; border: 1px solid var(--border); border-radius: 3px; padding: 6px 12px; }
  .period-btn:hover { border-color: var(--accent); color: var(--accent); }
  .period-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .period-custom { display: flex; align-items: center; gap: 6px; }
  .period-custom input[type=date] { font-family: inherit; font-size: 12px; color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 5px 8px; background: #fff; }
  .period-custom span { color: var(--muted); font-size: 12px; }
  .period-custom button { font-family: inherit; font-size: 12px; color: var(--accent); background: transparent; border: 1px solid var(--accent); border-radius: 3px; padding: 6px 12px; cursor: pointer; }
  .period-custom button:hover { background: var(--accent); color: #fff; }
  .period-label { margin-left: auto; font-size: 12px; color: var(--muted); white-space: nowrap; }
  @media (max-width: 700px) {
    .period-bar { flex-direction: column; align-items: stretch; }
    .period-label { margin-left: 0; }
  }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 16px; margin-top: 24px; }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-sub { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { height: 640px; position: relative; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #ccc; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 14px; text-align: left; font-weight: 400; white-space: nowrap; }
  .data-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table tfoot td { border-top: 2px solid var(--border); border-bottom: none; font-weight: 700; background: #f9f7ff; }

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

function renderRealization(data, viewer, range) {
  const { token, isDirector } = viewer || {};
  const { available, rows, months, stores, totals, updatedAt, sourceFile, error } = data;
  range = range || { preset: 'ytd', from: null, to: null };

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
    <h2>Не удалось получить данные</h2>
    <p>Источник — канал BI-аналитики (<code>pbi.php</code>), напрямую с портала.
    ${error ? `Ошибка: <code>${escHtml(error)}</code>` : ''}<br>
    Если ошибка про токен — проверить <code>BI_ANALYTICS_TOKEN</code> в <code>report-app/.env</code>
    на сервере (см. <code>talk/b24-api-patterns.md</code>, «BI-аналитика (pbi.php)»).</p>
  </div>
</div>
${bxBootstrap(token)}
</body>
</html>`;
  }

  // ── Данные для составного (stacked) столбца: labels = месяцы, один dataset на склад ──
  const storeColor = Object.fromEntries(stores.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  const monthTotals = months.map(m => rows.filter(r => r.month === m).reduce((s, r) => s + r.sum, 0));

  const chartLabels = JSON.stringify(months.map(monthLabel));
  const chartDatasets = stores.map((store, i) => {
    const byMonth = new Map(rows.filter(r => r.store === store).map(r => [r.month, r.sum]));
    const values = months.map(m => Math.round(byMonth.get(m) || 0));
    const color = storeColor[store];
    const isLast = i === stores.length - 1;
    const ds = {
      label: store, data: values, backgroundColor: color, borderColor: '#fff', borderWidth: 2,
      stack: 'realization',
    };
    // formatter — функция, JSON.stringify её всё равно роняет молча; реальные formatter'ы
    // навешиваются на клиенте в <script> ниже (там уже есть fmtRub и доступ к массивам).
    // Здесь только статическое оформление подписей.
    if (isLast) {
      // Верхний сегмент стека — вешаем ДВЕ подписи через именованные labels плагина:
      // "store" по центру сегмента (что за склад) и "total" у самого верха (сумма месяца).
      ds.datalabels = {
        labels: {
          store: { anchor: 'center', align: 'center', color: '#fff', font: { size: 10, weight: '600' }, textAlign: 'center' },
          total: { anchor: 'end', align: 'end', offset: 6, color: '#1e1a3a', font: { size: 12, weight: '700' } },
        },
      };
    } else {
      ds.datalabels = { anchor: 'center', align: 'center', color: '#fff', font: { size: 10, weight: '600' }, textAlign: 'center' };
    }
    return ds;
  });
  const chartDatasetsJson = JSON.stringify(chartDatasets);

  const tableRows = [...months].reverse().map(m => {
    const monthRows = rows.filter(r => r.month === m).sort((a, b) => b.sum - a.sum);
    const monthTotal = monthRows.reduce((acc, r) => acc + r.sum, 0);
    return monthRows.map((r, i) => `<tr>
      ${i === 0 ? `<td rowspan="${monthRows.length}" style="vertical-align:top;font-weight:600">${escHtml(monthLabel(m))}</td>` : ''}
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${storeColor[r.store]};margin-right:8px"></span>${escHtml(r.store)}</td>
      <td class="num">${fmt(r.qty)}</td>
      <td class="num" style="color:var(--orange)">${fmtRub(r.sum)}</td>
      ${i === 0 ? `<td rowspan="${monthRows.length}" class="num" style="vertical-align:top;color:var(--muted)">${fmtRub(monthTotal)}</td>` : ''}
    </tr>`).join('');
  }).join('');

  const basePath = '/report/realization';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Реализация · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script>
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

${renderPeriodBar(basePath, range)}

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
    <h3>Сумма реализации, ₽ — по складам, с итогом месяца</h3>
    <div class="chart-wrap"><canvas id="chartRealization"></canvas></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Таблица по месяцам</div>
  <table class="data-table">
    <thead><tr><th>Месяц</th><th>Склад</th><th class="num">Штук</th><th class="num">Сумма</th><th class="num">Итого за месяц</th></tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Итого за период</td>
        <td class="num">${fmt(totals.qty)}</td>
        <td class="num" colspan="2">${fmtRub(totals.sum)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="note">
    Источник данных: ${escHtml(sourceFile)} — канал BI-аналитики портала, кэш обновляется каждые
    15 минут. Учитываются только реально реализованные документы (без отменённых), суммы и склад —
    как в самом Б24. Склад «Услуги (без склада)» — позиции без физического товара (например,
    проведение игровой сессии).
  </div>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Реализация · БюроОБП</div>

<script>
${fmtRubClientSrc}
(function() {
  const stores = ${JSON.stringify(stores)};
  const monthTotals = ${JSON.stringify(monthTotals.map(v => Math.round(v)))};
  const datasets = ${chartDatasetsJson};
  // Длинные названия складов ("Фабрика мороженого Сделано в Москве" и т.п.) не влезают в
  // ширину сегмента одной строкой — переносим по словам, плагин datalabels понимает \n.
  function wrapLabel(text, maxLen) {
    const words = text.trim().split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const candidate = cur ? cur + ' ' + w : w;
      if (candidate.length > maxLen && cur) { lines.push(cur); cur = w; }
      else { cur = candidate; }
    }
    if (cur) lines.push(cur);
    return lines.join('\\n');
  }
  // Подставляем реальные formatter-функции — JSON не умеет хранить функции, собрали их здесь.
  datasets.forEach((ds, dsIdx) => {
    const isLast = dsIdx === datasets.length - 1;
    const storeFormatter = (v, ctx) => (v / (monthTotals[ctx.dataIndex] || 1) > 0.06 ? wrapLabel(stores[ctx.datasetIndex], 14) : '');
    if (isLast) {
      ds.datalabels.labels.store.formatter = storeFormatter;
      ds.datalabels.labels.total.formatter = (v, ctx) => fmtRub(monthTotals[ctx.dataIndex]);
    } else {
      ds.datalabels.formatter = storeFormatter;
    }
  });

  new Chart(document.getElementById('chartRealization'), {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: ${chartLabels}, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#7b79a0', font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtRub(ctx.raw) } }
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

module.exports = { renderRealization };
