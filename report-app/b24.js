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
  // a) deals linked to exhibition via PARENT_ID_1048 (employee/Anna deals)
  // b) deals linked to external hosts via PARENT_ID_1052
  const dealSelect = ['ID', 'TITLE', 'OPPORTUNITY', 'CONTACT_ID', 'PARENT_ID_1052', 'CLOSEDATE'];

  const [dealsExh, dealsHosts] = await Promise.all([
    fetchAllDeals({ PARENT_ID_1048: id, CATEGORY_ID: 18 }, dealSelect),
    hostIds.length > 0
      ? fetchAllDeals({ PARENT_ID_1052: hostIds, CATEGORY_ID: 18 }, dealSelect)
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

module.exports = { fetchExhibitionData, fetchExhibitionList, cacheInvalidate };
