'use strict';
/**
 * realization-data.js — данные для дашборда /report/realization ("Реализация по складам").
 *
 * ИСТОРИЯ: до 30.08.2026 данных не было через REST вообще (см. talk/b24-api-patterns.md,
 * "BI-аналитика (pbi.php)", п.13) — единственный источник был ручной CSV-экспорт из SQL Lab
 * (BI Constructor), см. архивную версию файла в git (e7a3656).
 *
 * 30.08.2026: канал `pbi.php` заработал (WRONG_KEY 27-29.08 был из-за ключа, привязанного к
 * пользователю с ограниченными правами — не архитектурный тупик и не нехватка тарифа).
 * Теперь тянем те же таблицы Trino напрямую HTTP-запросом, без Trino/SQL Lab/ручного экспорта.
 *
 * SQL-эквивалент того, что делает этот модуль (для справки, раньше выполнялся вручную):
 *
 *   SELECT
 *       date_trunc('month', i.document_date_create) AS "Месяц",
 *       COALESCE(cs.title, 'Услуги (без склада)')   AS "Склад",
 *       SUM(i.price * COALESCE(i.amount, 1))        AS "Сумма реализации",
 *       SUM(COALESCE(i.amount, 1))                  AS "Штук"
 *   FROM sale_document_saleorder_item i
 *   JOIN sale_document_saleorder d ON d.id = i.document_id
 *   LEFT JOIN catalog_store cs     ON cs.id = i.store_id
 *   WHERE d.was_cancelled != 'Y'
 *     AND d.deducted = 'Y'
 *   GROUP BY date_trunc('month', i.document_date_create), COALESCE(cs.title, 'Услуги (без склада)')
 *   ORDER BY "Месяц", "Склад"
 */

require('dotenv').config();
const fetch = require('node-fetch');

const B24_URL = 'https://potolkuem.bitrix24.ru';
const TOKEN = process.env.BI_ANALYTICS_TOKEN;
const PBI_URL = `${B24_URL}/bitrix/tools/biconnector/pbi.php`;

// ── Cache (TTL 15 мин) ───────────────────────────────────────────────────────
let cache = null;
let cacheTs = 0;
const CACHE_TTL = 15 * 60 * 1000;
function invalidateRealizationCache() { cache = null; }

async function pbiTable(table) {
  const res = await fetch(`${PBI_URL}?token=${TOKEN}&table=${table}`);
  if (!res.ok) throw new Error(`pbi.php ${table} → HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`pbi.php ${table} → пустой/неожиданный ответ`);
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function parseRubles(v) {
  if (v === null || v === undefined) return 0;
  return parseFloat(v) || 0;
}

async function fetchRealizationData() {
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache;

  if (!TOKEN) {
    return { available: false, error: 'no_token', rows: [], months: [], stores: [], totals: { sum: 0, qty: 0 }, updatedAt: null };
  }

  let items, documents, storesRaw;
  try {
    [items, documents, storesRaw] = await Promise.all([
      pbiTable('sale_document_saleorder_item'),
      pbiTable('sale_document_saleorder'),
      pbiTable('catalog_store'),
    ]);
  } catch (err) {
    console.error('[ERR] realization-data pbi.php:', err.message);
    return { available: false, error: err.message, rows: [], months: [], stores: [], totals: { sum: 0, qty: 0 }, updatedAt: null };
  }

  // Документы: только реально реализованные (deducted=Y) и не отменённые.
  const validDocIds = new Set(
    documents.filter(d => d.DEDUCTED === 'Y' && d.WAS_CANCELLED !== 'Y').map(d => d.ID)
  );
  const storeNames = Object.fromEntries(storesRaw.map(s => [s.ID, s.TITLE.trim()]));

  const agg = new Map(); // key: `${month}|${store}` -> { sum, qty }
  for (const i of items) {
    if (!validDocIds.has(i.DOCUMENT_ID)) continue;
    const month = String(i.DOCUMENT_DATE_CREATE).slice(0, 7); // YYYY-MM
    const store = i.STORE_ID != null ? (storeNames[i.STORE_ID] || `Склад #${i.STORE_ID}`) : 'Услуги (без склада)';
    // Услуги (amount пуст в БД) считаем как 1 единицу — та же логика, что была в ручном SQL
    // (COALESCE(amount,1)), иначе SUM(price*NULL) молча теряет выручку услуг.
    const qty = i.AMOUNT != null ? parseRubles(i.AMOUNT) : 1;
    const sum = parseRubles(i.PRICE) * qty;
    const key = `${month}|${store}`;
    if (!agg.has(key)) agg.set(key, { month, store, sum: 0, qty: 0 });
    const a = agg.get(key);
    a.sum += sum;
    a.qty += qty;
  }

  const rows = [...agg.values()];
  const months = [...new Set(rows.map(r => r.month))].sort();
  const stores = [...new Set(rows.map(r => r.store))].sort();
  const totals = rows.reduce((acc, r) => ({ sum: acc.sum + r.sum, qty: acc.qty + r.qty }), { sum: 0, qty: 0 });

  const data = {
    available: true,
    rows, months, stores, totals,
    updatedAt: new Date(),
    sourceFile: 'BI-аналитика (pbi.php), напрямую',
  };

  cache = data;
  cacheTs = Date.now();
  return data;
}

module.exports = { fetchRealizationData, invalidateRealizationCache };
