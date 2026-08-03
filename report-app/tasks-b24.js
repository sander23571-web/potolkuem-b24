require('dotenv').config();
const fetch = require('node-fetch');

const WEBHOOK = process.env.B24_WEBHOOK;
const B24_URL = 'https://potolkuem.bitrix24.ru';
const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map();

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL) { cache.delete(key); return null; }
  return e.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function cacheInvalidateTasks() {
  cache.clear();
}

async function b24(method, params = {}) {
  const res = await fetch(`${WEBHOOK}${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// ── tasks.task.list — все страницы ────────────────────────────────────────────
async function fetchAllTasks(filter = {}, select = []) {
  const tasks = [];
  let start = 0;
  while (true) {
    const res = await b24('tasks.task.list', { filter, select, start });
    const batch = res?.result?.tasks || [];
    tasks.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return tasks;
}

// ── Все активные пользователи портала ─────────────────────────────────────────
async function fetchAllUsers() {
  const users = [];
  let start = 0;
  while (true) {
    const res = await b24('user.get', { select: ['ID', 'NAME', 'LAST_NAME', 'ACTIVE'], start });
    const batch = res?.result || [];
    users.push(...batch);
    if (batch.length < 50) break;
    start += 50;
  }
  return users;
}

// ── Главный агрегатор ─────────────────────────────────────────────────────────
async function fetchTasksData() {
  const cached = cacheGet('tasks_main');
  if (cached) return cached;

  const now    = new Date();
  const nowTs  = now.getTime();
  const d7ago  = new Date(nowTs -  7 * 86400000);
  const d14ago = new Date(nowTs - 14 * 86400000);
  const d30ago = new Date(nowTs - 30 * 86400000);

  const todayStr  = now.toISOString().slice(0, 10) + 'T00:00:00';
  const d30agoStr = d30ago.toISOString().slice(0, 10);

  const SELECT = [
    'ID', 'TITLE', 'STATUS', 'DEADLINE',
    'CREATED_DATE', 'CLOSED_DATE', 'CHANGED_DATE',
    'RESPONSIBLE_ID', 'CREATED_BY',
  ];

  // Параллельно: активные задачи (не завершённые) + недавно закрытые + пользователи.
  // Раньше тянули ВСЕ задачи без фильтра (1377 шт., из них 1064 давно закрытых
  // сразу выбрасывались) — 12+ секунд на холодный запрос. !STATUS:5 фильтрует
  // на стороне Б24, оставляя только реально нужные ~300 активных.
  const [activeTasks, recentClosed, users] = await Promise.all([
    fetchAllTasks({ '!STATUS': 5 }, SELECT),
    fetchAllTasks({ STATUS: 5, '>=CLOSED_DATE': d30agoStr }, SELECT),
    fetchAllUsers(),
  ]);

  // Карта пользователей id → имя (все, включая уволенных — для отображения имён в задачах)
  const userMap = {};
  const activeUserIds = new Set();
  for (const u of users) {
    userMap[String(u.ID)] = [u.NAME, u.LAST_NAME].filter(Boolean).join(' ');
    if (u.ACTIVE === true || u.ACTIVE === 'Y') activeUserIds.add(String(u.ID));
  }

  // ── Глобальные KPI ────────────────────────────────────────────────────────
  const allForStats = [...activeTasks, ...recentClosed];

  const stats = {
    totalActive:  activeTasks.length,
    createdToday: allForStats.filter(t => t.createdDate && t.createdDate >= todayStr).length,
    closedLast7d: recentClosed.filter(t => t.closedDate && new Date(t.closedDate) >= d7ago).length,
    overdue:      activeTasks.filter(t => t.deadline && new Date(t.deadline) < now).length,
    stale:        activeTasks.filter(t => t.changedDate && new Date(t.changedDate) < d14ago).length,
    noDeadline:   activeTasks.filter(t => !t.deadline).length,
  };

  // ── Распределение по статусам ─────────────────────────────────────────────
  const byStatus = { '1': 0, '2': 0, '3': 0, '4': 0 };
  for (const t of activeTasks) {
    const s = String(t.status);
    if (s in byStatus) byStatus[s]++;
  }

  // ── По исполнителю ────────────────────────────────────────────────────────
  const byUser = {};

  const ensureUser = (uid) => {
    if (!byUser[uid]) {
      byUser[uid] = {
        name: userMap[uid] || `Пользователь #${uid}`,
        active: 0, overdue: 0, noDeadline: 0, stale: 0,
        closedLast30d: 0, closeTimes: [],
      };
    }
  };

  for (const t of activeTasks) {
    const uid = String(t.responsibleId || '0');
    ensureUser(uid);
    byUser[uid].active++;
    if (t.deadline && new Date(t.deadline) < now)       byUser[uid].overdue++;
    if (!t.deadline)                                     byUser[uid].noDeadline++;
    if (t.changedDate && new Date(t.changedDate) < d14ago) byUser[uid].stale++;
  }

  for (const t of recentClosed) {
    const uid = String(t.responsibleId || '0');
    ensureUser(uid);
    byUser[uid].closedLast30d++;
    if (t.createdDate && t.closedDate) {
      const days = (new Date(t.closedDate) - new Date(t.createdDate)) / 86400000;
      if (days >= 0 && days < 365) byUser[uid].closeTimes.push(days);
    }
  }

  for (const uid of Object.keys(byUser)) {
    const ct = byUser[uid].closeTimes;
    byUser[uid].avgCloseDays = ct.length
      ? Math.round(ct.reduce((a, b) => a + b, 0) / ct.length)
      : null;
    delete byUser[uid].closeTimes;
  }

  // ── График активности за 30 дней ──────────────────────────────────────────
  const activityByDay = [];
  for (let i = 29; i >= 0; i--) {
    const ds = new Date(nowTs - i * 86400000).toISOString().slice(0, 10);
    activityByDay.push({
      date:    ds,
      created: allForStats.filter(t => t.createdDate && t.createdDate.slice(0, 10) === ds).length,
      closed:  recentClosed.filter(t => t.closedDate  && t.closedDate.slice(0, 10)  === ds).length,
    });
  }

  // ── Просроченные (сортировка: давность просрочки убыв.) ───────────────────
  const overdueList = activeTasks
    .filter(t => t.deadline && new Date(t.deadline) < now)
    .map(t => ({
      ...t,
      overdueDays: Math.floor((nowTs - new Date(t.deadline).getTime()) / 86400000),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays);

  // ── Зависшие (нет активности 14+ дней) ───────────────────────────────────
  const staleList = activeTasks
    .filter(t => t.changedDate && new Date(t.changedDate) < d14ago)
    .map(t => ({
      ...t,
      staleDays: Math.floor((nowTs - new Date(t.changedDate).getTime()) / 86400000),
    }))
    .sort((a, b) => b.staleDays - a.staleDays);

  const data = {
    activeTasks,
    recentClosed,
    userMap,
    activeUserIds: [...activeUserIds],
    stats,
    byStatus,
    byUser,
    activityByDay,
    overdueList,
    staleList,
    fetchedAt: now.toISOString(),
    b24Url: B24_URL,
  };

  cacheSet('tasks_main', data);
  return data;
}

module.exports = { fetchTasksData, cacheInvalidateTasks };
