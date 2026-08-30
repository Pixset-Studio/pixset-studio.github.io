/* Pixset Studio — общий скрипт сайта: выбор темы и мобильное меню.
 *
 * Тему держим в localStorage и ставим атрибутом на <html>. Чтобы страница не
 * мигала чужим оформлением до загрузки этого файла, атрибут выставляет
 * крошечный инлайн-скрипт в <head> каждой страницы; здесь — только UI выбора.
 */
(function () {
  'use strict';

  var KEY = 'pixsetTheme';
  var OWN_KEY = 'pixsetOwnsBB';   // кэш ответа сервера: есть ли лицензия
  var THEMES = [
    { id: 'industrial', name: 'Индустриальная', hint: 'жёлтая лента, крупный шрифт' },
    { id: 'arcade',     name: 'Аркадная',       hint: 'пиксельный терминал' },
    { id: 'minimal',    name: 'Минимализм',     hint: 'чёрный лист и золотая линия' },
    { id: 'byteblaster', name: 'Byte Blaster', hint: 'неон игры — для владельцев',
      needs: 'byte-blaster', buy: '/byte-blaster/buy/' },
  ];

  /* ── Кто открыл тему игры ───────────────────────────────────────────────
     Ответ сервера кэшируется, потому что тема ставится ДО первой отрисовки:
     ждать сетевого запроса нельзя, иначе страница мигнёт чужим оформлением.
     Кэш живёт сутки и обновляется в фоне при каждой загрузке страницы.

     Это подарок, а не платный контент: тему можно «включить» правкой
     localStorage, и это осознанно — за ней не стоит ничего, кроме внешнего
     вида. Проверка нужна, чтобы не предлагать её тем, у кого игры нет. */
  var API = 'https://zyjhvuhovimorpokiwty.supabase.co';
  var PUBKEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';
  var OWN_TTL = 24 * 60 * 60 * 1000;

  function ownsCached() {
    try {
      var v = JSON.parse(localStorage.getItem(OWN_KEY) || 'null');
      return (v && typeof v.own === 'boolean') ? v.own : false;
    } catch (e) { return false; }
  }
  function rememberOwns(own) {
    try { localStorage.setItem(OWN_KEY, JSON.stringify({ own: !!own, at: Date.now() })); } catch (e) {}
  }
  function ownsFresh() {
    try {
      var v = JSON.parse(localStorage.getItem(OWN_KEY) || 'null');
      return !!v && (Date.now() - (v.at || 0)) < OWN_TTL;
    } catch (e) { return false; }
  }

  /** Токен доступа лежит там же, где его держит supabase-js на страницах аккаунта. */
  function accessToken() {
    try {
      var raw = localStorage.getItem('sb-zyjhvuhovimorpokiwty-auth-token');
      if (!raw) return null;
      if (raw.indexOf('base64-') === 0) raw = decodeURIComponent(escape(atob(raw.slice(7))));
      var s = JSON.parse(raw);
      if (s && s.expires_at && s.expires_at * 1000 < Date.now()) return null;
      return (s && s.access_token) || null;
    } catch (e) { return null; }
  }

  /** Спрашивает сервер и обновляет кэш. Молча ничего не делает без входа. */
  function refreshOwnership(done) {
    var token = accessToken();
    if (!token) { rememberOwns(false); if (done) done(false); return; }
    fetch(API + '/rest/v1/my_entitlements?select=game_slug', {
      headers: { apikey: PUBKEY, Authorization: 'Bearer ' + token },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!rows) return;                      // сервер отказал — кэш не трогаем
        var own = rows.some(function (e) { return e.game_slug === 'byte-blaster'; });
        rememberOwns(own);
        if (done) done(own);
      })
      .catch(function () { /* нет сети — остаёмся на прошлом ответе */ });
  }

  function unlocked(theme) { return !theme.needs || ownsCached(); }

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    var found = THEMES.filter(function (x) { return x.id === t; })[0];
    return (found && unlocked(found)) ? t : 'industrial';
  }

  /**
   * `persist === false` — только переключить оформление, не трогая выбор
   * игрока. Так откатывается тема игры, когда права не подтвердились: если
   * дело было в истёкшей сессии или в отсутствии сети, выбор вернётся сам,
   * как только лицензия снова подтвердится.
   */
  function apply(id, persist) {
    document.documentElement.setAttribute('data-theme', id);
    if (persist !== false) { try { localStorage.setItem(KEY, id); } catch (e) {} }
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
      menu.appendChild(item);

      // Закрытая тема остаётся в списке: так видно, что она есть, и понятно,
      // как её открыть. Клик ведёт на страницу покупки, а не молча ничего.
      function paint() {
        var open = unlocked(t);
        if (open) { delete item.dataset.locked; } else { item.dataset.locked = '1'; }
        item.setAttribute('aria-pressed', String(open && t.id === current()));
        item.innerHTML = (open ? '' : '🔒 ') + t.name +
          '<small>' + (open ? t.hint : 'нужна лицензия Byte Blaster') + '</small>';
      }
      paint();
      item.onclick = function () {
        if (!unlocked(t)) { location.href = t.buy || '/store'; return; }
        apply(t.id); close();
      };
      // Ответ сервера приходит позже отрисовки меню — перекрашиваем пункт.
      item._repaint = paint;
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
    if (e.key !== KEY || !e.newValue) return;
    var t = THEMES.filter(function (x) { return x.id === e.newValue; })[0];
    if (!t || !unlocked(t)) return;    // закрытую тему из другой вкладки не берём
    apply(e.newValue, false);          // выбор там уже сохранён — не дублируем
  });

  /** Перерисовать пункты меню тем (после ответа сервера о лицензии). */
  function repaintPicker() {
    document.querySelectorAll('[data-theme-option]').forEach(function (b) {
      if (typeof b._repaint === 'function') b._repaint();
    });
  }

  function init() {
    buildPicker(document.querySelector('nav.main'));

    // Тему игры мог выставить кэш, устаревший после окончания сессии или
    // возврата покупки — сверяемся с сервером и, если права пропали, честно
    // возвращаем оформление по умолчанию.
    var wasBB = document.documentElement.getAttribute('data-theme') === 'byteblaster';
    if (wasBB && !ownsCached()) apply('industrial', false);
    if (!ownsFresh() || wasBB) {
      refreshOwnership(function (own) {
        repaintPicker();
        if (!own && document.documentElement.getAttribute('data-theme') === 'byteblaster') {
          apply('industrial', false);
        }
      });
    }

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

  // refreshOwnership открыт наружу: страница аккаунта зовёт его сразу после
  // входа и выхода, чтобы тема игры появлялась и пропадала без перезагрузки.
  window.PixsetTheme = {
    apply: apply, current: current, themes: THEMES,
    ownsBB: ownsCached, refreshOwnership: function (cb) {
      refreshOwnership(function (own) {
        repaintPicker();
        if (!own && document.documentElement.getAttribute('data-theme') === 'byteblaster') apply('industrial', false);
        if (cb) cb(own);
      });
    },
  };
})();
