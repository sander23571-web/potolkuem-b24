#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Откат 9 зависших отгрузок ММКЯ на складе 6 «Основной склад Дмитрий» — 14.09.2026.

Найдено при разборе задвоения в /report/realization: сентябрьская выручка ММКЯ
(192 900 ₽ / 54 шт.) считалась ДВАЖДЫ — на складе 28 «Выездной» (новые 54 сделки
по товарным позициям, коммит 2ccc949) и на складе 6 (9 старых orders/shipments,
созданных 08.09.2026 в самом начале рабочей сессии по ММКЯ, ДО перехода на
модель "1 сделка = 1 позиция"). Коммит 2ccc949 утверждал, что старые 9 сделок
были "без Реализации" — это оказалось неверно: Реализация (sale.shipment,
deducted=Y) на них всё же сработала и осталась незамеченной при откате пилота
(откатили только 5 дублей по Малых, эти 9 — нет).

Проверено перед откатом (14.09.2026): все 9 orders/shipments не отменены
(canceled=N), суммарно 54 позиции / 192 900 ₽ — 1-в-1 совпадает с новыми 54
сделками на складе 28. Соответствующих CRM-сделок к этим order'ам уже нет
(старые 9 сделок удалены ещё в рамках коммита 2ccc949) — это чистые орфаны
в модуле Продаж, безопасные для отката тем же паттерном, что уже использован
в scripts/mmkya_rebuild_2026-09-09.py (step0_rollback_hanging_shipment):
deducted->N, затем удалить shipment, затем удалить order.

Бэкап перед запуском: backups/2026-09-14_09-26.tar.gz
"""
import json
import sys
import time
import urllib.request

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"

# (shipmentId, orderId) — из sale_document_saleorder_item (pbi.php), склад 6, сентябрь 2026
STALE = [
    (318, 226), (320, 216), (322, 218), (324, 220),
    (326, 222), (328, 224), (330, 228), (332, 230), (334, 232),
]


def b24(method, params):
    req = urllib.request.Request(
        f"{PROXY}/{method}",
        data=json.dumps(params).encode(),
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def rollback_one(shipment_id, order_id):
    ship = b24("sale.shipment.get", {"id": shipment_id}).get("result", {}).get("shipment")
    if not ship:
        print(f"  shipment {shipment_id}: не найдена, пропуск")
        return False
    if ship["deducted"] != "Y" or ship["canceled"] == "Y":
        print(f"  shipment {shipment_id}: неожиданное состояние (deducted={ship['deducted']}, canceled={ship['canceled']}), пропуск для ручной проверки")
        return False

    res = b24("sale.shipment.update", {"id": shipment_id, "fields": {
        "deducted": "N",
        "allowDelivery": ship.get("allowDelivery", "N"),
        "deliveryId": ship.get("deliveryId"),
    }})
    ok1 = "error" not in res
    print(f"  shipment {shipment_id}: deducted->N: {'OK' if ok1 else res}")
    time.sleep(0.3)

    res = b24("sale.shipment.delete", {"id": shipment_id})
    ok2 = "error" not in res
    print(f"  shipment {shipment_id}: удалена: {'OK' if ok2 else res}")
    time.sleep(0.3)

    res = b24("sale.order.delete", {"id": order_id})
    ok3 = "error" not in res
    print(f"  order {order_id}: удалён: {'OK' if ok3 else res}")
    time.sleep(0.3)

    return ok1 and ok2 and ok3


def main():
    apply_mode = "--apply" in sys.argv
    print(f"Режим: {'APPLY' if apply_mode else 'DRY-RUN (передайте --apply для реального отката)'}")
    print(f"К откату: {len(STALE)} shipment/order пар, ожидаемо 54 позиции / 192 900 ₽\n")

    if not apply_mode:
        for sid, oid in STALE:
            print(f"  [dry-run] shipment {sid} / order {oid}")
        return

    ok_count = 0
    for sid, oid in STALE:
        print(f"--- shipment {sid} / order {oid} ---")
        if rollback_one(sid, oid):
            ok_count += 1
    print(f"\nИтого успешно: {ok_count}/{len(STALE)}")


if __name__ == "__main__":
    main()
