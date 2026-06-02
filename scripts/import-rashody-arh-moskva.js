'use strict';
const fs = require('fs');
const env = Object.fromEntries(
  fs.readFileSync('/root/projects/talk/.env','utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);
const WEBHOOK = env.B24_WEBHOOK;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function b24(method, params, attempt = 1) {
  await sleep(600);
  try {
    const r = await fetch(`${WEBHOOK}${method}`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(params)
    });
    const d = await r.json();
    if (d.error) throw new Error(`${method}: ${d.error} — ${d.error_description}`);
    return d.result;
  } catch (e) {
    if (attempt < 3 && !e.message?.startsWith(method)) {
      await sleep(2500); return b24(method, params, attempt + 1);
    }
    throw e;
  }
}

// Enum IDs UF_CRM_24_EXPENSE_TYPE (из userfieldconfig.get id=574)
const ENUM = {
  'Аренда стенда':                 '210',
  'Оклейка / оформление стенда':   '212',
  'Полиграфия (лифлеты, баннеры)': '214',
  'Логистика':                      '216',
  'Ведущие (комиссия)':             '218',
  'Игры в подарок / промо':         '220',
  'Прочее':                         '222',
};

const ENTITY_TYPE_ID = 1070;
const CATEGORY_ID   = 32;
const STAGE_ID      = 'DT1070_32:SUCCESS'; // Оплачено
const VYSTAVKA_ID   = 4;

const rows = [
  { title: 'Аренда стенда',              type: 'Аренда стенда',                   desc: 'Аренда выставочной площади стандартного стенда + регистрационный сбор', qty: 1,   price: 276635, amount: 276635 },
  { title: 'Оклейка стенда',             type: 'Оклейка / оформление стенда',      desc: 'Мебель, печать и монтаж баннеров на стенд',                            qty: 1,   price: 145930, amount: 145930 },
  { title: 'Лифлеты (полиграфия)',        type: 'Полиграфия (лифлеты, баннеры)',    desc: 'Листовка 210×60 (300 шт.), буклет А4 (300 шт.) + доставка',            qty: 450, price: 17.33,  amount: 7798.5 },
  { title: 'Логистика',                  type: 'Логистика',                         desc: 'Доставка игр, заезд и выезд с выставки',                               qty: 1,   price: 12403,  amount: 12403  },
  { title: 'Ведущие (выходы + KPI)',      type: 'Ведущие (комиссия)',               desc: '4 дня, 6 человек. Комиссионные с продаж (без оклада)',                  qty: 1,   price: 60118,  amount: 60118  },
  { title: 'Игры в подарок на выставке', type: 'Игры в подарок / промо',            desc: 'Архитектура × 4, цена 6 800 руб./шт.',                                  qty: 4,   price: 6800,   amount: 27200  },
];

(async () => {
  console.log('Создаём записи расходов АРХ МОСКВА...\n');
  const created = [];

  for (const row of rows) {
    const enumId = ENUM[row.type];
    const item = await b24('crm.item.add', {
      entityTypeId: ENTITY_TYPE_ID,
      fields: {
        title:              row.title,
        categoryId:         CATEGORY_ID,
        stageId:            STAGE_ID,
        parentId1048:       VYSTAVKA_ID,
        ufCrm24ExpenseType: [enumId],
        ufCrm24Description: row.desc,
        ufCrm24Qty:         row.qty,
        ufCrm24PriceUnit:   row.price,
        ufCrm24Amount:      row.amount,
      }
    });
    const id = item?.item?.id;
    console.log(`✓ id=${id} | ${row.title} | ${row.amount.toLocaleString('ru-RU')} руб.`);
    created.push(id);
  }

  // Итоговая проверка
  const list = await b24('crm.item.list', {
    entityTypeId: ENTITY_TYPE_ID,
    select: ['id','title','ufCrm24Amount','ufCrm24ExpenseType','parentId1048']
  });
  const items = list?.items || [];
  const total = items.reduce((s, i) => s + Number(i.ufCrm24Amount || 0), 0);

  console.log('\n=== Расходы АРХ МОСКВА ===');
  for (const it of items) {
    const amt = Number(it.ufCrm24Amount || 0).toLocaleString('ru-RU');
    console.log(`  ${it.id} | "${it.title}" | ${amt} руб.`);
  }
  console.log(`\nИТОГО: ${total.toLocaleString('ru-RU')} руб.`);
  console.log(`Ожидается: 530 084,50 руб.`);
})();
