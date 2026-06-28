'use strict';

function fmt(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Colour palette (same as arh-moskva-report.html)
const PALETTE = ['#1e2eb5', '#3d4de6', '#4a5df9', '#7b8ef9', '#9eabfa', '#bbc5fc', '#dde2fc', '#6c3483', '#117a65', '#b7950b'];

function renderDashboard(data, allExhibitions, currentId) {
  const { exhibition, expenses, shifts, hostMap, deals, fetchedAt, b24Url } = data;

  const exhTitle = exhibition.title || `Выставка #${exhibition.id}`;
  const exhBegin = fmtDate(exhibition.begindate);
  const exhEnd = fmtDate(exhibition.closedate);

  // ── Aggregations ────────────────────────────────────────────────────────────

  const totalRevenue = deals.reduce((s, d) => s + parseFloat(d.OPPORTUNITY || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.ufCrm24Amount || 0), 0);
  const pnl = totalRevenue - totalExpenses;

  // Revenue by host
  const revenueByHost = {};
  for (const d of deals) {
    const hid = d.PARENT_ID_1052 ? String(d.PARENT_ID_1052) : '__employee__';
    const name = hostMap[hid] || (hid === '__employee__' ? 'Сотрудник' : `Ведущий #${hid}`);
    revenueByHost[name] = (revenueByHost[name] || 0) + parseFloat(d.OPPORTUNITY || 0);
  }
  const hostRevEntries = Object.entries(revenueByHost).sort((a, b) => b[1] - a[1]);

  // Revenue by product (deal title)
  const revenueByProduct = {};
  for (const d of deals) {
    const name = d.TITLE || 'Без названия';
    revenueByProduct[name] = (revenueByProduct[name] || 0) + parseFloat(d.OPPORTUNITY || 0);
  }
  const productEntries = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1]);

  // Revenue by date
  const revenueByDate = {};
  for (const d of deals) {
    const dt = d.CLOSEDATE ? d.CLOSEDATE.slice(0, 10) : 'unknown';
    revenueByDate[dt] = (revenueByDate[dt] || 0) + parseFloat(d.OPPORTUNITY || 0);
  }
  const dayEntries = Object.entries(revenueByDate)
    .filter(([k]) => k !== 'unknown')
    .sort(([a], [b]) => a.localeCompare(b));

  // Shifts by date
  const shiftsByDate = {};
  for (const s of shifts) {
    const dt = s.begindate ? s.begindate.slice(0, 10) : 'unknown';
    if (!shiftsByDate[dt]) shiftsByDate[dt] = [];
    shiftsByDate[dt].push(s);
  }

  // Expenses sorted by amount desc
  const expensesSorted = [...expenses].sort((a, b) =>
    parseFloat(b.ufCrm24Amount || 0) - parseFloat(a.ufCrm24Amount || 0)
  );

  // ── Dropdown options ────────────────────────────────────────────────────────
  const dropdownOptions = allExhibitions
    .sort((a, b) => (b.begindate || '').localeCompare(a.begindate || ''))
    .map(e => `<option value="${e.id}" ${String(e.id) === String(currentId) ? 'selected' : ''}>${e.title || `#${e.id}`}</option>`)
    .join('\n');

  // ── Chart data (JSON for inline script) ────────────────────────────────────
  const hostChartLabels = JSON.stringify(hostRevEntries.map(([n]) => n));
  const hostChartData = JSON.stringify(hostRevEntries.map(([, v]) => Math.round(v)));
  const hostChartColors = JSON.stringify(hostRevEntries.map((_, i) => PALETTE[i % PALETTE.length]));

  const expenseChartLabels = JSON.stringify(expensesSorted.map(e => e.title || `#${e.id}`));
  const expenseChartData = JSON.stringify(expensesSorted.map(e => parseFloat(e.ufCrm24Amount || 0)));
  const expenseChartColors = JSON.stringify(expensesSorted.map((_, i) => PALETTE[i % PALETTE.length]));

  const dayChartLabels = JSON.stringify(dayEntries.map(([dt]) => fmtShortDate(dt)));
  const dayChartData = JSON.stringify(dayEntries.map(([, v]) => Math.round(v)));

  // ── P&L rows ────────────────────────────────────────────────────────────────
  const maxAmount = Math.max(totalRevenue, totalExpenses, 1);
  const revBar = Math.round((totalRevenue / maxAmount) * 100);
  const expBar = Math.round((totalExpenses / maxAmount) * 100);

  // ── Table rows ──────────────────────────────────────────────────────────────
  const expenseRows = expensesSorted.map(e => {
    const amt = parseFloat(e.ufCrm24Amount || 0);
    const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
    const barW = Math.round((amt / Math.max(...expenses.map(x => parseFloat(x.ufCrm24Amount || 0)), 1)) * 80);
    const cardUrl = `${b24Url}/crm/type/1070/details/${e.id}/`;
    return `<tr>
      <td><span class="exp-bar" style="width:${barW}px"></span>${e.title || `Расход #${e.id}`}</td>
      <td class="num">${fmt(amt)}</td>
      <td class="num">${pct}%</td>
      <td><a href="${cardUrl}" target="_blank" class="b24-link">Открыть</a></td>
    </tr>`;
  }).join('\n');

  const expenseTotalRow = `<tr>
    <td><strong>ИТОГО</strong></td>
    <td class="num"><strong>${fmt(totalExpenses)}</strong></td>
    <td class="num">100%</td>
    <td></td>
  </tr>`;

  const dealRows = [...deals]
    .sort((a, b) => parseFloat(b.OPPORTUNITY || 0) - parseFloat(a.OPPORTUNITY || 0))
    .slice(0, 100)
    .map(d => {
      const hid = d.PARENT_ID_1052 ? String(d.PARENT_ID_1052) : null;
      const hostName = hid ? (hostMap[hid] || `Ведущий #${hid}`) : 'Сотрудник';
      return `<tr>
        <td>${d.TITLE || '—'}</td>
        <td class="num">${fmt(d.OPPORTUNITY)}</td>
        <td>${hostName}</td>
      </tr>`;
    }).join('\n');

  const shiftDateKeys = Object.keys(shiftsByDate).filter(k => k !== 'unknown').sort();
  const shiftRows = shiftDateKeys.flatMap(dt =>
    shiftsByDate[dt].map(s => {
      const hid = s.parentId1052 ? String(s.parentId1052) : null;
      const hostName = hid ? (hostMap[hid] || `Ведущий #${hid}`) : s.title || '—';
      return `<tr>
        <td class="tl-date">${fmtShortDate(dt)}</td>
        <td><span class="tl-dot"></span>${hostName}</td>
        <td>${s.title || '—'}</td>
      </tr>`;
    })
  ).join('\n');

  const pnlSign = pnl >= 0 ? '+' : '−';
  const pnlClass = pnl >= 0 ? 'green' : 'red';
  const pnlLabel = pnl >= 0 ? 'Прибыль' : 'Убыток';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${exhTitle} — Дашборд</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root {
    --black:   #0f0b2e;
    --dark:    #1e1a3a;
    --accent:  #4a5df9;
    --accent2: #3d4de6;
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

  .hero { background: var(--black); color: #fff; padding: 36px 60px 32px; }
  .hero-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .hero h1 { font-size: 36px; font-weight: 400; letter-spacing: 1px; line-height: 1.1; margin-bottom: 6px; }
  .hero-dates { margin-top: 12px; display: flex; gap: 32px; font-size: 13px; color: #888; }
  .hero-dates strong { color: #ccc; }

  .hero-nav { margin-top: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .nav-select { background: #1e1a3a; color: #ccc; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 12px; font-size: 13px; cursor: pointer; }
  .nav-select:focus { outline: none; border-color: var(--accent); }
  .refresh-btn { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 8px 18px; font-size: 13px; cursor: pointer; letter-spacing: 1px; }
  .refresh-btn:hover { background: var(--accent); color: #fff; }
  .fetched-at { font-size: 11px; color: #666; margin-left: auto; }

  .container { max-width: 1100px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

  .kpi-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; margin-top: 24px; }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.red::after { background: var(--red); }
  .kpi-card.green::after { background: var(--green); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-value.red { color: var(--red); }
  .kpi-value.green { color: var(--green); }
  .kpi-note { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }

  .pnl-block { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 32px; }
  .pnl-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 15px; }
  .pnl-row:last-child { border-bottom: none; }
  .pnl-row.total { font-size: 17px; font-weight: 600; padding-top: 18px; }
  .pnl-bar-wrap { flex: 1; margin: 0 24px; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
  .pnl-bar { height: 100%; border-radius: 4px; background: var(--accent); transition: width .5s ease; }
  .pnl-bar.red { background: var(--red); }
  .pnl-bar.green { background: var(--green); }
  .pnl-amount { font-size: 15px; min-width: 120px; text-align: right; font-variant-numeric: tabular-nums; }

  .expense-table, .prod-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .expense-table th, .prod-table th { background: var(--dark); color: #888; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 18px; text-align: left; font-weight: 400; }
  .expense-table td, .prod-table td { padding: 11px 18px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .expense-table tr:last-child td, .prod-table tr:last-child td { border-bottom: none; font-weight: 600; background: #f9f7ff; }
  .expense-table tr:hover td, .prod-table tr:hover td { background: #f9f7ff; }
  .expense-table td.num, .prod-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .exp-bar { display: inline-block; height: 6px; background: var(--accent2); border-radius: 3px; vertical-align: middle; margin-right: 6px; opacity: .6; }
  .b24-link { color: var(--accent); text-decoration: none; font-size: 12px; border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; }
  .b24-link:hover { background: var(--accent); color: #fff; }

  .timeline-grid { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
  .tl-header { display: grid; grid-template-columns: 90px 1fr 1fr; background: var(--dark); color: #888; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 20px; gap: 8px; }
  .tl-row { display: grid; grid-template-columns: 90px 1fr 1fr; padding: 10px 20px; gap: 8px; font-size: 14px; border-bottom: 1px solid var(--border); align-items: center; }
  .tl-row:last-child { border-bottom: none; }
  .tl-row:hover { background: #f9f7ff; }
  .tl-date { font-size: 12px; color: var(--muted); }
  .tl-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--accent); }
  .num { font-variant-numeric: tabular-nums; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
    .kpi-grid { grid-template-columns: repeat(2,1fr); }
    .two-col { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Дашборд выставки · Настольные игры «Потолкуем?»</div>
  <h1>${exhTitle}</h1>
  <div class="hero-dates">
    <div><strong>${exhBegin}</strong>${exhEnd && exhEnd !== exhBegin ? ' — ' + exhEnd : ''}</div>
    <div><strong>${deals.length}</strong> сделок · <strong>${shifts.length}</strong> выходов</div>
  </div>
  <div class="hero-nav">
    <form method="get" action="" style="display:contents">
      <select class="nav-select" onchange="location.href='/report/'+this.value">
        ${dropdownOptions}
      </select>
    </form>
    <form method="post" action="/report/${currentId}/refresh" style="display:contents">
      <button type="submit" class="refresh-btn">Обновить данные</button>
    </form>
    <span class="fetched-at">Данные: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}</span>
  </div>
</div>

<div class="container">

  <!-- KPI -->
  <div class="section">
    <div class="section-title">Ключевые показатели</div>
    <div class="kpi-grid">
      <div class="kpi-card green">
        <div class="kpi-label">Выручка</div>
        <div class="kpi-value green">${fmt(totalRevenue)}</div>
        <div class="kpi-note">руб.</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Расходы</div>
        <div class="kpi-value red">${fmt(totalExpenses)}</div>
        <div class="kpi-note">руб.</div>
      </div>
      <div class="kpi-card ${pnlClass}">
        <div class="kpi-label">P&amp;L</div>
        <div class="kpi-value ${pnlClass}">${pnl >= 0 ? '' : '−'}${fmt(Math.abs(pnl))}</div>
        <div class="kpi-note">руб. ${pnlLabel.toLowerCase()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Продаж</div>
        <div class="kpi-value">${deals.length}</div>
        <div class="kpi-note">сделок</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ведущих</div>
        <div class="kpi-value">${Object.keys(hostMap).length}</div>
        <div class="kpi-note">${shifts.length} выходов</div>
      </div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="section">
    <div class="section-title">Выручка и расходы</div>
    <div class="two-col">
      <div class="chart-card">
        <h3>Выручка по ведущим</h3>
        <canvas id="hostChart" height="220"></canvas>
      </div>
      <div class="chart-card">
        <h3>Структура расходов</h3>
        <canvas id="expenseChart" height="220"></canvas>
      </div>
    </div>
    <div style="margin-top:24px">
      <div class="chart-card">
        <h3>Выручка по дням</h3>
        <canvas id="dayChart" height="120"></canvas>
      </div>
    </div>
  </div>

  <!-- EXPENSES TABLE -->
  <div class="section">
    <div class="section-title">Расходы — детализация</div>
    <div class="two-col">
      <table class="expense-table">
        <thead>
          <tr>
            <th>Статья</th>
            <th>Сумма, руб.</th>
            <th>%</th>
            <th>Карточка</th>
          </tr>
        </thead>
        <tbody>
          ${expenseRows}
          ${expenseTotalRow}
        </tbody>
      </table>

      <!-- P&L -->
      <div class="pnl-block">
        <div class="section-title" style="margin-bottom:16px">P&amp;L</div>
        <div class="pnl-row">
          <span style="color:var(--green)">Выручка</span>
          <div class="pnl-bar-wrap"><div class="pnl-bar green" style="width:${revBar}%"></div></div>
          <span class="pnl-amount num" style="color:var(--green)">+ ${fmt(totalRevenue)}</span>
        </div>
        <div class="pnl-row">
          <span style="color:var(--red)">Расходы</span>
          <div class="pnl-bar-wrap"><div class="pnl-bar red" style="width:${expBar}%"></div></div>
          <span class="pnl-amount num" style="color:var(--red)">− ${fmt(totalExpenses)}</span>
        </div>
        <div class="pnl-row total">
          <span style="color:var(--${pnlClass})">${pnlLabel}</span>
          <div class="pnl-bar-wrap"></div>
          <span class="pnl-amount num" style="color:var(--${pnlClass})">${pnlSign} ${fmt(Math.abs(pnl))}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- DEALS TABLE -->
  <div class="section">
    <div class="section-title">Сделки${deals.length > 100 ? ' (первые 100)' : ''}</div>
    <table class="prod-table">
      <thead>
        <tr>
          <th>Продукт</th>
          <th>Сумма, руб.</th>
          <th>Ведущий</th>
        </tr>
      </thead>
      <tbody>
        ${dealRows}
      </tbody>
    </table>
  </div>

  <!-- SHIFTS TABLE -->
  <div class="section">
    <div class="section-title">Выходы ведущих</div>
    <div class="timeline-grid">
      <div class="tl-header">
        <div>Дата</div>
        <div>Ведущий</div>
        <div>Выход</div>
      </div>
      ${shiftRows || '<div style="padding:20px;color:var(--muted)">Нет данных</div>'}
    </div>
  </div>

</div>

<div class="footer">
  Потолкуем? · ${exhTitle} · Данные: potolkuem.bitrix24.ru · Обновлено: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}
</div>

<script>
const P = ${JSON.stringify(PALETTE)};
const RED = '#c0392b';
const GREEN = '#27ae60';

// Chart 1: Revenue by host (horizontal bar)
new Chart(document.getElementById('hostChart'), {
  type: 'bar',
  data: {
    labels: ${hostChartLabels},
    datasets: [{ data: ${hostChartData}, backgroundColor: ${hostChartColors}, borderRadius: 3, borderSkipped: false }]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.raw.toLocaleString('ru-RU') + ' руб.' } }
    },
    scales: {
      x: { grid: { color: '#ece8f8' }, ticks: { callback: v => (v/1000).toFixed(0)+'k', font: { size: 11 } } },
      y: { grid: { display: false }, ticks: { font: { size: 12 } } }
    }
  }
});

// Chart 2: Expense structure (doughnut)
new Chart(document.getElementById('expenseChart'), {
  type: 'doughnut',
  data: {
    labels: ${expenseChartLabels},
    datasets: [{ data: ${expenseChartData}, backgroundColor: ${expenseChartColors}, borderWidth: 2, borderColor: '#fff' }]
  },
  options: {
    responsive: true,
    cutout: '60%',
    plugins: {
      legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.raw.toLocaleString('ru-RU') + ' руб.' } }
    }
  }
});

// Chart 3: Revenue by day (bar)
new Chart(document.getElementById('dayChart'), {
  type: 'bar',
  data: {
    labels: ${dayChartLabels},
    datasets: [{ data: ${dayChartData}, backgroundColor: P[2], borderRadius: 3 }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.raw.toLocaleString('ru-RU') + ' руб.' } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12 } } },
      y: { grid: { color: '#ece8f8' }, ticks: { callback: v => (v/1000).toFixed(0)+'k', font: { size: 11 } } }
    }
  }
});
</script>
</body>
</html>`;
}

module.exports = { renderDashboard };
