require('dotenv').config();
const express = require('express');
const basicAuth = require('express-basic-auth');
const { fetchExhibitionData, fetchExhibitionList, cacheInvalidate } = require('./b24');
const { renderDashboard } = require('./render');

const app = express();
const PORT = process.env.PORT || 3002;

// ── Basic Auth ────────────────────────────────────────────────────────────────
app.use(
  '/report',
  basicAuth({
    users: { [process.env.REPORT_USER || 'admin']: process.env.REPORT_PASSWORD || 'change_me' },
    challenge: true,
    realm: 'Potolkuem Dashboard',
  })
);

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

// ── Healthcheck ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'report-app' }));

app.listen(PORT, () => {
  console.log(`report-app запущен на порту ${PORT}`);
});
