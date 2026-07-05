require('dotenv').config();
const express = require('express');
const basicAuth = require('express-basic-auth');
const { fetchExhibitionData, fetchExhibitionList, cacheInvalidate, fetchAllSummaries } = require('./b24');
const { renderDashboard, renderComparison } = require('./render');
const { fetchSocialData, invalidate: socialInvalidate } = require('./livedune');
const { renderSocial } = require('./render-social');
const { fetchTasksData, cacheInvalidateTasks } = require('./tasks-b24');
const { renderTasksDashboard, renderMemberDetail } = require('./tasks-render');

const app = express();
const PORT = process.env.PORT || 3002;

// ── Basic Auth ────────────────────────────────────────────────────────────────
const authMiddleware = basicAuth({
  users: { [process.env.REPORT_USER || 'admin']: process.env.REPORT_PASSWORD || 'change_me' },
  challenge: true,
  realm: 'Potolkuem Dashboard',
});

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
    res.status(500).send('Ошибка подключения к Bitrix24: ' + err.message);
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
    res.status(500).send('Ошибка загрузки данных: ' + err.message);
  }
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
    res.status(500).send('Ошибка загрузки данных: ' + err.message);
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
    res.status(500).send('Ошибка загрузки данных задач: ' + err.message);
  }
});

app.get('/tasks/member/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const data = await fetchTasksData();
    res.send(renderMemberDetail(data, userId));
  } catch (err) {
    console.error(`[ERR] /tasks/member/${userId}:`, err.message);
    res.status(500).send('Ошибка загрузки данных: ' + err.message);
  }
});

app.post('/tasks/refresh', (req, res) => {
  cacheInvalidateTasks();
  res.redirect('/tasks');
});

// ── SMM Dashboard ─────────────────────────────────────────────────────────────
app.use(
  '/social',
  basicAuth({
    users: { [process.env.REPORT_USER || 'admin']: process.env.REPORT_PASSWORD || 'change_me' },
    challenge: true,
    realm: 'Potolkuem Dashboard',
  })
);

app.get('/social', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    const data = await fetchSocialData(days);
    res.send(renderSocial(data));
  } catch (err) {
    console.error('[ERR] /social:', err.message);
    res.status(500).send('Ошибка загрузки данных LiveDune: ' + err.message);
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
