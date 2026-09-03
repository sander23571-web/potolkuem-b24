'use strict';
/**
 * expenses-data.js — данные для дашборда /report/expenses ("Все расходы компании").
 *
 * Источник — СП «Реестр платежей» (entityTypeId=1080), поле «Код» (ufCrm32Code, iblock_element)
 * ссылается на Универсальный список «Справочник кодов расходов» (IBLOCK_ID=32): 13 укрупнённых
 * категорий (PROPERTY_184, напр. "11 Маркетинг") × подкоды вида x.y (PROPERTY_182, напр. "11.3"),
 * см. talk/CLAUDE.md.
 *
 * В отличие от /report/marketing/expenses (СП «Расходы» 1070, только направление «Маркетинг»,
 * ~150 записей вручную заведённых) — этот отчёт про ВСЕ платежи компании, включая импортированные
 * из банковской выписки (786 записей на 29.08.2026), классифицированные по коду. Два отчёта
 * читают из разных СП и не пересекаются технически.
 *
 * Учитываются только «реально прошедшие» платежи — стадии «Последние проведенные платежи»
 * (DT1080_50:UC_P5EYDQ, последние 10 дней до архивации ботом) и «Архив проведенных платежей»
 * (DT1080_50:SUCCESS). Черновики/согласование/отменённые — не расход, в отчёт не попадают
 * (решение владельца 02.09.2026).
 *
 * Дата платежа — ТОЛЬКО begindate. closedate НЕ использовать: перезаписывается текущей датой
 * при создании записи в SUCCESS-стадии, не отражает реальную дату платежа (см. talk/CLAUDE.md,
 * раздел «СП Реестр платежей»).
 */

require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK = process.env.B24_WEBHOOK;
const B24_URL = 'https://potolkuem.bitrix24.ru';
const ENTITY_TYPE_ID = 1080;
const CODE_IBLOCK_ID = 32;
const PAID_STAGE_IDS = ['DT1080_50:UC_P5EYDQ', 'DT1080_50:SUCCESS'];
const NO_CODE_KEY = '_none';
const NO_CODE_LABEL = 'Без кода';

const CACHE_TTL = 10 * 60 * 1000;       // 10 минут — сами платежи (часто дополняются)
const CODE_MAP_TTL = 30 * 60 * 1000;    // 30 минут — справочник кодов меняется редко

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

// ── Справочник кодов (IBLOCK_ID=32) → Map<elementId, {subcode, subLabel, categoryKey, categoryLabel}>
let _codeMapCache = null;
let _codeMapCacheTs = 0;

async function fetchCodeMap() {
  if (_codeMapCache && Date.now() - _codeMapCacheTs < CODE_MAP_TTL) return _codeMapCache;

  const res = await b24('lists.element.get', { IBLOCK_TYPE_ID: 'lists', IBLOCK_ID: CODE_IBLOCK_ID });
  const elements = res?.result || [];

  const map = new Map();
  const categories = new Map(); // categoryKey -> categoryLabel
  for (const el of elements) {
    const subcode = Object.values(el.PROPERTY_182 || {})[0] || '';
    const categoryLabel = Object.values(el.PROPERTY_184 || {})[0] || '';
    const categoryKey = subcode.split('.')[0] || NO_CODE_KEY;
    map.set(String(el.ID), {
      subcode,
      subLabel: el.NAME || subcode,
      categoryKey,
      categoryLabel: categoryLabel || `Категория ${categoryKey}`,
    });
    if (categoryKey && !categories.has(categoryKey)) categories.set(categoryKey, categoryLabel);
  }

  _codeMapCache = { map, categories };
  _codeMapCacheTs = Date.now();
  return _codeMapCache;
}

// ── Платежи (786 записей на 29.08.2026, только "прошедшие" стадии) ─────────────
let _rawCache = null;
let _rawCacheTs = 0;
function cacheInvalidateExpensesAll() { _rawCache = null; }

async function fetchRawPayments() {
  if (_rawCache && Date.now() - _rawCacheTs < CACHE_TTL) return _rawCache;

  const [items, { map: codeMap, categories }] = await Promise.all([
    fetchAllItems(ENTITY_TYPE_ID, { stageId: PAID_STAGE_IDS }, ['id', 'title', 'opportunity', 'begindate', 'ufCrm32Code']),
    fetchCodeMap(),
  ]);

  const rows = items.map(it => {
    const codeId = it.ufCrm32Code != null ? String(it.ufCrm32Code) : null;
    const info = codeId ? codeMap.get(codeId) : null;
    const date = it.begindate ? it.begindate.slice(0, 10) : null;
    return {
      id: it.id,
      title: it.title || '',
      amount: parseFloat(it.opportunity || 0),
      date,
      month: date ? date.slice(0, 7) : null,
      categoryKey: info ? info.categoryKey : NO_CODE_KEY,
      categoryLabel: info ? info.categoryLabel : NO_CODE_LABEL,
      subcode: info ? info.subcode : '',
      subLabel: info ? info.subLabel : NO_CODE_LABEL,
      b24Url: `${B24_URL}/crm/type/${ENTITY_TYPE_ID}/details/${it.id}/`,
    };
  });

  // Список категорий для селектора — все известные из справочника + "Без кода" в конце,
  // отсортированы по числовому префиксу (иначе "10"/"11"/"12"/"13" уедут между "1" и "2").
  const categoryList = [...categories.entries()]
    .map(([key, label]) => ({ key, label: label || `Категория ${key}` }))
    .sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10));
  if (rows.some(r => r.categoryKey === NO_CODE_KEY)) {
    categoryList.push({ key: NO_CODE_KEY, label: NO_CODE_LABEL });
  }

  _rawCache = { rows, categoryList };
  _rawCacheTs = Date.now();
  return _rawCache;
}

function filterByRange(list, from, to) {
  if (!from && !to) return list;
  return list.filter(x => {
    if (!x.date) return true; // без даты — не выбрасываем, попадёт в "итого" без месяца
    if (from && x.date < from) return false;
    if (to && x.date > to) return false;
    return true;
  });
}

// range: { from, to }; category: ключ верхнеуровневой категории ('11', '_none') или null (все категории);
// subcodes: массив подкодов ('4.1','4.2',...) для доп. фильтра ВНУТРИ категории (пусто/null = все подкоды)
async function fetchExpensesData(range = {}, category = null, subcodes = null) {
  const { from = null, to = null } = range;
  let raw;
  try {
    raw = await fetchRawPayments();
  } catch (err) {
    console.error('[ERR] expenses-data:', err.message);
    return { available: false, error: err.message, rows: [], months: [], segments: [], categoryList: [], subcodeOptions: [], selectedSubcodes: [], payments: [], totals: { sum: 0, count: 0 }, updatedAt: null };
  }

  const { rows: allRows, categoryList } = raw;
  const filtered = filterByRange(allRows, from, to);
  const catScoped = category ? filtered.filter(r => r.categoryKey === category) : filtered;

  // Список подкодов, доступных для отметки — считается ДО применения фильтра по подкодам
  // (иначе снятые чекбоксы пропадали бы из списка вместе со своей отметкой).
  let subcodeOptions = [];
  if (category) {
    const subTotals = new Map();
    for (const r of catScoped) {
      const key = r.subcode || NO_CODE_LABEL;
      if (!subTotals.has(key)) subTotals.set(key, { key, label: r.subLabel, sum: 0, count: 0 });
      const t = subTotals.get(key);
      t.sum += r.amount;
      t.count++;
    }
    subcodeOptions = [...subTotals.values()].sort((a, b) => b.sum - a.sum);
  }

  const activeSubcodes = category && subcodes && subcodes.length ? new Set(subcodes) : null;
  const selectedSubcodes = activeSubcodes ? subcodeOptions.filter(s => activeSubcodes.has(s.key)).map(s => s.key) : [];
  const scoped = activeSubcodes ? catScoped.filter(r => activeSubcodes.has(r.subcode || NO_CODE_LABEL)) : catScoped;

  // segmentKey/segmentLabel — либо категория (обзорный вид), либо подкод (drill-down внутри категории)
  const segKeyOf   = r => category ? (r.subcode || NO_CODE_LABEL) : r.categoryKey;
  const segLabelOf = r => category ? r.subLabel : r.categoryLabel;

  const agg = new Map(); // `${month}|${segKey}` -> { month, key, label, sum, count }
  for (const r of scoped) {
    if (!r.month) continue;
    const key = segKeyOf(r);
    const mk = `${r.month}|${key}`;
    if (!agg.has(mk)) agg.set(mk, { month: r.month, key, label: segLabelOf(r), sum: 0, count: 0 });
    const a = agg.get(mk);
    a.sum += r.amount;
    a.count++;
  }

  const aggRows = [...agg.values()];
  const months = [...new Set(aggRows.map(r => r.month))].sort();
  // Сегменты — уникальные (key,label), отсортированы по сумме за период (крупные — первыми)
  const segTotals = new Map();
  for (const r of aggRows) {
    if (!segTotals.has(r.key)) segTotals.set(r.key, { key: r.key, label: r.label, sum: 0 });
    segTotals.get(r.key).sum += r.sum;
  }
  const segments = [...segTotals.values()].sort((a, b) => b.sum - a.sum);

  const totals = scoped.reduce((acc, r) => ({ sum: acc.sum + r.amount, count: acc.count + 1 }), { sum: 0, count: 0 });
  const selectedCategory = categoryList.find(c => c.key === category) || null;

  // Список отдельных платежей со ссылкой на карточку в Б24 — только внутри выбранной категории
  // (на верхнем уровне, по всем категориям сразу, список был бы на тысячи строк и бесполезен).
  const PAYMENTS_LIMIT = 500;
  const payments = category
    ? scoped
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, PAYMENTS_LIMIT)
        .map(r => ({ id: r.id, date: r.date, title: r.title, amount: r.amount, subLabel: r.subLabel, b24Url: r.b24Url }))
    : [];
  const paymentsTotal = scoped.length;

  return {
    available: true,
    rows: aggRows, months, segments,
    categoryList, selectedCategory,
    subcodeOptions, selectedSubcodes,
    payments, paymentsTotal, paymentsLimit: PAYMENTS_LIMIT,
    totals,
    updatedAt: new Date(_rawCacheTs),
  };
}

module.exports = { fetchExpensesData, cacheInvalidateExpensesAll };
