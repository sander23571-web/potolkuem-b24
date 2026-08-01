'use strict';
/**
 * nav.js — единая панель переходов между всеми дашбордами report-app.
 *
 * Раньше каждый render-*.js собирал свой собственный набор ссылок вручную —
 * набор расходился (где-то не было ссылки на Склад, где-то — на SMM/Задачи).
 * Теперь список ссылок один, meняется в одном месте.
 */
const NAV_ITEMS = [
  { key: 'report',    label: 'Выставки',  href: '/report' },
  { key: 'compare',   label: 'Сравнение', href: '/report/compare' },
  { key: 'marketing', label: 'Маркетинг', href: '/report/marketing' },
  { key: 'expenses',  label: 'Расходы',   href: '/report/marketing/expenses', directorOnly: true, orange: true },
  { key: 'warehouse', label: 'Склад',     href: '/report/warehouse' },
  { key: 'tasks',     label: 'Задачи',    href: '/tasks' },
  { key: 'social',    label: 'SMM',       href: '/social' },
];

function renderNav(active, isDirector) {
  return NAV_ITEMS
    .filter(item => !item.directorOnly || isDirector)
    .map(item => {
      const isActive = item.key === active;
      const cls = 'nav-btn' + (isActive ? ' active' : '');
      const style = item.orange && !isActive ? ' style="border-color:var(--orange);color:var(--orange)"' : '';
      return `<a class="${cls}" href="${item.href}"${style}>${item.label}</a>`;
    })
    .join('\n    ');
}

module.exports = { renderNav };
