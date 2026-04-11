# Битрикс24 REST API — паттерны создания сущностей

Документ содержит проверенные рабочие паттерны API, найденные в ходе практической реализации.
Вебхук формата: `https://YOUR_DOMAIN.bitrix24.ru/rest/USER_ID/WEBHOOK_TOKEN/`

---

## Смарт-процессы (Dynamic CRM Types)

### 1. Создание смарт-процесса

```bash
POST /crm.type.add
{
  "fields": {
    "title": "Название",
    "isBizProcEnabled": true,
    "isSetOpenPermissions": true,
    "isStagesEnabled": true,         # включить стадии
    "isBeginCloseDatesEnabled": true, # даты начала/конца
    "isObserversEnabled": true,
    "isRecyclebinEnabled": true,
    "isAutomationEnabled": true,
    "isDocumentsEnabled": true,
    "isContactsEnabled": true,        # связь с контактами
    "isCountersEnabled": true,
    "isPaymentsEnabled": false
  }
}
# Возвращает: type.entityTypeId (например, 1038)
```

> **Важно:** `isStagesEnabled` может не примениться при создании.
> Если в ответе `"isStagesEnabled": "N"` — сделать отдельный `crm.type.update`.

### 2. Обновление настроек (включение стадий и автоматизации)

```bash
POST /crm.type.update
{
  "id": 7,  # id из crm.type.add (не entityTypeId!)
  "fields": {
    "isStagesEnabled": true,
    "isAutomationEnabled": true,
    "isBizProcEnabled": true
  }
}
```

---

## Стадии смарт-процесса

### 3. Нахождение правильного ENTITY_ID для стадий

**Шаг 1.** Получить список категорий (воронок) смарт-процесса:
```bash
GET /crm.category.list?entityTypeId=1038
# Возвращает: categories[].id — ID дефолтной категории (например, 15)
```

**Шаг 2.** Найти правильный ENTITY_ID через:
```bash
GET /crm.status.entity.types
# В ответе найти запись с ENTITY_TYPE_ID = 1038
# Формат: "DYNAMIC_{entityTypeId}_STAGE_{categoryId}"
# Пример: "DYNAMIC_1038_STAGE_15"
```

### 4. Создание стадии

```bash
POST /crm.status.add
{
  "fields": {
    "ENTITY_ID": "DYNAMIC_1038_STAGE_15",
    "STATUS_ID": "MY_STAGE",      # уникальный идентификатор
    "NAME": "Название стадии",
    "SORT": 10,                   # порядок (10, 20, 30...)
    "COLOR": "#BBECF7",
    "SEMANTICS": "P"              # P=процесс, S=успех, F=провал
  }
}
```

**Правила порядка стадий:**
- Промежуточные стадии (P) должны быть ДО финальных
- Нельзя добавить промежуточную стадию ПОСЛЕ успешной (S)
- Только одна стадия с `SEMANTICS: "S"` (успех)
- Стадии с `SEMANTICS: "F"` (провал) можно несколько

**Автоматически созданные системные стадии** (`SYSTEM: "Y"`):
- Начало (sort 10)
- Успех (sort 40, SEMANTICS: S)
- Провал (sort 50, SEMANTICS: F)
- + 2 промежуточные: Подготовка, Согласование

Системные стадии можно переименовывать и перекрашивать через `crm.status.update`.

### 5. Обновление стадии

```bash
POST /crm.status.update
{
  "id": 205,
  "fields": {
    "NAME": "Новое название",
    "COLOR": "#00C853",
    "SORT": 10
  }
}
```

### 6. Список текущих стадий

```bash
GET /crm.status.list?filter[ENTITY_ID]=DYNAMIC_1038_STAGE_15
```

---

## Пользовательские поля смарт-процесса

### 7. Добавление поля

**Ключевое открытие:** для смарт-процессов нет отдельного метода.
Используется `crm.deal.userfield.add` с `ENTITY_ID = "CRM_{entityTypeId}"`.

```bash
POST /crm.deal.userfield.add
{
  "fields": {
    "ENTITY_ID": "CRM_1038",          # CRM_ + entityTypeId
    "FIELD_NAME": "MY_FIELD",         # без префикса UF_CRM_ (добавляется автоматом)
    "USER_TYPE_ID": "string",         # тип поля
    "EDIT_FORM_LABEL": "Название",
    "LIST_COLUMN_LABEL": "Колонка",
    "IS_REQUIRED": "N",
    "MULTIPLE": "N"
  }
}
# Поле получит имя UF_CRM_MY_FIELD
```

### 8. Типы полей (USER_TYPE_ID)

| Тип | Описание |
|-----|----------|
| `string` | Строка / текст (SETTINGS: {"ROWS": 4} для многострочного) |
| `integer` | Целое число |
| `double` | Дробное число / деньги |
| `boolean` | Да/Нет |
| `date` | Дата |
| `datetime` | Дата и время |
| `enumeration` | Список значений (с LIST) |
| `file` | Файл |
| `url` | Ссылка |
| `money` | Деньги с валютой |

### 9. Поле типа "Список" (enumeration) со значениями

```bash
POST /crm.deal.userfield.add
{
  "fields": {
    "ENTITY_ID": "CRM_1038",
    "FIELD_NAME": "EVENT_TYPE",
    "USER_TYPE_ID": "enumeration",
    "EDIT_FORM_LABEL": "Тип мероприятия",
    "IS_REQUIRED": "Y",
    "MULTIPLE": "N",
    "SETTINGS": {"DISPLAY": "UI", "LIST_HEIGHT": 3},
    "LIST": [
      {"VALUE": "Выставка", "SORT": 10},
      {"VALUE": "Акция на локации", "SORT": 20},
      {"VALUE": "Открытая игра", "SORT": 30}
    ]
  }
}
```

### 10. Список полей смарт-процесса

```bash
GET /crm.deal.userfield.list?filter[ENTITY_ID]=CRM_1038&order[ID]=ASC
```

### 11. Стандартные поля (из crm.item.fields)

Всегда доступны без создания:
- `title` — Название
- `begindate` / `closedate` — Дата начала / Дата завершения
- `assignedById` — Ответственный
- `stageId` — Стадия
- `observers` — Наблюдатели
- `createdBy` / `updatedBy` — Кем создан/обновлён
- `openedById` — Доступно для всех

---

## Карточка элемента (детальная страница)

### 12. Настройка секций и порядка полей

```bash
POST /crm.item.details.configuration.set
{
  "entityTypeId": 1038,
  "data": [
    {
      "name": "main",
      "title": "Основная информация",
      "type": "section",
      "elements": [
        {"name": "title"},
        {"name": "UF_CRM_EVENT_TYPE"},
        {"name": "begindate"},
        {"name": "closedate"},
        {"name": "assignedById"}
      ]
    },
    {
      "name": "finance",
      "title": "Финансы",
      "type": "section",
      "elements": [
        {"name": "UF_CRM_BUDGET_PLAN"},
        {"name": "UF_CRM_REVENUE"}
      ]
    }
  ]
}
```

---

## Справочники — быстрый доступ

```bash
# Список всех смарт-процессов
GET /crm.type.list

# Категории смарт-процесса
GET /crm.category.list?entityTypeId=1038

# Все типы entity для статусов (найти формат ENTITY_ID для стадий)
GET /crm.status.entity.types

# Стандартные поля смарт-процесса
GET /crm.item.fields?entityTypeId=1038

# Пользовательские поля
GET /crm.deal.userfield.list?filter[ENTITY_ID]=CRM_1038

# Методы API на портале
GET /methods?full=1
```

---

## Контакты CRM

### 13. Добавление пользовательских полей к Контактам

```bash
POST /crm.contact.userfield.add
{
  "fields": {
    "ENTITY_ID": "CRM_CONTACT",
    "FIELD_NAME": "IS_AMBASSADOR",
    "USER_TYPE_ID": "boolean",
    "EDIT_FORM_LABEL": "Амбассадор",
    "IS_REQUIRED": "N"
  }
}
```

---

## Важные находки и ограничения

1. **`crm.status.add`** не поддерживает `ENTITY_ID = "DYNAMIC_1038"` или `"DYNAMIC_1038_STAGE"` — только полный формат `"DYNAMIC_1038_STAGE_15"` с ID категории.

2. **`userfieldconfig.add`** с `moduleId: "crm"` возвращает ошибку прав — не работает для создания полей CRM сущностей через вебхук.

3. **`crm.item.userfield.add`** — метод не существует (ERROR_METHOD_NOT_FOUND).

4. **`crm.userfield.add`** — метод не существует.

5. **Batch-запросы** с кириллицей в URL-параметрах могут не работать — лучше использовать отдельные POST-запросы с JSON body.

6. **Системные стадии** (SYSTEM: "Y") нельзя удалить, но можно переименовать и перекрасить.

7. При создании смарт-процесса автоматически создаётся **дефолтная категория** (Общая воронка) и 5 стадий по умолчанию.

---

## Проект: Потолкуем?

**Портал:** `https://b24-0l7a4f.bitrix24.ru`
**Тариф:** Профессиональный

### Созданные сущности

| Сущность | entityTypeId | categoryId | Стадий | Полей UF |
|----------|-------------|------------|--------|----------|
| Мероприятия | 1038 | 15 | 7 | 15 |

### Поля смарт-процесса Мероприятия (UF_CRM_*)

| ID | Поле | Тип | Назначение |
|----|------|-----|------------|
| 225 | UF_CRM_EVENT_TYPE | enumeration | Тип мероприятия |
| 227 | UF_CRM_LOCATION | string | Место проведения |
| 229 | UF_CRM_THEME | enumeration | Тематика игр |
| 231 | UF_CRM_ORG_FEE_PLAN | double | Оргвзнос план |
| 233 | UF_CRM_ORG_FEE_FACT | double | Оргвзнос факт |
| 235 | UF_CRM_BUDGET_PLAN | double | Бюджет план |
| 237 | UF_CRM_EXPENSES_FACT | double | Расходы факт |
| 239 | UF_CRM_REVENUE | double | Выручка |
| 241 | UF_CRM_VISITORS | integer | Посетителей стенда |
| 243 | UF_CRM_CONTACTS_COLLECTED | integer | Контактов собрано |
| 245 | UF_CRM_SALES_COUNT | integer | Продано экземпляров |
| 247 | UF_CRM_RATING | enumeration | Оценка 1-5 |
| 249 | UF_CRM_WHAT_WORKED | string | Что сработало |
| 251 | UF_CRM_WHAT_TO_IMPROVE | string | Что улучшить |
| 253 | UF_CRM_STAND_AREA | double | Площадь стенда |
