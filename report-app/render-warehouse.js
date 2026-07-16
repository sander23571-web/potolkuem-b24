'use strict';
/**
 * render-warehouse.js — HTML-рендерер дашборда склада /report/warehouse
 */

const B24_URL = 'https://potolkuem.bitrix24.ru';

const fmt      = n => Math.round(n).toLocaleString('ru-RU');
const fmtPct   = n => (n >= 0 ? '+' : '') + Math.round(n) + '%';
const escHtml  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const DOC_ICON = { S: '📥', A: '📦', M: '🔄', D: '🗑️', R: '↩️' };
const DOC_COLOR = { S: 'var(--green)', A: 'var(--accent)', M: 'var(--muted)', D: 'var(--red)', R: 'var(--yellow)' };

function renderWarehouse(data) {
  const { products, stores, documents, totals } = data;

  const mainStores   = stores.filter(s => s.isMain);
  const retailStores = stores.filter(s => s.isRetail);

  // Данные для графика — топ 10 по заморозке
  const chartProducts = products.slice(0, 10);
  const chartLabels   = JSON.stringify(chartProducts.map(p => shortName(p.name)));
  const chartValues   = JSON.stringify(chartProducts.map(p => Math.round(p.totalValue)));
  const chartMargins  = JSON.stringify(chartProducts.map(p => p.cost ? Math.round((p.price - p.cost) / p.cost * 100) : 0));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Склад — Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {
  --bg:     #0f1117;
  --card:   #1a1d2e;
  --border: #2a2d3e;
  --text:   #e2e8f0;
  --muted:  #64748b;
  --accent: #6366f1;
  --green:  #22c55e;
  --red:    #ef4444;
  --yellow: #f59e0b;
  --teal:   #14b8a6;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; font-size: 14px; }

/* Nav */
.nav { background: var(--card); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nav-brand { font-weight: 700; color: var(--text); margin-right: 8px; }
.nav a { color: var(--muted); text-decoration: none; padding: 4px 12px; border-radius: 6px; font-size: 13px; white-space: nowrap; }
.nav a:hover, .nav a.active { background: var(--border); color: var(--text); }
.nav-sep { color: var(--border); }

/* Layout */
.page { max-width: 1400px; margin: 0 auto; padding: 24px; }
h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
h3 { font-size: 15px; font-weight: 600; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: .05em; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
.kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.kpi-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
.kpi-value { font-size: 28px; font-weight: 700; line-height: 1; }
.kpi-sub { font-size: 12px; color: var(--muted); margin-top: 6px; }

/* Grid 2 cols */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
@media (max-width: 900px) { .grid2 { grid-template-columns: 1fr; } }

/* Card */
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card-chart { height: 300px; position: relative; }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { color: var(--muted); font-weight: 500; text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
td { padding: 9px 10px; border-bottom: 1px solid #1e2235; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,.03); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.link { color: var(--accent); text-decoration: none; }
.link:hover { text-decoration: underline; }

/* Margin badge */
.badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.badge-green  { background: rgba(34,197,94,.15);  color: var(--green); }
.badge-yellow { background: rgba(245,158,11,.15); color: var(--yellow); }
.badge-red    { background: rgba(239,68,68,.15);  color: var(--red); }

/* Refresh */
.refresh-bar { display: flex; justify-content: flex-end; margin-bottom: 20px; }
.btn { background: var(--accent); color: #fff; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.btn:hover { opacity: .85; }

/* Doc type chip */
.chip { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
</style>
</head>
<body>

<nav class="nav">
  <span class="nav-brand">Потолкуем?</span>
  <span class="nav-sep">|</span>
  <a href="/report">Выставки</a>
  <a href="/report/compare">Сравнение</a>
  <a href="/report/marketing">Маркетинг</a>
  <a href="/report/warehouse" class="active">Склад</a>
  <a href="/tasks">Задачи</a>
  <a href="/social">Соцсети</a>
</nav>

<div class="page">

  <div class="refresh-bar">
    <form method="POST" action="/report/warehouse/refresh">
      <button class="btn" type="submit">Обновить данные</button>
    </form>
  </div>

  <!-- KPI -->
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Наименований</div>
      <div class="kpi-value">${totals.skus}</div>
      <div class="kpi-sub">позиций в остатке</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Единиц товара</div>
      <div class="kpi-value" style="color:var(--accent)">${fmt(totals.qty)}</div>
      <div class="kpi-sub">по всем складам и точкам</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Заморожено капитала</div>
      <div class="kpi-value" style="color:var(--yellow)">${fmt(totals.value)} ₽</div>
      <div class="kpi-sub">по себестоимости</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Точек / складов</div>
      <div class="kpi-value">${totals.stores}</div>
      <div class="kpi-sub">${mainStores.length} склада + ${retailStores.length} розничных</div>
    </div>
  </div>

  <!-- Графики -->
  <div class="grid2" style="margin-bottom:24px">
    <div class="card">
      <h3>Заморозка по товарам (топ-10)</h3>
      <div class="card-chart">
        <canvas id="chartValue"></canvas>
      </div>
    </div>
    <div class="card">
      <h3>Маржа по товарам (%)</h3>
      <div class="card-chart">
        <canvas id="chartMargin"></canvas>
      </div>
    </div>
  </div>

  <!-- Таблица товаров -->
  <div class="card" style="margin-bottom:24px">
    <h2>Остатки по товарам</h2>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Товар</th>
            <th class="num">Цена</th>
            <th class="num">Себест.</th>
            <th class="num">Маржа</th>
            <th class="num">Осн. склады</th>
            <th class="num">Розница</th>
            <th class="num">Всего шт</th>
            <th class="num">Заморожено</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p, i) => {
            const mg  = p.cost ? p.price - p.cost : null;
            const mgp = p.cost ? Math.round((p.price - p.cost) / p.cost * 100) : null;
            const badgeClass = mgp === null ? '' : mgp >= 200 ? 'badge-green' : mgp >= 100 ? 'badge-yellow' : 'badge-red';
            return `<tr>
              <td style="color:var(--muted)">${i + 1}</td>
              <td><a class="link" href="${escHtml(p.url)}" target="_blank">${escHtml(shortName(p.name))}</a></td>
              <td class="num">${p.price ? fmt(p.price) + ' ₽' : '—'}</td>
              <td class="num">${p.cost  ? fmt(p.cost)  + ' ₽' : '—'}</td>
              <td class="num">${mgp !== null ? `<span class="badge ${badgeClass}">${fmtPct(mgp)}</span>` : '—'}</td>
              <td class="num">${p.mainQty   ? fmt(p.mainQty)   : '—'}</td>
              <td class="num">${p.retailQty ? fmt(p.retailQty) : '—'}</td>
              <td class="num" style="font-weight:600">${fmt(p.totalQty)}</td>
              <td class="num" style="color:var(--yellow)">${p.totalValue ? fmt(p.totalValue) + ' ₽' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border)">
            <td colspan="7" style="font-weight:600;color:var(--muted)">ИТОГО</td>
            <td class="num" style="font-weight:700">${fmt(totals.qty)}</td>
            <td class="num" style="font-weight:700;color:var(--yellow)">${fmt(totals.value)} ₽</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <!-- Склады и точки -->
  <div class="grid2" style="margin-bottom:24px">
    <div class="card">
      <h2>Основные склады</h2>
      <table>
        <thead>
          <tr>
            <th>Склад</th>
            <th class="num">Единиц</th>
            <th class="num">Заморожено</th>
          </tr>
        </thead>
        <tbody>
          ${mainStores.map(s => `<tr>
            <td>${escHtml(s.title)}</td>
            <td class="num" style="font-weight:600">${fmt(s.totalQty)}</td>
            <td class="num" style="color:var(--yellow)">${s.totalValue ? fmt(s.totalValue) + ' ₽' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>Розничные точки</h2>
      <table>
        <thead>
          <tr>
            <th>Точка</th>
            <th class="num">Единиц</th>
            <th class="num">Заморожено</th>
          </tr>
        </thead>
        <tbody>
          ${retailStores.map(s => `<tr>
            <td>${escHtml(s.title)}</td>
            <td class="num" style="font-weight:600">${fmt(s.totalQty)}</td>
            <td class="num" style="color:var(--yellow)">${s.totalValue ? fmt(s.totalValue) + ' ₽' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Последние документы -->
  <div class="card">
    <h2>Последние складские документы</h2>
    <table>
      <thead>
        <tr>
          <th>Тип</th>
          <th>Документ</th>
          <th>Дата</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${documents.map(d => `<tr>
          <td><span class="chip" style="background:${DOC_COLOR[d.docType] || 'var(--muted)'}22;color:${DOC_COLOR[d.docType] || 'var(--muted)'}">${escHtml(d.type)}</span></td>
          <td>${escHtml(d.title)}</td>
          <td style="color:var(--muted)">${d.date}</td>
          <td><a class="link" href="${escHtml(d.url)}" target="_blank">Открыть →</a></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

</div>

<script>
// ── Chart: Заморозка по товарам ───────────────────────────────────────────────
(function() {
  const labels  = ${chartLabels};
  const values  = ${chartValues};
  const margins = ${chartMargins};

  const palette = [
    '#6366f1','#22c55e','#f59e0b','#ef4444','#14b8a6',
    '#a855f7','#ec4899','#0ea5e9','#84cc16','#f97316'
  ];

  new Chart(document.getElementById('chartValue'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Заморожено ₽',
        data: values,
        backgroundColor: palette,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + ctx.raw.toLocaleString('ru-RU') + ' ₽'
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e2235' } },
        y: { ticks: { color: '#64748b', callback: v => (v/1000).toFixed(0) + 'к' }, grid: { color: '#1e2235' } }
      }
    }
  });

  new Chart(document.getElementById('chartMargin'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Маржа %',
        data: margins,
        backgroundColor: margins.map(m => m >= 200 ? '#22c55e44' : m >= 100 ? '#f59e0b44' : '#ef444444'),
        borderColor:     margins.map(m => m >= 200 ? '#22c55e'   : m >= 100 ? '#f59e0b'   : '#ef4444'),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.raw + '%' } }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e2235' } },
        y: { ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#1e2235' } }
      }
    }
  });
})();
</script>

</body>
</html>`;
}

// Убираем кавычки и "Потолкуем?" из названия для читабельности в графике
function shortName(name) {
  return (name || '').replace(/["""«»]/g, '').replace(/Потолкуем\??\s*/i, '').trim() || name;
}

module.exports = { renderWarehouse };
