require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK = process.env.B24_WEBHOOK;
const B24_URL = 'https://potolkuem.bitrix24.ru';

// ── In-memory cache (per exhibition id, TTL 5 min) ───────────────────────────
const cache = new Map(); // key: exhibitionId, value: { data, ts }
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(id);
    return null;
  }
  return entry.data;
}

function cacheSet(id, data) {
  cache.set(id, { data, ts: Date.now() });
}

function cacheInvalidate(id) {
  cache.delete(id);
}

// ── Raw API call ──────────────────────────────────────────────────────────────
async function b24(method, params = {}) {
  const res = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// ── Fetch all pages of crm.item.list ─────────────────────────────────────────
async function fetchAllItems(entityTypeId, filter = {}, select = []) {
  const items = [];
  let start = 0;
  while (true) {
    const res = await b24('crm.item.list', {
      entityTypeId,
      filter,
      select,
      start,
    });
    const batch = res?.result?.items || [];
    items.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return items;
}

// ── Fetch all pages of crm.deal.list ─────────────────────────────────────────
async function fetchAllDeals(filter = {}, select = []) {
  const items = [];
  let start = 0;
  while (true) {
    const res = await b24('crm.deal.list', { filter, select, start });
    const batch = res?.result || [];
    items.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return items;
}

// ── Main aggregator ───────────────────────────────────────────────────────────
async function fetchExhibitionData(id) {
  const cached = cacheGet(id);
  if (cached) return cached;

  // 1. Exhibition record
  const exhRes = await b24('crm.item.get', { entityTypeId: 1048, id });
  const exhibition = exhRes?.result?.item || {};

  // 2. Expenses (entityTypeId 1070, parentId1048 = id)
  const expenses = await fetchAllItems(
    1070,
    { parentId1048: id },
    ['id', 'title', 'ufCrm24ExpenseType', 'ufCrm24Amount', 'ufCrm24DocumentDate']
  );

  // 3. Shifts (entityTypeId 1056, parentId1048 = id)
  const shifts = await fetchAllItems(
    1056,
    { parentId1048: id },
    ['id', 'title', 'parentId1052', 'begindate']
  );

  // 4. Host ids from shifts
  const hostIds = [...new Set(
    shifts.map(s => s.parentId1052).filter(Boolean)
  )];

  // 5. Hosts (entityTypeId 1052)
  let hosts = [];
  if (hostIds.length > 0) {
    hosts = await fetchAllItems(
      1052,
      { id: hostIds },
      ['id', 'title']
    );
  }
  const hostMap = Object.fromEntries(hosts.map(h => [String(h.id), h.title]));

  // 6. Deals — two queries in parallel
  // a) deals linked to exhibition via PARENT_ID_1048
  //    (работает если при создании сделки был вызван crm.deal.update с uppercase-ключом)
  // b) deals linked to external hosts via PARENT_ID_1052
  //    фильтруем по датам выставки чтобы не тащить сделки других выставок
  const dealSelect = ['ID', 'TITLE', 'OPPORTUNITY', 'CONTACT_ID', 'PARENT_ID_1052', 'CLOSEDATE'];

  // Даты выставки для фильтра сделок ведущих
  const exhBegin = exhibition.begindate ? exhibition.begindate.slice(0, 10) : null;
  const exhEnd   = (exhibition.closedate || exhibition.begindate)
    ? (exhibition.closedate || exhibition.begindate).slice(0, 10)
    : null;

  const hostDealFilter = { PARENT_ID_1052: hostIds, CATEGORY_ID: 18 };
  if (exhBegin) hostDealFilter['>=CLOSEDATE'] = exhBegin;
  if (exhEnd)   hostDealFilter['<=CLOSEDATE'] = exhEnd;

  const [dealsExh, dealsHosts] = await Promise.all([
    fetchAllDeals({ PARENT_ID_1048: id, CATEGORY_ID: 18 }, dealSelect),
    hostIds.length > 0
      ? fetchAllDeals(hostDealFilter, dealSelect)
      : Promise.resolve([]),
  ]);

  // Merge and deduplicate by ID
  const dealMap = new Map();
  for (const d of [...dealsExh, ...dealsHosts]) {
    dealMap.set(d.ID, d);
  }
  const deals = [...dealMap.values()];

  const data = {
    exhibition,
    expenses,
    shifts,
    hostMap,
    deals,
    fetchedAt: new Date().toISOString(),
    b24Url: B24_URL,
  };

  cacheSet(id, data);
  return data;
}

// ── List all exhibitions ──────────────────────────────────────────────────────
async function fetchExhibitionList() {
  return fetchAllItems(
    1048,
    {},
    ['id', 'title', 'begindate', 'closedate']
  );
}

// Уже состоявшиеся (begindate <= сегодня) — сначала, самая недавняя первой.
// Ещё не начавшиеся — в конце, ближайшая из них первой. Так на странице
// «Выставки» впереди не оказываются выставки без данных.
function sortExhibitionsRecentFirst(list) {
  const today = new Date().toISOString().slice(0, 10);
  const started  = list.filter(e => (e.begindate || '').slice(0, 10) <= today)
    .sort((a, b) => (b.begindate || '').localeCompare(a.begindate || ''));
  const upcoming = list.filter(e => (e.begindate || '').slice(0, 10) > today)
    .sort((a, b) => (a.begindate || '').localeCompare(b.begindate || ''));
  return [...started, ...upcoming];
}

// ── Lightweight summary for comparison page ───────────────────────────────────
async function fetchExhibitionSummary(id) {
  // Reuse full cache if available
  const full = cacheGet(id);
  if (full) {
    return {
      revenue:   full.deals.reduce((s, d) => s + parseFloat(d.OPPORTUNITY || 0), 0),
      expenses:  full.expenses.reduce((s, e) => s + parseFloat(e.ufCrm24Amount || 0), 0),
      dealCount: full.deals.length,
    };
  }
  // Light fetch (только выручка через прямую связь с выставкой + расходы)
  const summaryKey = 'sum_' + id;
  const cached = cacheGet(summaryKey);
  if (cached) return cached;

  const [expensesRaw, dealsRaw] = await Promise.all([
    fetchAllItems(1070, { parentId1048: id }, ['ufCrm24Amount']),
    fetchAllDeals({ PARENT_ID_1048: id, CATEGORY_ID: 18 }, ['OPPORTUNITY']),
  ]);
  const summary = {
    revenue:   dealsRaw.reduce((s, d) => s + parseFloat(d.OPPORTUNITY || 0), 0),
    expenses:  expensesRaw.reduce((s, e) => s + parseFloat(e.ufCrm24Amount || 0), 0),
    dealCount: dealsRaw.length,
  };
  cacheSet(summaryKey, summary);
  return summary;
}

// ── Summaries for all exhibitions (parallel) ──────────────────────────────────
async function fetchAllSummaries() {
  const exhibitions = await fetchExhibitionList();
  const pairs = await Promise.all(
    exhibitions.map(async e => [e.id, await fetchExhibitionSummary(e.id)])
  );
  return {
    exhibitions,
    summaries: Object.fromEntries(pairs),
  };
}

module.exports = { fetchExhibitionData, fetchExhibitionList, cacheInvalidate, fetchAllSummaries, sortExhibitionsRecentFirst };
