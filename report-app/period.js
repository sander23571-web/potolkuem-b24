'use strict';
/**
 * period.js — выбор периода для маркетинговых дашбордов (/report/marketing, /report/marketing/expenses)
 *
 * Период передаётся в URL: ?range=ytd|3m|6m|12m|all  или  ?from=YYYY-MM-DD&to=YYYY-MM-DD (свой диапазон)
 * По умолчанию (без параметров) — 'ytd' (с начала года).
 */

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return isoDate(d);
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

const PRESETS = [
  { key: 'ytd', label: 'С начала года', from: () => startOfYear(), to: () => isoDate(new Date()) },
  { key: '3m',  label: '3 месяца',      from: () => monthsAgo(3),  to: () => isoDate(new Date()) },
  { key: '6m',  label: '6 месяцев',     from: () => monthsAgo(6),  to: () => isoDate(new Date()) },
  { key: '12m', label: '12 месяцев',    from: () => monthsAgo(12), to: () => isoDate(new Date()) },
  { key: 'all', label: 'Всё время',     from: () => null,          to: () => null },
];

// query -> { preset, from, to }
function resolveRange(query = {}) {
  const qFrom = (query.from || '').slice(0, 10);
  const qTo   = (query.to   || '').slice(0, 10);

  if (qFrom || qTo) {
    let from = qFrom || null;
    let to   = qTo || null;
    if (from && to && from > to) [from, to] = [to, from]; // защита от перепутанных дат
    return { preset: 'custom', from, to };
  }

  const preset = PRESETS.find(p => p.key === query.range) || PRESETS.find(p => p.key === 'ytd');
  return { preset: preset.key, from: preset.from(), to: preset.to() };
}

function rangeQueryString(range) {
  if (range.preset === 'custom') {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p.toString();
  }
  return new URLSearchParams({ range: range.preset }).toString();
}

module.exports = { PRESETS, resolveRange, rangeQueryString, isoDate, monthsAgo, startOfYear };
