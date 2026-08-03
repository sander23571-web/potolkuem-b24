'use strict';
/**
 * render-warehouse.js — HTML-рендерер дашборда склада /report/warehouse
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav } = require('./nav');

const B24_URL = 'https://potolkuem.bitrix24.ru';

const fmt      = n => Math.round(n).toLocaleString('ru-RU');
const fmtPct   = n => (n >= 0 ? '+' : '') + Math.round(n) + '%';
const escHtml  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const DOC_LABEL_COLOR = { S: 'var(--green)', A: 'var(--accent)', M: 'var(--muted)', D: 'var(--red)', R: 'var(--orange)', REALIZATION: 'var(--accent2)' };

// ── Общий дизайн-язык (тот же BASE_CSS, что в render-marketing.js) ────────────
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
  body { font-family: 'Georgia','Times New Roman',serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.6; }

  .hero { background: var(--black); color: #fff; padding: 36px 60px 32px; }
  .hero-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .hero h1 { font-size: 36px; font-weight: 400; letter-spacing: 1px; line-height: 1.1; margin-bottom: 6px; }
  .hero-sub { font-size: 14px; color: #888; margin-top: 6px; }
  .hero-nav { margin-top: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .nav-btn { color: #9eabfa; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 14px; font-size: 13px; text-decoration: none; letter-spacing: 1px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent); }
  .nav-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .refresh-btn { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 8px 18px; font-size: 13px; cursor: pointer; letter-spacing: 1px; }
  .refresh-btn:hover { background: var(--accent); color: #fff; }
  .fetched-at { font-size: 11px; color: #666; margin-left: auto; }

  .container { max-width: 1200px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .section h2 { font-size: 20px; font-weight: 400; margin-bottom: 20px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 16px; margin-top: 24px; }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-card.green::after { background: var(--green); }
  .kpi-card.red::after { background: var(--red); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-sub { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { height: 280px; position: relative; }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #ccc; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 14px; text-align: left; font-weight: 400; white-space: nowrap; }
  .data-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table tfoot td { border-top: 2px solid var(--border); border-bottom: none; font-weight: 600; }

  .b24-link { color: var(--accent); text-decoration: none; font-size: 12px; border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; white-space: nowrap; }
  .b24-link:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .badge-green  { background: rgba(39,174,96,.12);  color: var(--green); }
  .badge-orange { background: rgba(230,126,34,.12); color: var(--orange); }
  .badge-red    { background: rgba(192,57,43,.12);  color: var(--red); }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
    .two-col { grid-template-columns: 1fr; }
  }
`;

function shortName(name) {
  return (name || '').replace(/["""«»]/g, '').replace(/Потолкуем\??\s*/i, '').trim() || name;
}

function renderWarehouse(data, viewer) {
  const { token, isDirector } = viewer || {};
  const { products, stores, documents, totals } = data;

  const mainStores   = stores.filter(s => s.isMain);
  const retailStores = stores.filter(s => s.isRetail);

  const chartProducts = products.slice(0, 10);
  const chartLabels   = JSON.stringify(chartProducts.map(p => shortName(p.name)));
  const chartValues   = JSON.stringify(chartProducts.map(p => Math.round(p.totalValue)));
  const chartMargins  = JSON.stringify(chartProducts.map(p => p.cost ? Math.round((p.price - p.cost) / p.cost * 100) : 0));

  const productRows = products.map((p, i) => {
    const mgp = p.cost ? Math.round((p.price - p.cost) / p.cost * 100) : null;
    const badgeClass = mgp === null ? '' : mgp >= 200 ? 'badge-green' : mgp >= 100 ? 'badge-orange' : 'badge-red';
    return `<tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td><a class="b24-link" href="${escHtml(p.url)}" target="_blank">${escHtml(shortName(p.name))}</a></td>
      <td class="num">${p.price ? fmt(p.price) + ' ₽' : '—'}</td>
      <td class="num">${p.cost  ? fmt(p.cost)  + ' ₽' : '—'}</td>
      <td class="num">${mgp !== null ? `<span class="badge ${badgeClass}">${fmtPct(mgp)}</span>` : '—'}</td>
      <td class="num">${p.mainQty   ? fmt(p.mainQty)   : '—'}</td>
      <td class="num">${p.retailQty ? fmt(p.retailQty) : '—'}</td>
      <td class="num" style="font-weight:600">${fmt(p.totalQty)}</td>
      <td class="num" style="color:var(--orange)">${p.totalValue ? fmt(p.totalValue) + ' ₽' : '—'}</td>
    </tr>`;
  }).join('');

  const storeRows = (list) => list.map(s => `<tr>
    <td>${escHtml(s.title)}</td>
    <td class="num" style="font-weight:600">${fmt(s.totalQty)}</td>
    <td class="num" style="color:var(--orange)">${s.totalValue ? fmt(s.totalValue) + ' ₽' : '—'}</td>
  </tr>`).join('');

  const docRows = documents.map(d => `<tr>
    <td><span class="badge" style="background:${DOC_LABEL_COLOR[d.docType] || 'var(--muted)'}22;color:${DOC_LABEL_COLOR[d.docType] || 'var(--muted)'}">${escHtml(d.type)}</span></td>
    <td>${escHtml(d.title)}</td>
    <td style="color:var(--muted)">${d.date}</td>
    <td><a class="b24-link" href="${escHtml(d.url)}" target="_blank">Открыть</a></td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Склад · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Склад</h1>
  <div class="hero-sub">Остатки · Заморозка капитала · Маржа</div>
  <nav class="hero-nav">
    ${renderNav('warehouse', isDirector)}
    <form method="POST" action="/report/warehouse/refresh" style="margin-left:auto">
      <button class="refresh-btn" type="submit">Обновить данные</button>
    </form>
  </nav>
</div>

<div class="container">

<!-- KPI -->
<div class="section" style="margin-top:32px">
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Наименований</div>
      <div class="kpi-value">${totals.skus}</div>
      <div class="kpi-sub">позиций в остатке</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Единиц товара</div>
      <div class="kpi-value">${fmt(totals.qty)}</div>
      <div class="kpi-sub">по всем складам и точкам</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">Заморожено капитала</div>
      <div class="kpi-value">${fmt(totals.value)} ₽</div>
      <div class="kpi-sub">по себестоимости</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Точек / складов</div>
      <div class="kpi-value">${totals.stores}</div>
      <div class="kpi-sub">${mainStores.length} склада + ${retailStores.length} розничных</div>
    </div>
  </div>
</div>

<!-- Графики -->
<div class="section">
  <div class="section-title">Топ-10 · заморозка и маржа</div>
  <div class="two-col">
    <div class="chart-card">
      <h3>Заморозка по товарам</h3>
      <div class="chart-wrap"><canvas id="chartValue"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Маржа по товарам, %</h3>
      <div class="chart-wrap"><canvas id="chartMargin"></canvas></div>
    </div>
  </div>
</div>

<!-- Таблица товаров -->
<div class="section">
  <div class="section-title">Остатки по товарам</div>
  <table class="data-table">
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
    <tbody>${productRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="7" style="color:var(--muted)">ИТОГО</td>
        <td class="num">${fmt(totals.qty)}</td>
        <td class="num" style="color:var(--orange)">${fmt(totals.value)} ₽</td>
      </tr>
    </tfoot>
  </table>
</div>

<!-- Склады и точки -->
<div class="section">
  <div class="section-title">Склады и точки продаж</div>
  <div class="two-col">
    <div class="card">
      <h2>Основные склады</h2>
      <table class="data-table">
        <thead><tr><th>Склад</th><th class="num">Единиц</th><th class="num">Заморожено</th></tr></thead>
        <tbody>${storeRows(mainStores)}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Розничные точки</h2>
      <table class="data-table">
        <thead><tr><th>Точка</th><th class="num">Единиц</th><th class="num">Заморожено</th></tr></thead>
        <tbody>${storeRows(retailStores)}</tbody>
      </table>
    </div>
  </div>
</div>

<!-- Последние документы -->
<div class="section">
  <div class="section-title">Последние складские документы</div>
  <table class="data-table">
    <thead><tr><th>Тип</th><th>Документ</th><th>Дата</th><th></th></tr></thead>
    <tbody>${docRows}</tbody>
  </table>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Склад · БюроОБП</div>

<script>
(function() {
  const labels  = ${chartLabels};
  const values  = ${chartValues};
  const margins = ${chartMargins};

  new Chart(document.getElementById('chartValue'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Заморожено ₽', data: values, backgroundColor: 'rgba(74,93,249,0.55)', borderColor: '#4a5df9', borderWidth: 1, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.raw.toLocaleString('ru-RU') + ' ₽' } }
      },
      scales: {
        x: { ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#7b79a0', callback: v => (v/1000).toFixed(0) + 'к' }, grid: { color: '#e0daf7' } }
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
        backgroundColor: margins.map(m => m >= 200 ? 'rgba(39,174,96,0.35)' : m >= 100 ? 'rgba(230,126,34,0.35)' : 'rgba(192,57,43,0.35)'),
        borderColor:     margins.map(m => m >= 200 ? '#27ae60' : m >= 100 ? '#e67e22' : '#c0392b'),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.raw + '%' } }
      },
      scales: {
        x: { ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#7b79a0', callback: v => v + '%' }, grid: { color: '#e0daf7' } }
      }
    }
  });
})();
</script>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderWarehouse };
