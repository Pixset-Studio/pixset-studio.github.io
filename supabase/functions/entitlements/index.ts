// Выдаёт игре подписанный список лицензий.
// Игра хранит токен локально и проверяет его подписью — интернет нужен
// только чтобы продлить срок, а не чтобы запустить игру.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Три месяца: игрок, который запускает игру хотя бы раз в сезон, вообще не
// заметит, что права когда-то надо продлевать.
const TOKEN_TTL_DAYS = 90;

// apikey и x-client-info браузер запрашивает в preflight, потому что их
// добавляет клиент. Без них в списке preflight отклоняется, и запрос до функции
// не доходит вовсе — в игре это выглядит как «нет связи с сервером».
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

/**
 * Приватный ключ лежит в секретах проекта и никогда не покидает сервер.
 *
 * Значение чистим перед разбором: при копировании в секрет туда легко попадают
 * перенос строки, кавычки, пробелы или подпись вида «PRIVATE(pkcs8-b64)=».
 * Раньше такой ключ валил функцию невнятным «Failed to decode base64», а игрок
 * видел лишь «что-то пошло не так» при входе.
 */
function cleanKey(raw: string) {
  return raw
    .replace(/^[A-Za-z()\-_. ]*=\s*/, '')   // подпись перед значением
    .replace(/-----[A-Z ]+-----/g, '')      // обрамление PEM
    .replace(/["'\s]/g, '');                // кавычки, переносы, пробелы
}

async function signingKey() {
  const raw = Deno.env.get('LICENSE_PRIVATE_KEY');
  if (!raw) throw new Error('LICENSE_PRIVATE_KEY не задан');

  const cleaned = cleanKey(raw);
  let bytes: Uint8Array;
  try {
    bytes = b64.decode(cleaned);
  } catch {
    throw new Error(
      'LICENSE_PRIVATE_KEY не является base64. Ожидается ключ pkcs8 одной строкой, ' +
      'без подписи и переносов.',
    );
  }

  // Ed25519 pkcs8 — ровно 48 байт. Проверяем заранее, чтобы ошибка была
  // понятной, а не «operation error» из глубины Web Crypto.
  if (bytes.length !== 48) {
    throw new Error('LICENSE_PRIVATE_KEY: ожидалось 48 байт pkcs8, получено ' + bytes.length);
  }

  return await crypto.subtle.importKey(
    'pkcs8', bytes, { name: 'Ed25519' }, false, ['sign'],
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'invalid_token' }, 401);

  let body: { device_hash?: string; platform?: string; label?: string } = {};
  try { body = await req.json(); } catch { /* тело необязательно */ }

  // Отметка устройства — для страницы профиля и защиты от массового шаринга.
  if (body.device_hash) {
    await supabase.from('devices').upsert({
      user_id: user.id,
      device_hash: body.device_hash,
      platform: body.platform ?? null,
      label: body.label ?? null,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,device_hash' });
  }

  const { data: licenses, error: licError } = await supabase
    .from('licenses')
    .select('game_slug, source, granted_at')
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (licError) return json({ error: 'db_error' }, 500);

  // Профиль и устройства — чтобы игра показывала полноценную карточку игрока
  // и в офлайне: всё это уезжает в подписанный токен.
  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname, created_at, country')
    .eq('id', user.id)
    .maybeSingle();

  const { count: deviceCount } = await supabase
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    user_id: user.id,
    // Ник живёт в profiles: там его меняет сайт. user_metadata — запасной
    // вариант для аккаунтов, заведённых до появления таблицы.
    nickname: profile?.nickname ?? user.user_metadata?.nickname ?? null,
    email: user.email ?? null,
    member_since: profile?.created_at ?? user.created_at ?? null,
    country: profile?.country ?? null,
    games: licenses.map((l) => l.game_slug),
    licences: licenses.map((l) => ({
      game: l.game_slug,
      source: l.source ?? null,
      granted_at: l.granted_at ?? null,
    })),
    devices: deviceCount ?? null,
    device_hash: body.device_hash ?? null,
    issued_at: now,
    expires_at: now + TOKEN_TTL_DAYS * 86400,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  let signature: ArrayBuffer;
  try {
    signature = await crypto.subtle.sign('Ed25519', await signingKey(), payloadBytes);
  } catch (e) {
    // Ключ настроен неверно — это поломка на нашей стороне, а не вина игрока.
    // Отдаём внятный код, чтобы игра показала «сервер прав недоступен», а не
    // «нет лицензии»: лицензия-то есть.
    console.error('signing failed:', (e as Error).message);
    return json({ error: 'signing_unavailable' }, 503);
  }

  return json({
    payload: b64.encode(payloadBytes),
    signature: b64.encode(new Uint8Array(signature)),
  });
});
