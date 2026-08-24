// Единое форматирование денежных сумм для всех дашбордов — округление до тысяч, "ТР" (тысяч рублей).
// Просьба заказчика 24.08.2026: "1 234 567 ₽" -> "1 235 ТР". Только для денег — счётчики
// (подписчики/клики/задачи и т.п.) через эту функцию не проводить, см. talk/CLAUDE.md.
function fmtRub(n) {
  const v = Math.round((n || 0) / 1000);
  return v.toLocaleString('ru-RU') + ' ТР';
}

// Тот же формат, но с явным знаком +/− спереди (для дельт П/У, разниц).
function fmtRubSigned(n) {
  const v = Math.round((n || 0) / 1000);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + Math.abs(v).toLocaleString('ru-RU') + ' ТР';
}

// Исходник для встраивания в клиентские <script>-блоки (Chart.js tooltips и т.п.),
// где Node-модуль недоступен — та же логика, одна строка JS.
const fmtRubClientSrc = `function fmtRub(n){var v=Math.round((n||0)/1000);return v.toLocaleString('ru-RU')+' ТР';}`;

module.exports = { fmtRub, fmtRubSigned, fmtRubClientSrc };
