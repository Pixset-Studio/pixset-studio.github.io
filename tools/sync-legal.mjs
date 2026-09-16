// Добавляет в подвал каждой страницы строку со ссылками на документы студии:
// оферту, пользовательское соглашение, политику конфиденциальности и реквизиты.
//
// Эти ссылки должны быть на КАЖДОЙ странице, а не только в магазине: так их
// находит и покупатель, и проверяющий платёжного сервиса. Раскладывать их
// руками по двум с лишним десяткам страниц — верный способ снова получить
// разъехавшиеся подвалы, поэтому список живёт здесь, в одном месте.
//
// Блок помечен комментариями <!-- legal --> … <!-- /legal -->: повторный запуск
// не плодит копии, а обновляет то, что уже вставлено.
//
// Запуск:  node tools/sync-legal.mjs           (из корня сайта)
//          node tools/sync-legal.mjs --check   — только показать расхождения
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Письма — это шаблоны для почтовой рассылки, подвал сайта им не нужен.
const SKIP = new Set(['node_modules', '.git', 'assets', 'emails', 'supabase', 'tools', 'sdk']);
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

// Реквизиты продавца вставлены как заглушки «— — —» с пометкой data-fill.
// Сайт с пустым ИНН — прямая причина отказа при подключении приёма платежей,
// поэтому про незаполненные места скрипт говорит вслух при каждом запуске.
const PENDING = [];

let touched = 0, skipped = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');

  for (const m of src.matchAll(/data-fill="([a-z]+)"[^>]*>\s*—\s*—\s*—/g)) {
    PENDING.push(`${rel} → ${m[1]}`);
  }

  // Отступ берём от закрывающего тега: подвалы на страницах свёрстаны
  // по-разному, и жёсткое число пробелов выглядело бы чужеродно.
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

if (PENDING.length) {
  console.log(`\n⚠  Реквизиты не заполнены (${PENDING.length} мест). Публиковать сайт в таком`);
  console.log('   виде нельзя — приём платежей на нём не подключат:');
  for (const p of PENDING) console.log('   • ' + p);
}
