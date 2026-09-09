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
import { supabase } from './pixset-auth.js';

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
