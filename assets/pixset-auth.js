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

/* ── Профиль игрока ────────────────────────────────────────────────────── */

/** Смена ника. Ник виден в мультиплеере, поэтому менять можно раз в сутки. */
export async function updateNickname(nickname) {
  const { data, error } = await supabase.rpc('update_nickname', { p_nickname: nickname });
  if (error) throw error;
  return data;
}

export async function updateLocale(locale) {
  const { error } = await supabase.rpc('update_locale', { p_locale: locale });
  if (error) throw error;
}

/** Смена пароля у вошедшего игрока. */
export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Смена почты. Supabase отправит письмо на новый адрес — до подтверждения
 * вход остаётся по старому.
 */
export async function changeEmail(newEmail) {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail }, { emailRedirectTo: ACCOUNT_URL },
  );
  if (error) throw error;
}

/** Удаление аккаунта вместе с лицензиями и заказами. Отменить нельзя. */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

/* ── Настройки студии ──────────────────────────────────────────────────── */

/**
 * Публичные настройки витрины: включён ли приём оплаты и куда писать, если нет.
 * Читаются без авторизации — это не секреты, а состояние магазина.
 */
export async function getSettings() {
  const fallback = { payments_enabled: false, support_email: 'pixset.studio.offical@gmail.com' };
  try {
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) throw error;
    const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
    return { ...fallback, ...map };
  } catch {
    // Настройки не прочитались — считаем оплату выключенной. Показать почту
    // безопаснее, чем открыть кнопку, которая приведёт к ошибке.
    return fallback;
  }
}

export async function adminSetSetting(key, value) {
  const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value });
  if (error) throw error;
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

/* ── Сборки и обновления ───────────────────────────────────────────────── */

/** Текущие версии по платформам. Открыто всем: нужно для проверки обновлений. */
export async function getCurrentReleases(gameSlug) {
  const { data, error } = await supabase
    .from('current_releases')
    .select('platform, version, file_size, sha256, notes, external_url, created_at')
    .eq('game_slug', gameSlug);
  if (error) throw error;
  return data;
}

/**
 * Ссылка на скачивание сборки. Живёт 10 минут и выдаётся только владельцу
 * лицензии — прямых ссылок на файлы не существует.
 */
export async function getDownloadLink(gameSlug, platform, version) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ game_slug: gameSlug, platform, version }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    const err = new Error(data.error || 'download_failed');
    err.details = data;
    throw err;
  }
  return data;
}

/* ── Админка ───────────────────────────────────────────────────────────── */

export async function adminListReleases() {
  const { data, error } = await supabase.rpc('admin_list_releases');
  if (error) throw error;
  return data;
}

export async function adminDeleteRelease(id) {
  const { error } = await supabase.rpc('admin_delete_release', { p_id: id });
  if (error) throw error;
}

/**
 * Загружает файл сборки в приватный бакет и заводит релиз.
 * Файл идёт напрямую в хранилище, минуя наш сервер, — иначе стомегабайтный
 * установщик пришлось бы прогонять через функцию.
 */
export async function adminUploadRelease({ gameSlug, platform, version, file, notes, makeCurrent = true, onProgress }) {
  const path = `${gameSlug}/${version}/${file.name}`;

  const { error: upErr } = await supabase.storage
    .from('releases')
    .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (upErr) throw upErr;

  if (onProgress) onProgress('checksum');
  const sha256 = await fileSha256(file);

  const { data, error } = await supabase.rpc('admin_upsert_release', {
    p_game_slug: gameSlug,
    p_platform: platform,
    p_version: version,
    p_file_path: path,
    p_file_size: file.size,
    p_sha256: sha256,
    p_notes: notes || null,
    p_external_url: null,
    p_make_current: makeCurrent,
  });
  if (error) throw error;
  return data;
}

/** Релиз без файла: раздача идёт по внешней ссылке (например, RuStore). */
export async function adminSetExternalRelease({ gameSlug, platform, version, url, notes, makeCurrent = true }) {
  const { error } = await supabase.rpc('admin_upsert_release', {
    p_game_slug: gameSlug,
    p_platform: platform,
    p_version: version,
    p_file_path: null,
    p_file_size: null,
    p_sha256: null,
    p_notes: notes || null,
    p_external_url: url,
    p_make_current: makeCurrent,
  });
  if (error) throw error;
}

/** SHA-256 файла: клиент после скачивания сверяет им целостность сборки. */
export async function fileSha256(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
  if (m.includes('bad_nickname'))     return 'Ник: 3-20 символов, латиница, цифры, _ и -';
  if (m.includes('nickname_taken'))   return 'Этот ник уже занят.';
  if (m.includes('nickname_too_soon'))return 'Ник можно менять раз в сутки.';
  if (m.includes('admin_cannot_self_delete')) {
    return 'Аккаунт администратора нельзя удалить из профиля.';
  }
  if (m.includes('same_password'))    return 'Новый пароль совпадает со старым.';
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
