#!/usr/bin/env python3
"""
platform-stats-cron.py — заполняет СП «Статистика площадок» (typeId=28, entityTypeId=1074)
данными из SEO-снапшотов и LiveDune API.

Источники:
  1. SEO-снапшоты: /root/projects/talk-report/data/seo/YYYY-MM-DD.json
     Метрика (ежемесячно), Вебмастер (кликов/показов), Wordstat (брендовый спрос)
  2. LiveDune API: история подписчиков VK / TG / Дзен

Запуск:
  python3 scripts/platform-stats-cron.py --backfill   # первичный запуск (все месяцы)
  python3 scripts/platform-stats-cron.py              # текущий месяц

Cron (на сервере):
  0 10 2 * * python3 /root/projects/talk-report/scripts/platform-stats-cron.py
"""

import os
import sys
import json
import time
import datetime
import urllib.request
import urllib.error
from collections import defaultdict

# ── Конфигурация ──────────────────────────────────────────────────────────────

# Читаем .env с сервера или из проекта
def load_env(path):
    env = {}
    try:
        for line in open(path).read().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

_env = {}
for p in [
    '/root/projects/talk-report/.env',
    '/root/projects/talk/.env',
    os.path.join(os.path.dirname(__file__), '../.env'),
]:
    _env.update(load_env(p))

B24_WEBHOOK   = _env.get('B24_WEBHOOK', os.environ.get('B24_WEBHOOK', ''))
LD_KEY        = _env.get('LIVEDUNE_API_KEY', os.environ.get('LIVEDUNE_API_KEY', ''))
DATA_DIR      = '/root/projects/talk-report/data/seo'

# СП «Статистика площадок»
ENTITY_TYPE_ID = 1074  # entityTypeId
TYPE_ID        = 28

# Поля (имена без b24 camelCase alias — используем UF_CRM_28_* через crm.item.add)
F = {
    'platform':       f'ufCrm{TYPE_ID}Platform',
    'period':         f'ufCrm{TYPE_ID}Period',
    'followers':      f'ufCrm{TYPE_ID}Followers',
    'followers_diff': f'ufCrm{TYPE_ID}FollowersDiff',
    'er':             f'ufCrm{TYPE_ID}Er',
    'reach':          f'ufCrm{TYPE_ID}Reach',
    'visits_total':   f'ufCrm{TYPE_ID}VisitsTotal',
    'visits_organic': f'ufCrm{TYPE_ID}VisitsOrganic',
    'visits_paid':    f'ufCrm{TYPE_ID}VisitsPaid',
    'bounce_rate':    f'ufCrm{TYPE_ID}BounceRate',
    'clicks':         f'ufCrm{TYPE_ID}Clicks',
    'impressions':    f'ufCrm{TYPE_ID}Impressions',
    'brand_demand':   f'ufCrm{TYPE_ID}BrandDemand',
}

# LiveDune: id → slug платформы
LD_ACCOUNTS = {
    2753311: 'VK_potolkuem',
    2753880: 'TG_potolkuem',
    3039674: 'Дзен_potolkuem',
}

BACKFILL = '--backfill' in sys.argv

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def b24_post(method, params):
    url  = B24_WEBHOOK + method
    data = json.dumps(params, ensure_ascii=False).encode('utf-8')
    req  = urllib.request.Request(url, data=data)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    if resp.get('error'):
        raise RuntimeError(f'{method}: {resp["error"]} — {resp.get("error_description","")}')
    return resp.get('result')

def ld_get(path, params=None):
    qs = urllib.parse.urlencode({'access_token': LD_KEY, **(params or {})})
    url = f'https://api.livedune.com{path}?{qs}'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp.get('response', [])

# ── Б24 helpers ───────────────────────────────────────────────────────────────

def b24_find_record(platform, period_iso):
    """Ищет существующую запись по платформе и периоду."""
    try:
        res = b24_post('crm.item.list', {
            'entityTypeId': ENTITY_TYPE_ID,
            'filter': {
                F['platform']: platform,
                F['period']:   period_iso,
            },
            'select': ['id'],
        })
        items = res.get('items', []) if res else []
        return items[0]['id'] if items else None
    except Exception as e:
        print(f'  [warn] find_record({platform},{period_iso}): {e}')
        return None

def b24_upsert(platform, period_iso, fields_data):
    """Создаёт или обновляет запись в СП."""
    existing_id = b24_find_record(platform, period_iso)
    title = f'{platform} · {period_iso[:7]}'

    fields = {
        'title':           title,
        F['platform']:     platform,
        F['period']:       period_iso,
    }
    for k, v in fields_data.items():
        if v is not None:
            fields[F[k]] = v

    if existing_id:
        b24_post('crm.item.update', {
            'entityTypeId': ENTITY_TYPE_ID,
            'id':           existing_id,
            'fields':       fields,
        })
        print(f'  обновлено id={existing_id}: {title}')
        return existing_id
    else:
        res = b24_post('crm.item.add', {
            'entityTypeId': ENTITY_TYPE_ID,
            'fields':       fields,
        })
        new_id = res.get('item', {}).get('id')
        print(f'  создано id={new_id}: {title}')
        return new_id

# ── SEO снапшоты ─────────────────────────────────────────────────────────────

def load_snapshots():
    """Загружает все JSON-снапшоты, возвращает dict[date_str] → data."""
    snaps = {}
    if not os.path.isdir(DATA_DIR):
        return snaps
    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.endswith('.json'):
            continue
        date_str = fname[:-5]
        try:
            with open(os.path.join(DATA_DIR, fname), encoding='utf-8') as f:
                snaps[date_str] = json.load(f)
        except Exception as e:
            print(f'  [warn] Не удалось прочитать {fname}: {e}')
    return snaps

def group_by_month(snaps):
    """
    Группирует снапшоты по году-месяцу.
    Для каждого месяца берёт последний (самый свежий) снапшот.
    Возвращает dict['YYYY-MM'] → snapshot.
    """
    by_month = defaultdict(list)
    for date_str, data in snaps.items():
        ym = date_str[:7]
        by_month[ym].append((date_str, data))
    return {ym: sorted(pairs)[-1][1] for ym, pairs in by_month.items()}

def process_seo_snapshots(monthly_snaps, target_months=None):
    """
    Для каждого месяца создаёт/обновляет три записи:
      - Метрика_сайт   (трафик)
      - Вебмастер_SEO  (клики/показы)
      - Wordstat_потолкуем (брендовый спрос)
    """
    for ym, snap in sorted(monthly_snaps.items()):
        if target_months and ym not in target_months:
            continue
        period_iso = f'{ym}-01'
        print(f'\n  [{ym}]')

        # Метрика
        m = snap.get('metrica', {})
        if m and 'error' not in m:
            b24_upsert('Метрика_сайт', period_iso, {
                'visits_total':   m.get('total_visits'),
                'visits_organic': m.get('organic_visits'),
                'visits_paid':    m.get('paid_visits'),
                'bounce_rate':    m.get('bounce_rate'),
            })
            time.sleep(0.4)

        # Вебмастер (суммируем клики/показы по всем запросам)
        wm = snap.get('webmaster', {})
        if wm and 'error' not in wm:
            rows = wm.get('rows', [])
            total_clicks = sum(r.get('clicks', 0) for r in rows)
            total_impr   = sum(r.get('impressions', 0) for r in rows)
            b24_upsert('Вебмастер_SEO', period_iso, {
                'clicks':      total_clicks,
                'impressions': total_impr,
            })
            time.sleep(0.4)

        # Wordstat — из brand_history (если есть этот месяц)
        ws = snap.get('wordstat', {})
        hist = ws.get('brand_history', [])
        for entry in hist:
            if entry.get('month') == ym and 'error' not in entry:
                b24_upsert('Wordstat_потолкуем', f'{entry["month"]}-01', {
                    'brand_demand': entry.get('count'),
                })
                time.sleep(0.4)
                break

def process_wordstat_history(monthly_snaps):
    """
    Backfill: из последнего снапшота берёт полную историю brand_history (18 мес.)
    и создаёт записи Wordstat для всех прошлых месяцев.
    """
    # Берём самый последний снапшот, у него должна быть полная история
    if not monthly_snaps:
        return
    last_snap = sorted(monthly_snaps.items())[-1][1]
    ws   = last_snap.get('wordstat', {})
    hist = ws.get('brand_history', [])
    print(f'\n  Wordstat backfill: {len(hist)} записей...')
    for entry in hist:
        ym = entry.get('month')
        if not ym or 'error' in entry:
            continue
        b24_upsert('Wordstat_потолкуем', f'{ym}-01', {
            'brand_demand': entry.get('count'),
        })
        time.sleep(0.4)

# ── LiveDune ──────────────────────────────────────────────────────────────────

import urllib.parse  # noqa — нужен для ld_get

def process_livedune(target_months=None):
    """
    Запрашивает историю подписчиков из LiveDune и записывает в Б24.
    """
    if not LD_KEY:
        print('  [skip] LIVEDUNE_API_KEY не задан')
        return

    # Период: все доступные данные (backfill) или последние 3 мес
    if BACKFILL:
        date_from = '2025-01-01'
    else:
        today = datetime.date.today()
        three_months_ago = today.replace(day=1) - datetime.timedelta(days=90)
        date_from = three_months_ago.isoformat()

    date_to = datetime.date.today().isoformat()

    for acc_id, platform in LD_ACCOUNTS.items():
        print(f'\n  LiveDune: {platform} (id={acc_id})')
        try:
            hist = ld_get(f'/accounts/{acc_id}/history', {
                'date_from': date_from,
                'date_to':   date_to,
            })
        except Exception as e:
            print(f'  [err] {e}')
            continue

        # Группируем по месяцу — берём последнее значение
        # LiveDune history: поле даты = 'created' (или 'date' в старых ответах)
        by_month = defaultdict(list)
        for row in hist:
            date_str = (row.get('created') or row.get('date') or '')[:10]
            if date_str:
                ym = date_str[:7]
                by_month[ym].append(row)

        for ym, rows in sorted(by_month.items()):
            if target_months and ym not in target_months:
                continue
            # Последняя дата в месяце
            # LiveDune history: поле даты = 'created', подписчиков = 'followers'
            last_row = sorted(rows, key=lambda r: r.get('created', r.get('date', '')))[-1]
            first_row = sorted(rows, key=lambda r: r.get('created', r.get('date', '')))[0]

            followers = (last_row.get('followers') or
                         last_row.get('subscribers_count') or
                         last_row.get('followers_count') or 0)
            first_f   = (first_row.get('followers') or
                         first_row.get('subscribers_count') or
                         first_row.get('followers_count') or 0)
            followers_diff = followers - first_f

            # reach: может быть dict {'total': N, ...} или число
            reach_raw = last_row.get('reach') or last_row.get('avg_reach') or None
            if isinstance(reach_raw, dict):
                reach = reach_raw.get('total') or reach_raw.get('followers') or None
            else:
                reach = reach_raw

            # ER: вычисляем как (avg_likes + avg_comments + avg_reposts) / followers * 100
            er_val = None
            if followers and followers > 0:
                interactions = ((last_row.get('avg_likes') or 0) +
                                (last_row.get('avg_comments') or 0) +
                                (last_row.get('avg_reposts') or 0))
                if interactions > 0:
                    er_val = round(interactions / followers * 100, 2)

            b24_upsert(platform, f'{ym}-01', {
                'followers':      followers,
                'followers_diff': followers_diff,
                'er':             round(er_val, 2) if er_val else None,
                'reach':          int(reach) if reach else None,
            })
            time.sleep(0.4)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not B24_WEBHOOK:
        print('ERROR: B24_WEBHOOK не задан')
        sys.exit(1)

    print(f'platform-stats-cron.py · {"--backfill" if BACKFILL else "текущий месяц"}')
    print(f'  B24: {B24_WEBHOOK[:50]}...')
    print(f'  DATA_DIR: {DATA_DIR}')

    # Текущий месяц для инкрементального запуска
    today = datetime.date.today()
    current_ym = today.strftime('%Y-%m')
    prev_ym    = (today.replace(day=1) - datetime.timedelta(days=1)).strftime('%Y-%m')
    target_months = None if BACKFILL else {current_ym, prev_ym}

    # ── SEO снапшоты ─────────────────────────────────────────────────────────
    print('\n=== SEO снапшоты ===')
    snaps = load_snapshots()
    print(f'  Найдено снапшотов: {len(snaps)}')
    if not snaps:
        print('  [warn] Нет файлов в DATA_DIR, пропускаем SEO')
    else:
        monthly = group_by_month(snaps)
        print(f'  Уникальных месяцев: {len(monthly)}')

        if BACKFILL:
            # Сначала полный backfill Wordstat из истории последнего снапшота
            process_wordstat_history(monthly)

        process_seo_snapshots(monthly, target_months)

    # ── LiveDune ─────────────────────────────────────────────────────────────
    print('\n=== LiveDune ===')
    process_livedune(target_months)

    print('\n✅ Готово')


if __name__ == '__main__':
    main()
