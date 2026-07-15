#!/usr/bin/env python3
"""
b24-backup.py — бэкап данных CRM из Битрикс24.

Что сохраняет:
  - Сделки (все воронки)
  - Контакты
  - Компании
  - Все смарт-процессы (Выставки, Расходы, Ведущие, Выходы, Точки продаж и т.д.)
  Задачи НЕ включены — они занимают 76% объёма и не несут финансовых данных.

Использование:
  python3 scripts/b24-backup.py                  # бэкап в ./backups/YYYY-MM-DD_HH-MM/
  python3 scripts/b24-backup.py --compress        # + упаковать в .tar.gz и удалить папку
  python3 scripts/b24-backup.py --dir /path/to/  # другая директория для бэкапов
  python3 scripts/b24-backup.py --list            # показать существующие бэкапы

Расположение бэкапов: ./backups/ (рядом с репозиторием)
"""

import os
import sys
import json
import time
import gzip
import tarfile
import datetime
import argparse
import urllib.request
import urllib.error

# ── Конфигурация ──────────────────────────────────────────────────────────────

def load_env(path):
    env = {}
    try:
        for line in open(path).read().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
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

WEBHOOK = _env.get('B24_WEBHOOK', os.environ.get('B24_WEBHOOK', ''))

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(SCRIPT_DIR, '..', 'backups')

# Смарт-процессы: entityTypeId → название
SMART_PROCESSES = {
    1044: 'sp_otdel_razrabotki',
    1048: 'sp_vystavki',
    1052: 'sp_vedushchie',
    1056: 'sp_vyhody_vedushchego',
    1060: 'sp_igrovye_sessii',
    1064: 'sp_logistika',
    1068: 'sp_soglasiya',
    1070: 'sp_rashody',
    1072: 'sp_tochki_prodazh',
    1074: 'sp_statistika_ploshchadok',
}

# ── B24 helpers ───────────────────────────────────────────────────────────────

def b24_post(method, params):
    url  = WEBHOOK + method
    data = json.dumps(params, ensure_ascii=False).encode('utf-8')
    req  = urllib.request.Request(url, data=data)
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {e.code}: {body[:200]}')


def fetch_all_pages(method, params, result_key, page_key='start'):
    """Постранично выгружает все записи."""
    items = []
    start = 0
    while True:
        p = {**params, page_key: start}
        resp = b24_post(method, p)
        batch = resp.get('result', {})
        if isinstance(batch, dict):
            batch = batch.get(result_key, [])
        elif isinstance(batch, list):
            pass  # crm.deal.list возвращает result как список напрямую

        if not batch:
            break

        items.extend(batch)
        total = resp.get('total')

        if total and len(items) >= total:
            break
        if len(batch) < 50:
            break

        start += 50
        time.sleep(0.2)  # не флудим API

    return items


def fetch_crm_list(method, select='*'):
    """Выгружает все записи через crm.*.list (возвращает result как список)."""
    items = []
    start = 0
    while True:
        resp = b24_post(method, {'filter': {}, 'select': [select], 'start': start})
        batch = resp.get('result', [])
        if not batch:
            break
        items.extend(batch)
        total = resp.get('total', 0)
        if len(items) >= total or len(batch) < 50:
            break
        start += 50
        time.sleep(0.2)
    return items


def fetch_smart_process(entity_type_id):
    """Выгружает все записи из смарт-процесса."""
    items = []
    start = 0
    while True:
        resp = b24_post('crm.item.list', {
            'entityTypeId': entity_type_id,
            'select': ['*'],
            'start': start,
        })
        result = resp.get('result', {})
        batch  = result.get('items', [])
        if not batch:
            break
        items.extend(batch)
        total = result.get('total', 0) or resp.get('total', 0)
        if len(items) >= total or len(batch) < 50:
            break
        start += 50
        time.sleep(0.2)
    return items

# ── Сохранение ────────────────────────────────────────────────────────────────

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── Команды ───────────────────────────────────────────────────────────────────

def cmd_list(backup_dir):
    backup_dir = os.path.abspath(backup_dir)
    if not os.path.isdir(backup_dir):
        print('Папка бэкапов не найдена:', backup_dir)
        return

    entries = sorted([
        e for e in os.listdir(backup_dir)
        if os.path.isdir(os.path.join(backup_dir, e)) or e.endswith('.tar.gz')
    ], reverse=True)

    if not entries:
        print('Бэкапов нет.')
        return

    print(f'Бэкапы в {backup_dir}:\n')
    total_size = 0
    for name in entries:
        full = os.path.join(backup_dir, name)
        if os.path.isfile(full):
            size = os.path.getsize(full)
            total_size += size
            print(f'  {name}  ({size/1024:.0f} КБ)')
        else:
            size = sum(
                os.path.getsize(os.path.join(r, f))
                for r, _, files in os.walk(full)
                for f in files
            )
            total_size += size
            files_count = sum(len(fs) for _, _, fs in os.walk(full))
            print(f'  {name}/  ({size/1024:.0f} КБ, {files_count} файлов)')

    print(f'\nИтого: {len(entries)} бэкапов, {total_size/1024:.0f} КБ')


def cmd_backup(backup_dir, compress=False):
    if not WEBHOOK:
        print('ERROR: B24_WEBHOOK не задан')
        sys.exit(1)

    ts      = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M')
    out_dir = os.path.join(os.path.abspath(backup_dir), ts)
    os.makedirs(out_dir, exist_ok=True)

    manifest = {
        'created':  datetime.datetime.utcnow().isoformat() + 'Z',
        'webhook':  WEBHOOK[:50] + '...',
        'entities': {},
    }

    print(f'Б24 бэкап → {out_dir}\n')

    # ── Сделки ────────────────────────────────────────────────────────────────
    print('Сделки...')
    try:
        deals = fetch_crm_list('crm.deal.list', '*')
        save_json(os.path.join(out_dir, 'deals.json'), deals)
        manifest['entities']['deals'] = len(deals)
        print(f'  {len(deals)} записей')
    except Exception as e:
        manifest['entities']['deals'] = f'ERROR: {e}'
        print(f'  ОШИБКА: {e}')

    # ── Контакты ──────────────────────────────────────────────────────────────
    print('Контакты...')
    try:
        contacts = fetch_crm_list('crm.contact.list', '*')
        save_json(os.path.join(out_dir, 'contacts.json'), contacts)
        manifest['entities']['contacts'] = len(contacts)
        print(f'  {len(contacts)} записей')
    except Exception as e:
        manifest['entities']['contacts'] = f'ERROR: {e}'
        print(f'  ОШИБКА: {e}')

    # ── Компании ──────────────────────────────────────────────────────────────
    print('Компании...')
    try:
        companies = fetch_crm_list('crm.company.list', '*')
        save_json(os.path.join(out_dir, 'companies.json'), companies)
        manifest['entities']['companies'] = len(companies)
        print(f'  {len(companies)} записей')
    except Exception as e:
        manifest['entities']['companies'] = f'ERROR: {e}'
        print(f'  ОШИБКА: {e}')

    # ── Смарт-процессы ────────────────────────────────────────────────────────
    for et_id, fname in SMART_PROCESSES.items():
        label = fname.replace('sp_', 'СП ').replace('_', ' ')
        print(f'{label} (entityTypeId={et_id})...')
        try:
            items = fetch_smart_process(et_id)
            save_json(os.path.join(out_dir, f'{fname}.json'), items)
            manifest['entities'][fname] = len(items)
            print(f'  {len(items)} записей')
        except Exception as e:
            manifest['entities'][fname] = f'ERROR: {e}'
            print(f'  ОШИБКА: {e}')

    # ── Манифест ──────────────────────────────────────────────────────────────
    save_json(os.path.join(out_dir, '_manifest.json'), manifest)

    # ── Подсчёт размера ───────────────────────────────────────────────────────
    total_bytes = sum(
        os.path.getsize(os.path.join(out_dir, f))
        for f in os.listdir(out_dir)
    )
    print(f'\nРазмер несжатый: {total_bytes/1024:.0f} КБ')

    # ── Сжатие ────────────────────────────────────────────────────────────────
    if compress:
        archive = out_dir + '.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(out_dir, arcname=ts)
        # Удаляем несжатую папку
        import shutil
        shutil.rmtree(out_dir)
        arc_size = os.path.getsize(archive)
        print(f'Архив: {archive}')
        print(f'Размер сжатый:   {arc_size/1024:.0f} КБ  (x{total_bytes/arc_size:.1f})')
    else:
        print(f'Папка: {out_dir}')

    print(f'\n✅ Готово · {ts}')

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Бэкап данных Б24 CRM')
    parser.add_argument('--compress', action='store_true',
                        help='Упаковать в .tar.gz и удалить папку')
    parser.add_argument('--dir', default=DEFAULT_DIR,
                        help=f'Папка для бэкапов (по умолчанию: {DEFAULT_DIR})')
    parser.add_argument('--list', action='store_true',
                        help='Показать существующие бэкапы')
    args = parser.parse_args()

    if args.list:
        cmd_list(args.dir)
    else:
        cmd_backup(args.dir, compress=args.compress)


if __name__ == '__main__':
    main()
