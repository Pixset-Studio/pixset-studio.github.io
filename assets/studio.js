/* Pixset Studio — общий скрипт сайта: выбор темы и мобильное меню.
 *
 * Тему держим в localStorage и ставим атрибутом на <html>. Чтобы страница не
 * мигала чужим оформлением до загрузки этого файла, атрибут выставляет
 * крошечный инлайн-скрипт в <head> каждой страницы; здесь — только UI выбора.
 */
(function () {
  'use strict';

  var KEY = 'pixsetTheme';
  var THEMES = [
    { id: 'industrial', name: 'Индустриальная', hint: 'жёлтая лента, крупный шрифт' },
    { id: 'arcade',     name: 'Аркадная',       hint: 'пиксельный терминал' },
    { id: 'minimal',    name: 'Минимализм',     hint: 'чёрный лист и золотая линия' },
  ];

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    return THEMES.some(function (x) { return x.id === t; }) ? t : 'industrial';
  }

  function apply(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    // Другие вкладки того же сайта подхватят выбор через событие storage.
    document.querySelectorAll('[data-theme-option]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeOption === id));
    });
    var label = document.querySelector('[data-theme-label]');
    if (label) {
      var t = THEMES.find(function (x) { return x.id === id; });
      label.textContent = t ? t.name : id;
    }
  }

  /** Кнопка выбора темы. Ставится в шапку любой страницы одним вызовом. */
  function buildPicker(host) {
    if (!host) return;

    var box = document.createElement('div');
    box.className = 'theme-pick';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Тема';

    var menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');

    THEMES.forEach(function (t) {
      var item = document.createElement('button');
      item.type = 'button';
      item.dataset.themeOption = t.id;
      item.setAttribute('aria-pressed', String(t.id === current()));
      item.innerHTML = t.name + '<small>' + t.hint + '</small>';
      item.onclick = function () { apply(t.id); close(); };
      menu.appendChild(item);
    });

    function open() { menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    function close() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

    btn.onclick = function (e) {
      e.stopPropagation();
      menu.classList.contains('open') ? close() : open();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });

    box.appendChild(btn);
    box.appendChild(menu);
    host.appendChild(box);
  }

  // Выбор темы в одной вкладке должен догонять остальные открытые.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) apply(e.newValue);
  });

  function init() {
    buildPicker(document.querySelector('nav.main'));

    var burger = document.getElementById('burger');
    var mobile = document.getElementById('mobileNav');
    if (burger && mobile) {
      burger.onclick = function () { mobile.classList.toggle('open'); };
      mobile.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { mobile.classList.remove('open'); });
      });
    }

    // Если игрок вошёл, в шапке показываем ник вместо слова «Аккаунт».
    // Сессию читаем прямо из localStorage, чтобы не тянуть SDK на каждую страницу.
    try {
      var raw = localStorage.getItem('sb-zyjhvuhovimorpokiwty-auth-token');
      if (raw) {
        if (raw.indexOf('base64-') === 0) raw = decodeURIComponent(escape(atob(raw.slice(7))));
        var s = JSON.parse(raw);
        var alive = !s.expires_at || s.expires_at * 1000 > Date.now();
        var nick = alive && s.user && s.user.user_metadata && s.user.user_metadata.nickname;
        if (nick) {
          document.querySelectorAll('[data-account-label]').forEach(function (el) {
            el.textContent = nick;
          });
        }
      }
    } catch (e) { /* чужое или повреждённое значение — оставляем как есть */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }

  window.PixsetTheme = { apply: apply, current: current, themes: THEMES };
})();
