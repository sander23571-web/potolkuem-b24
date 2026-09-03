#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Импорт в СП «Реестр платежей» (entityTypeId=1080), 29.08.2026:
1. Наполняет Универсальный список «Справочник кодов расходов» (IBLOCK_ID=32) 46 кодами
   из «Кодировка расходов.xlsx».
2. Классифицирует 766 транзакций из банковской выписки 2_5427334044905939425.xlsx
   и создаёт по ним записи в СП 1080 (задним числом, дата = дата платежа).
3. Классифицирует и обновляет 16 уже существующих записей СП 1080.
4. Добавляет UF-поле «Код» (iblock_element → IBLOCK_ID=32) в СП 1080.

Запуск: python3 scripts/import-reestr-platezhey-2026-08-29.py --dry-run   (сначала!)
        python3 scripts/import-reestr-platezhey-2026-08-29.py --execute
"""
import sys, json, re, argparse
import openpyxl
import requests

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
IBLOCK_ID = 32
ENTITY_TYPE_ID = 1080

def call(method, params):
    r = requests.post(f"{PROXY}/{method}", headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                       data=json.dumps(params), timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"{method} -> {d}")
    return d["result"]

# ── 1. Извлечь каталог кодов из xlsx ────────────────────────────────────────
def load_codes():
    wb = openpyxl.load_workbook("Кодировка расходов.xlsx", data_only=True)
    ws = wb["Январь"]
    codes = []
    cur_cat_code = cur_cat_name = None
    for r in range(4, 88):
        b = ws.cell(row=r, column=2).value
        c = ws.cell(row=r, column=3).value
        d = ws.cell(row=r, column=4).value
        if isinstance(b, int) and isinstance(c, str) and d is None:
            cur_cat_code, cur_cat_name = b, c.strip()
        elif isinstance(c, str) and "." in c and d:
            name = d.strip().replace("\n", " ") if isinstance(d, str) else d
            codes.append({"code": c, "name": name, "cat_code": cur_cat_code,
                           "cat_name": cur_cat_name.strip() if cur_cat_name else None})
    return codes

# ── 2. Ключевые слова для классификации ─────────────────────────────────────
# Порядок важен — первое совпадение побеждает. Проверено на реальных строках выписки.
CONTRAGENT_RULES = [
    # (regex по контрагенту, код) — проверяется ПЕРВЫМ, приоритетнее текста назначения
    (r"альфа.?банк", "7.1"),
    (r"казначейств.{0,10}росс|фнс росс", "2.1"),
    (r"\bуфк\b", "2.2"),
    (r"технопарк.{0,5}элма", "1.1"),  # уточняется ниже по тексту назначения (счётчики/аренда)
    (r"долфинс.{0,5}айти", "10.2"),   # заказная разработка ПО — ближайший код
    (r"мельников дмитрий", "11.4"),   # маркетинговое агентство (см. b24-api-patterns.md)
    (r"разумкова полина", "13.3"),    # дизайнер (см. штатная структура 29.08)
    (r"комус\b", "1.9"),
    (r"смб.?сервис", "11.1"),
    (r"экспо.?парк", "12.1"),
    (r"телекот", "11.3"),
    (r"^ооо \"вк\"$|^ооо \"вк\"", "11.2"),
    (r"headhunter", "6.3"),
    (r"жуков александр", "10.2"),     # ИП Жуков (БюроОБП) — консалтинг/Битрикс24
    (r"ситилинк", "1.5"),
    (r"яндекс 360", "1.8"),
    (r"радио.?люб", "12.5"),
]

RULES = [
    (r"ком[а-я\-]{0,4}\s*за\s|комисси[яи].{0,20}(банк|перевод|обслуж|валютн|счет)", "7.1"),
    (r"возврат займа", "7.2"),
    (r"\bенп\b|единый налоговый платеж", "2.1"),
    (r"взносы на обязательное страхован", "2.2"),
    (r"заработн|зарплат|аванс.*сотрудник|расчёт с персоналом", "2.3"),
    (r"командировк|перелет|авиабилет|гостиниц|отел[ья]|suite|hotel|hostel|voyage", "3.1"),
    (r"патент|юрист|юридич|адвокат", "4.1"),
    (r"склад(?!\s*офис)", "5.1"),
    (r"1с[\s\-]|битрикс24|касса|онлайн.?касс", "6.1"),
    (r"контур", "6.2"),
    (r"headhunter|hh\.ru", "6.3"),
    (r"аренд.{0,15}офис|офисн.{0,10}аренд", "1.1"),
    (r"счетчик|электроэнерг|электричеств|водоснабж|\bвода\b|коммунальн", "1.2"),
    (r"уборк|клининг", "1.3"),
    (r"автостоянк|парковк", "1.4"),
    (r"оснащени.{0,10}офис|мебель.{0,10}офис", "1.5"),
    (r"интернет(?!-журнал)|провайдер", "1.6"),
    (r"сервисное обслуживани.{0,15}техник", "1.7"),
    (r"yandex.{0,10}почт|почт.{0,10}yandex", "1.8"),
    (r"канцеляр", "1.9"),
    (r"визитк", "1.10"),
    (r"кофе\b", "1.12"),
    (r"еда|обед|питани|кейтеринг|ресторан|банкет", "1.11"),
    (r"звенигород", "9.1"),
    (r"куб\b|club\.kub|системакуб", "10.1"),
    (r"смб\s*сервис", "11.1"),
    (r"\bвк\b|vkontakte|vk реклам", "11.2"),
    (r"телекот|telega\.in", "11.3"),
    (r"освоени.{0,15}бюджет|агент(ств|у).{0,20}маркетинг", "11.4"),
    (r"разработ.{0,15}сайт", "11.5"),
    (r"выставк", "12.1"),
    (r"блогер", "12.2"),
    (r"журнал.{0,15}публикаци|публикаци.{0,15}журнал", "12.3"),
    (r"фото.{0,10}видео|съёмк|съемк|видеопродакш", "12.4"),
    (r"preroll|pre-roll|ролик", "13.1"),
    (r"копирайт", "13.2"),
    (r"дизайн|иллюстратор|художник|отрисовк|верстк|карточ.{0,10}(игр|персонаж)", "13.3"),
    (r"типограф.{0,15}тираж|тираж.{0,15}типограф|печать тираж", "13.4"),
    (r"мерч|брендированн.{0,15}продукц", "13.5"),
    (r"лифлет|листовк", "13.6"),
    (r"сигнальн.{0,10}образц", "13.7"),
    (r"договор.{0,10}аренды(?!.{0,10}офис)", "8.1"),
    (r"монтаж.{0,60}мебел|мебел.{0,20}офис|офисной мебели|лестниц.{0,10}этажерк|планкен|"
     r"светодиодн.{0,10}лент|постирочн",
     "1.5"),
    (r"разработка игры|автор.{0,10}заказ|прототип.{0,20}игр", "13.3"),
    (r"пре.?ролл", "13.1"),
    (r"держатель карточки|песочны.{0,5}час|кубик.{0,5}зарик", "13.4"),
    (r"радио.{0,10}(канал|эфир|реклам)", "12.5"),
    (r"технопарк.{0,3}центр|климат контроль|двери.{0,5}точка|емкост.{0,10}столов|телевизор|кофемашин|"
     r"рулонн.{0,5}газон|двери, доставка", "1.5"),
    (r"реклам\w*\s+услуг", "11.6"),
    (r"кинематограф", "13.3"),
    (r"графическ.{0,10}оформлени.{0,15}сайт|оформлени.{0,10}веб.?сайт", "11.5"),
    (r"полиграфическ|наклейк", "13.6"),
    (r"изготовлени.{0,10}образц", "13.7"),
    (r"корректор|редактур", "13.2"),
    (r"создани.{0,10}прототип.{0,10}игр", "13.3"),
    (r"перформия|лицензионн.{0,10}доступ.{0,10}программ", "6.1"),
    (r"сеотулс|алгоритмы продвижения", "11.6"),
    (r"агентское вознаграждени.{0,15}тур|тур.{0,5}групп", "3.1"),
    (r"хранени.{0,10}содержани", "5.1"),
    (r"тестовый образец", "13.7"),
    (r"тираж\s*\d+\s*экз|\d+\s*экз\b", "13.4"),
    (r"туристическ", "3.1"),
    (r"матрас", "1.5"),
    (r"выставочн", "12.1"),
    (r"мыш.{0,5}(без|бес)провод|ноутбук", "1.5"),
    (r"оборудовани.{0,15}печатн.{0,10}техник", "1.7"),
]
FALLBACK_CODE = "13.8"  # Прочее (Пр-во продукта) — общий отстойник для неопознанного

def classify(purpose, contragent=""):
    combined = f"{contragent or ''} {purpose or ''}".lower()
    purpose_l = (purpose or "").lower()
    for pattern, code in CONTRAGENT_RULES:
        if re.search(pattern, (contragent or "").lower(), re.IGNORECASE):
            # спец-случай Технопарк Элма: аренда vs счётчики/возмещение по тексту назначения
            if pattern.startswith(r"технопарк"):
                if re.search(r"уборк|клининг", purpose_l):
                    return "1.3"
                if re.search(r"автостоянк|въезд.{0,15}автотранспорт|парковк", purpose_l):
                    return "1.4"
                if re.search(r"счетчик|электроэнерг|водоснабж|возмещени", purpose_l):
                    return "1.2"
                return "1.1"
            return code
    for pattern, code in RULES:
        if re.search(pattern, combined, re.IGNORECASE):
            return code
    return FALLBACK_CODE

# ── 3. Загрузка выписки ─────────────────────────────────────────────────────
def load_statement():
    wb = openpyxl.load_workbook("2_5427334044905939425.xlsx", data_only=True)
    ws = wb.worksheets[0]
    rows = []
    for r in range(13, ws.max_row + 1):
        dt = ws.cell(row=r, column=1).value
        deb = ws.cell(row=r, column=2).value
        contragent = ws.cell(row=r, column=4).value
        inn = ws.cell(row=r, column=5).value
        purpose = ws.cell(row=r, column=6).value
        if dt is None and deb is None:
            continue
        rows.append({"date": dt, "amount": deb, "contragent": contragent, "inn": inn, "purpose": purpose})
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--stage", choices=["codes", "field", "statement", "existing", "all"], default="all")
    ap.add_argument("--skip", type=int, default=0, help="пропустить первые N строк выписки (резюме после обрыва)")
    args = ap.parse_args()

    codes = load_codes()
    print(f"Загружено кодов из xlsx: {len(codes)}")

    stmt = load_statement()
    print(f"Загружено строк выписки: {len(stmt)}")

    # классификация — отчёт по покрытию
    from collections import Counter
    cnt = Counter()
    for row in stmt:
        code = classify(row["purpose"], row["contragent"])
        cnt[code] += 1
    print("\n=== Распределение по кодам (dry-run отчёт) ===")
    code_map = {c["code"]: c["name"] for c in codes}
    for code, n in sorted(cnt.items(), key=lambda x: -x[1]):
        print(f"  {code:6} {code_map.get(code,'???'):40} — {n:4} шт.")
    fallback_n = cnt.get(FALLBACK_CODE, 0)
    print(f"\nВ 'Прочее/13.8' (неопознанные) попало: {fallback_n} из {len(stmt)} ({fallback_n/len(stmt)*100:.1f}%)")

    if args.dry_run or not args.execute:
        print("\n--dry-run (или флаг не передан) — в Б24 ничего не писал.")
        fb = [r for r in stmt if classify(r["purpose"], r["contragent"]) == FALLBACK_CODE]
        fb_sum = sum(r["amount"] or 0 for r in fb)
        print(f"\nСумма всех строк в 'Прочее': {fb_sum:,.0f} ₽ ({len(fb)} шт.)")
        print("\n=== Топ-20 по сумме среди неопознанных (13.8) ===")
        for row in sorted(fb, key=lambda r: -(r["amount"] or 0))[:20]:
            print(f"  {row['date']} | {row['amount']:>10,.0f} | {row['contragent']} | {(row['purpose'] or '')[:80]}")
        return

    print("\n=== EXECUTE — пишу в Б24 ===")

    if args.stage in ("codes", "all"):
        print("Создаю элементы справочника кодов...")
        code_to_element_id = {}
        for c in codes:
            name = f"{c['code']} — {c['name']}"
            res = call("lists.element.add", {
                "IBLOCK_TYPE_ID": "lists", "IBLOCK_ID": IBLOCK_ID,
                "ELEMENT_CODE": c["code"].replace(".", "_"),
                "FIELDS": {"NAME": name, "PROPERTY_182": c["code"],
                            "PROPERTY_184": f"{c['cat_code']} {c['cat_name']}"}
            })
            code_to_element_id[c["code"]] = res
            print(f"  {c['code']:6} -> element id {res}")
        with open("scripts/.code_to_element_id.json", "w", encoding="utf-8") as f:
            json.dump(code_to_element_id, f, ensure_ascii=False, indent=2)
        print("Сохранено в scripts/.code_to_element_id.json")

    with open("scripts/.code_to_element_id.json", encoding="utf-8") as f:
        code_to_element_id = json.load(f)

    def ru_date_to_iso(s):
        # '21.07.2026' -> '2026-07-21'
        d, m, y = s.split(".")
        return f"{y}-{m}-{d}"

    if args.stage in ("statement", "all"):
        rows_to_go = stmt[args.skip:]
        print(f"\nИмпортирую {len(rows_to_go)} строк выписки в СП 1080 (пропущено первых {args.skip})...", flush=True)
        ok = err = 0
        for i, row in enumerate(rows_to_go, 1):
            code = classify(row["purpose"], row["contragent"])
            iso_date = ru_date_to_iso(row["date"])
            title = f"{row['contragent']} — {(row['purpose'] or '')[:80]}".strip()
            try:
                call("crm.item.add", {
                    "entityTypeId": ENTITY_TYPE_ID,
                    "fields": {
                        "title": title[:250],
                        "opportunity": row["amount"],
                        "begindate": iso_date,
                        "closedate": iso_date,
                        "stageId": "DT1080_50:SUCCESS",
                        "ufCrm32_1784807840388": row["purpose"] or "",
                        "ufCrm32_1784807906954": f"Импортировано из банковской выписки 29.08.2026. "
                                                  f"ИНН контрагента: {row['inn'] or '—'}",
                        "ufCrm32Code": int(code_to_element_id[code]),
                    }
                })
                ok += 1
            except Exception as e:
                err += 1
                print(f"  [{i}] ОШИБКА: {row['date']} {row['contragent']} — {e}", flush=True)
            if i % 10 == 0:
                print(f"  ...{i}/{len(rows_to_go)} (ok={ok}, err={err})", flush=True)
        print(f"Готово: {ok} создано, {err} ошибок.", flush=True)

    if args.stage in ("existing", "all"):
        print("\nПроставляю коды 16 уже существующим записям...")
        existing = call("crm.item.list", {
            "entityTypeId": ENTITY_TYPE_ID,
            "select": ["id", "title", "ufCrm32_1784807840388", "ufCrm32_1784807906954"]
        })["items"]
        ok = err = 0
        for it in existing:
            text = f"{it.get('title','')} {it.get('ufCrm32_1784807840388','')} {it.get('ufCrm32_1784807906954','')}"
            code = classify(text, "")
            try:
                call("crm.item.update", {
                    "entityTypeId": ENTITY_TYPE_ID,
                    "id": it["id"],
                    "fields": {"ufCrm32Code": int(code_to_element_id[code])}
                })
                print(f"  id={it['id']:>4} код={code:6} — {it.get('title','')[:60]}")
                ok += 1
            except Exception as e:
                err += 1
                print(f"  id={it['id']} ОШИБКА: {e}")
        print(f"Готово: {ok} обновлено, {err} ошибок.")

if __name__ == "__main__":
    main()
