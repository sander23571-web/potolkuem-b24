'use strict';
/**
 * activity-data.js — данные для дашборда /report/creative ("Активность Креативного директора").
 *
 * Источник: СП «Задачи Креативного Директора» (typeId=42, entityTypeId=1100), 4 категории:
 * Соцсети(60) / Журнал «Потолкуем?»(62) / Дизайнерские работы(64) / Съёмки(66).
 * Создано и наполнено тестовыми данными 29-30.08.2026 (см. proj log --project talk).
 */

require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK = process.env.B24_WEBHOOK;
const B24_URL = 'https://potolkuem.bitrix24.ru';
const ENTITY_TYPE_ID = 1100;

const CATEGORY = { SOCIAL: 60, JOURNAL: 62, DESIGN: 64, SHOOTS: 66 };

// Стадии — захардкожены (созданы вручную 29.08, устойчивый список, id STATUS_ID не меняются).
// SUCCESS/FAIL — терминальные (по ним считаем «в работе» vs «завершено»/«просрочено»).
const STAGES = {
  [CATEGORY.SOCIAL]: [
    { id: 'DT1100_60:NEW', name: 'Черновик' },
    { id: 'DT1100_60:SUCCESS', name: 'Опубликовано', terminal: true },
    { id: 'DT1100_60:FAIL', name: 'Отменено', terminal: true },
  ],
  [CATEGORY.JOURNAL]: [
    { id: 'DT1100_62:NEW', name: 'Запланирована' },
    { id: 'DT1100_62:PREPARATION', name: 'В работе у копирайтера' },
    { id: 'DT1100_62:CLIENT', name: 'Сдана редактору' },
    { id: 'DT1100_62:UC_ALENA_REVIEWED', name: 'Проверена' },
    { id: 'DT1100_62:UC_ALENA_VISUALS', name: 'Визуалы готовы' },
    { id: 'DT1100_62:SUCCESS', name: 'Опубликована', terminal: true },
    { id: 'DT1100_62:FAIL', name: 'Отклонена', terminal: true },
  ],
  [CATEGORY.DESIGN]: [
    { id: 'DT1100_64:NEW', name: 'Поставлена' },
    { id: 'DT1100_64:PREPARATION', name: 'В работе' },
    { id: 'DT1100_64:CLIENT', name: 'На согласовании' },
    { id: 'DT1100_64:SUCCESS', name: 'Готово', terminal: true },
    { id: 'DT1100_64:FAIL', name: 'Отменена', terminal: true },
  ],
  [CATEGORY.SHOOTS]: [
    { id: 'DT1100_66:NEW', name: 'Запланировано' },
    { id: 'DT1100_66:PREPARATION', name: 'ТЗ готово' },
    { id: 'DT1100_66:CLIENT', name: 'В работе' },
    { id: 'DT1100_66:UC_ALENA_MATERIAL', name: 'Материал получен' },
    { id: 'DT1100_66:SUCCESS', name: 'Готово', terminal: true },
    { id: 'DT1100_66:FAIL', name: 'Отменено', terminal: true },
  ],
};

// Enum-справочники полей (id варианта -> текст) — сняты при создании полей 29.08.
const ENUM = {
  platform:    { 276: 'VK', 278: 'TG', 280: 'Дзен', 282: 'MAX', 284: 'TikTok', 286: 'Instagram', 288: 'Другое' },
  contentType: { 290: 'Пост', 292: 'Сторис', 294: 'Рилс', 296: 'Карусель' },
  designType:  { 298: 'Презентация', 300: 'Выставочный материал', 302: 'Полиграфия', 304: 'Рекламный креатив',
                 306: 'Генерация изображений', 308: 'Материал для сайта', 310: 'Другое' },
  shootType:   { 312: 'Фотосъёмка', 314: 'Видеосъёмка', 316: 'Выезд контент-мейкера', 318: 'Монтаж' },
  usage:       { 320: 'Соцсети', 322: 'Сайт', 324: 'Каталог' },
};

function stageName(categoryId, stageId) {
  const s = (STAGES[categoryId] || []).find(x => x.id === stageId);
  return s ? s.name : (stageId || '—');
}
function isTerminal(categoryId, stageId) {
  const s = (STAGES[categoryId] || []).find(x => x.id === stageId);
  return !!(s && s.terminal);
}
function isFail(categoryId, stageId) {
  return String(stageId || '').endsWith(':FAIL');
}

// ── Cache (TTL 5 мин, как в b24.js) ─────────────────────────────────────────
let cache = null;
let cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000;
function cacheInvalidateActivity() { cache = null; }

async function b24(method, params = {}) {
  const res = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function fetchAllItems(filter, select) {
  const items = [];
  let start = 0;
  while (true) {
    const res = await b24('crm.item.list', { entityTypeId: ENTITY_TYPE_ID, filter, select, start });
    const batch = res?.result?.items || [];
    items.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return items;
}

const SELECT_COMMON = ['id', 'title', 'categoryId', 'stageId', 'begindate', 'closedate',
  'assignedById', 'createdTime', 'ufCrm42Priority', 'ufCrm42Comment'];

async function fetchActivityData() {
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache;

  const [social, journal, design, shoots, usersRes] = await Promise.all([
    fetchAllItems({ categoryId: CATEGORY.SOCIAL }, [...SELECT_COMMON,
      'ufCrm42SmPlatform', 'ufCrm42SmPublishDate', 'ufCrm42SmContentType', 'ufCrm42SmTopic',
      'ufCrm42SmLink', 'ufCrm42SmViews', 'ufCrm42SmReach', 'ufCrm42SmLikes', 'ufCrm42SmComments',
      'ufCrm42SmShares', 'ufCrm42SmZenCompletion', 'ufCrm42SmZenReadTime', 'ufCrm42SmZenWatchTime',
      'ufCrm42SmZenRetention']),
    fetchAllItems({ categoryId: CATEGORY.JOURNAL }, [...SELECT_COMMON,
      'ufCrm42JCopywriter', 'ufCrm42JTopic', 'ufCrm42JRubric', 'ufCrm42JLink', 'ufCrm42JAuthor',
      'ufCrm42JViews', 'ufCrm42JDesktop', 'ufCrm42JMobile', 'ufCrm42JZen']),
    fetchAllItems({ categoryId: CATEGORY.DESIGN }, [...SELECT_COMMON,
      'ufCrm42DType', 'ufCrm42DProject', 'ufCrm42DExecutor', 'ufCrm42DResultLink', 'ufCrm42DExpenses']),
    fetchAllItems({ categoryId: CATEGORY.SHOOTS }, [...SELECT_COMMON,
      'ufCrm42SType', 'ufCrm42SDate', 'ufCrm42SSubject', 'ufCrm42SUsage', 'ufCrm42SExecutor',
      'ufCrm42STzLink', 'ufCrm42SCost', 'ufCrm42SContract', 'ufCrm42SVolume', 'ufCrm42SSourceLink']),
    b24('user.get', { filter: {}, start: -1 }),
  ]);

  const employees = {};
  for (const u of (usersRes?.result || [])) {
    employees[u.ID] = `${u.LAST_NAME || ''} ${u.NAME || ''}`.trim() || `#${u.ID}`;
  }

  const decorate = (items, categoryId) => items.map(it => ({
    ...it,
    categoryId,
    stageLabel: stageName(categoryId, it.stageId),
    terminal: isTerminal(categoryId, it.stageId),
    failed: isFail(categoryId, it.stageId),
    overdue: !isTerminal(categoryId, it.stageId) && it.begindate && it.begindate.slice(0, 10) < new Date().toISOString().slice(0, 10),
    cycleDays: isTerminal(categoryId, it.stageId) && it.createdTime && it.closedate
      ? Math.max(0, Math.round((new Date(it.closedate) - new Date(it.createdTime)) / 86400000))
      : null,
    responsibleName: employees[it.assignedById] || `#${it.assignedById}`,
  }));

  const data = {
    social:  decorate(social, CATEGORY.SOCIAL).map(it => ({ ...it,
      platformLabel: ENUM.platform[it.ufCrm42SmPlatform] || '—',
      contentTypeLabel: ENUM.contentType[it.ufCrm42SmContentType] || '—',
    })),
    journal: decorate(journal, CATEGORY.JOURNAL).map(it => ({ ...it,
      copywriterName: it.ufCrm42JCopywriter ? (employees[it.ufCrm42JCopywriter] || `#${it.ufCrm42JCopywriter}`) : null,
      authorName: it.ufCrm42JAuthor ? (employees[it.ufCrm42JAuthor] || `#${it.ufCrm42JAuthor}`) : null,
    })),
    design:  decorate(design, CATEGORY.DESIGN).map(it => ({ ...it,
      typeLabel: ENUM.designType[it.ufCrm42DType] || '—',
    })),
    shoots:  decorate(shoots, CATEGORY.SHOOTS).map(it => ({ ...it,
      typeLabel: ENUM.shootType[it.ufCrm42SType] || '—',
      usageLabel: (Array.isArray(it.ufCrm42SUsage) ? it.ufCrm42SUsage : [it.ufCrm42SUsage])
        .filter(Boolean).map(v => ENUM.usage[v] || v).join(', '),
    })),
    employees,
    stages: STAGES,
    fetchedAt: new Date().toISOString(),
    b24Url: B24_URL,
    entityTypeId: ENTITY_TYPE_ID,
  };

  cache = data;
  cacheTs = Date.now();
  return data;
}

module.exports = { fetchActivityData, cacheInvalidateActivity, CATEGORY, STAGES, ENUM };
