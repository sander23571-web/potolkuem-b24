'use strict';
/**
 * realization-combined-data.js — данные для дашборда /report/realization-full
 * ("Реализация — весь год").
 *
 * Сводит воедино два уже существующих источника, не дублируя их логику:
 *   - realization-data.js        — склад (pbi.php, реальные отгрузки, с мая 2026)
 *   - realization-legacy-data.js — до склада (сделки CRM без товарных позиций, до мая 2026 +
 *                                  «Прочее»)
 *
 * АРХ МОСКВА (id=4 в legacy) сознательно ИСКЛЮЧЕНА из суммы «до склада» здесь — часть её сделок
 * уже физически отражена в складских отгрузках (см. realization-legacy-data.js, OVERLAP_NOTE),
 * добавление её суммы целиком задвоило бы май. Полная сумма и пояснение показаны отдельной
 * заметкой на дашборде, без участия в итогах.
 */

const { fetchRealizationData } = require('./realization-data');
const { fetchPreWarehouseData } = require('./realization-legacy-data');

const OVERLAP_EXHIBITION_ID = 4; // АРХ МОСКВА

async function fetchCombinedRealization() {
  const [warehouse, legacy] = await Promise.all([
    fetchRealizationData({}), // всё время, без фильтра по датам
    fetchPreWarehouseData(),
  ]);

  if (!warehouse.available && !legacy.available) {
    return { available: false, error: warehouse.error || legacy.error };
  }

  const warehouseByMonth = new Map();
  if (warehouse.available) {
    for (const r of warehouse.rows) {
      warehouseByMonth.set(r.month, (warehouseByMonth.get(r.month) || 0) + r.sum);
    }
  }

  const legacyByMonth = new Map();
  let arkhMoskva = null;
  if (legacy.available) {
    for (const ex of legacy.exhibitions) {
      if (ex.id === OVERLAP_EXHIBITION_ID) {
        arkhMoskva = ex;
        continue; // исключена из суммы — см. комментарий выше
      }
      for (const [month, sum] of Object.entries(ex.byMonth || {})) {
        legacyByMonth.set(month, (legacyByMonth.get(month) || 0) + sum);
      }
    }
  }

  const months = [...new Set([...warehouseByMonth.keys(), ...legacyByMonth.keys()])].sort();
  const monthRows = months.map(month => {
    const warehouseSum = warehouseByMonth.get(month) || 0;
    const legacySum = legacyByMonth.get(month) || 0;
    return { month, warehouseSum, legacySum, total: warehouseSum + legacySum };
  });

  const totals = monthRows.reduce((acc, r) => ({
    warehouseSum: acc.warehouseSum + r.warehouseSum,
    legacySum: acc.legacySum + r.legacySum,
    total: acc.total + r.total,
  }), { warehouseSum: 0, legacySum: 0, total: 0 });

  return {
    available: true,
    months: monthRows,
    totals,
    arkhMoskva, // { sum, overlapNote, ... } или null — для отдельной заметки на дашборде
    warehouseAvailable: warehouse.available,
    legacyAvailable: legacy.available,
    updatedAt: new Date(),
  };
}

module.exports = { fetchCombinedRealization };
