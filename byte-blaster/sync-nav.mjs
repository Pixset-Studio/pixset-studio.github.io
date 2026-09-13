// Приводит шапку всех страниц сайта игры к одному набору пунктов.
//
// Меню копировалось руками, и разделы начали исчезать: на «Рекордах» не было
// «Вики», на «Игроках» — «Серверов». Для посетителя это выглядит так, будто
// сайт теряет страницы, стоит по нему походить.
//
// Список пунктов теперь один и живёт здесь. Скрипт раскладывает его по
// страницам, помечает текущую (aria-current) и сохраняет переключатель языка в
// конце строки. Пункт админки добавляется только на своей странице.
//
// Запуск:  node sync-nav.mjs           (из папки Site)
//          node sync-nav.mjs --check   — только показать расхождения
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// game/ — это выложенная веб-версия самой игры, у неё своя разметка.
const SKIP = new Set(['node_modules', '.git', 'assets', 'game', 'archive-files']);
const CHECK = process.argv.includes('--check');

const B = '/byte-blaster/';
const ITEMS = [
  { href: B,                ru: 'ГЛАВНАЯ',    en: 'HOME' },
  { href: B + 'wiki/',      ru: 'ВИКИ',       en: 'WIKI' },
  { href: B + 'leaderboard/', ru: 'РЕКОРДЫ',  en: 'RECORDS' },
  { href: B + 'players/',   ru: 'ИГРОКИ',     en: 'PLAYERS' },
  { href: B + 'status/',    ru: 'СЕРВЕРЫ',    en: 'STATUS' },
  { href: B + 'download/',  ru: 'СКАЧАТЬ',    en: 'DOWNLOAD' },
  { href: B + 'updates/',   ru: 'ОБНОВЛЕНИЯ', en: 'UPDATES' },
  { href: B + 'music/',     ru: 'МУЗЫКА',     en: 'MUSIC' },
  { href: B + 'archive/',   ru: 'АРХИВ',      en: 'ARCHIVE' },
  { href: B + 'about/',     ru: 'О ПРОЕКТЕ',  en: 'ABOUT' },
  { href: B + 'buy/',       ru: 'КУПИТЬ',     en: 'BUY' },
  { href: B + 'admin/',     ru: 'АДМИНКА',    en: 'ADMIN', only: 'admin/index.html' },
  { href: B + 'account/',   ru: 'АККАУНТ',    en: 'ACCOUNT' },
];

const LANGSW = [
  '<span class="langsw">',
  '  <button type="button" data-lang="ru" aria-pressed="true">RU</button>',
  '  <button type="button" data-lang="en" aria-pressed="false">EN</button>',
  '</span>',
];

function isCurrent(it, rel) {
  const page = B + rel.replace(/index\.html$/, '');
  return page === it.href;
}

function navHtml(rel, indent) {
  const pad = ' '.repeat(indent);
  const rows = [];
  for (const it of ITEMS) {
    if (it.only && it.only !== rel) continue;
    const cur = isCurrent(it, rel) ? ' aria-current="page"' : '';
    rows.push(`${pad}<a href="${it.href}"${cur}>`
      + `<span data-l="ru">${it.ru}</span><span data-l="en">${it.en}</span></a>`);
  }
  LANGSW.forEach((line) => rows.push(pad + line));
  return rows.join('\n');
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
  const navRe = /(<nav class="main"[^>]*>)([\s\S]*?)(<\/nav>)/;
  const m = src.match(navRe);
  if (!m) { skipped++; continue; }

  const indent = (m[2].match(/\n(\s*)\S/) || [, '      '])[1].length;
  const next = src.replace(navRe, (_, open, __, close) =>
    open + '\n' + navHtml(rel, indent) + '\n' + ' '.repeat(Math.max(0, indent - 2)) + close);

  if (next === src) continue;
  touched++;
  if (!CHECK) fs.writeFileSync(file, next, 'utf8');
  console.log((CHECK ? 'разошлось: ' : 'обновлено: ') + rel);
}
console.log(`\nстраниц с меню обновлено: ${touched}; без меню пропущено: ${skipped}`);
