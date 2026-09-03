#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Создаёт UF-поля для СП «Задачи Креативного Директора» (typeId=42, entityTypeId=1100)."""
import json, sys, requests

PROXY = "https://b24proxy.bobp.ru/b24/potolkuem"
API_KEY = "b589caa6cef8e95163dc9ded06b0934479023f15ef9ab13a76368a74b9694f1c"
ENTITY_ID = "CRM_42"

def call(method, params):
    r = requests.post(f"{PROXY}/{method}", headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                       data=json.dumps(params), timeout=30)
    d = r.json()
    if "error" in d:
        raise RuntimeError(f"{method} -> {d}")
    return d["result"]

def enum_list(values):
    return [{"value": v, "def": "N", "sort": (i + 1) * 10} for i, v in enumerate(values)]

# (code, label, userTypeId, multiple, extra_settings, enum_values)
FIELDS = [
    # ── Общие ──
    ("PRIORITY", "Приоритет", "enumeration", "N", {}, ["Низкий", "Средний", "Высокий"]),
    ("COMMENT", "Комментарий", "string", "N", {"ROWS": 4}, None),
    ("FILES", "Файлы", "file", "Y", {}, None),

    # ── Соцсети ──
    ("SM_PLATFORM", "Платформа", "enumeration", "N", {}, ["VK", "TG", "Дзен", "MAX", "TikTok", "Instagram", "Другое"]),
    ("SM_PUBLISH_DATE", "Дата публикации", "date", "N", {}, None),
    ("SM_CONTENT_TYPE", "Тип контента", "enumeration", "N", {}, ["Пост", "Сторис", "Рилс", "Карусель"]),
    ("SM_TOPIC", "Тема / заголовок", "string", "N", {}, None),
    ("SM_LINK", "Ссылка на публикацию", "url", "N", {}, None),
    ("SM_MATERIALS", "Прикреплённые материалы", "file", "Y", {}, None),
    ("SM_VIEWS", "Просмотры", "double", "N", {}, None),
    ("SM_REACH", "Охват", "double", "N", {}, None),
    ("SM_LIKES", "Лайки", "double", "N", {}, None),
    ("SM_COMMENTS", "Комментарии", "double", "N", {}, None),
    ("SM_SHARES", "Репосты / Пересылки / Сохранения", "double", "N", {}, None),
    ("SM_ZEN_COMPLETION", "Дочитывания, % (Дзен)", "double", "N", {}, None),
    ("SM_ZEN_READ_TIME", "Среднее время чтения (Дзен)", "string", "N", {}, None),
    ("SM_ZEN_WATCH_TIME", "Среднее время просмотра (Дзен)", "string", "N", {}, None),
    ("SM_ZEN_RETENTION", "Досмотры, % (Дзен)", "double", "N", {}, None),
    ("SM_SCREENSHOT", "Скриншот полной статистики", "file", "N", {}, None),

    # ── Журнал ──
    ("J_COPYWRITER", "Копирайтер", "employee", "N", {}, None),
    ("J_TOPIC", "Тема статьи", "string", "N", {}, None),
    ("J_RUBRIC", "Рубрика", "string", "N", {}, None),
    ("J_LINK", "Ссылка на статью", "url", "N", {}, None),
    ("J_AUTHOR", "Автор текста", "employee", "N", {}, None),
    ("J_VIEWS", "Просмотры страницы", "double", "N", {}, None),
    ("J_DESKTOP", "Компьютерная версия сайта", "boolean", "N", {}, None),
    ("J_MOBILE", "Мобильная версия сайта", "boolean", "N", {}, None),
    ("J_ZEN", "Яндекс.Дзен", "boolean", "N", {}, None),

    # ── Дизайн ──
    ("D_TYPE", "Тип работы", "enumeration", "N", {},
     ["Презентация", "Выставочный материал", "Полиграфия", "Рекламный креатив",
      "Генерация изображений", "Материал для сайта", "Другое"]),
    ("D_PROJECT", "Проект / направление", "string", "N", {}, None),
    ("D_EXECUTOR", "Исполнитель", "string", "N", {}, None),
    ("D_RESULT_LINK", "Ссылка на итоговый файл", "url", "N", {}, None),
    ("D_EXPENSES", "Расходы (при наличии)", "double", "N", {}, None),

    # ── Съёмки ──
    ("S_TYPE", "Тип съёмки", "enumeration", "N", {},
     ["Фотосъёмка", "Видеосъёмка", "Выезд контент-мейкера", "Монтаж"]),
    ("S_DATE", "Дата съёмки", "date", "N", {}, None),
    ("S_SUBJECT", "Повод / объект", "string", "N", {}, None),
    ("S_USAGE", "Где использовано", "enumeration", "Y", {}, ["Соцсети", "Сайт", "Каталог"]),
    ("S_EXECUTOR", "Исполнитель / подрядчик", "string", "N", {}, None),
    ("S_TZ_LINK", "ТЗ / ссылка на ТЗ", "url", "N", {}, None),
    ("S_COST", "Стоимость работы", "double", "N", {}, None),
    ("S_CONTRACT", "Договор (при наличии)", "crm", "N", {}, None),
    ("S_VOLUME", "Объём результата", "string", "N", {}, None),
    ("S_SOURCE_LINK", "Ссылка на исходники / готовый материал", "url", "N", {}, None),
]

def create_field(code, label, user_type, multiple, extra_settings, enum_values):
    field = {
        "entityId": ENTITY_ID,
        "fieldName": f"UF_CRM_42_{code}",
        "userTypeId": user_type,
        "editFormLabel": {"ru": label},
        "mandatory": "N",
        "multiple": multiple,
    }
    if extra_settings:
        field["settings"] = extra_settings
    if enum_values:
        field["enum"] = enum_list(enum_values)
    return call("userfieldconfig.add", {"moduleId": "crm", "field": field})

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "pilot"
    subset = FIELDS[:3] if mode == "pilot" else FIELDS[3:] if mode == "rest" else FIELDS
    ok = err = 0
    for code, label, user_type, multiple, extra, enum_values in subset:
        try:
            res = create_field(code, label, user_type, multiple, extra, enum_values)
            fid = res["field"]["id"]
            print(f"  OK  {code:20} id={fid:>5}  ({user_type}{'  multiple' if multiple=='Y' else ''})")
            ok += 1
        except Exception as e:
            print(f"  ERR {code:20} {e}")
            err += 1
    print(f"\nИтого: {ok} создано, {err} ошибок (режим: {mode}, полей в списке: {len(subset)}/{len(FIELDS)})")
