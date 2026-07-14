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

// ── SEO snapshots ─────────────────────────────────────────────────────────────
function loadSnapshotHistory(n = 6) {
  try {
    if (!fs.existsSync(SEO_DIR)) return [];
    const files = fs.readdirSync(SEO_DIR).filter(f => f.endsWith('.json')).sort();
    return files.slice(-n).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SEO_DIR, f), 'utf8')); }
      catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) {
    console.error('[marketing-data] snapshot error:', e.message);
    return [];
  }
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

// ── Main aggregator (платформенная статистика — без расходов) ─────────────────
async function fetchMarketingData() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const raw = await fetchAllItems(ENTITY_TYPE_ID, {}, [
    'id', 'title',
    pf('Platform'), pf('Period'),
    pf('Followers'), pf('FollowersDiff'), pf('Er'), pf('Reach'),
    pf('VisitsTotal'), pf('VisitsOrganic'), pf('VisitsPaid'), pf('BounceRate'),
    pf('Clicks'), pf('Impressions'), pf('BrandDemand'),
  ]);

  const items     = raw.map(parseItem);
  const platforms = groupByPlatform(items);

  const snapshots       = loadSnapshotHistory(6);
  const snap            = snapshots[snapshots.length - 1] || null;
  const topQueries      = snap?.webmaster?.rows?.slice(0, 20) || [];
  const snapDate        = snap?.date || null;
  const wordstatHistory = snap?.wordstat?.brand_history || [];
  const queryDynamics   = computeQueryDynamics(snapshots);

  // Текущие значения конкурентов из последнего снапшота (wordstat.current).
  // При ошибке API сохраняется строка 'error: ...' — фильтруем только числа.
  const rawCompetitors = snap?.wordstat?.current || {};
  const wordstatCompetitors = Object.fromEntries(
    Object.entries(rawCompetitors).filter(([, v]) => typeof v === 'number' && v > 0)
  );

  _cache   = { platforms, topQueries, snapDate, wordstatHistory, queryDynamics, wordstatCompetitors, fetchedAt: new Date().toISOString() };
  _cacheTs = Date.now();
  return _cache;
}

function cacheInvalidateMarketing() {
  _cache   = null;
  _cacheTs = 0;
}

// ── Marketing expenses — отдельный фетчер для страницы руководства ────────────

const CHANNEL_LABELS = {
  '230': 'Директ',
  '232': 'VK Реклама',
  '234': 'Посевы',
  '236': 'Агентство',
  '238': 'SEO',
  '240': 'Другое',
};

let _expCache   = null;
let _expCacheTs = 0;

async function fetchMarketingExpensesData() {
  if (_expCache && Date.now() - _expCacheTs < CACHE_TTL) return _expCache;

  const raw = await fetchAllItems(EXPENSE_ENTITY_TYPE_ID,
    { ufCrm24Direction: DIRECTION_MARKETING_ID },
    ['id', 'title', 'ufCrm24Amount', 'ufCrm24Channel', 'ufCrm24Description', 'begindate']
  );

  const expenses = raw.map(e => {
    const chId = e.ufCrm24Channel ? String(e.ufCrm24Channel) : '240';
    return {
      id:           e.id,
      title:        e.title || '',
      description:  e.ufCrm24Description || '',
      amount:       parseFloat(e.ufCrm24Amount || 0),
      channel:      chId,
      channelLabel: CHANNEL_LABELS[chId] || 'Другое',
      date:         e.begindate ? e.begindate.slice(0, 10) : null,
      month:        e.begindate ? e.begindate.slice(0, 7) : null,
      b24Url:       `${B24_URL}/crm/type/1070/details/${e.id}/`,
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Агрегация по каналам
  const byChannel = {};
  for (const e of expenses) {
    if (!byChannel[e.channel]) {
      byChannel[e.channel] = { label: e.channelLabel, total: 0, count: 0 };
    }
    byChannel[e.channel].total += e.amount;
    byChannel[e.channel].count++;
  }

  // Агрегация по месяцам
  const byMonth = {};
  for (const e of expenses) {
    if (!e.month) continue;
    if (!byMonth[e.month]) byMonth[e.month] = { total: 0 };
    byMonth[e.month].total += e.amount;
  }

  const total        = expenses.reduce((s, e) => s + e.amount, 0);
  const currentYear  = new Date().getFullYear().toString();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const totalYear    = expenses
    .filter(e => e.date && e.date.startsWith(currentYear))
    .reduce((s, e) => s + e.amount, 0);
  const totalMonth   = expenses
    .filter(e => e.month === currentMonth)
    .reduce((s, e) => s + e.amount, 0);

  _expCache   = { expenses, byChannel, byMonth, total, totalYear, totalMonth, fetchedAt: new Date().toISOString() };
  _expCacheTs = Date.now();
  return _expCache;
}

function cacheInvalidateExpenses() {
  _expCache   = null;
  _expCacheTs = 0;
}

module.exports = {
  fetchMarketingData, cacheInvalidateMarketing,
  fetchMarketingExpensesData, cacheInvalidateExpenses,
};
