require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.LIVEDUNE_API_KEY;
const BASE    = 'https://api.livedune.com';

// Own account IDs (Потолкуем)
const OWN_IDS = [2753311, 2753880, 3039674];

// ── Cache (TTL 30 min) ────────────────────────────────────────────────────────
const cache = new Map();
const TTL   = 30 * 60 * 1000;

function cGet(k)    { const e = cache.get(k); if (!e) return null; if (Date.now() - e.ts > TTL) { cache.delete(k); return null; } return e.data; }
function cSet(k, d) { cache.set(k, { data: d, ts: Date.now() }); }

// ── Raw API ───────────────────────────────────────────────────────────────────
async function ld(path, params = {}) {
  const qs  = new URLSearchParams({ access_token: API_KEY, ...params });
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) throw new Error(`LiveDune ${path} → ${res.status}`);
  return res.json();
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

// ── API wrappers ──────────────────────────────────────────────────────────────
async function fetchAccounts() {
  const k = 'accounts';
  if (cGet(k)) return cGet(k);
  const r = await ld('/accounts');
  cSet(k, r.response || []);
  return cGet(k);
}

// NOTE: correct param names are date_from / date_to (not from / to)
async function fetchHistory(id, date_from, date_to) {
  const k = `hist_${id}_${date_from}_${date_to}`;
  if (cGet(k)) return cGet(k);
  const r = await ld(`/accounts/${id}/history`, { date_from, date_to });
  cSet(k, r.response || []);
  return cGet(k);
}

async function fetchAnalytics(id, date_from, date_to) {
  const k = `ana_${id}_${date_from}_${date_to}`;
  if (cGet(k)) return cGet(k);
  const r = await ld(`/accounts/${id}/analytics`, { date_from, date_to });
  cSet(k, r.response || {});
  return cGet(k);
}

async function fetchPosts(id, count = 20) {
  const k = `posts_${id}_${count}`;
  if (cGet(k)) return cGet(k);
  const r = await ld(`/accounts/${id}/posts`, { count });
  cSet(k, r.response || []);
  return cGet(k);
}

// ── Main aggregator ───────────────────────────────────────────────────────────
async function fetchSocialData(days = 30) {
  const k = `social_full_${days}`;
  if (cGet(k)) return cGet(k);

  const accounts = await fetchAccounts();
  const own      = accounts.filter(a => OWN_IDS.includes(a.id));
  const watched  = accounts.filter(a => !OWN_IDS.includes(a.id));

  const to   = today();
  const from = daysAgo(days);

  const ownData = await Promise.all(own.map(async (acc) => {
    const [ana30, hist90, posts] = await Promise.all([
      fetchAnalytics(acc.id, from, to),
      fetchHistory(acc.id, from, to),
      fetchPosts(acc.id, 10),
    ]);
    return { ...acc, ana30, hist90, posts };
  }));

  const watchedData = await Promise.all(watched.map(async (acc) => {
    const [ana30, hist30] = await Promise.all([
      fetchAnalytics(acc.id, from, to),
      fetchHistory(acc.id, from, to),
    ]);
    return { ...acc, ana30, hist30 };
  }));

  const data = { own: ownData, watched: watchedData, fetchedAt: new Date().toISOString(), days, from, to };
  cSet(k, data);
  return data;
}

function invalidate() { cache.clear(); }

module.exports = { fetchSocialData, invalidate };
