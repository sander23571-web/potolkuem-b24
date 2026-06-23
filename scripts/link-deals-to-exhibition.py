"""
Привязка сделок АРХ МОСКВА к выставке (id=4) в смарт-процессе Выставки (entityTypeId=1048)
Метод: crm.deal.update с полем PARENT_ID_1048
"""

import requests
import time

WEBHOOK = "https://potolkuem.bitrix24.ru/rest/134/gj6y27ehe0f42jeb"
EXHIBITION_ID = 4

DEAL_IDS = [
    232, 234, 236, 238, 240, 242, 244, 246, 248, 250,
    252, 254, 258, 260, 262, 264, 266, 268, 270, 272,
    274, 276, 278, 280, 282, 284, 286, 288, 290, 292,
    294, 296, 298, 300, 302, 304, 306, 308, 310, 312,
    314, 316, 318, 320, 322, 324, 326, 328, 330, 332,
    336, 338, 340, 342, 344, 346, 348, 350
]

def link_deal(deal_id):
    url = f"{WEBHOOK}/crm.deal.update"
    payload = {
        "id": deal_id,
        "fields": {
            "PARENT_ID_1048": EXHIBITION_ID
        }
    }
    r = requests.post(url, json=payload)
    data = r.json()
    if data.get("result") is True:
        print(f"✅ {deal_id} — привязана")
    else:
        print(f"❌ {deal_id} — ошибка: {data}")

print(f"Привязываем {len(DEAL_IDS)} сделок к выставке id={EXHIBITION_ID}...\n")
for deal_id in DEAL_IDS:
    link_deal(deal_id)
    time.sleep(0.3)  # не превышаем лимит API

print("\nГотово.")
