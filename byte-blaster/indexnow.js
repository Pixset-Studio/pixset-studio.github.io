// Сообщает поисковикам адреса напрямую — без входа в какой-либо кабинет.
//
// IndexNow понимают Bing, Yandex, Seznam и Naver: одного обращения хватает,
// чтобы все они узнали о страницах. Google протокол не поддерживает — для него
// нужен Search Console, и это единственное, что придётся сделать руками.
//
// Как это работает: в корне домена лежит файл <ключ>.txt с этим же ключом.
// Поисковик забирает его и убеждается, что адреса шлёт владелец сайта, а не
// посторонний. Поэтому запускать ЭТОТ скрипт имеет смысл только после того, как
// сайт выложен — иначе файла ключа по адресу ещё нет и заявку отклонят.
//
//   node indexnow.js          — отправить
//   node indexnow.js --check  — только проверить, доступен ли файл ключа
const fs = require('fs');
const path = require('path');

const HOST = 'pixset-studio.github.io';
const KEY = 'd9487c4978780df0eb63f5d17491a134';
const KEY_URL = `https://${HOST}/${KEY}.txt`;

const SITEMAPS = [
  path.join(__dirname, '..', '..', 'Pixset Studio Site', 'sitemap.xml'),
  path.join(__dirname, 'sitemap.xml'),
];

function urls() {
  const out = [];
  for (const f of SITEMAPS) {
    if (!fs.existsSync(f)) { console.warn('нет карты сайта: ' + f); continue; }
    const xml = fs.readFileSync(f, 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(m[1]);
  }
  return out;
}

async function checkKey() {
  try {
    const r = await fetch(KEY_URL, { cache: 'no-store' });
    if (!r.ok) return `файл ключа не отдаётся (${r.status})`;
    const t = (await r.text()).trim();
    return t === KEY ? null : 'файл ключа есть, но содержимое не совпадает';
  } catch (e) { return 'не удалось запросить файл ключа: ' + e.message; }
}

(async () => {
  const список = urls();
  console.log(`Адресов к отправке: ${список.length}`);

  const беда = await checkKey();
  if (беда) {
    console.error('\n❌ ' + беда);
    console.error('   Ожидается: ' + KEY_URL);
    console.error('   Сначала выложите сайт студии — файл ключа лежит в его корне.');
    process.exit(1);
  }
  console.log('✅ Файл ключа на месте: ' + KEY_URL);
  if (process.argv.includes('--check')) return;

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_URL, urlList: список }),
  });
  // 200 и 202 оба означают «приняли»; тело обычно пустое.
  const текст = await res.text().catch(() => '');
  console.log(`\nОтвет: ${res.status} ${res.statusText}${текст ? ' — ' + текст.slice(0, 200) : ''}`);
  if (res.status === 200 || res.status === 202) {
    console.log('✅ Адреса приняты. Bing и Yandex обойдут их в ближайшие часы или дни.');
    console.log('   Google так не умеет — ему нужна карта сайта через Search Console.');
  } else {
    console.log('⚠ Заявку не приняли. 403 — не сошёлся ключ, 422 — адреса не с этого домена.');
  }
})();
