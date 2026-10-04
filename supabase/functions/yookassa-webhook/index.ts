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
  // canceled — платёж так и не был оплачен (игрок ушёл, банк отказал, истёк срок);
  // refunded — деньги были получены и возвращены. Это разные истории: у отменённого
  // нечего откатывать, надо просто освободить заказ и вернуть зарезервированные
  // баллы, а «возврат» в истории покупок игроку показывать незачем.
  const canceled = status === 'canceled';
  const refunded = !canceled && Number(payment?.refunded_amount?.value ?? 0) > 0;

  // Заказ ищем по metadata, которую сами положили при создании платежа.
  let order:
    | { id: string; user_id: string; game_slug: string | null; amount: number; promo_code: string | null; kind: string }
    | null = null;
  const orderId = payment?.metadata?.order_id ? String(payment.metadata.order_id) : null;
  const ORDER_FIELDS = 'id, user_id, game_slug, amount, promo_code, kind';

  if (orderId) {
    const { data } = await supabase
      .from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle();
    order = data ?? null;
  }
  if (!order) {
    const { data } = await supabase
      .from('orders').select(ORDER_FIELDS)
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

    // Деньги действительно пришли — это факт независимо от режима подтверждения
    // ниже, поэтому статус заказа обновляем всегда.
    await supabase.from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', order.id);

    // Автоматическая выдача — либо ручная, через кнопку «Выдать» в админке
    // (admin_confirm_order). payments_auto_grant() — отдельная функция (0033):
    // раньше настройка писалась
    // через общую admin_set_setting, и похоже, что для нового ключа она тихо не
    // срабатывала (обновление не находило строки, которой ещё не было). Теперь и
    // чтение, и запись идут через код, который я полностью контролирую.
    const { data: autoGrant, error: autoErr } = await supabase.rpc('payments_auto_grant');
    if (autoErr) {
      // Сбой самой проверки — не повод задержать игроку доступ, за который он
      // уже заплатил: выдаём как при автоматическом режиме (это и есть
      // поведение по умолчанию, когда настройки вовсе нет) и просто
      // записываем ошибку в лог, чтобы её можно было заметить и разобрать.
      console.error('payments_auto_grant check failed', order.id, autoErr.message);
    } else if (autoGrant === false) {
      return OK({ ok: true, paid: true, granted: false, awaiting_manual_confirm: true });
    }

    // Дальше — общая для покупки игры и пополнения баланса функция: сама
    // разбирает order.kind (лицензия + баллы либо зачисление на баланс) и
    // сама идемпотентна, так что повторная доставка того же уведомления не
    // приведёт к двойной выдаче.
    const { error: grantErr } = await supabase.rpc('grant_paid_order', { p_order_id: order.id });
    if (grantErr) {
      console.error('grant_paid_order failed', order.id, grantErr.message);
      return OK({ ok: true, granted: false, grant_error: grantErr.message });
    }

    return OK({ ok: true, granted: true });
  }

  if (canceled) {
    // _close_pending_order сам проверяет, что заказ ещё pending: отмена не может
    // «понизить» уже оплаченный заказ.
    const { error: closeErr } = await supabase.rpc('_close_pending_order', {
      p_order_id: order.id,
      p_note: 'платёж отменён — баллы вернулись',
    });
    if (closeErr) console.error('_close_pending_order failed', order.id, closeErr.message);
    return OK({ ok: true, canceled: true });
  }

  if (refunded) {
    await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
    // Снимает лицензию (покупка) или списывает обратно зачисленный баланс
    // (пополнение), а заодно отыгрывает начисленные и потраченные баллы —
    // см. комментарий в самой функции.
    const { error: revokeErr } = await supabase.rpc('revoke_paid_order', { p_order_id: order.id });
    if (revokeErr) console.error('revoke_paid_order failed', order.id, revokeErr.message);

    return OK({ ok: true, revoked: true });
  }

  return OK({ ok: true, ignored: status });
});
