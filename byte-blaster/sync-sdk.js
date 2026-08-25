// Раскладывает общий SDK студии по сайтам и метит его версией.
//
// Делает две вещи:
//   1. Копирует `Pixset Studio Site/assets/pixset-auth.js` в сайт Byte Blaster.
//      Раньше страницы игры грузили модуль из корня домена, то есть из
//      соседнего репозитория: правка SDK без перезаливки студии роняла админку
//      с «does not provide an export named …».
//   2. Проставляет метку версии — короткий хэш файла — в SDK_VERSION и во все
//      импорты вида `/assets/pixset-auth.js?v=…`. Без метки браузер держит
//      старую копию модуля из кэша, и страница молча работает на вчерашнем
//      коде: именно так загрузка сборок падала «без ошибок».
//
// Запускать после правок SDK: node sync-sdk.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const bbSite = __dirname;
const studioSite = path.join(bbSite, '..', '..', 'Pixset Studio Site');
const source = path.join(studioSite, 'assets', 'pixset-auth.js');

if (!fs.existsSync(source)) {
  console.error('Не нашёл исходный SDK: ' + source);
  process.exit(1);
}

/* ── Версия ────────────────────────────────────────────────────────────── */
let code = fs.readFileSync(source, 'utf8');
// Хэш считаем от текста без самой метки, иначе она меняла бы сама себя.
const bare = code.replace(/export const SDK_VERSION = '[^']*';/, '');
const stamp = crypto.createHash('sha256').update(bare).digest('hex').slice(0, 8);

code = code.replace(/export const SDK_VERSION = '[^']*';/,
  `export const SDK_VERSION = '${stamp}';`);
fs.writeFileSync(source, code, 'utf8');

const copy = path.join(bbSite, 'assets', 'pixset-auth.js');
fs.writeFileSync(copy, code, 'utf8');

/* ── Метки в импортах ──────────────────────────────────────────────────── */
function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'game') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let touched = 0;
for (const dir of [studioSite, bbSite]) {
  for (const file of htmlFiles(dir)) {
    const html = fs.readFileSync(file, 'utf8');
    const next = html.replace(
      /(['"])((?:\/byte-blaster)?\/assets\/pixset-auth\.js)(?:\?v=[^'"]*)?\1/g,
      (m, quote, url) => `${quote}${url}?v=${stamp}${quote}`);
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
      touched++;
    }
  }
}

console.log('SDK версии ' + stamp + ': копия обновлена, страниц помечено — ' + touched);
