// Приводит шапку всех страниц сайта к одному набору пунктов.
//
// Меню копировалось из страницы в страницу руками, и со временем оно разъехалось:
// на «Игроках» пропал «Онлайн», где-то отсутствовала «Вики». Для посетителя это
// выглядит как исчезающие разделы — зашёл в один, а другого больше нет.
//
// Теперь список пунктов живёт ЗДЕСЬ, в одном месте, а скрипт раскладывает его по
// страницам: и в шапку (nav.main), и в мобильное меню (#mobileNav). Текущая
// страница помечается aria-current, соседние пункты не трогаются.
//
// Запуск:  node tools/sync-nav.mjs        (из корня сайта)
//          node tools/sync-nav.mjs --check — только показать расхождения
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'assets', 'emails', 'supabase', 'tools', 'sdk']);
const CHECK = process.argv.includes('--check');

// Разделы вики. Выпадают списком под пунктом «Вики» — как на главной.
const WIKI = [
  ['/wikipedia/madness-fight-alpha', 'Madness Fight [Alpha]', 'Madness Fight [Alpha]'],
  ['/wikipedia/madness-fight-beta', 'Madness Fight [Beta]', 'Madness Fight [Beta]'],
  ['/wikipedia/first-games', 'Первые игры Pixset', 'The first Pixset games'],
  ['/wikipedia/the-castle', 'The Castle', 'The Castle'],
  ['/wikipedia/the-castle/characters', '— Персонажи', '— Characters'],
  ['/wikipedia/pirate-event', 'Pirate Event', 'Pirate Event'],
  ['/wikipedia/cybersport', 'Кибер-спорт', 'Esports'],
  ['/wikipedia/collaboration', 'Pixset Studio × ORS', 'Pixset Studio × ORS'],
];

// Порядок пунктов шапки. `only` — пункт добавляется лишь на своей странице
// (админка не нужна остальным).
const ITEMS = [
  { href: '/', ru: 'Главная', en: 'Home' },
  { href: '/#about', ru: 'О нас', en: 'About us', anchorOnHome: '#about' },
  { href: '/wikipedia', ru: 'Вики', en: 'Wiki', sub: WIKI },
  { href: '/byte-blaster/', ru: 'Byte Blaster', en: 'Byte Blaster', plain: true },
  { href: '/players/', ru: 'Игроки', en: 'Players' },
  { href: '/online/', ru: 'Онлайн', en: 'Online' },
  { href: '/store', ru: 'Магазин', en: 'Store', cls: 'cta' },
  { href: '/admin/', ru: 'Админка', en: 'Admin', only: 'admin/index.html' },
  { href: '/account', ru: 'Аккаунт', en: 'Account', account: true },
];

function labelHtml(it) {
  if (it.plain) return it.ru;                       // название игры не переводится
  return `<span data-l="ru">${it.ru}</span><span data-l="en">${it.en}</span>`;
}

/** Ссылка «эта страница» — по ней ставим aria-current. */
function isCurrent(it, rel) {
  const page = '/' + rel.replace(/index\.html$/, '');
  const href = it.href.replace(/#.*$/, '');
  if (href === '/') return page === '/';
  return page === href || page === href + '/' || page.replace(/\/$/, '') === href.replace(/\/$/, '');
}

function navHtml(rel, indent) {
  const pad = ' '.repeat(indent);
  const home = rel === 'index.html';
  const out = [];
  for (const it of ITEMS) {
    if (it.only && it.only !== rel) continue;
    // На главной якорь «О нас» ведёт вниз по странице, с остальных — на главную.
    const href = (home && it.anchorOnHome) ? it.anchorOnHome : it.href;
    const cur = isCurrent(it, rel) ? ' aria-current="page"' : '';
    const cls = it.cls ? ` class="${it.cls}"` : '';

    if (it.sub) {
      const subs = it.sub.map(([h, ru, en]) => {
        const same = ru === en;
        const inner = same ? ru : `<span data-l="ru">${ru}</span><span data-l="en">${en}</span>`;
        return `${pad}    <a href="${h}">${inner}</a>`;
      }).join('\n');
      out.push(`${pad}<span class="has-sub">`
        + `\n${pad}  <a href="${href}"${cur}><span data-l="ru">${it.ru} ▾</span><span data-l="en">${it.en} ▾</span></a>`
        + `\n${pad}  <span class="sub">\n${subs}\n${pad}  </span>`
        + `\n${pad}</span>`);
      continue;
    }
    if (it.account) {
      out.push(`${pad}<a href="${href}"${cur}><span data-account-label>${labelHtml(it)}</span></a>`);
      continue;
    }
    out.push(`${pad}<a href="${href}"${cls}${cur}>${labelHtml(it)}</a>`);
  }
  return out.join('\n');
}

function mobileHtml(rel) {
  const home = rel === 'index.html';
  const out = [];
  for (const it of ITEMS) {
    if (it.only && it.only !== rel) continue;
    const href = (home && it.anchorOnHome) ? it.anchorOnHome : it.href;
    out.push(`  <a href="${href}">${labelHtml(it)}</a>`);
  }
  return out.join('\n');
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
  let src = fs.readFileSync(file, 'utf8');
  const navRe = /(<nav class="main"[^>]*>)([\s\S]*?)(<\/nav>)/;
  const m = src.match(navRe);
  if (!m) { skipped++; continue; }

  const indent = (m[2].match(/\n(\s*)\S/) || [, '      '])[1].length;
  let next = src.replace(navRe, (_, open, __, close) =>
    open + '\n' + navHtml(rel, indent) + '\n' + ' '.repeat(Math.max(0, indent - 2)) + close);

  next = next.replace(/(<div id="mobileNav">)([\s\S]*?)(<\/div>)/,
    (_, open, __, close) => open + '\n' + mobileHtml(rel) + '\n' + close);

  if (next === src) continue;
  touched++;
  if (!CHECK) fs.writeFileSync(file, next, 'utf8');
  console.log((CHECK ? 'разошлось: ' : 'обновлено: ') + rel);
}
console.log(`\nстраниц с меню обновлено: ${touched}; без меню пропущено: ${skipped}`);
