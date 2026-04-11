// ============================================================
// ТЕСТ: создать одно поле в смарт-процессе Мероприятия
// Запускать в консоли браузера (F12) на любой странице Битрикс24
// ============================================================

(async () => {
  // Получаем CSRF токен из Битрикс24
  const sessid = (typeof BX !== 'undefined' && BX.bitrix_sessid)
    ? BX.bitrix_sessid()
    : '';

  const payload = {
    sessid,
    moduleId: 'crm',
    field: {
      entityId: 'CRM_1038',      // Мероприятия (entityTypeId=1038)
      fieldName: 'TEST_VISITORS', // FIELD_NAME без префикса UF_CRM_
      userTypeId: 'integer',
      editFormLabel: '[ТЕСТ] Посетителей стенда',
      listColumnLabel: 'Посетителей',
      mandatory: 'N',
      multiple: 'N'
    }
  };

  console.log('Отправляем запрос...');

  const resp = await fetch('/rest/userfieldconfig.add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  console.log('Результат:', JSON.stringify(data, null, 2));

  if (data.result) {
    console.log('✅ Поле создано! ID:', data.result);
    console.log('Теперь можно запускать полный скрипт create-all-fields.js');
  } else {
    console.log('❌ Ошибка:', data.error_description || data.error);
    // Пробуем другой формат entityId
    console.log('Пробуем формат DYNAMIC_1038...');
    payload.field.entityId = 'DYNAMIC_1038';
    payload.field.fieldName = 'TEST_VISITORS2';
    const resp2 = await fetch('/rest/userfieldconfig.add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data2 = await resp2.json();
    console.log('Результат с DYNAMIC_1038:', JSON.stringify(data2, null, 2));
  }
})();
