'use strict';
/**
 * bx-embed.js — фрагмент, вставляемый перед </body> на все дашборды.
 *
 * Внутри iframe Б24 личность пробрасывается через ?bxt=<token> в query-строке
 * (не cookie — cookie на чужом домене внутри iframe блокируется частью браузеров).
 * Скрипт перехватывает клики по внутренним <a href="/..."> и submit форм,
 * дописывая bxt перед навигацией, плюс держит iframe подогнанным по высоте
 * через BX24.fitWindow(). window.__withBxt — тот же хелпер для мест, где
 * навигация построена вручную в JS (см. render.js: select-переключатель, график).
 *
 * Если token пуст (зашли по Basic Auth напрямую, не из Б24) — фрагмент пустой.
 */
function bxBootstrap(token) {
  if (!token) return '';
  return `
<script src="https://api.bitrix24.com/api/v1/"></script>
<script>
(function () {
  window.__BXT__ = ${JSON.stringify(token)};

  function withToken(url) {
    if (!url || url.indexOf('bxt=') !== -1) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'bxt=' + encodeURIComponent(window.__BXT__);
  }
  window.__withBxt = withToken;

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="/"]');
    if (a) a.setAttribute('href', withToken(a.getAttribute('href')));
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (!form.querySelector('input[name="bxt"]')) {
      var inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = 'bxt';
      inp.value = window.__BXT__;
      form.appendChild(inp);
    }
  }, true);

  if (window.BX24) {
    BX24.init(function () {
      try { BX24.fitWindow(); } catch (e) {}
    });
    window.addEventListener('resize', function () {
      try { BX24.fitWindow(); } catch (e) {}
    });
  }
})();
</script>`;
}

module.exports = { bxBootstrap };
