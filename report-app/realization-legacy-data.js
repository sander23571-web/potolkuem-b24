'use strict';
/**
 * realization-legacy-data.js — данные для дашборда /report/realization-legacy
 * ("Реализация — до склада").
 *
 * ДОПОЛНЕНИЕ к /report/realization (realization-data.js), не замена. Тот дашборд читает
 * sale.shipment/catalog.storeproduct (pbi.php) — реальные складские отгрузки. Но 4 ранних
 * выставки продавались ДО того, как в Б24 заработал складской учёт (склады появились
 * 07.05.2026, начальные остатки внесены 07.06.2026) — их сделки в воронке «Розничные
 * продажи» (CATEGORY_ID=18) вообще не имеют товарных позиций/STORE_ID, только TITLE+OPPORTUNITY.
 * Разбор найден и согласован с владельцем 14.09.2026 (см. proj log --project talk).
 *
 * Состав (зафиксирован в этой сессии, не выводится автоматически из даты — критерий не дата,
 * а факт отсутствия/неполноты складской привязки у сделок конкретной выставки):
 *   - id=24  ОБРАЗОВАНИЕ И КАРЬЕРА (28.02–01.03.26) — товарных позиций нет вообще
 *   - id=22  GOTOVO 2026           (24–27.03.26)     — товарных позиций нет вообще
 *   - id=30  non/fictioN           (09–12.04.26)     — товарных позиций нет вообще
 *   - id=4   АРХ МОСКВА            (27–30.05.26)     — первая выставка после появления
 *            складов, частично со STORE_ID, но в /report/realization попадает лишь ~91 100₽
 *            из 300 689₽ сделок — включена сюда целиком по решению владельца, с явной
 *            пометкой пересечения (см. OVERLAP_NOTE ниже и render-realization-legacy.js)
 *   - "Прочее" — сделки воронки 18 без привязки к выставке вообще (PARENT_ID_1048 пусто),
 *     одиночные продажи июнь-июль 2026, тоже без товарных позиций
 *
 * Разбивка по игре — эвристика по тексту TITLE сделки (не по catalog.product, там позиций
 * нет), см. extractItem(). Даёт осмысленный, но не абсолютно точный список — часть сделок
 * («Образование (Стенд)» и т.п., 10 из 15 по этой выставке) не содержит названия игры вообще
 * и попадает в группу «Не определено».
 */

require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK = process.env.B24_WEBHOOK;
const CATEGORY_ID = 18;

// Выставки, включённые в этот дашборд (снимок решения от 14.09.2026 — см. комментарий выше).
const EXHIBITION_IDS = [24, 22, 30, 4];

// Сделки без PARENT_ID_1048, которые НЕ попадают в «Прочее» — orphan-остатки старой (до
// пересборки) модели ММКЯ: 9 сделок вида «ММКЯ Алиса Малых» и т.п., id 600-618, 192 900 ₽.
// Коммит 2ccc949 (09.09.2026) не смог их удалить («физически не поддаются удалению») и
// оставил как «безопасные орфаны», очистив им PARENT_ID_1048/1052 — из-за этого без
// исключения они снова всплыли бы здесь как «Прочее» и задвоили ММКЯ (та же сумма уже
// полностью учтена через 54 новые сделки на складе 28, см. /report/realization). Найдено
// и исключено 14.09.2026 при первом прогоне этого дашборда — proj log --project talk.
const EXCLUDE_DEAL_IDS = new Set([600, 602, 604, 606, 608, 612, 614, 616, 618]);

const OVERLAP_NOTE = {
  4: 'Часть сделок этой выставки (≈91 100 ₽) уже отражена в /report/realization — товарные ' +
     'позиции у них есть, склад определён. Здесь показана вся сумма сделок целиком (по решению ' +
     'владельца от 14.09.2026), поэтому между двумя дашбордами по АРХ МОСКВА есть пересечение.',
};

const CACHE_TTL = 15 * 60 * 1000;
let _cache = null;
let _cacheTs = 0;
function invalidateRealizationLegacyCache() { _cache = null; _cacheTs = 0; }

async function b24(method, params = {}) {
  const r = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function fetchAllDeals() {
  const items = [];
  let start = 0;
  while (true) {
    const res = await b24('crm.deal.list', {
      filter: { CATEGORY_ID, STAGE_ID: 'C18:WON' },
      select: ['ID', 'TITLE', 'OPPORTUNITY', 'PARENT_ID_1048', 'DATE_CREATE'],
      start,
    });
    const batch = res?.result || [];
    items.push(...batch);
    if (batch.length < 50) break;
    start += 50;
    await new Promise(r => setTimeout(r, 150));
  }
  return items;
}

// Название/даты выставок — живьём из СП 1048, не хардкодим (имя уже один раз менялось —
// ММКВЯ -> ММКЯ, 09.09.2026).
async function fetchExhibitionNames(ids) {
  const res = await b24('crm.item.list', {
    entityTypeId: 1048,
    filter: { id: ids },
    select: ['id', 'title', 'begindate', 'closedate'],
  });
  const map = {};
  for (const it of res?.result?.items || []) map[it.id] = it;
  return map;
}

// Достаёт название игры из TITLE сделки. requireDash=true — для выставочных сделок вида
// "Выставка — Игра (канал)"; без разделителя " — " считаем, что игра не указана (агрегат).
// requireDash=false — для сделок «Прочее» без привязки к выставке: там TITLE и есть игра.
function extractItem(title, requireDash) {
  let s = String(title || '').trim();
  if (requireDash) {
    const i = s.indexOf(' — ');
    if (i === -1) return null;
    s = s.slice(i + 3).trim();
  }
  s = s.replace(/^"?Потолкуем\?"?\s*/i, '').trim();
  s = s.replace(/\s*[\d\s]{2,}\s*руб\.?\s*$/i, '').trim();
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) s = m[1].trim();
  s = s.replace(/\s*\d{1,2}\.\d{1,2}\.\d{2,4}\s*$/, '').trim();
  s = s.replace(/^\d{1,2}\.\d{1,2}\.\d{2,4}\s*/, '').trim();
  return s || null;
}

function buildItemBreakdown(deals, requireDash) {
  const byItem = new Map(); // name -> { name, sum, qty }
  for (const d of deals) {
    const name = extractItem(d.TITLE, requireDash) || 'Не определено';
    if (!byItem.has(name)) byItem.set(name, { name, sum: 0, qty: 0 });
    const row = byItem.get(name);
    row.sum += parseFloat(d.OPPORTUNITY) || 0;
    row.qty += 1;
  }
  return [...byItem.values()].sort((a, b) => b.sum - a.sum);
}

async function fetchPreWarehouseData() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  if (!WEBHOOK) {
    const err = new Error('no_webhook');
    err.code = 'no_webhook';
    throw err;
  }

  const [deals, exhibitions] = await Promise.all([
    fetchAllDeals(),
    fetchExhibitionNames(EXHIBITION_IDS),
  ]);

  const byExhibition = new Map(); // id|'none' -> { id, title, begindate, closedate, deals: [] }
  for (const id of EXHIBITION_IDS) {
    const ex = exhibitions[id];
    byExhibition.set(id, {
      id, title: ex?.title || `Выставка #${id}`,
      begindate: ex?.begindate?.slice(0, 10) || null,
      closedate: ex?.closedate?.slice(0, 10) || null,
      deals: [],
    });
  }
  byExhibition.set('none', { id: 'none', title: 'Прочее (без привязки к выставке)', begindate: null, closedate: null, deals: [] });

  for (const d of deals) {
    if (EXCLUDE_DEAL_IDS.has(parseInt(d.ID, 10))) continue;
    const pid = d.PARENT_ID_1048 ? parseInt(d.PARENT_ID_1048, 10) : null;
    if (pid && EXHIBITION_IDS.includes(pid)) {
      byExhibition.get(pid).deals.push(d);
    } else if (!pid) {
      byExhibition.get('none').deals.push(d);
    }
    // сделки, привязанные к выставкам ВНЕ EXHIBITION_IDS (напр. ММКЯ/IPSA), сюда не
    // попадают намеренно — они уже корректно считаются в /report/realization.
  }

  const exhibitionsOut = [...byExhibition.values()].map(ex => {
    const requireDash = ex.id !== 'none';
    const items = buildItemBreakdown(ex.deals, requireDash);
    const sum = ex.deals.reduce((s, d) => s + (parseFloat(d.OPPORTUNITY) || 0), 0);
    return {
      id: ex.id, title: ex.title, begindate: ex.begindate, closedate: ex.closedate,
      dealCount: ex.deals.length, sum, items,
      overlapNote: OVERLAP_NOTE[ex.id] || null,
    };
  });

  const totals = exhibitionsOut.reduce((acc, ex) => ({
    sum: acc.sum + ex.sum,
    dealCount: acc.dealCount + ex.dealCount,
  }), { sum: 0, dealCount: 0 });

  _cache = { available: true, exhibitions: exhibitionsOut, totals, updatedAt: new Date() };
  _cacheTs = Date.now();
  return _cache;
}

module.exports = { fetchPreWarehouseData, invalidateRealizationLegacyCache };
