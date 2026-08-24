# Дашборды «Потолкуем?» — справка

## Адрес и авторизация

**Сервер:** https://db-talk.bobp.ru

**Логин:** `admin`
**Пароль:** `JGBDG7lVRqTjeTkg`

Браузер запросит логин и пароль при первом открытии (Basic Auth).

---

## Дашборд маркетинга

| Страница | URL |
|---|---|
| Маркетинг (Бренд · Сайт · Соцсети · SEO · Расходы) | https://db-talk.bobp.ru/report/marketing |

**Что показывает:** Wordstat-спрос на бренд, трафик сайта (Метрика), подписчики VK/TG/Дзен, SEO-клики (Вебмастер), список маркетинговых расходов из CRM.

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
- **PM2:** управляется под root (`pm2 list` показывает `report-app` с user=root), но деплой и рестарт — НЕ под root, см. ниже
- **Исходники:** `/root/projects/talk/report-app/` на машине `91.212.166.151` (RuVDS, `ruvds-n2evh`; устаревший адрес `46.173.20.187` для `/root/projects` не используется с 2026-06/07)
- **ИЗМЕНЕНО 21.08.2026** (находка sentinel: root SSH на этот сервер даёт доступ и к `mirror-gateway`/Postgres gigaclaude, который физически на той же машине — см. `proj log --project gigaclaude` 21.08): деплой теперь идёт под отдельным непривилегированным пользователем `reportapp-deploy`, НЕ под root.
  - Владеет `/root/projects/talk-report/` (chown), может писать туда напрямую по SSH/SCP.
  - Проход через `/root` и `/root/projects` — точечный ACL (`setfacl`, только `--x` для этого пользователя, /root не открыт вообще никому больше).
  - `sudo` — ТОЛЬКО две команды (`/etc/sudoers.d/reportapp-deploy`): `pm2 restart report-app`, `pm2 logs report-app --lines 50 --nostream`. Больше ничего, никакого root-shell.
  - НЕ имеет доступа к `/opt/mirror/*`, `/opt/b24configs/*` (проверено вживую 21.08 — Permission denied на все файлы).
  - Приватный ключ — НЕ в git, лежит в `~/.ssh/reportapp_deploy_key` (обычный путь SSH-агента, не в репозитории). Если сессия/машина сменится и ключа там не окажется — сгенерировать заново и переставить публичный ключ в `~reportapp-deploy/.ssh/authorized_keys` на сервере (старый публичный ключ можно оставить рядом, не обязательно отзывать).
- **Деплой:**
  ```bash
  scp -P 2222 -i ~/.ssh/reportapp_deploy_key \
      report-app/index.js report-app/b24.js report-app/render.js \
      report-app/tasks-b24.js report-app/tasks-render.js \
      reportapp-deploy@155.212.143.68:/root/projects/talk-report/
  ssh -p 2222 -i ~/.ssh/reportapp_deploy_key reportapp-deploy@155.212.143.68 \
      'sudo /usr/bin/pm2 restart report-app'
  ```
  Старый способ (root) технически всё ещё работает (root-доступ не отозван) — но новые сессии должны использовать `reportapp-deploy` по умолчанию, root — только если `reportapp-deploy` не хватает прав на что-то новое (и тогда явно решать, добавлять ли это в sudoers, не переключаться на root молча).
