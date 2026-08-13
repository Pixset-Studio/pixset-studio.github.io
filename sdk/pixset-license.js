// Pixset License SDK — проверка лицензии в играх студии.
// Подключается в Byte Blaster, Hearthhold и любую следующую игру.
//
// Главный принцип: игра запускается БЕЗ интернета. Токен подписан
// ключом сервера, клиент проверяет подпись локально. Сеть нужна только
// чтобы продлить срок действия токена.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

// Публичный ключ подписи (SPKI, base64). Приватная половина — только на сервере.
const PUBLIC_KEY_SPKI = 'MCowBQYDK2VwAyEAobGRyYmKEjjmy8rrD/2oWlMZASY8wWeSDd7ipL1cvFs=';

// Сколько дней играем после истечения токена, если сеть недоступна.
// Не блокируем сразу: упавший сервер не должен ломать купленную игру.
const OFFLINE_GRACE_DAYS = 7;

const STORAGE_KEY = 'pixset.license';
const CLOCK_KEY = 'pixset.clock';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const b64decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ── Хранилище ────────────────────────────────────────────────────────────
   По умолчанию localStorage. В Electron передай адаптер поверх safeStorage,
   в Capacitor — поверх Preferences, чтобы токен не лежал открытым текстом. */
let storage = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
};

export function setStorage(adapter) { storage = adapter; }

/* ── Защита от перевода часов ─────────────────────────────────────────────
   Игрок может отмотать системное время назад, чтобы «оживить» истёкший
   токен. Запоминаем максимальное виденное время и не верим меньшему. */
function now() {
  const system = Math.floor(Date.now() / 1000);
  const seen = parseInt(storage.get(CLOCK_KEY) || '0', 10);
  if (system > seen) {
    storage.set(CLOCK_KEY, String(system));
    return system;
  }
  return seen;
}

/* ── Проверка подписи ─────────────────────────────────────────────────── */
let cachedKey = null;

async function publicKey() {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      'spki', b64decode(PUBLIC_KEY_SPKI), { name: 'Ed25519' }, false, ['verify'],
    );
  }
  return cachedKey;
}

async function verify(token) {
  const payloadBytes = b64decode(token.payload);
  const ok = await crypto.subtle.verify(
    'Ed25519', await publicKey(), b64decode(token.signature), payloadBytes,
  );
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(payloadBytes));
}

/* ── Состояние ────────────────────────────────────────────────────────── */
let entitlements = null;   // расшифрованный payload или null

function loadCached() {
  const raw = storage.get(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Загружает лицензию из локального хранилища и проверяет подпись.
 * Вызывать при старте игры — до любого обращения к сети.
 */
export async function initLicense() {
  const token = loadCached();
  if (!token) { entitlements = null; return null; }

  const payload = await verify(token);
  if (!payload) {
    // Подпись не сошлась — токен подделан или повреждён.
    storage.remove(STORAGE_KEY);
    entitlements = null;
    return null;
  }

  const graceUntil = payload.expires_at + OFFLINE_GRACE_DAYS * 86400;
  if (now() > graceUntil) { entitlements = null; return null; }

  entitlements = payload;
  return payload;
}

/** Есть ли действующая лицензия на игру. Работает офлайн. */
export function hasGame(slug) {
  return Boolean(entitlements?.games?.includes(slug));
}

/** Токен ещё жив, но пора обновиться — покажи мягкое предупреждение. */
export function needsRefresh() {
  return Boolean(entitlements) && now() > entitlements.expires_at;
}

export function getNickname() { return entitlements?.nickname ?? null; }

/* ── Сеть ─────────────────────────────────────────────────────────────── */
export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return refreshLicense();
}

export async function logout() {
  await supabase.auth.signOut();
  storage.remove(STORAGE_KEY);
  entitlements = null;
}

/**
 * Запрашивает свежий токен с сервера и сохраняет его.
 * Вызывать в фоне при старте, если есть сеть — тогда активный игрок
 * никогда не увидит запрос на повторный вход.
 */
export async function refreshLicense({ deviceHash, platform, label } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/entitlements`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_hash: deviceHash ?? deviceFingerprint(),
      platform: platform ?? detectPlatform(),
      label,
    }),
  });

  if (!res.ok) throw new Error(`entitlements ${res.status}`);

  const token = await res.json();
  const payload = await verify(token);
  if (!payload) throw new Error('сервер прислал токен с неверной подписью');

  storage.set(STORAGE_KEY, JSON.stringify(token));
  entitlements = payload;
  return payload;
}

/** Обновление в фоне: нет сети — молча живём на локальном токене. */
export async function refreshQuietly(opts) {
  try { return await refreshLicense(opts); }
  catch { return null; }
}

/* ── Вспомогательное ──────────────────────────────────────────────────── */
function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/Electron/i.test(ua)) return 'windows';
  return 'web';
}

/** Анонимный отпечаток устройства. Никаких аппаратных идентификаторов. */
function deviceFingerprint() {
  let id = storage.get('pixset.device');
  if (!id) {
    id = crypto.randomUUID();
    storage.set('pixset.device', id);
  }
  return id;
}
