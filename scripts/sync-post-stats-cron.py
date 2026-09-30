#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-post-stats-cron.py — 30.09.2026.

Подтягивает живую статистику КОНКРЕТНЫХ постов (не помесячные агрегаты, как
platform-stats-cron.py) из LiveDune в СП «Активность Креативного директора»
(entityTypeId=1100, категория «Соцсети»=60).

Как это работает: у каждой записи в 1100 уже есть ссылка на опубликованный пост
(ufCrm42SmLink) — заполняется руками при публикации. LiveDune /accounts/{id}/posts
отдаёт последние посты аккаунта с полем `url`, которое СОВПАДАЕТ по формату с этой
ссылкой (проверено вручную 30.09.2026 на всех 5 площадках) — значит сопоставление
идёт напрямую по URL, без эвристик по дате/тексту.

Что реально приходит по площадкам (проверено 30.09.2026, см. proj log talk):
  VK/Дзен/TikTok/MAX — url, reactions.likes/comments/reposts, impressions.total (views),
                       у VK ещё и reach.total
  Telegram           — url есть, но reactions/impressions/reach = None (LiveDune не отдаёт
                       для TG метрики поста вообще — то же ограничение, что и в помесячной
                       статистике 1074). Такие записи остаются с пустыми метриками, это не баг.

НЕ трогает Zen-специфичные поля (ufCrm42SmZenCompletion/ZenReadTime/ZenWatchTime/ZenRetention) —
для них нет данных в ответе /posts, нужен отдельный источник, если понадобится.

Запуск: python3 scripts/sync-post-stats-cron.py --dry-run   (сначала!)
        python3 scripts/sync-post-stats-cron.py --execute
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request


TIKTOK_ID_RE = re.compile(r'/(?:video|v|player/v1)/(\d+)')


def resolve_tiktok_short_link(u):
    """vm.tiktok.com/xxx -> реальный video ID (30.09.2026, см. proj log talk id=1102/1103).
    Чистый HTTP-редирект, JS не нужен — Playwright/скрапинг избыточны: LiveDune уже отдаёт
    те же посты через /player/v1/{id}, просто под другим видом URL. Резолвим короткую ссылку,
    вытаскиваем numeric id, матчим по нему напрямую с тем, что уже пришло из API."""
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            final_url = r.geturl()
        m = TIKTOK_ID_RE.search(final_url)
        return m.group(1) if m else None
    except Exception:
        return None


def norm_url(u):
    """Нормализует ссылку для сопоставления с LiveDune (30.09.2026, см. proj log talk):
    (1) vk.ru и vk.com — один и тот же ВК, но в карточках 1100 часть ссылок на vk.ru,
        а LiveDune всегда отдаёт vk.com — без этого 16 живых VK-постов не матчились;
    (2) Дзен/др. добавляют трекинговые query-параметры (?rid=...&referrer_clid=...) при
        расшаривании — у LiveDune чистый URL без них, сравниваем только path.
    TikTok короткие ссылки (vm.tiktok.com/xxx) сюда не лечатся — это другой ID, не
        сводится к нормализации, нужен отдельный запрос к самому TikTok."""
    if not u:
        return u
    u = u.strip().split('?', 1)[0].rstrip('/')
    u = u.replace('://vk.ru/', '://vk.com/')
    return u

# ── env (тот же порядок файлов, что в platform-stats-cron.py) ───────────────
def load_env(path):
    env = {}
    try:
        for line in open(path, encoding='utf-8-sig').read().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

import os
_env = {}
for p in ['/root/projects/talk-report/.env', '/root/projects/talk/.env',
          os.path.join(os.path.dirname(__file__), '../.env')]:
    _env.update(load_env(p))

B24_WEBHOOK = _env.get('B24_WEBHOOK', os.environ.get('B24_WEBHOOK', ''))
LD_KEY      = _env.get('LIVEDUNE_API_KEY', os.environ.get('LIVEDUNE_API_KEY', ''))

ENTITY_TYPE_ID = 1100
CATEGORY_SOCIAL = 60

FIELDS = {
    'link':     'ufCrm42SmLink',
    'views':    'ufCrm42SmViews',
    'reach':    'ufCrm42SmReach',
    'likes':    'ufCrm42SmLikes',
    'comments': 'ufCrm42SmComments',
    'shares':   'ufCrm42SmShares',
}

LD_ACCOUNTS = {
    2753311: 'VK_potolkuem',
    2753880: 'TG_potolkuem',
    3039674: 'Дзен_potolkuem',
    3466499: 'TikTok_potolkuem',
    3467355: 'MAX_potolkuem',
}
POSTS_PER_ACCOUNT = 100  # с запасом покрывает всю историю СП (создан 30.08.2026)


def b24(method, params):
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
    req = urllib.request.Request(f'https://api.livedune.com{path}?{qs}')
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    if 'error' in resp:
        raise RuntimeError(f'{path}: {resp["error"]} — {resp.get("fields")}')
    return resp.get('response', [])


def fetch_post_stats_map():
    """
    Возвращает (by_url, by_tiktok_id).
    by_url: normalized-url -> {views, reach, likes, comments, shares}, по всем 5 площадкам.
    by_tiktok_id: TikTok video id -> те же поля — нужен отдельно, т.к. карточки 1100 у части
    TikTok-постов хранят короткую ссылку (vm.tiktok.com/xxx), а LiveDune отдаёт технический
    player-URL с тем же numeric id в другом виде — по сырому url не матчится, только по id
    (резолвим короткую ссылку HTTP-редиректом отдельно, см. resolve_tiktok_short_link).
    """
    by_url, by_tiktok_id = {}, {}
    for acc_id, platform in LD_ACCOUNTS.items():
        try:
            posts = ld_get(f'/accounts/{acc_id}/posts', {'count': POSTS_PER_ACCOUNT})
        except Exception as e:
            print(f'  [err] {platform}: {e}')
            continue
        n = 0
        for p in posts:
            url = p.get('url')
            if not url:
                continue
            reactions = p.get('reactions') or {}
            impressions = p.get('impressions') or {}
            reach = p.get('reach')
            stats = {
                'views':    impressions.get('total'),
                'reach':    (reach.get('total') if isinstance(reach, dict) else None),
                'likes':    reactions.get('likes'),
                'comments': reactions.get('comments'),
                'shares':   reactions.get('reposts', reactions.get('shares', reactions.get('forwards'))),
                'platform': platform,
            }
            by_url[norm_url(url)] = stats
            if platform == 'TikTok_potolkuem':
                m = TIKTOK_ID_RE.search(url)
                if m:
                    by_tiktok_id[m.group(1)] = stats
            n += 1
        print(f'  {platform}: {n} постов из LiveDune')
        time.sleep(0.5)
    return by_url, by_tiktok_id


def fetch_activity_links():
    items, start = [], 0
    while True:
        res = b24('crm.item.list', {
            'entityTypeId': ENTITY_TYPE_ID,
            'filter': {'categoryId': CATEGORY_SOCIAL},
            'select': ['id', FIELDS['link'], FIELDS['views'], FIELDS['reach'],
                       FIELDS['likes'], FIELDS['comments'], FIELDS['shares']],
            'start': start,
        })
        batch = res.get('items', []) if res else []
        items.extend(batch)
        if len(batch) < 50:
            break
        start += 50
    return items


def main():
    execute = '--execute' in sys.argv
    if not (B24_WEBHOOK and LD_KEY):
        print('ERROR: B24_WEBHOOK или LIVEDUNE_API_KEY не найдены')
        sys.exit(1)

    print('Тяну посты из LiveDune (все 5 площадок)...')
    by_url, by_tiktok_id = fetch_post_stats_map()
    print(f'\nВсего постов с url в карте: {len(by_url)} (из них TikTok с id: {len(by_tiktok_id)})')

    print('\nЧитаю СП «Активность» (1100), категория Соцсети...')
    records = fetch_activity_links()
    print(f'Записей всего: {len(records)}')

    no_link = matched = updated = no_data_for_platform = resolved_tiktok = 0
    for r in records:
        link = r.get(FIELDS['link'])
        if not link:
            no_link += 1
            continue
        stats = by_url.get(norm_url(link))
        if not stats and 'vm.tiktok.com' in link:
            tiktok_id = resolve_tiktok_short_link(link)
            if tiktok_id and tiktok_id in by_tiktok_id:
                stats = by_tiktok_id[tiktok_id]
                resolved_tiktok += 1
            time.sleep(0.3)  # не долбить tiktok.com чаще необходимого
        if not stats:
            continue  # пост не найден среди последних 100 у своей площадки — пропускаем молча
        matched += 1

        # TG отдаёт url, но все метрики None — писать нечего, не считаем это апдейтом
        if all(stats.get(k) is None for k in ('views', 'reach', 'likes', 'comments', 'shares')):
            no_data_for_platform += 1
            continue

        new_fields = {}
        for key in ('views', 'reach', 'likes', 'comments', 'shares'):
            val = stats.get(key)
            if val is not None and r.get(FIELDS[key]) != val:
                new_fields[FIELDS[key]] = val

        if not new_fields:
            continue  # уже актуально, писать не нужно

        if execute:
            try:
                b24('crm.item.update', {
                    'entityTypeId': ENTITY_TYPE_ID, 'id': r['id'], 'fields': new_fields,
                })
                updated += 1
            except Exception as e:
                print(f'  [err] update id={r["id"]}: {e}')
            time.sleep(0.3)
        else:
            updated += 1
            if updated <= 15:
                print(f'  [dry-run] id={r["id"]} ({stats["platform"]}) -> {new_fields}')

    print(f'\nИтого: без ссылки={no_link}, найдено в LiveDune={matched} '
          f'(из них через резолв короткой TikTok-ссылки={resolved_tiktok}), '
          f'без метрик у площадки (TG)={no_data_for_platform}, '
          f'{"обновлено" if execute else "будет обновлено"}={updated}')
    if not execute:
        print('\n--dry-run (--execute не передан) — в Б24 ничего не писал.')


if __name__ == '__main__':
    main()
