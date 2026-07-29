'use strict';
/**
 * warehouse-data.js — фетчер данных для дашборда /report/warehouse
 *
 * Источники:
 *   catalog.product.list    — товары с purchasingPrice
 *   crm.product.list        — розничные цены
 *   catalog.store.list      — склады и точки
 *   catalog.storeproduct.list — остатки (138 записей)
 *   catalog.document.list   — последние складские документы
 */

require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK  = process.env.B24_WEBHOOK;
const B24_URL  = 'https://potolkuem.bitrix24.ru';
const CATALOG_ID = 24; // iblockId товарного каталога CRM

// Классификация складов
const MAIN_STORE_IDS   = new Set([4, 6, 8, 28]); // Офис, Дмитрий, WB, Выездной
const RETAIL_STORE_IDS = new Set([10, 12, 14, 16, 18, 22, 24, 26]); // Точки продаж

const CACHE_TTL = 5 * 60 * 1000;
let _cache   = null;
let _cacheTs = 0;

// ── B24 helpers ───────────────────────────────────────────────────────────────

async function b24(method, params = {}) {
  const r = await fetch(`${WEBHOOK}${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  return r.json();
}

async function fetchAllPages(method, params, resultKey) {
  const items = [];
  let start = 0;
  while (true) {
    const res   = await b24(method, { ...params, start });
    const batch = res?.result?.[resultKey] || [];
    items.push(...batch);
    const total = res?.total ?? 0;
    if (!batch.length || (total && items.length >= total) || batch.length < 50) break;
    start += 50;
    await new Promise(r => setTimeout(r, 150));
  }
  return items;
}

// ── Основная функция ───────────────────────────────────────────────────────────

async function fetchWarehouseData() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  // Параллельно тянем всё нужное
  const [catalogProducts, crmProducts, rawStores, rawInventory, rawDocs] = await Promise.all([
    // purchasingPrice живёт в catalog.product
    // iblockId обязателен и в select, и в filter — иначе Б24 возвращает ошибку
    // "Required filter fields: iblockId", которая тут молча превращается в []
    fetchAllPages('catalog.product.list', {
      select: ['id', 'name', 'purchasingPrice', 'active', 'iblockId'],
      filter: { active: 'Y', iblockId: CATALOG_ID },
    }, 'products'),
    // Розничная цена — только в crm.product
    b24('crm.product.list', { select: ['ID', 'PRICE'], start: 0 }),
    // Склады
    b24('catalog.store.list', {
      select: ['id', 'title', 'active', 'address'],
      filter: { active: 'Y' },
    }),
    // Остатки (все 138 записей)
    fetchAllPages('catalog.storeproduct.list', {
      select: ['id', 'storeId', 'productId', 'amount'],
      filter: {},
    }, 'storeProducts'),
    // Последние 20 документов
    b24('catalog.document.list', {
      select: ['id', 'docType', 'status', 'title', 'dateCreate', 'dateStatus'],
      order:  { dateCreate: 'DESC' },
      start:  0,
    }),
  ]);

  // Карта цен продажи по id
  const priceMap = {};
  for (const p of crmProducts?.result || []) {
    priceMap[parseInt(p.ID)] = parseFloat(p.PRICE) || 0;
  }

  // Карта товаров
  const prodMap = {};
  for (const p of catalogProducts) {
    prodMap[p.id] = {
      id:   p.id,
      name: p.name,
      price: priceMap[p.id] || 0,
      cost:  parseFloat(p.purchasingPrice) || 0,
      url:  `${B24_URL}/crm/catalog/${CATALOG_ID}/product/${p.id}/`,
    };
  }

  // Карта складов
  const storeMap = {};
  for (const s of rawStores?.result?.stores || []) {
    storeMap[s.id] = {
      id:      s.id,
      title:   s.title,
      address: s.address || '',
      isMain:  MAIN_STORE_IDS.has(s.id),
      isRetail: RETAIL_STORE_IDS.has(s.id),
      totalQty:   0,
      totalValue: 0,
    };
  }

  // Агрегация остатков
  const byProduct = {};

  for (const item of rawInventory) {
    const qty = parseFloat(item.amount) || 0;
    if (qty <= 0) continue;
    const prod  = prodMap[item.productId];
    const store = storeMap[item.storeId];
    if (!prod || !store) continue;

    if (!byProduct[prod.id]) {
      byProduct[prod.id] = {
        ...prod,
        totalQty:   0,
        totalValue: 0,
        mainQty:    0,
        retailQty:  0,
        byStore:    {},
      };
    }

    const value = qty * prod.cost;
    byProduct[prod.id].totalQty   += qty;
    byProduct[prod.id].totalValue += value;
    byProduct[prod.id].byStore[item.storeId] = (byProduct[prod.id].byStore[item.storeId] || 0) + qty;

    if (MAIN_STORE_IDS.has(item.storeId))   byProduct[prod.id].mainQty   += qty;
    if (RETAIL_STORE_IDS.has(item.storeId)) byProduct[prod.id].retailQty += qty;

    store.totalQty   += qty;
    store.totalValue += value;
  }

  const products = Object.values(byProduct)
    .filter(p => p.totalQty > 0)
    .sort((a, b) => b.totalValue - a.totalValue);

  const stores = Object.values(storeMap)
    .filter(s => s.totalQty > 0)
    .sort((a, b) => b.totalQty - a.totalQty);

  const totals = {
    skus:    products.length,
    qty:     products.reduce((s, p) => s + p.totalQty,   0),
    value:   products.reduce((s, p) => s + p.totalValue, 0),
    stores:  stores.length,
  };

  const DOC_LABELS = { S: 'Оприходование', A: 'Поступление', M: 'Перемещение', D: 'Списание', R: 'Возврат' };
  const documents = (rawDocs?.result?.documents || []).slice(0, 20).map(d => ({
    id:       d.id,
    type:     DOC_LABELS[d.docType] || d.docType,
    docType:  d.docType,
    title:    d.title || `Документ #${d.id}`,
    date:     d.dateCreate ? d.dateCreate.slice(0, 10) : '',
    url:      `${B24_URL}/shop/document/detail/${d.id}/`,
  }));

  _cache = { products, stores, documents, totals, storeMap };
  _cacheTs = Date.now();
  return _cache;
}

function cacheInvalidateWarehouse() {
  _cache   = null;
  _cacheTs = 0;
}

module.exports = { fetchWarehouseData, cacheInvalidateWarehouse };
