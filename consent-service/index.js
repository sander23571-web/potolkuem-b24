require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const CONSENT_TEXTS = require('./consent-texts');

const app = express();
const PORT = process.env.PORT || 3000;
const B24_WEBHOOK = process.env.B24_WEBHOOK;
const ENTITY_TYPE_ID = parseInt(process.env.B24_ENTITY_CONSENT, 10); // 1068

// ── Защита от перебора ────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(
  '/consent',
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Слишком много запросов. Попробуйте через минуту.',
  })
);

// ── Вспомогательные функции ───────────────────────────────────────────────────

function b24(method, params) {
  return fetch(`${B24_WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).then(r => r.json());
}

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// ── HTML-страницы ─────────────────────────────────────────────────────────────

function pageOk() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Согласие зафиксировано</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 48px 40px;
            max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { color: #1a1a2e; font-size: 24px; margin: 0 0 12px; }
    p { color: #666; line-height: 1.6; margin: 0 0 8px; }
    small { color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Согласие зафиксировано</h1>
    <p>Спасибо! Ваше согласие на получение материалов от «Потолкуем?» и на обработку персональных данных сохранено.</p>
    <p>Вы можете отозвать согласие в любое время, написав на <a href="mailto:puchkin@a-dat.ru">puchkin@a-dat.ru</a>.</p>
    <small>«Потолкуем?» — игры для развития речи</small>
  </div>
</body>
</html>`;
}

function pageAlready() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Согласие уже получено</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 48px 40px;
            max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { color: #1a1a2e; font-size: 24px; margin: 0 0 12px; }
    p { color: #666; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">👍</div>
    <h1>Согласие уже зафиксировано</h1>
    <p>Ваше согласие было получено ранее. Ничего дополнительного делать не нужно.</p>
  </div>
</body>
</html>`;
}

function pageError(msg) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ошибка</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; padding: 48px 40px;
            max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { color: #c0392b; font-size: 24px; margin: 0 0 12px; }
    p { color: #666; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Что-то пошло не так</h1>
    <p>${msg || 'Попробуйте перейти по ссылке из письма ещё раз или напишите нам на puchkin@a-dat.ru.'}</p>
  </div>
</body>
</html>`;
}

// ── Основной маршрут ──────────────────────────────────────────────────────────

app.get('/consent', async (req, res) => {
  const cidRaw = req.query.cid;
  const src = req.query.src || 'unknown';

  // Валидация cid
  const cid = parseInt(cidRaw, 10);
  if (!cid || cid <= 0) {
    return res.status(400).send(pageError('Некорректная ссылка.'));
  }

  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  try {
    // Проверяем: нет ли уже записи для этого контакта
    const existing = await b24('crm.item.list', {
      entityTypeId: ENTITY_TYPE_ID,
      filter: { contactId: cid },
      select: ['id'],
    });

    if (existing?.result?.items?.length > 0) {
      return res.send(pageAlready());
    }

    // Создаём запись согласия
    const now = new Date().toISOString();
    const title = `Согласие контакта #${cid} от ${now.slice(0, 10)}`;

    const addResult = await b24('crm.item.add', {
      entityTypeId: ENTITY_TYPE_ID,
      fields: {
        title,
        contactId: cid,
        stageId: `DT1068_30:NEW`,
        ufCrm22ConsentPd: 'Y',
        ufCrm22ConsentMarketing: 'Y',
        ufCrm22IpAddress: ip,
        ufCrm22UserAgent: ua.slice(0, 500),
        ufCrm22Source: src,
        ufCrm22ConsentTextPd: CONSENT_TEXTS.pd,
        ufCrm22ConsentTextMarketing: CONSENT_TEXTS.marketing,
      },
    });

    if (addResult?.result?.item?.id) {
      console.log(`[OK] consent cid=${cid} id=${addResult.result.item.id} ip=${ip} src=${src}`);
      return res.send(pageOk());
    } else {
      console.error(`[ERR] crm.item.add failed for cid=${cid}:`, JSON.stringify(addResult));
      return res.status(500).send(pageError());
    }
  } catch (err) {
    console.error(`[ERR] cid=${cid}:`, err.message);
    return res.status(500).send(pageError());
  }
});

// ── Healthcheck ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`consent-service запущен на порту ${PORT}`);
  console.log(`B24_ENTITY_CONSENT=${ENTITY_TYPE_ID}`);
});
