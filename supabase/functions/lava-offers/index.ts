// Справочник: какие продукты и офферы заведены в кабинете Lava.
//
// Нужен, чтобы не угадывать LAVA_OFFER_ID: в Lava у продукта есть внутренние
// офферы, и счёт выставляется на id оффера, а не продукта. Функция ходит в
// Lava серверным ключом и возвращает только то, что нужно для настройки —
// сам ключ наружу не попадает.
//
// Доступ только администратору: список товаров и цен посторонним не нужен.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('LAVA_API_KEY');
  if (!apiKey) return json({ error: 'lava_not_configured' }, 503);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return json({ error: 'invalid_token' }, 401);

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return json({ error: 'forbidden' }, 403);

  const res = await fetch('https://gate.lava.top/api/v2/products', {
    headers: { 'X-Api-Key': apiKey },
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) return json({ error: 'lava_error', status: res.status, raw }, 502);

  // Приводим к плоскому виду: название → офферы с ценами. Структуру ответа
  // Lava может менять, поэтому исходный ответ отдаём рядом.
  const items = Array.isArray((raw as any)?.items) ? (raw as any).items : raw;
  const offers: unknown[] = [];

  if (Array.isArray(items)) {
    for (const item of items) {
      const data = item?.data ?? item;
      const title = data?.title ?? data?.name ?? null;
      const list = data?.offers ?? [];
      for (const offer of Array.isArray(list) ? list : []) {
        offers.push({
          product: title,
          offer_id: offer?.id ?? null,
          offer_name: offer?.name ?? null,
          prices: (offer?.prices ?? []).map((p: any) => ({
            amount: p?.amount, currency: p?.currency, periodicity: p?.periodicity,
          })),
        });
      }
    }
  }

  return json({ ok: true, offers, raw });
});
