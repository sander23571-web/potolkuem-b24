#!/usr/bin/env python3
"""
Наведение порядка в коде "13.8 Прочее" СП «Реестр платежей» (CRM_32, entityTypeId=1080).

Источники правок:
1. scripts/reestr-platezhey-overrides.json — 149 исправлений из офлайн-аудита 06.09.2026
   (уже проверены владельцем тогда, просто не были записаны в CRM).
2. Ручные правки от 09.09.2026 — 7 записей маркетинга, обнаруженных сканированием кода 13.8
   по ключевым словам рекламы/PR (см. analytics/marketing-dashboard-svjazka-reestr-2026-09.md,
   раздел 5, п.2). Не было даже в overrides.json — понадобился отдельный список.

НЕ входит в этот скрипт (сознательно, отдельные вопросы):
- payroll-исключения (exclude-ids.json, 3 записи + ~86 по regex) — решение о выводе payroll
  из реестра расходов в отдельный контур уже принято 06.09, но это отдельное действие
  (удаление/перенос записей), не смена кода. Не трогаем здесь.
- 2 записи "ООО ЯНДЕКС МАРКЕТ" (id 1858, 2328) — неоднозначно (реклама vs комиссия канала
  продаж), ждут отдельного решения владельца. Не трогаем.

Режимы:
  --dry-run   (по умолчанию) — только показать, что будет изменено, ничего не пишет в Б24
  --pilot     — применить только первые 8 правок (пилотная партия), для проверки вручную
  --apply     — применить все правки
"""
import json
import sys
import time
import urllib.request

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
ENTITY_TYPE_ID = 1080

# code "N.M" -> IBLOCK_ELEMENT id (Справочник кодов расходов, IBLOCK_ID=32)
CODE_TO_ID = {
    "1.1":162,"1.2":164,"1.3":166,"1.4":168,"1.5":170,"1.6":172,"1.7":174,"1.8":176,
    "1.9":178,"1.10":180,"1.11":182,"1.12":184,
    "2.1":186,"2.2":188,"2.3":190,"3.1":192,"4.1":194,"5.1":196,"6.1":198,"6.2":200,
    "6.3":202,"7.1":204,"7.2":206,"8.1":208,"9.1":210,"10.1":212,"10.2":214,
    "11.1":216,"11.2":218,"11.3":220,"11.4":222,"11.5":224,"11.6":226,
    "12.1":228,"12.2":230,"12.3":232,"12.4":234,"12.5":236,
    "13.1":238,"13.2":240,"13.3":242,"13.4":244,"13.5":246,"13.6":248,"13.7":250,"13.8":252,
    "11.7":254,"12.6":256,
}

# Ручные правки 09.09.2026 — найдены сканированием 13.8 по ключевым словам рекламы/PR
MANUAL_FIXES_09_09 = {
    "5480": "12.3",  # ИП Мишкин — размещение в печатном рекламном издании «Клуб Подарков»
    "2532": "11.6",  # ИП Пешкова — размещение рекламных материалов
    "4652": "11.6",  # Мишанкова — услуги СММ (Телеграм/Ютуб/Дзен)
    "3622": "11.6",  # ООО Комитет — подписка vc.ru Pro Max
    "3866": "11.6",  # ООО Комитет — подписка vc.ru Pro Max (второй период)
    "4904": "11.6",  # Ладышева — аудит маркетинга
    "2990": "11.6",  # ООО Инфлю — размещение рекламы в сетях
}


def b24(method, params):
    req = urllib.request.Request(
        f"{PROXY}/{method}",
        data=json.dumps(params).encode(),
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main():
    mode = "dry-run"
    if "--pilot" in sys.argv:
        mode = "pilot"
    elif "--apply" in sys.argv:
        mode = "apply"

    overrides = json.load(open("scripts/reestr-platezhey-overrides.json"))
    all_fixes = dict(overrides)
    all_fixes.update(MANUAL_FIXES_09_09)  # ручные правки имеют приоритет при пересечении id

    plan = []
    for id_str, code in all_fixes.items():
        elem_id = CODE_TO_ID.get(code)
        if elem_id is None:
            print(f"  ПРОПУСК id={id_str}: неизвестный код '{code}'")
            continue
        plan.append((int(id_str), code, elem_id))

    plan.sort()
    print(f"Всего правок в плане: {len(plan)} (из них ручных 09.09: {len(MANUAL_FIXES_09_09)})")
    print(f"Режим: {mode}")
    print()

    if mode == "dry-run":
        for iid, code, elem_id in plan[:20]:
            print(f"  id={iid:<6} -> код {code} (iblock element {elem_id})")
        print(f"  ... и ещё {max(0, len(plan)-20)} записей")
        print()
        print("Это dry-run. Ничего не записано. Запусти с --pilot (первые 8) или --apply (все).")
        return

    batch = plan[:8] if mode == "pilot" else plan
    print(f"Применяю {len(batch)} правок...")
    ok, fail = 0, 0
    results = []
    for iid, code, elem_id in batch:
        res = b24("crm.item.update", {
            "entityTypeId": ENTITY_TYPE_ID,
            "id": iid,
            "fields": {"ufCrm32Code": elem_id},
        })
        if res.get("result"):
            ok += 1
            results.append((iid, code, "OK"))
        else:
            fail += 1
            results.append((iid, code, f"ERROR: {res}"))
            print(f"  ОШИБКА id={iid}: {res}")
        time.sleep(0.15)  # не долбить прокси слишком часто

    print()
    print(f"Готово: {ok} успешно, {fail} ошибок")
    with open("scripts/.fix-13-8-results.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
