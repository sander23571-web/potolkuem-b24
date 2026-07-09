#!/usr/bin/env python3
"""
import-marketing-expenses.py
Импортирует маркетинговые расходы из «Отчет расходы.xlsx» → лист «Расходы»
в Б24 СП «Расходы» (entityTypeId=1070) с Direction=Маркетинг.

Создаёт одну запись на каждую строку × каждый месяц с ненулевым фактом.
При повторном запуске — пропускает уже существующие записи (проверка по title).

Запуск:
  python3 scripts/import-marketing-expenses.py [--dry-run]
  python3 scripts/import-marketing-expenses.py --month 2026-06   # только один месяц
"""

import os, sys, json, time, datetime, urllib.request
import openpyxl

# ── Конфигурация ───────────────────────────────────────────────────────────────

XLSX_PATH = os.path.join(os.path.dirname(__file__), '../Отчет расходы.xlsx')
SHEET     = 'Расходы'

# Читаем .env
def load_env():
    env = {}
    for p in [
        os.path.join(os.path.dirname(__file__), '../.env'),
        '/root/projects/talk-report/.env',
    ]:
        try:
            for line in open(p).read().splitlines():
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
        except FileNotFoundError:
            pass
    return env

ENV      = load_env()
WEBHOOK  = ENV.get('B24_WEBHOOK', '')
DRY_RUN  = '--dry-run' in sys.argv
FILTER_MONTH = next((a.split('=')[1] if '=' in a else None
                     for a in sys.argv[1:] if a.startswith('--month')), None)
# Пример: --month=2026-06 или --month 2026-06
if not FILTER_MONTH:
    for i, a in enumerate(sys.argv[1:]):
        if a == '--month' and i + 1 < len(sys.argv[1:]):
            FILTER_MONTH = sys.argv[i + 2]
            break

# Б24 справочники
ENTITY_TYPE_ID     = 1070           # СП Расходы
DIRECTION_MARKETING = '226'         # UF_CRM_24_DIRECTION = Маркетинг
STAGE_ID           = 'DT1070_32:SUCCESS'

# Каналы (UF_CRM_24_CHANNEL enum IDs)
CH = {
    'Директ':     '230',
    'VK Реклама': '232',
    'Посевы':     '234',
    'Агентство':  '236',
    'SEO':        '238',
    'Другое':     '240',
}

# ── Карта месяцев → колонки ───────────────────────────────────────────────────
# (date_iso, label, fact_col_idx)  — col_idx 0-based из xlsx
# Для Май–Дек 2025 факт = сама колонка (нет разделения план/факт)
# Для 2026 факт — нечётный индекс (Факт), план — чётный (План)
MONTHS = [
    ('2025-05-01', 'Май 2025',    3),
    ('2025-06-01', 'Июнь 2025',   4),
    ('2025-07-01', 'Июль 2025',   5),
    ('2025-08-01', 'Август 2025', 6),
    ('2025-09-01', 'Сент 2025',   7),
    ('2025-10-01', 'Окт 2025',    8),
    ('2025-11-01', 'Ноя 2025',    9),
    ('2025-12-01', 'Дек 2025',   10),
    ('2026-01-01', 'Янв 2026',   12),  # 11=план, 12=факт
    ('2026-02-01', 'Фев 2026',   14),
    ('2026-03-01', 'Март 2026',  16),
    ('2026-04-01', 'Апр 2026',   18),
    ('2026-05-01', 'Май 2026',   20),
    ('2026-06-01', 'Июнь 2026',  22),
    ('2026-07-01', 'Июль 2026',  24),
]

# ── Карта строк: (row_idx, category, service_name, channel) ──────────────────
# row_idx — 0-based индекс строки в листе (с учётом пропущенных)
SERVICES = [
    # Посевы
    (1,  'Посевы', 'ИП Мельников — посевы',        'Посевы'),
    (2,  'Посевы', 'ТЕЛЕКОТ — TG посевы',           'Посевы'),
    (3,  'Посевы', 'VK — посевы',                   'Посевы'),
    (4,  'Посевы', 'MAX — посевы',                  'Посевы'),
    # Реклама
    (9,  'Реклама', 'ИП Мельников — агентская комиссия', 'Агентство'),
    (10, 'Реклама', 'СМБ-Сервис — Директ+VK+TG',  'Агентство'),
    (11, 'Реклама', 'Маркетплейсы — продвижение',  'Другое'),
    (12, 'Реклама', 'Лиды B2B',                    'Другое'),
    # SEO
    (15, 'SEO', 'ИП Мельников — SEO',              'SEO'),
    (16, 'SEO', 'SEO-сервисы',                     'SEO'),
    # Блоги
    (19, 'Блоги', 'ИП Мельников — блоги',          'Агентство'),
    (20, 'Блоги', 'VC.ru',                         'Другое'),
    # Сервисы
    (23, 'Сервисы', 'Хостинг сайта',               'Другое'),
    (24, 'Сервисы', 'ChatGPT',                     'Другое'),
    (25, 'Сервисы', 'Hailuoai.video',              'Другое'),
    (26, 'Сервисы', 'Livedune',                    'Другое'),
    (27, 'Сервисы', 'Veo',                         'Другое'),
    (28, 'Сервисы', 'Telemetr',                    'Другое'),
    (29, 'Сервисы', 'Taplike.ru',                  'Другое'),
    (30, 'Сервисы', 'Taplink',                     'Другое'),
    (31, 'Сервисы', 'Яндекс.Плюс',                'Другое'),
]

# ── B24 API ───────────────────────────────────────────────────────────────────

def b24_post(method, params):
    url  = WEBHOOK + method
    data = json.dumps(params, ensure_ascii=False).encode('utf-8')
    req  = urllib.request.Request(url, data=data)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    if resp.get('error'):
        raise RuntimeError(f'{method}: {resp["error"]} — {resp.get("error_description","")}')
    return resp.get('result')

def b24_find(title):
    """Ищет запись по точному title."""
    res = b24_post('crm.item.list', {
        'entityTypeId': ENTITY_TYPE_ID,
        'filter': {'=title': title},
        'select': ['id'],
    })
    items = (res or {}).get('items', [])
    return items[0]['id'] if items else None

def b24_create(fields):
    res = b24_post('crm.item.add', {
        'entityTypeId': ENTITY_TYPE_ID,
        'fields': fields,
    })
    return (res or {}).get('item', {}).get('id')

# ── Парсинг Excel ─────────────────────────────────────────────────────────────

def parse_amount(val):
    """Возвращает float или None."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        # Может быть строка типа "Переведено 20тр в Max" или "50 000"
        if isinstance(val, str):
            clean = val.replace('\xa0', '').replace(' ', '').replace(',', '.')
            try:
                return float(clean)
            except ValueError:
                return None
        return None

def load_rows():
    """Загружает все строки Excel в список [row_values, ...]."""
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    return rows

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not WEBHOOK:
        print('ERROR: B24_WEBHOOK не задан')
        sys.exit(1)

    print(f'import-marketing-expenses.py · {"DRY RUN" if DRY_RUN else "LIVE"}')
    if FILTER_MONTH:
        print(f'Фильтр по месяцу: {FILTER_MONTH}')
    print(f'Файл: {XLSX_PATH}')
    print()

    rows = load_rows()
    print(f'Прочитано строк: {len(rows)}\n')

    created = 0
    skipped = 0
    errors  = 0

    for (row_idx, category, service, channel) in SERVICES:
        if row_idx >= len(rows):
            print(f'  [warn] строка {row_idx} не существует: {service}')
            continue

        row = rows[row_idx]

        for (date_iso, month_label, fact_col) in MONTHS:
            # Фильтр по месяцу
            ym = date_iso[:7]
            if FILTER_MONTH and ym != FILTER_MONTH:
                continue

            if fact_col >= len(row):
                continue

            amount = parse_amount(row[fact_col])
            if not amount or amount <= 0:
                continue

            title = f'{service} · {month_label}'

            if DRY_RUN:
                print(f'  [dry] {title}: {amount:,.0f} ₽  channel={channel}')
                created += 1
                continue

            # Проверяем дубль
            try:
                existing_id = b24_find(title)
                if existing_id:
                    print(f'  [skip] уже есть id={existing_id}: {title}')
                    skipped += 1
                    time.sleep(0.3)
                    continue
            except Exception as e:
                print(f'  [err] поиск {title}: {e}')
                errors += 1
                continue

            # Создаём
            fields = {
                'title':                  title,
                'stageId':                STAGE_ID,
                'begindate':              date_iso,
                'ufCrm24Direction':       DIRECTION_MARKETING,
                'ufCrm24Channel':         CH[channel],
                'ufCrm24Amount':          amount,
                'ufCrm24Description':     f'{category} · {service}',
            }

            try:
                new_id = b24_create(fields)
                print(f'  ✅ id={new_id}: {title} — {amount:,.0f} ₽')
                created += 1
            except Exception as e:
                print(f'  ❌ {title}: {e}')
                errors += 1

            time.sleep(0.5)

    print(f'\n=== Итог ===')
    print(f'  Создано:  {created}')
    print(f'  Пропущено:{skipped}')
    print(f'  Ошибок:  {errors}')
    if DRY_RUN:
        print('\n  (dry run — ничего не создано)')


if __name__ == '__main__':
    main()
