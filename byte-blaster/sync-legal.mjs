// Добавляет в подвал каждой страницы сайта игры строку со ссылками на документы
// студии: оферту, соглашение, политику конфиденциальности и реквизиты.
//
// Документы общие для обоих сайтов и лежат в корне домена, поэтому ссылки
// абсолютные: отсюда, из /byte-blaster/, они ведут на сайт студии.
//
// Это копия tools/sync-legal.mjs из репозитория сайта студии: репозитории
// разные, общей папки у них нет. Правки нужно переносить в обе.
//
// Запуск:  node sync-legal.mjs           (из корня сайта)
//          node sync-legal.mjs --check   — только показать расхождения
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// game — это собранная игра, archive — старые сборки: свои подвалы им не нужны.
const SKIP = new Set(['node_modules', '.git', 'assets', 'game']);
const CHECK = process.argv.includes('--check');

const LINKS = [
  ['/legal/offer/', 'Оферта', 'Offer'],
  ['/legal/terms/', 'Соглашение', 'Terms'],
  ['/legal/privacy/', 'Конфиденциальность', 'Privacy'],
  ['/legal/contacts/', 'Контакты и реквизиты', 'Contacts'],
];

function block(indent) {
  const pad = ' '.repeat(indent);
  const items = LINKS.map(([href, ru, en]) =>
    `${pad}    <a href="${href}"><span data-l="ru">${ru}</span><span data-l="en">${en}</span></a>`)
    .join('\n');
  return `${pad}<!-- legal -->\n${pad}  <div class="legal-line">\n${items}\n${pad}  </div>\n${pad}<!-- /legal -->`;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let touched = 0, skipped = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');

  const close = src.match(/\n([ \t]*)<\/footer>/);
  if (!close) { skipped++; continue; }
  const indent = close[1].length + 2;

  let next;
  if (src.includes('<!-- legal -->')) {
    next = src.replace(/[ \t]*<!-- legal -->[\s\S]*?<!-- \/legal -->/, block(indent).replace(/^\s+/, ' '.repeat(indent)));
  } else {
    next = src.replace(/(\n[ \t]*<\/footer>)/, '\n' + block(indent) + '$1');
  }

  if (next === src) continue;
  touched++;
  if (!CHECK) fs.writeFileSync(file, next, 'utf8');
  console.log((CHECK ? 'разошлось: ' : 'обновлено: ') + rel);
}
console.log(`\nстраниц с подвалом обновлено: ${touched}; без подвала пропущено: ${skipped}`);
