/**
 * ШЛЮЗ ВЕБ-ВЕРСИИ
 * ═══════════════
 * Единственное условие: веб-версия должна быть ОТКРЫТА. Флаг живёт в Supabase
 * (app_config.bb_web_open), поэтому закрыть её можно из панели, без пересборки
 * и выкладывания сайта.
 *
 * Лицензию шлюз НЕ проверяет — и не должен. Первый мир объявлен бесплатным на
 * всех страницах сайта, а игра сама решает, что показать: без лицензии на
 * аккаунте включается демо (assets/demo.js — первый мир, без бесконечного
 * режима, хардкора и кооператива), с лицензией открывается всё. Раньше шлюз
 * требовал лицензию и уводил на страницу покупки — «первый мир бесплатно»
 * оказывалось неправдой, поиграть не мог никто, кроме владельцев.
 *
 * Про честность защиты. Полную версию открывает не эта страница, а лицензия на
 * аккаунте: её проверяет сама игра при каждом запуске. Файлы сборок лежат в
 * приватном бакете Supabase, ссылку на них подписывает серверная функция
 * build-access и только владельцу — поэтому на GitHub их и нет.
 */
const SB_URL = 'https://zyjhvuhovimorpokiwty.supabase.co';
const SB_KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';
const GAME_SLUG = 'byte-blaster';
const HOME = '/byte-blaster/';

/** Значение из app_config. Ошибка сети НЕ закрывает игру: падение Supabase не
 *  должно отбирать доступ у тех, кто честно купил. */
async function config(key, dflt) {
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/app_config?key=eq.' + encodeURIComponent(key) + '&select=value',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!r.ok) return dflt;
    const rows = await r.json();
    if (!rows || !rows.length) return dflt;
    return String(rows[0].value ?? '').trim();
  } catch (e) { return dflt; }
}

function bounce(reason) {
  try { sessionStorage.setItem('bbGateReason', reason); } catch (e) {}
  location.replace(HOME + '?gate=' + encodeURIComponent(reason));
}

/**
 * @param {{getSession:Function,getEntitlements:Function}} sdk — модуль pixset-auth
 * @returns {Promise<boolean>} true, если играть можно
 */
export async function guardWebPlay() {
  const open = await config('bb_web_open', '1');
  if (open === '0' || open.toLowerCase() === 'false') { bounce('closed'); return false; }
  return true;
}

/** Подписанная ссылка на архивную сборку. Выдаёт серверная функция, и только
 *  при действующей лицензии — здесь мы её лишь просим. */
export async function buildUrl(sdk, buildId) {
  const session = await sdk.getSession();
  if (!session) throw new Error('not_signed_in');
  const token = session.access_token || (session.session && session.session.access_token);
  const r = await fetch(SB_URL + '/functions/v1/build-access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ game_slug: GAME_SLUG, build_id: buildId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // У функции verify_jwt=true, поэтому просроченный токен отбивает шлюз
    // Supabase — до нашего кода запрос не доходит и поля `error` в ответе нет,
    // только своё `message`. Без этой ветки владелец лицензии видел бы
    // «http_401» вместо «войдите заново».
    throw new Error(data.error || (r.status === 401 ? 'bad_token' : 'http_' + r.status));
  }
  return data.url;
}

/** Каталог архивных сборок. Тут только описания — файлов и ссылок нет. */
export async function listBuilds() {
  const r = await fetch(
    SB_URL + '/rest/v1/game_builds?game_slug=eq.' + GAME_SLUG +
    '&is_archive=eq.true&select=id,version,label,published_at&order=sort.desc,published_at.desc',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) return [];
  return await r.json();
}
