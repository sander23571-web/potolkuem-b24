'use strict';
/**
 * Создаёт СП «Статистика площадок» в Bitrix24 и добавляет UF-поля.
 *
 * Запуск: node scripts/setup-platform-stats-sp.js
 * После успешного запуска — вписать typeId в CLAUDE.md.
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

async function addField(entityId, typeId, fieldName, userTypeId, label, extra = {}) {
  await sleep(300);
  // fieldName уже содержит полный префикс UF_CRM_{typeId}_SUFFIX
  const result = await b24('userfieldconfig.add', {
    moduleId: 'crm',
    field: {
      entityId,
      fieldName,
      userTypeId,
      editFormLabel: { ru: label },
      listColumnLabel: { ru: label },
      mandatory: 'N',
      multiple: 'N',
      ...extra,
    },
  });
  console.log(`  ✅ ${label} (${fieldName}) → id=${result}`);
  return result;
}

(async () => {
  // ── 1. Создать СП ──────────────────────────────────────────────────────────
  console.log('1. Создаём СП «Статистика площадок»...');
  const typeResult = await b24('crm.type.add', {
    fields: {
      title: 'Статистика площадок',
      isUseInUserfieldEnabled: 'Y',
    },
  });
  const typeId      = typeResult?.type?.id;
  const entityTypeId = typeResult?.type?.entityTypeId;
  if (!typeId) throw new Error('crm.type.add не вернул typeId: ' + JSON.stringify(typeResult));
  console.log(`   typeId=${typeId}, entityTypeId=${entityTypeId}`);

  // ── 2. Включить UF-поля (на случай если не сработало в add) ───────────────
  console.log('2. Включаем isUseInUserfieldEnabled...');
  await b24('crm.type.update', {
    id: typeId,
    fields: { isUseInUserfieldEnabled: 'Y' },
  });
  console.log('   OK');

  // ── 3. Добавляем поля ─────────────────────────────────────────────────────
  console.log(`3. Добавляем поля (entityId=CRM_${typeId})...`);
  const eid = `CRM_${typeId}`;
  const pre = `UF_CRM_${typeId}`;

  await addField(eid, typeId, `${pre}_PLATFORM`,        'string',  'Площадка');
  await addField(eid, typeId, `${pre}_PERIOD`,          'date',    'Период (1-е число месяца)');
  await addField(eid, typeId, `${pre}_FOLLOWERS`,       'integer', 'Подписчиков');
  await addField(eid, typeId, `${pre}_FOLLOWERS_DIFF`,  'integer', 'Прирост подписчиков');
  await addField(eid, typeId, `${pre}_ER`,              'double',  'ER %');
  await addField(eid, typeId, `${pre}_REACH`,           'integer', 'Охват');
  await addField(eid, typeId, `${pre}_VISITS_TOTAL`,    'integer', 'Визитов всего');
  await addField(eid, typeId, `${pre}_VISITS_ORGANIC`,  'integer', 'Визитов органика');
  await addField(eid, typeId, `${pre}_VISITS_PAID`,     'integer', 'Визитов платный');
  await addField(eid, typeId, `${pre}_BOUNCE_RATE`,     'double',  'Отказы %');
  await addField(eid, typeId, `${pre}_CLICKS`,          'integer', 'Клики (Вебмастер)');
  await addField(eid, typeId, `${pre}_IMPRESSIONS`,     'integer', 'Показы (Вебмастер)');
  await addField(eid, typeId, `${pre}_BRAND_DEMAND`,    'integer', 'Брендовый спрос (Wordstat)');

  console.log(`\n✅ СП создан: typeId=${typeId}, entityTypeId=${entityTypeId}`);
  console.log(`\nВпишите в CLAUDE.md:`);
  console.log(`| Статистика площадок | ${typeId} | ${entityTypeId} | ? | CRM_${typeId} |`);
  console.log(`\nДля cron-скрипта: PLATFORM_STATS_TYPE_ID=${typeId}, PLATFORM_STATS_ENTITY_TYPE_ID=${entityTypeId}`);
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
