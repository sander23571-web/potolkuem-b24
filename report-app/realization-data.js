'use strict';
/**
 * realization-data.js — данные для дашборда /report/realization ("Реализация по складам").
 *
 * НЕ ходит в Б24 REST/зеркало напрямую. Источник данных: catalog.document / sale.order
 * не отдают привязку к складу ни через один REST-метод (проверено ~40 комбинациями
 * методов, 26.08) — единственное место, где store_id для строки реализации виден —
 * Trino-таблица sale_document_saleorder_item через встроенный в портал BI Constructor
 * SQL Lab. Прямого REST/API-доступа к Trino нет, а подключаться к BI-репликe напрямую
 * по Postgres-протоколу (ключ "БИ-аналитика") — в обход зеркала gigaclaude, для новой
 * разработки это нарушение регламента 19.08 (см. proj log --project gigaclaude, decision
 * 27.08). Решение (proj log --project talk, decision 27.08): временно, "по-старинке" —
 * владелец вручную выполняет SQL в SQL Lab и кладёт CSV-выгрузку в REALIZATION_DIR;
 * этот модуль просто читает готовый файл с диска. Когда зеркало расширят новой таблицей
 * (задача в очереди gigaclaude) — заменить на живое чтение через orchestrator_ro.
 *
 * Ожидаемый SQL (BI Constructor → SQL Lab), экспорт CSV:
 *
 * ИСПРАВЛЕНО 27.08 (найдено при разборе дашборда с владельцем — "незамыленный
 * взгляд"): старый JOIN catalog_store был INNER — строки БЕЗ store_id (услуги,
 * не физический товар — напр. "Проведение игры-корпоратива", у которой в БД
 * пусты сразу store_id/amount/cost_price одновременно, не только склад)
 * молча выпадали из выгрузки целиком. Это выглядело как "не можем определить
 * склад для реализации", хотя на деле для услуги склада и не может быть в
 * принципе — не пропуск данных, а смешение двух разных категорий (товар со
 * складом vs услуга без склада) в одном отчёте. LEFT JOIN + COALESCE ниже
 * не теряет эту выручку, а показывает её отдельной, явно подписанной
 * категорией — рендерер (render-realization.js) уже полностью generic по
 * значению "Склад", доработки там не нужны. COALESCE(i.amount, 1) — для
 * услуги amount пуст в БД, но выручка (price) реальна; трактуем как 1 unit,
 * иначе SUM(price*NULL) молча даёт NULL и те же деньги теряются повторно.
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

const fs = require('fs');
const path = require('path');

const REALIZATION_DIR = '/root/projects/talk-report/data/realization';

// Простой CSV-парсер с поддержкой кавычек (совпадает с экспортом SQL Lab — см.
// sqllab_untitled_query_3_20260826T131344.csv: значения с запятой/кавычкой в
// названии товара заключены в "...", внутренние " удвоены).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Срезаем BOM, если экспорт в UTF-8 with BOM (как в примере файла).
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // игнор — \r\n
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}

function findLatestFile() {
  if (!fs.existsSync(REALIZATION_DIR)) return null;
  const files = fs.readdirSync(REALIZATION_DIR)
    .filter(f => f.endsWith('.csv'))
    .map(f => ({ f, mtime: fs.statSync(path.join(REALIZATION_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0] : null;
}

function parseRubles(s) {
  return parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
}

function fetchRealizationData() {
  const latest = findLatestFile();
  if (!latest) {
    return { available: false, rows: [], months: [], stores: [], totals: { sum: 0, qty: 0 }, updatedAt: null };
  }

  const raw = fs.readFileSync(path.join(REALIZATION_DIR, latest.f), 'utf8');
  const table = parseCsv(raw);
  const header = table[0].map(h => h.trim());
  const idx = {
    month: header.findIndex(h => /месяц/i.test(h)),
    store: header.findIndex(h => /склад/i.test(h)),
    sum:   header.findIndex(h => /сумма/i.test(h)),
    qty:   header.findIndex(h => /штук|кол/i.test(h)),
  };

  const rows = table.slice(1)
    .filter(r => r[idx.month])
    .map(r => ({
      month: String(r[idx.month]).slice(0, 7), // YYYY-MM-DD... -> YYYY-MM
      // Fallback на случай, если SQL выполнили без правки 27.08 (COALESCE
      // в самом запросе) и ячейка всё же пришла пустой — не молчаливый
      // прочерк, а то же понятное название категории.
      store: r[idx.store] || 'Услуги (без склада)',
      sum:   parseRubles(r[idx.sum]),
      qty:   parseRubles(r[idx.qty]),
    }));

  const months = [...new Set(rows.map(r => r.month))].sort();
  const stores = [...new Set(rows.map(r => r.store))].sort();
  const totals = rows.reduce((acc, r) => ({ sum: acc.sum + r.sum, qty: acc.qty + r.qty }), { sum: 0, qty: 0 });

  return {
    available: true,
    rows, months, stores, totals,
    updatedAt: new Date(latest.mtime),
    sourceFile: latest.f,
  };
}

module.exports = { fetchRealizationData, REALIZATION_DIR };
