/* Pixset Studio — кнопка «мой аккаунт» в шапке.
 *
 * Вошедший игрок видит в шапке себя: аватар слева, ник, а справа — иконки
 * бейджей, если они есть. Ровно так же кнопка аккаунта выглядит в самой игре,
 * и сайт не должен от неё отличаться.
 *
 * Файл общий для сайта студии и сайта Byte Blaster (его раскладывает
 * sync-sdk.js), поэтому здесь нет ни импортов, ни supabase-js: шапка есть на
 * КАЖДОЙ странице, включая вики и магазин, а тянуть ради неё SDK на все
 * страницы — лишние сотни килобайт.
 *
 * Данные берутся так:
 *   ник      — из сессии в localStorage, её кладёт туда supabase-js;
 *   аватар   — из таблицы профилей одним GET (профили открыты на чтение);
 *   бейджи   — из витрины nick_badges, там уже только те, что «висят в нике».
 * Ответ кладётся в localStorage, поэтому на следующих страницах кнопка
 * появляется сразу, без ожидания сети.
 */
(function () {
  'use strict';

  var API = 'https://zyjhvuhovimorpokiwty.supabase.co';
  var PUBKEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';
  var SESSION_KEY = 'sb-zyjhvuhovimorpokiwty-auth-token';
  var CACHE_KEY = 'pixsetMe';
  var TTL = 6 * 60 * 60 * 1000;          // полсуток: аватар меняют нечасто

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function lang() {
    return document.documentElement.getAttribute('data-site-lang') === 'en' ? 'en' : 'ru';
  }

  /** Живая сессия из хранилища supabase-js: {id, nick} или null. */
  function session() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      if (raw.indexOf('base64-') === 0) raw = decodeURIComponent(escape(atob(raw.slice(7))));
      var s = JSON.parse(raw);
      if (s && s.expires_at && s.expires_at * 1000 < Date.now()) return null;
      if (!s || !s.user) return null;
      return {
        id: s.user.id,
        nick: (s.user.user_metadata && s.user.user_metadata.nickname) || '',
      };
    } catch (e) { return null; }
  }

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }
  function remember(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* переполнено */ }
  }
  function forget() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  /* ── Отрисовка ────────────────────────────────────────────────────────── */

  var IMG_RE = /^data:image\/(png|jpeg|webp);base64,/;

  function avatarHtml(me) {
    if (IMG_RE.test(me.avatar || '')) {
      return '<img class="me-ava" alt="" src="' + esc(me.avatar) + '">';
    }
    // Без картинки — первая буква ника: кнопка всё равно должна читаться как
    // «это ты», а не как пустой квадрат.
    return '<i class="me-ava">' + esc((me.nick || '?').charAt(0).toUpperCase()) + '</i>';
  }

  function badgesHtml(me) {
    var list = me.badges || [];
    if (!list.length) return '';
    return '<span class="nbdgs">' + list.map(function (b) {
      var title = (lang() === 'en' ? b.title_en : b.title_ru) || b.slug || '';
      var inner = IMG_RE.test(b.icon_url || '')
        ? '<img alt="' + esc(title) + '" src="' + esc(b.icon_url) + '">'
        : '<i style="background:' + esc(b.color || '#ffd400') + '"></i>';
      return '<span class="nbdg" title="' + esc(title) + '">' + inner + '</span>';
    }).join('') + '</span>';
  }

  /**
   * Куда рисовать. У сайта студии внутри ссылки стоит метка
   * data-account-label, у сайта игры её нет — там берём саму ссылку из шапки
   * и из мобильного меню.
   */
  function links() {
    var marked = document.querySelectorAll('[data-account-label]');
    if (marked.length) return Array.prototype.slice.call(marked);
    return Array.prototype.slice.call(document.querySelectorAll(
      'nav.main a[href*="/account"], .nav-links a[href*="/account"], '
      + '#mobileNav a[href*="/account"], .mobile-nav a[href*="/account"]'));
  }

  function paint() {
    var me = cached();
    links().forEach(function (el) {
      // Исходную надпись («Аккаунт» / «Account» обоими языками) сохраняем:
      // после выхода из аккаунта её нужно вернуть на место.
      if (el.dataset.meOriginal == null) el.dataset.meOriginal = el.innerHTML;

      if (!me || !me.nick) {
        if (el.dataset.mePainted) {
          el.innerHTML = el.dataset.meOriginal;
          delete el.dataset.mePainted;
        }
        return;
      }
      var html = '<span class="me">' + avatarHtml(me)
        + '<span class="me-nick">' + esc(me.nick) + '</span>'
        + badgesHtml(me) + '</span>';
      if (el.innerHTML === html) return;
      el.innerHTML = html;
      el.dataset.mePainted = '1';
    });
  }

  /* ── Данные ───────────────────────────────────────────────────────────── */

  function get(path) {
    return fetch(API + '/rest/v1/' + path, { headers: { apikey: PUBKEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /** Спрашивает сервер и перерисовывает кнопку. */
  function refresh() {
    var s = session();
    if (!s) { forget(); paint(); return Promise.resolve(null); }

    return Promise.all([
      get('profiles?select=nickname,avatar_url&id=eq.' + encodeURIComponent(s.id)),
      s.nick
        // Порядок задаёт игрок (nick_order): главный бейдж — ближе к нику.
        ? get('nick_badges?select=slug,title_ru,title_en,icon_url,color&nickname=eq.'
              + encodeURIComponent(s.nick)
              + '&order=nick_order.asc,nick_forced.desc,granted_at.asc')
        : Promise.resolve([]),
    ]).then(function (res) {
      var prof = (res[0] && res[0][0]) || null;
      if (!prof) return null;                    // сервер не ответил — оставляем кэш
      var me = {
        id: s.id,
        nick: prof.nickname || s.nick,
        avatar: prof.avatar_url || '',
        badges: res[1] || [],
        at: Date.now(),
      };
      remember(me);
      paint();
      return me;
    });
  }

  function init() {
    var s = session();
    var have = cached();
    // Кэш от другого аккаунта — не наш: чужой аватар в шапке хуже, чем никакого.
    if (have && (!s || have.id !== s.id)) { forget(); have = null; }
    paint();
    if (!s) return;
    if (!have || Date.now() - (have.at || 0) > TTL) refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }

  // Подсказки у иконок бейджей зависят от языка страницы.
  document.addEventListener('pixset:lang', paint);
  // Вход или выход в соседней вкладке — кнопка догоняет.
  window.addEventListener('storage', function (e) {
    if (e.key === SESSION_KEY) refresh();
  });

  window.PixsetMe = { refresh: refresh, paint: paint, forget: forget };
})();
