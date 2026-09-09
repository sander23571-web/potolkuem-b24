#!/usr/bin/env python3
"""
Исключение payroll-записей (ЗП/премии/отпускные/больничные) из СП «Реестр платежей» (1080) —
удаление 89 записей, перечисленных в листе "Исключено (ЗП)" файла
"Реестр-платежей-аудит-2026-09-05 v4.xlsx". Решение руководства: payroll выводится из реестра
расходов в отдельный контур, подтверждено 06.09 и 09.09.2026.

Полный дамп 1080 сохранён до удаления (backups/1080_reestr_platezhey_*.json.gz).

Режимы: --dry-run (по умолчанию), --pilot (первые 5), --apply (все 89).
"""
import json
import sys
import time
import urllib.request

import openpyxl

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
ENTITY_TYPE_ID = 1080
XLSX_PATH = "/root/projects/talk/Реестр-платежей-аудит-2026-09-05 v4.xlsx"


def b24(method, params):
    req = urllib.request.Request(
        f"{PROXY}/{method}",
        data=json.dumps(params).encode(),
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def load_ids():
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["Исключено (ЗП)"]
    ids = []
    for r in range(2, ws.max_row + 1):
        v = ws.cell(r, 1).value
        if v:
            ids.append(int(v))
    return ids


def main():
    mode = "dry-run"
    if "--pilot" in sys.argv:
        mode = "pilot"
    elif "--apply" in sys.argv:
        mode = "apply"

    ids = sorted(load_ids())
    print(f"Всего ID к удалению: {len(ids)}")
    print(f"Режим: {mode}")

    if mode == "dry-run":
        for i in ids[:15]:
            print(f"  id={i}")
        print(f"  ... и ещё {max(0, len(ids)-15)}")
        return

    # crm.item.delete у этой сущности возвращает {"result": []} при УСПЕХЕ (не truthy!) —
    # проверять по отсутствию ключа "error", не по result. Подтверждено вручную 09.09.2026:
    # id=5052 после такого ответа реально пропал (crm.item.get -> NOT_FOUND).
    already_gone = ids[:5] if mode == "apply" else []  # пилот уже удалил первые 5

    batch = ids[:5] if mode == "pilot" else [i for i in ids if i not in already_gone]
    print(f"Удаляю {len(batch)} записей...")
    ok, fail = 0, 0
    results = []
    for iid in batch:
        res = b24("crm.item.delete", {"entityTypeId": ENTITY_TYPE_ID, "id": iid})
        if "error" not in res:
            ok += 1
            results.append((iid, "OK"))
        else:
            fail += 1
            results.append((iid, f"ERROR: {res}"))
            print(f"  ОШИБКА id={iid}: {res}")
        time.sleep(0.2)

    print(f"\nГотово: {ok} успешно, {fail} ошибок")
    with open("scripts/.exclude-payroll-results.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
