'use strict';
/**
 * Добавляет два UF-поля в СП «Расходы» (typeId=24, entityId=CRM_24):
 *   - UF_CRM_24_DIRECTION  (enumeration) — Направление
 *   - UF_CRM_24_CHANNEL    (enumeration) — Канал
 *
 * Запуск: node scripts/setup-expense-fields.js
 */

const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('/root/projects/talk/.env', 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const WEBHOOK = env.B24_WEBHOOK;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function b24(method, params) {
  await sleep(500);
  const r = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const d = await r.json();
  if (d.error) throw new Error(`${method}: ${d.error} — ${d.error_description}`);
  return d.result;
}

async function addEnumField(fieldName, label, values) {
  const list = values.map((v, i) => ({ VALUE: v, SORT: (i + 1) * 10 }));
  const result = await b24('userfieldconfig.add', {
    moduleId: 'crm',
    field: {
      entityId: 'CRM_24',
      fieldName,
      userTypeId: 'enumeration',
      editFormLabel: { ru: label },
      listColumnLabel: { ru: label },
      mandatory: 'N',
      multiple: 'N',
      settings: { DISPLAY: 'UI', LIST_HEIGHT: Math.min(values.length, 6) },
      list,
    },
  });
  console.log(`✅ ${label} (${fieldName}) → id=${result}`);
  return result;
}

(async () => {
  console.log('Добавляем поля в СП Расходы (CRM_24)...\n');

  await addEnumField('UF_CRM_24_DIRECTION', 'Направление', [
    'Выставки',
    'Маркетинг',
    'Операционные',
  ]);

  await addEnumField('UF_CRM_24_CHANNEL', 'Канал', [
    'Директ',
    'VK Реклама',
    'Посевы',
    'Агентство',
    'SEO',
    'Другое',
  ]);

  console.log('\nГотово. Проверьте поля в CRM → Смарт-процессы → Расходы.');
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
