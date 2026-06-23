'use strict';
// ============================================================
// Импорт данных выставки GOTOVO 2026 (24–27.03.2026) в Bitrix24
// Одна проданная игра = одна сделка (без привязки к каталогу)
// Запуск: node scripts/import-gotovo-2026.js  (из корня проекта)
// ============================================================

const fs   = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const WEBHOOK = env.B24_WEBHOOK;
if (!WEBHOOK) { console.error('B24_WEBHOOK не найден в .env'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = msg => console.log(`[${new Date().toLocaleTimeString('ru')}] ${msg}`);

async function b24(method, params = {}) {
  await sleep(400);
  const res = await fetch(`${WEBHOOK}${method}`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(params),
  });
  const data = await res.json();
  if (data.error) throw new Error(`[${method}] ${data.error}: ${data.error_description}`);
  return data.result;
}

// ============================================================
// КОНСТАНТЫ
// ============================================================

const STAGE_VYSTAVKA = 'DT1048_20:SUCCESS'; // Выставка прошла успешно
const STAGE_VYKHOD   = 'DT1056_24:SUCCESS'; // Выход завершён
const STAGE_RASHOD   = 'DT1070_32:SUCCESS'; // Оплачено
const CAT_ROZNITSA   = 18;                  // Сайт/ВК/Розница
const STAGE_DEAL     = 'C18:WON';           // Сделка успешна

// UF-поля «Выход ведущего» (entityTypeId=1056)
const UF_VYH = {
  DATE       : 'ufCrm16_1777193655',
  HOURS      : 'ufCrm16_1779107483',
  SALES_CNT  : 'ufCrm16_1777193711',
  TRANSITIONS: 'ufCrm16_1777193805',
  PAYOUT     : 'ufCrm16_1777193828',
};

// UF-поля «Выставки» (entityTypeId=1048)
const UF_EX = {
  LOCATION: 'ufCrm12_1777190355',
  REVENUE : 'ufCrm12_1777190536',
};

// Enum-ID статей расходов (UF_CRM_24_EXPENSE_TYPE)
const ENUM_RASHOD = {
  'Аренда стенда'               : '210',
  'Оклейка / оформление стенда' : '212',
  'Полиграфия (лифлеты, баннеры)': '214',
  'Ведущие (комиссия)'          : '218',
  'Прочее'                      : '222',
};

const HOURS_8 = 196; // enum-ID «8 часов» (поле ufCrm16_1779107483)

// ============================================================
// ШАГ 0: Создать «Иван Безымянный» в Ведущих (СП 1052)
// ============================================================
async function createIvan() {
  log('=== ШАГ 0: Создаём «Иван Безымянный» ===');
  const result = await b24('crm.item.add', {
    entityTypeId: 1052,
    fields: {
      title       : 'Иван Безымянный',
      categoryId  : 22,
      assignedById: 134,
    },
  });
  const id = result?.item?.id;
  log(`  ✓ id=${id} | TODO: вручную поставить стадию «Неактивен»\n`);
  return id;
}

// ============================================================
// ШАГ 1: Создать выставку GOTOVO 2026 (СП 1048)
// ============================================================
async function createVystavka() {
  log('=== ШАГ 1: Создаём выставку GOTOVO 2026 ===');
  const result = await b24('crm.item.add', {
    entityTypeId: 1048,
    fields: {
      title             : 'GOTOVO 2026',
      categoryId        : 20,
      stageId           : STAGE_VYSTAVKA,
      begindate         : '2026-03-24',
      closedate         : '2026-03-27',
      [UF_EX.LOCATION]  : 'Москва, Тимирязев Центр',
      assignedById      : 134,
    },
  });
  const id = result?.item?.id;
  log(`  ✓ id=${id} «GOTOVO 2026» (24–27.03.2026)\n`);
  return id;
}

// ============================================================
// ШАГ 2: Выходы ведущих — 14 записей
// ============================================================
//   Иван Безымянный  (ivanId): 24.03, 25.03          — 2 дня,  7 000 руб.
//   Шестикова        (id=6):   24–27.03               — 4 дня, 18 300 руб.
//   Макарова         (id=28):  24.03, 27.03           — 2 дня, 11 180 руб.
//   Луференко        (id=12):  24–27.03               — 4 дня, 19 760 руб.
//   Троянова         (id=30):  26.03, 27.03 (KPI 26)  — 2 дня, 12 640 руб.
// ============================================================
function buildVyhody(vystavkaId, ivanId) {
  return [
    { vedushiyId: ivanId, date: '2026-03-24', transitions: 19, payout: 3500 },
    { vedushiyId: ivanId, date: '2026-03-25', transitions: 35, payout: 3500 },
    { vedushiyId:  6,     date: '2026-03-24', transitions: 18, payout: 4575 },
    { vedushiyId:  6,     date: '2026-03-25', transitions: 37, payout: 4575 },
    { vedushiyId:  6,     date: '2026-03-26', transitions: 23, payout: 4575 },
    { vedushiyId:  6,     date: '2026-03-27', transitions: 20, payout: 4575 },
    { vedushiyId: 28,     date: '2026-03-24', transitions: 10, payout: 5590 },
    { vedushiyId: 28,     date: '2026-03-27', transitions: 25, payout: 5590 },
    { vedushiyId: 12,     date: '2026-03-24', transitions:  8, payout: 4940 },
    { vedushiyId: 12,     date: '2026-03-25', transitions: 15, payout: 4940 },
    { vedushiyId: 12,     date: '2026-03-26', transitions: 10, payout: 4940 },
    { vedushiyId: 12,     date: '2026-03-27', transitions:  4, payout: 4940 },
    { vedushiyId: 30,     date: '2026-03-26', transitions: 45, payout: 6320 }, // KPI Даши
    { vedushiyId: 30,     date: '2026-03-27', transitions: 26, payout: 6320 },
  ].map(v => ({ ...v, vystavkaId }));
}

async function createVyhody(vystavkaId, ivanId) {
  const vyhody = buildVyhody(vystavkaId, ivanId);
  log(`=== ШАГ 2: Выходы ведущих (${vyhody.length} записей) ===`);
  let ok = 0;
  for (const v of vyhody) {
    const dd    = v.date.slice(5).replace('-', '.');
    const title = `GOTOVO ${dd} — вед.${v.vedushiyId}`;
    const result = await b24('crm.item.add', {
      entityTypeId: 1056,
      fields: {
        title,
        stageId             : STAGE_VYKHOD,
        parentId1048        : v.vystavkaId,
        parentId1052        : v.vedushiyId,
        begindate           : v.date,
        closedate           : v.date,
        [UF_VYH.DATE]       : v.date,
        [UF_VYH.HOURS]      : HOURS_8,
        [UF_VYH.TRANSITIONS]: v.transitions,
        [UF_VYH.SALES_CNT]  : 0,
        [UF_VYH.PAYOUT]     : `${v.payout}|RUB`,
      },
    });
    ok++;
    log(`  ✓ #${result?.item?.id} | вед.${v.vedushiyId} | ${v.date} | ${v.transitions} перех. | ${v.payout} руб.`);
  }
  log(`  Итого: ${ok}/${vyhody.length}\n`);
}

// ============================================================
// ШАГ 3: Сделки — 21 запись (без productrows)
// ============================================================
//   Шестикова (6):  5 сделок, 21 500 руб.
//   Макарова  (28): 4 сделки, 20 900 руб.
//   Луференко (12): 7 сделок, 28 800 руб.
//   Троянова  (30): 5 сделок, 18 200 руб.
//   Иван Безымянный: 0 сделок
// ============================================================
function buildSdelki() {
  return [
    // Шестикова Екатерина (id=6)
    { vedushiyId:  6, gameName: 'Красноречие',     price: 5500 },
    { vedushiyId:  6, gameName: 'Красноречие',     price: 5000 },
    { vedushiyId:  6, gameName: 'Рекламная пауза', price: 3000 },
    { vedushiyId:  6, gameName: 'Рекламная пауза', price: 3000 },
    { vedushiyId:  6, gameName: 'Гастрономия',     price: 5000 },
    // Макарова Ольга (id=28)
    { vedushiyId: 28, gameName: 'Диалекты Сибирь', price: 1300 },
    { vedushiyId: 28, gameName: 'Гастрономия',     price: 6000 },
    { vedushiyId: 28, gameName: 'Гастрономия',     price: 6800 },
    { vedushiyId: 28, gameName: 'Классика',         price: 6800 },
    // Луференко Данила (id=12)
    { vedushiyId: 12, gameName: 'Гастрономия',     price: 5500 },
    { vedushiyId: 12, gameName: 'Дипломатия',      price: 6800 },
    { vedushiyId: 12, gameName: 'Диалекты Урал',   price: 1300 },
    { vedushiyId: 12, gameName: 'Рекламная пауза', price: 3900 },
    { vedushiyId: 12, gameName: 'Рекламная пауза', price: 3900 },
    { vedushiyId: 12, gameName: 'Классика',         price: 6000 },
    { vedushiyId: 12, gameName: 'Дальний Восток',  price: 1400 }, // 1400 чтобы итог = 28 800
    // Троянова Дарья (id=30)
    { vedushiyId: 30, gameName: 'Диалекты Сибирь', price: 1000 },
    { vedushiyId: 30, gameName: 'Диалекты Юг',     price: 1000 },
    { vedushiyId: 30, gameName: 'Рекламная пауза', price: 3900 },
    { vedushiyId: 30, gameName: 'Живопись',         price: 5500 },
    { vedushiyId: 30, gameName: 'Красноречие',     price: 6800 },
  ];
}

async function createSdelki(vystavkaId) {
  const sdelki = buildSdelki();
  log(`=== ШАГ 3: Сделки (${sdelki.length} записей) ===`);
  const created = []; // [{dealId, vedushiyId}]

  for (const s of sdelki) {
    const title  = `GOTOVO 2026 — ${s.gameName} ${s.price.toLocaleString('ru')} руб.`;
    const dealId = await b24('crm.deal.add', {
      fields: {
        TITLE                : title,
        CATEGORY_ID          : CAT_ROZNITSA,
        STAGE_ID             : STAGE_DEAL,
        OPPORTUNITY          : s.price,
        CURRENCY_ID          : 'RUB',
        IS_MANUAL_OPPORTUNITY: 'N',
        SOURCE_ID            : 'OFFLINE_EVENT',
      },
    });
    created.push({ dealId, vedushiyId: s.vedushiyId, vystavkaId });
    log(`  ✓ #${dealId} | ${title}`);
  }

  log(`  Итого: ${created.length}/${sdelki.length}\n`);
  return created;
}

// ============================================================
// ШАГ 3б: Привязать сделки к выставке, ведущему и «ФИО продавца»
// PARENT_ID_1048 и PARENT_ID_1052 в crm.deal.add не работают —
// только через crm.deal.update с uppercase-ключами.
// UF_CRM_1781173703 — поле «ФИО продавца» (crm → Ведущие, DYNAMIC_1052)
// ============================================================
async function linkDeals(created) {
  log(`=== ШАГ 3б: Привязка сделок к выставке, ведущему и ФИО продавца (${created.length}) ===`);
  let ok = 0;
  for (const { dealId, vedushiyId, vystavkaId } of created) {
    await b24('crm.deal.update', {
      id    : dealId,
      fields: {
        PARENT_ID_1048      : vystavkaId,
        PARENT_ID_1052      : vedushiyId,
        UF_CRM_1781173703   : `DT1052_${vedushiyId}`,  // ФИО продавца → Ведущий
      },
    });
    ok++;
    log(`  ✓ #${dealId} → выставка ${vystavkaId}, вед.${vedushiyId}`);
  }
  log(`  Итого: ${ok}/${created.length}\n`);
}

// ============================================================
// ШАГ 4: Расходы — 7 записей, итого 380 642 руб.
// ============================================================
function buildRashody(vystavkaId) {
  return [
    {
      title: 'Лифлеты и доставка',
      type : 'Полиграфия (лифлеты, баннеры)',
      desc : '4 вида × 300 шт. (Вино голова, Холодильник, Гастро, Гастрономия) + доставка',
      qty  : 1200, price: 7.83, amount: 9396,
    },
    {
      title: 'Костюмы (скафандры)',
      type : 'Прочее',
      desc : 'Скафандры, 3 шт.',
      qty  : 3, price: 2395, amount: 7185,
    },
    {
      title: 'Ведущие (выходы + KPI)',
      type : 'Ведущие (комиссия)',
      desc : '5 человек, выход + KPI',
      qty  : 1, price: 68880, amount: 68880,
    },
    {
      title: 'Шлем',
      type : 'Прочее',
      desc : 'Шлем 15 000 руб. + доставка 3 793 руб.',
      qty  : 1, price: 18793, amount: 18793,
    },
    {
      title: 'Гофрированная труба',
      type : 'Прочее',
      desc : 'Труба для соединения шлема с ресепшеном',
      qty  : 1, price: 2628, amount: 2628,
    },
    {
      title: 'Аренда площадки',
      type : 'Аренда стенда',
      desc : 'Место на выставке GOTOVO 2026, Тимирязев Центр',
      qty  : 1, price: 221310, amount: 221310,
    },
    {
      title: 'Производство стенда',
      type : 'Оклейка / оформление стенда',
      desc : 'SEGframe 50×250 см, ткань с сублимационной печатью, буклетница А5 4 кармана',
      qty  : 1, price: 52450, amount: 52450,
    },
  ].map(r => ({ ...r, vystavkaId }));
}

async function createRashody(vystavkaId) {
  const rashody = buildRashody(vystavkaId);
  log(`=== ШАГ 4: Расходы (${rashody.length} записей) ===`);
  let ok = 0;
  let total = 0;
  for (const r of rashody) {
    const result = await b24('crm.item.add', {
      entityTypeId: 1070,
      fields: {
        title              : r.title,
        categoryId         : 32,
        stageId            : STAGE_RASHOD,
        parentId1048       : r.vystavkaId,
        ufCrm24ExpenseType : [ENUM_RASHOD[r.type]],
        ufCrm24Description : r.desc,
        ufCrm24Qty         : r.qty,
        ufCrm24PriceUnit   : r.price,
        ufCrm24Amount      : r.amount,
      },
    });
    ok++;
    total += r.amount;
    log(`  ✓ #${result?.item?.id} | ${r.title} | ${r.amount.toLocaleString('ru-RU')} руб.`);
  }
  log(`  Итого: ${ok}/${rashody.length} | Сумма: ${total.toLocaleString('ru-RU')} руб.\n`);
}

// ============================================================
// ШАГ 5: Записать выручку в карточку выставки
// ============================================================
async function updateVystavka(vystavkaId) {
  log('=== ШАГ 5: Обновляем выставку — выручка ===');
  await b24('crm.item.update', {
    entityTypeId: 1048,
    id          : vystavkaId,
    fields      : { [UF_EX.REVENUE]: 89400 },
  });
  log('  ✓ Выручка: 89 400 руб.\n');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('Старт импорта GOTOVO 2026 (24–27.03.2026)');
  log(`Портал: ${WEBHOOK.replace(/\/rest\/.+/, '')}`);
  log('Сделок: 21 | Выходов: 14 | Расходов: 7\n');

  try {
    const ivanId     = await createIvan();
    const vystavkaId = await createVystavka();
    await createVyhody(vystavkaId, ivanId);
    const created    = await createSdelki(vystavkaId);
    await linkDeals(created);
    await createRashody(vystavkaId);
    await updateVystavka(vystavkaId);

    log('✓ Импорт завершён');
    log('');
    log('TODO — ручные шаги:');
    log('  1. Иван Безымянный — поставить стадию «Неактивен» в карточке Ведущего');
    log('  2. Проверить связи: Выставка → Выходы → Сделки → Расходы');
    log('  3. Финансовый итог: выручка 89 400 / расходы 380 642 / убыток -291 242 руб.');
  } catch (err) {
    console.error('\n✗ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
