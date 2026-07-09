'use strict';
/**
 * render-marketing.js — HTML-рендерер дашборда /report/marketing
 */

const B24_URL = 'https://potolkuem.bitrix24.ru';
const TYPE_ID  = 28;
const ENTITY_TYPE_ID = 1074;

function fmt(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}
function fmtFloat(n, dec = 1) {
  if (n === null || n === undefined) return '—';
  return parseFloat(n).toFixed(dec).replace('.', ',');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}
function fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
}

// ── Shared CSS (импортируем базу из render.js через встроенный inline-стиль) ─
// Используем тот же дизайн-язык, что и в render.js
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

  .container { max-width: 1100px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

  .kpi-grid { display: grid; gap: 16px; margin-top: 24px; }
  .kpi-grid-4 { grid-template-columns: repeat(4,1fr); }
  .kpi-grid-3 { grid-template-columns: repeat(3,1fr); }
  .kpi-grid-2 { grid-template-columns: repeat(2,1fr); }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-card.green::after { background: var(--green); }
  .kpi-card.red::after { background: var(--red); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-note { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .kpi-note a { color: var(--accent); text-decoration: none; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }

  .smm-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; margin-top: 24px; }
  .smm-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .smm-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; border-radius: 4px 4px 0 0; }
  .smm-card.vk::after    { background: #2787f5; }
  .smm-card.tg::after    { background: #2aabee; }
  .smm-card.dzen::after  { background: #ff6600; }
  .smm-title { font-size: 13px; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 16px; }
  .smm-big { font-size: 32px; font-weight: 400; color: var(--black); }
  .smm-meta { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .smm-link { font-size: 11px; color: var(--accent); text-decoration: none; border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; display: inline-block; margin-top: 10px; }
  .smm-link:hover { background: var(--accent); color: #fff; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #888; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 18px; text-align: left; font-weight: 400; }
  .data-table td { padding: 11px 18px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .exp-bar { display: inline-block; height: 6px; background: var(--accent2); border-radius: 3px; vertical-align: middle; margin-right: 6px; opacity: .5; }
  .b24-link { color: var(--accent); text-decoration: none; font-size: 12px; border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; white-space: nowrap; }
  .b24-link:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

  .no-data { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 40px; text-align: center; color: var(--muted); font-size: 14px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
    .kpi-grid-4 { grid-template-columns: repeat(2,1fr); }
    .kpi-grid-3 { grid-template-columns: 1fr 1fr; }
    .smm-grid   { grid-template-columns: 1fr; }
    .two-col    { grid-template-columns: 1fr; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function latestRecord(arr) {
  if (!arr || !arr.length) return null;
  return arr[arr.length - 1];
}

function prevRecord(arr) {
  if (!arr || arr.length < 2) return null;
  return arr[arr.length - 2];
}

function b24ItemLink(id) {
  return `${B24_URL}/crm/type/${ENTITY_TYPE_ID}/details/${id}/`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────
function renderMarketing(data) {
  const { platforms, topQueries, snapDate, wordstatHistory, expenses, expensesTagged, fetchedAt } = data;

  // ── Бренд: Wordstat ──────────────────────────────────────────────────────
  const wsItems = platforms['Wordstat_потолкуем'] || [];
  // Используем данные из СП если есть, иначе из snapshot
  const wsSource = wsItems.length >= 2 ? wsItems : (wordstatHistory || []).map((h, i) => ({
    id: null,
    period: h.month ? h.month + '-01' : '',
    brandDemand: h.count || 0,
  }));
  const wsLast   = latestRecord(wsSource);
  const wsPeak   = wsSource.length ? Math.max(...wsSource.map(r => r.brandDemand || 0)) : 0;
  const wsPeakMo = wsSource.find(r => (r.brandDemand || 0) === wsPeak);

  const wsLabels = JSON.stringify(wsSource.map(r => fmtShortDate(r.period)));
  const wsData   = JSON.stringify(wsSource.map(r => r.brandDemand || 0));

  // ── Бренд: конкуренты из последнего снапшота ──────────────────────────────
  // (если нет данных из Б24, просто не показываем)

  // ── Сайт: Метрика ─────────────────────────────────────────────────────────
  const metItems = platforms['Метрика_сайт'] || [];
  const metLast  = latestRecord(metItems);
  const metPrev  = prevRecord(metItems);

  // Trафик donut
  const metTotal   = metLast?.visitsTotal || 0;
  const metOrganic = metLast?.visitsOrganic || 0;
  const metPaid    = metLast?.visitsPaid || 0;
  const metDirect  = Math.max(0, metTotal - metOrganic - metPaid);

  const donutLabels = JSON.stringify(['Платный', 'Органика', 'Прямые/другие']);
  const donutData   = JSON.stringify([metPaid, metOrganic, metDirect]);
  const donutColors = JSON.stringify(['#c0392b', '#27ae60', '#7b79a0']);

  // Динамика трафика по месяцам
  const metLabels  = JSON.stringify(metItems.map(r => fmtShortDate(r.period)));
  const metTotals  = JSON.stringify(metItems.map(r => r.visitsTotal || 0));
  const metOrganics = JSON.stringify(metItems.map(r => r.visitsOrganic || 0));

  // ── Соцсети: LiveDune ─────────────────────────────────────────────────────
  const vkItems   = platforms['VK_potolkuem']   || [];
  const tgItems   = platforms['TG_potolkuem']   || [];
  const dzenItems = platforms['Дзен_potolkuem'] || [];

  const vkLast   = latestRecord(vkItems);
  const tgLast   = latestRecord(tgItems);
  const dzenLast = latestRecord(dzenItems);

  // Динамика подписчиков — объединённая временная шкала (VK и TG могут не совпадать)
  const _smmPeriods = [...new Set([
    ...vkItems.map(r => r.period),
    ...tgItems.map(r => r.period),
  ])].sort();
  const smmLabels   = JSON.stringify(_smmPeriods.map(p => fmtShortDate(p)));
  const smmVkData   = JSON.stringify(_smmPeriods.map(p => {
    const r = vkItems.find(x => x.period === p); return r ? (r.followers || 0) : null;
  }));
  const smmTgData   = JSON.stringify(_smmPeriods.map(p => {
    const r = tgItems.find(x => x.period === p); return r ? (r.followers || 0) : null;
  }));

  // ── SEO: Вебмастер ────────────────────────────────────────────────────────
  const wbItems = platforms['Вебмастер_SEO'] || [];
  const wbLast  = latestRecord(wbItems);

  // Топ органических запросов
  const topRows = (topQueries || []).slice(0, 15);

  // ── HTML ──────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Маркетинг · Потолкуем?</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
  <style>${BASE_CSS}</style>
</head>
<body>

<!-- ── HERO ── -->
<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Маркетинг</h1>
  <div class="hero-sub">Бренд · Сайт · Соцсети · SEO</div>
  <nav class="hero-nav">
    <a class="nav-btn" href="/report">Выставки</a>
    <a class="nav-btn" href="/report/compare">Сравнение</a>
    <a class="nav-btn" href="/social">SMM</a>
    <a class="nav-btn active" href="/report/marketing">Маркетинг</a>
    <a class="nav-btn" href="/tasks">Задачи</a>
    <form method="POST" action="/report/marketing/refresh" style="margin-left:auto">
      <button class="refresh-btn" type="submit">Обновить данные</button>
    </form>
    <span class="fetched-at">обновлено ${new Date(fetchedAt).toLocaleString('ru-RU')}</span>
  </nav>
</div>

<div class="container">

<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- БЛОК 1: БРЕНД -->
<!-- ══════════════════════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Уровень 1 — Бренд (ведущий индикатор)</div>

  <!-- KPI строка Wordstat -->
  <div class="kpi-grid kpi-grid-3">
    <div class="kpi-card">
      <div class="kpi-label">«Потолкуем» (последний мес.)</div>
      <div class="kpi-value">${wsLast ? fmt(wsLast.brandDemand) : '—'}</div>
      <div class="kpi-note">запросов/мес · Wordstat${wsLast?.b24Url ? ` · <a href="${wsLast.b24Url}" target="_blank">Б24</a>` : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Пик за период</div>
      <div class="kpi-value">${fmt(wsPeak)}</div>
      <div class="kpi-note">${wsPeakMo ? fmtDate(wsPeakMo.period) : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Имаджинариум (ориент.)</div>
      <div class="kpi-value">~32 295</div>
      <div class="kpi-note">×${wsLast ? Math.round(32295 / Math.max(wsLast.brandDemand || 1, 1)) : '?'} больше «Потолкуем»</div>
    </div>
  </div>

  <!-- График Wordstat -->
  <div class="chart-card" style="margin-top:20px">
    <h3>Динамика «потолкуем» · Wordstat · ${wsSource.length} мес.</h3>
    ${wsSource.length < 2
      ? '<div class="no-data">Недостаточно данных — запустите backfill</div>'
      : `<canvas id="wsChart" height="90"></canvas>`
    }
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- БЛОК 2: САЙТ (Метрика) -->
<!-- ══════════════════════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Уровень 2 — Сайт · Яндекс.Метрика</div>

  ${metLast
    ? `<div class="kpi-grid kpi-grid-4">
    <div class="kpi-card">
      <div class="kpi-label">Визитов всего</div>
      <div class="kpi-value">${fmt(metLast.visitsTotal)}</div>
      <div class="kpi-note">${fmtDate(metLast.period)}${metLast.b24Url ? ` · <a href="${metLast.b24Url}" target="_blank">Б24</a>` : ''}</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">Платный трафик</div>
      <div class="kpi-value">${fmt(metPaid)}</div>
      <div class="kpi-note">${metTotal ? Math.round(metPaid / metTotal * 100) : 0}% от всего</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Органика</div>
      <div class="kpi-value">${fmt(metOrganic)}</div>
      <div class="kpi-note">${metTotal ? Math.round(metOrganic / metTotal * 100) : 0}% от всего</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Отказы</div>
      <div class="kpi-value">${fmtFloat(metLast.bounceRate)} %</div>
      <div class="kpi-note">меньше = лучше</div>
    </div>
  </div>

  <div class="two-col" style="margin-top:20px">
    <div class="chart-card">
      <h3>Структура трафика</h3>
      <canvas id="donutChart" height="160"></canvas>
    </div>
    <div class="chart-card">
      <h3>Динамика трафика по месяцам</h3>
      ${metItems.length < 2
        ? '<div class="no-data" style="padding:40px 0">Данные за 1 месяц</div>'
        : '<canvas id="metChart" height="160"></canvas>'
      }
    </div>
  </div>`
    : '<div class="no-data">Нет данных Метрики — запустите cron-скрипт</div>'
  }
</div>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- БЛОК 3: СОЦСЕТИ -->
<!-- ══════════════════════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">Соцсети · LiveDune → Б24</div>

  <div class="smm-grid">
    ${renderSmmCard('VK', 'vk', vkLast, vkItems.length)}
    ${renderSmmCard('Telegram', 'tg', tgLast, tgItems.length)}
    ${renderSmmCard('Дзен', 'dzen', dzenLast, dzenItems.length)}
  </div>

  ${(vkItems.length >= 2 || tgItems.length >= 2)
    ? `<div class="chart-card" style="margin-top:20px">
    <h3>Динамика подписчиков VK и Telegram</h3>
    <canvas id="smmChart" height="90"></canvas>
  </div>`
    : ''
  }
</div>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- БЛОК 4: SEO / Вебмастер -->
<!-- ══════════════════════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">SEO · Яндекс.Вебмастер${snapDate ? ` · срез ${snapDate}` : ''}</div>

  ${wbLast
    ? `<div class="kpi-grid kpi-grid-2" style="margin-bottom:20px">
    <div class="kpi-card green">
      <div class="kpi-label">Кликов (топ-запросы, 14 дн)</div>
      <div class="kpi-value">${fmt(wbLast.clicks)}</div>
      <div class="kpi-note">${fmtDate(wbLast.period)}${wbLast.b24Url ? ` · <a href="${wbLast.b24Url}" target="_blank">Б24</a>` : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Показов</div>
      <div class="kpi-value">${fmt(wbLast.impressions)}</div>
      <div class="kpi-note">CTR: ${wbLast.impressions ? fmtFloat(wbLast.clicks / wbLast.impressions * 100) : 0}%</div>
    </div>
  </div>`
    : ''
  }

  ${topRows.length
    ? `<table class="data-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Запрос</th>
        <th>Кликов</th>
        <th>Показов</th>
        <th>CTR</th>
      </tr>
    </thead>
    <tbody>
      ${topRows.map((row, i) => `
        <tr>
          <td class="num" style="color:var(--muted)">${i + 1}</td>
          <td>${escHtml(row.query || '')}</td>
          <td class="num">${fmt(row.clicks)}</td>
          <td class="num">${fmt(row.impressions)}</td>
          <td class="num">${fmtFloat((row.ctr || 0) * 100)}%</td>
        </tr>`).join('')}
    </tbody>
  </table>`
    : '<div class="no-data">Нет данных SEO-снапшота</div>'
  }
</div>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- БЛОК 5: РАСХОДЫ -->
<!-- ══════════════════════════════════════════════════════════════════════ -->
<div class="section">
  <div class="section-title">
    Расходы · маркетинг
    ${!expensesTagged && expenses && expenses.length
      ? '<span style="color:var(--orange);font-size:11px;font-weight:normal;margin-left:8px">расходы пока без метки «Маркетинг» — показаны все незакреплённые</span>'
      : ''}
  </div>

  ${expenses && expenses.length
    ? `${renderExpensesTable(expenses)}`
    : '<div class="no-data">Нет расходов с направлением «Маркетинг» — отметьте нужные расходы в CRM → Смарт-процессы → Расходы</div>'
  }
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Маркетинговый дашборд · БюроОБП</div>

<script>
// ── Wordstat chart ────────────────────────────────────────────────────────────
${wsSource.length >= 2 ? `
new Chart(document.getElementById('wsChart'), {
  type: 'line',
  data: {
    labels: ${wsLabels},
    datasets: [{
      label: 'потолкуем',
      data:  ${wsData},
      borderColor: '#4a5df9',
      backgroundColor: 'rgba(74,93,249,0.08)',
      tension: 0.3,
      pointRadius: 4,
      fill: true,
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#e0daf7' } },
      x: { grid: { display: false } }
    }
  }
});` : ''}

// ── Donut chart ───────────────────────────────────────────────────────────────
${metLast ? `
new Chart(document.getElementById('donutChart'), {
  type: 'doughnut',
  data: {
    labels: ${donutLabels},
    datasets: [{ data: ${donutData}, backgroundColor: ${donutColors}, borderWidth: 0 }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
    },
    cutout: '65%',
  }
});` : ''}

// ── Метрика динамика ──────────────────────────────────────────────────────────
${metItems.length >= 2 ? `
new Chart(document.getElementById('metChart'), {
  type: 'bar',
  data: {
    labels: ${metLabels},
    datasets: [
      { label: 'Всего', data: ${metTotals}, backgroundColor: 'rgba(74,93,249,0.25)', borderColor: '#4a5df9', borderWidth: 1 },
      { label: 'Органика', data: ${metOrganics}, backgroundColor: 'rgba(39,174,96,0.4)', borderColor: '#27ae60', borderWidth: 1 },
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#e0daf7' } },
      x: { grid: { display: false } }
    }
  }
});` : ''}

// ── SMM подписчики ────────────────────────────────────────────────────────────
${(vkItems.length >= 2 || tgItems.length >= 2) ? `
new Chart(document.getElementById('smmChart'), {
  type: 'line',
  data: {
    labels: ${smmLabels},
    datasets: [
      ${vkItems.length >= 2 ? `{ label: 'VK', data: ${smmVkData}, borderColor: '#2787f5', backgroundColor: 'rgba(39,135,245,0.06)', tension: 0.3, pointRadius: 3, fill: true, spanGaps: true },` : ''}
      ${tgItems.length >= 2 ? `{ label: 'Telegram', data: ${smmTgData}, borderColor: '#2aabee', backgroundColor: 'rgba(42,171,238,0.06)', tension: 0.3, pointRadius: 3, fill: true, spanGaps: true },` : ''}
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
    scales: {
      y: { beginAtZero: false, grid: { color: '#e0daf7' } },
      x: { grid: { display: false } }
    }
  }
});` : ''}
<\/script>
</body>
</html>`;
}

// ── Expenses table ────────────────────────────────────────────────────────────
function renderExpensesTable(expenses) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const maxAmt = expenses[0]?.amount || 1;

  const rows = expenses.map(e => {
    const barW = Math.round(e.amount / maxAmt * 100);
    return `<tr>
      <td>${escHtml(e.title || `#${e.id}`)}</td>
      <td>
        <span class="exp-bar" style="width:${barW}px"></span>
        ${fmt(e.amount)} ₽
      </td>
      <td style="color:var(--muted);font-size:13px">${e.begindate ? e.begindate.slice(0,10) : '—'}</td>
      <td><a class="b24-link" href="${e.b24Url}" target="_blank">Открыть</a></td>
    </tr>`;
  }).join('');

  return `<table class="data-table">
    <thead>
      <tr>
        <th>Расход</th>
        <th>Сумма</th>
        <th>Дата</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td><strong>Итого</strong></td>
        <td><strong>${fmt(total)} ₽</strong></td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>`;
}

// ── SMM card helper ───────────────────────────────────────────────────────────
function renderSmmCard(name, cssClass, last, count) {
  if (!last) {
    return `<div class="smm-card ${cssClass}">
      <div class="smm-title">${name}</div>
      <div class="smm-big" style="color:var(--muted)">—</div>
      <div class="smm-meta">нет данных</div>
    </div>`;
  }
  const diff = last.followersDiff;
  const diffStr = diff > 0 ? `+${fmt(diff)}` : diff < 0 ? `−${fmt(Math.abs(diff))}` : '±0';
  const diffColor = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--muted)';
  return `<div class="smm-card ${cssClass}">
    <div class="smm-title">${name}</div>
    <div class="smm-big">${fmt(last.followers)}</div>
    <div class="smm-meta">
      подписчиков · <span style="color:${diffColor}">${diffStr}</span> за мес.
      ${last.er ? ` · ER ${fmtFloat(last.er)}%` : ''}
    </div>
    <div class="smm-meta">${fmtDate(last.period)} · ${count} мес. данных</div>
    ${last.b24Url ? `<a class="smm-link" href="${last.b24Url}" target="_blank">Открыть в Б24</a>` : ''}
  </div>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { renderMarketing };
