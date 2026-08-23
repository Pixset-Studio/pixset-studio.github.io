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

// apikey и x-client-info браузер запрашивает в preflight, потому что их
// добавляет клиент Supabase. Без них в списке preflight отклоняется, и запрос
// до функции не доходит вовсе — в интерфейсе это выглядит как «нет сети».
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

/** Способ оплаты под валюту. Переопределяется секретами, если Lava включит другие. */
function methodFor(currency: string) {
  return currency === 'RUB'
    ? (Deno.env.get('LAVA_METHOD_RUB') ?? 'BANK131')   // карты РФ
    : (Deno.env.get('LAVA_METHOD_USD') ?? 'UNLIMINT'); // зарубежные карты
}

/* ── Поиск оффера ─────────────────────────────────────────────────────────
   В Lava счёт выставляется на оффер внутри продукта, а не на сам продукт, и
   его id неочевидно найти в кабинете. Поэтому берём каталог по API и ищем
   оффер сами: сначала по настроенному LAVA_OFFER_ID, потом по совпадению цены
   и валюты с нашим каталогом, и только если продавать нечего — ошибка.
   Каталог кэшируем: он меняется куда реже, чем идут покупки. */

type Offer = { id: string; product: string | null; name: string | null;
               prices: { amount: number; currency: string }[] };

let cachedOffers: { at: number; offers: Offer[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function loadOffers(apiKey: string): Promise<Offer[]> {
  if (cachedOffers && Date.now() - cachedOffers.at < CACHE_MS) return cachedOffers.offers;

  const res = await fetch('https://gate.lava.top/api/v2/products', {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error('products_' + res.status);

  const raw = await res.json();
  const items = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);
  const offers: Offer[] = [];

  for (const item of items) {
    const data = item?.data ?? item;
    const product = data?.title ?? data?.name ?? null;
    for (const offer of Array.isArray(data?.offers) ? data.offers : []) {
      if (!offer?.id) continue;
      offers.push({
        id: String(offer.id),
        product,
        name: offer?.name ?? null,
        prices: (Array.isArray(offer?.prices) ? offer.prices : [])
          .map((p: any) => ({ amount: Number(p?.amount), currency: String(p?.currency ?? '') })),
      });
    }
  }

  // Пустой разбор — это либо пустой каталог, либо структура ответа не та,
  // которую мы ждём. Отличить можно только по сырому ответу, поэтому пишем
  // его в лог (ключей и персональных данных там нет, только товары).
  if (offers.length === 0) {
    console.error('products: офферы не разобраны, сырой ответ:',
      JSON.stringify(raw).slice(0, 2000));
    // Пустоту не кэшируем: иначе после починки каталога пришлось бы ждать
    // истечения кэша, чтобы покупка заработала.
    return offers;
  }

  cachedOffers = { at: Date.now(), offers };
  return offers;
}

/** amountMinor — цена из нашего каталога в копейках/центах. */
async function resolveOfferId(apiKey: string, currency: string, amountMinor: number) {
  const configured = Deno.env.get('LAVA_OFFER_ID') ?? '';
  const offers = await loadOffers(apiKey);

  if (configured && offers.some((o) => o.id === configured)) return configured;

  const matches = offers.filter((o) =>
    o.prices.some((p) => p.currency === currency && Math.round(p.amount * 100) === amountMinor));

  if (matches.length === 1) {
    console.log('offer подобран по цене:', matches[0].id, matches[0].product, matches[0].name);
    return matches[0].id;
  }

  // Не угадываем: продать не тот товар хуже, чем показать ошибку.
  console.error('offer не определён. настроенный:', configured || 'нет',
    '| ищем', amountMinor, currency,
    '| доступно:', JSON.stringify(offers.map((o) =>
      ({ id: o.id, product: o.product, name: o.name, prices: o.prices }))));

  if (offers.length === 0) throw new Error('no_offers_in_lava');
  throw new Error(matches.length > 1 ? 'several_offers_match' : 'offer_not_found');
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

  // LAVA_OFFER_ID необязателен: если он не задан или устарел, оффер находится
  // по цене автоматически (см. resolveOfferId).
  const apiKey = Deno.env.get('LAVA_API_KEY');
  if (!apiKey) return json({ error: 'lava_not_configured' }, 503);

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

  let offerId: string;
  try {
    offerId = await resolveOfferId(apiKey, currency, order.amount);
  } catch (e) {
    // Причина и полный список офферов уже в логах функции.
    return json({ error: 'offer_problem', reason: String((e as Error).message) }, 502);
  }

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
