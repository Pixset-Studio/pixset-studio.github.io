// Выдаёт ссылку на скачивание сборки — только владельцу лицензии.
//
// Прямых ссылок на файлы не существует: бакет приватный, а эта функция
// создаёт подписанную ссылку на 10 минут. Утёкшая ссылка протухает сама,
// а каждая выдача попадает в журнал — видно, кто и сколько качает.
//
// Полностью защитить дистрибутив нельзя: скачавший может перевыложить файл.
// Задача скромнее и достижимее — не раздавать вечные прямые ссылки и знать,
// через чей аккаунт идёт слив.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LINK_TTL_SEC = 600;        // 10 минут на скачивание
const MAX_PER_HOUR = 5;          // на аккаунт: обычному игроку хватает с запасом

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** IP не храним в открытом виде — только отпечаток, для учёта злоупотреблений. */
async function hashIp(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (!ip) return null;
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bytes = new TextEncoder().encode(ip + salt);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } =
    await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return json({ error: 'invalid_token' }, 401);

  let body: { game_slug?: string; platform?: string; version?: string; device_hash?: string } = {};
  try { body = await req.json(); } catch { /* проверки ниже */ }

  const gameSlug = body.game_slug;
  const platform = body.platform;
  if (!gameSlug || !platform) return json({ error: 'bad_request' }, 400);

  // 1. Лицензия. Без неё сборка не выдаётся, даже если игрок знает адрес.
  const { data: license } = await admin
    .from('licenses').select('id')
    .eq('user_id', user.id).eq('game_slug', gameSlug).is('revoked_at', null)
    .maybeSingle();
  if (!license) return json({ error: 'no_license' }, 403);

  // 2. Нужная сборка: конкретная версия или текущая.
  let q = admin.from('releases')
    .select('id, file_path, version, sha256, file_size, external_url')
    .eq('game_slug', gameSlug).eq('platform', platform);
  q = body.version ? q.eq('version', body.version) : q.eq('is_current', true);

  const { data: release } = await q.maybeSingle();
  if (!release) return json({ error: 'release_not_found' }, 404);

  // Сборка может раздаваться не нами (например, Android через RuStore).
  if (!release.file_path) {
    if (release.external_url) {
      return json({ ok: true, external: true, url: release.external_url, version: release.version });
    }
    return json({ error: 'file_missing' }, 404);
  }

  // 3. Частота. Ограничение на аккаунт, а не на устройство: иначе обходится
  //    сменой отпечатка.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from('download_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);

  if ((count ?? 0) >= MAX_PER_HOUR) {
    return json({ error: 'rate_limited', retry_after_min: 60 }, 429);
  }

  // 4. Ссылка живёт 10 минут — утёкшая быстро становится бесполезной.
  const { data: signed, error: signError } = await admin
    .storage.from('releases')
    .createSignedUrl(release.file_path, LINK_TTL_SEC, { download: true });

  if (signError || !signed) {
    console.error('signed url failed', signError?.message);
    return json({ error: 'storage_error' }, 502);
  }

  await admin.from('download_log').insert({
    user_id: user.id,
    release_id: release.id,
    device_hash: body.device_hash ?? null,
    ip_hash: await hashIp(req),
  });

  return json({
    ok: true,
    url: signed.signedUrl,
    version: release.version,
    sha256: release.sha256,
    size: release.file_size,
    expires_in: LINK_TTL_SEC,
  });
});
