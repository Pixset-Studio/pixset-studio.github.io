// Приём уведомлений об оплате от Lava.top.
//
// Функция открыта наружу (verify_jwt = false) — иначе платёжка до неё не
// достучится. Поэтому вход закрыт Basic-аутентификацией: логин и пароль
// задаются в секретах проекта и вписываются в форму вебхука в кабинете Lava.
// Без этого кто угодно мог бы прислать «оплату» и получить лицензию бесплатно.
//
// Каждое событие сохраняется в payment_events: по первому реальному
// уведомлению видно фактический формат полей, а неопознанные оплаты не
// теряются — их видно в админке и можно закрыть вручную.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OK = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

/** Сравнение без утечки времени: длина ответа не должна зависеть от совпадения. */
function safeEqual(a: string, b: string) {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function authorized(req: Request) {
  const user = Deno.env.get('LAVA_WEBHOOK_USER') ?? '';
  const pass = Deno.env.get('LAVA_WEBHOOK_PASS') ?? '';
  // Не настроено — не пускаем никого. Открытый вебхук хуже неработающего.
  if (!user || pass.length < 8) return false;

  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;

  let decoded = '';
  try { decoded = atob(header.slice(6)); } catch { return false; }

  const i = decoded.indexOf(':');
  if (i === -1) return false;
  return safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass);
}

/** Достаёт значение по первому подошедшему пути вида "a.b.c". */
function pick(obj: unknown, paths: string[]): string | null {
  for (const path of paths) {
    let cur: any = obj;
    for (const part of path.split('.')) {
      if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
      else { cur = null; break; }
    }
    if (typeof cur === 'string' && cur) return cur;
    if (typeof cur === 'number') return String(cur);
  }
  return null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return OK({ error: 'method_not_allowed' }, 405);
  if (!authorized(req)) return OK({ error: 'unauthorized' }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { return OK({ error: 'bad_json' }, 400); }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Наш идентификатор заказа мы передаём Lava при создании счёта. Точное имя
  // поля в ответном уведомлении зависит от их схемы, поэтому проверяем
  // несколько разумных вариантов, а в крайнем случае ищем UUID во всём теле.
  let orderId = pick(payload, [
    // Основной путь: при создании счёта мы кладём id заказа в utm_content.
    'clientUtm.utm_content', 'clientUtm.utmContent', 'utm_content',
    'orderId', 'order_id', 'clientUtm.orderId', 'customFields.orderId',
    'additionalFields.orderId', 'metadata.orderId', 'buyer.orderId', 'comment',
  ]);
  if (!orderId) {
    const m = JSON.stringify(payload).match(UUID_RE);
    if (m) orderId = m[0];
  }

  const status = (pick(payload, ['status', 'eventType', 'event', 'state']) ?? '').toLowerCase();
  const email = pick(payload, ['buyer.email', 'email', 'clientEmail', 'buyerEmail']);

  const paid = /success|paid|completed|subscription-active/.test(status);
  const refunded = /refund|cancel|charge-?back/.test(status);

  // Заказ ищем по id, а если его в уведомлении нет — по почте покупателя.
  let order: { id: string; user_id: string; game_slug: string } | null = null;

  if (orderId && UUID_RE.test(orderId)) {
    const { data } = await supabase
      .from('orders').select('id, user_id, game_slug').eq('id', orderId).maybeSingle();
    order = data ?? null;
  }
  if (!order && email) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (user) {
      const { data } = await supabase
        .from('orders').select('id, user_id, game_slug')
        .eq('user_id', user.id).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      order = data ?? null;
    }
  }

  await supabase.from('payment_events').insert({
    provider: 'lava',
    event_type: status || null,
    order_id: order?.id ?? null,
    matched: !!order,
    payload,
  });

  if (!order) {
    // Отвечаем 200: повторные доставки того же нераспознанного события ничего
    // не исправят, а событие уже сохранено и видно в админке.
    return OK({ ok: true, matched: false });
  }

  if (paid) {
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
