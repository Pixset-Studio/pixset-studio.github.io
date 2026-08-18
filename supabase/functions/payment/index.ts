// Создание счёта в Lava.top по заказу игрока.
//
// Клиент присылает только slug игры. Сумму, валюту и сам заказ считает база
// (create_order), а ключ Lava живёт в секретах — с браузера ни цену, ни валюту
// подменить нельзя.
//
// Ответ Lava (id счёта и ссылка на оплату) может отличаться по именам полей
// между версиями их API, поэтому ссылка ищется по нескольким вариантам, а
// сырой ответ возвращается в поле `raw`, если ссылку найти не удалось.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LAVA_URL = 'https://gate.lava.top/api/v2/invoice';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Способ оплаты под валюту. Переопределяется секретами, если Lava включит другие. */
function methodFor(currency: string) {
  return currency === 'RUB'
    ? (Deno.env.get('LAVA_METHOD_RUB') ?? 'BANK131')   // карты РФ
    : (Deno.env.get('LAVA_METHOD_USD') ?? 'UNLIMINT'); // зарубежные карты
}

function findUrl(obj: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && /^https?:\/\//.test(val) &&
          /url|link|pay/i.test(key)) {
        return val;
      }
      const nested = walk(val);
      if (nested) return nested;
    }
    return null;
  };
  return walk(obj);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('LAVA_API_KEY');
  const offerId = Deno.env.get('LAVA_OFFER_ID');
  if (!apiKey || !offerId) return json({ error: 'lava_not_configured' }, 503);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);
  const accessToken = authHeader.replace('Bearer ', '');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !user) return json({ error: 'invalid_token' }, 401);

  let body: { game_slug?: string } = {};
  try { body = await req.json(); } catch { /* сработает проверка ниже */ }
  const gameSlug = body.game_slug;
  if (!gameSlug) return json({ error: 'no_game' }, 400);

  // Заказ создаём от имени игрока: RPC сам проверит, что игра не куплена,
  // и подставит цену его региона.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );

  const { data: orderId, error: orderError } = await asUser.rpc('create_order', {
    p_game_slug: gameSlug,
  });
  if (orderError) return json({ error: orderError.message }, 400);

  const { data: order } = await admin
    .from('orders').select('id, currency, amount').eq('id', orderId).single();
  if (!order) return json({ error: 'order_not_found' }, 500);

  const currency = order.currency === 'RUB' ? 'RUB' : 'USD';

  const lavaRes = await fetch(LAVA_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      offerId,
      currency,
      periodicity: 'ONE_TIME',
      paymentMethod: methodFor(currency),
      buyerLanguage: currency === 'RUB' ? 'RU' : 'EN',
      // Номер заказа отправляем обратно к себе же: вебхук по нему найдёт покупку.
      // Если Lava не вернёт метки, сработает запасной поиск по почте.
      clientUtm: { utm_content: order.id, utm_source: 'pixset-store' },
    }),
  });

  const raw = await lavaRes.json().catch(() => null);

  if (!lavaRes.ok) {
    // Заказ оставляем в pending: игрок может повторить попытку, и create_order
    // вернёт тот же заказ, а не наплодит новых.
    console.error('lava invoice failed', lavaRes.status, JSON.stringify(raw));
    return json({ error: 'lava_error', status: lavaRes.status, raw }, 502);
  }

  const payUrl = findUrl(raw);

  // Идентификатор счёта пригодится для сверки платежей.
  const invoiceId = raw && typeof raw === 'object' && 'id' in (raw as any)
    ? String((raw as any).id) : null;
  if (invoiceId) {
    await admin.from('orders')
      .update({ provider: 'lava', provider_ref: invoiceId })
      .eq('id', order.id);
  }

  if (!payUrl) return json({ error: 'no_payment_url', raw }, 502);

  return json({ ok: true, order_id: order.id, payment_url: payUrl });
});
