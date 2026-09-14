'use strict';
/**
 * nav.js — единая панель переходов между всеми дашбордами report-app.
 *
 * Раньше каждый render-*.js собирал свой собственный набор ссылок вручную —
 * набор расходился (где-то не было ссылки на Склад, где-то — на SMM/Задачи).
 * Теперь список ссылок один, meняется в одном месте.
 */
const { FINANCE_VIEWER_UIDS } = require('./bx-auth');

const NAV_ITEMS = [
  { key: 'report',    label: 'Выставки',  href: '/report' },
  { key: 'compare',   label: 'Сравнение', href: '/report/compare' },
  { key: 'marketing', label: 'Маркетинг', href: '/report/marketing' },
  { key: 'expenses',  label: 'Расходы на маркетинг', href: '/report/marketing/expenses', directorOnly: true, orange: true },
  { key: 'expensesAll', label: 'Все расходы', href: '/report/expenses', financeOnly: true, orange: true },
  { key: 'warehouse', label: 'Склад',     href: '/report/warehouse' },
  { key: 'realization', label: 'Реализация', href: '/report/realization' },
  { key: 'realizationLegacy', label: 'Реализация (до склада)', href: '/report/realization-legacy' },
  { key: 'creative',  label: 'Креатив',    href: '/report/creative' },
  { key: 'tasks',     label: 'Активность', href: '/tasks' },
  { key: 'social',    label: 'SMM',       href: '/social' },
  { key: 'nas',       label: 'NAS',       href: '/report/nas' },
];

// isFinance — отдельный от isDirector флаг: доступ к «Все расходы» уже, чем «руководство»
// (только Анна Тимуровна + технический admin-логин, см. bx-auth.js requireFinanceViewer) —
// специально НЕ переиспользует BX_DIRECTOR_IDS/isDirector, у которого шире список (18,116,12,134).
function renderNav(active, isDirector, isFinance) {
  return NAV_ITEMS
    .filter(item => (!item.directorOnly || isDirector) && (!item.financeOnly || isFinance))
    .map(item => {
      const isActive = item.key === active;
      const cls = 'nav-btn' + (isActive ? ' active' : '');
      const style = item.orange && !isActive ? ' style="border-color:var(--orange);color:var(--orange)"' : '';
      return `<a class="${cls}" href="${item.href}"${style}>${item.label}</a>`;
    })
    .join('\n    ');
}

// Доступ к «Все расходы»: Анна Тимуровна (Bitrix ID=18) + владелец (ID=134), через встроенное
// приложение, или технический admin-логин report-app (Basic Auth, isDirector=true без uid).
// Список uid — из bx-auth.js (FINANCE_VIEWER_UIDS), единственный источник правды: раньше здесь
// была своя копия списка, разошедшаяся с requireFinanceViewer — владелец видел бы страницу по
// прямой ссылке, но не пункт меню (найдено 03.09.2026).
function isFinanceViewer(viewer) {
  if (!viewer) return false;
  if (viewer.uid) return FINANCE_VIEWER_UIDS.includes(viewer.uid);
  return !!viewer.isDirector;
}

module.exports = { renderNav, isFinanceViewer };
