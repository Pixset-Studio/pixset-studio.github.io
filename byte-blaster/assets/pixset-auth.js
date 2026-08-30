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
export const SDK_VERSION = 'c86bb96e';

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
  if (m.includes('avatar_not_image')) return 'Это не картинка. Подойдут JPG, PNG или WebP.';
  if (m.includes('avatar_too_big'))   return 'Картинку не удалось ужать. Возьмите изображение попроще.';
  if (m.includes('avatar_bad_format'))return 'Неподдерживаемый формат картинки.';
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
