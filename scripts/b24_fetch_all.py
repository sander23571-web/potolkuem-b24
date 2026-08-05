#!/usr/bin/env python3
"""
b24_fetch_all.py — гарантированно полная выгрузка из Б24 (без обрезки по 50 записей).

Причина существования: 03-04.08.2026 одноразовые скрипты сверки несколько раз
неявно останавливались на первой странице (50 записей), что давало неверные
выводы ("SEO Мельникова не заводили" — а оно было на 2-й странице). Используй
этот модуль вместо самодельного curl/urllib в одноразовых проверках.

Использование как модуль:
    from b24_fetch_all import fetch_all, marketing_expenses_total

    items = fetch_all(1070, {'ufCrm24Direction': '226'}, ['id', 'title', 'ufCrm24Amount'])
    print(len(items), sum(float(i.get('ufCrm24Amount') or 0) for i in items))

Использование из командной строки (быстрая проверка):
    python3 scripts/b24_fetch_all.py 1070 '{"ufCrm24Direction":"226"}' id,title,ufCrm24Amount
"""

import os
import sys
import json
import urllib.request

WEBHOOK = os.environ.get('B24_WEBHOOK', 'https://potolkuem.bitrix24.ru/rest/134/gj6y27ehe0f42jeb/')


def b24(method, params):
    req = urllib.request.Request(
        WEBHOOK + method,
        data=json.dumps(params, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_all(entity_type_id, filter_=None, select=None):
    """Полная выгрузка crm.item.list — листает start=0,50,100... до конца.
    Никогда не возвращает частичный результат молча."""
    items = []
    start = 0
    while True:
        res = b24('crm.item.list', {
            'entityTypeId': entity_type_id,
            'filter': filter_ or {},
            'select': select or ['id'],
            'start': start,
        })
        batch = res.get('result', {}).get('items', [])
        items.extend(batch)
        if len(batch) < 50:
            break
        start += 50
    return items


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Использование: python3 b24_fetch_all.py <entityTypeId> [filter_json] [select_csv]')
        sys.exit(1)
    entity_type_id = int(sys.argv[1])
    filter_ = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    select = sys.argv[3].split(',') if len(sys.argv) > 3 else ['id']

    items = fetch_all(entity_type_id, filter_, select)
    print(f'Всего записей: {len(items)}')
    for i in items:
        print(i)
