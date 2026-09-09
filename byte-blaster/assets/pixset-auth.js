// Pixset Studio — общий клиент аккаунтов.
// Публичный ключ безопасно держать в коде: доступ к данным ограничен
// политиками RLS на стороне базы, а не секретностью ключа.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

/**
 * Отпечаток этой сборки модуля. Проставляется скриптом sync-sdk.js вместе с
 * метками ?v= в импортах страниц — по нему видно, свежий ли код выполняется.
 * Пригодилось, когда браузер держал старую копию и загрузка сборок падала
 * «без причины»: страница молча работала на вчерашнем модуле.
 */
export const SDK_VERSION = 'bc05e2a5';

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

/* ── Подтверждение кодом из письма ───────────────────────────────────────
   Письма студии (supabase/emails) построены вокруг {{ .Token }} — короткого
   кода, а не ссылки. Ссылки в них нет вовсе, поэтому без ввода кода почту
   подтвердить было нечем: письмо приходило, а вписать его было некуда.

   Тип OTP определяет, что именно подтверждаем:
     signup       — регистрация,
     recovery     — сброс пароля (после проверки появляется сессия),
     email_change — смена адреса.
   Код Supabase присылает шестизначным; пробелы игрок нередко копирует вместе
   с ним, поэтому чистим строку сами. */
const cleanCode = (code) => String(code || '').replace(/\D/g, '');

export async function verifyEmailCode({ email, code, type = 'signup' }) {
  const { error } = await supabase.auth.verifyOtp({
    email, token: cleanCode(code), type,
  });
  if (error) throw error;
}

/** Повторная отправка кода регистрации — письмо теряется чаще, чем кажется. */
export async function resendSignupCode(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup', email, options: { emailRedirectTo: ACCOUNT_URL },
  });
  if (error) throw error;
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout() {
  await supabase.auth.signOut();
}

/** Текущая сессия или null.
 *
 *  Нужна страницам, которые сами решают, пускать гостя или нет: архив версий и
 *  шлюз веб-версии (assets/web-gate.js). Обе они звали `sdk.getSession()`,
 *  которого здесь не было, — вызов падал с TypeError, попадал в `catch` и
 *  выглядел как «вы не вошли», хотя сессия и лицензия были на месте. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return (data && data.session) || null;
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
    .select('nickname, avatar_url, created_at, is_admin, country, currency, country_visibility')
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

/* ── Аватар ────────────────────────────────────────────────────────────────
   Картинка хранится прямо в profiles.avatar_url как data-URL. Так сделано
   намеренно: отдельное хранилище потребовало бы бакета и политик доступа, а
   аватар после сжатия занимает пару десятков килобайт — меньше, чем иконка
   игры. Ужимает картинку клиент (см. avatarFromFile), сюда приходит готовая
   строка. Правку своей строки разрешает политика «own profile update». */
export const AVATAR_MAX_BYTES = 64 * 1024;

export async function updateAvatar(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) {
    throw new Error('avatar_bad_format');
  }
  if (dataUrl.length > AVATAR_MAX_BYTES) throw new Error('avatar_too_big');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { error } = await supabase.from('profiles')
    .update({ avatar_url: dataUrl }).eq('id', user.id);
  if (error) throw error;
  return dataUrl;
}

export async function removeAvatar() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { error } = await supabase.from('profiles')
    .update({ avatar_url: null }).eq('id', user.id);
  if (error) throw error;
}

/**
 * Готовит файл из «Обзора» к записи в профиль: обрезает по центру в квадрат,
 * ужимает до 160×160 и подбирает качество JPEG так, чтобы уложиться в лимит.
 * Телефонная фотография на 4 МБ превращается в ~15 КБ.
 */
export function avatarFromFile(file, size = 160) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('avatar_not_image')); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) { reject(new Error('avatar_not_image')); return; }
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const cx = cv.getContext('2d');
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img,
          (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
          0, 0, size, size);

        // Снижаем качество, пока не уложимся в лимит: у прозрачных PNG и
        // пёстрых фотографий разный «вес» при одном и том же размере.
        for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
          const out = cv.toDataURL('image/jpeg', q);
          if (out.length <= AVATAR_MAX_BYTES) { resolve(out); return; }
        }
        reject(new Error('avatar_too_big'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('avatar_not_image')); };
    img.src = url;
  });
}

/* ── Друзья ────────────────────────────────────────────────────────────────
   Пара хранится одной строкой (см. миграцию 0002): «А позвал Б» и «Б позвал А»
   не могут разъехаться в две независимые заявки, а встречная заявка сразу
   становится дружбой. Клиент об этом не думает — он зовёт по нику и получает
   плоский список из представления my_friends. */

/** Поиск игроков по началу ника. Пустой запрос ничего не ищет. */
export async function searchPlayers(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_players', { p_query: q });
  if (error) throw error;
  return data || [];
}

/** Заявка по нику. Возвращает 'pending' или 'accepted' (встречная заявка). */
export async function sendFriendRequest(nickname) {
  const { data, error } = await supabase.rpc('friend_request', { p_nickname: nickname });
  if (error) throw error;
  return data;
}

export async function acceptFriend(requesterId) {
  const { error } = await supabase.rpc('friend_accept', { p_requester: requesterId });
  if (error) throw error;
}

/** Убирает связь в любом состоянии: отказ, отмена своей заявки, удаление друга. */
export async function removeFriend(otherId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { error } = await supabase.from('friendships').delete()
    .or(`and(requester.eq.${user.id},addressee.eq.${otherId}),`
      + `and(requester.eq.${otherId},addressee.eq.${user.id})`);
  if (error) throw error;
}

/** Друзья и заявки одним списком: kind = friend | incoming | outgoing. */
export async function getFriends() {
  const { data, error } = await supabase
    .from('my_friends')
    .select('id, nickname, avatar_url, kind, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ── Прогресс в играх ──────────────────────────────────────────────────────
   Витрина, а не сохранение: сохранение лежит в cloud_saves и приватно, а это
   короткая сводка, которую видно всем — на неё и смотрят друзья. */

/** Публикует сводку. Зовёт сама игра после сохранения прогресса. */
export async function publishGameStats(gameSlug, data) {
  const { error } = await supabase.rpc('publish_game_stats', {
    p_game_slug: gameSlug, p_data: data,
  });
  if (error) throw error;
}

/* ── Рассылка игрокам ──────────────────────────────────────────────────────
   Объявление видят все, кто открыл игру; пишет только администратор (проверяет
   политика по profiles.is_admin, а не клиент). Живёт неделю — рассылка про
   обновление не должна всплывать месяцами. */
export async function postAnnouncement({ title, body, url, gameSlug = 'byte-blaster' }) {
  const clean = String(title || '').trim();
  if (!clean) throw new Error('empty_title');
  const { error } = await supabase.from('announcements').insert({
    title: clean,
    body: String(body || '').trim() || null,
    url: String(url || '').trim() || null,
    game_slug: gameSlug || null,
  });
  if (error) throw error;
}

export async function listAnnouncements(gameSlug = 'byte-blaster') {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, body, url, created_at, expires_at')
    .or(`game_slug.is.null,game_slug.eq.${gameSlug}`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

/** Карточка игрока по нику: профиль + прогресс во всех играх студии. */
export async function getPublicProfile(nickname) {
  const { data, error } = await supabase.rpc('public_profile', { p_nickname: nickname });
  if (error) throw error;
  return data || null;
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

/**
 * Забирает сборку и отдаёт готовый файл браузеру.
 *
 * Крупная сборка хранится кусками, поэтому просто перейти по ссылке нельзя:
 * куски скачиваются подряд и склеиваются в один файл уже здесь. Для цельного
 * файла ничего не меняется — переход по ссылке, как раньше.
 */
export async function downloadRelease(gameSlug, platform, { version, onProgress } = {}) {
  const link = await getDownloadLink(gameSlug, platform, version);

  // Магазин или обычный одиночный файл — отдаём браузеру ссылку.
  if (link.external || !link.parts || link.parts <= 1) {
    location.href = link.url;
    return link;
  }

  const blobs = [];
  for (let i = 0; i < link.urls.length; i++) {
    const res = await fetch(link.urls[i]);
    if (!res.ok) throw new Error('part_' + (i + 1) + '_' + res.status);
    blobs.push(await res.blob());
    if (onProgress) onProgress(Math.floor(((i + 1) / link.urls.length) * 100));
  }

  const name = decodeURIComponent(new URL(link.urls[0]).pathname.split('/').pop())
    .replace(/\.part\d+$/, '');
  const url = URL.createObjectURL(new Blob(blobs, { type: 'application/octet-stream' }));

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Освобождаем память не сразу: браузеру нужно время начать сохранение.
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  return link;
}

/* ── Админка ───────────────────────────────────────────────────────────── */

/** Перенос покупки на другой аккаунт: игрок потерял доступ к прежней почте. */
export async function adminTransferLicense(fromEmail, toEmail, gameSlug) {
  const { error } = await supabase.rpc('admin_transfer_license', {
    p_from_email: fromEmail, p_to_email: toEmail, p_game_slug: gameSlug,
  });
  if (error) throw error;
}

/** Отмена неоплаченного заказа: чтобы не висел в списке и не мешал новому. */
export async function adminCancelOrder(orderId, reason) {
  const { error } = await supabase.rpc('admin_cancel_order', {
    p_order_id: orderId, p_reason: reason || null,
  });
  if (error) throw error;
}

/** Возврат: заказ помечается возвращённым, лицензия снимается. */
export async function adminRefundOrder(orderId, reason) {
  const { error } = await supabase.rpc('admin_refund_order', {
    p_order_id: orderId, p_reason: reason || null,
  });
  if (error) throw error;
}

export async function adminDailyStats(days = 30) {
  const { data, error } = await supabase.rpc('admin_daily_stats', { p_days: days });
  if (error) throw error;
  return data;
}

export async function adminTotals() {
  const { data, error } = await supabase.rpc('admin_totals');
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

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
 * Правка уже выпущенной сборки: описание и признак «текущая».
 * Пригождается, когда в заметках опечатка или свежую версию надо откатить,
 * вернув игрокам предыдущую.
 */
export async function adminEditRelease(id, { notes = null, makeCurrent = null } = {}) {
  const { error } = await supabase.rpc('admin_edit_release', {
    p_id: id,
    p_notes: notes,
    p_make_current: makeCurrent,
  });
  if (error) throw error;
}

/**
 * Кладёт большой файл в хранилище по частям (протокол TUS).
 *
 * Обычная загрузка одним запросом упирается в предел размера тела: установщик
 * на 174 МБ отваливался с невнятным 400. Здесь файл уезжает кусками по 6 МБ,
 * а по пути видно проценты.
 *
 * Протокол реализован прямо здесь, без библиотеки с чужого CDN: сначала так и
 * было, но динамический импорт tus-js-client молча не доходил до конца, и
 * загрузка обрывалась ещё до первого сетевого запроса. Своих строк меньше
 * сотни, зато зависимость ровно одна — само хранилище.
 */
const CHUNK = 6 * 1024 * 1024;   // требование Supabase: ровно 6 МБ

/**
 * Размер куска, на которые режется крупная сборка.
 *
 * На бесплатном тарифе Supabase не принимает файл больше 50 МБ — это
 * общий предел проекта, его не обойти ни одним способом загрузки. Берём 40 МБ
 * с запасом: так установщик на 174 МБ ложится пятью частями.
 */
const PART_SIZE = 40 * 1024 * 1024;

/** Метаданные TUS едут одной строкой: «ключ base64(значение)» через запятую. */
function tusMetadata(fields) {
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return Object.entries(fields)
    .map(([k, v]) => `${k} ${b64(String(v))}`)
    .join(',');
}

async function uploadResumable(bucket, path, file, onProgress) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');

  // Прямой адрес хранилища: он заметно быстрее на больших файлах.
  const endpoint = SUPABASE_URL.replace('.supabase.co', '.storage.supabase.co')
    + '/storage/v1/upload/resumable';

  const auth = {
    authorization: 'Bearer ' + session.access_token,
    apikey: SUPABASE_KEY,
    'Tus-Resumable': '1.0.0',
  };

  const explain = async (res, step) => {
    const text = await res.text().catch(() => '');
    const err = new Error(`upload_${step}_${res.status}`);
    err.status = res.status;
    err.detail = text.slice(0, 300);
    console.error('Загрузка (' + step + '): ' + res.status + ' ' + err.detail);
    return err;
  };

  // 1. Заводим загрузку и получаем её личный адрес.
  const create = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...auth,
      'Upload-Length': String(file.size),
      'Upload-Metadata': tusMetadata({
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      }),
      'x-upsert': 'true',
    },
  });
  if (!create.ok && create.status !== 201) throw await explain(create, 'create');

  const location = create.headers.get('location');
  if (!location) throw new Error('upload_no_location');
  const uploadUrl = new URL(location, endpoint).href;

  // 2. Шлём файл кусками, каждый раз сообщая, сколько уже принято.
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK, file.size));
    const res = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        ...auth,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
      },
      body: chunk,
    });
    if (!res.ok) throw await explain(res, 'chunk');

    // Смещение берём от сервера: он — источник правды о принятом объёме.
    const accepted = parseInt(res.headers.get('upload-offset') || '', 10);
    offset = Number.isFinite(accepted) ? accepted : offset + chunk.size;

    if (onProgress) onProgress('upload', Math.floor((offset / file.size) * 100));
  }
}

/**
 * Проверка связи с хранилищем на крошечном файле.
 *
 * Гонять ради диагностики стомегабайтный установщик мучительно: проверка
 * проходит тот же путь (создание загрузки → кусок → удаление) за секунду и
 * возвращает понятный результат.
 */
export async function adminTestUpload() {
  const path = '_probe/' + Date.now() + '.txt';
  const file = new File(['probe'], 'probe.txt', { type: 'text/plain' });
  const steps = [];

  try {
    await uploadResumable('releases', path, file, (stage, pct) => {
      steps.push(stage + (pct != null ? ' ' + pct + '%' : ''));
    });
  } catch (e) {
    return { ok: false, step: 'upload', message: e.message, detail: e.detail || '', steps };
  }

  // Прибираем за собой: пробник в каталоге сборок не нужен.
  const { error } = await supabase.storage.from('releases').remove([path]);
  if (error) return { ok: true, step: 'cleanup', message: error.message, steps };

  return { ok: true, steps };
}

/**
 * Загружает файл сборки в приватный бакет и заводит релиз.
 * Файл идёт напрямую в хранилище, минуя наш сервер, — иначе стомегабайтный
 * установщик пришлось бы прогонять через функцию.
 */
export async function adminUploadRelease({ gameSlug, platform, version, file, notes, makeCurrent = true, onProgress }) {
  const path = `${gameSlug}/${version}/${file.name}`;

  // Бесплатный тариф Supabase не принимает файл больше 50 МБ, а установщик
  // весит под двести. Поэтому крупная сборка уезжает кусками по 40 МБ —
  // «…exe.part1», «…exe.part2» и так далее, — а игрок склеивает их обратно.
  const parts = Math.ceil(file.size / PART_SIZE) || 1;

  if (parts > 1) {
    for (let i = 0; i < parts; i++) {
      const slice = file.slice(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, file.size));
      const chunk = new File([slice], `${file.name}.part${i + 1}`,
        { type: 'application/octet-stream' });

      await uploadResumable('releases', `${path}.part${i + 1}`, chunk, (stage, pct) => {
        // Проценты считаем по всему файлу, а не по текущему куску: игроку
        // (и нам) важен общий ход, а не то, какая часть идёт сейчас.
        if (!onProgress || stage !== 'upload') return;
        const done = (i + (pct || 0) / 100) / parts;
        onProgress('upload', Math.floor(done * 100));
      });
    }
  } else if (file.size > 6 * 1024 * 1024) {
    await uploadResumable('releases', path, file, onProgress);
  } else {
    const { error: upErr } = await supabase.storage
      .from('releases')
      .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if (upErr) throw upErr;
  }

  if (onProgress) onProgress('checksum');
  // Сумму считаем целиком в памяти. На очень большом файле браузер может не
  // выдержать — тогда выпуск всё равно состоится, просто игра не сверит
  // целостность скачанного. Терять из-за этого загруженный установщик глупо.
  let sha256 = null;
  try {
    sha256 = await fileSha256(file);
  } catch (e) {
    console.warn('Контрольная сумма не посчиталась, релиз выйдет без неё:', e);
  }

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
    p_parts: parts,
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

/* ── Бейджи ──────────────────────────────────────────────────────────────
   Отметка студии рядом с ником: «бета-тестер», «победитель турнира». Каталог
   ведёт администратор, игрок себе ничего выдать не может — иначе отметка
   ничего бы не значила (правила живут в политиках, см. 0006_badges.sql). */

export const BADGE_ICON_MAX_BYTES = 48 * 1024;

/** Весь каталог — нужен и админке, и странице, где бейджи объясняются. */
export async function listBadges() {
  const { data, error } = await supabase
    .from('badges')
    .select('slug, title_ru, title_en, hint_ru, hint_en, icon_url, color, '
          + 'nick_allowed, nick_forced, hide_in_profile, created_at')
    .order('created_at');
  if (error) throw error;
  return data || [];
}

/** Свои бейджи вошедшего — с флагами, чтобы кабинет знал, что закрепляется. */
export async function getMyBadges() {
  const { data, error } = await supabase
    .from('my_badges')
    .select('slug, title_ru, title_en, hint_ru, hint_en, icon_url, color, '
          + 'nick_allowed, nick_forced, hide_in_profile, pinned, granted_at');
  if (error) throw error;
  return data || [];
}

/** Закрепить или снять свой бейдж у ника. Только для тех, что это разрешают. */
export async function pinBadge(slug, pinned) {
  const { error } = await supabase.rpc('badge_pin', { p_slug: slug, p_pinned: !!pinned });
  if (error) throw error;
}

/** Кому видна страна в профиле: 'public' | 'friends' | 'none'. */
export async function setCountryVisibility(mode) {
  const { error } = await supabase.rpc('set_country_visibility', { p_mode: mode });
  if (error) throw error;
}

export async function adminSaveBadge(badge) {
  const row = {
    slug: String(badge.slug || '').trim().toLowerCase(),
    title_ru: String(badge.title_ru || '').trim(),
    title_en: String(badge.title_en || '').trim(),
    hint_ru: badge.hint_ru ? String(badge.hint_ru).trim() : null,
    hint_en: badge.hint_en ? String(badge.hint_en).trim() : null,
    icon_url: badge.icon_url || null,
    color: badge.color || null,
    // Повадки бейджа. «Всегда в нике» подразумевает разрешение — база это
    // проверяет, но чинить значение лучше здесь, чем ловить ошибку.
    nick_allowed: badge.nick_forced ? true : badge.nick_allowed !== false,
    nick_forced: !!badge.nick_forced,
    hide_in_profile: !!badge.hide_in_profile,
  };
  if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(row.slug)) throw new Error('bad_badge_slug');
  if (!row.title_ru || !row.title_en) throw new Error('badge_title_required');
  if (row.icon_url && row.icon_url.length > BADGE_ICON_MAX_BYTES) throw new Error('badge_icon_too_big');

  // upsert по slug: правка существующего бейджа — то же действие, что создание.
  const { error } = await supabase.from('badges').upsert(row, { onConflict: 'slug' });
  if (error) throw error;
  return row;
}

export async function adminDeleteBadge(slug) {
  const { error } = await supabase.from('badges').delete().eq('slug', slug);
  if (error) throw error;
}

export async function adminGrantBadge(nickname, slug) {
  const { error } = await supabase.rpc('badge_grant', { p_nickname: nickname, p_slug: slug });
  if (error) throw error;
}

export async function adminRevokeBadge(nickname, slug) {
  const { error } = await supabase.rpc('badge_revoke', { p_nickname: nickname, p_slug: slug });
  if (error) throw error;
}

export async function adminBadgeHolders(slug) {
  const { data, error } = await supabase.rpc('badge_holders', { p_slug: slug });
  if (error) throw error;
  return data || [];
}

/**
 * Готовит картинку бейджа: вписывает в квадрат и отдаёт PNG (прозрачность
 * иконке нужна — она стоит рядом с ником, а не в рамке). Если PNG не влез в
 * лимит, уменьшаем сторону, а не качество: у PNG его нет.
 */
export function badgeIconFromFile(file, size = 96) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('avatar_not_image')); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) { reject(new Error('avatar_not_image')); return; }
        for (let px = size; px >= 32; px -= 16) {
          const cv = document.createElement('canvas');
          cv.width = cv.height = px;
          const ctx = cv.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img,
            (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
            0, 0, px, px);
          const out = cv.toDataURL('image/png');
          if (out.length <= BADGE_ICON_MAX_BYTES) { resolve(out); return; }
        }
        reject(new Error('badge_icon_too_big'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('avatar_not_image')); };
    img.src = url;
  });
}

/* ── Регион аккаунта ─────────────────────────────────────────────────────
   Регион определяет валюту цен, поэтому меняется не кнопкой, а заявкой:
   игрок объясняет причину, студия решает. Решение и письмо игроку делает
   edge-функция region-decide — одним действием, чтобы не расходились. */

export async function requestRegionChange(country, reason) {
  const { data, error } = await supabase.rpc('region_request', {
    p_country: String(country || '').trim().toUpperCase(),
    p_reason: String(reason || '').trim(),
  });
  if (error) throw error;
  return data;
}

export async function cancelRegionRequest() {
  const { error } = await supabase.rpc('region_request_cancel');
  if (error) throw error;
}

/** Последняя заявка игрока: и открытая, и уже рассмотренная. */
export async function getMyRegionRequest() {
  const { data, error } = await supabase
    .from('my_region_request')
    .select('id, to_country, to_currency, reason, status, admin_comment, created_at, decided_at')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function adminListRegionRequests() {
  const { data, error } = await supabase.rpc('region_requests_open');
  if (error) throw error;
  return data || [];
}

/**
 * Решение по заявке. Идёт через edge-функцию: она меняет регион и тут же
 * отправляет письмо игроку. Возвращает { mailed: boolean, reason?: string } —
 * решение сохраняется даже если почта не настроена, и админка об этом скажет.
 */
export async function adminDecideRegionRequest(id, approve, comment = '') {
  const { data, error } = await supabase.functions.invoke('region-decide', {
    body: { id, approve: !!approve, comment: String(comment || '').trim() },
  });
  if (error) {
    // Тело ответа функции информативнее, чем «non-2xx status code».
    let detail = '';
    try { detail = (await error.context?.json())?.error || ''; } catch { /* не JSON */ }
    throw new Error(detail || error.message);
  }
  return data || { mailed: false };
}

/* ── Блокировка аккаунта ─────────────────────────────────────────────────
   Вход забаненному оставлен намеренно: иначе он не увидит ни причины, ни
   срока — только «неверный пароль». Всё остальное ему закрыто в самой базе,
   а страницы аккаунта уводят на /banned/. */

/**
 * Блокировка текущего игрока или null, если её нет.
 * `until === null` при active === true означает «навсегда».
 */
export async function getMyBan() {
  const { data, error } = await supabase
    .from('my_ban')
    .select('nickname, banned_at, banned_until, ban_reason, active')
    .maybeSingle();
  if (error) return null;              // нет сессии или старая база — не бан
  return data && data.active ? data : null;
}

/** Заблокировать игрока. `until = null` — навсегда, иначе дата снятия. */
export async function adminBan(nickname, until, reason) {
  const { data, error } = await supabase.rpc('admin_ban', {
    p_nickname: String(nickname || '').trim(),
    p_until: until ? new Date(until).toISOString() : null,
    p_reason: String(reason || '').trim(),
  });
  if (error) throw error;
  return data;
}

export async function adminUnban(nickname) {
  const { error } = await supabase.rpc('admin_unban', {
    p_nickname: String(nickname || '').trim(),
  });
  if (error) throw error;
}

/** Все блокировки: действующие сверху, истёкшие — ниже, как история. */
export async function adminListBans() {
  const { data, error } = await supabase.rpc('admin_bans');
  if (error) throw error;
  return data || [];
}

/* ── Человекочитаемые сообщения вместо английских ошибок Supabase ────────
   Правило = что должно найтись в тексте ошибки + пара «по-русски / по-английски».
   Порядок важен: первое совпадение и отвечает. Язык берём с самой страницы —
   тот же атрибут, по которому сайт прячет неактивные надписи. */
const ERROR_RULES = [
  { any: ['invalid login credentials'], ru: 'Неверная почта или пароль.', en: 'Wrong email or password.' },
  { any: ['email not confirmed'], ru: 'Почта не подтверждена — проверь входящие.', en: 'Email not confirmed — check your inbox.' },
  { any: ['user already registered'], ru: 'Такая почта уже зарегистрирована.', en: 'That email is already registered.' },
  { any: ['password should be at least'], ru: 'Пароль слишком короткий — минимум 6 символов.', en: 'Password too short — 6 characters minimum.' },
  { all: ['duplicate key', 'nickname'], ru: 'Этот ник уже занят.', en: 'That nickname is taken.' },
  { any: ['unable to validate email'], ru: 'Проверь правильность адреса почты.', en: 'Check that the email address is correct.' },
  // Код из письма: истёк, введён с опечаткой или уже использован.
  { any: ['token has expired', 'otp_expired', 'expired_token'],
    ru: 'Код устарел. Запросите новый — он действует один час.',
    en: 'The code has expired. Ask for a new one — codes last an hour.' },
  { any: ['invalid token', 'token not found', 'otp_disabled', 'invalid_otp'],
    ru: 'Код не подошёл. Проверьте цифры или запросите новый.',
    en: 'That code did not work. Check the digits or request a new one.' },
  { any: ['for security purposes', 'rate limit'],
    ru: 'Слишком много попыток. Подожди минуту и попробуй снова.',
    en: 'Too many attempts. Wait a minute and try again.' },
  { any: ['failed to fetch'], ru: 'Нет связи с сервером. Проверь интернет.', en: 'No connection to the server. Check your internet.' },
  { any: ['already_owned'], ru: 'Эта игра уже есть на твоём аккаунте.', en: 'This game is already on your account.' },
  { any: ['not_authenticated'], ru: 'Сначала войди в аккаунт.', en: 'Sign in first.' },
  { any: ['user_not_found'], ru: 'Игрок с такой почтой не найден.', en: 'No player with that email.' },
  { any: ['game_not_found'], ru: 'Игра не найдена или ещё не вышла.', en: 'Game not found, or not released yet.' },
  { any: ['price_not_set'], ru: 'Для этой игры не задана цена.', en: 'No price is set for this game.' },
  { any: ['order_not_found'], ru: 'Заказ не найден.', en: 'Order not found.' },
  { any: ['forbidden'], ru: 'Нужны права администратора.', en: 'Administrator rights are required.' },
  { any: ['bad_nickname'], ru: 'Ник: 3-20 символов, латиница, цифры, _ и -', en: 'Nickname: 3-20 characters, Latin letters, digits, _ and -' },
  { any: ['nickname_taken'], ru: 'Этот ник уже занят.', en: 'That nickname is taken.' },
  { any: ['nickname_too_soon'], ru: 'Ник можно менять раз в сутки.', en: 'A nickname can be changed once a day.' },
  { any: ['admin_cannot_self_delete'],
    ru: 'Аккаунт администратора нельзя удалить из профиля.',
    en: 'An administrator account cannot be deleted from the profile.' },
  { any: ['same_password'], ru: 'Новый пароль совпадает со старым.', en: 'The new password matches the old one.' },
  { any: ['avatar_not_image'], ru: 'Это не картинка. Подойдут JPG, PNG или WebP.', en: 'That is not an image. JPG, PNG or WebP will do.' },
  { any: ['avatar_too_big'],
    ru: 'Картинку не удалось ужать. Возьмите изображение попроще.',
    en: 'The image could not be compressed. Try a simpler picture.' },
  { any: ['avatar_bad_format'], ru: 'Неподдерживаемый формат картинки.', en: 'Unsupported image format.' },
  // PostgREST так отвечает, когда функции в базе ещё нет. Для владельца это
  // однозначный сигнал: миграция не применена, а не «что-то сломалось».
  { any: ['could not find the function', 'schema cache'],
    ru: 'Эта возможность ещё не включена в базе: примените миграцию supabase/migrations/0002_friends.sql в SQL Editor.',
    en: 'This feature is not enabled in the database yet: apply supabase/migrations/0002_friends.sql in the SQL Editor.' },
  // Отказ политики RLS. Для владельца это почти всегда «нет прав админа»,
  // а не поломка — сырой текст Postgres тут только пугает.
  { any: ['row-level security'], ru: 'Недостаточно прав: нужен аккаунт администратора.', en: 'Not enough rights: an administrator account is required.' },
  { any: ['not_friends'], ru: 'Позвать в комнату можно только друга.', en: 'Only a friend can be invited to a room.' },
  { any: ['bad_room'], ru: 'Некорректный код комнаты.', en: 'Invalid room code.' },
  { any: ['player_not_found'], ru: 'Игрок с таким ником не найден.', en: 'No player with that nickname.' },
  { any: ['cannot_add_self'], ru: 'Себя в друзья добавить нельзя.', en: 'You cannot add yourself as a friend.' },
  { any: ['request_not_found'], ru: 'Заявка уже отозвана или принята.', en: 'That request was already withdrawn or accepted.' },
  { any: ['stats_too_big'], ru: 'Сводка прогресса слишком большая.', en: 'The progress summary is too large.' },
  // Бейджи.
  { any: ['bad_badge_slug'], ru: 'Код бейджа: латиница, цифры и дефис, 2–39 символов.', en: 'Badge code: Latin letters, digits and hyphens, 2-39 characters.' },
  { any: ['badge_title_required'], ru: 'Заполните название бейджа на обоих языках.', en: 'Fill in the badge title in both languages.' },
  { any: ['badge_icon_too_big'], ru: 'Иконку не удалось ужать. Возьмите картинку попроще.', en: 'The icon could not be compressed. Try a simpler picture.' },
  { any: ['badge_not_found'], ru: 'Такого бейджа нет.', en: 'No such badge.' },
  // Заявки на смену региона.
  { any: ['reason_too_short'], ru: 'Опишите причину подробнее — не меньше 30 символов.', en: 'Describe the reason in more detail — at least 30 characters.' },
  { any: ['request_pending'], ru: 'Заявка уже отправлена и ждёт решения.', en: 'A request is already waiting for a decision.' },
  { any: ['same_region'], ru: 'Этот регион уже стоит в аккаунте.', en: 'That region is already set on your account.' },
  { any: ['bad_country'], ru: 'Выберите страну из списка.', en: 'Pick a country from the list.' },
  { any: ['already_decided'], ru: 'По этой заявке уже принято решение.', en: 'This request has already been decided.' },
  { any: ['smtp_not_configured'],
    ru: 'Решение сохранено, но письмо не ушло: в секретах Supabase нет SMTP_USER и SMTP_PASS.',
    en: 'The decision is saved, but no email was sent: SMTP_USER and SMTP_PASS are missing from the Supabase secrets.' },
  { any: ['payments_not_configured'],
    ru: 'Приём оплаты ещё настраивается. Напишите нам — выдадим лицензию вручную.',
    en: 'Payments are still being set up. Write to us and we will grant the licence by hand.' },
  { any: ['provider_error', 'no_payment_url'],
    ru: 'Платёжная система не приняла заказ. Попробуйте позже или напишите нам.',
    en: 'The payment provider rejected the order. Try later or write to us.' },
  { any: ['currency_not_supported'],
    ru: 'Оплата пока доступна только для России. Первый мир игры открыт бесплатно.',
    en: 'Payments are available in Russia only for now. The first world of the game is free.' },
  { any: ['payment_failed'], ru: 'Не удалось создать счёт. Попробуйте ещё раз.', en: 'Could not create the invoice. Please try again.' },
  // Блокировки.
  { any: ['account_banned'],
    ru: 'Аккаунт заблокирован — действие недоступно.',
    en: 'The account is blocked — this action is unavailable.' },
  { any: ['cannot_ban_admin'], ru: 'Администратора заблокировать нельзя.', en: 'An administrator cannot be blocked.' },
  { any: ['ban_reason_required'], ru: 'Укажите причину блокировки — её увидит игрок.', en: 'Give a reason for the block — the player will see it.' },
  { any: ['ban_until_past'], ru: 'Срок блокировки должен быть в будущем.', en: 'The block must end in the future.' },
];

export function humanError(err) {
  const m = (err?.message || '').toLowerCase();
  const en = typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-site-lang') === 'en';
  for (const rule of ERROR_RULES) {
    const hit = rule.all
      ? rule.all.every((needle) => m.includes(needle))
      : rule.any.some((needle) => m.includes(needle));
    if (hit) return en ? rule.en : rule.ru;
  }
  return err?.message || (en ? 'Unknown error.' : 'Неизвестная ошибка.');
}
