/* Вики Pixset Studio — переключение языка.
 *
 * Страницы вики статические и собраны каждая сама по себе, поэтому логика
 * вынесена сюда: 19 копий одного обработчика разошлись бы при первой правке.
 * Сам выбор языка делает крошечный инлайн-скрипт в <head> — до первой
 * отрисовки, иначе страница мигнёт чужим алфавитом.
 *
 * Кнопки RU/EN строятся здесь же, а не лежат в разметке: так их не приходится
 * вставлять в каждую страницу руками. */
(function () {
  'use strict';

  var KEY = 'pixsetSiteLang';
  // Сайт Byte Blaster на том же домене помнит язык в своём ключе — пишем оба,
  // чтобы выбор пережил переход из вики в игру и обратно.
  var KEY_BB = 'bbSiteLang';

  function lang() {
    return document.documentElement.getAttribute('data-site-lang') === 'en' ? 'en' : 'ru';
  }

  function apply(next, remember) {
    document.documentElement.setAttribute('data-site-lang', next);
    document.documentElement.setAttribute('lang', next);
    if (remember) {
      try {
        localStorage.setItem(KEY, next);
        localStorage.setItem(KEY_BB, next);
      } catch (e) {}
    }

    document.querySelectorAll('.langsw button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === next));
    });

    // Заголовок и описание живут вне <body> — их вторые варианты едут в
    // data-атрибутах на <html>.
    var d = document.documentElement.dataset;
    var suffix = next === 'en' ? 'En' : 'Ru';
    if (d['title' + suffix]) document.title = d['title' + suffix];
    var meta = document.querySelector('meta[name="description"]');
    if (meta && d['desc' + suffix]) meta.setAttribute('content', d['desc' + suffix]);
  }

  function switcher(host, wrapInLi) {
    if (!host) return;
    var box = document.createElement('span');
    box.className = 'langsw';
    ['ru', 'en'].forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = id;
      b.textContent = id.toUpperCase();
      b.setAttribute('aria-pressed', String(id === lang()));
      box.appendChild(b);
    });
    if (wrapInLi) {
      var li = document.createElement('li');
      li.appendChild(box);
      host.appendChild(li);
    } else {
      host.appendChild(box);
    }
  }

  function init() {
    switcher(document.querySelector('nav .nav-links'), true);
    switcher(document.getElementById('mobileNav'), false);
    apply(lang(), false);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.langsw button') : null;
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { apply(b.dataset.lang, true); return; }
    // Гасим страницу на мгновение: без этого текст «прыгает» с одного алфавита
    // на другой прямо под курсором.
    document.body.classList.remove('langswap');
    void document.body.offsetWidth;
    document.body.classList.add('langswap');
    setTimeout(function () { apply(b.dataset.lang, true); }, 130);
    setTimeout(function () { document.body.classList.remove('langswap'); }, 380);
  });

  // Выбор языка в одной вкладке догоняет остальные открытые — в том числе
  // страницы основного сайта: ключ у них общий.
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || (e.newValue !== 'ru' && e.newValue !== 'en')) return;
    apply(e.newValue, false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
