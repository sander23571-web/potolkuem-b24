#!/usr/bin/env python3
"""
SEO Snapshot — еженедельный срез данных.

Источники:
  1. Яндекс.Вебмастер — топ-50 запросов (14 дней)
  2. Яндекс.Метрика — органический трафик за текущий месяц
  3. Яндекс.Директ Wordstat — спрос «потолкуем» и конкуренты

Сохраняет: /root/projects/talk-report/data/seo/YYYY-MM-DD.json
Деплой: /root/projects/talk-report/scripts/seo-snapshot.py
Cron: 0 9 * * 1 python3 /root/projects/talk-report/scripts/seo-snapshot.py
"""

import os
import json
import datetime
import urllib.request
import urllib.error
import urllib.parse

# ── Конфигурация ──────────────────────────────────────────────────────────────

OAUTH_TOKEN   = os.environ.get('YANDEX_OAUTH_TOKEN', '')     # Метрика + Вебмастер
AI_STUDIO_KEY = os.environ.get('YA_AI_STUDIO_API_KEY', '')  # Search API v2 (Wordstat)
FOLDER_ID     = os.environ.get('YA_FOLDER_ID', '')          # Яндекс Облако folder_id
DATA_DIR      = '/root/projects/talk-report/data/seo'

# Вебмастер
WM_USER_ID    = '1993756186'
WM_HOST_ID    = 'https:potolkuem.pro:443'    # формат Яндекс host_id: protocol:host:port (без //)

# Метрика
MC_COUNTER    = '97696821'

# Wordstat — фразы для мониторинга
WORDSTAT_PHRASES = [
    'потолкуем',
    'имаджинариум',
    'бункер настольная игра',
    'элиас настольная игра',
    'настольная игра для взрослых',
]

# ── HTTP helper ───────────────────────────────────────────────────────────────

def get_json(url, token=None, headers_extra=None):
    req = urllib.request.Request(url)
    if token:
        req.add_header('Authorization', 'OAuth ' + token)
    if headers_extra:
        for k, v in headers_extra.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f'HTTP {e.code} {url}: {body[:300]}')

def post_json(url, payload, token=None, headers_extra=None, content_type='application/json; charset=utf-8'):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req  = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', content_type)
    if token:
        req.add_header('Authorization', 'OAuth ' + token)
    if headers_extra:
        for k, v in headers_extra.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {e.code} {url}: {body[:300]}')

# ── 1. Вебмастер ──────────────────────────────────────────────────────────────

def fetch_webmaster():
    """Топ-50 запросов за последние 14 дней (POST)."""
    today      = datetime.date.today()
    date_to    = today.isoformat()
    date_from  = (today - datetime.timedelta(days=14)).isoformat()

    encoded_host = urllib.parse.quote(WM_HOST_ID, safe='')
    url  = (
        f'https://api.webmaster.yandex.net/v4/user/{WM_USER_ID}'
        f'/hosts/{encoded_host}/query-analytics/list'
    )
    body = {
        'limit':                 50,
        'offset':                0,
        'date_from':             date_from,
        'date_to':               date_to,
        'device_type_indicator': 'ALL',
        'order_by':              'CLICKS',
        'order':                 'DESC',
    }
    data = post_json(url, body, token=OAUTH_TOKEN)

    # API возвращает statistics по дням: каждая запись = {date, field, value}.
    # POSITION присутствует только в дни с показами.
    # Вычисляем взвешенную среднюю позицию: sum(pos*impr) / sum(impr).
    raw = data.get('text_indicator_to_statistics', [])

    result = []
    for item in raw:
        query = item.get('text_indicator', {}).get('value', '')
        stats = item.get('statistics', [])

        # Группируем по дате чтобы связать POSITION с IMPRESSIONS за тот же день
        by_date = {}
        for s in stats:
            date = s.get('date', '')
            if date not in by_date:
                by_date[date] = {}
            by_date[date][s.get('field', '')] = s.get('value', 0) or 0

        total_clicks = total_impressions = 0
        pos_weighted_sum = 0.0
        pos_impressions_sum = 0

        for day in by_date.values():
            total_clicks      += day.get('CLICKS', 0)
            day_impr           = day.get('IMPRESSIONS', 0)
            total_impressions += day_impr
            if 'POSITION' in day and day_impr > 0:
                pos_weighted_sum  += day['POSITION'] * day_impr
                pos_impressions_sum += day_impr

        ctr      = round(total_clicks / total_impressions, 4) if total_impressions else 0.0
        position = round(pos_weighted_sum / pos_impressions_sum, 1) if pos_impressions_sum > 0 else None

        result.append({
            'query':       query,
            'clicks':      int(total_clicks),
            'impressions': int(total_impressions),
            'ctr':         ctr,
            'position':    position,
        })

    # Сортируем по кликам (API уже должен был, но на всякий случай)
    result.sort(key=lambda x: x['clicks'], reverse=True)

    return {
        'date_from': date_from,
        'date_to':   date_to,
        'total_queries': data.get('count', len(result)),
        'rows':      result[:50],
    }

# ── 2. Метрика ────────────────────────────────────────────────────────────────

def fetch_metrica():
    """Органический трафик за ПРЕДЫДУЩИЙ завершённый месяц."""
    today        = datetime.date.today()
    first_this   = today.replace(day=1)
    last_prev    = first_this - datetime.timedelta(days=1)
    month_from   = last_prev.replace(day=1).isoformat()
    date_to      = last_prev.isoformat()
    period_label = month_from[:7]  # 'YYYY-MM'

    def mc_get(metrics, filters=None):
        params = (
            f'?id={MC_COUNTER}'
            f'&metrics={metrics}'
            f'&date1={month_from}&date2={date_to}'
            f'&accuracy=full'
        )
        if filters:
            params += '&filters=' + urllib.parse.quote(filters)
        return get_json('https://api-metrica.yandex.net/stat/v1/data' + params, token=OAUTH_TOKEN)

    # Общий трафик
    total_r = mc_get('ym:s:visits,ym:s:users,ym:s:bounceRate')
    total   = total_r.get('totals', [0, 0, 0])

    # Органика
    org_r = mc_get(
        'ym:s:visits,ym:s:users',
        filters="ym:s:trafficSourceName=='Search engine traffic'"
    )
    org = org_r.get('totals', [0, 0])

    # Платный трафик (Директ + все платные каналы) — в Метрике = "Ad traffic"
    paid_r = mc_get(
        'ym:s:visits,ym:s:users',
        filters="ym:s:trafficSourceName=='Ad traffic'"
    )
    paid = paid_r.get('totals', [0, 0])

    return {
        'period':         period_label,   # 'YYYY-MM' — период данных, не дата снапшота
        'date_from':      month_from,
        'date_to':        date_to,
        'total_visits':   int(total[0]) if total else 0,
        'total_users':    int(total[1]) if len(total) > 1 else 0,
        'bounce_rate':    round(total[2], 1) if len(total) > 2 else None,
        'organic_visits': int(org[0]) if org else 0,
        'organic_users':  int(org[1]) if len(org) > 1 else 0,
        'paid_visits':    int(paid[0]) if paid else 0,
        'paid_users':     int(paid[1]) if len(paid) > 1 else 0,
    }

# ── 3. Wordstat ───────────────────────────────────────────────────────────────

def _ws_request(endpoint, payload):
    """Выполняет запрос к Yandex Search API v2 Wordstat."""
    url  = f'https://searchapi.api.cloud.yandex.net/v2/wordstat/{endpoint}'
    body = json.dumps({**payload, 'folderId': FOLDER_ID}).encode('utf-8')
    req  = urllib.request.Request(url, data=body)
    req.add_header('Authorization', 'Api-Key ' + AI_STUDIO_KEY)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_wordstat():
    """
    Спрос по брендовым и конкурентным запросам + история за 18 месяцев.
    Яндекс Search API v2 (AI Studio) — не привязан к Direct-аккаунту.
    """
    # 1. Текущие значения (topRequests)
    current = {}
    for phrase in WORDSTAT_PHRASES:
        try:
            d = _ws_request('topRequests', {'phrase': phrase, 'numPhrases': 1})
            current[phrase] = int(d.get('totalCount', 0))
        except Exception as e:
            current[phrase] = f'error: {e}'

    # 2. История «потолкуем» по месяцам (dynamics, последние 18 мес)
    history = []
    try:
        today      = datetime.date.today()
        # История с 01.01 прошлого года (~18 месяцев)
        from_dt    = f'{today.year - 1}-01-01T00:00:00Z'
        # До последнего дня прошлого месяца
        first_this = today.replace(day=1)
        last_prev  = first_this - datetime.timedelta(days=1)
        to_dt      = f'{last_prev.isoformat()}T23:59:59Z'
        d = _ws_request('dynamics', {
            'phrase':   'потолкуем',
            'period':   'PERIOD_MONTHLY',
            'fromDate': from_dt,
            'toDate':   to_dt,
        })
        history = [
            {'month': row['date'][:7], 'count': int(row['count'])}
            for row in d.get('results', [])
        ]
    except Exception as e:
        history = [{'error': str(e)}]

    return {'_source': 'live', 'current': current, 'brand_history': history}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    today    = datetime.date.today().isoformat()
    out_file = os.path.join(DATA_DIR, f'{today}.json')

    if os.path.exists(out_file):
        print(f'Снапшот за {today} уже существует: {out_file}')
        return

    os.makedirs(DATA_DIR, exist_ok=True)

    snapshot = {
        'date':      today,
        'generated': datetime.datetime.utcnow().isoformat() + 'Z',
    }

    # 1. Вебмастер
    print('Вебмастер...')
    try:
        snapshot['webmaster'] = fetch_webmaster()
        print(f"  {len(snapshot['webmaster']['rows'])} запросов")
    except Exception as e:
        snapshot['webmaster'] = {'error': str(e)}
        print(f'  ОШИБКА: {e}')

    # 2. Метрика
    print('Метрика...')
    try:
        snapshot['metrica'] = fetch_metrica()
        m = snapshot['metrica']
        print(f"  Визиты: {m['total_visits']} всего, {m['organic_visits']} органика, {m['paid_visits']} платный")
    except Exception as e:
        snapshot['metrica'] = {'error': str(e)}
        print(f'  ОШИБКА: {e}')

    # 3. Wordstat
    print('Wordstat...')
    try:
        snapshot['wordstat'] = fetch_wordstat()
        ws = snapshot['wordstat']
        cur = ws.get('current', {})
        hist = ws.get('brand_history', [])
        print(f"  потолкуем: {cur.get('потолкуем','?')} / история: {len(hist)} мес")
    except Exception as e:
        snapshot['wordstat'] = {'error': str(e)}
        print(f'  ОШИБКА: {e}')

    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    print(f'\nСохранено: {out_file}')


if __name__ == '__main__':
    main()
