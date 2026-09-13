/* Pixset Studio — общие куски интерфейса аккаунта.
 *
 * Живёт отдельным модулем, потому что аккаунт и админка есть на ДВУХ сайтах —
 * студии и Byte Blaster, — и они обязаны быть наполнены одинаково. Всё, что
 * иначе пришлось бы копировать (бейджи у ника, список стран, подписи), лежит
 * здесь; страницы отличаются только своей вёрсткой вокруг.
 *
 * Стили классов .bdg/.nbdg — в studio.css (сайт студии) и site.css (Byte
 * Blaster): оформление у сайтов разное, разметка одна.
 */
import { supabase, searchPlayers } from './pixset-auth.js?v=df325895';

/** Язык страницы. Обе площадки держат его в одном атрибуте на <html>. */
export function uiLang() {
  return document.documentElement.getAttribute('data-site-lang') === 'en' ? 'en' : 'ru';
}
const L = (ru, en) => (uiLang() === 'en' ? en : ru);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Страны ──────────────────────────────────────────────────────────────
   Коды ISO 3166-1 alpha-2 целиком: игрок может жить где угодно, и «страны нет
   в списке» — плохой ответ. Названия берёт сам браузер (Intl.DisplayNames),
   поэтому словарь на два языка держать не нужно, а список сразу совпадает с
   тем, как страну называет система игрока. */
export const COUNTRY_CODES = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS',
  'BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN',
  'CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE',
  'EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF',
  'GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM',
  'HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM',
  'JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC',
  'LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK',
  'ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA',
  'NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG',
  'PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS',
  'ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO',
  'TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI',
  'VN','VU','WF','WS','YE','YT','ZA','ZM','ZW',
];

const nameCache = {};
function displayNames(lang) {
  if (!nameCache[lang]) {
    try { nameCache[lang] = new Intl.DisplayNames([lang], { type: 'region' }); }
    catch { nameCache[lang] = null; }        // очень старый браузер — обойдёмся кодом
  }
  return nameCache[lang];
}

/** Название страны на языке страницы. Без кода в списке — вернём сам код. */
export function countryName(code, lang = uiLang()) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const dn = displayNames(lang);
  try { return (dn && dn.of(cc)) || cc; } catch { return cc; }
}

/** Флаг эмодзи из кода страны: две региональные буквы. */
export function countryFlag(code) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Страны, отсортированные по названию на текущем языке. */
export function countryOptions(lang = uiLang()) {
  return COUNTRY_CODES
    .map((code) => ({ code, name: countryName(code, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/* ── Показатели игр ──────────────────────────────────────────────────────
   Что игра публикует о своём игроке и как это называется по-человечески.
   Один список на два места: публичный профиль рисует по нему карточки, а
   админка предлагает эти же поля как условие выдачи бейджа. Добавили игре
   новое число — допишите строку сюда, и оно появится в обоих местах.

   `max` — ключ с максимумом (для полосы прогресса), `fmt: 'time'` — секунды. */
export const STAT_GROUPS = [
  {
    ru: 'Прохождение', en: 'Campaign',
    fields: [
      { key: 'levels',     ico: '▦',  max: 'levelsMax',   ru: 'Уровни кампании',       en: 'Campaign levels' },
      { key: 'hardcore',   ico: '💀', max: 'hardcoreMax', ru: 'Уровни в хардкоре',     en: 'Hardcore levels' },
      { key: 'worlds',     ico: '🌐', max: 'worldsMax',   ru: 'Открыто миров',         en: 'Worlds reached' },
      { key: 'bosses',     ico: '👹', max: 'bossesMax',   ru: 'Побеждено боссов',      en: 'Bosses defeated' },
      { key: 'bossesHard', ico: '☠️', max: 'bossesMax',   ru: 'Боссы в хардкоре',      en: 'Bosses on hardcore' },
      { key: 'stars',      ico: '⭐', max: 'starsMax',    ru: 'Собрано звёзд',         en: 'Stars collected' },
      { key: 'stars3',     ico: '✨', ru: 'Уровней на три звезды',                     en: 'Levels at three stars' },
      { key: 'crystals',   ico: '💠', max: 'crystalsMax', ru: 'Кристаллы данных',      en: 'Data crystals' },
      { key: 'rainbow',    ico: '🌈', max: 'rainbowMax',  ru: 'Радужные осколки',      en: 'Rainbow shards' },
      { key: 'ach',        ico: '🏆', max: 'achMax',      ru: 'Достижения',            en: 'Achievements' },
      { key: 'logs',       ico: '📖', max: 'logsMax',     ru: 'Записи сюжетного архива', en: 'Story archive entries' },
      // Общую долю прохождения профиль показывает отдельной строкой над
      // числами, поэтому плиткой её не дублируем — но условием для бейджа она
      // нужна: «пройти игру на 100%» просят чаще всего.
      { key: 'completion', ico: '📈', ruleOnly: true,
        ru: 'Игра пройдена (1 = 100%)', en: 'Game completed (1 = 100%)' },
    ],
  },
  {
    ru: 'Рекорды', en: 'Records',
    fields: [
      { key: 'score',    ico: '🎯', ru: 'Очков за всё время',      en: 'Score all-time' },
      { key: 'bestAdv',  ico: '🚩', ru: 'Лучший забег в кампании', en: 'Best campaign run' },
      { key: 'bestInf',  ico: '♾️', ru: 'Рекорд в бесконечном',    en: 'Best endless run' },
      { key: 'coins',    ico: '🪙', ru: 'Собрано монет',           en: 'Coins collected' },
      { key: 'playtime', ico: '⏱️', ru: 'Времени в игре',          en: 'Time played', fmt: 'time' },
    ],
  },
  {
    ru: 'Боевой почерк', en: 'Combat record',
    fields: [
      { key: 'kills',        ico: '💥', ru: 'Побеждено врагов',     en: 'Enemies defeated' },
      { key: 'stompKills',   ico: '👟', ru: 'Врагов — прыжком',     en: 'Enemies — stomped' },
      { key: 'blasterKills', ico: '🔫', ru: 'Врагов — из бластера', en: 'Enemies — blasted' },
      { key: 'burnKills',    ico: '🔥', ru: 'Врагов — огнём',       en: 'Enemies — burned' },
      { key: 'freezeKills',  ico: '❄️', ru: 'Врагов — льдом',       en: 'Enemies — frozen' },
      { key: 'perfect',      ico: '💯', ru: 'Идеальных уровней',    en: 'Flawless levels' },
      { key: 'streak',       ico: '🔗', ru: 'Серия без смертей',    en: 'No-death streak' },
      { key: 'deaths',       ico: '⚰️', ru: 'Смертей за всё время', en: 'Deaths all-time' },
      { key: 'jumps',        ico: '🦿', ru: 'Прыжков сделано',      en: 'Jumps made' },
    ],
  },
];

/** Название показателя по ключу; неизвестный ключ возвращается как есть. */
export function statLabel(key, lang = uiLang()) {
  for (const group of STAT_GROUPS) {
    const f = group.fields.find((x) => x.key === key);
    if (f) return lang === 'en' ? f.en : f.ru;
  }
  return key;
}

/* ── Бейджи ──────────────────────────────────────────────────────────────
   Рядом с ником бейдж живёт КАРТИНКОЙ: подпись там не помещается, а строка
   ников превратилась бы в кашу. Название уезжает в подсказку. Развёрнутый вид
   с названием и объяснением — только в профиле (badgeRowHtml). */

/** Иконка бейджа у ника. Подсказка — название бейджа. */
export function badgeChipHtml(b) {
  const title = L(b.title_ru, b.title_en) || b.slug;
  const inner = /^data:image\/(png|jpeg|webp);base64,/.test(b.icon_url || '')
    ? `<img alt="${esc(title)}" src="${esc(b.icon_url)}">`
    : `<i style="background:${esc(b.color || '#ffd400')}"></i>`;
  return `<span class="nbdg" title="${esc(title)}">${inner}</span>`;
}

/** Строка бейджа в профиле: картинка, название и подсказка при наведении. */
export function badgeRowHtml(b) {
  const title = L(b.title_ru, b.title_en) || b.slug;
  const hint = L(b.hint_ru, b.hint_en) || '';
  const icon = /^data:image\/(png|jpeg|webp);base64,/.test(b.icon_url || '')
    ? `<img alt="" src="${esc(b.icon_url)}">`
    : `<i style="background:${esc(b.color || '#ffd400')}"></i>`;
  const style = b.color ? ` style="border-color:${esc(b.color)}"` : '';
  return `<div class="bdg"${style}${hint ? ` title="${esc(hint)}"` : ''}>
    ${icon}<b>${esc(title)}</b>${hint ? `<span class="bdg-hint">${esc(hint)}</span>` : ''}
  </div>`;
}

/* Ответ сервера держим в памяти страницы: ники на ней повторяются (свой в
   шапке, в карточке и в заголовке; чужие — в списке друзей и в поиске), а
   перерисовывать их приходится часто. */
const nickCache = new Map();

/** Бейджи «у ника» сразу для списка игроков — один запрос на всю страницу. */
export async function nickBadges(nicknames) {
  const names = [...new Set((nicknames || []).filter(Boolean))];
  const missing = names.filter((n) => !nickCache.has(n));

  if (missing.length) {
    // Порядок задаёт каталог (badges.sort_order): чем выше бейдж в списке
    // админки, тем ближе он к нику. Сортировку просим явно — на порядок строк
    // внутри витрины полагаться нельзя, его сохраняет не всякий запрос.
    const { data, error } = await supabase
      .from('nick_badges')
      .select('nickname, slug, title_ru, title_en, icon_url, color, nick_forced, sort_order')
      .in('nickname', missing)
      .order('sort_order')
      .order('nick_forced', { ascending: false })
      .order('granted_at');
    if (!error) {
      // Пустые списки тоже запоминаем: «у этого ника бейджей нет» — такой же
      // ответ, и спрашивать про него второй раз незачем.
      missing.forEach((n) => nickCache.set(n, []));
      (data || []).forEach((row) => { (nickCache.get(row.nickname) || []).push(row); });
    }
  }
  return new Map(names.map((n) => [n, nickCache.get(n) || []]));
}

/**
 * Забыть запомненные бейджи ника — после того, как их состав поменялся: игрок
 * закрепил другой, студия выдала или забрала. Без ника забывается вся
 * страница — так сбрасывают кэш после перестановки каталога: порядок общий, и
 * задет он сразу у всех ников на странице.
 */
export function forgetNickBadges(nickname) {
  if (nickname) nickCache.delete(nickname);
  else nickCache.clear();
}

/**
 * Дорисовывает бейджи ко всем никам на странице.
 *
 * Разметка помечает ник атрибутом data-nick="ник" — и всё; дальше эта функция
 * сама сходит в базу и добавит иконки. Так «бейдж виден везде» не требует
 * править каждый список по отдельности: списки друзей, поиск, таблицы, шапка.
 *
 * Рисуем от фактического состояния узла, а не от отметки «этот ник уже
 * обработан». Отметка подводила: страницы переписывают ник через textContent
 * (после смены ника, при повторной отрисовке профиля), вставленные иконки при
 * этом стираются, а отметка остаётся — и бейджи больше не возвращались.
 * Повторный вызов ничего не стоит: данные берутся из кэша.
 */
export async function paintNickBadges(root = document) {
  const nodes = [...root.querySelectorAll('[data-nick]')].filter((n) => n.dataset.nick);
  if (!nodes.length) return;

  const map = await nickBadges(nodes.map((n) => n.dataset.nick));
  nodes.forEach((node) => {
    const list = map.get(node.dataset.nick) || [];
    const html = list.length ? `<span class="nbdgs">${list.map(badgeChipHtml).join('')}</span>` : '';
    const old = node.querySelector(':scope > .nbdgs');
    if (old && old.outerHTML === html) return;      // уже нарисовано верно
    if (old) old.remove();
    if (html) node.insertAdjacentHTML('beforeend', html);
  });
}

// Язык меняется без перезагрузки — подсказки у иконок тоже.
document.addEventListener('pixset:lang', () => { paintNickBadges().catch(() => {}); });

/* ── Разделы длинной страницы ────────────────────────────────────────────
   И панель управления, и личный кабинет росли лентой: игроки, лицензии,
   бейджи, блокировки, заявки, сборки — всё подряд на одной странице, и до
   нужного места приходилось прокручивать пол-экрана.

   Разметку при этом не переписываем. Заголовок раздела помечен атрибутами
   data-sect="ключ" data-sect-title="Название", а эта функция сама разрезает
   ленту по таким заголовкам, складывает куски по разделам и рисует
   переключатель. Соседние заголовки с одним ключом попадают в один раздел —
   так «Заказы» и «События оплат» живут вместе, а разметка остаётся плоской.

   Английское название — в data-sect-title-en; без него подпись остаётся
   одинаковой на обоих языках (админку студия читает только по-русски).

   Выбранный раздел живёт в адресе (#players): перезагрузка страницы и
   закладка возвращают туда же, где человек работал. */
export function pageSections(root) {
  if (!root || root.dataset.sectioned) return;
  const heads = [...root.querySelectorAll('[data-sect]')];
  if (heads.length < 2) return;
  root.dataset.sectioned = '1';

  // Каждый заголовок забирает себе всё, что идёт следом до заголовка
  // следующего раздела.
  const order = [];
  const boxes = new Map();

  heads.forEach((head) => {
    const key = head.dataset.sect;
    if (!boxes.has(key)) {
      const box = document.createElement('div');
      box.className = 'sect';
      box.dataset.sect = key;
      box.dataset.title = head.dataset.sectTitle || key;
      box.dataset.titleEn = head.dataset.sectTitleEn || head.dataset.sectTitle || key;
      boxes.set(key, box);
      order.push(key);
      head.parentNode.insertBefore(box, head);
    }
    const box = boxes.get(key);
    let node = head;
    const chunk = [];
    while (node) {
      chunk.push(node);
      node = node.nextElementSibling;
      if (node && node.hasAttribute('data-sect')) break;
    }
    chunk.forEach((n) => box.appendChild(n));
  });

  const nav = document.createElement('div');
  nav.className = 'sectnav';
  order.forEach((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.go = key;
    nav.appendChild(b);
  });
  root.insertBefore(nav, root.firstChild);

  function paintTitles() {
    nav.querySelectorAll('button[data-go]').forEach((b) => {
      const box = boxes.get(b.dataset.go);
      b.textContent = uiLang() === 'en' ? box.dataset.titleEn : box.dataset.title;
    });
  }
  paintTitles();
  document.addEventListener('pixset:lang', paintTitles);

  function show(key) {
    const target = boxes.has(key) ? key : order[0];
    boxes.forEach((box, id) => { box.hidden = id !== target; });
    nav.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.go === target));
    });
    return target;
  }

  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-go]');
    if (!b) return;
    show(b.dataset.go);
    // Заменяем запись в истории, а не добавляем: «назад» должно уводить с
    // админки, а не листать разделы по одному.
    history.replaceState(null, '', '#' + b.dataset.go);
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  show(location.hash.replace('#', ''));
  window.addEventListener('hashchange', () => show(location.hash.replace('#', '')));
}

/** Прежнее имя: админки обеих площадок зовут функцию так. */
export const adminSections = pageSections;

/* ── Подсказки ника ──────────────────────────────────────────────────────
   Одно поведение на все поля, куда вводится ник: поиск игроков, друзья,
   сравнение, а в админке — выдача лицензии, бейджа и блокировка. Раньше
   подсказки были только у друзей, и в остальных местах ник приходилось
   вспоминать по буквам — включая точный регистр.

   Запрос уходит не на каждую букву: пауза в 220 мс склеивает быструю печать в
   один поход на сервер. Ответ на устаревший запрос отбрасывается — иначе
   список «догоняет» уже стёртый текст.

   Разметка не нужна: список создаётся сам и позиционируется под полем. */
export function attachNickSuggest(input, onPick) {
  if (!input || input.dataset.nickSuggest) return;
  input.dataset.nickSuggest = '1';
  input.setAttribute('autocomplete', 'off');

  const box = document.createElement('div');
  box.className = 'nick-suggest';
  box.style.cssText = 'position:absolute;z-index:60;display:none;max-height:240px;overflow-y:auto;'
    + 'background:var(--bg-2, #14141b);border:1px solid var(--line, rgba(255,255,255,.2));'
    + 'border-radius:8px;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,.35)';
  document.body.appendChild(box);

  let seq = 0, items = [], active = -1;

  const place = () => {
    const r = input.getBoundingClientRect();
    box.style.left = (r.left + window.scrollX) + 'px';
    box.style.top = (r.bottom + window.scrollY + 4) + 'px';
    box.style.width = r.width + 'px';
  };
  const close = () => { box.style.display = 'none'; active = -1; };

  const paint = () => {
    if (!items.length) { close(); return; }
    box.innerHTML = items.map((p, i) => `
      <div data-i="${i}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;${
        i === active ? 'background:rgba(127,127,127,.18);' : ''}">
        ${/^data:image\//.test(p.avatar_url || '')
          ? `<img alt="" src="${esc(p.avatar_url)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover">`
          : `<span style="width:24px;height:24px;border-radius:50%;display:grid;place-items:center;
               background:rgba(127,127,127,.2);font-size:12px">${esc((p.nickname || '?').charAt(0).toUpperCase())}</span>`}
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nickname)}</span>
      </div>`).join('');
    place();
    box.style.display = 'block';
    box.querySelectorAll('[data-i]').forEach((el) => {
      el.onmousedown = (ev) => {            // mousedown, а не click: blur успел бы закрыть список
        ev.preventDefault();
        choose(Number(el.dataset.i));
      };
    });
  };

  const choose = (i) => {
    const p = items[i];
    if (!p) return;
    input.value = p.nickname;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof onPick === 'function') onPick(p);
  };

  const look = async () => {
    const q = input.value.trim();
    if (q.length < 2) { items = []; close(); return; }
    const mine = ++seq;
    let rows = [];
    // Импорт статический, вверху файла: динамический `import()` пришлось бы
    // писать с меткой версии внутри строки, а её проставляет sync-sdk.js — и
    // адрес с другой меткой браузер считает вторым модулем, то есть ВТОРОЙ
    // копией SDK на странице.
    try { rows = await searchPlayers(q, 8); } catch (err) { rows = []; }
    if (mine !== seq) return;               // пришёл ответ на старый запрос
    items = rows; active = -1; paint();
  };

  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(look, 220); });
  input.addEventListener('focus', () => { if (items.length) paint(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (ev) => {
    if (box.style.display === 'none') return;
    if (ev.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); paint(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(active - 1, 0); paint(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && active >= 0) { choose(active); ev.preventDefault(); }
    else if (ev.key === 'Escape') close();
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', () => { if (box.style.display !== 'none') place(); }, true);
}

/** Подсказки сразу всем полям с ником на странице. */
export function nickSuggestAll(root = document) {
  root.querySelectorAll('[data-nick-input]').forEach((el) => attachNickSuggest(el));
}

/* ── Сравнение двух игроков ──────────────────────────────────────────────
   Строит таблицу «показатель — я — он» по тем же полям, что показывает
   публичный профиль (STAT_GROUPS). Сравниваются только те строки, которые
   есть хотя бы у одного: пустая половина таблицы ничего не говорит. */
export function compareTableHtml(mine, theirs, gameSlug) {
  const pick = (prof) => {
    const games = (prof && Array.isArray(prof.games)) ? prof.games : [];
    const g = gameSlug ? games.filter((x) => x.game_slug === gameSlug)[0] : games[0];
    return (g && g.data) || {};
  };
  const a = pick(mine), b = pick(theirs);
  const fmt = (f, v) => (v == null ? '—'
    : f.fmt === 'time' ? Math.round(v / 3600) + ' ' + L('ч', 'h')
    : Number(v).toLocaleString(uiLang() === 'en' ? 'en-US' : 'ru-RU'));

  const rows = [];
  STAT_GROUPS.forEach((grp) => {
    grp.fields.forEach((f) => {
      if (f.ruleOnly) return;
      const va = a[f.key], vb = b[f.key];
      if (va == null && vb == null) return;
      const na = Number(va || 0), nb = Number(vb || 0);
      // Победа подсвечивается только там, где числа разные: две одинаковые
      // зелёные строки читаются как «оба выиграли», а это не так.
      const win = na === nb ? '' : (na > nb ? 'a' : 'b');
      rows.push(`<tr>
        <td style="text-align:left;padding:6px 10px;${win === 'a' ? 'color:var(--y,#7fdc7f)' : ''}">${esc(fmt(f, va))}</td>
        <th style="font-weight:400;padding:6px 10px;white-space:nowrap"><span class="dim">${
          esc(uiLang() === 'en' ? f.en : f.ru)}</span></th>
        <td style="text-align:right;padding:6px 10px;${win === 'b' ? 'color:var(--y,#7fdc7f)' : ''}">${esc(fmt(f, vb))}</td>
      </tr>`);
    });
  });

  if (!rows.length) {
    return `<p class="dim">${esc(L('Сравнивать пока нечего: ни у кого нет опубликованного прогресса.',
      'Nothing to compare yet: neither player has published progress.'))}</p>`;
  }
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 10px">${esc((mine && mine.nickname) || '—')}</th>
      <th style="padding:6px 10px"></th>
      <th style="text-align:right;padding:6px 10px">${esc((theirs && theirs.nickname) || '—')}</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

/* ── Список, который можно переставить ───────────────────────────────────
   Порядок строк в списке иногда и есть сама настройка: каталог бейджей
   выстроен от главного к второстепенному, и то же самое видно у ника. Такой
   порядок задают перетаскиванием: кнопки «выше/ниже» заставляют щёлкать по
   разу на каждый шаг и не показывают, куда строка в итоге встанет.

   Тянем на Pointer Events, а не на HTML5 drag-and-drop: тот не работает
   пальцем — на телефоне админка осталась бы без перестановки вовсе.

   Разметка от вызывающего нужна такая:
     <div data-sort-key="код строки">      — сама строка, прямой ребёнок box
       <span data-drag>⠿</span>            — за что тянуть
       <span data-sort-num>1</span>        — номер, если он показан
   Порядок строк в DOM меняем сразу, чтобы было видно, куда попадёт строка;
   onOrder зовём один раз в конце — с кодами строк в новом порядке. */
export function sortableRows(box, onOrder) {
  if (!box) return;
  const rows = () => [...box.children].filter((el) => el.dataset && el.dataset.sortKey);
  const keys = () => rows().map((el) => el.dataset.sortKey);
  const renumber = () => rows().forEach((el, i) => {
    const n = el.querySelector('[data-sort-num]');
    if (n) n.textContent = String(i + 1);
  });

  let moving = null;    // строка, которую тянут
  let before = [];      // порядок до захвата — чтобы не дёргать сервер зря

  box.querySelectorAll('[data-drag]').forEach((handle) => {
    // Палец должен тащить строку, а не листать страницу.
    handle.style.touchAction = 'none';
    handle.style.cursor = 'grab';
    handle.style.userSelect = 'none';

    handle.onpointerdown = (ev) => {
      const row = handle.closest('[data-sort-key]');
      if (!row || row.parentNode !== box) return;
      moving = row;
      before = keys();
      row.style.opacity = '0.55';
      handle.style.cursor = 'grabbing';
      // Захват указателя: иначе достаточно чуть обогнать курсором строку, и
      // события уходят соседу — перетаскивание обрывается на полпути.
      try { handle.setPointerCapture(ev.pointerId); } catch (err) { /* не поддержано */ }
      ev.preventDefault();
    };

    handle.onpointermove = (ev) => {
      if (!moving) return;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = under && under.closest ? under.closest('[data-sort-key]') : null;
      if (!over || over === moving || over.parentNode !== box) return;
      const rect = over.getBoundingClientRect();
      // Ниже середины соседа — встаём после него, выше — перед.
      box.insertBefore(moving, ev.clientY > rect.top + rect.height / 2 ? over.nextSibling : over);
      renumber();
    };

    const drop = () => {
      if (!moving) return;
      moving.style.opacity = '';
      handle.style.cursor = 'grab';
      moving = null;
      renumber();
      const now = keys();
      if (now.join(' ') !== before.join(' ')) onOrder(now);
    };
    handle.onpointerup = drop;
    handle.onpointercancel = drop;
  });

  renumber();
}

/* ── Иконка игры ─────────────────────────────────────────────────────────
   Списки лицензий («Мои игры», «Игры в аккаунте», лицензии игрока в админке)
   были рядами текста. Иконка узнаётся быстрее подписи, поэтому она теперь
   стоит слева от названия везде, где игра упоминается строкой.

   В каталоге лежит ССЫЛКА на логотип (см. миграцию 0015), но data-URL тоже
   принимается. Ничего другого в src не попадёт: адрес с чужой схемой
   (javascript:, http:) отбрасывается — картинку рисует чужой для нас
   каталог, и доверять ему на слово незачем. */
export function gameIconHtml(url, title, px = 30) {
  const safe = /^(\/[^/]|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(url || '');
  const box = `width:${px}px;height:${px}px;flex:0 0 ${px}px;border-radius:6px;`
    + 'overflow:hidden;display:grid;place-items:center;border:1px solid var(--line, rgba(255,255,255,.2));'
    + `background:rgba(127,127,127,.12);font-size:${Math.round(px * 0.5)}px;line-height:1`;
  // Картинки может не оказаться на месте (игру перенесли, файл переименовали) —
  // тогда вместо разбитой рамки остаётся та же заглушка, что и без ссылки.
  const inner = safe
    ? `<img alt="" src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;display:block"
            onerror="this.parentNode.textContent='🎮'">`
    : '🎮';
  return `<span class="gico" title="${esc(title || '')}" style="${box}">${inner}</span>`;
}
