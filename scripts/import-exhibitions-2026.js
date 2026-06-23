/**
 * Импорт грядущих выставок 2026–2027 в СП «Выставки» (entityTypeId=1048)
 *
 * Источник: «ВЫСТАВКИ 2026 от СТАСА.xlsx»
 * Дата: 2026-06-03
 *
 * Что делает:
 *   - Обновляет Красная площадь (id=6) — неверные даты
 *   - Создаёт 7 новых выставок
 *   - ММКВЯ пропущена (перенесена)
 *
 * Стадия всех новых: DT1048_20:UC_7T06OH (Идея/План)
 * categoryId: 20
 */

const WEBHOOK = 'https://potolkuem.bitrix24.ru/rest/134/gj6y27ehe0f42jeb/';

async function apiCall(method, params) {
  const res = await fetch(WEBHOOK + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (data.error) throw new Error(`${method}: ${data.error_description || data.error}`);
  return data.result;
}

// ──────────────────────────────────────────────
// Данные выставок
// ──────────────────────────────────────────────

const NEW_EXHIBITIONS = [
  {
    title:     'Мосигра & ORAORA',
    begindate: '2026-08-31',
    closedate: '2026-08-31',
    location:  'Москва, ЦДМ',
  },
  {
    title:     'Cosmoscow',
    begindate: '2026-10-04',
    closedate: '2026-10-06',
    location:  'Москва, Тимирязев-центр',
  },
  {
    title:     'InterCHARM 2026',
    begindate: '2026-10-14',
    closedate: '2026-10-17',
    location:  'Москва, Крокус Экспо',
  },
  {
    title:     'ПИР Экспо 2026',
    begindate: '2026-10-26',
    closedate: '2026-10-29',
    location:  'Москва, Крокус Экспо',
  },
  {
    title:     'Российский антикварный салон',
    begindate: '2026-11-26',
    closedate: '2026-11-30',
    location:  'Москва, Гостиный двор',
  },
  {
    title:     'Игрокон 2027',
    begindate: '2027-01-24',
    closedate: '2027-01-25',
    location:  'Москва',
  },
  {
    title:     'ARTDOM 2027',
    begindate: '2027-02-18',
    closedate: '2027-02-20',
    location:  'Москва, Гостиный двор',
  },
];

// ──────────────────────────────────────────────
// Запуск
// ──────────────────────────────────────────────

async function main() {
  console.log('=== Импорт выставок 2026–2027 ===\n');

  // 1. Обновить Красная площадь (id=6) — неверные даты
  console.log('Обновляю Красная площадь (id=6) — даты 02–06.09.2026...');
  const updated = await apiCall('crm.item.update', {
    entityTypeId: 1048,
    id: 6,
    fields: {
      title:     'Красная площадь 2026',
      begindate: '2026-09-02',
      closedate: '2026-09-06',
      stageId:   'DT1048_20:UC_7T06OH',
      'ufCrm12_1777190355': 'Москва, Красная площадь',
    }
  });
  console.log(`  ✓ Обновлено: id=6 «${updated.item.title}»`);

  // 2. Создать новые выставки
  console.log('\nСоздаю новые выставки...');
  const results = [];

  for (const ex of NEW_EXHIBITIONS) {
    const item = await apiCall('crm.item.add', {
      entityTypeId: 1048,
      fields: {
        title:      ex.title,
        begindate:  ex.begindate,
        closedate:  ex.closedate,
        categoryId: 20,
        stageId:    'DT1048_20:UC_7T06OH',
        'ufCrm12_1777190355': ex.location,
        assignedById: 134,
      }
    });
    const id = item.item.id;
    results.push({ id, title: ex.title });
    console.log(`  ✓ id=${id} «${ex.title}» (${ex.begindate} — ${ex.closedate})`);
  }

  console.log('\n=== Готово ===');
  console.log(`Обновлено: 1, Создано: ${results.length}`);
  console.log('\nСозданные ID:');
  results.forEach(r => console.log(`  id=${r.id} — ${r.title}`));
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
