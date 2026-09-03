#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Импорт в СП «Реестр платежей» (entityTypeId=1080), 03.09.2026:
Два новых банковских экспорта — «Выписка 2025 Александр Жуков.xlsx» (весь 2025 год,
7 колонок, как в старом импорте 29.08) и «Выписка_Александр_Жуков_с_21_июля_2026.xlsx»
(21.07–03.09.2026, 8 колонок — добавлена «Номер документа» перед «Дебет», смещает индексы).

В отличие от старого файла 2_5427334044905939425.xlsx (только Дебет-строки), оба новых файла —
ПОЛНЫЕ выписки: содержат вперемешку и расходы (Дебет), и поступления (Кредит). В «Реестр
платежей» идут ТОЛЬКО строки с Дебет — Кредит-строки (доходы) в этот СП не пишутся, выгружаются
отдельно в JSON на будущее (см. --stage income-export).

Дедуп — не по сравнению файлов, а напрямую по CRM: перед записью каждой новой строки сверяем
(дата, сумма, начало title) со ВСЕМИ уже существующими записями 1080 (снапшот
scripts/.existing-1080-2026-09-03.json, снят в начале сессии). На стыке периодов (21.07.2026)
найден 1 точный дубль — ООО «БОКСЧЕЙН ГРУПП», 6000 ₽ — уже есть в CRM, пропускается.

Батчами по 300 (--batch-size), с чекпоинтами прогресса и поддержкой возобновления (--skip).
Стадия — «Архив проведенных платежей» (DT1080_50:SUCCESS), как просил владелец.

Запуск: python3 scripts/import-reestr-platezhey-2026-09-03.py --dry-run     (сначала!)
        python3 scripts/import-reestr-platezhey-2026-09-03.py --pilot       (первые 10, --execute)
        python3 scripts/import-reestr-platezhey-2026-09-03.py --execute
"""
import sys, json, re, argparse, importlib.util
from pathlib import Path
import openpyxl
import requests

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
ENTITY_TYPE_ID = 1080
STAGE_ARCHIVE = "DT1080_50:SUCCESS"

SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent

# ── Переиспользуем classify()/правила из старого скрипта (29.08.2026) — не дублируем regex-таблицы ──
_old_spec = importlib.util.spec_from_file_location(
    "import_reestr_old", SCRIPT_DIR / "import-reestr-platezhey-2026-08-29.py")
_old = importlib.util.module_from_spec(_old_spec)
_old_spec.loader.exec_module(_old)
classify = _old.classify

with open(SCRIPT_DIR / ".code_to_element_id.json", encoding="utf-8") as f:
    CODE_TO_ELEMENT_ID = json.load(f)

# ── Дивиденды — не расход компании, не пишем в 1080 (решение владельца 03.09.2026) ──────────────
DIVIDEND_RE = re.compile(r"дивиденд", re.IGNORECASE)

# ── Тиражи "N шт" (а не "N экз") не ловились старым regex — поправлено здесь, без правки
#    исторического скрипта 29.08. Найдено на 288 строках 13.8 при разборе новых данных 03.09.2026 ──
TIRAZH_SHT_RE = re.compile(r"тираж\s*\d+\s*шт", re.IGNORECASE)

def classify2(purpose, contragent):
    code = classify(purpose, contragent)
    if code == "13.8" and TIRAZH_SHT_RE.search(purpose or ""):
        return "13.4"
    return code

def call(method, params):
    r = requests.post(f"{PROXY}/{method}", headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                       data=json.dumps(params), timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"{method} -> {d}")
    return d["result"]

def ru_date_to_iso(s):
    d, m, y = s.split(".")
    return f"{y}-{m}-{d}"

# ── Файлы: у каждого своя раскладка колонок (0-indexed) ────────────────────────────────────────
FILES = [
    {
        "path": BASE_DIR / "Выписка 2025 Александр Жуков.xlsx",
        "label": "2025",
        "col_date": 0, "col_debet": 1, "col_kredit": 2, "col_name": 3, "col_inn": 4, "col_purpose": 5,
    },
    {
        "path": BASE_DIR / "Выписка_Александр_Жуков_с_21_июля_2026.xlsx",
        "label": "с 21.07.2026",
        "col_date": 0, "col_debet": 2, "col_kredit": 3, "col_name": 4, "col_inn": 5, "col_purpose": 6,
    },
]

def load_file(cfg):
    wb = openpyxl.load_workbook(cfg["path"], data_only=True)
    ws = wb.active
    expenses, income = [], []
    for r in ws.iter_rows(min_row=13, values_only=True):
        date = r[cfg["col_date"]]
        if date is None:
            continue
        debet = r[cfg["col_debet"]]
        kredit = r[cfg["col_kredit"]]
        row = {
            "date": date, "contragent": r[cfg["col_name"]], "inn": r[cfg["col_inn"]],
            "purpose": r[cfg["col_purpose"]], "source_file": cfg["label"],
        }
        if debet is not None:
            expenses.append({**row, "amount": debet})
        elif kredit is not None:
            income.append({**row, "amount": kredit})
    return expenses, income

def title_of(row):
    return f"{row['contragent']} — {(row['purpose'] or '')[:80]}".strip()[:250]

def build_existing_signatures():
    with open(SCRIPT_DIR / ".existing-1080-2026-09-03.json", encoding="utf-8") as f:
        existing = json.load(f)
    sigs = set()
    for it in existing:
        bd = (it.get("begindate") or "")[:10]
        amt = round(float(it.get("opportunity") or 0))
        title_prefix = (it.get("title") or "")[:60]
        sigs.add((bd, amt, title_prefix))
    return sigs

def find_internal_near_dupes(expenses):
    """Пары строк с одинаковой (дата, сумма, контрагент, начало назначения) ВНУТРИ новых файлов —
    не отбрасываются автоматически, только выгружаются в отдельный файл для ручной проверки."""
    from collections import defaultdict
    groups = defaultdict(list)
    for row in expenses:
        key = (row["date"], row["amount"], row["contragent"], (row["purpose"] or "")[:60])
        groups[key].append(row)
    return {k: v for k, v in groups.items() if len(v) > 1}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--pilot", action="store_true", help="только первые 10 новых строк, требует --execute")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--skip", type=int, default=0, help="пропустить первые N строк после дедупа (резюме)")
    ap.add_argument("--batch-size", type=int, default=300)
    args = ap.parse_args()

    all_expenses, all_income = [], []
    for cfg in FILES:
        exp, inc = load_file(cfg)
        print(f"{cfg['label']}: {len(exp)} расходов (Дебет), {len(inc)} доходов (Кредит) — файл {cfg['path'].name}")
        all_expenses.extend(exp)
        all_income.extend(inc)

    print(f"\nВсего расходных строк из обоих файлов: {len(all_expenses)}")
    print(f"Всего доходных строк (НЕ импортируются в 1080): {len(all_income)}")

    # ── Выгрузка доходов в отдельный файл (на будущее — отдельная таблица/СП) ──────────────────
    income_export_path = SCRIPT_DIR / ".excluded-income-2026-09-03.json"
    with open(income_export_path, "w", encoding="utf-8") as f:
        json.dump([{**r, "date": str(r["date"])} for r in all_income], f, ensure_ascii=False, indent=2, default=str)
    print(f"Доходы выгружены в {income_export_path.relative_to(BASE_DIR)} ({len(all_income)} шт., в CRM не пишутся)")

    # ── Дивиденды — не расход компании, исключаем из потока перед дедупом/классификацией ────────
    dividends = [r for r in all_expenses if DIVIDEND_RE.search(r["purpose"] or "")]
    all_expenses = [r for r in all_expenses if not DIVIDEND_RE.search(r["purpose"] or "")]
    if dividends:
        div_path = SCRIPT_DIR / ".excluded-dividends-2026-09-03.json"
        with open(div_path, "w", encoding="utf-8") as f:
            json.dump([{**r, "date": str(r["date"])} for r in dividends], f, ensure_ascii=False, indent=2, default=str)
        div_sum = sum(r["amount"] for r in dividends)
        print(f"Дивиденды исключены: {len(dividends)} шт., {div_sum:,.0f} ₽ — выгружены в {div_path.relative_to(BASE_DIR)}, в CRM не пишутся")

    # ── Дедуп против уже существующих записей CRM ───────────────────────────────────────────────
    existing_sigs = build_existing_signatures()
    new_rows, skipped_dupes = [], []
    for row in all_expenses:
        iso_date = ru_date_to_iso(row["date"])
        title = title_of(row)
        sig = (iso_date, round(row["amount"]), title[:60])
        if sig in existing_sigs:
            skipped_dupes.append(row)
        else:
            new_rows.append(row)

    print(f"\nУже есть в CRM (пропускаются): {len(skipped_dupes)}")
    for r in skipped_dupes:
        print(f"  ПРОПУСК: {r['date']} | {r['amount']:>10,.0f} | {r['contragent']} | {(r['purpose'] or '')[:60]}")
    print(f"К записи (новые): {len(new_rows)}")

    # ── Внутренние пары-подозреваемые (одинаковые date+amount+contragent+purpose) — не отбрасываем,
    #    только выгружаем для ручной сверки владельцем ─────────────────────────────────────────
    near_dupes = find_internal_near_dupes(new_rows)
    if near_dupes:
        review_path = SCRIPT_DIR / ".review-near-duplicates-2026-09-03.md"
        with open(review_path, "w", encoding="utf-8") as f:
            f.write("# Пары похожих платежей — ручная проверка\n\n")
            f.write("Одинаковые дата+сумма+контрагент+начало назначения ВНУТРИ новых файлов.\n")
            f.write("Импортированы КАК ЕСТЬ (решение владельца 03.09.2026 — считать разными платежами),\n")
            f.write("этот файл — только для сверки постфактум.\n\n")
            for key, rows in near_dupes.items():
                f.write(f"## {key[0]} | {key[1]:,.2f} ₽ | {key[2]}\n\n")
                for r in rows:
                    f.write(f"- {r['source_file']} | {r['contragent']} | {r['purpose']}\n")
                f.write("\n")
        print(f"\nПар похожих платежей: {len(near_dupes)} — выгружено в {review_path.relative_to(BASE_DIR)}")

    # ── Классификация — отчёт по покрытию (как в старом скрипте) ───────────────────────────────
    from collections import Counter
    cnt = Counter()
    for row in new_rows:
        code = classify2(row["purpose"], row["contragent"])
        cnt[code] += 1
    print("\n=== Распределение по кодам (среди новых к записи) ===")
    for code, n in sorted(cnt.items(), key=lambda x: -x[1]):
        print(f"  {code:6} — {n:4} шт.")
    fb = cnt.get("13.8", 0)
    if new_rows:
        print(f"В 'Прочее/13.8': {fb} из {len(new_rows)} ({fb/len(new_rows)*100:.1f}%)")

    if not args.execute:
        print("\n--dry-run (--execute не передан) — в Б24 ничего не писал.")
        return

    rows_to_go = new_rows[args.skip:]
    if args.pilot:
        rows_to_go = rows_to_go[:10]
        print(f"\n=== PILOT — пишу только первые {len(rows_to_go)} строк ===")

    print(f"\n=== EXECUTE — пишу {len(rows_to_go)} строк батчами по {args.batch_size} (пропущено первых {args.skip}) ===", flush=True)
    ok = err = 0
    for i, row in enumerate(rows_to_go, 1):
        code = classify2(row["purpose"], row["contragent"])
        iso_date = ru_date_to_iso(row["date"])
        title = title_of(row)
        try:
            new_id = call("crm.item.add", {
                "entityTypeId": ENTITY_TYPE_ID,
                "fields": {
                    "title": title,
                    "opportunity": row["amount"],
                    "begindate": iso_date,
                    "closedate": iso_date,
                    "stageId": STAGE_ARCHIVE,
                    "ufCrm32_1784807840388": row["purpose"] or "",
                    "ufCrm32_1784807906954": f"Импортировано из банковской выписки 03.09.2026 "
                                              f"({row['source_file']}). ИНН контрагента: {row['inn'] or '—'}",
                    "ufCrm32Code": int(CODE_TO_ELEMENT_ID[code]),
                }
            })
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
