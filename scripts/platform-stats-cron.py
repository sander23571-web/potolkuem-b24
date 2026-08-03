#!/usr/bin/env python3
"""
platform-stats-cron.py — заполняет СП «Статистика площадок» (typeId=28, entityTypeId=1074)
данными из SEO-снапшотов и LiveDune API.

Источники:
  1. SEO-снапшоты: /root/projects/talk-report/data/seo/YYYY-MM-DD.json
     Метрика (ежемесячно), Вебмастер (кликов/показов), Wordstat (брендовый спрос)
  2. LiveDune API: история подписчиков VK / TG / Дзен / TikTok / MAX
  3. Яндекс.Директ (CAMPAIGN_PERFORMANCE_REPORT) + VK Реклама (target.my.com):
     месячный расход/клики/показы

Запуск:
  python3 scripts/platform-stats-cron.py --backfill   # первичный запуск (все месяцы)
  python3 scripts/platform-stats-cron.py              # текущий месяц

Cron (на сервере):
  0 10 * * 1 python3 /root/projects/talk-report/scripts/platform-stats-cron.py  # каждый пн 10:00
"""

import os
import sys
import json
import time
import calendar
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
YD_TOKEN      = _env.get('YANDEX_DIRECT_OAUTH_TOKEN', os.environ.get('YANDEX_DIRECT_OAUTH_TOKEN', ''))
VK_ADS_TOKEN  = _env.get('VK_ADS_TOKEN', os.environ.get('VK_ADS_TOKEN', ''))
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
    'spend':          f'ufCrm{TYPE_ID}Spend',
    'purchases':      f'ufCrm{TYPE_ID}Purchases',
    'revenue':        f'ufCrm{TYPE_ID}Revenue',
    'posts':          f'ufCrm{TYPE_ID}Posts',
    'gained':         f'ufCrm{TYPE_ID}Gained',
    'lost':           f'ufCrm{TYPE_ID}Lost',
    'link_clicks':    f'ufCrm{TYPE_ID}LinkClicks',
}

# LiveDune: id → slug платформы
LD_ACCOUNTS = {
    2753311: 'VK_potolkuem',
    2753880: 'TG_potolkuem',
    3039674: 'Дзен_potolkuem',
    3466499: 'TikTok_potolkuem',
    3467355: 'MAX_potolkuem',
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
    if 'error' in resp:
        # Раньше эта функция молча возвращала [] на любую ошибку API (в т.ч.
        # "invalid date range" при запросе за пределами разрешённого окна) —
        # из-за этого недели подряд ни одна платформа не получала новых данных,
        # а cron рапортовал "успех". Теперь ошибка всплывает и попадает в лог.
        raise RuntimeError(f'{path}: {resp["error"]} — {resp.get("fields")}')
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
    Для каждого месяца создаёт/обновляет записи:
      - Метрика_сайт        (трафик)
      - ЯМаркет_Метрика_potolkuem (покупки/выручка на Я.Маркете)
      - Вебмастер_SEO       (клики/показы)
      - Wordstat_потолкуем  (брендовый спрос)
    """
    for ym, snap in sorted(monthly_snaps.items()):
        if target_months and ym not in target_months:
            continue
        period_iso = f'{ym}-01'
        print(f'\n  [{ym}]')

        # Метрика — period берём из данных (предыдущий завершённый месяц),
        # а не из даты снапшота, чтобы не писать июльские данные в запись июля
        m = snap.get('metrica', {})
        if m and 'error' not in m:
            metrica_ym   = m.get('period', ym)        # 'YYYY-MM' из данных
            metrica_iso  = f'{metrica_ym[:7]}-01'     # → 'YYYY-MM-01'
            b24_upsert('Метрика_сайт', metrica_iso, {
                'visits_total':   m.get('total_visits'),
                'visits_organic': m.get('organic_visits'),
                'visits_paid':    m.get('paid_visits'),
                'bounce_rate':    m.get('bounce_rate'),
            })
            time.sleep(0.4)

        # Я.Маркет (ecommerce-цели счётчика 98713606)
        me = snap.get('market_ecommerce', {})
        if me and 'error' not in me:
            me_ym  = me.get('period', ym)
            me_iso = f'{me_ym[:7]}-01'
            b24_upsert('ЯМаркет_Метрика_potolkuem', me_iso, {
                'purchases':    me.get('purchases'),
                'revenue':      me.get('revenue'),
                'visits_total': me.get('visits'),
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

    ВАЖНО: текущий тариф LiveDune отдаёт данные только за скользящее окно
    последних ~30 дней — запрос с более старым date_from падает с
    "invalid date range" (проверено вручную на нескольких аккаунтах,
    включая VK, 03.08.2026). Backfill старых месяцев через этот API поэтому
    сейчас недоступен физически — историю можно копить только вперёд.
    """
    if not LD_KEY:
        print('  [skip] LIVEDUNE_API_KEY не задан')
        return

    today = datetime.date.today()
    if BACKFILL:
        date_from = '2025-01-01'
    else:
        # Раньше здесь брали "начало месяца минус 90 дней" — это гарантированно
        # выходило за пределы разрешённого 30-дневного окна и API отдавал
        # ошибку на КАЖДЫЙ аккаунт, а не только на Дзен. ld_get() эту ошибку
        # молча превращал в [], поэтому неделями не было новых данных ни по
        # одной площадке, а cron рапортовал "Готово".
        date_from = (today - datetime.timedelta(days=29)).isoformat()

    date_to = today.isoformat()

    # Дзен: эндпоинт /history у этого аккаунта всегда пуст — даже в разрешённом
    # 30-дневном окне отдаёт {"count":0,"response":[]} (проверено вручную
    # 03.08.2026), при этом /analytics за тот же период отдаёт реальные данные
    # (followers/er/views). Поэтому именно для Дзен читаем /analytics.
    ANALYTICS_ONLY = {3039674}  # Дзен_potolkuem

    for acc_id, platform in LD_ACCOUNTS.items():
        print(f'\n  LiveDune: {platform} (id={acc_id})')

        if acc_id in ANALYTICS_ONLY:
            ym = today.strftime('%Y-%m')
            if target_months and ym not in target_months:
                continue
            try:
                stats = ld_get(f'/accounts/{acc_id}/analytics', {
                    'date_from': date_from,
                    'date_to':   date_to,
                })
            except Exception as e:
                print(f'  [err] {e}')
                continue
            if not stats:
                print('  [skip] /analytics пуст')
                continue
            b24_upsert(platform, f'{ym}-01', {
                'followers':      stats.get('followers'),
                'followers_diff': stats.get('followers_diff'),
                'er':             round(stats['er'], 2) if stats.get('er') is not None else None,
                'reach':          stats.get('views'),
            })
            time.sleep(0.4)
            continue

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
            # TikTok/MAX используют avg_views вместо reach
            reach_raw = last_row.get('reach') or last_row.get('avg_reach') or last_row.get('avg_views') or None
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

            # Активность за месяц — суммируем по всем дням (не последний день, как followers)
            posts       = sum((r.get('posts') or 0) for r in rows)
            gained      = sum((r.get('gained') or 0) for r in rows)
            lost        = sum((r.get('lost') or 0) for r in rows)
            link_clicks = sum(((r.get('actions') or {}).get('link_clicks') or 0) for r in rows)

            b24_upsert(platform, f'{ym}-01', {
                'followers':      followers,
                'followers_diff': followers_diff,
                'er':             round(er_val, 2) if er_val else None,
                'posts':          posts or None,
                'gained':         gained or None,
                'lost':           lost or None,
                'link_clicks':    link_clicks or None,
                'reach':          int(reach) if reach else None,
            })
            time.sleep(0.4)

# ── Реклама: Яндекс.Директ + VK Реклама ─────────────────────────────────────────

def _months_between(date_from, date_to):
    """Список 'YYYY-MM' от месяца date_from до месяца date_to включительно."""
    d = datetime.date.fromisoformat(date_from).replace(day=1)
    end = datetime.date.fromisoformat(date_to)
    months = []
    while d <= end:
        months.append(d.strftime('%Y-%m'))
        d = d.replace(year=d.year + 1, month=1) if d.month == 12 else d.replace(month=d.month + 1)
    return months


def yd_report(date_from, date_to):
    """CAMPAIGN_PERFORMANCE_REPORT за диапазон дат — суммарно по всем кампаниям.
    201/202 = отчёт ещё формируется, повторяем с тем же ReportName (грабля #17
    в CLAUDE.md талк-проекта)."""
    report_name = f'platform-stats-cron_{date_from}_{date_to}'
    body = json.dumps({
        'params': {
            'SelectionCriteria': {'DateFrom': date_from, 'DateTo': date_to},
            'FieldNames':        ['Impressions', 'Clicks', 'Cost'],
            'ReportName':        report_name,
            'ReportType':        'CAMPAIGN_PERFORMANCE_REPORT',
            'DateRangeType':     'CUSTOM_DATE',
            'Format':            'TSV',
            'IncludeVAT':        'YES',
        }
    }, ensure_ascii=False).encode('utf-8')
    headers = {
        'Authorization':        f'Bearer {YD_TOKEN}',
        'Accept-Language':      'ru',
        'processingMode':       'auto',
        'returnMoneyInMicros':  'false',
        'skipReportHeader':     'true',
        'skipReportSummary':    'true',
        'skipColumnHeader':     'true',
        'Content-Type':         'application/json; charset=utf-8',
    }
    for attempt in range(15):
        req = urllib.request.Request(
            'https://api.direct.yandex.com/json/v5/reports',
            data=body, headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status = r.status
                text = r.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'Директ отчёт {date_from}..{date_to}: HTTP {e.code} — '
                                f'{e.read().decode("utf-8", "ignore")[:300]}')
        if status in (201, 202):
            time.sleep(6)
            continue
        break
    else:
        raise RuntimeError(f'Директ отчёт {date_from}..{date_to}: не готов после {attempt+1} попыток')

    impressions = clicks = 0
    cost = 0.0
    for line in text.strip().splitlines():
        parts = line.split('\t')
        if len(parts) != 3:
            continue
        try:
            impressions += int(parts[0])
            clicks      += int(parts[1])
            cost        += float(parts[2])
        except ValueError:
            continue
    return {'impressions': impressions, 'clicks': clicks, 'spend': round(cost, 2)}


def vk_ads_stats(date_from, date_to):
    """Суммарный расход/клики/показы по всем кампаниям VK Рекламы за период."""
    body = json.dumps({'campaign_ids': [], 'date_from': date_from, 'date_to': date_to}).encode('utf-8')
    req = urllib.request.Request(
        'https://target.my.com/api/v2/statistics/campaigns/day.json',
        data=body,
        headers={'Authorization': f'Bearer {VK_ADS_TOKEN}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
    if 'items' not in resp:
        raise RuntimeError(f'VK Реклама {date_from}..{date_to}: {resp}')

    spend = 0.0
    clicks = impressions = 0
    for item in resp['items']:
        for row in item.get('rows', []):
            base = row.get('base', {})
            spend       += float(base.get('spent') or 0)
            clicks      += int(base.get('clicks') or 0)
            impressions += int(base.get('shows') or 0)
    return {'spend': round(spend, 2), 'clicks': clicks, 'impressions': impressions}


def process_ads(target_months=None):
    """
    Пишет в СП «Статистика площадок» (1074) месячные расход/клики/показы по
    Яндекс.Директ и VK Рекламе. В отличие от LiveDune эти два API отдают
    полную историю без ограничения окном — поэтому backfill здесь работает
    по-настоящему (Директ — с 2024-06, VK Реклама — с 2025-06).
    """
    today = datetime.date.today()
    if BACKFILL:
        date_from, date_to = '2024-06-01', today.isoformat()
    else:
        # Текущий + предыдущий месяц (тот же принцип, что и для остальных секций)
        first_of_month = today.replace(day=1)
        prev_month_end = first_of_month - datetime.timedelta(days=1)
        date_from, date_to = prev_month_end.replace(day=1).isoformat(), today.isoformat()

    months = _months_between(date_from, date_to)

    sources = [
        ('ЯндексДирект_potolkuem', YD_TOKEN, yd_report),
        ('VKРеклама_potolkuem',    VK_ADS_TOKEN, vk_ads_stats),
    ]

    for platform, token, fetch in sources:
        print(f'\n  Реклама: {platform}')
        if not token:
            print('  [skip] токен не задан')
            continue
        for ym in months:
            if target_months and ym not in target_months:
                continue
            last_day = calendar.monthrange(int(ym[:4]), int(ym[5:7]))[1]
            m_from = f'{ym}-01'
            m_to   = min(f'{ym}-{last_day:02d}', today.isoformat())
            try:
                stats = fetch(m_from, m_to)
            except Exception as e:
                print(f'  [err] {ym}: {e}')
                continue
            if not stats['impressions'] and not stats['clicks'] and not stats['spend']:
                continue  # месяц без активности — не плодим пустые записи
            b24_upsert(platform, f'{ym}-01', {
                'spend':       stats['spend'],
                'clicks':      stats['clicks'],
                'impressions': stats['impressions'],
            })
            time.sleep(0.5)

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

    # ── Реклама: Директ + VK Реклама ───────────────────────────────────────────
    print('\n=== Реклама (Директ + VK Реклама) ===')
    process_ads(target_months)

    print('\n✅ Готово')


if __name__ == '__main__':
    main()
