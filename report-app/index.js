require('dotenv').config();
const express = require('express');
const basicAuth = require('express-basic-auth');
const { bxEntry, createHybridAuth, requireDirector } = require('./bx-auth');
const { fetchExhibitionData, fetchExhibitionList, cacheInvalidate, fetchAllSummaries, sortExhibitionsRecentFirst } = require('./b24');
const { renderDashboard, renderComparison } = require('./render');
const { fetchSocialData, invalidate: socialInvalidate } = require('./livedune');
const { renderSocial } = require('./render-social');
const { fetchTasksData, cacheInvalidateTasks } = require('./tasks-b24');
const { renderTasksDashboard, renderMemberDetail } = require('./tasks-render');
const { fetchMarketingData, cacheInvalidateMarketing, fetchMarketingExpensesData, cacheInvalidateExpenses } = require('./marketing-data');
const { renderMarketing, renderMarketingExpenses } = require('./render-marketing');
const { fetchWarehouseData, cacheInvalidateWarehouse } = require('./warehouse-data');
const { renderWarehouse } = require('./render-warehouse');
const { resolveRange, rangeQueryString } = require('./period');

const app = express();
const PORT = process.env.PORT || 3002;

// ── Basic Auth ────────────────────────────────────────────────────────────────
// Один realm для всех маршрутов. Оба пользователя (admin + director) принимаются.
const _authUsers = { [process.env.REPORT_USER || 'admin']: process.env.REPORT_PASSWORD || 'change_me' };
if (process.env.REPORT_ADMIN_USER && process.env.REPORT_ADMIN_PASSWORD) {
  _authUsers[process.env.REPORT_ADMIN_USER] = process.env.REPORT_ADMIN_PASSWORD;
}
const authMiddleware = basicAuth({ users: _authUsers, challenge: true, realm: 'Potolkuem Dashboard' });

// ── Локальное приложение Б24 (внутренний доступ) + Basic Auth как фолбэк ──────
// hybridAuth: если пришли из Б24 (?bxt=... в query, выданный /bx/entry) — пускает
// по правам пользователя портала; иначе — старый Basic Auth (admin/director).
// req.viewer.isDirector определяет доступ к закрытым разделам (см. requireDirector).
const hybridAuth = createHybridAuth(authMiddleware);

// Пробрасывает ?bxt= через серверные редиректы (иначе сессия из Б24 рвётся
// на первом же res.redirect и запрос падает на Basic Auth фолбэк).
function withBxt(path, req) {
  if (!req.viewer || !req.viewer.token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'bxt=' + encodeURIComponent(req.viewer.token);
}

// ── CSP: разрешить встраивание в iframe только с портала Б24 ──────────────────
app.use((req, res, next) => {
  const domain = process.env.BX_PORTAL_DOMAIN || 'potolkuem.bitrix24.ru';
  res.setHeader('Content-Security-Policy', `frame-ancestors https://${domain}`);
  next();
});

// ── POST body parsing (for refresh + вход из Б24) ─────────────────────────────
app.use(express.urlencoded({ extended: false }));

// Вход из левого меню Б24: POST с AUTH_ID/DOMAIN → сессионный ?bxt= и редирект
app.post('/bx/entry', bxEntry);

app.use('/report', hybridAuth);
app.use('/tasks',  hybridAuth);

// ── Routes ────────────────────────────────────────────────────────────────────

// Redirect /report → first exhibition
app.get('/report', async (req, res) => {
  try {
    const list = await fetchExhibitionList();
    if (!list.length) {
      return res.status(404).send('Выставки не найдены в Bitrix24');
    }
    // Уже состоявшиеся выставки — вперёд (самая недавняя первой),
    // ещё не начавшиеся — в конец (см. b24.js: sortExhibitionsRecentFirst).
    const sorted = sortExhibitionsRecentFirst(list);
    res.redirect(withBxt(`/report/${sorted[0].id}`, req));
  } catch (err) {
    console.error('[ERR] /report:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

// Comparison page — must be before /report/:id to avoid matching 'compare' as id
app.get('/report/compare', async (req, res) => {
  try {
    const { exhibitions, summaries } = await fetchAllSummaries();
    const html = renderComparison(exhibitions, summaries, req.viewer);
    res.send(html);
  } catch (err) {
    console.error('[ERR] /report/compare:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

// Warehouse dashboard — must be before /report/:id
app.get('/report/warehouse', async (req, res) => {
  try {
    const data = await fetchWarehouseData();
    res.send(renderWarehouse(data, req.viewer));
  } catch (err) {
    console.error('[ERR] /report/warehouse:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/warehouse/refresh', (req, res) => {
  cacheInvalidateWarehouse();
  res.redirect(withBxt('/report/warehouse', req));
});

// Marketing dashboard — must be before /report/:id
app.get('/report/marketing', async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await fetchMarketingData(range);
    res.send(renderMarketing(data, req.viewer));
  } catch (err) {
    console.error('[ERR] /report/marketing:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/marketing/refresh', (req, res) => {
  cacheInvalidateMarketing();
  const range = resolveRange(req.query);
  res.redirect(withBxt('/report/marketing?' + rangeQueryString(range), req));
});

// ── Marketing expenses (только для руководства) ───────────────────────────────
// requireDirector применяется дополнительно поверх hybridAuth (см. req.viewer.isDirector)
app.use('/report/marketing/expenses', requireDirector);

app.get('/report/marketing/expenses', async (req, res) => {
  try {
    const range = resolveRange(req.query);
    const data = await fetchMarketingExpensesData(range);
    res.send(renderMarketingExpenses(data, req.viewer));
  } catch (err) {
    console.error('[ERR] /report/marketing/expenses:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/marketing/expenses/refresh', (req, res) => {
  cacheInvalidateExpenses();
  const range = resolveRange(req.query);
  res.redirect(withBxt('/report/marketing/expenses?' + rangeQueryString(range), req));
});

// Dashboard for specific exhibition
app.get('/report/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).send('Некорректный ID выставки');

  try {
    const [data, allExhibitions] = await Promise.all([
      fetchExhibitionData(id),
      fetchExhibitionList(),
    ]);
    const html = renderDashboard(data, allExhibitions, id, req.viewer);
    res.send(html);
  } catch (err) {
    console.error(`[ERR] /report/${id}:`, err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

// Refresh cache and redirect
app.post('/report/:id/refresh', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).send('Некорректный ID');
  cacheInvalidate(id);
  res.redirect(withBxt(`/report/${id}`, req));
});

// ── Tasks dashboard ───────────────────────────────────────────────────────────

app.get('/tasks', async (req, res) => {
  try {
    const data = await fetchTasksData();
    res.send(renderTasksDashboard(data, req.viewer));
  } catch (err) {
    console.error('[ERR] /tasks:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.get('/tasks/member/:userId', async (req, res) => {
  const userId = req.params.userId;
  if (!/^\d+$/.test(userId)) return res.status(400).send('Некорректный ID');
  try {
    const data = await fetchTasksData();
    res.send(renderMemberDetail(data, userId, req.viewer));
  } catch (err) {
    console.error(`[ERR] /tasks/member/${userId}:`, err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/tasks/refresh', (req, res) => {
  cacheInvalidateTasks();
  res.redirect(withBxt('/tasks', req));
});

// ── SMM Dashboard ─────────────────────────────────────────────────────────────
app.use('/social', hybridAuth);

app.get('/social', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    const data = await fetchSocialData(days);
    res.send(renderSocial(data, req.viewer));
  } catch (err) {
    console.error('[ERR] /social:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/social/refresh', (req, res) => {
  const days = Math.min(365, Math.max(7, parseInt(req.body.days, 10) || 30));
  socialInvalidate();
  res.redirect(withBxt(`/social?days=${days}`, req));
});

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'report-app' }));

app.listen(PORT, () => {
  console.log(`report-app запущен на порту ${PORT}`);
});
