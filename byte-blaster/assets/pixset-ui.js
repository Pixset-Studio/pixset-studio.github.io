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
import { supabase } from '/byte-blaster/assets/pixset-auth.js';

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

/** Бейджи «у ника» сразу для списка игроков — один запрос на всю страницу. */
export async function nickBadges(nicknames) {
  const names = [...new Set((nicknames || []).filter(Boolean))];
  if (!names.length) return new Map();
  const { data, error } = await supabase
    .from('nick_badges')
    .select('nickname, slug, title_ru, title_en, icon_url, color, nick_forced')
    .in('nickname', names);
  if (error) return new Map();
  const map = new Map();
  (data || []).forEach((row) => {
    if (!map.has(row.nickname)) map.set(row.nickname, []);
    map.get(row.nickname).push(row);
  });
  return map;
}

/**
 * Дорисовывает бейджи ко всем никам на странице.
 *
 * Разметка помечает ник атрибутом data-nick="ник" — и всё; дальше эта функция
 * сама сходит в базу и добавит иконки. Так «бейдж виден везде» не требует
 * править каждый список по отдельности: списки друзей, поиск, таблицы, шапка.
 */
export async function paintNickBadges(root = document) {
  const nodes = [...root.querySelectorAll('[data-nick]')]
    .filter((n) => n.dataset.nickBadges !== n.dataset.nick);
  if (!nodes.length) return;

  const map = await nickBadges(nodes.map((n) => n.dataset.nick));
  nodes.forEach((node) => {
    node.dataset.nickBadges = node.dataset.nick;   // отметка: этот ник уже обработан
    const old = node.querySelector(':scope > .nbdgs');
    if (old) old.remove();
    const list = map.get(node.dataset.nick) || [];
    if (!list.length) return;
    node.insertAdjacentHTML('beforeend',
      `<span class="nbdgs">${list.map(badgeChipHtml).join('')}</span>`);
  });
}

// Язык меняется без перезагрузки — подсказки у иконок тоже.
document.addEventListener('pixset:lang', () => {
  document.querySelectorAll('[data-nick]').forEach((n) => { delete n.dataset.nickBadges; });
  paintNickBadges().catch(() => {});
});

/* ── Разделы админки ─────────────────────────────────────────────────────
   Панель управления росла лентой: игроки, лицензии, бейджи, блокировки,
   заявки, сборки, заказы — всё подряд на одной странице, и до нужного места
   приходилось прокручивать пол-экрана.

   Разметку при этом не переписываем. Заголовок раздела помечен атрибутами
   data-sect="ключ" data-sect-title="Название", а эта функция сама разрезает
   ленту по таким заголовкам, складывает куски по разделам и рисует
   переключатель. Соседние заголовки с одним ключом попадают в один раздел —
   так «Заказы» и «События оплат» живут вместе, а разметка остаётся плоской.

   Выбранный раздел живёт в адресе (#players): перезагрузка страницы и
   закладка возвращают туда же, где человек работал. */
export function adminSections(root) {
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
    b.textContent = boxes.get(key).dataset.title;
    nav.appendChild(b);
  });
  root.insertBefore(nav, root.firstChild);

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
