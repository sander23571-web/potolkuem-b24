require('dotenv').config();
const express = require('express');
const basicAuth = require('express-basic-auth');
const { fetchExhibitionData, fetchExhibitionList, cacheInvalidate, fetchAllSummaries } = require('./b24');
const { renderDashboard, renderComparison } = require('./render');
const { fetchSocialData, invalidate: socialInvalidate } = require('./livedune');
const { renderSocial } = require('./render-social');
const { fetchTasksData, cacheInvalidateTasks } = require('./tasks-b24');
const { renderTasksDashboard, renderMemberDetail } = require('./tasks-render');
const { fetchMarketingData, cacheInvalidateMarketing, fetchMarketingExpensesData, cacheInvalidateExpenses } = require('./marketing-data');
const { renderMarketing, renderMarketingExpenses } = require('./render-marketing');
const { fetchWarehouseData, cacheInvalidateWarehouse } = require('./warehouse-data');
const { renderWarehouse } = require('./render-warehouse');

const app = express();
const PORT = process.env.PORT || 3002;

// ── Basic Auth ────────────────────────────────────────────────────────────────
// Один realm для всех маршрутов. Оба пользователя (admin + director) принимаются.
const _authUsers = { [process.env.REPORT_USER || 'admin']: process.env.REPORT_PASSWORD || 'change_me' };
if (process.env.REPORT_ADMIN_USER && process.env.REPORT_ADMIN_PASSWORD) {
  _authUsers[process.env.REPORT_ADMIN_USER] = process.env.REPORT_ADMIN_PASSWORD;
}
const authMiddleware = basicAuth({ users: _authUsers, challenge: true, realm: 'Potolkuem Dashboard' });

// Доступ к расходам — только для руководства.
// 403 (не 401!) чтобы браузер не показывал повторный диалог при неверном пользователе.
const requireAdmin = (req, res, next) => {
  if (!process.env.REPORT_ADMIN_USER) {
    return res.status(503).send('Не настроены учётные данные руководителя (REPORT_ADMIN_USER в .env)');
  }
  if (req.auth?.user !== process.env.REPORT_ADMIN_USER) {
    return res.status(403).send('Доступ запрещён. Войдите с учётными данными руководителя.');
  }
  next();
};

app.use('/report', authMiddleware);
app.use('/tasks',  authMiddleware);

// ── POST body parsing (for refresh) ──────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));

// ── Routes ────────────────────────────────────────────────────────────────────

// Redirect /report → first exhibition
app.get('/report', async (req, res) => {
  try {
    const list = await fetchExhibitionList();
    if (!list.length) {
      return res.status(404).send('Выставки не найдены в Bitrix24');
    }
    // Sort by begin date desc, redirect to most recent
    list.sort((a, b) => (b.begindate || '').localeCompare(a.begindate || ''));
    res.redirect(`/report/${list[0].id}`);
  } catch (err) {
    console.error('[ERR] /report:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

// Comparison page — must be before /report/:id to avoid matching 'compare' as id
app.get('/report/compare', async (req, res) => {
  try {
    const { exhibitions, summaries } = await fetchAllSummaries();
    const html = renderComparison(exhibitions, summaries);
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
    res.send(renderWarehouse(data));
  } catch (err) {
    console.error('[ERR] /report/warehouse:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/warehouse/refresh', (req, res) => {
  cacheInvalidateWarehouse();
  res.redirect('/report/warehouse');
});

// Marketing dashboard — must be before /report/:id
app.get('/report/marketing', async (req, res) => {
  try {
    const data = await fetchMarketingData();
    res.send(renderMarketing(data));
  } catch (err) {
    console.error('[ERR] /report/marketing:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/marketing/refresh', (req, res) => {
  cacheInvalidateMarketing();
  res.redirect('/report/marketing');
});

// ── Marketing expenses (только для руководства) ───────────────────────────────
// adminAuthMiddleware применяется дополнительно поверх основного authMiddleware
app.use('/report/marketing/expenses', requireAdmin);

app.get('/report/marketing/expenses', async (req, res) => {
  try {
    const data = await fetchMarketingExpensesData();
    res.send(renderMarketingExpenses(data));
  } catch (err) {
    console.error('[ERR] /report/marketing/expenses:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/report/marketing/expenses/refresh', (req, res) => {
  cacheInvalidateExpenses();
  res.redirect('/report/marketing/expenses');
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
    const html = renderDashboard(data, allExhibitions, id);
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
  res.redirect(`/report/${id}`);
});

// ── Tasks dashboard ───────────────────────────────────────────────────────────

app.get('/tasks', async (req, res) => {
  try {
    const data = await fetchTasksData();
    res.send(renderTasksDashboard(data));
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
    res.send(renderMemberDetail(data, userId));
  } catch (err) {
    console.error(`[ERR] /tasks/member/${userId}:`, err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/tasks/refresh', (req, res) => {
  cacheInvalidateTasks();
  res.redirect('/tasks');
});

// ── SMM Dashboard ─────────────────────────────────────────────────────────────
app.use('/social', authMiddleware);

app.get('/social', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    const data = await fetchSocialData(days);
    res.send(renderSocial(data));
  } catch (err) {
    console.error('[ERR] /social:', err.message);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

app.post('/social/refresh', (req, res) => {
  const days = Math.min(365, Math.max(7, parseInt(req.body.days, 10) || 30));
  socialInvalidate();
  res.redirect(`/social?days=${days}`);
});

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'report-app' }));

app.listen(PORT, () => {
  console.log(`report-app запущен на порту ${PORT}`);
});
