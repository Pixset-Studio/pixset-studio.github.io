// Приём уведомлений об оплате от ЮKassa.
//
// ВАЖНО про безопасность: ЮKassa не подписывает уведомления, поэтому телу
// запроса доверять нельзя — иначе кто угодно прислал бы «оплату» и получил
// лицензию даром. Поэтому из уведомления берётся только идентификатор
// платежа, а его настоящий статус и сумма запрашиваются у ЮKassa напрямую
// нашим секретным ключом. Подделать это невозможно.
//
// Каждое событие сохраняется в payment_events: неопознанные оплаты не
// теряются — их видно в админке и можно закрыть вручную.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const API = 'https://api.yookassa.ru/v3/payments/';

const OK = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return OK({ error: 'method_not_allowed' }, 405);

  const shopId = Deno.env.get('YOOKASSA_SHOP_ID');
  const secretKey = Deno.env.get('YOOKASSA_SECRET_KEY');
  if (!shopId || !secretKey) return OK({ error: 'not_configured' }, 503);

  let notice: any = null;
  try { notice = await req.json(); } catch { return OK({ error: 'bad_json' }, 400); }

  const paymentId = notice?.object?.id ? String(notice.object.id) : null;
  const event = String(notice?.event ?? '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (!paymentId) {
    await supabase.from('payment_events').insert({
      provider: 'yookassa', event_type: event || null,
      matched: false, payload: notice ?? {},
    });
    return OK({ ok: true, matched: false });
  }

  // Единственный источник правды — ответ ЮKassa, а не присланное тело.
  const check = await fetch(API + encodeURIComponent(paymentId), {
    headers: { Authorization: 'Basic ' + btoa(`${shopId}:${secretKey}`) },
  });
  const payment = await check.json().catch(() => null);

  if (!check.ok || !payment) {
    console.error('yookassa: платёж не подтверждён', paymentId, check.status);
    await supabase.from('payment_events').insert({
      provider: 'yookassa', event_type: event || null,
      matched: false, payload: { notice, check_status: check.status },
    });
    // 200, чтобы ЮKassa не долбила повторами: событие уже сохранено.
    return OK({ ok: true, verified: false });
  }

  const status = String(payment.status ?? '');
  const paid = status === 'succeeded' && payment.paid === true;
  const refunded = status === 'canceled' || Number(payment?.refunded_amount?.value ?? 0) > 0;

  // Заказ ищем по metadata, которую сами положили при создании платежа.
  let order: { id: string; user_id: string; game_slug: string; amount: number } | null = null;
  const orderId = payment?.metadata?.order_id ? String(payment.metadata.order_id) : null;

  if (orderId) {
    const { data } = await supabase
      .from('orders').select('id, user_id, game_slug, amount').eq('id', orderId).maybeSingle();
    order = data ?? null;
  }
  if (!order) {
    const { data } = await supabase
      .from('orders').select('id, user_id, game_slug, amount')
      .eq('provider_ref', paymentId).maybeSingle();
    order = data ?? null;
  }

  await supabase.from('payment_events').insert({
    provider: 'yookassa',
    event_type: event || status || null,
    order_id: order?.id ?? null,
    matched: !!order,
    payload: payment,
  });

  if (!order) return OK({ ok: true, matched: false });

  if (paid) {
    // Сверяем сумму: платёж на меньшую сумму не должен открывать игру.
    const expected = (order.amount / 100).toFixed(2);
    const got = String(payment?.amount?.value ?? '');
    if (got !== expected) {
      console.error('yookassa: сумма не совпала', order.id, got, 'ожидалось', expected);
      return OK({ ok: true, amount_mismatch: true });
    }

    await supabase.from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id);

    // Повторная доставка того же уведомления не должна ломать выдачу —
    // отсюда onConflict: лицензия просто остаётся активной.
    await supabase.from('licenses').upsert({
      user_id: order.user_id,
      game_slug: order.game_slug,
      order_id: order.id,
      source: 'purchase',
      revoked_at: null,
    }, { onConflict: 'user_id,game_slug' });

    return OK({ ok: true, granted: true });
  }

  if (refunded) {
    await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
    await supabase.from('licenses')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', order.user_id).eq('game_slug', order.game_slug);

    return OK({ ok: true, revoked: true });
  }

  return OK({ ok: true, ignored: status });
});
