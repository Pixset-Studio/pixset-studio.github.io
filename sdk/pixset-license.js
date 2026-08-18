// Pixset License SDK — проверка лицензии в играх студии.
// Подключается как обычный <script> в Byte Blaster, Hearthhold и далее.
//
// Главный принцип: игра запускается БЕЗ интернета. Токен подписан ключом
// сервера, подпись проверяется локально через Web Crypto. Сеть нужна только
// чтобы продлить срок действия токена.
//
// Никаких внешних зависимостей: supabase-js тянется с CDN и в офлайне
// (Electron, Android в самолётном режиме) просто не загрузился бы.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

  // Публичный ключ подписи (SPKI, base64). Приватная половина — только на сервере.
  const PUBLIC_KEY_SPKI = 'MCowBQYDK2VwAyEAobGRyYmKEjjmy8rrD/2oWlMZASY8wWeSDd7ipL1cvFs=';

  // Сколько дней играем после истечения токена, если сеть недоступна.
  // Упавший сервер не должен ломать честно купленную игру.
  const OFFLINE_GRACE_DAYS = 7;

  const K_TOKEN   = 'pixset.license';
  const K_SESSION = 'pixset.session';
  const K_CLOCK   = 'pixset.clock';
  const K_DEVICE  = 'pixset.device';

  const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /* ── Хранилище ─────────────────────────────────────────────────────────
     По умолчанию localStorage. Оболочка может подменить на защищённое
     (Electron safeStorage, Capacitor Preferences) через License.setStorage. */
  let store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ── Часы ──────────────────────────────────────────────────────────────
     Игрок может отмотать системное время назад, чтобы «оживить» истёкший
     токен. Запоминаем максимальное виденное время и не верим меньшему. */
  function now() {
    const sys = Math.floor(Date.now() / 1000);
    const seen = parseInt(store.get(K_CLOCK) || '0', 10);
    if (sys > seen) { store.set(K_CLOCK, String(sys)); return sys; }
    return seen;
  }

  /* ── Подпись ───────────────────────────────────────────────────────── */
  let keyPromise = null;
  function publicKey() {
    if (!keyPromise) {
      keyPromise = crypto.subtle.importKey(
        'spki', dec(PUBLIC_KEY_SPKI), { name: 'Ed25519' }, false, ['verify'],
      );
    }
    return keyPromise;
  }

  async function verify(token) {
    if (!token || !token.payload || !token.signature) return null;
    try {
      const bytes = dec(token.payload);
      const ok = await crypto.subtle.verify(
        'Ed25519', await publicKey(), dec(token.signature), bytes,
      );
      if (!ok) return null;
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;   // битый токен или среда без Ed25519
    }
  }

  /* ── Состояние ─────────────────────────────────────────────────────── */
  let ent = null;       // проверенный payload или null
  let ready = false;    // init уже отработал

  function readJSON(key) {
    const raw = store.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** Загружает локальный токен и проверяет подпись. Вызывать на старте игры. */
  async function init() {
    const token = readJSON(K_TOKEN);
    ent = null;

    if (token) {
      const payload = await verify(token);
      if (!payload) {
        store.remove(K_TOKEN);           // подделан или повреждён
      } else if (now() <= payload.expires_at + OFFLINE_GRACE_DAYS * 86400) {
        ent = payload;
      }
    }

    ready = true;
    return ent;
  }

  /* ── Запросы к серверу ─────────────────────────────────────────────── */
  function authFetch(path, body, token) {
    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(SUPABASE_URL + path, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
  }

  async function login(email, password) {
    const res = await authFetch('/auth/v1/token?grant_type=password', { email, password });
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(data.error_description || data.msg || data.message || 'login_failed');
      e.code = data.error_code || data.error;
      throw e;
    }
    store.set(K_SESSION, JSON.stringify(data));
    return refresh();
  }

  function logout() {
    store.remove(K_SESSION);
    store.remove(K_TOKEN);
    ent = null;
  }

  function session() { return readJSON(K_SESSION); }
  function loggedIn() { return !!session(); }

  /** Обновляет access_token, если он протух. */
  async function accessToken() {
    const s = session();
    if (!s) return null;
    const alive = s.expires_at && s.expires_at - 60 > Math.floor(Date.now() / 1000);
    if (alive) return s.access_token;

    const res = await authFetch('/auth/v1/token?grant_type=refresh_token',
      { refresh_token: s.refresh_token });
    if (!res.ok) { store.remove(K_SESSION); return null; }
    const data = await res.json();
    store.set(K_SESSION, JSON.stringify(data));
    return data.access_token;
  }

  /**
   * Забирает свежий подписанный токен прав и сохраняет его.
   * Вызывать в фоне при старте: у активного игрока срок никогда не истечёт.
   */
  async function refresh() {
    const token = await accessToken();
    if (!token) return null;

    const res = await authFetch('/functions/v1/entitlements', {
      device_hash: deviceId(),
      platform: platform(),
      label: label(),
    }, token);
    if (!res.ok) throw new Error('entitlements_' + res.status);

    const signed = await res.json();
    const payload = await verify(signed);
    if (!payload) throw new Error('bad_signature');

    store.set(K_TOKEN, JSON.stringify(signed));
    ent = payload;
    ready = true;
    return payload;
  }

  /** Тихое обновление: нет сети — молча живём на локальном токене. */
  async function refreshQuietly() {
    try { return await refresh(); } catch (e) { return null; }
  }

  /* ── Ответы игре ───────────────────────────────────────────────────── */
  function hasGame(slug) {
    return !!(ent && ent.games && ent.games.indexOf(slug) !== -1);
  }
  /** Токен ещё в силе, но пора обновиться — повод для мягкого предупреждения. */
  function stale() { return !!ent && now() > ent.expires_at; }
  function nickname() { return ent && ent.nickname ? ent.nickname : null; }
  function isReady() { return ready; }

  /* ── Вспомогательное ───────────────────────────────────────────────── */
  function platform() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/Electron/i.test(ua)) return 'windows';
    return 'web';
  }
  function label() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/Electron/i.test(ua)) return 'PC (Windows)';
    return 'Браузер';
  }
  /** Анонимный отпечаток. Никаких аппаратных идентификаторов. */
  function deviceId() {
    let id = store.get(K_DEVICE);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : String(Date.now()) + Math.random().toString(16).slice(2));
      store.set(K_DEVICE, id);
    }
    return id;
  }

  window.License = {
    init, login, logout, refresh, refreshQuietly,
    hasGame, stale, nickname, loggedIn, isReady,
    setStorage(adapter) { store = adapter; },
    get storeUrl() { return 'https://pixset-studio.github.io/store'; },
  };
})();
