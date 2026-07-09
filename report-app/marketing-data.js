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

// СП «Расходы» (entityTypeId=1070)
// UF_CRM_24_DIRECTION enum ID: 224=Выставки, 226=Маркетинг, 228=Операционные
const EXPENSE_ENTITY_TYPE_ID = 1070;
const DIRECTION_MARKETING_ID = '226';

const CACHE_TTL = 10 * 60 * 1000; // 10 минут
let _cache = null;
let _cacheTs = 0;

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

// ── Expenses (Расходы, маркетинговые) ─────────────────────────────────────────
async function fetchMarketingExpenses() {
  // Сначала пробуем расходы с Direction=Маркетинг
  const tagged = await fetchAllItems(EXPENSE_ENTITY_TYPE_ID,
    { ufCrm24Direction: DIRECTION_MARKETING_ID },
    ['id', 'title', 'ufCrm24ExpenseType', 'ufCrm24Description', 'ufCrm24Amount',
     'ufCrm24Direction', 'ufCrm24Channel', 'parentId1048', 'begindate']
  );

  // Если ещё ничего не размечено — показываем расходы без parentId1048 (не выставочные)
  // Это служит подсказкой для разметки
  if (tagged.length === 0) {
    const unlinked = await fetchAllItems(EXPENSE_ENTITY_TYPE_ID,
      { '=parentId1048': null },
      ['id', 'title', 'ufCrm24ExpenseType', 'ufCrm24Description', 'ufCrm24Amount',
       'ufCrm24Direction', 'ufCrm24Channel', 'parentId1048', 'begindate']
    );
    return { expenses: unlinked, isTagged: false };
  }
  return { expenses: tagged, isTagged: true };
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

// ── Latest SEO snapshot for Webmaster top queries ─────────────────────────────
function loadLatestSnapshot() {
  try {
    if (!fs.existsSync(SEO_DIR)) return null;
    const files = fs.readdirSync(SEO_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();
    if (!files.length) return null;
    const latest = files[files.length - 1];
    return JSON.parse(fs.readFileSync(path.join(SEO_DIR, latest), 'utf8'));
  } catch (e) {
    console.error('[marketing-data] snapshot read error:', e.message);
    return null;
  }
}

// ── Main aggregator ───────────────────────────────────────────────────────────
async function fetchMarketingData() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  // Fetch all platform stats items + marketing expenses in parallel
  const [raw, expensesData] = await Promise.all([
    fetchAllItems(ENTITY_TYPE_ID, {}, [
      'id', 'title',
      pf('Platform'), pf('Period'),
      pf('Followers'), pf('FollowersDiff'), pf('Er'), pf('Reach'),
      pf('VisitsTotal'), pf('VisitsOrganic'), pf('VisitsPaid'), pf('BounceRate'),
      pf('Clicks'), pf('Impressions'), pf('BrandDemand'),
    ]),
    fetchMarketingExpenses(),
  ]);

  const items    = raw.map(parseItem);
  const platforms = groupByPlatform(items);

  // Latest snapshot for Webmaster top queries
  const snap       = loadLatestSnapshot();
  const topQueries = snap?.webmaster?.rows?.slice(0, 20) || [];
  const snapDate   = snap?.date || null;

  // Wordstat history — use brand history from latest snapshot as fallback
  // (СП данные приоритетнее — они уже в platforms['Wordstat_потолкуем'])
  const wordstatHistory = snap?.wordstat?.brand_history || [];

  // Enrich expenses with B24 link
  const expenses = expensesData.expenses.map(e => ({
    ...e,
    amount: parseFloat(e.ufCrm24Amount || 0),
    b24Url: `${B24_URL}/crm/type/1070/details/${e.id}/`,
  }));
  expenses.sort((a, b) => b.amount - a.amount);

  _cache   = {
    platforms, topQueries, snapDate, wordstatHistory,
    expenses, expensesTagged: expensesData.isTagged,
    fetchedAt: new Date().toISOString(),
  };
  _cacheTs = Date.now();
  return _cache;
}

function cacheInvalidateMarketing() {
  _cache   = null;
  _cacheTs = 0;
}

module.exports = { fetchMarketingData, cacheInvalidateMarketing };
