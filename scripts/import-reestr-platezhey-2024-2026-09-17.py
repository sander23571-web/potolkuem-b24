#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Импорт в СП «Реестр платежей» (entityTypeId=1080), 17.09.2026 — весь 2024 год.

Источник: Реестр_платежей_2024_к_разбору_2026_09_15_V2.xlsx, лист «К разбору» (783 строки) —
это исходный файл build-reestr-2024-review.py (15.09.2026), к которому исполнитель добавил
столбец C («зелёный», без заголовка) — ручную правку кода для 189 строк, флагованных как
«? Прочее — проверить вручную» (столбец K).

Комментарий исполнителя (17.09.2026): если в зелёном столбце для флагованной строки пусто —
значит код пока не определён («я не знаю»), это НЕ то же самое, что код 13.8 «Прочее».

Итоговый код по строке:
  1) если флаг «? Прочее» стоит и зелёный столбец (C) пуст — код НЕ проставляется вообще
     (не 13.8!) — по решению владельца 17.09.2026: 13.8 привязывает запись к разделу 13,
     это мешает дальнейшему разбору. Такие записи уходят в CRM без ufCrm32Code, с явной
     пометкой в описании платежа.
  2) если зелёный столбец заполнен — берём код оттуда (это относится и к 6 строкам, где
     исполнитель явно ПОДТВЕРДИЛ 13.8, вписав туда же 13.8 — это осознанное решение, не
     «не знаю»).
  3) иначе — код из столбца H (исходная офлайн-классификация 15.09).

Дедуп — свежий снапшот всех живых записей 1080 на момент запуска (не переиспользуем старый
.existing-1080-2026-09-03.json — он устарел, записей с тех пор прибавилось).

Запуск: python3 scripts/import-reestr-platezhey-2024-2026-09-17.py --dry-run   (сначала!)
        python3 scripts/import-reestr-platezhey-2024-2026-09-17.py --pilot --execute
        python3 scripts/import-reestr-platezhey-2024-2026-09-17.py --execute
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import openpyxl
import requests

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
ENTITY_TYPE_ID = 1080
STAGE_ARCHIVE = "DT1080_50:SUCCESS"

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent
SRC_FILE = BASE_DIR / "Реестр_платежей_2024_к_разбору_2026_09_15_V2.xlsx"

FLAG_TEXT = "? Прочее — проверить вручную"

with open(SCRIPT_DIR / ".code_to_element_id.json", encoding="utf-8") as f:
    CODE_TO_ELEMENT_ID = json.load(f)


def call(method, params):
    r = requests.post(f"{PROXY}/{method}", headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                       data=json.dumps(params), timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"{method} -> {d}")
    return d["result"]


def ru_date_to_iso(s):
    d, m, y = str(s).split(".")
    return f"{y}-{m}-{d}"


def load_rows():
    wb = openpyxl.load_workbook(SRC_FILE, data_only=True)
    ws = wb["К разбору"]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        date = r[0]
        if date is None:
            continue
        corrected, docnum, contragent, inn, purpose, amount, code_h, category, source, flag = (
            r[2], r[1], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10])
        no_code = bool(flag == FLAG_TEXT and not corrected)
        if no_code:
            final_code = None
        elif corrected:
            final_code = str(corrected).strip()
        else:
            final_code = str(code_h).strip() if code_h else None
        rows.append({
            "date": date, "docnum": docnum, "contragent": contragent, "inn": inn,
            "purpose": purpose, "amount": amount, "final_code": final_code, "no_code": no_code,
        })
    return rows


def title_of(row):
    return f"{row['contragent']} — {(row['purpose'] or '')[:80]}".strip()[:250]


def build_existing_signatures():
    items, start = [], 0
    while True:
        resp = call("crm.item.list", {
            "entityTypeId": ENTITY_TYPE_ID, "select": ["id", "title", "begindate", "opportunity"], "start": start,
        })
        batch = resp["items"]
        items.extend(batch)
        if len(batch) < 50:
            break
        start += 50
    sigs = set()
    for it in items:
        bd = (it.get("begindate") or "")[:10]
        amt = round(float(it.get("opportunity") or 0))
        title_prefix = (it.get("title") or "")[:60]
        sigs.add((bd, amt, title_prefix))
    print(f"Снапшот живых записей 1080: {len(items)} шт.")
    return sigs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--pilot", action="store_true", help="только первые 10 новых строк, требует --execute")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--skip", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=300)
    args = ap.parse_args()

    rows = load_rows()
    print(f"Прочитано строк из «К разбору»: {len(rows)}")

    existing_sigs = build_existing_signatures()
    new_rows, skipped_dupes = [], []
    for row in rows:
        iso_date = ru_date_to_iso(row["date"])
        title = title_of(row)
        sig = (iso_date, round(row["amount"]), title[:60])
        if sig in existing_sigs:
            skipped_dupes.append(row)
        else:
            new_rows.append(row)
    print(f"Уже есть в CRM (пропускаются): {len(skipped_dupes)}")
    for r in skipped_dupes:
        print(f"  ПРОПУСК: {r['date']} | {r['amount']:>10,.0f} | {r['contragent']} | {(r['purpose'] or '')[:60]}")
    print(f"К записи (новые): {len(new_rows)}")

    cnt = Counter(r["final_code"] or "БЕЗ КОДА" for r in new_rows)
    print("\n=== Распределение по кодам (среди новых к записи) ===")
    for code, n in sorted(cnt.items(), key=lambda x: -x[1]):
        print(f"  {code:10} — {n:4} шт.")
    no_code_n = sum(1 for r in new_rows if r["no_code"])
    no_code_sum = sum(r["amount"] for r in new_rows if r["no_code"])
    total_sum = sum(r["amount"] for r in new_rows)
    print(f"\nБез кода (требует дальнейшего разбора): {no_code_n} шт., {no_code_sum:,.2f} ₽")
    print(f"Итого к записи: {len(new_rows)} шт., {total_sum:,.2f} ₽")

    if not args.execute:
        print("\n--dry-run (--execute не передан) — в Б24 ничего не писал.")
        return

    rows_to_go = new_rows[args.skip:]
    if args.pilot:
        rows_to_go = rows_to_go[:10]
        print(f"\n=== PILOT — пишу только первые {len(rows_to_go)} строк ===")

    print(f"\n=== EXECUTE — пишу {len(rows_to_go)} строк батчами по {args.batch_size} "
          f"(пропущено первых {args.skip}) ===", flush=True)
    ok = err = 0
    for i, row in enumerate(rows_to_go, 1):
        iso_date = ru_date_to_iso(row["date"])
        title = title_of(row)
        description = (f"Импортировано из банковской выписки 2024 года (17.09.2026). "
                        f"ИНН контрагента: {row['inn'] or '—'}. № документа: {row['docnum'] or '—'}.")
        if row["no_code"]:
            description += (" ⚠️ Код не определён — исполнитель не смог классифицировать "
                             "(правка от 17.09.2026), требует ручного разбора. НЕ ставить 13.8 "
                             "автоматически.")
        fields = {
            "title": title,
            "opportunity": row["amount"],
            "begindate": iso_date,
            "closedate": iso_date,
            "stageId": STAGE_ARCHIVE,
            "ufCrm32_1784807840388": row["purpose"] or "",
            "ufCrm32_1784807906954": description,
        }
        if row["final_code"]:
            if row["final_code"] not in CODE_TO_ELEMENT_ID:
                err += 1
                print(f"  [{i}] ОШИБКА: неизвестный код '{row['final_code']}' у {row['contragent']}")
                continue
            fields["ufCrm32Code"] = int(CODE_TO_ELEMENT_ID[row["final_code"]])
        try:
            call("crm.item.add", {"entityTypeId": ENTITY_TYPE_ID, "fields": fields})
            ok += 1
        except Exception as e:
            err += 1
            print(f"  [{i}] ОШИБКА: {row['date']} {row['contragent']} — {e}", flush=True)
        if i % 10 == 0:
            print(f"  ...{i}/{len(rows_to_go)} (ok={ok}, err={err})", flush=True)
        if i % args.batch_size == 0:
            print(f"  === чекпоинт: {i} строк обработано, для резюме используй --skip {args.skip + i} ===", flush=True)
    print(f"\nГотово: {ok} создано, {err} ошибок.", flush=True)


if __name__ == "__main__":
    main()
