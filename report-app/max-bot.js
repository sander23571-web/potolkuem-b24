'use strict';
/**
 * max-bot.js — приём сообщений МАКС (мессенджер) для конкретных сотрудников,
 * запись в Б24 (СП «МАКС — Журнал сообщений», entityTypeId=1096) + уведомление
 * в мессенджер Б24 адресату.
 *
 * ВАЖНО: точная схема вложений (attachments) в объекте Message не подтверждена по
 * документации dev.max.ru — интерактивный JSON-вьюер не отдаёт вложенные примеры
 * статикой, а OpenAPI-спеки в открытом доступе нет. Разбор ниже — защитный
 * (несколько вариантов путей к полям), плюс весь сырой payload сохраняется в
 * ufCrm40MessageText как JSON, если структурированный текст не нашёлся — чтобы
 * ничего не терялось. Сверить и уточнить разбор, когда придёт первое реальное
 * сообщение от живого бота.
 *
 * Один бот МАКС = один сотрудник (решение владельца, 10.08.2026). Сопоставление —
 * по URL-пути вебхука (/max/webhook/:slug), не по полям payload — это надёжнее,
 * чем полагаться на неподтверждённую структуру identity внутри самого сообщения.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK        = process.env.B24_WEBHOOK;
const MAX_API_BASE    = 'https://platform-api2.max.ru';
const ENTITY_TYPE_ID  = 1096;
const CATEGORY_ID     = 58;
const STAGE_NEW       = `DT1096_${CATEGORY_ID}:NEW`;

// ── Конфигурация ботов ──────────────────────────────────────────────────────────
// Один бот = один сотрудник. Токены — из env (MAX_BOT_TOKEN_<SLUG>), не хардкодить.
// Пример заполнения (реальных ботов пока нет — владелец создаст, задача #TODO):
//   MAX_BOT_TOKEN_ALEXANDER=xxxxx
//   MAX_BOT_SECRET_ALEXANDER=yyyyy   (опционально, для X-Max-Bot-Api-Secret)
const BOTS = {
  // slug (часть URL /max/webhook/:slug) → { b24UserId, name, envPrefix }
  // 'alexander': { b24UserId: 134, name: 'Александр', envPrefix: 'ALEXANDER' },
};

function botConfig(slug) {
  const b = BOTS[slug];
  if (!b) return null;
  return {
    ...b,
    token:  process.env[`MAX_BOT_TOKEN_${b.envPrefix}`],
    secret: process.env[`MAX_BOT_SECRET_${b.envPrefix}`],
  };
}

// ── Б24 helpers ───────────────────────────────────────────────────────────────
async function b24(method, params) {
  const r = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function notifyEmployee(b24UserId, text) {
  return b24('im.notify.personal.add', { USER_ID: b24UserId, MESSAGE: text });
}

async function logMessage({ b24UserId, botName, senderName, senderId, text, rawPayload }) {
  const fields = {
    title:               `МАКС · ${botName} · ${senderName || 'без имени'}`,
    stageId:             STAGE_NEW,
    ufCrm40Employee:      b24UserId,
    ufCrm40BotName:       botName,
    ufCrm40SenderName:    senderName || '',
    ufCrm40SenderId:      senderId ? String(senderId) : '',
    // если структурированный текст не нашёлся — кладём весь payload, чтобы не терять данные
    ufCrm40MessageText:   text || `[не удалось разобрать текст, сырой payload]\n${JSON.stringify(rawPayload)}`,
    ufCrm40Processed:     false,
    ufCrm40Notified:      false,
  };
  const res = await b24('crm.item.add', { entityTypeId: ENTITY_TYPE_ID, fields });
  return res?.result?.item?.id || null;
}

async function markNotified(itemId) {
  return b24('crm.item.update', {
    entityTypeId: ENTITY_TYPE_ID,
    id: itemId,
    fields: { ufCrm40Notified: true },
  });
}

// ── Разбор входящего Update от МАКС (защитный, см. предупреждение выше) ────────
function parseIncomingMessage(payload) {
  // Пробуем несколько правдоподобных путей — документация не даёт точную схему.
  const msg = payload?.message || payload;
  const sender = msg?.sender || payload?.sender || payload?.user || {};
  const body = msg?.body || msg;

  const senderName = sender?.name
    || [sender?.first_name, sender?.last_name].filter(Boolean).join(' ')
    || sender?.username
    || null;
  const senderId = sender?.user_id || sender?.id || null;

  const text = body?.text || msg?.text || null;

  // Вложения: путь и имена полей НЕ подтверждены — если появятся, залогировать
  // отдельно после первого реального сообщения и доработать здесь.
  const attachments = body?.attachments || msg?.attachments || [];

  return { senderName, senderId, text, attachments, updateType: payload?.update_type || null };
}

// ── Главный обработчик вебхука ──────────────────────────────────────────────────
async function handleWebhook(slug, payload) {
  const cfg = botConfig(slug);
  if (!cfg) {
    throw new Error(`Неизвестный бот МАКС: slug="${slug}" — нет в BOTS в max-bot.js`);
  }

  const parsed = parseIncomingMessage(payload);

  // Пока обрабатываем только сообщения — bot_started/bot_added и т.п. просто логируем без уведомления
  const isMessage = parsed.updateType ? parsed.updateType.startsWith('message') : true;

  const itemId = await logMessage({
    b24UserId:  cfg.b24UserId,
    botName:    cfg.name,
    senderName: parsed.senderName,
    senderId:   parsed.senderId,
    text:       parsed.text,
    rawPayload: payload,
  });

  if (isMessage && itemId) {
    const preview = (parsed.text || '[вложение/без текста]').slice(0, 200);
    await notifyEmployee(cfg.b24UserId, `МАКС · ${parsed.senderName || 'сообщение'}: ${preview}`);
    await markNotified(itemId);
  }

  return { itemId, parsed };
}

// ── Регистрация подписки на вебхук (запускать вручную один раз на бота) ────────
async function registerSubscription(slug, publicWebhookUrl) {
  const cfg = botConfig(slug);
  if (!cfg || !cfg.token) {
    throw new Error(`Нет токена для бота "${slug}" — задайте MAX_BOT_TOKEN_${(BOTS[slug] || {}).envPrefix} в .env`);
  }
  const body = {
    url: publicWebhookUrl,
    update_types: ['message_created', 'bot_started', 'bot_added'],
  };
  if (cfg.secret) body.secret = cfg.secret;

  const res = await fetch(`${MAX_API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { 'Authorization': cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

module.exports = { handleWebhook, registerSubscription, BOTS };
