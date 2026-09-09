/* Pixset Studio — общий скрипт сайта: язык, выбор темы и мобильное меню.
 *
 * Тему и язык держим в localStorage и ставим атрибутами на <html>. Чтобы
 * страница не мигала чужим оформлением и чужим алфавитом до загрузки этого
 * файла, атрибуты выставляет крошечный инлайн-скрипт в <head> каждой
 * страницы; здесь — только переключатели.
 */
(function () {
  'use strict';

  var KEY = 'pixsetTheme';
  var OWN_KEY = 'pixsetOwnsBB';   // кэш ответа сервера: есть ли лицензия
  var THEMES = [
    { id: 'industrial', ru: 'Индустриальная', en: 'Industrial',
      hintRu: 'жёлтая лента, крупный шрифт', hintEn: 'hazard tape, big type' },
    { id: 'arcade', ru: 'Аркадная', en: 'Arcade',
      hintRu: 'пиксельный терминал', hintEn: 'pixel terminal' },
    { id: 'minimal', ru: 'Минимализм', en: 'Minimal',
      hintRu: 'чёрный лист и золотая линия', hintEn: 'black sheet, one gold line' },
    { id: 'byteblaster', ru: 'Byte Blaster', en: 'Byte Blaster',
      hintRu: 'неон игры — для владельцев', hintEn: 'the game’s neon — for owners',
      needs: 'byte-blaster', buy: '/byte-blaster/buy/' },
  ];

  /* ── Язык сайта ─────────────────────────────────────────────────────────
     Оба языка лежат в самой разметке (data-l="ru" / data-l="en"), лишний
     прячет CSS по атрибуту на <html> — ровно как на сайте Byte Blaster.
     Выбор: сохранённый → язык браузера → русский. */
  var LANG_KEY = 'pixsetSiteLang';
  // Сайт игры живёт на том же домене и помнит язык в своём ключе. Пишем оба и
  // читаем оба, чтобы выбор не сбрасывался при переходе студия ↔ Byte Blaster.
  var LANG_KEY_BB = 'bbSiteLang';

  function detectLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY) || localStorage.getItem(LANG_KEY_BB);
      if (saved === 'ru' || saved === 'en') return saved;
    } catch (e) {}
    var list = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i]).toLowerCase();
      if (/^(ru|uk|be|kk|ky|uz|tg|tk|az|hy|mo)\b/.test(l)) return 'ru';
      if (/^[a-z]{2}/.test(l)) return 'en';
    }
    return 'ru';
  }

  function lang() {
    var l = document.documentElement.getAttribute('data-site-lang');
    return l === 'en' ? 'en' : 'ru';
  }

  /** Короткий выбор строки по текущему языку — для текста, который рисует JS. */
  function L(ru, en) { return lang() === 'en' ? en : ru; }

  function applyLang(next, remember) {
    document.documentElement.setAttribute('data-site-lang', next);
    document.documentElement.setAttribute('lang', next);
    if (remember) {
      try {
        localStorage.setItem(LANG_KEY, next);
        localStorage.setItem(LANG_KEY_BB, next);
      } catch (e) {}
    }

    document.querySelectorAll('.langsw button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === next));
    });

    // Подсказки в полях и всплывающие title спрятать через CSS нельзя — они
    // ездят в data-атрибутах рядом с самим элементом.
    var pick = next === 'en' ? 'En' : 'Ru';
    document.querySelectorAll('[data-ph-ru]').forEach(function (el) {
      var v = el.dataset['ph' + pick];
      if (v != null) el.setAttribute('placeholder', v);
    });
    document.querySelectorAll('[data-tip-ru]').forEach(function (el) {
      var v = el.dataset['tip' + pick];
      if (v != null) el.setAttribute('title', v);
    });

    // Заголовок и описание живут вне <body>, спрятать их через CSS нельзя —
    // вторые варианты едут в data-атрибутах на <html>.
    var d = document.documentElement.dataset;
    var suffix = next === 'en' ? 'En' : 'Ru';
    if (d['title' + suffix]) document.title = d['title' + suffix];
    var meta = document.querySelector('meta[name="description"]');
    if (meta && d['desc' + suffix]) meta.setAttribute('content', d['desc' + suffix]);

    // Страницы, которые рисуют содержимое сами (магазин, аккаунт, профиль),
    // перерисовываются по этому событию — иначе половина текста осталась бы
    // на прежнем языке до перезагрузки.
    document.dispatchEvent(new CustomEvent('pixset:lang', { detail: next }));
  }

  /** Переключатель RU/EN. Ставится в шапку и в мобильное меню одним вызовом. */
  function buildLangSwitch(host, block) {
    if (!host) return;
    // Служебные страницы (админка) существуют только по-русски: кнопка там
    // означала бы перевод, которого нет.
    if (document.documentElement.hasAttribute('data-no-langsw')) return;
    var box = document.createElement('span');
    box.className = 'langsw' + (block ? ' wide' : '');
    ['ru', 'en'].forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = id;
      b.textContent = id.toUpperCase();
      b.setAttribute('aria-pressed', String(id === lang()));
      box.appendChild(b);
    });
    host.appendChild(box);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.langsw button') : null;
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    // Гасим страницу на мгновение: без этого текст «прыгает» с одного алфавита
    // на другой прямо под курсором.
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { applyLang(b.dataset.lang, true); return; }
    document.body.classList.remove('langswap');
    void document.body.offsetWidth;
    document.body.classList.add('langswap');
    setTimeout(function () { applyLang(b.dataset.lang, true); }, 130);
    setTimeout(function () { document.body.classList.remove('langswap'); }, 380);
  });

  // Выбор языка в одной вкладке догоняет остальные открытые.
  window.addEventListener('storage', function (e) {
    if (e.key !== LANG_KEY || (e.newValue !== 'ru' && e.newValue !== 'en')) return;
    applyLang(e.newValue, false);
  });

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
  function byId(id) { return THEMES.filter(function (x) { return x.id === id; })[0] || null; }

  /** Тема существует и открыта этому игроку. */
  function isOpen(id) {
    var t = byId(id);
    return !!t && unlocked(t);
  }

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    var found = byId(t);
    return (found && unlocked(found)) ? t : 'industrial';
  }

  /**
   * `persist === false` — только переключить оформление, не трогая выбор
   * игрока. Так откатывается тема игры, когда права не подтвердились: если
   * дело было в истёкшей сессии или в отсутствии сети, выбор вернётся сам,
   * как только лицензия снова подтвердится.
   *
   * Возвращает false, если тема закрыта или её вовсе нет.
   */
  function apply(id, persist) {
    // Проверка стоит здесь, а не только в меню шапки: закрытую тему не должен
    // включать НИКАКОЙ экран. Список тем в настройках аккаунта строился без
    // проверки прав и открывал оформление игры любому — теперь это невозможно,
    // откуда бы ни пришёл вызов (шапка, настройки, другая вкладка).
    if (!isOpen(id)) return false;
    document.documentElement.setAttribute('data-theme', id);
    if (persist !== false) { try { localStorage.setItem(KEY, id); } catch (e) {} }
    // Другие вкладки того же сайта подхватят выбор через событие storage.
    document.querySelectorAll('[data-theme-option]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeOption === id));
    });
    var label = document.querySelector('[data-theme-label]');
    if (label) {
      var t = byId(id);
      label.textContent = t ? themeName(t) : id;
    }
    return true;
  }

  function themeName(t) { return L(t.ru, t.en); }
  function themeHint(t) { return L(t.hintRu, t.hintEn); }

  /** Кнопка выбора темы. Ставится в шапку любой страницы одним вызовом. */
  function buildPicker(host) {
    if (!host) return;

    var box = document.createElement('div');
    box.className = 'theme-pick';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span data-l="ru">Тема</span><span data-l="en">Theme</span>';

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
        item.innerHTML = (open ? '' : '🔒 ') + themeName(t) + '<small>' +
          (open ? themeHint(t) : L('нужна лицензия Byte Blaster', 'requires a Byte Blaster licence')) +
          '</small>';
      }
      paint();
      // Меню собрано один раз, а язык меняется без перезагрузки — перерисуем.
      document.addEventListener('pixset:lang', paint);
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
    // Язык сначала: меню тем строится уже на нужном языке.
    applyLang(document.documentElement.getAttribute('data-site-lang') || detectLang(), false);
    buildLangSwitch(document.querySelector('nav.main'));
    buildLangSwitch(document.getElementById('mobileNav'), true);
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

  /* Язык наружу: страницы, которые строят содержимое из JS, берут строки
     через PixsetLang.L('по-русски', 'in English') и перерисовываются по
     событию pixset:lang. */
  window.PixsetLang = {
    now: lang, L: L, apply: function (id) { applyLang(id === 'en' ? 'en' : 'ru', true); },
  };

  // refreshOwnership открыт наружу: страница аккаунта зовёт его сразу после
  // входа и выхода, чтобы тема игры появлялась и пропадала без перезагрузки.
  window.PixsetTheme = {
    apply: apply, current: current, themes: THEMES,
    // isOpen открыт наружу, чтобы страницы не переизобретали правило доступа:
    // условие «нужна лицензия» живёт только здесь.
    isOpen: isOpen,
    ownsBB: ownsCached, refreshOwnership: function (cb) {
      refreshOwnership(function (own) {
        repaintPicker();
        if (!own && document.documentElement.getAttribute('data-theme') === 'byteblaster') apply('industrial', false);
        if (cb) cb(own);
      });
    },
  };
})();
