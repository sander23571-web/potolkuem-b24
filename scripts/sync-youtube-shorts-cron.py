#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-youtube-shorts-cron.py — 30.09.2026.

Закрывает последнюю дыру в статистике постов СП «Активность Креативного директора»
(entityTypeId=1100, категория «Соцсети»=60) — YouTube Shorts. LiveDune YouTube вообще
не отслеживает (не входит в 5 привязанных аккаунтов), API-источника нет физически —
единственный путь: открыть публичную страницу шортса и прочитать счётчики из
встроенного JSON (playerMicroformatRenderer), без логина. Проверено вручную 30.09.2026:
`externalVideoId` в этом блоке совпадает с id из URL — не подхватываем чужой ролик
по ошибке. `likeCount` там же рядом. `commentCount` так просто не достаётся (не в этом
блоке) — оставляем как есть, не гадаем.

Отдельный скрипт (не часть sync-post-stats-cron.py) специально — требует Playwright,
которого нет в системном python3, а плодить эту зависимость для всех остальных cron
на сервере не нужно. Запускать ТОЛЬКО через свой venv:
  scripts/.venv_playwright_stats/bin/python3 scripts/sync-youtube-shorts-cron.py --execute

Инстаграм так НЕ делаем — публичные страницы постов всё чаще прячут цифры без
авторизации, честной цифры может не быть в принципе (см. proj log talk id=1102).
"""
import json
import os
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright


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


_env = {}
for p in ['/root/projects/talk-report/.env', '/root/projects/talk/.env',
          os.path.join(os.path.dirname(__file__), '../.env')]:
    _env.update(load_env(p))
B24_WEBHOOK = _env.get('B24_WEBHOOK', os.environ.get('B24_WEBHOOK', ''))

ENTITY_TYPE_ID = 1100
CATEGORY_SOCIAL = 60
FIELDS = {
    'link':     'ufCrm42SmLink',
    'views':    'ufCrm42SmViews',
    'likes':    'ufCrm42SmLikes',
}
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
YT_ID_RE = re.compile(r'(?:shorts/|v=|youtu\.be/)([\w-]{11})')
STATS_RE = re.compile(
    r'"viewCount":"(\d+)".{0,400}?"externalVideoId":"([\w-]+)".{0,100}?"likeCount":"(\d+)"',
    re.DOTALL)


def b24(method, params):
    url = B24_WEBHOOK + method
    data = json.dumps(params, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data)
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    if resp.get('error'):
        raise RuntimeError(f'{method}: {resp["error"]} — {resp.get("error_description","")}')
    return resp.get('result')


def fetch_youtube_records():
    items, start = [], 0
    while True:
        res = b24('crm.item.list', {
            'entityTypeId': ENTITY_TYPE_ID,
            'filter': {'categoryId': CATEGORY_SOCIAL},
            'select': ['id', FIELDS['link'], FIELDS['views'], FIELDS['likes']],
            'start': start,
        })
        batch = res.get('items', []) if res else []
        items.extend(batch)
        if len(batch) < 50:
            break
        start += 50
    link = FIELDS['link']
    return [it for it in items
            if it.get(link) and ('youtube.com' in it[link] or 'youtu.be' in it[link])]


def scrape_short(page, url):
    video_id_m = YT_ID_RE.search(url)
    video_id = video_id_m.group(1) if video_id_m else None
    page.goto(url, timeout=20000, wait_until='domcontentloaded')
    page.wait_for_timeout(2000)
    html = page.content()
    m = STATS_RE.search(html)
    if not m:
        return None
    views, found_id, likes = m.group(1), m.group(2), m.group(3)
    if video_id and found_id != video_id:
        print(f'    [skip] id в странице ({found_id}) не совпадает со ссылкой ({video_id})')
        return None
    return {'views': int(views), 'likes': int(likes)}


def main():
    execute = '--execute' in sys.argv
    if not B24_WEBHOOK:
        print('ERROR: B24_WEBHOOK не найден')
        sys.exit(1)

    records = fetch_youtube_records()
    print(f'YouTube-карточек в СП 1100: {len(records)}')

    updated = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(user_agent=UA)
        for r in records:
            link = r[FIELDS['link']]
            print(f'  id={r["id"]}: {link}')
            try:
                stats = scrape_short(page, link)
            except Exception as e:
                print(f'    [err] {e}')
                continue
            if not stats:
                print('    [skip] счётчики не найдены на странице')
                continue

            new_fields = {}
            for key in ('views', 'likes'):
                val = stats[key]
                if r.get(FIELDS[key]) != val:
                    new_fields[FIELDS[key]] = val
            if not new_fields:
                print('    уже актуально')
                continue

            print(f'    -> {new_fields}')
            if execute:
                try:
                    b24('crm.item.update', {
                        'entityTypeId': ENTITY_TYPE_ID, 'id': r['id'], 'fields': new_fields,
                    })
                    updated += 1
                except Exception as e:
                    print(f'    [err] update: {e}')
            else:
                updated += 1
            time.sleep(1.0)  # не долбить youtube.com чаще необходимого
        browser.close()

    print(f'\n{"Обновлено" if execute else "Будет обновлено"}: {updated}')
    if not execute:
        print('--dry-run (--execute не передан) — в Б24 ничего не писал.')


if __name__ == '__main__':
    main()
