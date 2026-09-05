/**
 * ШЛЮЗ ВЕБ-ВЕРСИИ
 * ═══════════════
 * Пускает в браузерную игру только если выполнены оба условия:
 *
 *   1. Веб-версия ОТКРЫТА. Флаг живёт в Supabase (app_config.bb_web_open),
 *      поэтому закрыть её можно из панели, без пересборки и выкладывания сайта.
 *   2. У игрока ЕСТЬ ЛИЦЕНЗИЯ на Byte Blaster.
 *
 * Не выполнено — игрока уводит на главную страницу сайта, даже если он пришёл
 * прямо по адресу игры.
 *
 * Про честность защиты. Это клиентская проверка, и обойти её теоретически можно,
 * отключив JavaScript, — но без JavaScript игра всё равно не запустится, она вся
 * на нём. То есть шлюз ровно настолько же прочен, насколько сама страница.
 * НАСТОЯЩАЯ защита стоит там, где лежат файлы: архивные сборки хранятся в
 * приватном бакете Supabase, права на который нет ни у кого, кроме серверной
 * функции build-access, и она подписывает ссылку только после проверки лицензии.
 * Поэтому файлы сборок и не выкладываются на GitHub — оттуда их мог бы забрать
 * кто угодно, и никакой шлюз бы не помог.
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
export async function guardWebPlay(sdk) {
  const open = await config('bb_web_open', '1');
  if (open === '0' || open.toLowerCase() === 'false') { bounce('closed'); return false; }

  // SDK старее шлюза (браузер отдал модуль из кэша без метки ?v=) — проверить
  // лицензию нечем. Выгонять в этом случае нельзя: пострадает тот, кто купил,
  // а не тот, кто не купил. Пускаем и оставляем след в консоли.
  if (typeof sdk.getSession !== 'function') {
    console.warn('web-gate: в загруженном pixset-auth.js нет getSession — проверка пропущена. Обновите метку ?v= (node sync-sdk.js).');
    return true;
  }

  let session = null;
  try { session = await sdk.getSession(); } catch (e) { session = null; }
  if (!session) { bounce('login'); return false; }

  let ents = [];
  try { ents = await sdk.getEntitlements(); } catch (e) { ents = []; }
  const owns = Array.isArray(ents) && ents.some(e => e && e.game_slug === GAME_SLUG);
  if (!owns) { bounce('license'); return false; }

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
  if (!r.ok) throw new Error(data.error || ('http_' + r.status));
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
