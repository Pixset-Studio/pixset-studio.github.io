// Выдаёт игре подписанный список лицензий.
// Игра хранит токен локально и проверяет его подписью — интернет нужен
// только чтобы продлить срок, а не чтобы запустить игру.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOKEN_TTL_DAYS = 30;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

/** Приватный ключ лежит в секретах проекта и никогда не покидает сервер. */
async function signingKey() {
  const raw = Deno.env.get('LICENSE_PRIVATE_KEY');
  if (!raw) throw new Error('LICENSE_PRIVATE_KEY не задан');
  return await crypto.subtle.importKey(
    'pkcs8', b64.decode(raw), { name: 'Ed25519' }, false, ['sign'],
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
    .select('game_slug')
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (licError) return json({ error: 'db_error' }, 500);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    user_id: user.id,
    nickname: user.user_metadata?.nickname ?? null,
    games: licenses.map((l) => l.game_slug),
    device_hash: body.device_hash ?? null,
    issued_at: now,
    expires_at: now + TOKEN_TTL_DAYS * 86400,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    'Ed25519', await signingKey(), payloadBytes,
  );

  return json({
    payload: b64.encode(payloadBytes),
    signature: b64.encode(new Uint8Array(signature)),
  });
});
