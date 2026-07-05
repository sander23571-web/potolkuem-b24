# Дашборды «Потолкуем?» — справка

## Адрес и авторизация

**Сервер:** https://db-talk.bobp.ru

**Логин:** `admin`
**Пароль:** `JGBDG7lVRqTjeTkg`

Браузер запросит логин и пароль при первом открытии (Basic Auth).

---

## Дашборд выставок

| Страница | URL |
|---|---|
| Последняя выставка | https://db-talk.bobp.ru/report |
| Сравнение всех выставок | https://db-talk.bobp.ru/report/compare |
| АРХ МОСКВА (id=4) | https://db-talk.bobp.ru/report/4 |
| non/fictioN (id=30) | https://db-talk.bobp.ru/report/30 |
| Образование и карьера (id=24) | https://db-talk.bobp.ru/report/24 |

**Что показывает:** выручка, расходы, P&L, сделки, выходы ведущих по каждой выставке.

Кнопка «Обновить данные» сбрасывает кеш (данные кешируются на 5 минут).

---

## Дашборд задач коллектива

| Страница | URL |
|---|---|
| Главный — команда целиком | https://db-talk.bobp.ru/tasks |
| Детально по сотруднику | https://db-talk.bobp.ru/tasks/member/{userId} |

**Что показывает:** активные задачи, просроченные, зависшие (14+ дней без движения), закрытые за 30 дней, среднее время выполнения по каждому сотруднику. Клик на имя → детальный разбор.

---

## Портал Битрикс24

https://potolkuem.bitrix24.ru

---

## Техническая информация (для разработчика)

- **Сервер:** `155.212.143.68`, порт SSH `2222`
- **PM2:** `pm2 restart report-app`
- **Исходники:** `/root/projects/talk/report-app/` на машине `46.173.20.187`
- **Деплой:**
  ```bash
  scp -P 2222 report-app/index.js report-app/b24.js report-app/render.js \
      report-app/tasks-b24.js report-app/tasks-render.js \
      root@155.212.143.68:/root/projects/talk-report/
  ssh -p 2222 root@155.212.143.68 'pm2 restart report-app'
  ```
