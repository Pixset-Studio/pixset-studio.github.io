/* Действующие распродажи — для витрины, страницы игры и страницы покупки.
 *
 * Цену считает база (active_sales), здесь её только забирают и рисуют: подменить
 * сумму из браузера нельзя, оплата всё равно идёт по цене, которую посчитает
 * create_order. Запрос публичный: гостю распродажу тоже надо видеть.
 *
 * Не ответили — распродажи просто нет, страница показывает обычную цену.
 */
const API = 'https://zyjhvuhovimorpokiwty.supabase.co';
const KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

let pending = null;

/** Карта «игра:валюта» → { title, ends_at, price_full, price_sale }. Один запрос на страницу. */
export function loadSales() {
  if (!pending) {
    pending = fetch(API + '/rest/v1/rpc/active_sales', {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const map = new Map();
        for (const s of rows || []) map.set(s.game_slug + ':' + s.currency, s);
        return map;
      })
      .catch(() => new Map());
  }
  return pending;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Сумма из копеек/центов. Целое число рублей — без «,00» в хвосте. */
export function money(cents, cur) {
  const v = cents / 100;
  if (cur === 'RUB') {
    return (Number.isInteger(v) ? v.toLocaleString('ru-RU')
      : v.toLocaleString('ru-RU', { minimumFractionDigits: 2 })) + ' ₽';
  }
  return '$' + v.toFixed(2);
}

/** «−30%» — на сколько распродажная цена ниже обычной. */
export function saleOffText(sale) {
  const pct = Math.round((1 - sale.price_sale / sale.price_full) * 100);
  return '−' + Math.max(1, pct) + '%';
}

function fmt(iso, lang) {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB',
      { day: 'numeric', month: 'long' });
  } catch { return String(iso).slice(0, 10); }
}

/** Плашка: «🔥 РАСПРОДАЖА −30% · до 30 сентября» сразу на двух языках. */
export function saleBadgeHtml(sale) {
  const off = esc(saleOffText(sale));
  return `<span data-l="ru">🔥 РАСПРОДАЖА ${off} · до ${esc(fmt(sale.ends_at, 'ru'))}</span>`
       + `<span data-l="en">🔥 SALE ${off} · until ${esc(fmt(sale.ends_at, 'en'))}</span>`;
}

/** Цена с зачёркнутой старой — HTML для любого блока с ценой. */
export function salePriceHtml(sale, cur) {
  return `<s style="opacity:.55;font-size:.7em;margin-right:8px">${esc(money(sale.price_full, cur))}</s>`
       + esc(money(sale.price_sale, cur));
}
