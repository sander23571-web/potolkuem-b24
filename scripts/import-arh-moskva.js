'use strict';
// ============================================================
// Импорт данных выставки АРХ МОСКВА 27-30.05.2026 в Bitrix24
// Каждая проданная игра = отдельная сделка
// Запуск: node import-arh-moskva.js  (Node.js 18+, из папки scripts/)
// ============================================================

const fs   = require('fs');
const path = require('path');

// --- ENV ---
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const WEBHOOK = env.B24_WEBHOOK;
if (!WEBHOOK) { console.error('B24_WEBHOOK не найден в .env'); process.exit(1); }

// --- HELPERS ---
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

const VYSTAVKA_ID  = 4;   // АРХ МОСКВА (entityTypeId=1048)
const CAT_B2C      = 26;  // воронка «Мероприятия B2C»
const STAGE_DEAL   = 'C26:WON';
const STAGE_VYKHOD = 'DT1056_24:SUCCESS';
const HOURS_8      = 196; // enum-ID «8 часов»

// Продукты (ID из crm.product.list)
const P = {
  ARKHITEKTURA : 132,
  KRASNORECIE  : 136,
  ZHIVOPIS     : 152,
  MUZYKA       : 148,
  KLASSIKA2    : 146,  // Классика 2.0
  RP           : 134,  // Рекламная пауза
  URAL         : 142,
  SIBIR        : 138,
  YUG          : 140,
  POMORYE      : 118,
  DV           : 144,  // Дальний Восток
};

// Поля «Выход ведущего» (entityTypeId=1056)
const UF = {
  DATE        : 'ufCrm16_1777193655',
  HOURS       : 'ufCrm16_1779107483',
  SALES_CNT   : 'ufCrm16_1777193711',
  TRANSITIONS : 'ufCrm16_1777193805',
  PAYOUT      : 'ufCrm16_1777193828',
};

// Поле «Выручка» в Выставке (entityTypeId=1048)
const UF_REVENUE = 'ufCrm12_1777190536';

// ============================================================
// ДАННЫЕ: ВЫХОДЫ ВЕДУЩИХ — 10 записей, один выход = один день
// ============================================================
// Начисление: 3 500 руб./день + 20% продаж + 2 000 KPI (>40 переходов в день)
// Ольга  (4 дн, 92 950): 8 148 + 8 148 + 8 147 + 8 147 = 32 590
// Даниил (3 дн, 77 530): 8 669 + 8 669 + 8 668 = 26 006
// Сухомицкая (1 дн, 19 660, KPI 62>40): 3 500 + 3 932 + 2 000 = 9 432

const VYHODY = [
  // Музеник Даниил (id=20) — 27, 28, 29 мая
  { vedushiyId: 20, date: '2026-05-27', transitions:  6, salesCnt: 0, payout: 8669 },
  { vedushiyId: 20, date: '2026-05-28', transitions: 29, salesCnt: 0, payout: 8669 },
  { vedushiyId: 20, date: '2026-05-29', transitions: 19, salesCnt: 0, payout: 8668 },
  // Шестикова Екатерина Анатольевна (id=6) — 29 мая
  { vedushiyId:  6, date: '2026-05-29', transitions: 16, salesCnt: 3, payout: 6480 },
  // Звёздочкина Варвара (id=26) — 29 мая
  { vedushiyId: 26, date: '2026-05-29', transitions:  0, salesCnt: 1, payout: 4860 },
  // Макарова Ольга (id=28) — 27, 28, 29, 30 мая
  { vedushiyId: 28, date: '2026-05-27', transitions: 12, salesCnt: 0, payout: 8148 },
  { vedushiyId: 28, date: '2026-05-28', transitions:  9, salesCnt: 0, payout: 8148 },
  { vedushiyId: 28, date: '2026-05-29', transitions: 23, salesCnt: 0, payout: 8147 },
  { vedushiyId: 28, date: '2026-05-30', transitions:  6, salesCnt: 0, payout: 8147 },
  // Сухомицкая Екатерина (id=14) — 30 мая, KPI: 62 перехода > 40 → +2 000
  { vedushiyId: 14, date: '2026-05-30', transitions: 62, salesCnt: 4, payout: 9432 },
];

// ============================================================
// ДАННЫЕ: СДЕЛКИ — одна сделка = одна проданная игра
// Источник: строка продаж из таблицы арх_москва.xlsx
// vedushiyId → parentId1052 (Ведущий)
// assignedById → ASSIGNED_BY_ID (только для сотрудника Аня)
// ============================================================

const SDELKI = [

  // ── Музеник Даниил (id=20) ──────────────────────────────
  // 'красн 6800 арх 6120 жив 6100 арх 6800 на 4 красн 6120 арх 6120 красн 6800 красн 6150 арх 6120'
  // Итого идентифицировано: 69 490 руб. | «на 4» = 4 × Красноречие 6 120
  // Неидентифицировано: ~8 040 руб. — вынесено отдельной сделкой
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6800, gameName: 'Красноречие'    },
  { vedushiyId: 20, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  { vedushiyId: 20, productId: P.ZHIVOPIS,     price: 6100, gameName: 'Живопись'        },
  { vedushiyId: 20, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6120, gameName: 'Красноречие'    }, // на 4 × 1
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6120, gameName: 'Красноречие'    }, // на 4 × 2
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6120, gameName: 'Красноречие'    }, // на 4 × 3
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6120, gameName: 'Красноречие'    }, // на 4 × 4
  { vedushiyId: 20, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6800, gameName: 'Красноречие'    },
  { vedushiyId: 20, productId: P.KRASNORECIE,  price: 6150, gameName: 'Красноречие'    },
  { vedushiyId: 20, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  // ~8 040 руб. не расшифровано — уточнить вручную
  { vedushiyId: 20, productId: null,            price: 8040, gameName: '⚠ Уточнить'    },

  // ── Шестикова Екатерина Анатольевна (id=6) ──────────────
  // '1300 помор 6800 арх 6800 арх'  → сумма: 14 900 ✓
  { vedushiyId:  6, productId: P.POMORYE,      price: 1300, gameName: 'По-Поморски'    },
  { vedushiyId:  6, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId:  6, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },

  // ── Звёздочкина Варвара (id=26) ─────────────────────────
  // '6800 арх'  → сумма: 6 800 ✓
  { vedushiyId: 26, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },

  // ── Макарова Ольга (id=28) ──────────────────────────────
  // 'арз 6800 арх 6800 арх 6800 арх 6800 урал 1399 арх 6800 жив 6800 арх 6800 урал 1300
  //  юг 1300 поморье 1300 рп 3510 рп 3510 юг 1170 арх 6120 6120 арх оля 6800 арх музыка 6120 6800 арх'
  // Итого по строке: ~93 049 руб. (расхождение 99 руб. — ручная запись)
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    }, // арз
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.URAL,         price: 1399, gameName: 'Урал'           },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.ZHIVOPIS,     price: 6800, gameName: 'Живопись'       },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.URAL,         price: 1300, gameName: 'Урал'           },
  { vedushiyId: 28, productId: P.YUG,          price: 1300, gameName: 'Юг'             },
  { vedushiyId: 28, productId: P.POMORYE,      price: 1300, gameName: 'По-Поморски'    },
  { vedushiyId: 28, productId: P.RP,           price: 3510, gameName: 'Рекламная пауза'},
  { vedushiyId: 28, productId: P.RP,           price: 3510, gameName: 'Рекламная пауза'},
  { vedushiyId: 28, productId: P.YUG,          price: 1170, gameName: 'Юг'             },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    }, // 6120 арх
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    }, // оля 6800 арх
  { vedushiyId: 28, productId: P.MUZYKA,       price: 6120, gameName: 'Музыка'         },
  { vedushiyId: 28, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    }, // 6800 арх

  // ── Сухомицкая Екатерина (id=14) ────────────────────────
  // '1300 сиб 6120 арх муз 6120 жив 6120'  → сумма: 19 660 ✓
  { vedushiyId: 14, productId: P.SIBIR,        price: 1300, gameName: 'Сибирь'         },
  { vedushiyId: 14, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  { vedushiyId: 14, productId: P.MUZYKA,       price: 6120, gameName: 'Музыка'         },
  { vedushiyId: 14, productId: P.ZHIVOPIS,     price: 6120, gameName: 'Живопись'       },

  // ── Анна Киптилая (сотрудник, user id=112) ──────────────
  // 'АРХ 6800 арх 6800 арх 6120 урал 1170 дв 1300 сибирь 1170 красн 6800 юг 1300 урал 1300
  //  рп 3900 6100 арх 6800 арх дв 1300 6120 арх 6120 арх жив 6120 арх 6120 класс 6120 6120 арх 1170 помор'
  // Итого: 88 750 ✓
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    },
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    },
  { assignedById: 112, productId: P.URAL,         price: 1170, gameName: 'Урал'           },
  { assignedById: 112, productId: P.DV,           price: 1300, gameName: 'Дальний Восток' },
  { assignedById: 112, productId: P.SIBIR,        price: 1170, gameName: 'Сибирь'         },
  { assignedById: 112, productId: P.KRASNORECIE,  price: 6800, gameName: 'Красноречие'    },
  { assignedById: 112, productId: P.YUG,          price: 1300, gameName: 'Юг'             },
  { assignedById: 112, productId: P.URAL,         price: 1300, gameName: 'Урал'           },
  { assignedById: 112, productId: P.RP,           price: 3900, gameName: 'Рекламная пауза'},
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6100, gameName: 'Архитектура'    }, // 6100 арх
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6800, gameName: 'Архитектура'    }, // 6800 арх
  { assignedById: 112, productId: P.DV,           price: 1300, gameName: 'Дальний Восток' },
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    }, // 6120 арх
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    }, // 6120 арх
  { assignedById: 112, productId: P.ZHIVOPIS,     price: 6120, gameName: 'Живопись'       },
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    }, // арх 6120
  { assignedById: 112, productId: P.KLASSIKA2,    price: 6120, gameName: 'Классика 2.0'   },
  { assignedById: 112, productId: P.ARKHITEKTURA, price: 6120, gameName: 'Архитектура'    }, // 6120 арх
  { assignedById: 112, productId: P.POMORYE,      price: 1170, gameName: 'По-Поморски'    }, // 1170 помор
];

// ============================================================
// ШАГ 1: Выходы ведущих
// ============================================================
async function createVyhody() {
  log('=== ШАГ 1: Выходы ведущих (10 записей) ===');
  let ok = 0;

  for (const v of VYHODY) {
    const dd    = v.date.slice(5).replace('-', '.');
    const title = `АРХ МОСКВА ${dd} — вед.${v.vedushiyId}`;

    const result = await b24('crm.item.add', {
      entityTypeId: 1056,
      fields: {
        title,
        stageId          : STAGE_VYKHOD,
        parentId1048     : VYSTAVKA_ID,
        parentId1052     : v.vedushiyId,
        begindate        : v.date,
        closedate        : v.date,
        [UF.DATE]        : v.date,
        [UF.HOURS]       : HOURS_8,
        [UF.TRANSITIONS] : v.transitions,
        [UF.SALES_CNT]   : v.salesCnt,
        [UF.PAYOUT]      : `${v.payout}|RUB`,
      },
    });

    ok++;
    log(`  ✓ #${result?.item?.id} | вед.${v.vedushiyId} | ${v.date} | ${v.transitions} перех. | ${v.payout} руб.`);
  }

  log(`  Итого: ${ok}/10\n`);
}

// ============================================================
// ШАГ 2: Сделки (одна игра = одна сделка)
// ============================================================
async function createSdelki() {
  log(`=== ШАГ 2: Сделки (${SDELKI.length} записей) ===`);
  let ok = 0;

  for (const s of SDELKI) {
    const title = `АРХ МОСКВА — ${s.gameName} ${s.price.toLocaleString('ru')} руб.`;

    const fields = {
      TITLE                : title,
      CATEGORY_ID          : CAT_B2C,
      STAGE_ID             : STAGE_DEAL,
      OPPORTUNITY          : s.price,
      CURRENCY_ID          : 'RUB',
      IS_MANUAL_OPPORTUNITY: 'N',
      SOURCE_ID            : 'OFFLINE_EVENT',
      parentId1048         : VYSTAVKA_ID,
    };

    if (s.vedushiyId)   fields.parentId1052   = s.vedushiyId;
    if (s.assignedById) fields.ASSIGNED_BY_ID = s.assignedById;

    const dealId = await b24('crm.deal.add', { fields });
    ok++;
    log(`  ✓ #${dealId} | ${title}`);

    // Привязать товар (если есть productId)
    if (s.productId) {
      await b24('crm.deal.productrows.set', {
        id  : dealId,
        rows: [{ PRODUCT_ID: s.productId, PRICE: s.price, QUANTITY: 1, CURRENCY_ID: 'RUB' }],
      });
    }
  }

  log(`  Итого: ${ok}/${SDELKI.length}\n`);
}

// ============================================================
// ШАГ 3: Обновление мероприятия АРХ МОСКВА
// ============================================================
async function updateVystavka() {
  log('=== ШАГ 3: Обновление мероприятия АРХ МОСКВА (id=4) ===');

  await b24('crm.item.update', {
    entityTypeId: 1048,
    id: VYSTAVKA_ID,
    fields: { [UF_REVENUE]: 300590 },
  });

  log('  ✓ Выручка: 300 590 руб.');
  log('  ! Фактические расходы (гонорары 97 118 руб.) — внести вручную (ufCrm12_1777190514)\n');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('Старт импорта АРХ МОСКВА 27-30.05.2026');
  log(`Портал: ${WEBHOOK.replace(/\/rest\/.+/, '')}`);
  log(`Всего сделок: ${SDELKI.length} | Выходов: ${VYHODY.length}\n`);

  try {
    await createVyhody();
    await createSdelki();
    await updateVystavka();

    log('✓ Импорт завершён');
    log('');
    log('TODO — ручные шаги:');
    log('  1. Сделка «⚠ Уточнить» Даниила (~8 040 руб.) — добавить игры вручную');
    log('  2. Внести фактические расходы в мероприятие: 97 118 руб.');
    log('  3. Настроить поля остатков склада в каталоге и скорректировать вручную');
    log('  4. Проверить связи: Выставка → Ведущие → Выходы → Сделки');
  } catch (err) {
    console.error('\n✗ Ошибка:', err.message);
    process.exit(1);
  }
}

main();
