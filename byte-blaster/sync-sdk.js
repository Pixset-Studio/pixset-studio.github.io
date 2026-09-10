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

// В метку входят ВСЕ общие модули, а не один только SDK. Раньше считался
// только pixset-auth.js: правка pixset-ui.js метку не двигала, страницы
// оставались с прежним `?v=`, и браузер честно отдавал им вчерашний модуль из
// кэша — изменения «не доезжали» без всякой ошибки.
// Прошлую метку из текста вычищаем: и строку SDK_VERSION, и метку в импорте
// внутри ui.js. Иначе хэш считался бы от результата прошлого запуска и менялся
// бы каждый раз, даже когда в коде ничего не изменилось.
const forget = (text) => text
  .replace(/export const SDK_VERSION = '[^']*';/, '')
  .replace(/pixset-auth\.js\?v=[^']*'/g, "pixset-auth.js'");

const shared = ['pixset-auth.js', 'pixset-ui.js', 'pixset-me.js']
  .map((name) => {
    const file = path.join(studioSite, 'assets', name);
    return fs.existsSync(file) ? forget(fs.readFileSync(file, 'utf8')) : '';
  })
  .join('\n');

const stamp = crypto.createHash('sha256').update(shared).digest('hex').slice(0, 8);

code = code.replace(/export const SDK_VERSION = '[^']*';/,
  `export const SDK_VERSION = '${stamp}';`);
fs.writeFileSync(source, code, 'utf8');

const copy = path.join(bbSite, 'assets', 'pixset-auth.js');
fs.writeFileSync(copy, code, 'utf8');

// Общие куски интерфейса аккаунта (бейджи у ника, список стран, подписи) лежат
// рядом с SDK и нужны обоим сайтам: аккаунт и админка на них обязаны быть
// наполнены одинаково. Копия получает ту же метку версии, что и SDK.
const uiSource = path.join(studioSite, 'assets', 'pixset-ui.js');
if (fs.existsSync(uiSource)) {
  // Метка версии нужна и здесь. Браузер считает разными модулями любые два
  // адреса, отличающиеся хоть строкой запроса: страница берёт
  // `/assets/pixset-auth.js?v=…`, а этот модуль — тот же файл без метки, и в
  // памяти оказывались ДВЕ копии SDK. Отсюда предупреждение «Multiple
  // GoTrueClient instances detected» и два клиента на одном хранилище.
  let ui = fs.readFileSync(uiSource, 'utf8')
    .replace(/from '\.\/pixset-auth\.js(?:\?v=[^']*)?'/,
      `from './pixset-auth.js?v=${stamp}'`);
  fs.writeFileSync(uiSource, ui, 'utf8');

  // В копии для сайта игры импорт SDK ведёт в её собственную папку.
  fs.writeFileSync(path.join(bbSite, 'assets', 'pixset-ui.js'),
    ui.replace(/from '\.\/pixset-auth\.js(\?v=[^']*)?'/,
      `from '/byte-blaster/assets/pixset-auth.js?v=${stamp}'`), 'utf8');
}

// Кнопка «мой аккаунт» в шапке (аватар, ник, бейджи). Обычный скрипт без
// импортов — копируется как есть, адреса внутри не зависят от сайта. Метку в
// его <script src> страницы получают ниже: кэш браузера одинаково цепко держит
// и модули, и обычные скрипты.
const meSource = path.join(studioSite, 'assets', 'pixset-me.js');
if (fs.existsSync(meSource)) {
  fs.copyFileSync(meSource, path.join(bbSite, 'assets', 'pixset-me.js'));
}

/* ── Метки в импортах ──────────────────────────────────────────────────── */
function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // game/ раньше пропускали — но там тоже есть импорт SDK: шлюз веб-версии в
    // game/index.html. Без метки браузер держал бы старый модуль, шлюз не нашёл
    // бы getSession и увёл бы с сайта игрока с честной лицензией.
    if (entry.name === 'node_modules') continue;
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
      /(['"])((?:\/byte-blaster)?\/assets\/pixset-(?:auth|ui|me)\.js)(?:\?v=[^'"]*)?\1/g,
      (m, quote, url) => `${quote}${url}?v=${stamp}${quote}`);
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
      touched++;
    }
  }
}

console.log('SDK версии ' + stamp + ': копия обновлена, страниц помечено — ' + touched);
