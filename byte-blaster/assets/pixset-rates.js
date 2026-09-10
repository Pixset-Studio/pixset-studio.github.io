/* Цена в местной валюте — подсказка рядом с ценой в долларах.
 *
 * Платит игрок всё равно в валюте аккаунта (рубли для России, доллары для
 * остальных), но «$4.99» мало что говорит человеку, который считает деньги в
 * тенге или злотых. Поэтому рядом появляется «≈ 470 ₸» — по сегодняшнему
 * курсу, только как ориентир.
 *
 * Курс берётся у открытого справочника (open.er-api.com, без ключа и
 * регистрации) и лежит в localStorage сутки: цена меняется редко, а лишний
 * запрос на каждой странице ни к чему. Не ответил — подсказки просто нет,
 * ценник от этого не ломается.
 *
 * Файл обычный, не модуль: его подключают и страницы с модулями (магазин), и
 * простые скрипты сайта игры (assets/price.js).
 */
(function () {
  'use strict';

  var URL = 'https://open.er-api.com/v6/latest/USD';
  var KEY = 'pixsetRates';
  var TTL = 24 * 60 * 60 * 1000;

  /* Страна → её валюта. Нужен, чтобы понять, во что переводить: у аккаунта
     валюта всего две (RUB и USD), а живёт игрок где угодно. Стран, которые
     считают в долларах, в списке нет — для них подсказка не нужна. */
  var CURRENCY = {
    AE: 'AED', AF: 'AFN', AL: 'ALL', AM: 'AMD', AO: 'AOA', AR: 'ARS', AU: 'AUD',
    AW: 'AWG', AZ: 'AZN', BA: 'BAM', BB: 'BBD', BD: 'BDT', BG: 'BGN', BH: 'BHD',
    BI: 'BIF', BM: 'BMD', BN: 'BND', BO: 'BOB', BR: 'BRL', BS: 'BSD', BT: 'BTN',
    BW: 'BWP', BY: 'BYN', BZ: 'BZD', CA: 'CAD', CD: 'CDF', CH: 'CHF', CL: 'CLP',
    CN: 'CNY', CO: 'COP', CR: 'CRC', CU: 'CUP', CV: 'CVE', CZ: 'CZK', DJ: 'DJF',
    DK: 'DKK', DO: 'DOP', DZ: 'DZD', EG: 'EGP', ER: 'ERN', ET: 'ETB', FJ: 'FJD',
    FK: 'FKP', GB: 'GBP', GE: 'GEL', GH: 'GHS', GI: 'GIP', GM: 'GMD', GN: 'GNF',
    GT: 'GTQ', GY: 'GYD', HK: 'HKD', HN: 'HNL', HT: 'HTG', HU: 'HUF', ID: 'IDR',
    IL: 'ILS', IN: 'INR', IQ: 'IQD', IR: 'IRR', IS: 'ISK', JM: 'JMD', JO: 'JOD',
    JP: 'JPY', KE: 'KES', KG: 'KGS', KH: 'KHR', KM: 'KMF', KP: 'KPW', KR: 'KRW',
    KW: 'KWD', KY: 'KYD', KZ: 'KZT', LA: 'LAK', LB: 'LBP', LK: 'LKR', LR: 'LRD',
    LS: 'LSL', LY: 'LYD', MA: 'MAD', MD: 'MDL', MG: 'MGA', MK: 'MKD', MM: 'MMK',
    MN: 'MNT', MO: 'MOP', MR: 'MRU', MU: 'MUR', MV: 'MVR', MW: 'MWK', MX: 'MXN',
    MY: 'MYR', MZ: 'MZN', NA: 'NAD', NG: 'NGN', NI: 'NIO', NO: 'NOK', NP: 'NPR',
    NZ: 'NZD', OM: 'OMR', PE: 'PEN', PG: 'PGK', PH: 'PHP', PK: 'PKR', PL: 'PLN',
    PY: 'PYG', QA: 'QAR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF', SA: 'SAR',
    SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD', SH: 'SHP', SL: 'SLE',
    SO: 'SOS', SR: 'SRD', SS: 'SSP', ST: 'STN', SY: 'SYP', SZ: 'SZL', TH: 'THB',
    TJ: 'TJS', TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY', TT: 'TTD', TW: 'TWD',
    TZ: 'TZS', UA: 'UAH', UG: 'UGX', UY: 'UYU', UZ: 'UZS', VE: 'VES', VN: 'VND',
    VU: 'VUV', WS: 'WST', YE: 'YER', ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWG',
    // Зона евро и те, кто считает в евро.
    AD: 'EUR', AT: 'EUR', AX: 'EUR', BE: 'EUR', BL: 'EUR', CY: 'EUR', DE: 'EUR',
    EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GF: 'EUR', GP: 'EUR', GR: 'EUR',
    HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MC: 'EUR',
    ME: 'EUR', MF: 'EUR', MQ: 'EUR', MT: 'EUR', NL: 'EUR', PM: 'EUR', PT: 'EUR',
    RE: 'EUR', SI: 'EUR', SK: 'EUR', SM: 'EUR', VA: 'EUR', XK: 'EUR', YT: 'EUR',
    // Валюты, общие для нескольких стран.
    BF: 'XOF', BJ: 'XOF', CI: 'XOF', GW: 'XOF', ML: 'XOF', NE: 'XOF', SN: 'XOF',
    TG: 'XOF', CF: 'XAF', CG: 'XAF', CM: 'XAF', GA: 'XAF', GQ: 'XAF', TD: 'XAF',
    NC: 'XPF', PF: 'XPF', WF: 'XPF',
    AG: 'XCD', AI: 'XCD', DM: 'XCD', GD: 'XCD', KN: 'XCD', LC: 'XCD', VC: 'XCD',
    MS: 'XCD',
    CW: 'ANG', SX: 'ANG', BQ: 'USD', FO: 'DKK', GL: 'DKK', GG: 'GBP', IM: 'GBP',
    JE: 'GBP', SJ: 'NOK',
  };

  var rates = null;

  function cached() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && v.at && Date.now() - v.at < TTL && v.rates) return v;
    } catch (e) {}
    return null;
  }

  /** Код валюты страны или '' — если страна считает в долларах или неизвестна. */
  function currencyOf(country) {
    var cc = String(country || '').toUpperCase();
    var cur = CURRENCY[cc] || '';
    return cur === 'USD' ? '' : cur;
  }

  /** Заранее подгружает курсы. Возвращает обещание, но ждать его не обязательно. */
  function prime() {
    var have = cached();
    if (have) { rates = have.rates; return Promise.resolve(rates); }

    return fetch(URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.rates) return null;
        rates = data.rates;
        try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates: rates })); } catch (e) {}
        return rates;
      })
      .catch(function () { return null; });      // нет сети — обойдёмся без подсказки
  }

  /**
   * Подсказка к долларовой цене: «≈ 470 ₸».
   * Пустая строка, если курс ещё не загружен, страна считает в долларах или
   * такой валюты в справочнике нет.
   *
   * @param {number} usdCents — цена в центах, как её хранит каталог
   * @param {string} country  — код страны игрока (ISO 3166-1 alpha-2)
   */
  function hint(usdCents, country, lang) {
    var cur = currencyOf(country);
    if (!cur || !rates || !rates[cur] || usdCents == null) return '';

    var value = (Number(usdCents) / 100) * rates[cur];
    // Копейки в чужой валюте — лишняя точность для прикидки: до 10 округляем
    // до десятых, дальше до целых.
    var digits = value < 10 ? 1 : 0;
    try {
      return '≈ ' + new Intl.NumberFormat(lang || 'ru', {
        style: 'currency', currency: cur,
        minimumFractionDigits: digits, maximumFractionDigits: digits,
      }).format(value);
    } catch (e) {
      return '≈ ' + Math.round(value) + ' ' + cur;
    }
  }

  /**
   * Откуда игрок, если он не вошёл. Берём регион из настроек браузера — для
   * прикидки цены этого достаточно, а платит он всё равно в валюте аккаунта.
   */
  function guessCountry() {
    try {
      var loc = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      var m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(loc);
      if (m) return m[1].toUpperCase();
      if (window.Intl && Intl.Locale) {
        var reg = new Intl.Locale(loc).maximize().region;
        if (reg) return reg;
      }
    } catch (e) {}
    return '';
  }

  window.PixsetRates = {
    prime: prime, hint: hint, currencyOf: currencyOf, guessCountry: guessCountry,
  };
})();
