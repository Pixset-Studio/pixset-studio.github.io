/* Живая цена Byte Blaster в кнопках «купить».
 *
 * Цену держит каталог Pixset Studio, а не вёрстка сайта: поменял в базе —
 * поменялось везде. Валюта берётся по региону (рубли только для России),
 * а окончательную цену игрок всё равно видит в магазине по валюте аккаунта.
 *
 * Если запрос не прошёл, в кнопке остаётся написанный в HTML текст — страница
 * от этого не ломается.
 */
(function () {
  'use strict';

  var API = 'https://zyjhvuhovimorpokiwty.supabase.co';
  var KEY = 'sb_publishable_1bj04J3qsO1EqsKPQeSbmg_cBDEtreK';

  function isRussia() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Kirov|Saratov|Astrakhan|Ulyanovsk)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Krasnoyarsk|Irkutsk|Yakutsk|Vladivostok|Magadan|Kamchatka|Barnaul|Tomsk|Novokuznetsk|Chita|Khandyga|Sakhalin|Srednekolymsk|Ust-Nera|Anadyr))$/.test(tz);
    } catch (e) { return false; }
  }

  var slots = document.querySelectorAll('.bbPrice');
  if (!slots.length) return;

  fetch(API + '/rest/v1/games?slug=eq.byte-blaster&select=price_rub,price_usd', {
    headers: { apikey: KEY },
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      if (!rows || !rows.length) return;
      var g = rows[0];
      var text;
      if (isRussia() && g.price_rub != null) {
        text = (g.price_rub / 100).toLocaleString('ru-RU') + ' ₽ · навсегда, на все устройства';
      } else if (g.price_usd != null) {
        text = '$' + (g.price_usd / 100).toFixed(2) + ' · forever, on every device';
      } else {
        return;
      }
      for (var i = 0; i < slots.length; i++) slots[i].textContent = text;
    })
    .catch(function () { /* оставляем текст из разметки */ });
})();
