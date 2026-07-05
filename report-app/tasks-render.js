'use strict';

const PALETTE = ['#1e2eb5','#3d4de6','#4a5df9','#7b8ef9','#9eabfa','#bbc5fc','#dde2fc','#6c3483','#117a65','#b7950b'];

const STATUS_LABELS = {
  '1': 'Ждёт выполнения',
  '2': 'В работе',
  '3': 'Ждёт контроля',
  '4': 'Отложена',
};

const STATUS_COLORS = {
  '1': '#9eabfa',
  '2': '#4a5df9',
  '3': '#f39c12',
  '4': '#95a5a6',
};

function taskUrl(b24Url, t) {
  return `${b24Url}/company/personal/user/${t.responsibleId || 0}/tasks/task/view/${t.id}/`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(ds) {
  if (!ds) return '—';
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ── Общий CSS (в том же стиле что report-app) ─────────────────────────────────
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
  .hero-sub { margin-top: 12px; display: flex; gap: 32px; font-size: 13px; color: #888; }
  .hero-sub strong { color: #ccc; }
  .hero-nav { margin-top: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .refresh-btn { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 8px 18px; font-size: 13px; cursor: pointer; letter-spacing: 1px; }
  .refresh-btn:hover { background: var(--accent); color: #fff; }
  .nav-btn { color: #9eabfa; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 14px; font-size: 13px; text-decoration: none; letter-spacing: 1px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent); }
  .fetched-at { font-size: 11px; color: #666; margin-left: auto; }

  .container { max-width: 1100px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }

  .kpi-grid { display: grid; gap: 16px; margin-top: 24px; }
  .kpi-grid-6 { grid-template-columns: repeat(6, 1fr); }
  .kpi-grid-5 { grid-template-columns: repeat(5, 1fr); }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 20px 16px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.red::after   { background: var(--red); }
  .kpi-card.green::after { background: var(--green); }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-value.red    { color: var(--red); }
  .kpi-value.green  { color: var(--green); }
  .kpi-value.orange { color: var(--orange); }
  .kpi-note { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .two-col { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #888; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 16px; text-align: left; font-weight: 400; }
  .data-table td { padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data-table .row-warn td { background: #fff8f8; }
  .data-table .row-warn:hover td { background: #fff0f0; }

  .b24-link { color: var(--accent); text-decoration: none; font-size: 12px; border: 1px solid var(--border); border-radius: 3px; padding: 2px 8px; white-space: nowrap; }
  .b24-link:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .b24-link-inline { color: var(--accent); text-decoration: none; }
  .b24-link-inline:hover { text-decoration: underline; }

  .status-badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 3px; letter-spacing: 0.5px; white-space: nowrap; }
  .status-1 { background: #eeebff; color: #7b79a0; }
  .status-2 { background: #e8ecff; color: #3d4de6; }
  .status-3 { background: #fef3e2; color: #e67e22; }
  .status-4 { background: #f0f0f0; color: #95a5a6; }

  .red-val    { color: var(--red); font-weight: 600; }
  .orange-val { color: var(--orange); }
  .green-val  { color: var(--green); }
  .muted-val  { color: var(--muted); }

  .status-group-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
  .status-group { margin-bottom: 28px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 900px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
    .kpi-grid-6 { grid-template-columns: repeat(3, 1fr); }
    .kpi-grid-5 { grid-template-columns: repeat(2, 1fr); }
    .two-col { grid-template-columns: 1fr; }
  }
`;

// ── Главный дашборд /tasks ────────────────────────────────────────────────────
function renderTasksDashboard(data) {
  const { stats, byStatus, byUser, activityByDay, overdueList, staleList, fetchedAt, b24Url, activeUserIds } = data;
  const activeSet = new Set(activeUserIds || []);

  const userCount = Object.keys(byUser).length;

  // Таблица по исполнителям: сначала с просрочкой, потом по количеству активных
  const userRows = Object.entries(byUser)
    .filter(([uid]) => !activeSet.size || activeSet.has(uid))
    .sort((a, b) => b[1].overdue - a[1].overdue || b[1].active - a[1].active)
    .map(([uid, u]) => {
      const hasProblems = u.overdue > 0 || u.stale > 0;
      const overdueCell = u.overdue > 0
        ? `<span class="red-val">${u.overdue}</span>`
        : `<span class="muted-val">—</span>`;
      const staleCell = u.stale > 0
        ? `<span class="orange-val">${u.stale}</span>`
        : `<span class="muted-val">—</span>`;
      const noDeadlineCell = u.noDeadline > 0
        ? u.noDeadline
        : `<span class="muted-val">—</span>`;
      const closedCell = u.closedLast30d > 0
        ? `<span class="green-val">${u.closedLast30d}</span>`
        : `<span class="muted-val">—</span>`;
      const avgCell = u.avgCloseDays !== null
        ? `${u.avgCloseDays} д.`
        : `<span class="muted-val">—</span>`;
      return `<tr class="${hasProblems ? 'row-warn' : ''}">
        <td><a href="/tasks/member/${uid}" class="b24-link-inline">${u.name}</a></td>
        <td class="num">${u.active}</td>
        <td class="num">${overdueCell}</td>
        <td class="num">${staleCell}</td>
        <td class="num">${closedCell}</td>
        <td class="num">${avgCell}</td>
        <td class="num">${noDeadlineCell}</td>
      </tr>`;
    }).join('\n');

  // Просроченные (топ 20)
  const overdueRows = overdueList.slice(0, 20).map(t => {
    const uid  = String(t.responsibleId || '0');
    const name = data.userMap[uid] || `#${uid}`;
    return `<tr>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
      <td>${name}</td>
      <td>${fmtDate(t.deadline)}</td>
      <td class="num red-val">${t.overdueDays} дн.</td>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
    </tr>`;
  }).join('\n');

  // Зависшие (топ 20)
  const staleRows = staleList.slice(0, 20).map(t => {
    const uid   = String(t.responsibleId || '0');
    const name  = data.userMap[uid] || `#${uid}`;
    const label = STATUS_LABELS[String(t.status)] || `Статус ${t.status}`;
    return `<tr>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
      <td>${name}</td>
      <td><span class="status-badge status-${t.status}">${label}</span></td>
      <td class="num orange-val">${t.staleDays} дн.</td>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
    </tr>`;
  }).join('\n');

  // Данные графика активности
  const actDates   = JSON.stringify(activityByDay.map(d => fmtShortDate(d.date)));
  const actCreated = JSON.stringify(activityByDay.map(d => d.created));
  const actClosed  = JSON.stringify(activityByDay.map(d => d.closed));

  // Данные пончика статусов
  const statusKeys   = ['2', '3', '1', '4'];
  const statusLabels = JSON.stringify(statusKeys.map(k => STATUS_LABELS[k]));
  const statusData   = JSON.stringify(statusKeys.map(k => byStatus[k] || 0));
  const statusColors = JSON.stringify(statusKeys.map(k => STATUS_COLORS[k]));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Задачи коллектива — Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Дашборд задач · Настольные игры «Потолкуем?»</div>
  <h1>Активность коллектива</h1>
  <div class="hero-sub">
    <div><strong>${stats.totalActive}</strong> активных задач · <strong>${userCount}</strong> сотрудников</div>
  </div>
  <div class="hero-nav">
    <form method="post" action="/tasks/refresh" style="display:contents">
      <button type="submit" class="refresh-btn">Обновить данные</button>
    </form>
    <a href="/report" class="nav-btn">Дашборд выставок</a>
    <span class="fetched-at">Данные: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}</span>
  </div>
</div>

<div class="container">

  <!-- KPI -->
  <div class="section">
    <div class="section-title">Ключевые показатели</div>
    <div class="kpi-grid kpi-grid-6">
      <div class="kpi-card">
        <div class="kpi-label">Активных задач</div>
        <div class="kpi-value">${stats.totalActive}</div>
        <div class="kpi-note">в работе сейчас</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Поставлено сегодня</div>
        <div class="kpi-value${stats.createdToday > 0 ? ' green' : ''}">${stats.createdToday}</div>
        <div class="kpi-note">новых задач</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Закрыто за 7 дней</div>
        <div class="kpi-value${stats.closedLast7d > 0 ? ' green' : ''}">${stats.closedLast7d}</div>
        <div class="kpi-note">завершённых</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Просрочено</div>
        <div class="kpi-value${stats.overdue > 0 ? ' red' : ''}">${stats.overdue}</div>
        <div class="kpi-note">нарушен срок</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Без движения 14д+</div>
        <div class="kpi-value${stats.stale > 0 ? ' orange' : ''}">${stats.stale}</div>
        <div class="kpi-note">зависших задач</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Без дедлайна</div>
        <div class="kpi-value">${stats.noDeadline}</div>
        <div class="kpi-note">нет срока</div>
      </div>
    </div>
  </div>

  <!-- ГРАФИКИ -->
  <div class="section">
    <div class="section-title">Динамика и распределение</div>
    <div class="two-col">
      <div class="chart-card">
        <h3>Активность за 30 дней — поставлено vs закрыто</h3>
        <canvas id="activityChart" height="200"></canvas>
      </div>
      <div class="chart-card">
        <h3>Задачи по статусам</h3>
        <canvas id="statusChart" height="200"></canvas>
      </div>
    </div>
  </div>

  <!-- КОМАНДА -->
  <div class="section">
    <div class="section-title">Команда — сводка по исполнителям</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Сотрудник</th>
          <th>Активных</th>
          <th>Просрочено</th>
          <th>Без движения</th>
          <th>Закрыто (30д)</th>
          <th>Ср. закрытие</th>
          <th>Без дедлайна</th>
        </tr>
      </thead>
      <tbody>
        ${userRows || '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:24px">Нет данных</td></tr>'}
      </tbody>
    </table>
    <div style="font-size:12px;color:var(--muted);margin-top:10px">
      Кликните на имя сотрудника — детальный разбор его задач.
    </div>
  </div>

  <!-- ПРОСРОЧЕННЫЕ -->
  ${overdueList.length > 0 ? `
  <div class="section">
    <div class="section-title">Просроченные задачи${overdueList.length > 20 ? ` — топ 20 из ${overdueList.length}` : ` (${overdueList.length})`}</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Задача</th>
          <th>Исполнитель</th>
          <th>Срок</th>
          <th>Просрочена на</th>
          <th>Карточка</th>
        </tr>
      </thead>
      <tbody>${overdueRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ЗАВИСШИЕ -->
  ${staleList.length > 0 ? `
  <div class="section">
    <div class="section-title">Задачи без движения 14+ дней${staleList.length > 20 ? ` — топ 20 из ${staleList.length}` : ` (${staleList.length})`}</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Задача</th>
          <th>Исполнитель</th>
          <th>Статус</th>
          <th>Без движения</th>
          <th>Карточка</th>
        </tr>
      </thead>
      <tbody>${staleRows}</tbody>
    </table>
  </div>` : ''}

</div>

<div class="footer">
  Потолкуем? · Дашборд задач · potolkuem.bitrix24.ru · Обновлено: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}
</div>

<script>
// График активности 30 дней
new Chart(document.getElementById('activityChart'), {
  type: 'bar',
  data: {
    labels: ${actDates},
    datasets: [
      { label: 'Поставлено', data: ${actCreated}, backgroundColor: '#4a5df9', borderRadius: 2 },
      { label: 'Закрыто',    data: ${actClosed},  backgroundColor: '#27ae60', borderRadius: 2 }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + ctx.raw } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
      y: { grid: { color: '#ece8f8' }, ticks: { font: { size: 11 }, precision: 0 } }
    }
  }
});

// Пончик статусов
new Chart(document.getElementById('statusChart'), {
  type: 'doughnut',
  data: {
    labels: ${statusLabels},
    datasets: [{ data: ${statusData}, backgroundColor: ${statusColors}, borderWidth: 2, borderColor: '#fff' }]
  },
  options: {
    responsive: true,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 12 }, boxWidth: 14, padding: 10 } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.raw + ' задач' } }
    }
  }
});
</script>
</body>
</html>`;
}

// ── Детальная страница сотрудника /tasks/member/:userId ───────────────────────
function renderMemberDetail(data, userId) {
  const uid  = String(userId);
  const { userMap, b24Url, fetchedAt } = data;
  const name = userMap[uid] || `Пользователь #${uid}`;
  const u    = data.byUser[uid];

  if (!u) {
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
    <style>${BASE_CSS}</style></head>
    <body><div class="hero"><div class="hero-label">Дашборд задач</div><h1>${name}</h1>
    <div class="hero-nav"><a href="/tasks" class="nav-btn">← К команде</a></div></div>
    <div class="container"><p style="margin-top:40px;color:var(--muted)">Нет данных по этому сотруднику.</p></div>
    </body></html>`;
  }

  const now = new Date();

  const myActive  = data.activeTasks.filter(t => String(t.responsibleId) === uid);
  const myClosed  = data.recentClosed.filter(t => String(t.responsibleId) === uid);
  const myOverdue = data.overdueList.filter(t => String(t.responsibleId) === uid);
  const myStale   = data.staleList.filter(t => String(t.responsibleId) === uid);

  // Группируем активные по статусу: порядок — В работе → Ждёт контроля → Ждёт выполнения → Отложена
  const statusOrder = ['2', '3', '1', '4'];
  const byStatusTasks = {};
  for (const t of myActive) {
    const s = String(t.status);
    if (!byStatusTasks[s]) byStatusTasks[s] = [];
    byStatusTasks[s].push(t);
  }

  const statusSections = statusOrder.map(s => {
    const tasks = byStatusTasks[s];
    if (!tasks || !tasks.length) return '';
    const rows = tasks.map(t => {
      const isOverdue = t.deadline && new Date(t.deadline) < now;
      return `<tr class="${isOverdue ? 'row-warn' : ''}">
        <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
        <td>${t.deadline
          ? `<span class="${isOverdue ? 'red-val' : ''}">${fmtDate(t.deadline)}${isOverdue ? ' ⚠' : ''}</span>`
          : '<span class="muted-val">—</span>'}</td>
        <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
      </tr>`;
    }).join('\n');
    return `<div class="status-group">
      <div class="status-group-label">
        <span class="status-badge status-${s}">${STATUS_LABELS[s]}</span>
        <span>${tasks.length} задач</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Задача</th><th>Срок</th><th>Карточка</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const overdueRows = myOverdue.map(t => `<tr>
    <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
    <td>${fmtDate(t.deadline)}</td>
    <td class="num red-val">${t.overdueDays} дн.</td>
    <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
  </tr>`).join('\n');

  const staleRows = myStale.map(t => {
    const label = STATUS_LABELS[String(t.status)] || String(t.status);
    return `<tr>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
      <td><span class="status-badge status-${t.status}">${label}</span></td>
      <td class="num orange-val">${t.staleDays} дн.</td>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
    </tr>`;
  }).join('\n');

  const closedRows = myClosed.slice(0, 30).map(t => {
    const days = t.createdDate && t.closedDate
      ? Math.round((new Date(t.closedDate) - new Date(t.createdDate)) / 86400000)
      : null;
    return `<tr>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link-inline">${t.title || `Задача #${t.id}`}</a></td>
      <td>${fmtDate(t.closedDate)}</td>
      <td class="num muted-val">${days !== null ? days + ' д.' : '—'}</td>
      <td><a href="${taskUrl(b24Url, t)}" target="_blank" class="b24-link">Открыть</a></td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — задачи</title>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Дашборд задач · Исполнитель</div>
  <h1>${name}</h1>
  <div class="hero-sub">
    <div><strong>${u.active}</strong> активных · <strong>${u.closedLast30d}</strong> закрыто за 30 дней</div>
    ${u.overdue > 0 ? `<div style="color:#e57373"><strong>${u.overdue}</strong> просроченных</div>` : ''}
  </div>
  <div class="hero-nav">
    <a href="/tasks" class="nav-btn">← К команде</a>
    <span class="fetched-at">Данные: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}</span>
  </div>
</div>

<div class="container">

  <!-- KPI -->
  <div class="section">
    <div class="section-title">Сводка</div>
    <div class="kpi-grid kpi-grid-5">
      <div class="kpi-card">
        <div class="kpi-label">Активных задач</div>
        <div class="kpi-value">${u.active}</div>
        <div class="kpi-note">в работе</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Просрочено</div>
        <div class="kpi-value${u.overdue > 0 ? ' red' : ''}">${u.overdue}</div>
        <div class="kpi-note">нарушен срок</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Без движения 14д+</div>
        <div class="kpi-value${u.stale > 0 ? ' orange' : ''}">${u.stale}</div>
        <div class="kpi-note">зависших</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Закрыто за 30 дней</div>
        <div class="kpi-value green">${u.closedLast30d}</div>
        <div class="kpi-note">выполнено</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ср. время закрытия</div>
        <div class="kpi-value">${u.avgCloseDays !== null ? u.avgCloseDays : '—'}</div>
        <div class="kpi-note">${u.avgCloseDays !== null ? 'дней (за 30д)' : 'нет данных'}</div>
      </div>
    </div>
  </div>

  <!-- АКТИВНЫЕ ЗАДАЧИ ПО СТАТУСАМ -->
  ${myActive.length > 0 ? `
  <div class="section">
    <div class="section-title">Активные задачи по статусам</div>
    ${statusSections || '<p style="color:var(--muted)">Нет данных</p>'}
  </div>` : ''}

  <!-- ПРОСРОЧЕННЫЕ -->
  ${myOverdue.length > 0 ? `
  <div class="section">
    <div class="section-title">Просроченные задачи (${myOverdue.length})</div>
    <table class="data-table">
      <thead><tr><th>Задача</th><th>Срок</th><th>Просрочена на</th><th>Карточка</th></tr></thead>
      <tbody>${overdueRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ЗАВИСШИЕ -->
  ${myStale.length > 0 ? `
  <div class="section">
    <div class="section-title">Задачи без движения 14+ дней (${myStale.length})</div>
    <table class="data-table">
      <thead><tr><th>Задача</th><th>Статус</th><th>Без движения</th><th>Карточка</th></tr></thead>
      <tbody>${staleRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ЗАКРЫТЫЕ ЗА 30 ДНЕЙ -->
  ${myClosed.length > 0 ? `
  <div class="section">
    <div class="section-title">Закрытые за 30 дней${myClosed.length > 30 ? ' (последние 30)' : ` (${myClosed.length})`}</div>
    <table class="data-table">
      <thead><tr><th>Задача</th><th>Дата закрытия</th><th>Время выполнения</th><th>Карточка</th></tr></thead>
      <tbody>${closedRows}</tbody>
    </table>
  </div>` : ''}

</div>

<div class="footer">
  Потолкуем? · ${name} · potolkuem.bitrix24.ru · Обновлено: ${fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') : '—'}
</div>

</body>
</html>`;
}

module.exports = { renderTasksDashboard, renderMemberDetail };
