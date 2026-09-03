'use strict';
/**
 * render-expenses.js — HTML-рендерер дашборда /report/expenses ("Все расходы компании").
 *
 * Тот же визуальный паттерн, что и /report/realization (единый столбец на месяц, разбитый на
 * цветные сегменты — там склад, здесь категория/подкод кода расхода), плюс переключатель
 * "по направлению": без выбора категории график группирует по 13 укрупнённым категориям
 * справочника кодов расходов, при выборе одной категории — по её подкодам (drill-down).
 *
 * Источник данных и правила отбора — см. expenses-data.js.
 */

const { bxBootstrap } = require('./bx-embed');
const { renderNav, isFinanceViewer } = require('./nav');
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

// basePath + category (+ опционально subcodes) — чтобы переключение периода не сбрасывало
// выбранную категорию/подкоды, и наоборот. subcodes — массив; смена категории их сбрасывает
// (подкоды другой категории теряют смысл), поэтому вызовы без 3-го аргумента их не пишут.
function qs(range, category, subcodes) {
  const p = new URLSearchParams(rangeQueryString(range));
  if (category) p.set('category', category);
  if (subcodes && subcodes.length) subcodes.forEach(s => p.append('subcodes', s));
  return p.toString();
}

function renderPeriodBar(basePath, range, category, subcodes) {
  const buttons = PRESETS.map(p => {
    const active = range.preset === p.key;
    const params = new URLSearchParams({ range: p.key });
    if (category) params.set('category', category);
    if (subcodes && subcodes.length) subcodes.forEach(s => params.append('subcodes', s));
    return `<a class="period-btn${active ? ' active' : ''}" href="${basePath}?${params}">${p.label}</a>`;
  }).join('');
  const subcodeHidden = (subcodes || []).map(s => `<input type="hidden" name="subcodes" value="${escHtml(s)}">`).join('');
  return `<div class="period-bar">
    <div class="period-presets">${buttons}</div>
    <form class="period-custom" method="GET" action="${basePath}">
      ${category ? `<input type="hidden" name="category" value="${escHtml(category)}">` : ''}
      ${subcodeHidden}
      <input type="date" name="from" value="${range.from || ''}">
      <span>—</span>
      <input type="date" name="to" value="${range.to || ''}">
      <button type="submit">Применить</button>
    </form>
    <div class="period-label">Период: ${periodLabel(range)}</div>
  </div>`;
}

function renderCategoryBar(basePath, range, categoryList, selectedKey) {
  const allActive = !selectedKey;
  const allHref = `${basePath}?${qs(range, null)}`;
  const chips = categoryList.map(c => {
    const active = c.key === selectedKey;
    const href = `${basePath}?${qs(range, c.key)}`;
    return `<a class="period-btn${active ? ' active' : ''}" href="${href}">${escHtml(c.label)}</a>`;
  }).join('');
  return `<div class="period-bar" style="margin-top:12px">
    <div class="period-presets" style="flex-wrap:wrap">
      <a class="period-btn${allActive ? ' active' : ''}" href="${allHref}">Все категории</a>
      ${chips}
    </div>
  </div>`;
}

// Мультивыбор подкодов внутри выбранной категории — чекбоксы, GET-форма. Ничего не отмечено =
// «все подкоды» (эквивалент отсутствия фильтра). basePath+category+range пробрасываются
// скрытыми полями, чтобы форма не теряла остальной контекст при отправке.
function renderSubcodeFilter(basePath, range, category, subcodeOptions, selectedSubcodes) {
  if (!category || subcodeOptions.length < 2) return '';
  const rangeHidden = new URLSearchParams(rangeQueryString(range));
  const rangeHiddenHtml = [...rangeHidden.entries()]
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escHtml(v)}">`).join('');
  const checkboxes = subcodeOptions.map(s => {
    const checked = selectedSubcodes.includes(s.key);
    const id = `sub_${escHtml(s.key).replace(/\W/g, '_')}`;
    return `<label for="${id}" class="subcode-check${checked ? ' checked' : ''}">
      <input type="checkbox" id="${id}" name="subcodes" value="${escHtml(s.key)}"${checked ? ' checked' : ''}>
      ${escHtml(s.label)} <span class="subcode-sum">${fmtRub(s.sum)}</span>
    </label>`;
  }).join('');
  const resetHref = `${basePath}?${qs(range, category)}`;
  return `<div class="chart-card" style="margin-top:16px;padding:18px 20px">
    <h3 style="margin-bottom:14px">Выбрать несколько поднаправлений (подкодов) для сравнения</h3>
    <form method="GET" action="${basePath}">
      <input type="hidden" name="category" value="${escHtml(category)}">
      ${rangeHiddenHtml}
      <div class="subcode-grid">${checkboxes}</div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
        <button type="submit" class="period-custom-btn">Показать выбранные</button>
        ${selectedSubcodes.length ? `<a class="period-btn" href="${resetHref}">Сбросить (показать все)</a>` : ''}
      </div>
    </form>
  </div>`;
}

function renderPaymentsTable(payments, paymentsTotal, paymentsLimit) {
  if (!payments.length) return '';
  const rows = payments.map(p => `<tr>
    <td>${escHtml(fmtRuDateFull(p.date) || '—')}</td>
    <td>${escHtml(p.subLabel)}</td>
    <td>${escHtml(p.title)}</td>
    <td class="num">${fmtRub(p.amount)}</td>
    <td><a href="${p.b24Url}" target="_blank" rel="noopener">Открыть в Б24 →</a></td>
  </tr>`).join('');
  const note = paymentsTotal > paymentsLimit
    ? `<div class="note">Показаны последние ${paymentsLimit} из ${fmt(paymentsTotal)} платежей — сузьте период или подкоды, чтобы увидеть остальные.</div>`
    : '';
  return `<div class="section">
    <div class="section-title">Отдельные платежи (${fmt(payments.length)}) — переход в карточку</div>
    <table class="data-table">
      <thead><tr><th>Дата</th><th>Подкод</th><th>Платёж</th><th class="num">Сумма</th><th>Карточка</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${note}
  </div>`;
}

const PALETTE = ['#4a5df9', '#e67e22', '#27ae60', '#c0392b', '#8e44ad', '#16a085', '#7b79a0', '#2aabee', '#c2185b', '#8d6e63', '#607d8b', '#f39c12', '#5d4037', '#546e7a'];

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
  .refresh-btn { font-family: inherit; font-size: 12px; color: #9eabfa; background: transparent; border: 1px solid #3a3460; border-radius: 4px; padding: 8px 14px; cursor: pointer; }
  .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }

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

  .subcode-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px,1fr)); gap: 4px 16px; }
  .subcode-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); padding: 6px 4px; border-radius: 3px; cursor: pointer; }
  .subcode-check:hover { background: #f9f7ff; }
  .subcode-check.checked { color: var(--accent2); font-weight: 600; }
  .subcode-check input[type=checkbox] { accent-color: var(--accent); width: 15px; height: 15px; flex-shrink: 0; }
  .subcode-sum { margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .period-custom-btn { font-family: inherit; font-size: 12px; color: #fff; background: var(--accent); border: 1px solid var(--accent); border-radius: 3px; padding: 8px 16px; cursor: pointer; }
  .period-custom-btn:hover { background: var(--accent2); border-color: var(--accent2); }

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

function renderExpenses(data, viewer, range) {
  const { token, isDirector } = viewer || {};
  const isFinance = isFinanceViewer(viewer);
  const { available, rows, months, segments, categoryList, selectedCategory, subcodeOptions, selectedSubcodes, payments, paymentsTotal, paymentsLimit, totals, updatedAt, error } = data;
  range = range || { preset: 'ytd', from: null, to: null };
  const basePath = '/report/expenses';
  const categoryKey = selectedCategory ? selectedCategory.key : null;

  const updatedStr = updatedAt
    ? new Date(updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  if (!available) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Все расходы · Потолкуем?</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="hero">
  <div class="hero-label">Потолкуем? · Только для ограниченного круга лиц</div>
  <h1>Все расходы компании</h1>
  <div class="hero-sub">Данных пока нет</div>
  <nav class="hero-nav">${renderNav('expensesAll', isDirector, isFinance)}</nav>
</div>
<div class="container">
  <div class="empty">
    <h2>Не удалось получить данные</h2>
    <p>Источник — СП «Реестр платежей» (entityTypeId=1080).
    ${error ? `Ошибка: <code>${escHtml(error)}</code>` : ''}</p>
  </div>
</div>
${bxBootstrap(token)}
</body>
</html>`;
  }

  const segColor = Object.fromEntries(segments.map((s, i) => [s.key, PALETTE[i % PALETTE.length]]));
  const monthTotals = months.map(m => rows.filter(r => r.month === m).reduce((s, r) => s + r.sum, 0));

  const chartLabels = JSON.stringify(months.map(monthLabel));
  const chartDatasets = segments.map((seg, i) => {
    const byMonth = new Map(rows.filter(r => r.key === seg.key).map(r => [r.month, r.sum]));
    const values = months.map(m => Math.round(byMonth.get(m) || 0));
    const color = segColor[seg.key];
    const isLast = i === segments.length - 1;
    const ds = {
      label: seg.label, data: values, backgroundColor: color, borderColor: '#fff', borderWidth: 2,
      stack: 'expenses',
    };
    if (isLast) {
      ds.datalabels = {
        labels: {
          seg: { anchor: 'center', align: 'center', color: '#fff', font: { size: 10, weight: '600' }, textAlign: 'center' },
          total: { anchor: 'end', align: 'end', offset: 6, color: '#1e1a3a', font: { size: 12, weight: '700' } },
        },
      };
    } else {
      ds.datalabels = { anchor: 'center', align: 'center', color: '#fff', font: { size: 10, weight: '600' }, textAlign: 'center' };
    }
    return ds;
  });
  const chartDatasetsJson = JSON.stringify(chartDatasets);
  const segLabelsJson = JSON.stringify(segments.map(s => s.label));

  const tableRows = [...months].reverse().map(m => {
    const monthRows = rows.filter(r => r.month === m).sort((a, b) => b.sum - a.sum);
    const monthTotal = monthRows.reduce((acc, r) => acc + r.sum, 0);
    return monthRows.map((r, i) => `<tr>
      ${i === 0 ? `<td rowspan="${monthRows.length}" style="vertical-align:top;font-weight:600">${escHtml(monthLabel(m))}</td>` : ''}
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${segColor[r.key]};margin-right:8px"></span>${escHtml(r.label)}</td>
      <td class="num">${fmt(r.count)}</td>
      <td class="num" style="color:var(--orange)">${fmtRub(r.sum)}</td>
      ${i === 0 ? `<td rowspan="${monthRows.length}" class="num" style="vertical-align:top;color:var(--muted)">${fmtRub(monthTotal)}</td>` : ''}
    </tr>`).join('');
  }).join('');

  const drillTitle = selectedCategory
    ? `${escHtml(selectedCategory.label)} — по подкодам`
    : 'по укрупнённым категориям кода расхода';
  const backLink = selectedCategory
    ? `<a class="period-btn" href="${basePath}?${qs(range, null)}" style="margin-bottom:16px;display:inline-block">← Ко всем категориям</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Все расходы · Потолкуем?</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script>
<style>${BASE_CSS}</style>
</head>
<body>

<div class="hero">
  <div class="hero-label">Потолкуем? · Только для ограниченного круга лиц</div>
  <h1>Все расходы компании</h1>
  <div class="hero-sub">СП «Реестр платежей» · по коду расхода · ${totals.count} записей</div>
  <nav class="hero-nav">
    ${renderNav('expensesAll', isDirector, isFinance)}
    <form method="POST" action="/report/expenses/refresh?${qs(range, categoryKey)}" style="margin-left:0">
      <button class="refresh-btn" type="submit">Обновить данные</button>
    </form>
    <span class="fetched-at">обновлено ${updatedStr}</span>
  </nav>
</div>

<div class="container">

${renderPeriodBar(basePath, range, categoryKey, selectedSubcodes)}
${renderCategoryBar(basePath, range, categoryList, categoryKey)}
${renderSubcodeFilter(basePath, range, categoryKey, subcodeOptions, selectedSubcodes)}

<div class="section" style="margin-top:32px">
  <div class="kpi-grid">
    <div class="kpi-card orange">
      <div class="kpi-label">Расходы за период</div>
      <div class="kpi-value">${fmtRub(totals.sum)}</div>
      <div class="kpi-sub">${months.length} мес. в разбивке</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Платежей</div>
      <div class="kpi-value">${fmt(totals.count)}</div>
      <div class="kpi-sub">${selectedCategory ? escHtml(selectedCategory.label) : 'по всем категориям'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${selectedCategory ? 'Подкодов в разбивке' : 'Категорий в разбивке'}</div>
      <div class="kpi-value">${segments.length}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Расходы по месяцам — ${drillTitle}</div>
  ${backLink}
  <div class="chart-card">
    <h3>Сумма расходов, ₽ — с итогом месяца</h3>
    <div class="chart-wrap"><canvas id="chartExpenses"></canvas></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Таблица по месяцам</div>
  <table class="data-table">
    <thead><tr><th>Месяц</th><th>${selectedCategory ? 'Подкод' : 'Категория'}</th><th class="num">Платежей</th><th class="num">Сумма</th><th class="num">Итого за месяц</th></tr></thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Итого за период</td>
        <td class="num">${fmt(totals.count)}</td>
        <td class="num" colspan="2">${fmtRub(totals.sum)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="note">
    Источник — СП «Реестр платежей» (entityTypeId=1080), поле «Код» → справочник кодов расходов.
    Учитываются только стадии «Последние проведенные платежи» и «Архив проведенных платежей» —
    черновики, согласование и отменённые платежи в отчёт не входят. Дата платежа — поле
    <code>begindate</code> (не <code>closedate</code>, которое перезаписывается автоматически).
    Клик по категории выше — переход к разбивке по её подкодам.
  </div>
</div>

${renderPaymentsTable(payments, paymentsTotal, paymentsLimit)}

</div><!-- /container -->

<div class="footer">Потолкуем? · Все расходы · БюроОБП</div>

<script>
${fmtRubClientSrc}
(function() {
  const segLabels = ${segLabelsJson};
  const monthTotals = ${JSON.stringify(monthTotals.map(v => Math.round(v)))};
  const datasets = ${chartDatasetsJson};
  function wrapLabel(text, maxLen) {
    const words = text.trim().split(/\\s+/);
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
  datasets.forEach((ds, dsIdx) => {
    const isLast = dsIdx === datasets.length - 1;
    const segFormatter = (v, ctx) => (v / (monthTotals[ctx.dataIndex] || 1) > 0.06 ? wrapLabel(segLabels[ctx.datasetIndex], 16) : '');
    if (isLast) {
      ds.datalabels.labels.seg.formatter = segFormatter;
      ds.datalabels.labels.total.formatter = (v, ctx) => fmtRub(monthTotals[ctx.dataIndex]);
    } else {
      ds.datalabels.formatter = segFormatter;
    }
  });

  new Chart(document.getElementById('chartExpenses'), {
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

module.exports = { renderExpenses };
