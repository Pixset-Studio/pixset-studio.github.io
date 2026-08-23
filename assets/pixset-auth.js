// Pixset Studio — общий клиент аккаунтов.
// Публичный ключ безопасно держать в коде: доступ к данным ограничен
// политиками RLS на стороне базы, а не секретностью ключа.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Куда возвращаются письма подтверждения и сброса пароля.
 * Сайт игры может задать свою страницу аккаунта через window.PIXSET_ACCOUNT_URL —
 * тогда игрок вернётся туда, откуда регистрировался, а не на сайт студии.
 * Адрес обязан быть на этом же домене: иначе ссылка из письма уводила бы
 * на чужой сайт.
 */
export const ACCOUNT_URL = (() => {
  const custom = typeof window !== 'undefined' ? window.PIXSET_ACCOUNT_URL : null;
  if (custom) {
    try {
      const url = new URL(custom, location.origin);
      if (url.origin === location.origin) return url.href;
    } catch { /* некорректный адрес — уходим на значение по умолчанию */ }
  }
  return new URL('/account/', location.origin).href;
})();

/** Ник: латиница, цифры, _ и -, 3–20 символов. */
export const NICKNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

export async function register({ email, password, nickname }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Страна нужна только чтобы один раз выбрать валюту аккаунта.
      // Дальше цена привязана к профилю и от устройства не зависит.
      data: { nickname, country: detectCountry() },
      emailRedirectTo: ACCOUNT_URL,
    },
  });
  if (error) throw error;
  // Если подтверждение почты включено, сессии не будет — это не ошибка.
  return { needsConfirmation: !data.session };
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: ACCOUNT_URL,
  });
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, avatar_url, created_at, is_admin, country, currency')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

/* ── Магазин ───────────────────────────────────────────────────────────── */

/**
 * Страна по часовому поясу — только для России: рубли положены ей одной,
 * всем остальным (включая Беларусь) идут доллары.
 * Значение записывается в профиль один раз при регистрации.
 */
export function detectCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const ruZones = /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Kirov|Saratov|Astrakhan|Ulyanovsk)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Krasnoyarsk|Irkutsk|Yakutsk|Vladivostok|Magadan|Kamchatka|Barnaul|Tomsk|Novokuznetsk|Chita|Khandyga|Sakhalin|Srednekolymsk|Ust-Nera|Anadyr))$/;
    if (ruZones.test(tz)) return 'RU';
  } catch { /* экзотическая среда — считаем «не Россия» */ }
  return 'XX';
}

export function formatPrice(game, currency) {
  if (currency === 'RUB') {
    return game.price_rub == null ? null : (game.price_rub / 100).toLocaleString('ru-RU') + ' ₽';
  }
  return game.price_usd == null ? null : '$' + (game.price_usd / 100).toFixed(2);
}

/**
 * Создаёт заказ (или возвращает уже открытый) и отдаёт его id.
 * Валюту и сумму сервер берёт из профиля — клиент на них не влияет.
 */
export async function createOrder(gameSlug) {
  const { data, error } = await supabase.rpc('create_order', { p_game_slug: gameSlug });
  if (error) throw error;
  return data;
}

/**
 * Создаёт заказ и платёж в ЮKassa, возвращает ссылку на оплату.
 * Цену и валюту считает сервер по региону аккаунта.
 */
export async function startPayment(gameSlug) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ game_slug: gameSlug }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.payment_url) {
    const err = new Error(data.error || 'payment_failed');
    err.details = data;
    throw err;
  }
  return data;
}

export async function getMyOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, game_slug, amount, currency, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/* ── Админка ───────────────────────────────────────────────────────────── */

export async function adminListOrders() {
  const { data, error } = await supabase.rpc('admin_list_orders');
  if (error) throw error;
  return data;
}

export async function adminListPlayers() {
  const { data, error } = await supabase.rpc('admin_list_players');
  if (error) throw error;
  return data;
}

export async function adminGrantLicense(email, gameSlug) {
  const { error } = await supabase.rpc('admin_grant_license', {
    p_email: email, p_game_slug: gameSlug, p_source: 'manual',
  });
  if (error) throw error;
}

export async function adminRevokeLicense(email, gameSlug) {
  const { error } = await supabase.rpc('admin_revoke_license', {
    p_email: email, p_game_slug: gameSlug,
  });
  if (error) throw error;
}

export async function adminListPaymentEvents() {
  const { data, error } = await supabase.rpc('admin_list_payment_events');
  if (error) throw error;
  return data;
}

export async function adminMarkPaid(orderId) {
  const { error } = await supabase.rpc('admin_mark_paid', { p_order_id: orderId });
  if (error) throw error;
}

/** Каталог опубликованных игр. Виден и гостям. */
export async function getGames() {
  const { data, error } = await supabase
    .from('games')
    .select('slug, title, tagline, price_rub, price_usd, is_published')
    .eq('is_published', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

/** Игры, на которые у текущего пользователя есть действующая лицензия. */
export async function getEntitlements() {
  const { data, error } = await supabase
    .from('my_entitlements')
    .select('game_slug, granted_at');
  if (error) throw error;
  return data;
}

export async function getDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select('id, label, platform, last_seen')
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return data;
}

export async function revokeDevice(id) {
  const { error } = await supabase.from('devices').delete().eq('id', id);
  if (error) throw error;
}

/** Человекочитаемые сообщения вместо английских ошибок Supabase. */
export function humanError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (m.includes('email not confirmed'))       return 'Почта не подтверждена — проверь входящие.';
  if (m.includes('user already registered'))   return 'Такая почта уже зарегистрирована.';
  if (m.includes('password should be at least')) return 'Пароль слишком короткий — минимум 6 символов.';
  if (m.includes('duplicate key') && m.includes('nickname')) return 'Этот ник уже занят.';
  if (m.includes('unable to validate email'))  return 'Проверь правильность адреса почты.';
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Слишком много попыток. Подожди минуту и попробуй снова.';
  }
  if (m.includes('failed to fetch')) return 'Нет связи с сервером. Проверь интернет.';
  if (m.includes('already_owned'))    return 'Эта игра уже есть на твоём аккаунте.';
  if (m.includes('not_authenticated'))return 'Сначала войди в аккаунт.';
  if (m.includes('user_not_found'))   return 'Игрок с такой почтой не найден.';
  if (m.includes('game_not_found'))   return 'Игра не найдена или ещё не вышла.';
  if (m.includes('price_not_set'))    return 'Для этой игры не задана цена.';
  if (m.includes('order_not_found'))  return 'Заказ не найден.';
  if (m.includes('forbidden'))        return 'Нужны права администратора.';
  if (m.includes('payments_not_configured')) return 'Приём оплаты ещё настраивается. Напишите нам — выдадим лицензию вручную.';
  if (m.includes('provider_error') || m.includes('no_payment_url')) {
    return 'Платёжная система не приняла заказ. Попробуйте позже или напишите нам.';
  }
  if (m.includes('currency_not_supported')) {
    return 'Оплата пока доступна только для России. Первый мир игры открыт бесплатно.';
  }
  if (m.includes('payment_failed'))   return 'Не удалось создать счёт. Попробуйте ещё раз.';
  return err?.message || 'Неизвестная ошибка.';
}
