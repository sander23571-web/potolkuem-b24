'use strict';
/**
 * render-activity.js — HTML-рендерер дашборда /report/creative
 * («Активность Креативного директора» — СП 1100, 4 категории).
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav, isFinanceViewer } = require('./nav');
const { fmtRub, fmtRubClientSrc } = require('./format');
const { CATEGORY, STAGES } = require('./activity-data');

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const fmtDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const monthKey = iso => (iso || '').slice(0, 7);
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monthLabel = ym => {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
};

// Один цвет — одна категория, фиксированный порядок, не переставляется фильтрами.
const CAT_COLOR = {
  [CATEGORY.SOCIAL]: '#2787f5',
  [CATEGORY.JOURNAL]: '#8e44ad',
  [CATEGORY.DESIGN]: '#e67e22',
  [CATEGORY.SHOOTS]: '#27ae60',
  [CATEGORY.TECH]: '#16a085',
};
const CAT_LABEL = {
  [CATEGORY.SOCIAL]: 'Соцсети',
  [CATEGORY.JOURNAL]: 'Журнал «Потолкуем?»',
  [CATEGORY.DESIGN]: 'Дизайн',
  [CATEGORY.SHOOTS]: 'Съёмки',
  [CATEGORY.TECH]: 'Техдоработки сайта',
};
const PLATFORM_COLOR = { VK: '#2787f5', TG: '#2aabee', 'Дзен': '#000000', MAX: '#8b5cf6', TikTok: '#e2266d', Instagram: '#d62976', YouTube: '#ff0000', RUTUBE: '#00a8e0', 'Другое': '#7b79a0' };

function b24Link(b24Url, id) {
  return `${b24Url}/crm/type/1100/details/${id}/`;
}

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

  .container { max-width: 1280px; margin: 0 auto; padding: 0 32px 60px; }
  .section { margin-top: 48px; }
  .section-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent2); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .section-title .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 16px; margin-top: 24px; }
  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 24px 20px; position: relative; }
  .kpi-card::after { content:''; position: absolute; top:0; left:0; right:0; height:3px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .kpi-card.orange::after { background: var(--orange); }
  .kpi-card.red::after { background: var(--red); }
  .kpi-card.green::after { background: var(--green); }
  .kpi-label { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .kpi-value { font-size: 26px; font-weight: 400; line-height: 1; color: var(--black); }
  .kpi-sub { font-size: 12px; color: var(--muted); margin-top: 8px; }

  .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 28px 24px; }
  .chart-card h3 { font-size: 13px; font-weight: 400; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { height: 280px; position: relative; }
  .chart-wrap.tall { height: 380px; }
  .two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

  .data-table { background: var(--card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; width: 100%; border-collapse: collapse; }
  .data-table th { background: var(--dark); color: #ccc; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 14px; text-align: left; font-weight: 400; white-space: nowrap; }
  .data-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 14px; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: #f9f7ff; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .data-table tfoot td { border-top: 2px solid var(--border); border-bottom: none; font-weight: 600; }
  .table-wrap { overflow-x: auto; }

  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; letter-spacing: .5px; }
  .badge.stage { background: #eef0ff; color: var(--accent2); }
  .badge.stage.done { background: #e6f7ec; color: var(--green); }
  .badge.stage.fail { background: #fdeceb; color: var(--red); }
  .badge.overdue { background: #fdeceb; color: var(--red); font-weight: 600; }

  .b24-link { color: var(--accent); text-decoration: none; border-bottom: 1px dashed var(--accent); }
  .b24-link:hover { border-bottom-style: solid; }
  .ext-link { color: var(--muted); text-decoration: none; font-size: 12px; }
  .ext-link:hover { color: var(--accent); }

  .note { background: #fdf3e7; border: 1px solid #f3ddb8; border-radius: 4px; padding: 16px 20px; font-size: 13px; color: #7a5a1e; margin-top: 20px; }
  .note code { background: #fff; padding: 1px 5px; border-radius: 3px; }
  .empty-row td { text-align: center; color: var(--muted); padding: 24px; }

  .footer { text-align: center; font-size: 12px; color: var(--muted); padding: 32px; border-top: 1px solid var(--border); margin-top: 60px; letter-spacing: 1px; }

  @media (max-width: 768px) {
    .hero { padding: 24px 20px; }
    .container { padding: 0 16px 40px; }
  }
`;

function renderActivity(data, viewer) {
  const { token, isDirector } = viewer || {};
  const { social, journal, design, shoots, tech, b24Url, fetchedAt } = data;
  const all = [
    ...social.map(it => ({ ...it, _cat: CATEGORY.SOCIAL })),
    ...journal.map(it => ({ ...it, _cat: CATEGORY.JOURNAL })),
    ...design.map(it => ({ ...it, _cat: CATEGORY.DESIGN })),
    ...shoots.map(it => ({ ...it, _cat: CATEGORY.SHOOTS })),
    ...tech.map(it => ({ ...it, _cat: CATEGORY.TECH })),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  // ── KPI ──────────────────────────────────────────────────────────────────
  const thisMonthCount = all.filter(it => monthKey(it.begindate || it.createdTime) === thisMonth).length;
  const overdue = all.filter(it => it.overdue);
  const expensesThisMonth = [...design, ...shoots]
    .filter(it => monthKey(it.begindate || it.createdTime) === thisMonth)
    .reduce((s, it) => s + parseFloat(it.ufCrm42DExpenses || it.ufCrm42SCost || 0), 0);
  const doneItems = all.filter(it => it.cycleDays !== null);
  const avgCycle = doneItems.length ? Math.round(doneItems.reduce((s, it) => s + it.cycleDays, 0) / doneItems.length) : null;

  // ── «Что горит» ──────────────────────────────────────────────────────────
  const overdueRows = overdue
    .sort((a, b) => (a.begindate || '').localeCompare(b.begindate || ''))
    .map(it => `<tr>
      <td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CAT_COLOR[it._cat]};margin-right:8px"></span>${CAT_LABEL[it._cat]}</td>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.title || `#${it.id}`)}</a></td>
      <td><span class="badge overdue">${escHtml(fmtDate(it.begindate))}</span></td>
      <td>${escHtml(it.stageLabel)}</td>
      <td>${escHtml(it.responsibleName)}</td>
    </tr>`).join('');

  // ── Расходы (Дизайн + Съёмки) ────────────────────────────────────────────
  const expenseItems = [
    ...design.filter(it => parseFloat(it.ufCrm42DExpenses || 0) > 0).map(it => ({
      month: monthKey(it.begindate || it.createdTime), executor: it.ufCrm42DExecutor || '—',
      work: it.title, cost: parseFloat(it.ufCrm42DExpenses || 0), cat: 'Дизайн', id: it.id,
    })),
    ...shoots.filter(it => parseFloat(it.ufCrm42SCost || 0) > 0).map(it => ({
      month: monthKey(it.begindate || it.createdTime), executor: it.ufCrm42SExecutor || '—',
      work: it.title, cost: parseFloat(it.ufCrm42SCost || 0), cat: 'Съёмки', id: it.id,
    })),
  ];
  const expenseMonths = [...new Set(expenseItems.map(e => e.month))].filter(Boolean).sort();
  const expenseTotal = expenseItems.reduce((s, e) => s + e.cost, 0);
  const designByMonth = new Map();
  const shootsByMonth = new Map();
  for (const e of expenseItems) {
    const map = e.cat === 'Дизайн' ? designByMonth : shootsByMonth;
    map.set(e.month, (map.get(e.month) || 0) + e.cost);
  }
  const expenseChartLabels = JSON.stringify(expenseMonths.map(monthLabel));
  const expenseChartDatasets = JSON.stringify([
    { label: 'Дизайн', data: expenseMonths.map(m => Math.round(designByMonth.get(m) || 0)),
      backgroundColor: CAT_COLOR[CATEGORY.DESIGN] + '8c', borderColor: CAT_COLOR[CATEGORY.DESIGN], borderWidth: 1, borderRadius: 3 },
    { label: 'Съёмки', data: expenseMonths.map(m => Math.round(shootsByMonth.get(m) || 0)),
      backgroundColor: CAT_COLOR[CATEGORY.SHOOTS] + '8c', borderColor: CAT_COLOR[CATEGORY.SHOOTS], borderWidth: 1, borderRadius: 3 },
  ]);
  const expenseRows = expenseItems.length
    ? [...expenseItems].sort((a, b) => b.month.localeCompare(a.month) || b.cost - a.cost).map(e => `<tr>
        <td>${escHtml(monthLabel(e.month))}</td>
        <td>${escHtml(e.cat)}</td>
        <td>${escHtml(e.executor)}</td>
        <td><a class="b24-link" href="${b24Link(b24Url, e.id)}" target="_blank">${escHtml(e.work)}</a></td>
        <td class="num">${fmtRub(e.cost)}</td>
      </tr>`).join('')
    : `<tr class="empty-row"><td colspan="5">Расходов пока не внесено</td></tr>`;

  // ── Нагрузка по ответственным ────────────────────────────────────────────
  const workload = new Map();
  for (const it of all) {
    if (it.terminal) continue;
    const key = it.responsibleName;
    if (!workload.has(key)) workload.set(key, { total: 0, byCategory: {} });
    const w = workload.get(key);
    w.total++;
    w.byCategory[it._cat] = (w.byCategory[it._cat] || 0) + 1;
  }
  const workloadRows = [...workload.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, w]) => `<tr>
      <td>${escHtml(name)}</td>
      <td class="num">${w.byCategory[CATEGORY.SOCIAL] || 0}</td>
      <td class="num">${w.byCategory[CATEGORY.JOURNAL] || 0}</td>
      <td class="num">${w.byCategory[CATEGORY.DESIGN] || 0}</td>
      <td class="num">${w.byCategory[CATEGORY.SHOOTS] || 0}</td>
      <td class="num" style="font-weight:600">${w.total}</td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="6">Все задачи в терминальных стадиях — нагрузки нет</td></tr>`;

  // Средний цикл по категориям (дни от постановки до завершения) — своя мини-диаграмма.
  const cycleByCategory = [CATEGORY.SOCIAL, CATEGORY.JOURNAL, CATEGORY.DESIGN, CATEGORY.SHOOTS].map(cat => {
    const items = all.filter(it => it._cat === cat && it.cycleDays !== null);
    const avg = items.length ? Math.round(items.reduce((s, it) => s + it.cycleDays, 0) / items.length) : null;
    return { cat, avg, n: items.length };
  });
  const cycleChartLabels = JSON.stringify(cycleByCategory.map(c => CAT_LABEL[c.cat]));
  const cycleChartData = JSON.stringify(cycleByCategory.map(c => c.avg));
  const cycleChartColors = JSON.stringify(cycleByCategory.map(c => CAT_COLOR[c.cat]));

  // ── Секции по категориям ─────────────────────────────────────────────────
  function stageFunnelChart(categoryId, elId) {
    const stages = STAGES[categoryId];
    const items = all.filter(it => it._cat === categoryId);
    const counts = stages.map(s => items.filter(it => it.stageId === s.id).length);
    return `<div class="chart-wrap"><canvas id="${elId}"></canvas></div>
    <script>
    new Chart(document.getElementById('${elId}'), {
      type: 'bar',
      data: { labels: ${JSON.stringify(stages.map(s => s.name))},
        datasets: [{ data: ${JSON.stringify(counts)}, backgroundColor: '${CAT_COLOR[categoryId]}8c', borderColor: '${CAT_COLOR[categoryId]}', borderWidth: 1, borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.raw + ' шт.' } } },
        scales: { x: { ticks: { color: '#7b79a0', precision: 0 }, grid: { color: '#e0daf7' } },
                  y: { ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } } } }
    });
    </script>`;
  }

  function platformBadges(it) {
    // Новое множественное поле «Площадки» приоритетно; старое одиночное — фолбэк для записей
    // до 17.09.2026, заведённых ещё по одной карточке на площадку.
    const labels = it.platformsLabels.length ? it.platformsLabels : [it.platformLabel].filter(Boolean);
    return labels.map(l => `<span class="badge stage" style="background:${PLATFORM_COLOR[l] || '#7b79a0'}22;color:${PLATFORM_COLOR[l] || '#7b79a0'}">${escHtml(l)}</span>`).join(' ');
  }
  function publicationLinks(it) {
    const links = it.linksList.length ? it.linksList : [it.ufCrm42SmLink].filter(Boolean);
    return links.map(u => ` · <a class="ext-link" href="${escHtml(u)}" target="_blank">пост ↗</a>`).join('');
  }
  function socialTable() {
    if (!social.length) return `<tr class="empty-row"><td colspan="8">Записей пока нет</td></tr>`;
    return [...social].sort((a, b) => (b.ufCrm42SmPublishDate || '').localeCompare(a.ufCrm42SmPublishDate || '')).map(it => `<tr>
      <td>${platformBadges(it)}</td>
      <td>${escHtml(it.contentTypeLabel)}</td>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.ufCrm42SmTopic || it.title || '—')}</a>
        ${publicationLinks(it)}</td>
      <td>${escHtml(fmtDate(it.ufCrm42SmPublishDate))}</td>
      <td class="num">${it.ufCrm42SmViews != null ? fmt(it.ufCrm42SmViews) : '—'}</td>
      <td class="num">${it.ufCrm42SmLikes != null ? fmt(it.ufCrm42SmLikes) : '—'}</td>
      <td class="num">${it.ufCrm42SmShares != null ? fmt(it.ufCrm42SmShares) : '—'}</td>
      <td><span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }
  const socialTotals = social.reduce((acc, it) => ({
    views: acc.views + (parseFloat(it.ufCrm42SmViews) || 0),
    likes: acc.likes + (parseFloat(it.ufCrm42SmLikes) || 0),
    shares: acc.shares + (parseFloat(it.ufCrm42SmShares) || 0),
  }), { views: 0, likes: 0, shares: 0 });

  function journalTable() {
    if (!journal.length) return `<tr class="empty-row"><td colspan="7">Записей пока нет</td></tr>`;
    return [...journal].sort((a, b) => (b.begindate || '').localeCompare(a.begindate || '')).map(it => `<tr>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.ufCrm42JTopic || it.title || '—')}</a>
        ${it.ufCrm42JLink ? ` · <a class="ext-link" href="${escHtml(it.ufCrm42JLink)}" target="_blank">статья ↗</a>` : ''}</td>
      <td>${escHtml(it.ufCrm42JRubric || '—')}</td>
      <td>${escHtml(it.copywriterName || '—')}</td>
      <td>${escHtml(fmtDate(it.closedate || it.begindate))}</td>
      <td class="num">${it.ufCrm42JViews != null ? fmt(it.ufCrm42JViews) : '—'}</td>
      <td>${[it.ufCrm42JDesktop === 'Y' ? '💻' : '', it.ufCrm42JMobile === 'Y' ? '📱' : '', it.ufCrm42JZen === 'Y' ? '📰Дзен' : ''].filter(Boolean).join(' ') || '—'}</td>
      <td><span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }

  // Полный календарь статей (п.6, 17.09.2026 по замечанию Алёны) — ВСЕ статьи (не только
  // незавершённые, как было раньше), отсортированные по плановой дате, с полным названием
  // (Kanban-карточки Б24 обрезают длинные заголовки — ограничение виджета, не структуры СП;
  // здесь заголовок не режется). Фактическая дата публикации показана отдельной колонкой.
  const journalCalendar = [...journal]
    .sort((a, b) => (a.begindate || '9999').localeCompare(b.begindate || '9999'));

  function journalUpcomingRows() {
    if (!journalCalendar.length) return `<tr class="empty-row"><td colspan="5">Статей в плане пока нет</td></tr>`;
    return journalCalendar.map(it => `<tr>
      <td>${escHtml(fmtDate(it.begindate))}</td>
      <td>${it.terminal ? escHtml(fmtDate(it.closedate)) : '—'}</td>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.ufCrm42JTopic || it.title || '—')}</a></td>
      <td>${escHtml(it.ufCrm42JRubric || '—')}</td>
      <td>${escHtml(it.copywriterName || '—')} · <span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }

  // Нагрузка по копирайтерам (п. «сколько работ у каждого») — считаем по полю «Копирайтер»
  // (ufCrm42JCopywriter), не по общему «Ответственному»: часто это разные люди (Ответственный
  // может быть Алёна как постановщик, Копирайтер — кто реально пишет).
  const copywriterStats = new Map(); // name -> { total, published, inProgress }
  for (const it of journal) {
    const name = it.copywriterName || '—';
    if (!copywriterStats.has(name)) copywriterStats.set(name, { total: 0, published: 0, inProgress: 0 });
    const s = copywriterStats.get(name);
    s.total++;
    if (it.terminal && !it.failed) s.published++;
    else if (!it.terminal) s.inProgress++;
  }
  const copywriterRows = [...copywriterStats.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, s]) => `<tr>
      <td>${escHtml(name)}</td>
      <td class="num">${s.total}</td>
      <td class="num">${s.published}</td>
      <td class="num">${s.inProgress}</td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="4">Записей пока нет</td></tr>`;

  function designTable() {
    if (!design.length) return `<tr class="empty-row"><td colspan="6">Записей пока нет</td></tr>`;
    return [...design].sort((a, b) => (b.begindate || '').localeCompare(a.begindate || '')).map(it => `<tr>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.title || '—')}</a>
        ${it.ufCrm42DResultLink ? ` · <a class="ext-link" href="${escHtml(it.ufCrm42DResultLink)}" target="_blank">результат ↗</a>` : ''}</td>
      <td>${escHtml(it.typeLabel)}</td>
      <td>${escHtml(it.ufCrm42DProject || '—')}</td>
      <td>${escHtml(it.ufCrm42DExecutor || '—')}</td>
      <td class="num">${parseFloat(it.ufCrm42DExpenses || 0) > 0 ? fmtRub(it.ufCrm42DExpenses) : '—'}</td>
      <td><span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }

  function shootsTable() {
    if (!shoots.length) return `<tr class="empty-row"><td colspan="7">Записей пока нет</td></tr>`;
    return [...shoots].sort((a, b) => (b.begindate || '').localeCompare(a.begindate || '')).map(it => `<tr>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.title || '—')}</a>
        ${it.ufCrm42SSourceLink ? ` · <a class="ext-link" href="${escHtml(it.ufCrm42SSourceLink)}" target="_blank">исходники ↗</a>` : ''}</td>
      <td>${escHtml(it.typeLabel)}</td>
      <td>${escHtml(it.ufCrm42SExecutor || '—')}</td>
      <td>${escHtml(fmtDate(it.ufCrm42SDate))}</td>
      <td>${escHtml(it.ufCrm42SVolume || '—')}</td>
      <td class="num">${parseFloat(it.ufCrm42SCost || 0) > 0 ? fmtRub(it.ufCrm42SCost) : '—'}</td>
      <td><span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }

  function techTable() {
    if (!tech.length) return `<tr class="empty-row"><td colspan="5">Задач пока нет</td></tr>`;
    return [...tech].sort((a, b) => (b.begindate || b.createdTime || '').localeCompare(a.begindate || a.createdTime || '')).map(it => `<tr>
      <td><a class="b24-link" href="${b24Link(b24Url, it.id)}" target="_blank">${escHtml(it.title || it.ufCrm42TDescription || '—')}</a>
        ${it.ufCrm42TUrl ? ` · <a class="ext-link" href="${escHtml(it.ufCrm42TUrl)}" target="_blank">страница ↗</a>` : ''}</td>
      <td>${escHtml(it.ufCrm42TDescription || '—')}</td>
      <td>${escHtml(it.ufCrm42TDeveloper || '—')}</td>
      <td>${escHtml(fmtDate(it.begindate))}</td>
      <td><span class="badge stage${it.terminal ? (it.failed ? ' fail' : ' done') : ''}">${escHtml(it.stageLabel)}</span></td>
    </tr>`).join('');
  }

  const fetchedStr = fetchedAt
    ? new Date(fetchedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Активность Креативного директора · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем?</div>
  <h1>Активность Креативного директора</h1>
  <div class="hero-sub">Соцсети · Журнал «Потолкуем?» · Дизайн · Съёмки</div>
  <nav class="hero-nav">
    ${renderNav('creative', isDirector, isFinanceViewer(viewer))}
    <a class="nav-btn" href="#journal-calendar">📅 Полный календарь статей</a>
    <span class="fetched-at">обновлено ${fetchedStr}</span>
  </nav>
</div>

<div class="container">

<div class="section" style="margin-top:32px">
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Активностей в этом месяце</div><div class="kpi-value">${thisMonthCount}</div><div class="kpi-sub">по всем 4 блокам</div></div>
    <div class="kpi-card ${overdue.length ? 'red' : 'green'}"><div class="kpi-label">Просрочено</div><div class="kpi-value">${overdue.length}</div><div class="kpi-sub">дедлайн прошёл, не завершено</div></div>
    <div class="kpi-card orange"><div class="kpi-label">Расходы (Дизайн+Съёмки), этот месяц</div><div class="kpi-value">${fmtRub(expensesThisMonth)}</div><div class="kpi-sub">информационно, см. примечание ниже</div></div>
    <div class="kpi-card"><div class="kpi-label">Средний цикл выполнения</div><div class="kpi-value">${avgCycle !== null ? avgCycle + ' дн.' : '—'}</div><div class="kpi-sub">от постановки до завершения</div></div>
  </div>
</div>

${overdue.length ? `
<div class="section">
  <div class="section-title"><span class="dot" style="background:var(--red)"></span>Что горит — просроченные дедлайны</div>
  <div class="table-wrap"><table class="data-table">
    <thead><tr><th>Блок</th><th>Задача</th><th>Дедлайн</th><th>Стадия</th><th>Ответственный</th></tr></thead>
    <tbody>${overdueRows}</tbody>
  </table></div>
</div>` : ''}

<!-- ═══ Соцсети ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:${CAT_COLOR[CATEGORY.SOCIAL]}"></span>Соцсети</div>
  <div class="kpi-grid" style="margin-top:0">
    <div class="kpi-card"><div class="kpi-label">Публикаций</div><div class="kpi-value">${social.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Просмотры</div><div class="kpi-value">${fmt(socialTotals.views)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Лайки</div><div class="kpi-value">${fmt(socialTotals.likes)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Репосты/пересылки</div><div class="kpi-value">${fmt(socialTotals.shares)}</div></div>
  </div>
  <div class="two-col" style="margin-top:20px">
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Площадка</th><th>Тип</th><th>Публикация</th><th>Дата</th><th class="num">Просмотры</th><th class="num">Лайки</th><th class="num">Репосты</th><th>Стадия</th></tr></thead>
      <tbody>${socialTable()}</tbody>
    </table></div>
    <div class="chart-card"><h3>Стадии</h3>${stageFunnelChart(CATEGORY.SOCIAL, 'chartSocialStages')}</div>
  </div>
</div>

<!-- ═══ Журнал ═══ -->
<div class="section" id="journal-calendar">
  <div class="section-title"><span class="dot" style="background:${CAT_COLOR[CATEGORY.JOURNAL]}"></span>Журнал «Потолкуем?»</div>

  <h3 style="margin:4px 0 8px">Полный календарь статей</h3>
  <div class="table-wrap"><table class="data-table">
    <thead><tr><th>Плановая дата</th><th>Факт. дата</th><th>Статья</th><th>Рубрика</th><th>Копирайтер / стадия</th></tr></thead>
    <tbody>${journalUpcomingRows()}</tbody>
  </table></div>

  <div class="two-col" style="margin-top:20px">
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Статья</th><th>Рубрика</th><th>Копирайтер</th><th>Дата</th><th class="num">Просмотры</th><th>Версии</th><th>Стадия</th></tr></thead>
      <tbody>${journalTable()}</tbody>
    </table></div>
    <div class="chart-card"><h3>Стадии</h3>${stageFunnelChart(CATEGORY.JOURNAL, 'chartJournalStages')}</div>
  </div>

  <h3 style="margin:24px 0 8px">Нагрузка по копирайтерам</h3>
  <div class="table-wrap"><table class="data-table">
    <thead><tr><th>Копирайтер</th><th class="num">Всего статей</th><th class="num">Опубликовано</th><th class="num">В работе</th></tr></thead>
    <tbody>${copywriterRows}</tbody>
  </table></div>
</div>

<!-- ═══ Дизайн ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:${CAT_COLOR[CATEGORY.DESIGN]}"></span>Дизайнерские работы</div>
  <div class="two-col" style="margin-top:0">
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Работа</th><th>Тип</th><th>Проект</th><th>Исполнитель</th><th class="num">Расходы</th><th>Стадия</th></tr></thead>
      <tbody>${designTable()}</tbody>
    </table></div>
    <div class="chart-card"><h3>Стадии</h3>${stageFunnelChart(CATEGORY.DESIGN, 'chartDesignStages')}</div>
  </div>
</div>

<!-- ═══ Съёмки ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:${CAT_COLOR[CATEGORY.SHOOTS]}"></span>Съёмки</div>
  <div class="two-col" style="margin-top:0">
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Работа</th><th>Тип</th><th>Исполнитель</th><th>Дата съёмки</th><th>Объём результата</th><th class="num">Стоимость</th><th>Стадия</th></tr></thead>
      <tbody>${shootsTable()}</tbody>
    </table></div>
    <div class="chart-card"><h3>Стадии</h3>${stageFunnelChart(CATEGORY.SHOOTS, 'chartShootsStages')}</div>
  </div>
</div>

<!-- ═══ Техдоработки сайта ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:${CAT_COLOR[CATEGORY.TECH]}"></span>Техдоработки сайта</div>
  <div class="two-col" style="margin-top:0">
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Что</th><th>Описание</th><th>Исполнитель</th><th>Дата</th><th>Стадия</th></tr></thead>
      <tbody>${techTable()}</tbody>
    </table></div>
    <div class="chart-card"><h3>Стадии</h3>${stageFunnelChart(CATEGORY.TECH, 'chartTechStages')}</div>
  </div>
</div>

<!-- ═══ Расходы сводно ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:var(--orange)"></span>Расходы Дизайн + Съёмки по месяцам</div>
  <div class="chart-card">
    <h3>Сумма, ₽ · итого ${fmtRub(expenseTotal)}</h3>
    <div class="chart-wrap tall"><canvas id="chartExpenses"></canvas></div>
  </div>
  <div class="table-wrap" style="margin-top:20px"><table class="data-table">
    <thead><tr><th>Месяц</th><th>Блок</th><th>Исполнитель</th><th>Работа</th><th class="num">Стоимость</th></tr></thead>
    <tbody>${expenseRows}</tbody>
  </table></div>
  <div class="note">
    Эти цифры — для оперативной видимости Алёны («сколько примерно потратили на съёмки в этом
    месяце»). <b>Источник истины для отчётности — СП «Расходы» / «Реестр платежей»</b> (коды
    13.3 «Дизайнеры, РП, Художники» и 12.4 «Фото/Видео (съёмки)»). Значимая сумма всё равно
    должна попасть туда — поле здесь дублирует для удобства, не заменяет бухгалтерский учёт.
  </div>
</div>

<!-- ═══ Нагрузка ═══ -->
<div class="section">
  <div class="section-title"><span class="dot" style="background:var(--accent)"></span>Нагрузка и трудозатраты</div>
  <div class="two-col">
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Ответственный</th><th class="num">Соцсети</th><th class="num">Журнал</th><th class="num">Дизайн</th><th class="num">Съёмки</th><th class="num">Всего в работе</th></tr></thead>
        <tbody>${workloadRows}</tbody>
      </table>
      <div class="note">Считаются задачи не в терминальной стадии (не «Опубликовано/Готово», не «Отменено») — актуальная загрузка прямо сейчас.</div>
    </div>
    <div class="chart-card">
      <h3>Средний цикл по блокам, дней</h3>
      <div class="chart-wrap"><canvas id="chartCycle"></canvas></div>
      <div class="note">Дни от постановки задачи до перехода в финальную стадию — прямого поля «затраченное время» в блоках Соцсети/Журнал/Дизайн нет (Алёна сочла его лишним), это косвенный показатель длительности, не трудозатрат человека.</div>
    </div>
  </div>
</div>

</div><!-- /container -->

<div class="footer">Потолкуем? · Активность Креативного директора · БюроОБП</div>

<script>
${fmtRubClientSrc}
new Chart(document.getElementById('chartExpenses'), {
  type: 'bar',
  data: { labels: ${expenseChartLabels}, datasets: ${expenseChartDatasets} },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#7b79a0', font: { size: 12 } } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtRub(ctx.raw) } }
    },
    scales: {
      x: { stacked: false, ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: '#7b79a0', callback: v => fmtRub(v) }, grid: { color: '#e0daf7' } }
    }
  }
});
new Chart(document.getElementById('chartCycle'), {
  type: 'bar',
  data: { labels: ${cycleChartLabels}, datasets: [{ data: ${cycleChartData}, backgroundColor: ${cycleChartColors}.map(c => c + '8c'), borderColor: ${cycleChartColors}, borderWidth: 1, borderRadius: 3 }] },
  options: {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + (ctx.raw === null ? 'нет данных' : ctx.raw + ' дн.') } } },
    scales: { x: { ticks: { color: '#7b79a0' }, grid: { color: '#e0daf7' } }, y: { ticks: { color: '#7b79a0', font: { size: 11 } }, grid: { display: false } } }
  }
});
</script>
${bxBootstrap(token)}
</body>
</html>`;
}

module.exports = { renderActivity };
