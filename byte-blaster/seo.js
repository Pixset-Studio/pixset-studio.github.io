// Готовит оба сайта к поиску: дописывает недостающие мета-теги, собирает карты
// сайта и robots.txt.
//
// Зачем это вообще. Сайты живут на GitHub Pages, на них не ведёт ни одной
// внешней ссылки, и карты сайта не было — поисковику попросту неоткуда узнать,
// что они существуют. Отсюда «не находится ни в одном браузере»: дело не в
// плохих текстах, а в том, что страницы никто не обошёл.
//
// Запускать после добавления страниц:  node seo.js
//
// ВАЖНО про robots.txt. Он читается ТОЛЬКО из корня домена, поэтому файл один
// на оба сайта и лежит в репозитории студии. Карта Byte Blaster живёт в своём
// репозитории, а в robots.txt на неё стоит ссылка — без этого поисковик вправе
// её проигнорировать как «чужую».
const fs = require('fs');
const path = require('path');

const HOST = 'https://pixset-studio.github.io';
const bbSite = __dirname;
const studioSite = path.join(bbSite, '..', '..', 'Pixset Studio Site');

const SITES = [
  {
    name: 'Pixset Studio',
    root: studioSite,
    base: '/',
    siteName: 'Pixset Studio',
    image: HOST + '/assets/logo.jpg',
    // Служебное и чужое: в обход не берём.
    skip: new Set(['assets', 'emails', 'supabase', 'tools', 'sdk', 'node_modules']),
  },
  {
    name: 'Byte Blaster',
    root: bbSite,
    base: '/byte-blaster/',
    siteName: 'Byte Blaster',
    image: HOST + '/byte-blaster/assets/logo-512.png',
    // game/ — это сама игра, отдельное приложение, а не страница для поиска.
    skip: new Set(['assets', 'game', 'builds', 'node_modules']),
  },
];

/* ── Обход страниц ─────────────────────────────────────────────────────── */
function pages(dir, site) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || site.skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...pages(full, site));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Публичный адрес страницы: …/index.html схлопывается до …/ */
function urlOf(file, site) {
  let rel = path.relative(site.root, file).replace(/\\/g, '/');
  rel = rel.replace(/(^|\/)index\.html$/, '$1');
  return HOST + site.base + rel;
}

/* ── Структурированные данные ──────────────────────────────────────────────
   Разметка schema.org: по ней поисковик понимает, что перед ним игра, кто её
   выпустил и сколько она стоит, — и показывает карточку вместо голой ссылки.
   Цена берётся из базы (games.price_rub хранится в копейках). */
const STUDIO = {
  '@type': 'Organization',
  name: 'Pixset Studio',
  url: HOST + '/',
  logo: HOST + '/assets/logo.jpg',
  sameAs: [
    'https://www.youtube.com/@pixset',
    'https://t.me/Pixset_Studio',
    'https://discord.gg/4DvuhfJpTT',
    'https://www.roblox.com/groups/16590279/Pixset-Studio',
    'https://github.com/pixset',
  ],
};

function schemaFor(url, title, descr) {
  if (url === HOST + '/') {
    return { '@context': 'https://schema.org', ...STUDIO, description: descr };
  }
  if (url === HOST + '/byte-blaster/') {
    return {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: 'Byte Blaster',
      url,
      image: HOST + '/byte-blaster/assets/logo-512.png',
      description: descr,
      genre: ['Платформер', 'Экшен', 'Инди'],
      gamePlatform: ['Windows', 'Android', 'Web browser'],
      playMode: ['SinglePlayer', 'CoOp', 'MultiPlayer'],
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5 },
      publisher: STUDIO,
      author: STUDIO,
      offers: {
        '@type': 'Offer',
        price: '125',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
        url: HOST + '/byte-blaster/buy/',
      },
    };
  }
  return null;
}

/** Хлебные крошки для вложенных страниц: в выдаче вместо длинного адреса
 *  показывается путь вида «Pixset Studio › Вики › The Castle». */
function breadcrumbs(url, titles, site) {
  const tail = url.replace(HOST + site.base, '').replace(/\/$/, '');
  if (!tail) return null;
  const parts = tail.split('/');
  const items = [{ name: site.siteName, item: HOST + site.base }];
  let acc = HOST + site.base;
  for (const p of parts) {
    acc += p + '/';
    const clean = acc.replace(/\.html\/$/, '.html');
    items.push({ name: titles.get(clean) || p, item: clean });
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((x, i) => ({
      '@type': 'ListItem', position: i + 1, name: x.name, item: x.item,
    })),
  };
}

/** Заголовок без хвоста «— Pixset Studio»: в крошках он лишний. */
const shortTitle = (t) => t.split(/\s+—\s+/)[0].trim();

/* ── Разбор и правка <head> ────────────────────────────────────────────── */
const MARK_A = '<!-- поиск: этот блок дописывает seo.js, править вручную незачем -->';
const MARK_B = '<!-- /поиск -->';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Короткое описание из самого текста страницы — то же, что вытащил бы и
 *  поисковик, только заданное явно и потому предсказуемое. */
function describe(html) {
  const body = html.slice(html.search(/<body/i));
  for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length >= 60) {
      if (t.length <= 160) return t;
      const cut = t.slice(0, 157);
      return cut.slice(0, cut.lastIndexOf(' ')) + '…';
    }
  }
  return null;
}

function process(file, site, titles) {
  let html = fs.readFileSync(file, 'utf8');

  // Свой прошлый блок убираем целиком: так повторный запуск не плодит копии.
  html = html.replace(new RegExp(MARK_A + '[\\s\\S]*?' + MARK_B + '\\s*', 'g'), '');

  const headEnd = html.search(/<\/head>/i);
  if (headEnd < 0) return { file, skipped: 'нет <head>' };
  const head = html.slice(0, headEnd);

  const robots = /name="robots"[^>]*content="([^"]*)"/i.exec(head);
  const hidden = robots && /noindex/i.test(robots[1]);

  const url = urlOf(file, site);
  const title = (/<title>([^<]*)<\/title>/i.exec(head) || [, site.siteName])[1].trim();
  const haveDescr = /name="description"/i.test(head);
  const descr = (/name="description"\s+content="([^"]*)"/i.exec(head) || [])[1]
    || describe(html) || title;

  const add = [];
  const need = (re, line) => { if (!re.test(head)) add.push(line); };

  // Канонический адрес нужен и закрытым страницам: он гасит дубли вида
  // /path и /path/index.html, по которым сайт доступен всегда.
  need(/rel="canonical"/i, `<link rel="canonical" href="${url}">`);

  if (!hidden) {
    if (!haveDescr) add.push(`<meta name="description" content="${esc(descr)}">`);
    need(/property="og:type"/i,      `<meta property="og:type" content="website">`);
    need(/property="og:site_name"/i, `<meta property="og:site_name" content="${esc(site.siteName)}">`);
    need(/property="og:locale"/i,    `<meta property="og:locale" content="ru_RU">`);
    need(/property="og:title"/i,     `<meta property="og:title" content="${esc(title)}">`);
    need(/property="og:description"/i, `<meta property="og:description" content="${esc(descr)}">`);
    need(/property="og:url"/i,       `<meta property="og:url" content="${url}">`);
    need(/property="og:image"/i,     `<meta property="og:image" content="${site.image}">`);
    // Крупная картинка вместо квадратика — ссылка в мессенджере выглядит как
    // карточка игры, а не как строка текста.
    need(/name="twitter:card"/i,     `<meta name="twitter:card" content="summary_large_image">`);
    need(/name="twitter:title"/i,    `<meta name="twitter:title" content="${esc(title)}">`);
    need(/name="twitter:description"/i, `<meta name="twitter:description" content="${esc(descr)}">`);
    need(/name="twitter:image"/i,    `<meta name="twitter:image" content="${site.image}">`);

    if (!/application\/ld\+json/i.test(head)) {
      for (const data of [schemaFor(url, title, descr), breadcrumbs(url, titles, site)]) {
        if (data) add.push(`<script type="application/ld+json">${JSON.stringify(data)}<\/script>`);
      }
    }
  }

  if (add.length) {
    const block = MARK_A + '\n' + add.join('\n') + '\n' + MARK_B + '\n';
    html = html.slice(0, headEnd) + block + html.slice(headEnd);
  }
  fs.writeFileSync(file, html, 'utf8');

  // Описание дописываем только открытым страницам — закрытым оно ни к чему.
  return { file, url, hidden, added: add.length, descr: (!hidden && !haveDescr) ? descr : null };
}

/* ── Карта сайта ───────────────────────────────────────────────────────── */
function weight(url, site) {
  if (url === HOST + site.base) return '1.0';
  const depth = url.replace(HOST + site.base, '').replace(/\/$/, '').split('/').length;
  return depth <= 1 ? '0.8' : '0.6';
}

function sitemap(entries, site) {
  const rows = entries.map((e) => {
    const d = fs.statSync(e.file).mtime.toISOString().slice(0, 10);
    return `  <url>\n    <loc>${e.url}</loc>\n    <lastmod>${d}</lastmod>\n` +
           `    <priority>${weight(e.url, site)}</priority>\n  </url>`;
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows.join('\n') + '\n</urlset>\n';
}

/* ── Поехали ───────────────────────────────────────────────────────────── */
let всего = 0, дописано = 0;
const карты = [];

for (const site of SITES) {
  const files = pages(site.root, site);

  // Сначала собираем адрес → заголовок: из этого потом строятся хлебные крошки,
  // где каждый уровень пути должен называться по-человечески.
  const titles = new Map();
  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    const t = /<title>([^<]*)<\/title>/i.exec(h);
    if (t) titles.set(urlOf(f, site), shortTitle(t[1]));
  }

  const found = files.map((f) => process(f, site, titles)).filter((r) => r.url);
  const open = found.filter((r) => !r.hidden).sort((a, b) => a.url.localeCompare(b.url));

  fs.writeFileSync(path.join(site.root, 'sitemap.xml'), sitemap(open, site), 'utf8');
  карты.push(HOST + site.base + 'sitemap.xml');

  всего += found.length;
  дописано += found.reduce((s, r) => s + r.added, 0);
  console.log(`\n── ${site.name} ──`);
  console.log(`   страниц: ${found.length}, из них в карте: ${open.length}, закрыто от поиска: ${found.length - open.length}`);
  for (const r of found) {
    if (r.descr) console.log(`   + описание: ${r.url}\n     «${r.descr.slice(0, 90)}…»`);
  }
}

// robots.txt только один — в корне домена. Из репозитория Byte Blaster он бы
// лёг по адресу /byte-blaster/robots.txt, куда поисковик даже не заглянет.
const robots = `# Pixset Studio + Byte Blaster
User-agent: *
Allow: /

# Личные кабинеты и служебное: индексировать нечего, а пускать робота — тем более.
Disallow: /account/
Disallow: /admin/
Disallow: /u/
Disallow: /byte-blaster/account/
Disallow: /byte-blaster/admin/
Disallow: /byte-blaster/archive/
# Сама игра в браузере: она за проверкой лицензии и гостя всё равно уводит.
Disallow: /byte-blaster/game/

${карты.map((u) => 'Sitemap: ' + u).join('\n')}
`;
fs.writeFileSync(path.join(studioSite, 'robots.txt'), robots, 'utf8');

console.log(`\n✅ Готово. Страниц осмотрено: ${всего}, тегов дописано: ${дописано}.`);
console.log('   robots.txt → Pixset Studio Site/robots.txt (он один на весь домен)');
console.log('   карты сайта: ' + карты.join(', '));
