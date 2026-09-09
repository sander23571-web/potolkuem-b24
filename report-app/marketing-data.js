'use strict';
/**
 * marketing-data.js — фетчер данных для дашборда /report/marketing
 *
 * Источники:
 *   1. Б24 СП «Статистика площадок» (entityTypeId=1074) — все записи
 *   2. SEO-снапшот последнего файла — топ органических запросов Вебмастера
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const WEBHOOK       = process.env.B24_WEBHOOK;
const B24_URL       = 'https://potolkuem.bitrix24.ru';
const ENTITY_TYPE_ID = 1074;  // СП «Статистика площадок»
const TYPE_ID        = 28;
const SEO_DIR        = '/root/projects/talk-report/data/seo';

// СП «Реестр платежей» (entityTypeId=1080) — с 09.09.2026 основной источник расходов дашборда.
// Раньше брали СП «Расходы» (1070, direction=Маркетинг) — узкий ручной срез (176 записей,
// только рекламные каналы). 1080 — полная банковская выписка + ручной ввод, классифицирована по
// «Справочнику кодов расходов» (IBLOCK_ID=32). Граница «что считать маркетингом» и правки кодов —
// см. analytics/marketing-dashboard-svjazka-reestr-2026-09.md. Код 13.8 «Прочее» (мусорная
// корзина, преимущественно стройка/благоустройство) и коды 13.3/13.4/13.7 (COGS игр — иллюстраторы/
// тираж/сигнальные образцы) сознательно НЕ входят в маркетинг. Коды 12.1/12.6 (Выставки/Ведущие) —
// отдельное направление, тоже не входят.
const REGISTRY_ENTITY_TYPE_ID = 1080;
const CODE_FIELD = 'ufCrm32Code';

// iblock element id (Справочник кодов расходов) → { group, label }
const MARKETING_CODES = {
  216: { group: '11.1', label: 'Кабинеты СМБ' },
  218: { group: '11.2', label: 'Кабинеты ВК' },
  220: { group: '11.3', label: 'Кабинеты Телекот' },
  222: { group: '11.4', label: 'Агентство' },
  224: { group: '11.5', label: 'Разработка сайта' },
  226: { group: '11.6', label: 'Прочая реклама' },
  254: { group: '11.7', label: 'Журнал (контент)' },
  230: { group: '12.2', label: 'Блогеры' },
  232: { group: '12.3', label: 'Журналы' },
  234: { group: '12.4', label: 'Фото/Видео' },
  236: { group: '12.5', label: 'PR/Радио' },
  238: { group: '13.1', label: 'Ролики (PreRoll)' },
  240: { group: '13.2', label: 'Копирайтер' },
  246: { group: '13.5', label: 'Мерч' },
  248: { group: '13.6', label: 'Типографии (лифлеты)' },
};
const MARKETING_CODE_IDS = Object.keys(MARKETING_CODES).map(Number);

// Отдельная палитра под коды (переиспользует конвенцию из render-expenses.js)
const MARKETING_PALETTE = ['#4a5df9', '#e67e22', '#27ae60', '#c0392b', '#8e44ad', '#16a085',
  '#7b79a0', '#2aabee', '#c2185b', '#8d6e63', '#607d8b', '#f39c12', '#5d4037', '#546e7a', '#00838f'];
const MARKETING_COLORS = {};
Object.keys(MARKETING_CODES).forEach((id, i) => {
  MARKETING_COLORS[id] = MARKETING_PALETTE[i % MARKETING_PALETTE.length];
});

const CACHE_TTL = 10 * 60 * 1000; // 10 минут

// ── B24 helper ────────────────────────────────────────────────────────────────
async function b24(method, params = {}) {
  const r = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function fetchAllItems(entityTypeId, filter = {}, select = []) {
  const items = [];
  let start = 0;
  while (true) {
    const res = await b24('crm.item.list', { entityTypeId, filter, select, start });
    const batch = res?.result?.items || [];
    items.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return items;
}

// ── Field name helpers ────────────────────────────────────────────────────────
// Битрикс возвращает UF-поля в camelCase: ufCrm28Platform, ufCrm28Period и т.д.
const pf = (suffix) => `ufCrm${TYPE_ID}${suffix}`;

function parseItem(item) {
  return {
    id:           item.id,
    title:        item.title || '',
    platform:     item[pf('Platform')] || '',
    period:       (item[pf('Period')] || '').slice(0, 10),  // YYYY-MM-DD → YYYY-MM-DD
    followers:    parseInt(item[pf('Followers')]) || 0,
    followersDiff:parseInt(item[pf('FollowersDiff')]) || 0,
    er:           parseFloat(item[pf('Er')]) || null,
    reach:        parseInt(item[pf('Reach')]) || 0,
    visitsTotal:  parseInt(item[pf('VisitsTotal')]) || 0,
    visitsOrganic:parseInt(item[pf('VisitsOrganic')]) || 0,
    visitsPaid:   parseInt(item[pf('VisitsPaid')]) || 0,
    bounceRate:   parseFloat(item[pf('BounceRate')]) || null,
    clicks:       parseInt(item[pf('Clicks')]) || 0,
    impressions:  parseInt(item[pf('Impressions')]) || 0,
    brandDemand:  parseInt(item[pf('BrandDemand')]) || 0,
    spend:        parseFloat(item[pf('Spend')]) || 0,
    purchases:    parseInt(item[pf('Purchases')]) || 0,
    revenue:      parseFloat(item[pf('Revenue')]) || 0,
    // Корзина/заказ по ВСЕМУ трафику сайта (агрегат Метрики, не сумма по кампаниям
    // СП 1094 — та сумма занижает в разы, см. proj log talk 25.08.2026). Заполнено
    // только у платформы "Метрика_сайт".
    siteCart:     parseInt(item[pf('SiteCart')]) || 0,
    siteOrders:   parseInt(item[pf('SiteOrders')]) || 0,
    b24Url:       `${B24_URL}/crm/type/${ENTITY_TYPE_ID}/details/${item.id}/`,
  };
}

// ── Group by platform → sorted by period ─────────────────────────────────────
function groupByPlatform(items) {
  const map = {};
  for (const item of items) {
    const plat = item.platform || 'unknown';
    if (!map[plat]) map[plat] = [];
    map[plat].push(item);
  }
  // Sort each platform's records by period asc
  for (const plat of Object.keys(map)) {
    map[plat].sort((a, b) => a.period.localeCompare(b.period));
  }
  return map;
}

// ── SEO snapshots ─────────────────────────────────────────────────────────────
// Загружаем всю историю снапшотов — фильтрация по периоду делается позже, при рендере.
function loadSnapshotHistory() {
  try {
    if (!fs.existsSync(SEO_DIR)) return [];
    const files = fs.readdirSync(SEO_DIR).filter(f => f.endsWith('.json')).sort();
    return files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SEO_DIR, f), 'utf8')); }
      catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('[marketing-data] snapshot error:', e.message);
    return [];
  }
}

// ── Период: фильтр списков по полю с датой YYYY-MM-DD ────────────────────────
function filterByRange(list, from, to, field) {
  if (!from && !to) return list;
  return list.filter(x => {
    const v = x[field];
    if (!v) return true; // без даты — не выбрасываем
    if (from && v < from) return false;
    if (to && v > to) return false;
    return true;
  });
}

// Самые динамичные запросы: сравниваем позиции первого и последнего снапшота
function computeQueryDynamics(snapshots) {
  if (snapshots.length < 2) return null;
  const latest   = snapshots[snapshots.length - 1];
  const baseline = snapshots[0];
  const baseMap  = {};
  for (const row of (baseline.webmaster?.rows || [])) {
    baseMap[row.query] = row.position;
  }
  const dynamics = [];
  for (const row of (latest.webmaster?.rows || [])) {
    const basePos = baseMap[row.query];
    if (basePos === undefined) continue;
    const delta = Math.round((basePos - row.position) * 10) / 10; // + = поднялся в выдаче
    dynamics.push({
      query:   row.query,
      posNow:  Math.round(row.position * 10) / 10,
      posBase: Math.round(basePos * 10) / 10,
      delta,
      clicks:  row.clicks || 0,
    });
  }
  return {
    gainers:  [...dynamics].sort((a, b) => b.delta - a.delta).filter(d => d.delta > 0).slice(0, 8),
    losers:   [...dynamics].sort((a, b) => a.delta - b.delta).filter(d => d.delta < 0).slice(0, 8),
    weeks:    snapshots.length - 1,
    dateFrom: baseline.date || '',
    dateTo:   latest.date || '',
  };
}

// ── Raw cache (без учёта периода) — фильтрация по диапазону идёт при каждом запросе ─
let _rawCache   = null;
let _rawCacheTs = 0;

async function fetchRawMarketing() {
  if (_rawCache && Date.now() - _rawCacheTs < CACHE_TTL) return _rawCache;

  const raw = await fetchAllItems(ENTITY_TYPE_ID, {}, [
    'id', 'title',
    pf('Platform'), pf('Period'),
    pf('Followers'), pf('FollowersDiff'), pf('Er'), pf('Reach'),
    pf('VisitsTotal'), pf('VisitsOrganic'), pf('VisitsPaid'), pf('BounceRate'),
    pf('Clicks'), pf('Impressions'), pf('BrandDemand'), pf('Spend'),
    pf('Purchases'), pf('Revenue'), pf('SiteCart'), pf('SiteOrders'),
  ]);

  _rawCache   = { items: raw.map(parseItem), snapshots: loadSnapshotHistory() };
  _rawCacheTs = Date.now();
  return _rawCache;
}

// ── Main aggregator (платформенная статистика — без расходов) ─────────────────
// range: { from: 'YYYY-MM-DD'|null, to: 'YYYY-MM-DD'|null }
async function fetchMarketingData(range = {}) {
  const { from = null, to = null } = range;
  const { items, snapshots } = await fetchRawMarketing();

  const filteredItems = filterByRange(items, from, to, 'period');
  const platforms      = groupByPlatform(filteredItems);

  const filteredSnapshots = filterByRange(snapshots, from, to, 'date');
  const snap             = filteredSnapshots[filteredSnapshots.length - 1] || null;
  const topQueries       = snap?.webmaster?.rows?.slice(0, 20) || [];
  const snapDate         = snap?.date || null;
  const wordstatHistory  = snap?.wordstat?.brand_history || [];
  const queryDynamics    = computeQueryDynamics(filteredSnapshots);

  // Текущие значения конкурентов из последнего снапшота (wordstat.current).
  // При ошибке API сохраняется строка 'error: ...' — фильтруем только числа.
  const rawCompetitors = snap?.wordstat?.current || {};
  const wordstatCompetitors = Object.fromEntries(
    Object.entries(rawCompetitors).filter(([, v]) => typeof v === 'number' && v > 0)
  );

  return {
    platforms, topQueries, snapDate, wordstatHistory, queryDynamics, wordstatCompetitors,
    range,
    fetchedAt: new Date().toISOString(),
  };
}

function cacheInvalidateMarketing() {
  _rawCache   = null;
  _rawCacheTs = 0;
}

// ── Marketing expenses — отдельный фетчер для страницы руководства ────────────
// Источник — СП «Реестр платежей» (1080), см. константы MARKETING_CODES выше.

let _rawExpCache   = null;
let _rawExpCacheTs = 0;

async function fetchRawExpenses() {
  if (_rawExpCache && Date.now() - _rawExpCacheTs < CACHE_TTL) return _rawExpCache;

  const raw = await fetchAllItems(REGISTRY_ENTITY_TYPE_ID,
    { [CODE_FIELD]: MARKETING_CODE_IDS },
    ['id', 'title', 'opportunity', CODE_FIELD, 'begindate']
  );

  _rawExpCache = raw.map(e => {
    const codeId = e[CODE_FIELD] ? String(e[CODE_FIELD]) : null;
    const meta   = codeId ? MARKETING_CODES[codeId] : null;
    // begindate — авторитетное поле даты платежа в 1080 (НЕ closedate — оно перезаписывается
    // текущей датой при переходе записи в SUCCESS, см. talk/CLAUDE.md, раздел «СП Реестр платежей»).
    const date = e.begindate ? e.begindate.slice(0, 10) : null;
    return {
      id:           e.id,
      title:        e.title || '',
      description:  '',
      amount:       parseFloat(e.opportunity || 0),
      channel:      meta ? meta.group : (codeId || 'other'),
      channelLabel: meta ? meta.label : 'Другое',
      date,
      month:        date ? date.slice(0, 7) : null,
      b24Url:       `${B24_URL}/crm/type/1080/details/${e.id}/`,
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  _rawExpCacheTs = Date.now();
  return _rawExpCache;
}

// range: { from: 'YYYY-MM-DD'|null, to: 'YYYY-MM-DD'|null }
async function fetchMarketingExpensesData(range = {}) {
  const { from = null, to = null } = range;
  const all      = await fetchRawExpenses();
  const expenses = filterByRange(all, from, to, 'date');

  // Агрегация по каналам
  const byChannel = {};
  for (const e of expenses) {
    if (!byChannel[e.channel]) {
      byChannel[e.channel] = { label: e.channelLabel, total: 0, count: 0 };
    }
    byChannel[e.channel].total += e.amount;
    byChannel[e.channel].count++;
  }

  // Агрегация по месяцам (+ разбивка по каналам внутри месяца — для стек-графика)
  const byMonth = {};
  for (const e of expenses) {
    if (!e.month) continue;
    if (!byMonth[e.month]) byMonth[e.month] = { total: 0, byChannel: {} };
    byMonth[e.month].total += e.amount;
    byMonth[e.month].byChannel[e.channel] = (byMonth[e.month].byChannel[e.channel] || 0) + e.amount;
  }

  const total        = expenses.reduce((s, e) => s + e.amount, 0);
  const currentYear  = new Date().getFullYear().toString();
  const currentMonth = new Date().toISOString().slice(0, 7);
  // totalYear/totalMonth — фиксированные ориентиры (весь текущий год/месяц), не зависят от выбранного периода
  const totalYear    = all
    .filter(e => e.date && e.date.startsWith(currentYear))
    .reduce((s, e) => s + e.amount, 0);
  const totalMonth   = all
    .filter(e => e.month === currentMonth)
    .reduce((s, e) => s + e.amount, 0);

  return {
    expenses, byChannel, byMonth, total, totalYear, totalMonth,
    range,
    fetchedAt: new Date().toISOString(),
  };
}

function cacheInvalidateExpenses() {
  _rawExpCache   = null;
  _rawExpCacheTs = 0;
}

// ── Кампании Директ — статистика (entityTypeId=1094) ───────────────────────────

const CAMPAIGNS_ENTITY_TYPE_ID = 1094;
const CAMPAIGNS_TYPE_ID        = 38;
const cf = (suffix) => `ufCrm${CAMPAIGNS_TYPE_ID}${suffix}`;

function parseCampaignItem(item) {
  return {
    id:              item.id,
    campaign:        item[cf('Campaign')] || '',
    campaignId:      item[cf('CampaignId')] || '',
    period:          (item[cf('Period')] || '').slice(0, 10),
    impressions:     parseInt(item[cf('Impressions')]) || 0,
    clicks:          parseInt(item[cf('Clicks')]) || 0,
    cost:            parseFloat(item[cf('Cost')]) || 0,
    visits:          parseInt(item[cf('Visits')]) || 0,
    bounceRate:      item[cf('BounceRate')] != null ? parseFloat(item[cf('BounceRate')]) : null,
    cartAdds:        parseInt(item[cf('CartAdds')]) || 0,
    orders:          parseInt(item[cf('Orders')]) || 0,
    paymentReturns:  parseInt(item[cf('PaymentReturns')]) || 0,
    b24Url:          `${B24_URL}/crm/type/${CAMPAIGNS_ENTITY_TYPE_ID}/details/${item.id}/`,
  };
}

let _rawCampCache   = null;
let _rawCampCacheTs = 0;

async function fetchRawCampaigns() {
  if (_rawCampCache && Date.now() - _rawCampCacheTs < CACHE_TTL) return _rawCampCache;

  const raw = await fetchAllItems(CAMPAIGNS_ENTITY_TYPE_ID, {}, [
    'id', cf('Campaign'), cf('CampaignId'), cf('Period'),
    cf('Impressions'), cf('Clicks'), cf('Cost'),
    cf('Visits'), cf('BounceRate'), cf('CartAdds'), cf('Orders'), cf('PaymentReturns'),
  ]);

  _rawCampCache   = raw.map(parseCampaignItem);
  _rawCampCacheTs = Date.now();
  return _rawCampCache;
}

// range: { from: 'YYYY-MM-DD'|null, to: 'YYYY-MM-DD'|null }
async function fetchCampaignsData(range = {}) {
  const { from = null, to = null } = range;
  const all = await fetchRawCampaigns();
  const filtered = filterByRange(all, from, to, 'period');

  // Группировка по кампании, сортировка по периоду
  const byCampaign = {};
  for (const item of filtered) {
    const key = item.campaign || 'unknown';
    if (!byCampaign[key]) byCampaign[key] = [];
    byCampaign[key].push(item);
  }
  for (const key of Object.keys(byCampaign)) {
    byCampaign[key].sort((a, b) => a.period.localeCompare(b.period));
  }

  // Сводка по кампании за весь выбранный период (для таблицы/карточек)
  const summary = Object.entries(byCampaign).map(([campaign, items]) => {
    const totalCost   = items.reduce((s, i) => s + i.cost, 0);
    const totalVisits = items.reduce((s, i) => s + i.visits, 0);
    const totalCart   = items.reduce((s, i) => s + i.cartAdds, 0);
    const totalOrders = items.reduce((s, i) => s + i.orders, 0);
    const totalPay    = items.reduce((s, i) => s + i.paymentReturns, 0);
    const totalClicks = items.reduce((s, i) => s + i.clicks, 0);
    const last = items[items.length - 1];
    return {
      campaign, months: items.length,
      totalCost, totalVisits, totalClicks, totalCart, totalOrders, totalPay,
      cartRate: totalVisits ? totalCart / totalVisits * 100 : 0,
      lastPeriod: last?.period || null,
      b24Url: last?.b24Url || null,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  return {
    byCampaign, summary,
    range,
    fetchedAt: new Date().toISOString(),
  };
}

function cacheInvalidateCampaigns() {
  _rawCampCache   = null;
  _rawCampCacheTs = 0;
}

module.exports = {
  fetchMarketingData, cacheInvalidateMarketing,
  fetchMarketingExpensesData, cacheInvalidateExpenses,
  fetchCampaignsData, cacheInvalidateCampaigns,
};
