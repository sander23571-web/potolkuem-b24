// ============================================================
// ПОЛНЫЙ СКРИПТ: создать все поля во всех смарт-процессах
// Запускать в консоли браузера (F12) на любой странице Битрикс24
// ПОСЛЕ того как тест test-field-create.js прошёл успешно
//
// Перед запуском заменить ENTITY_ID_FORMAT на то,
// что сработало в тесте: 'CRM_1038' или 'DYNAMIC_1038'
// ============================================================

const ENTITY_ID_FORMAT = 'CRM'; // будет: CRM_1038, CRM_1040 и т.д.

// Формируем entityId по формату
const eid = (typeId) => `${ENTITY_ID_FORMAT}_${typeId}`;

// Задержка между запросами (мс) — чтобы не перегрузить сервер
const DELAY = 300;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Получаем CSRF токен
const sessid = (typeof BX !== 'undefined' && BX.bitrix_sessid)
  ? BX.bitrix_sessid()
  : '';

// Создать одно поле
async function createField(entityTypeId, fieldName, userTypeId, label, extra = {}) {
  const payload = {
    sessid,
    moduleId: 'crm',
    field: {
      entityId: eid(entityTypeId),
      fieldName,
      userTypeId,
      editFormLabel: label,
      listColumnLabel: label,
      mandatory: 'N',
      multiple: 'N',
      ...extra
    }
  };

  const resp = await fetch('/rest/userfieldconfig.add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  if (data.result) {
    console.log(`  ✅ ${label} → ID ${data.result}`);
  } else {
    console.warn(`  ❌ ${label}: ${data.error_description || data.error}`);
  }
  await sleep(DELAY);
  return data;
}

// Создать поле типа "список"
async function createEnumField(entityTypeId, fieldName, label, values, extra = {}) {
  const list = values.map((v, i) => ({ VALUE: v, SORT: (i + 1) * 10 }));
  return createField(entityTypeId, fieldName, 'enumeration', label, {
    settings: { DISPLAY: 'UI', LIST_HEIGHT: Math.min(values.length, 5) },
    list,
    ...extra
  });
}

// ============================================================
// ОПРЕДЕЛЕНИЯ ПОЛЕЙ
// ============================================================

async function createMeropriyatiyaFields() {
  console.log('\n📅 Мероприятия (entityTypeId: 1038)');
  const t = 1038;
  await createEnumField(t, 'EVENT_TYPE', 'Тип мероприятия',
    ['Выставка', 'Акция на локации', 'Открытая игра'], { mandatory: 'Y' });
  await createField(t, 'LOCATION', 'string', 'Место проведения');
  await createField(t, 'VISITORS', 'integer', 'Посетителей стенда');
  await createField(t, 'CONTACTS_COLLECTED', 'integer', 'Контактов собрано');
  await createField(t, 'SALES_COUNT', 'integer', 'Продано экземпляров');
  await createField(t, 'AMB_COUNT', 'integer', 'Амбассадоров на мероприятии');
  await createField(t, 'AMB_SESSIONS', 'integer', 'Игровых сессий проведено');
  await createField(t, 'AMB_FEE_PLAN', 'double', 'Гонорар амбассадорам — план');
  await createField(t, 'AMB_FEE_FACT', 'double', 'Гонорар амбассадорам — факт');
  await createField(t, 'BUDGET_PLAN', 'double', 'Бюджет — план');
  await createField(t, 'EXPENSES_FACT', 'double', 'Расходы — факт');
  await createField(t, 'REVENUE', 'double', 'Выручка');
  await createEnumField(t, 'RATING', 'Оценка мероприятия',
    ['1 — Плохо', '2 — Ниже ожиданий', '3 — Норма', '4 — Хорошо', '5 — Отлично']);
  await createField(t, 'WHAT_WORKED', 'string', 'Что сработало',
    { settings: { ROWS: 4 } });
  await createField(t, 'WHAT_TO_IMPROVE', 'string', 'Что улучшить',
    { settings: { ROWS: 4 } });
}

async function createRazrabotkaFields() {
  console.log('\n🔧 Разработка игр (entityTypeId: 1040)');
  const t = 1040;
  await createEnumField(t, 'GAME_SERIES', 'Серия игры',
    ['Универсальные', 'Тематические', 'Региональные', 'Спецвыпуски']);
  await createField(t, 'GAME_CONCEPT', 'string', 'Концепция / описание',
    { settings: { ROWS: 4 } });
  await createField(t, 'GAME_TARGET', 'string', 'Целевая аудитория');
  await createField(t, 'GAME_CARDS_COUNT', 'integer', 'Количество карточек');
  await createField(t, 'GAME_EXPERT', 'string', 'Эксперт по контенту');
  await createField(t, 'GAME_CONTRACTOR', 'string', 'Подрядчик');
  await createField(t, 'GAME_RELEASE_PLAN', 'date', 'Плановая дата выпуска');
  await createField(t, 'GAME_RELEASE_FACT', 'date', 'Фактическая дата выпуска');
  await createField(t, 'BUDGET_CONTENT_PLAN', 'double', 'Контент — план');
  await createField(t, 'BUDGET_CONTENT_FACT', 'double', 'Контент — факт');
  await createField(t, 'BUDGET_DESIGN_PLAN', 'double', 'Дизайн — план');
  await createField(t, 'BUDGET_DESIGN_FACT', 'double', 'Дизайн — факт');
  await createField(t, 'BUDGET_PRODUCTION_PLAN', 'double', 'Производство — план');
  await createField(t, 'BUDGET_PRODUCTION_FACT', 'double', 'Производство — факт');
  await createField(t, 'GAME_CIRCULATION', 'integer', 'Тираж (штук)');
  await createField(t, 'GAME_COST_UNIT_PLAN', 'double', 'Себестоимость ед. — план');
  await createField(t, 'GAME_COST_UNIT_FACT', 'double', 'Себестоимость ед. — факт');
  await createField(t, 'GAME_PRICE', 'double', 'Цена продажи');
}

async function createTochkiFields() {
  console.log('\n📍 Точки продаж (entityTypeId: 1042)');
  const t = 1042;
  await createEnumField(t, 'LOCATION_TYPE', 'Тип локации',
    ['Книжный магазин', 'Кафе / кофейня', 'Музей / галерея', 'Коворкинг', 'Школа / вуз', 'Другое']);
  await createField(t, 'LOCATION_ADDRESS', 'string', 'Адрес');
  await createEnumField(t, 'DEAL_TERMS', 'Условия работы',
    ['Реализация', 'Закупка', 'Депозит']);
  await createField(t, 'COMMISSION_PCT', 'double', 'Комиссия %');
  await createField(t, 'STOCK_CURRENT', 'integer', 'Остаток на точке');
  await createField(t, 'SALES_PLAN_MONTH', 'integer', 'План продаж / мес');
  await createField(t, 'SALES_LAST_MONTH', 'integer', 'Продажи — последний месяц');
  await createField(t, 'LAST_SUPPLY_DATE', 'date', 'Дата последней поставки');
  await createField(t, 'LAST_VISIT_DATE', 'date', 'Дата последнего визита');
  await createField(t, 'LOCATION_NOTE', 'string', 'Примечания',
    { settings: { ROWS: 3 } });
}

async function createMarketplacesFields() {
  console.log('\n🛒 Маркетплейсы (entityTypeId: 1044)');
  const t = 1044;
  await createEnumField(t, 'MP_PLATFORM', 'Платформа',
    ['Wildberries', 'Ozon', 'Яндекс Маркет', 'Детский Мир', 'Flowwow', 'Другое'],
    { mandatory: 'Y' });
  await createField(t, 'MP_GAME', 'string', 'Игра (название)');
  await createField(t, 'MP_URL', 'url', 'Ссылка на страницу товара');
  await createField(t, 'MP_RATING', 'double', 'Рейтинг');
  await createField(t, 'MP_POSITION', 'integer', 'Позиция в поиске');
  await createField(t, 'MP_REVIEWS_TOTAL', 'integer', 'Всего отзывов');
  await createField(t, 'MP_REVIEWS_PENDING', 'integer', 'Отзывов без ответа');
  await createField(t, 'MP_STOCK', 'integer', 'Остаток на складе MP');
  await createField(t, 'MP_REVENUE_MONTH', 'double', 'Выручка за месяц');
  await createField(t, 'MP_PROMO_ACTIVE', 'boolean', 'Активная акция');
  await createField(t, 'MP_PROMO_DISCOUNT', 'double', 'Скидка %');
  await createField(t, 'MP_PROMO_END', 'date', 'Дата окончания акции');
  await createField(t, 'MP_NOTES', 'string', 'Задачи / Примечания',
    { settings: { ROWS: 3 } });
}

async function createPostavkiFields() {
  console.log('\n📦 Поставки (entityTypeId: 1046)');
  const t = 1046;
  await createField(t, 'SUPPLY_GAME', 'string', 'Игра (название)');
  await createField(t, 'SUPPLY_QTY', 'integer', 'Тираж (штук)');
  await createField(t, 'SUPPLY_CONTRACTOR', 'string', 'Производитель');
  await createField(t, 'SUPPLY_COST_PLAN', 'double', 'Себестоимость — план (руб/шт)');
  await createField(t, 'SUPPLY_COST_FACT', 'double', 'Себестоимость — факт (руб/шт)');
  await createField(t, 'SUPPLY_TOTAL_PLAN', 'double', 'Сумма заказа — план');
  await createField(t, 'SUPPLY_DATE_PLAN', 'date', 'Плановая дата готовности');
  await createField(t, 'SUPPLY_DATE_FACT', 'date', 'Фактическая дата получения');
  await createField(t, 'SUPPLY_QTY_DEFECT', 'integer', 'Брак (штук)');
  await createField(t, 'SUPPLY_NOTE', 'string', 'Примечания',
    { settings: { ROWS: 3 } });
}

// ============================================================
// ЗАПУСК
// ============================================================

(async () => {
  console.log('🚀 Начинаем создание полей...');
  console.log(`ENTITY_ID формат: ${ENTITY_ID_FORMAT}_*`);

  await createMeropriyatiyaFields();
  await createRazrabotkaFields();
  await createTochkiFields();
  await createMarketplacesFields();
  await createPostavkiFields();

  console.log('\n✅ Готово! Все поля созданы.');
  console.log('Проверьте каждый смарт-процесс в CRM.');
})();
