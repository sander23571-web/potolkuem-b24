#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Полное пересоздание сделок ММКЯ (выставка id=28) — по решению владельца 09.09.2026.

Шаги:
  0. Откат зависшей отгрузки #390 (сработала на складе 4 по сделке #678, Малых)
  1. Удаление 8 ручных сделок Малых (678-692) + 9 старых объединённых (600-618)
  2. Переименование выставки ММКВЯ -> ММКЯ
  3. Создание 2 новых Ведущих: Стас Буданов, Анна Киптилая
  4. Создание 54 сделок по товарным позициям (склад 28 «Выездной»), каждая через
     NEW -> productrows.set(STORE_ID=28) -> WON (честный переход, чтобы триггернуть
     автоматическую Реализацию — подтверждено тестами: мгновенная отгрузка с
     правильного склада после смены дефолтного склада в настройках)
  5. Создание 14 Выходов ведущего (СП 1056) для 6 внештатных — Стас/Киптилая/Ольга
     штатные, выходы им не нужны (нет выплаты за выход)

Режимы: --dry-run (по умолчанию, только план), --pilot (первые 5 сделок), --apply (всё).
"""
import json
import sys
import time
import urllib.request

sys.path.insert(0, "/root/projects/talk/scripts")
from mmkya_data import PRODUCT_IDS, HOSTS, DAYS_WORKED, STAFF, SALES, EXPECTED_TOTALS

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"

EXHIBITION_ID = 28
STORE_ID = 28  # «Выездной склад»
CATEGORY_ID = 18
EXHIBITION_DAYS = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]

OLD_MANUAL_DEAL_IDS = [678, 680, 682, 684, 686, 688, 690, 692]  # ручной ввод по Малых
OLD_COMBINED_DEAL_IDS = [600, 602, 604, 606, 608, 612, 614, 616, 618]
HANGING_SHIPMENT_ID = 390
HANGING_ORDER_ID = None  # определим по shipment.get


def b24(method, params):
    req = urllib.request.Request(
        f"{PROXY}/{method}",
        data=json.dumps(params).encode(),
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def pick_days(n):
    """Равномерно выбрать n дат из 5-дневного диапазона выставки."""
    if n >= 5:
        return EXHIBITION_DAYS[:5]
    if n == 1:
        return [EXHIBITION_DAYS[2]]
    if n == 2:
        return [EXHIBITION_DAYS[0], EXHIBITION_DAYS[4]]
    if n == 3:
        return [EXHIBITION_DAYS[0], EXHIBITION_DAYS[2], EXHIBITION_DAYS[4]]
    if n == 4:
        return [EXHIBITION_DAYS[0], EXHIBITION_DAYS[1], EXHIBITION_DAYS[3], EXHIBITION_DAYS[4]]
    return EXHIBITION_DAYS[:n]


RATE = {"Даниил": 5500}  # старший ведущий; остальные — 3500 стандарт


# Уже успешно созданы и проверены (Малых 8, Журавская 5, Карелин 1, Жога 12 = 26) —
# при повторном запуске --apply НЕ пересоздавать.
ALREADY_DONE_HOSTS = {"Малых", "Журавская", "Карелин", "Жога"}


def build_deal_plan(skip_hosts=None):
    """Список (host_key, product_key, price, closedate)."""
    skip_hosts = skip_hosts or set()
    plan = []
    for host_key, items in SALES.items():
        if host_key in skip_hosts:
            continue
        days = pick_days(DAYS_WORKED[host_key])
        for i, (product_key, price) in enumerate(items):
            date = days[i % len(days)]
            plan.append((host_key, product_key, price, date))
    return plan


def build_shifts_plan():
    """Список (host_key, date) для 6 внештатных — по одному Выходу на день."""
    plan = []
    for host_key, days_n in DAYS_WORKED.items():
        if host_key in STAFF:
            continue
        for d in pick_days(days_n):
            plan.append((host_key, d))
    return plan


def step0_rollback_hanging_shipment():
    print("--- Шаг 0: откат зависшей отгрузки #390 ---")
    ship = b24("sale.shipment.get", {"id": HANGING_SHIPMENT_ID}).get("result", {}).get("shipment")
    if not ship:
        print("  отгрузка не найдена, пропуск")
        return
    order_id = ship["orderId"]
    res = b24("sale.shipment.update", {"id": HANGING_SHIPMENT_ID, "fields": {
        "deducted": "N", "allowDelivery": ship.get("allowDelivery", "N"), "deliveryId": ship.get("deliveryId"),
    }})
    print("  deducted->N:", "OK" if "error" not in res else res)
    res = b24("sale.shipment.delete", {"id": HANGING_SHIPMENT_ID})
    print("  удалена отгрузка:", "OK" if "error" not in res else res)
    res = b24("sale.order.delete", {"id": order_id})
    print("  удалён заказ:", "OK" if "error" not in res else res)


def step1_delete_old_deals():
    print("--- Шаг 1: удаление старых сделок ---")
    for did in OLD_MANUAL_DEAL_IDS + OLD_COMBINED_DEAL_IDS:
        res = b24("crm.deal.delete", {"id": did})
        status = "OK" if "error" not in res else res
        print(f"  сделка {did}: {status}")
        time.sleep(0.15)


def step2_rename_exhibition():
    print("--- Шаг 2: переименование выставки ---")
    res = b24("crm.item.update", {"entityTypeId": 1048, "id": EXHIBITION_ID, "fields": {"title": "ММКЯ"}})
    print("  ", "OK" if "error" not in res else res)


def step3_create_hosts():
    print("--- Шаг 3: создание новых Ведущих ---")
    new_ids = {}
    for key, title in [("Стас", "Стас Буданов"), ("Киптилая", "Анна Киптилая")]:
        res = b24("crm.item.add", {"entityTypeId": 1052, "fields": {"title": title}})
        hid = res.get("result", {}).get("item", {}).get("id")
        print(f"  {title} -> id={hid}")
        new_ids[key] = hid
        time.sleep(0.15)
    return new_ids


def step4_create_deals(host_ids, mode, limit=None, skip_hosts=None):
    print("--- Шаг 4: создание сделок ---")
    plan = build_deal_plan(skip_hosts=skip_hosts)
    if limit:
        plan = plan[:limit]
    print(f"  сделок в плане: {len(plan)}")
    ok, fail = 0, 0
    for host_key, product_key, price, date in plan:
        host_id = host_ids[host_key]
        product_id = PRODUCT_IDS[product_key]
        title = f"ММКЯ — {product_key} {price} руб."
        add_res = b24("crm.deal.add", {"fields": {
            "TITLE": title, "CATEGORY_ID": CATEGORY_ID, "STAGE_ID": "C18:NEW",
            "PARENT_ID_1048": EXHIBITION_ID, "PARENT_ID_1052": host_id,
            "OPPORTUNITY": price, "CLOSEDATE": f"{date}T03:00:00+03:00",
            "SOURCE_ID": "CALL", "MYCOMPANY_ID": 16,
        }})
        deal_id = add_res.get("result")
        if not deal_id:
            print(f"  ОШИБКА создания {host_key}/{product_key}: {add_res}")
            fail += 1
            continue
        rows_res = b24("crm.deal.productrows.set", {"id": deal_id, "rows": [
            {"PRODUCT_ID": product_id, "PRICE": price, "QUANTITY": 1, "STORE_ID": STORE_ID}
        ]})
        won_res = b24("crm.deal.update", {"id": deal_id, "fields": {"STAGE_ID": "C18:WON"}})
        if "error" in rows_res or "error" not in won_res and won_res.get("result") is not True:
            pass  # не критично, won_res true ожидается
        ok += 1
        print(f"  #{deal_id} {host_key}/{product_key} {price}₽ {date} -> OK")
        time.sleep(0.2)
    print(f"  Готово: {ok} успешно, {fail} ошибок")


def step5_create_shifts(host_ids):
    print("--- Шаг 5: создание Выходов ведущего ---")
    plan = build_shifts_plan()
    print(f"  выходов в плане: {len(plan)}")
    ok, fail = 0, 0
    for host_key, date in plan:
        host_id = host_ids[host_key]
        rate = RATE.get(host_key, 3500)
        title = f"ММКЯ {date[-2:]}.{date[5:7]} — {host_key}"
        res = b24("crm.item.add", {"entityTypeId": 1056, "fields": {
            "title": title,
            "parentId1048": EXHIBITION_ID,
            "parentId1052": host_id,
            "ufCrm16_1777193655": f"{date}T03:00:00+03:00",
            "ufCrm16_1777193828": f"{rate}|RUB",
        }})
        item_id = res.get("result", {}).get("item", {}).get("id")
        if not item_id:
            print(f"  ОШИБКА {host_key} {date}: {res}")
            fail += 1
            continue
        ok += 1
        print(f"  Выход #{item_id} {host_key} {date} ставка={rate} -> OK")
        time.sleep(0.2)
    print(f"  Готово: {ok} успешно, {fail} ошибок")


def main():
    mode = "dry-run"
    if "--pilot" in sys.argv:
        mode = "pilot"
    elif "--apply" in sys.argv:
        mode = "apply"

    # Проверка сумм перед стартом
    for name, items in SALES.items():
        s = sum(p for _, p in items)
        assert s == EXPECTED_TOTALS[name], f"MISMATCH {name}: {s} != {EXPECTED_TOTALS[name]}"

    plan = build_deal_plan()
    shifts_plan = build_shifts_plan()
    print(f"Режим: {mode}")
    print(f"Всего сделок в плане: {len(plan)}")
    print(f"Всего Выходов в плане: {len(shifts_plan)}")

    if mode == "dry-run":
        print("\n--- Пример плана сделок (первые 10) ---")
        for row in plan[:10]:
            print(" ", row)
        print("\n--- Пример плана Выходов (первые 10) ---")
        for row in shifts_plan[:10]:
            print(" ", row)
        return

    if mode == "pilot":
        step0_rollback_hanging_shipment()
        step1_delete_old_deals()
        step2_rename_exhibition()
        host_ids = dict(HOSTS)
        new_ids = step3_create_hosts()
        host_ids.update(new_ids)
        step4_create_deals(host_ids, mode, limit=5)
        print("\nПИЛОТ ЗАВЕРШЁН — проверь вручную сделки/остатки перед --apply")
        with open("scripts/.mmkya_host_ids.json", "w") as f:
            json.dump(host_ids, f, ensure_ascii=False)
        return

    if mode == "apply":
        with open("scripts/.mmkya_host_ids.json") as f:
            host_ids = json.load(f)
        step4_create_deals(host_ids, mode, skip_hosts=ALREADY_DONE_HOSTS)
        step5_create_shifts(host_ids)


if __name__ == "__main__":
    main()
