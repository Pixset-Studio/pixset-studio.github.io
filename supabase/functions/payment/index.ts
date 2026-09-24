// Создание платежа в ЮKassa по заказу игрока.
//
// Клиент присылает только slug игры. Сумму, валюту и сам заказ считает база
// (create_order), ключи ЮKassa живут в секретах — с браузера ни цену, ни
// валюту подменить нельзя.
//
// ЮKassa принимает только российские карты и рубли, поэтому заказ в долларах
// сюда просто не пропускается: лучше честно сказать, что оплата недоступна,
// чем вести игрока на страницу, где он не сможет заплатить.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const YOOKASSA_URL = 'https://api.yookassa.ru/v3/payments';

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

/** Куда ЮKassa вернёт игрока после оплаты.
 *
 * По умолчанию — специальная страница «Спасибо за покупку»: в навигации её
 * нет и в поиск она не попадает (noindex), а открывшись, она сверяет заказ
 * по ?order= с базой и показывает что-то только тогда, когда заказ
 * действительно принадлежит вошедшему игроку. Просто ссылку без реального
 * заказа за ней открыть можно, но показывать там нечего — страница отправит
 * на витрину.
 *
 * YOOKASSA_RETURN_URL в секретах — override, если нужна другая страница;
 * order_id к нему не приписывается, потому что чужая страница может не
 * ожидать такого параметра. */
function returnUrl(gameSlug: string, orderId: string) {
  const custom = Deno.env.get('YOOKASSA_RETURN_URL');
  if (custom) return custom;
  const base = gameSlug === 'byte-blaster'
    ? 'https://pixset-studio.github.io/byte-blaster/thank-you/'
    : 'https://pixset-studio.github.io/thank-you/';
  return `${base}?order=${encodeURIComponent(orderId)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const shopId = Deno.env.get('YOOKASSA_SHOP_ID');
  const secretKey = Deno.env.get('YOOKASSA_SECRET_KEY');
  if (!shopId || !secretKey) return json({ error: 'payments_not_configured' }, 503);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);
  const accessToken = authHeader.replace('Bearer ', '');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !user) return json({ error: 'invalid_token' }, 401);

  let body: { game_slug?: string; promo_code?: string } = {};
  try { body = await req.json(); } catch { /* сработает проверка ниже */ }
  const gameSlug = body.game_slug;
  if (!gameSlug) return json({ error: 'no_game' }, 400);

  // Промокод проверяет база: негодный код она просто игнорирует, и покупка
  // идёт по полной цене. Ронять оплату из-за опечатки в коде нельзя.
  const promo = typeof body.promo_code === 'string' && body.promo_code.trim()
    ? body.promo_code.trim()
    : null;

  // Заказ создаём от имени игрока: RPC сам проверит, что игра не куплена,
  // и подставит цену его региона.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );

  const { data: orderId, error: orderError } = await asUser.rpc('create_order', {
    p_game_slug: gameSlug,
    p_promo: promo,
  });
  if (orderError) return json({ error: orderError.message }, 400);

  const { data: order } = await admin
    .from('orders')
    .select('id, currency, amount, amount_full, promo_code, game_slug')
    .eq('id', orderId).single();
  if (!order) return json({ error: 'order_not_found' }, 500);

  if (order.currency !== 'RUB') {
    return json({ error: 'currency_not_supported' }, 400);
  }

  // Сумма в рублях с копейками: в базе она хранится в копейках.
  const value = (order.amount / 100).toFixed(2);

  const { data: game } = await admin
    .from('games').select('title').eq('slug', order.game_slug).single();

  const res = await fetch(YOOKASSA_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${shopId}:${secretKey}`),
      'Content-Type': 'application/json',
      // Ключ идемпотентности — id заказа: повторное нажатие «Купить» не
      // создаст второй платёж, ЮKassa вернёт уже существующий. Если игрок
      // передумал и ввёл промокод, create_order заводит новый заказ (старый
      // уже привязан к платежу) — значит и ключ будет другим, а сумма в
      // платеже сойдётся с суммой заказа.
      'Idempotence-Key': order.id,
    },
    body: JSON.stringify({
      amount: { value, currency: 'RUB' },
      capture: true,                       // списываем сразу, без двухстадийности
      confirmation: { type: 'redirect', return_url: returnUrl(order.game_slug, order.id) },
      description: `${game?.title ?? order.game_slug} — лицензия Pixset Studio`,
      // По metadata вебхук находит заказ. Это надёжнее, чем поиск по почте.
      metadata: { order_id: order.id, user_id: user.id, game_slug: order.game_slug },
    }),
  });

  const raw = await res.json().catch(() => null);

  if (!res.ok) {
    // Заказ оставляем в pending: игрок может повторить попытку, и create_order
    // вернёт тот же заказ, а не наплодит новых.
    console.error('yookassa payment failed', res.status, JSON.stringify(raw));
    return json({ error: 'provider_error', status: res.status, raw }, 502);
  }

  const payUrl = raw?.confirmation?.confirmation_url ?? null;
  const paymentId = raw?.id ? String(raw.id) : null;

  if (paymentId) {
    await admin.from('orders')
      .update({ provider: 'yookassa', provider_ref: paymentId })
      .eq('id', order.id);
  }

  if (!payUrl) {
    console.error('yookassa: нет ссылки на оплату', JSON.stringify(raw));
    return json({ error: 'no_payment_url', raw }, 502);
  }

  return json({
    ok: true,
    order_id: order.id,
    payment_url: payUrl,
    // Сумму возвращаем, чтобы страница покупки показала, за сколько в итоге
    // уходит игрок: применился промокод или нет — решала база, не браузер.
    amount: order.amount,
    amount_full: order.amount_full ?? order.amount,
    currency: order.currency,
    promo_code: order.promo_code ?? null,
  });
});
