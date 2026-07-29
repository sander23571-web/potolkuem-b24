# Проект «Потолкуем?» — контекст для Claude

> **Ключевая фраза:** «Осмотрись в проекте»
> Прочитай этот файл → **`STATUS.md`** (текущее состояние) → **`b24-api-patterns.md`** (Б24 API) → и ты знаешь всё.
> Завершённые работы → `archive/history.md`

---

## Суть проекта

**Исполнитель:** БюроОБП (bobp.ru)
**Клиент:** a-dat.ru («Потолкуем?») — производитель настольных игр для развития речи (20+ игр)

**Портал:** `potolkuem.bitrix24.ru` · тариф «Профессиональный»
**Вебхук:** `https://potolkuem.bitrix24.ru/rest/134/gj6y27ehe0f42jeb/`
**Период работ:** апрель — июль 2026

---

## Смарт-процессы (все)

| Название | typeId | entityTypeId | categoryId | entityId (UF) |
|---|---|---|---|---|
| Отдел разработки | 10 | 1044 | 16 | CRM_10 |
| Выставки | 12 | 1048 | 20 | CRM_12 |
| Ведущие | 14 | 1052 | 22 | CRM_14 |
| Выход ведущего | 16 | 1056 | 24 | CRM_16 |
| Игровая сессия | 18 | 1060 | 26 | CRM_18 |
| Логистика | 20 | 1064 | 28 | CRM_20 |
| Согласия | 22 | 1068 | 30 | CRM_22 |
| **Расходы** | **24** | **1070** | **32** | **CRM_24** |
| **Точки продаж** | **26** | **1072** | **44** | **CRM_26** |
| **Статистика площадок** | **28** | **1074** | **34** | **CRM_28** |
| **Договоры** | **30** | **1078** | **48** | **CRM_30** |

> ⚠️ `entityId` для `userfieldconfig.add` = `CRM_{typeId}`, **НЕ** `CRM_{entityTypeId}`.
> Полные API-паттерны: **`b24-api-patterns.md`**

### Стадии СП Точки продаж (DT1072_44:*)

| STATUS_ID | Название | id |
|---|---|---|
| DT1072_44:NEW | Переговоры | 724 |
| DT1072_44:PREPARATION | Договор на согласовании | 726 |
| DT1072_44:CLIENT | Активная реализация | 728 |
| DT1072_44:UC_PAUSED | Приостановлена | 734 |
| DT1072_44:SUCCESS | Завершена | 730 |
| DT1072_44:FAIL | Отказ | 732 |

### UF-поля СП Точки продаж (CRM_26)

| Поле | Тип | id | Метка |
|---|---|---|---|
| ufCrm26Address | string | 596 | Адрес точки |
| ufCrm26Commission | double | 598 | Комиссия % |
| ufCrm26DateStart | date | 600 | Дата начала договора |
| ufCrm26DateReport | date | 602 | Дата следующего отчёта |
| ufCrm26ContractTerms | string | 604 | Условия договора |
| ufCrm26Warehouse | string | 606 | Склад |

### Записи Точек продаж

| id | Название | Компания id | Стадия |
|---|---|---|---|
| 2 | Магазин "Листва" | 18 | Активная реализация |
| 4 | Магазин "Gold Fish" | 20 | Активная реализация |
| 6 | Магазин ЦДМ | 22 | Активная реализация |

### UF-поля СП Расходы (CRM_24)

| Поле | Тип | id | Метка |
|---|---|---|---|
| UF_CRM_24_EXPENSE_TYPE | enumeration | 574 | Статья расхода |
| UF_CRM_24_DESCRIPTION | string | 576 | Описание |
| UF_CRM_24_QTY | double | 578 | Количество |
| UF_CRM_24_PRICE_UNIT | double | 580 | Цена за единицу, руб. |
| UF_CRM_24_AMOUNT | double | 582 | Сумма, руб. |
| UF_CRM_24_DOCS | file (multiple) | 610 | Подтверждающий документ |
| UF_CRM_24_DIRECTION | enumeration | 642 | Направление (224=Выставки, 226=Маркетинг, 228=Операционные) |
| UF_CRM_24_CHANNEL | enumeration | 644 | Канал (230=Директ, 232=VK, 234=Посевы, 236=Агентство, 238=SEO, 240=Другое) |

> Поле 608 (single-file) удалено 05.07.2026 → заменено полем 610 (multiple).

### UF-поля СП Статистика площадок (CRM_28)

`ufCrm28Platform`, `ufCrm28Period`, `ufCrm28Followers`, `ufCrm28FollowersDiff`, `ufCrm28Er`, `ufCrm28Reach`, `ufCrm28VisitsTotal`, `ufCrm28VisitsOrganic`, `ufCrm28VisitsPaid`, `ufCrm28BounceRate`, `ufCrm28Clicks`, `ufCrm28Impressions`, `ufCrm28BrandDemand`

**Платформы (значения `ufCrm28Platform`):** `Wordstat_потолкуем`, `Метрика_сайт`, `VK_potolkuem`, `TG_potolkuem`, `Дзен_potolkuem`, `Вебмастер_SEO`

### Регламент прикрепления файлов

- **Карточка Выставки (1048)** → организационные документы (регламент, доверенности, акты с организатором)
- **Карточка Расхода (1070)** → документы конкретного расхода (счёт, акт, договор по статье)

---

## Воронки сделок

| ID | Название | Назначение |
|---|---|---|
| 0 | Ателье (Продажа) | B2B-продажи, стадии не настроены |
| 18 | Розничные продажи | Выставки, онлайн, соцсети (SOURCE_ID разделяет) |
| 24 | (пустая) | Мигрированы в СП Точки продаж |
| 26 | Мероприятия B2C | Открытые игровые сессии |
| 28 | Ателье (Производство) | Кастомные игры |
| 30 | Мероприятия B2B | Корпоративные мероприятия |
| 32 | Реализация точек | Отчёты от точек продаж (C32:NEW/PREPARATION/WON/LOSE) |

---

### UF-поля СП Договоры (CRM_30)

| Поле | Тип | id | Метка |
|---|---|---|---|
| UF_CRM_30_SUBJECT | string | 646 | Предмет договора |
| UF_CRM_30_DESCRIPTION | string | 648 | Краткое описание |
| UF_CRM_30_DEPARTMENT | string | 650 | Отдел |
| UF_CRM_30_AMOUNT | double | 652 | Общая сумма договора, руб. |
| UF_CRM_30_UNIT_PRICE | double | 654 | Стоимость за единицу, руб. |
| UF_CRM_30_RESPONSIBLE | employee | 656 | Ответственный сотрудник |
| UF_CRM_30_SPEC | file (multiple) | 658 | Спецификация / ТЗ |
| UF_CRM_30_FOUNDING | file (multiple) | 660 | Учредительные документы |
| UF_CRM_30_CONTRACT_WIP | file (multiple) | 662 | Договор — рабочие версии |
| UF_CRM_30_CONTRACT_FINAL | file (multiple) | 664 | Договор — финальный |
| UF_CRM_30_IS_MANAGER | boolean | 666 | Инициирован руководителем |

### Стадии СП Договоры (DYNAMIC_1078_STAGE_48)

| id | Название | SORT | Семантика |
|---|---|---|---|
| 756 | Инициация | 10 | — |
| 768 | С комментариями сотрудников | 20 | — |
| 770 | На проверке | 30 | — |
| 772 | Согласование контрагентом | 40 | — |
| 774 | На подпись | 50 | — |
| 762 | Подписан | 70 | SUCCESS |
| 764 | Отклонён | 80 | FAIL |

### Пользователи (ключевые роли в СП Договоры)

| Роль | Пользователь | id |
|---|---|---|
| Юрист | Наталья Киселева | 140 |
| Бухгалтер | Мария Цакунова | 12 |
| Директор | Анна Агеева-Дзукаева | 18 |
| Руководители-инициаторы | Анна (18), Александр Дзукаев (116), Алина (132) | — |

---

## Доступ к Б24 API

**Всегда через прокси** — прямой вебхук не работает с этой машины.

```bash
# Прокси
PROXY="https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY="b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"

curl -s -X POST "$PROXY/crm.type.list" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json"
```

API-ключ и конфиг портала: `ssh -p 2222 root@155.212.143.68` → `/opt/b24configs/potolkuem/.env`
Документация прокси: `/root/projects/Bitrix24/ENVPro/ENVPro.md`

---

## Инфраструктура report-app

- **Продакшн:** `155.212.143.68` · SSH: `ssh -p 2222 root@155.212.143.68`
- **Директория:** `/root/projects/talk-report/`
- **PM2:** `pm2 restart report-app` · Порт 3002
- **URL:** `https://db-talk.bobp.ru` · SSL до 2026-09-26 (autocertbot)
- **Этот репозиторий:** `46.173.20.187` — **разные машины**, certbot запускать на продакшне
- **Логин/пароль (обычные дашборды):** `admin / JGBDG7lVRqTjeTkg` (в `/root/projects/talk-report/.env`)
- **Логин/пароль (только `/report/marketing/expenses`):** `director / beFPuNMl5M4FI7X2` — отдельная пара `REPORT_ADMIN_USER`/`REPORT_ADMIN_PASSWORD`, `requireAdmin` в `index.js` проверяет именно имя пользователя `director`, с логином `admin` даст 403 независимо от пароля

| Файл | Назначение |
|---|---|
| `report-app/index.js` | Express + Basic Auth + маршруты |
| `report-app/b24.js` | Б24 API клиент + кеш 5 мин |
| `report-app/render.js` | HTML дашборд выставок |
| `report-app/livedune.js` | LiveDune API, кеш 30 мин |
| `report-app/render-social.js` | SMM дашборд |
| `report-app/tasks-b24.js` | Задачи Б24: просроченные, зависшие |
| `report-app/tasks-render.js` | HTML дашборд задач |
| `report-app/marketing-data.js` | Маркетинг: СП 1074 + SEO-снапшоты |
| `report-app/render-marketing.js` | HTML маркетинговый дашборд |

**Маршруты в `index.js`:** `/report/marketing` и `/report/compare` — ОБЯЗАТЕЛЬНО до `/report/:id`, иначе 400.

**Фильтрация сделок по выставке** — два запроса:
1. `PARENT_ID_1048: id, CATEGORY_ID: 18` — прямые сделки выставки
2. `PARENT_ID_1052: hostIds, CATEGORY_ID: 18, >=CLOSEDATE: begindate, <=CLOSEDATE: closedate` — сделки ведущих

---

## Cron-скрипты (на 155.212.143.68)

| Скрипт | Расписание | Что делает |
|---|---|---|
| `scripts/seo-snapshot.py` | Пн 09:00 | Вебмастер + Метрика + Wordstat → `/root/projects/talk-report/data/seo/YYYY-MM-DD.json` |
| `scripts/platform-stats-cron.py` | 2-е число 10:00 | LiveDune → СП «Статистика площадок» (Б24) |
| `scripts/task_require_result_cron.py` | каждые 2 мин | requireResult=True на новые задачи Алины (id=132) |
| `../Bitrix24/ENVPro/ЗАДАЧИ_НАБЛЮДАТЕЛЬ` | каждую мин | Агеева-Дзукаева как наблюдатель в задачах |

---

## Бэкап Б24 (`scripts/b24-backup.py`)

Выгружает из CRM: сделки, контакты, компании, все 10 СП. Задачи не включены (76% объёма, не несут финансовых данных).

```bash
python3 scripts/b24-backup.py --compress   # бэкап → backups/YYYY-MM-DD_HH-MM.tar.gz
python3 scripts/b24-backup.py              # без сжатия (папка)
python3 scripts/b24-backup.py --list       # список существующих бэкапов
python3 scripts/b24-backup.py --dir /path  # другая папка
```

- Бэкапы хранятся в `backups/` (в .gitignore, не коммитятся)
- Размер: ~1,4 МБ несжато / **60 КБ в .tar.gz** (x23)
- Запускать вручную **перед серьёзными изменениями** в Б24

---

## Ключевые файлы

| Файл | Содержание |
|---|---|
| **`b24-api-patterns.md`** | **Главная база знаний по Битрикс24 REST API** |
| `STATUS.md` | Текущий статус: API, дашборды, ожидающие, следующие шаги |
| `archive/history.md` | Завершённые работы: импорты выставок, ДОГОВОРЫ, маркетинг |
| `analytics/marketing-audit-2026-07.md` | Полный маркетинговый аудит май 2025 – июль 2026 |
| `analytics/запрос-история-каналов.md` | Запрос маркетологу (дедлайн 18.07.2026) |
| `system-overview.md` | Архитектура CRM (подробно) |
| `liga-memo-v2.md` | Аналитическая записка «Лига Красноречия» (ждёт решения руководства) |

---

## Важные грабли (не наступай снова)

1. `entityId` для полей = `CRM_{typeId}`, не `CRM_{entityTypeId}` → подробности в b24-api-patterns.md п.10
2. `crm.status.update/delete` — числовой `id`, не строка `STATUS_ID`
3. `editFormLabel` строкой не сохраняется — нужен `{"ru": "..."}` объект
4. `userfieldconfig.list` пагинирован по 50, `next` в корне ответа, enum не возвращается (нужен `userfieldconfig.get`)
5. `CATEGORY_ID` в `crm.deal.update` молча не меняет воронку — только через UI
6. `parentId1052` (camelCase) в `crm.deal.add` молча игнорируется — только `PARENT_ID_1052` через update
7. `userfieldconfig.add`: параметр называется `field` (не `fields`), внутри — **camelCase** (`entityId`, `fieldName`, `userTypeId`, `editFormLabel`)
8. `userfieldconfig.add`: нужен `moduleId: "crm"` — без него ошибка "{moduleId} not found"
9. `crm.type.update`: для UF-полей в новом СП сначала включи `isUseInUserfieldEnabled: "Y"` — иначе "Вы не можете создавать пользовательские поля"
10. При создании нового СП стадии авто-создаются (Начало/Подготовка/Согласование/Успех/Провал). Используй `crm.status.update` с числовым ID для переименования, `crm.status.add` с полем `STATUS_ID` для новых
11. `crm.status.add` требует обязательное поле `STATUS_ID` — без него ошибка "The field STATUS_ID is required"
12. `parentId1048` (lowercase) в `crm.deal.add` **молча игнорируется** — только `crm.deal.update` с `PARENT_ID_1048` (uppercase) работает. Фильтр `PARENT_ID_1048` в `crm.deal.list` при этом корректный.
13. Сделки ведущих (`PARENT_ID_1052: [ids]`) без фильтра по датам = ВСЕ их сделки за всё время — всегда добавляй `>=CLOSEDATE`/`<=CLOSEDATE` по датам выставки.
14. `fieldName` в `userfieldconfig.add` — **полный префикс**: `"UF_CRM_{typeId}_{SUFFIX}"` — короткое имя вроде `"DOCS"` даёт ошибку `{"error": "0", "error_description": "Некорректный код поля"}`.
15. Флаг `multiple` у UF-поля нельзя изменить через `userfieldconfig.update` — API возвращает успех, но значение остаётся прежним. Решение: удалить поле + создать заново.
16. VK Реклама API — endpoint `target.my.com/api/v2/` (НЕ ads.vk.com!). Токен: `/root/projects/talk/VK_Potolkuem`. Auth: `Authorization: Bearer TOKEN`. Статистика: POST `statistics/campaigns/day.json`, тело `{"campaign_ids": [], "date_from": "...", "date_to": "..."}` — БЕЗ поля `metrics` (новый API его не принимает). `campaign_ids: []` = все кампании. Данные доступны: сент.2025–июнь.2026, 480 956 ₽.
17. Яндекс.Директ Reports API — если 201 → данные готовятся, повторить через 5–8 сек с тем же ReportName.
18. `realm` в express-basic-auth — только ASCII. Кириллица вызывает ERR_INVALID_CHAR.
19. Два уровня Basic Auth на одном маршруте создают бесконечный 401-цикл. Решение: один `authMiddleware` с обоими пользователями; для ограниченных страниц — `requireAdmin` middleware возвращает 403 (не 401), чтобы не триггерить повторный диалог браузера.
