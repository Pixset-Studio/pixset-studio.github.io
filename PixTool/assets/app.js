/* PixTool v2.0.0 (2026-08-08) — сборка: web */

/* ===== core/01-utils.js ===== */
/* ======================================================================
   PIXTOOL CORE — утилиты
   Всё, что нужно инструментам: DOM, файлы, изображения, ZIP, хранилище.
====================================================================== */
const PT = window.PT = {
  version: '2.0.0',
  build: '2026-08-08',
  mode: 'web',            // 'offline' | 'web'
  tools: [],
  cats: [],
  _byId: {}
};

/* ---------- DOM ---------- */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
PT.$ = $; PT.$$ = $$;

function el(tag, attrs, kids){
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    // у textarea атрибут value игнорируется, а у input/select он задаёт лишь начальное значение
    else if (k === 'value' && /^(TEXTAREA|INPUT|SELECT)$/.test(node.tagName)) node.value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (kids != null){
    (Array.isArray(kids) ? kids : [kids]).forEach(k => {
      if (k == null || k === false) return;
      node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
  }
  return node;
}
PT.el = el;

function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
PT.esc = esc;

/* ---------- числа и форматы ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
PT.clamp = clamp;

function fmtBytes(n){
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return n + ' Б';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' КБ';
  if (n < 1073741824) return (n / 1048576).toFixed(2) + ' МБ';
  return (n / 1073741824).toFixed(2) + ' ГБ';
}
PT.fmtBytes = fmtBytes;

function fmtNum(n, d){
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 2 : d });
}
PT.fmtNum = fmtNum;

function fmtDuration(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const pad = x => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
PT.fmtDuration = fmtDuration;

const uid = (p) => (p || 'id') + '-' + Math.random().toString(36).slice(2, 9);
PT.uid = uid;

function debounce(fn, ms){
  let t; return function(...a){ clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms || 200); };
}
PT.debounce = debounce;

const sleep = ms => new Promise(r => setTimeout(r, ms));
PT.sleep = sleep;

/* ---------- хранилище ---------- */
const store = {
  get(key, def){
    try { const v = localStorage.getItem('pixtool:' + key); return v == null ? def : JSON.parse(v); }
    catch(e){ return def; }
  },
  set(key, val){
    try { localStorage.setItem('pixtool:' + key, JSON.stringify(val)); } catch(e){}
  },
  del(key){ try { localStorage.removeItem('pixtool:' + key); } catch(e){} }
};
PT.store = store;

/* ---------- файлы ---------- */
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  PT.toast(`Сохранено: ${filename}`, 'ok');
}
PT.downloadBlob = downloadBlob;

function downloadText(text, filename, type){
  downloadBlob(new Blob([text], { type: type || 'text/plain;charset=utf-8' }), filename);
}
PT.downloadText = downloadText;

const readText   = file => file.text();
const readBuffer = file => file.arrayBuffer();
function readDataURL(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('Не удалось прочитать файл'));
    fr.readAsDataURL(file);
  });
}
PT.readText = readText; PT.readBuffer = readBuffer; PT.readDataURL = readDataURL;

function baseName(name){ return String(name).replace(/\.[^.\\/]+$/, ''); }
function extOf(name){ const m = String(name).match(/\.([^.\\/]+)$/); return m ? m[1].toLowerCase() : ''; }
PT.baseName = baseName; PT.extOf = extOf;

const MIME_EXT = {
  'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/bmp':'bmp',
  'image/gif':'gif', 'image/avif':'avif', 'image/x-icon':'ico', 'image/svg+xml':'svg'
};
PT.mimeExt = m => MIME_EXT[m] || String(m).split('/').pop();

/* ---------- изображения ---------- */
function loadImage(src){
  return new Promise((res, rej) => {
    const img = new Image();
    let url = null;
    img.onload = () => { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); res(img); };
    img.onerror = () => { if (url) URL.revokeObjectURL(url); rej(new Error('Не удалось декодировать изображение')); };
    if (src instanceof Blob){ url = URL.createObjectURL(src); img.src = url; }
    else img.src = src;
  });
}
PT.loadImage = loadImage;

function makeCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
PT.makeCanvas = makeCanvas;

function imgToCanvas(img, w, h){
  const c = makeCanvas(w || img.naturalWidth || img.width, h || img.naturalHeight || img.height);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
PT.imgToCanvas = imgToCanvas;

function canvasToBlob(canvas, type, quality){
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('Браузер не смог закодировать ' + type)), type || 'image/png', quality);
  });
}
PT.canvasToBlob = canvasToBlob;

/** Пошаговое изменение размера: качественнее одиночного drawImage при большой разнице. */
function smartResize(source, targetW, targetH, opts){
  opts = opts || {};
  const smooth = opts.smooth !== false;
  let canvas = source instanceof HTMLCanvasElement ? source : imgToCanvas(source);
  let curW = canvas.width, curH = canvas.height;
  targetW = Math.max(1, Math.round(targetW)); targetH = Math.max(1, Math.round(targetH));

  if (!smooth){
    const out = makeCanvas(targetW, targetH);
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(canvas, 0, 0, targetW, targetH);
    return out;
  }
  // уменьшение — половинками, увеличение — удвоением: меньше артефактов
  while (curW * 2 <= targetW && curH * 2 <= targetH){
    const step = makeCanvas(curW * 2, curH * 2);
    const c = step.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, curW * 2, curH * 2);
    canvas = step; curW = step.width; curH = step.height;
  }
  while (curW / 2 >= targetW && curH / 2 >= targetH && curW > 2 && curH > 2){
    const step = makeCanvas(curW / 2, curH / 2);
    const c = step.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, step.width, step.height);
    canvas = step; curW = step.width; curH = step.height;
  }
  if (curW !== targetW || curH !== targetH){
    const out = makeCanvas(targetW, targetH);
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, targetW, targetH);
    canvas = out;
  }
  if (opts.sharpen) unsharpMask(canvas, opts.sharpen === true ? 0.6 : opts.sharpen);
  return canvas;
}
PT.smartResize = smartResize;

function unsharpMask(canvas, amount){
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (w < 3 || h < 3) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data, src = new Uint8ClampedArray(d);
  const a = amount == null ? 0.6 : amount;
  for (let y = 1; y < h - 1; y++){
    for (let x = 1; x < w - 1; x++){
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++){
        const blur = (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]) / 4;
        d[i + c] = clamp(src[i + c] + (src[i + c] - blur) * a, 0, 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
PT.unsharpMask = unsharpMask;

/* ---------- цвет ---------- */
const Color = {
  hexToRgb(hex){
    hex = String(hex).replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    const n = parseInt(hex, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },
  rgbToHex(r, g, b){
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  },
  rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min){
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  },
  hslToRgb(h, s, l){
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
  },
  hslToHex(h, s, l){ const c = Color.hslToRgb(h, s, l); return Color.rgbToHex(c.r, c.g, c.b); },
  hexToHsl(hex){ const c = Color.hexToRgb(hex); return Color.rgbToHsl(c.r, c.g, c.b); },
  rgbToHsv(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d){
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max * 100 : 0, v: max * 100 };
  },
  rgbToCmyk(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return { c: (1 - r - k) / (1 - k) * 100, m: (1 - g - k) / (1 - k) * 100, y: (1 - b - k) / (1 - k) * 100, k: k * 100 };
  },
  luminance(r, g, b){
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  },
  contrast(hex1, hex2){
    const a = Color.hexToRgb(hex1), b = Color.hexToRgb(hex2);
    const l1 = Color.luminance(a.r, a.g, a.b), l2 = Color.luminance(b.r, b.g, b.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  },
  readableOn(hex){
    const c = Color.hexToRgb(hex);
    return Color.luminance(c.r, c.g, c.b) > 0.42 ? '#101216' : '#ffffff';
  },
  /* OKLCH — современное перцептивное пространство, используется в CSS Color 4 */
  rgbToOklch(r, g, b){
    const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = f(r), G = f(g), B = f(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.sqrt(A * A + Bb * Bb);
    let H = Math.atan2(Bb, A) * 180 / Math.PI; if (H < 0) H += 360;
    return { l: L * 100, c: C, h: H };
  }
};
PT.Color = Color;

/* ---------- CRC32 / ZIP (свой, без библиотек) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf, seed){
  let c = (seed == null ? 0 : seed) ^ 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
PT.crc32 = crc32;

async function deflateRaw(bytes){
  if (typeof CompressionStream === 'undefined') return null;
  try{
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch(e){ return null; }
}
async function inflateRaw(bytes){
  if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
PT.deflateRaw = deflateRaw; PT.inflateRaw = inflateRaw;

/** Минимальный ZIP-архиватор: PT.zip([{name, data}]) → Blob */
async function zip(entries){
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const entry of entries){
    let data = entry.data;
    if (typeof data === 'string') data = enc.encode(data);
    else if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
    else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(data);
    let stored = data, method = 0;
    if (data.length > 128){
      const packed = await deflateRaw(data);
      if (packed && packed.length < data.length){ stored = packed; method = 8; }
    }
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);      // время/дата — фиксированные
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, stored);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + stored.length;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
PT.zip = zip;

/** Чтение ZIP: Blob → { 'path': Uint8Array } */
async function unzip(blob){
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  const dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--){
    if (view.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Это не ZIP-архив');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = {};
  for (let i = 0; i < count; i++){
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out[name] = method === 8 ? await inflateRaw(raw) : raw;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
PT.unzip = unzip;

/* ---------- буфер обмена ---------- */
async function copy(text, silent){
  try{
    await navigator.clipboard.writeText(text);
    if (!silent) PT.toast('Скопировано', 'ok');
    return true;
  } catch(e){
    // file:// и небезопасный контекст — фолбэк через скрытое поле
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e2){}
    ta.remove();
    if (!silent) PT.toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
    return ok;
  }
}
PT.copy = copy;

/* ---------- csv ---------- */
function parseCSV(text, delimiter){
  const d = delimiter || detectDelimiter(text);
  const rows = []; let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (inQuotes){
      if (c === '"'){
        if (text[i + 1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === d){ row.push(field); field = ''; }
    else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r'){ /* пропускаем */ }
    else field += c;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim() !== '');
}
function detectDelimiter(text){
  const head = text.slice(0, 4000);
  const counts = [',', ';', '\t', '|'].map(d => [d, (head.match(new RegExp('\\' + d, 'g')) || []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ',';
}
function csvToObjects(text, delimiter){
  const rows = parseCSV(text, delimiter);
  if (!rows.length) return [];
  const head = rows[0].map((h, i) => (h || '').trim() || 'col' + (i + 1));
  return rows.slice(1).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = r[i] === undefined ? '' : r[i]); return o;
  });
}
function objectsToCSV(rows, delimiter){
  if (!rows.length) return '';
  const d = delimiter || ',';
  const head = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
  const cell = v => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    const needsQuotes = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(d);
    return needsQuotes ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [head.join(d)].concat(rows.map(r => head.map(h => cell(r[h])).join(d))).join('\n');
}
PT.parseCSV = parseCSV; PT.csvToObjects = csvToObjects; PT.objectsToCSV = objectsToCSV;
PT.detectDelimiter = detectDelimiter;


/* ===== core/02-ui.js ===== */
/* ======================================================================
   PIXTOOL CORE — UI-кит
   Компактные конструкторы, чтобы каждый инструмент был в 100-200 строк.
====================================================================== */
const ui = PT.ui = {};

/* ---------- тосты ---------- */
let toastHost = null;
PT.toast = function(msg, kind, ms){
  if (!toastHost){
    toastHost = el('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  const t = el('div', { class: 'toast ' + (kind || '') }, [
    el('span', { class: 'toast-ico', text: kind === 'err' ? '!' : kind === 'ok' ? '✓' : 'i' }),
    el('span', { text: msg })
  ]);
  toastHost.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms || 2600);
  return t;
};

/* ---------- модальное окно ---------- */
ui.modal = function(title, content, opts){
  opts = opts || {};
  const box = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'icon-btn', title: 'Закрыть', onclick: close }, '✕')
    ]),
    el('div', { class: 'modal-body' }, content),
    opts.actions ? el('div', { class: 'modal-foot' }, opts.actions) : null
  ]);
  const back = el('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } }, box);
  function close(){ back.classList.add('out'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', onKey); }
  function onKey(e){ if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  return { close, box };
};

ui.confirm = function(title, text){
  return new Promise(res => {
    const yes = ui.btn('Да', () => { m.close(); res(true); });
    const no  = ui.btn('Отмена', () => { m.close(); res(false); }, { ghost: true });
    const m = ui.modal(title, el('p', { class: 'muted', text: text }), { actions: [no, yes] });
  });
};

/* ---------- базовые элементы ---------- */
ui.btn = function(label, onClick, opts){
  opts = opts || {};
  const cls = ['btn', opts.ghost && 'ghost', opts.teal && 'teal', opts.danger && 'danger',
               opts.small && 'small', opts.wide && 'wide'].filter(Boolean).join(' ');
  return el('button', { class: cls, onclick: onClick, type: 'button', title: opts.title || null }, label);
};

ui.iconBtn = function(icon, title, onClick){
  return el('button', { class: 'icon-btn', title: title, onclick: onClick, type: 'button' }, icon);
};

ui.h = (text, sub) => el('div', { class: 'sec-head' }, [
  el('h3', { text }), sub ? el('p', { class: 'muted', text: sub }) : null
]);

ui.card = (kids, cls) => el('div', { class: 'card ' + (cls || '') }, kids);
ui.row  = (kids, cls) => el('div', { class: 'row ' + (cls || '') }, kids);
ui.grid = (cols, kids) => el('div', { class: 'grid cols-' + cols }, kids);
ui.muted = text => el('p', { class: 'muted', text });
ui.spacer = h => el('div', { style: { height: (h || 12) + 'px' } });

ui.status = function(){
  const node = el('div', { class: 'status-line' });
  node.set = (msg, kind) => { node.textContent = msg || ''; node.className = 'status-line ' + (kind || ''); return node; };
  node.ok = m => node.set(m, 'ok');
  node.err = m => node.set(m, 'err');
  node.busy = m => node.set(m || 'Обработка…', 'busy');
  return node;
};

ui.progress = function(){
  const bar = el('i');
  const node = el('div', { class: 'progress' }, bar);
  node.style.display = 'none';
  node.set = (frac, label) => {
    node.style.display = 'block';
    bar.style.width = clamp(frac * 100, 0, 100) + '%';
    if (label) bar.setAttribute('data-label', label);
  };
  node.hide = () => { node.style.display = 'none'; bar.style.width = '0%'; };
  return node;
};

/* ---------- поля формы ---------- */
function makeControl(spec){
  const t = spec.type || 'text';
  let node;
  if (t === 'select'){
    node = el('select');
    (spec.options || []).forEach(o => {
      const [val, label] = Array.isArray(o) ? o : [o, o];
      node.appendChild(el('option', { value: val, text: label }));
    });
    node.value = spec.value != null ? spec.value : (node.options[0] && node.options[0].value);
  } else if (t === 'textarea'){
    node = el('textarea', { rows: spec.rows || 5, placeholder: spec.placeholder || '', spellcheck: 'false' });
    node.value = spec.value || '';
  } else if (t === 'checkbox'){
    node = el('input', { type: 'checkbox' });
    node.checked = !!spec.value;
  } else if (t === 'range'){
    node = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step || 1, value: spec.value });
  } else if (t === 'color'){
    node = el('input', { type: 'color', value: spec.value || '#e8a33d' });
  } else if (t === 'number'){
    node = el('input', { type: 'number', value: spec.value, min: spec.min, max: spec.max, step: spec.step });
  } else {
    node = el('input', { type: t, value: spec.value || '', placeholder: spec.placeholder || '', spellcheck: 'false' });
  }
  if (spec.attrs) for (const k in spec.attrs) node.setAttribute(k, spec.attrs[k]);
  return node;
}

/**
 * Декларативная форма.
 * PT.ui.form([{ id, type, label, value, options, hint, min, max, step, col }], onChange)
 * → узел с .values(), .get(id), .set(id, v), .field(id), .show(id, bool)
 */
ui.form = function(specs, onChange){
  const wrap = el('div', { class: 'form' });
  const controls = {}, fields = {};
  specs.forEach(spec => {
    if (spec.type === 'html'){ wrap.appendChild(spec.node); return; }
    const ctrl = makeControl(spec);
    controls[spec.id] = ctrl;
    const valueOut = spec.type === 'range' ? el('output', { text: String(spec.value) }) : null;
    let inner;
    if (spec.type === 'checkbox'){
      inner = el('label', { class: 'check' }, [ctrl, el('span', { text: spec.label })]);
    } else {
      inner = el('div', {}, [
        el('label', {}, [spec.label, valueOut ? el('em', {}, valueOut) : null]),
        ctrl,
        spec.hint ? el('span', { class: 'hint', text: spec.hint }) : null
      ]);
    }
    const field = el('div', { class: 'field' + (spec.col ? ' col-' + spec.col : '') }, inner);
    fields[spec.id] = field;
    wrap.appendChild(field);
    const evt = (spec.type === 'range' || spec.type === 'text' || spec.type === 'textarea' || spec.type === 'number') ? 'input' : 'change';
    ctrl.addEventListener(evt, () => {
      if (valueOut) valueOut.textContent = ctrl.value + (spec.unit || '');
      if (onChange) onChange(spec.id, wrap.values());
    });
    if (evt === 'input') ctrl.addEventListener('change', () => { if (onChange) onChange(spec.id, wrap.values()); });
  });
  wrap.values = () => {
    const out = {};
    for (const id in controls){
      const c = controls[id];
      out[id] = c.type === 'checkbox' ? c.checked
        : (c.type === 'number' || c.type === 'range') ? Number(c.value) : c.value;
    }
    return out;
  };
  wrap.get = id => wrap.values()[id];
  wrap.set = (id, v) => {
    const c = controls[id]; if (!c) return;
    if (c.type === 'checkbox') c.checked = !!v; else c.value = v;
    const out = fields[id] && fields[id].querySelector('output');
    if (out) out.textContent = v;
  };
  wrap.ctrl = id => controls[id];
  wrap.field = id => fields[id];
  wrap.show = (id, on) => { if (fields[id]) fields[id].style.display = on ? '' : 'none'; };
  return wrap;
};

/* ---------- зона перетаскивания ---------- */
ui.drop = function(opts){
  opts = opts || {};
  const input = el('input', { type: 'file', style: { display: 'none' } });
  if (opts.accept) input.accept = opts.accept;
  if (opts.multiple) input.multiple = true;
  const zone = el('div', { class: 'dropzone' }, [
    el('div', { class: 'dz-icon', text: opts.icon || '⬍' }),
    el('strong', { text: opts.title || (opts.multiple ? 'Перетащи файлы сюда' : 'Перетащи файл сюда') }),
    el('span', { class: 'dz-sub', text: opts.hint || 'или нажми, чтобы выбрать' }),
    input
  ]);
  const fire = files => {
    const list = Array.from(files);
    if (!list.length) return;
    opts.onFiles(opts.multiple ? list : list.slice(0, 1));
  };
  zone.addEventListener('click', e => { if (e.target !== input) input.click(); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); fire(e.dataTransfer.files); });
  input.addEventListener('change', () => { fire(input.files); input.value = ''; });
  zone.openPicker = () => input.click();
  // вставка из буфера обмена
  if (opts.paste !== false){
    zone.tabIndex = 0;
    document.addEventListener('paste', e => {
      if (!zone.isConnected || !zone.offsetParent) return;
      const files = Array.from(e.clipboardData.files || []);
      if (files.length){ e.preventDefault(); fire(files); PT.toast('Вставлено из буфера', 'ok'); }
    });
  }
  return zone;
};

/* ---------- результат ---------- */
ui.result = function(){
  const box = el('div', { class: 'result-box' });
  box.style.display = 'none';
  box.clear = () => { box.innerHTML = ''; box.style.display = 'none'; return box; };
  box.open = () => { box.style.display = 'block'; return box; };
  /** показать файл: превью (если картинка) + кнопка скачивания */
  box.file = (blob, filename, meta) => {
    box.open();
    const url = URL.createObjectURL(blob);
    const item = el('div', { class: 'res-item' });
    if (blob.type.startsWith('image/')){
      item.appendChild(el('img', { class: 'res-preview', src: url, alt: filename }));
    } else if (blob.type.startsWith('video/')){
      const v = el('video', { class: 'res-preview', src: url, controls: true });
      item.appendChild(v);
    } else if (blob.type.startsWith('audio/')){
      item.appendChild(el('audio', { src: url, controls: true, style: { width: '100%' } }));
    }
    item.appendChild(el('div', { class: 'res-meta' }, [
      el('strong', { text: filename }),
      el('span', { class: 'muted', text: (meta ? meta + ' · ' : '') + fmtBytes(blob.size) })
    ]));
    item.appendChild(el('a', {
      class: 'download-link', href: url, download: filename,
      onclick: () => PT.toast('Сохранено: ' + filename, 'ok')
    }, 'Скачать'));
    box.appendChild(item);
    return item;
  };
  box.add = node => { box.open(); box.appendChild(node); return box; };
  box.text = (label, value) => {
    box.open();
    box.appendChild(el('div', { class: 'res-kv' }, [el('span', { text: label }), el('b', { text: value })]));
    return box;
  };
  return box;
};

/* ---------- поле с копированием ---------- */
ui.copyBox = function(value, opts){
  opts = opts || {};
  const ta = el('textarea', { rows: opts.rows || 4, readonly: opts.editable ? null : true, spellcheck: 'false' });
  ta.value = value || '';
  const btn = ui.btn('Копировать', () => copy(ta.value), { small: true, ghost: true });
  const wrap = el('div', { class: 'copybox' }, [
    opts.label ? el('label', { text: opts.label }) : null,
    ta,
    el('div', { class: 'row gap' }, [btn, opts.extra || null])
  ]);
  wrap.setValue = v => { ta.value = v; };
  wrap.getValue = () => ta.value;
  wrap.textarea = ta;
  return wrap;
};

/* ---------- вкладки ---------- */
ui.tabs = function(items, onSwitch){
  const bar = el('div', { class: 'pillbar' });
  const body = el('div', { class: 'tab-body' });
  let active = null;
  items.forEach((it, i) => {
    const pill = el('button', { class: 'pill', type: 'button', text: it.label, onclick: () => select(it.id) });
    pill.dataset.id = it.id;
    bar.appendChild(pill);
  });
  function select(id){
    active = id;
    $$('.pill', bar).forEach(p => p.classList.toggle('active', p.dataset.id === id));
    body.innerHTML = '';
    const item = items.find(x => x.id === id);
    if (item){
      const content = typeof item.render === 'function' ? item.render() : item.content;
      if (content) body.appendChild(content);
    }
    if (onSwitch) onSwitch(id);
  }
  const wrap = el('div', {}, [bar, body]);
  wrap.select = select;
  if (items.length) select(items[0].id);
  return wrap;
};

/* ---------- таблица ключ-значение ---------- */
ui.kv = function(pairs){
  return el('div', { class: 'kv' }, pairs.map(([k, v]) =>
    el('div', { class: 'kv-row' }, [el('span', { text: k }), el('b', { text: String(v) })])
  ));
};

/* ---------- список файлов ---------- */
ui.fileList = function(onRemove){
  const list = el('div', { class: 'filelist' });
  list.render = files => {
    list.innerHTML = '';
    files.forEach((f, i) => {
      const row = el('div', { class: 'file-row' }, [
        el('span', { class: 'f-idx', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'f-name', text: f.name }),
        el('span', { class: 'f-size muted', text: fmtBytes(f.size) }),
        onRemove ? ui.iconBtn('✕', 'Убрать', () => onRemove(i)) : null
      ]);
      list.appendChild(row);
    });
    list.style.display = files.length ? 'block' : 'none';
  };
  return list;
};

/* ---------- превью-сетка изображений ---------- */
ui.thumbGrid = function(){
  const grid = el('div', { class: 'thumb-grid' });
  grid.add = (src, caption, onClick) => {
    const cell = el('div', { class: 'thumb' + (onClick ? ' clickable' : ''), onclick: onClick || null }, [
      el('img', { src, alt: caption || '' }),
      caption ? el('span', { text: caption }) : null
    ]);
    grid.appendChild(cell);
    return cell;
  };
  grid.clear = () => { grid.innerHTML = ''; };
  return grid;
};

/* ---------- обработка ошибок инструмента ---------- */
ui.guard = function(statusNode, fn){
  return async (...args) => {
    try{
      const r = await fn(...args);
      return r;
    } catch(err){
      console.error(err);
      if (statusNode) statusNode.err('Ошибка: ' + (err && err.message ? err.message : err));
      else PT.toast('Ошибка: ' + (err.message || err), 'err');
    }
  };
};


/* ===== core/03-app.js ===== */
/* ======================================================================
   PIXTOOL CORE — реестр, роутер, оболочка
====================================================================== */

/* ---------- категории ---------- */
PT.cats = [
  { id: 'image',  title: 'Изображения',   icon: '▣', desc: 'Конвертация, сжатие, редактирование и подготовка графики' },
  { id: 'media',  title: 'Медиа',         icon: '▶', desc: 'Видео, аудио, GIF и запись экрана — прямо в браузере' },
  { id: 'doc',    title: 'Документы',     icon: '▤', desc: 'PDF, таблицы, Markdown и конвертация текстовых форматов' },
  { id: 'data',   title: 'Данные и код',  icon: '⌗', desc: 'JSON, хэши, кодировки, регулярки и всё для разработки' },
  { id: 'design', title: 'Дизайн и CSS',  icon: '◐', desc: 'Цвета, градиенты, тени, типографика и генераторы кода' },
  { id: 'util',   title: 'Утилиты',       icon: '⚙', desc: 'QR-коды, пароли, шифрование и прочие мелочи' }
];

/* ---------- регистрация инструмента ---------- */
PT.tool = function(def){
  if (PT._byId[def.id]) { console.warn('Дубликат инструмента:', def.id); return; }
  def.keywords = def.keywords || [];
  PT.tools.push(def);
  PT._byId[def.id] = def;
};
PT.getTool = id => PT._byId[id];
PT.toolsOf = cat => PT.tools.filter(t => t.cat === cat);

/* ---------- база путей и ссылки ---------- */
(function(){
  const script = document.currentScript || $('script[data-pt-base]');
  const rel = script && script.dataset ? (script.dataset.ptBase || './') : './';
  PT.base = new URL(rel, location.href).href;
})();

PT.hrefFor = id => PT.mode === 'web'
  ? (id ? PT.base + 't/' + id + '/' : PT.base)
  : (id ? '#/t/' + id : '#/');

/* ---------- избранное и недавние ---------- */
const favs = {
  list: () => store.get('favs', []),
  has: id => favs.list().includes(id),
  toggle(id){
    const l = favs.list();
    const i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.push(id);
    store.set('favs', l);
    return i < 0;
  }
};
PT.favs = favs;

function pushRecent(id){
  const l = store.get('recent', []).filter(x => x !== id);
  l.unshift(id);
  store.set('recent', l.slice(0, 8));
}

/* ---------- тема ---------- */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  store.set('theme', theme);
  const btn = $('#themeBtn');
  if (btn) btn.textContent = theme === 'light' ? '☾' : '☀';
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f2ee' : '#101216');
}
PT.applyTheme = applyTheme;
PT.toggleTheme = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');

/* ---------- ленивые зависимости ---------- */
const VENDOR = {
  xlsx:     { file: 'xlsx.min.js',      global: 'XLSX' },
  pdflib:   { file: 'pdf-lib.min.js',   global: 'PDFLib' },
  pdfjs:    { file: 'pdf.min.js',       global: 'pdfjsLib' },
  marked:   { file: 'marked.min.js',    global: 'marked' },
  turndown: { file: 'turndown.min.js',  global: 'TurndownService' },
  jsqr:     { file: 'jsqr.min.js',      global: 'jsQR' },
  qrgen:    { file: 'qrcode.min.js',    global: 'qrcode' }
};
const loading = {};

PT.need = function(...names){
  return Promise.all(names.map(name => {
    const spec = VENDOR[name];
    if (!spec) return Promise.reject(new Error('Неизвестная зависимость: ' + name));
    if (window[spec.global]) return afterLoad(name);
    if (loading[name]) return loading[name];
    if (PT.mode === 'offline'){
      return Promise.reject(new Error('Модуль ' + name + ' не встроен в этот файл'));
    }
    loading[name] = new Promise((res, rej) => {
      const s = el('script', {
        src: PT.base + 'assets/vendor/' + spec.file,
        onload: () => res(),
        onerror: () => rej(new Error('Не удалось загрузить модуль ' + name + '. Проверь соединение.'))
      });
      document.head.appendChild(s);
    }).then(() => afterLoad(name));
    return loading[name];
  }));
};

function afterLoad(name){
  if (name === 'pdfjs' && window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc){
    if (PT.mode === 'offline' && PT._pdfWorkerCode){
      const blob = new Blob([PT._pdfWorkerCode], { type: 'text/javascript' });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PT.base + 'assets/vendor/pdf.worker.min.js';
    }
  }
  return Promise.resolve();
}

/* ---------- каркас ---------- */
function buildShell(){
  const side = el('aside', { class: 'side', id: 'sidebar' }, [
    el('div', { class: 'side-head' }, [
      el('a', { class: 'brand', href: PT.hrefFor(null), onclick: linkNav }, [
        el('span', { class: 'brand-mark', html: '<i></i>'.repeat(16) }),
        el('span', { class: 'brand-name' }, ['PixTool', el('span', { text: PT.mode === 'offline' ? '.local' : '.online' })])
      ]),
      el('button', { class: 'side-search', onclick: () => PT.palette() }, [
        el('span', { text: '⌕ Найти инструмент' }),
        el('kbd', { text: 'Ctrl K' })
      ])
    ]),
    el('nav', { class: 'side-nav', id: 'sideNav' }),
    el('div', { class: 'side-foot' }, [
      el('span', { class: 'grow', text: 'v' + PT.version }),
      el('button', { class: 'icon-btn', id: 'themeBtn', title: 'Сменить тему', onclick: PT.toggleTheme }, '☀'),
      ui.iconBtn('?', 'Справка и горячие клавиши', showHelp)
    ])
  ]);

  const main = el('div', { class: 'main' }, [
    el('header', { class: 'topbar' }, [
      el('button', { class: 'icon-btn burger', title: 'Меню', onclick: () => side.classList.toggle('open') }, '☰'),
      el('div', { class: 'crumbs', id: 'crumbs' }),
      el('div', { class: 'sp' }),
      el('button', { class: 'icon-btn', id: 'favBtn', title: 'В избранное', onclick: toggleFavCurrent }, '☆'),
      ui.iconBtn('⌕', 'Поиск (Ctrl+K)', () => PT.palette())
    ]),
    el('div', { class: 'view', id: 'view' }),
    el('footer', { class: 'foot' }, [
      el('span', { text: 'PIXTOOL — всё считается локально, файлы никуда не отправляются' }),
      el('a', { href: PT.hrefFor(null), onclick: linkNav, text: 'Все инструменты' }),
      el('span', { text: 'v' + PT.version + ' · ' + PT.build })
    ])
  ]);

  const app = el('div', { class: 'app' }, [side, main]);
  document.body.appendChild(app);
  renderNav();
}

function linkNav(e){
  if (PT.mode !== 'web') return;                       // офлайн — обычные hash-ссылки
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  const href = e.currentTarget.getAttribute('href');
  history.pushState({}, '', href);
  route();
  $('#sidebar').classList.remove('open');
}

function renderNav(){
  const nav = $('#sideNav');
  if (!nav) return;
  nav.innerHTML = '';
  const favList = favs.list();
  if (favList.length){
    const g = el('div', { class: 'nav-group' }, el('div', { class: 'nav-title' }, ['Избранное', el('b', { text: String(favList.length) })]));
    favList.forEach(id => { const t = PT.getTool(id); if (t) g.appendChild(navItem(t)); });
    nav.appendChild(g);
  }
  PT.cats.forEach(cat => {
    const tools = PT.toolsOf(cat.id);
    if (!tools.length) return;
    const g = el('div', { class: 'nav-group' }, el('div', { class: 'nav-title' }, [cat.title, el('b', { text: String(tools.length) })]));
    tools.forEach(t => g.appendChild(navItem(t)));
    nav.appendChild(g);
  });
  highlightNav();
}

function navItem(t){
  return el('a', { class: 'nav-item', href: PT.hrefFor(t.id), 'data-id': t.id, onclick: linkNav }, [
    el('span', { class: 'ico', text: t.icon || '·' }),
    el('span', { text: t.title })
  ]);
}

function highlightNav(){
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.id === PT.current));
}

function toggleFavCurrent(){
  if (!PT.current) return;
  const on = favs.toggle(PT.current);
  $('#favBtn').textContent = on ? '★' : '☆';
  $('#favBtn').classList.toggle('on', on);
  PT.toast(on ? 'Добавлено в избранное' : 'Убрано из избранного', 'ok');
  renderNav();
}

/* ---------- роутер ---------- */
function currentRoute(){
  if (PT.mode === 'web'){
    const path = decodeURIComponent(location.pathname);
    const basePath = new URL(PT.base).pathname;
    const rest = path.startsWith(basePath) ? path.slice(basePath.length) : path.replace(/^\//, '');
    const m = rest.match(/^t\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }
  const m = location.hash.match(/^#\/t\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

function route(){
  const id = currentRoute() || (document.body.dataset.tool || null);
  const view = $('#view');
  view.innerHTML = '';
  window.scrollTo({ top: 0 });
  PT._cleanup.forEach(fn => { try { fn(); } catch(e){} });
  PT._cleanup = [];

  if (!id){
    PT.current = null;
    renderHome(view);
    setCrumbs(null);
  } else {
    const tool = PT.getTool(id);
    if (!tool){
      PT.current = null;
      view.appendChild(el('div', { class: 'card' }, [
        el('h2', { text: 'Инструмент не найден' }),
        ui.muted('Возможно, ссылка устарела. Открой список всех инструментов.'),
        ui.spacer(),
        ui.btn('На главную', () => PT.go(null))
      ]));
      setCrumbs(null);
      return;
    }
    PT.current = id;
    pushRecent(id);
    setCrumbs(tool);
    const head = el('div', { class: 'page-head' }, [
      el('p', { class: 'eyebrow', text: '// ' + (PT.cats.find(c => c.id === tool.cat) || {}).title }),
      el('h1', { text: tool.title }),
      el('p', { text: tool.desc })
    ]);
    view.appendChild(head);
    const root = el('div', { class: 'tool-root' });
    view.appendChild(root);
    try { tool.render(root); }
    catch(err){
      console.error(err);
      root.appendChild(el('div', { class: 'card' }, ui.muted('Не удалось запустить инструмент: ' + err.message)));
    }
    document.title = tool.title + ' — PixTool';
  }
  highlightNav();
  const btn = $('#favBtn');
  if (btn){
    const on = PT.current && favs.has(PT.current);
    btn.textContent = on ? '★' : '☆';
    btn.classList.toggle('on', !!on);
    btn.style.visibility = PT.current ? 'visible' : 'hidden';
  }
}
PT.route = route;
PT._cleanup = [];
PT.onCleanup = fn => PT._cleanup.push(fn);

PT.go = function(id){
  const href = PT.hrefFor(id);
  if (PT.mode === 'web'){ history.pushState({}, '', href); route(); }
  else location.hash = id ? '#/t/' + id : '#/';
};

function setCrumbs(tool){
  const c = $('#crumbs');
  if (!c) return;
  c.innerHTML = '';
  c.appendChild(el('a', { href: PT.hrefFor(null), onclick: linkNav, text: 'PixTool' }));
  if (tool){
    c.appendChild(el('span', { text: '/' }));
    c.appendChild(el('span', { text: (PT.cats.find(x => x.id === tool.cat) || {}).title || '' }));
    c.appendChild(el('span', { text: '/' }));
    c.appendChild(el('b', { text: tool.title }));
  } else {
    document.title = 'PixTool — ' + PT.tools.length + ' инструментов, всё в браузере';
  }
}

/* ---------- главная ---------- */
function renderHome(view){
  const hero = el('div', { class: 'hero' }, [
    el('h1', { text: 'Инструменты, которые работают у тебя в браузере' }),
    el('p', { text: 'Конвертация, редактирование, генерация и отладка — ' + PT.tools.length +
      ' инструментов без загрузки файлов на сервер. Ничего не отправляется в сеть: всё считает твой компьютер.' }),
    el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('b', { text: String(PT.tools.length) }), el('span', { text: 'инструментов' })]),
      el('div', { class: 'stat' }, [el('b', { text: String(PT.cats.length) }), el('span', { text: 'категорий' })]),
      el('div', { class: 'stat' }, [el('b', { text: '0' }), el('span', { text: 'байт на сервер' })]),
      el('div', { class: 'stat' }, [el('b', { text: PT.mode === 'offline' ? 'OFFLINE' : 'PWA' }),
        el('span', { text: PT.mode === 'offline' ? 'работает без сети' : 'ставится как приложение' })])
    ])
  ]);
  view.appendChild(hero);

  const search = el('input', { type: 'search', placeholder: 'Что нужно сделать? Например: сжать фото, json, qr…', id: 'homeSearch' });
  view.appendChild(el('div', { class: 'search-big' }, search));

  const results = el('div', { id: 'homeResults' });
  view.appendChild(results);

  const recent = store.get('recent', []).map(PT.getTool).filter(Boolean).slice(0, 6);

  function paint(query){
    results.innerHTML = '';
    const q = (query || '').trim().toLowerCase();
    if (q){
      const found = searchTools(q);
      const block = el('div', { class: 'cat-block' }, [
        el('div', { class: 'cat-head' }, [el('h2', { text: 'Найдено' }), el('span', { text: found.length + ' шт.' })]),
        found.length ? toolGrid(found) : ui.muted('Ничего не нашлось. Попробуй другое слово — например «pdf», «цвет», «хэш».')
      ]);
      results.appendChild(block);
      return;
    }
    if (recent.length){
      results.appendChild(el('div', { class: 'cat-block' }, [
        el('div', { class: 'cat-head' }, [el('h2', { text: 'Недавние' }), el('span', { text: 'история на этом устройстве' })]),
        toolGrid(recent)
      ]));
    }
    PT.cats.forEach(cat => {
      const tools = PT.toolsOf(cat.id);
      if (!tools.length) return;
      results.appendChild(el('div', { class: 'cat-block' }, [
        el('div', { class: 'cat-head' }, [
          el('h2', { text: cat.icon + '  ' + cat.title }),
          el('span', { text: cat.desc })
        ]),
        toolGrid(tools)
      ]));
    });
  }
  search.addEventListener('input', debounce(() => paint(search.value), 120));
  paint('');
}

function toolGrid(tools){
  return el('div', { class: 'tool-grid' }, tools.map(t => {
    const card = el('a', { class: 'tool-card', href: PT.hrefFor(t.id), onclick: linkNav }, [
      el('div', { class: 'tc-top' }, [
        el('span', { class: 'tc-ico', text: t.icon || '·' }),
        el('h3', { text: t.title })
      ]),
      el('p', { text: t.desc })
    ]);
    const star = el('span', { class: 'fav' + (favs.has(t.id) ? ' on' : ''), text: favs.has(t.id) ? '★' : '☆',
      onclick: e => {
        e.preventDefault(); e.stopPropagation();
        const on = favs.toggle(t.id);
        star.textContent = on ? '★' : '☆';
        star.classList.toggle('on', on);
        renderNav();
      } });
    card.appendChild(star);
    return card;
  }));
}

function searchTools(q){
  const words = q.split(/\s+/).filter(Boolean);
  return PT.tools.map(t => {
    const hay = (t.title + ' ' + t.desc + ' ' + t.keywords.join(' ') + ' ' + t.id).toLowerCase();
    let score = 0;
    words.forEach(w => {
      if (t.title.toLowerCase().startsWith(w)) score += 12;
      else if (t.title.toLowerCase().includes(w)) score += 8;
      if (t.keywords.some(k => k.toLowerCase() === w)) score += 7;
      if (hay.includes(w)) score += 3;
    });
    return { t, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.t);
}
PT.searchTools = searchTools;

/* ---------- командная палитра ---------- */
PT.palette = function(){
  if ($('.cmdk-back')) return;
  const input = el('input', { type: 'text', placeholder: 'Инструмент, формат или задача…', spellcheck: 'false' });
  const list = el('div', { class: 'cmdk-list' });
  const box = el('div', { class: 'cmdk' }, [input, list]);
  const back = el('div', { class: 'cmdk-back', onclick: e => { if (e.target === back) close(); } }, box);
  let items = [], sel = 0;

  function paint(){
    const q = input.value.trim().toLowerCase();
    items = q ? searchTools(q) : PT.tools.slice(0, 40);
    sel = 0;
    list.innerHTML = '';
    if (!items.length){
      list.appendChild(el('div', { class: 'cmdk-empty', text: 'Ничего не найдено' }));
      return;
    }
    items.forEach((t, i) => {
      const row = el('div', { class: 'cmdk-item' + (i === 0 ? ' sel' : ''), onclick: () => pick(i) }, [
        el('span', { class: 'ico', text: t.icon || '·' }),
        el('span', { class: 'txt' }, [el('b', { text: t.title }), el('span', { text: t.desc })]),
        el('span', { class: 'cat', text: (PT.cats.find(c => c.id === t.cat) || {}).title || '' })
      ]);
      row.addEventListener('mousemove', () => { if (sel !== i){ sel = i; mark(); } });
      list.appendChild(row);
    });
  }
  function mark(){
    $$('.cmdk-item', list).forEach((n, i) => n.classList.toggle('sel', i === sel));
    const node = $$('.cmdk-item', list)[sel];
    if (node) node.scrollIntoView({ block: 'nearest' });
  }
  function pick(i){ const t = items[i]; if (!t) return; close(); PT.go(t.id); }
  function close(){ back.remove(); document.removeEventListener('keydown', onKey, true); }
  function onKey(e){
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); mark(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
    else if (e.key === 'Enter'){ e.preventDefault(); pick(sel); }
  }
  input.addEventListener('input', paint);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  paint();
  input.focus();
};

/* ---------- справка ---------- */
function showHelp(){
  ui.modal('Справка', el('div', {}, [
    el('p', { class: 'muted', text: 'PixTool выполняет все операции локально: файлы не покидают устройство. ' +
      (PT.mode === 'offline'
        ? 'Это офлайн-сборка — один файл, работает без интернета, можно носить на флешке.'
        : 'Сайт устанавливается как приложение и работает офлайн после первого открытия.') }),
    el('hr', { class: 'sep' }),
    el('h4', { text: 'Горячие клавиши' }), ui.spacer(8),
    ui.kv([
      ['Ctrl + K', 'Поиск по инструментам'],
      ['Ctrl + /', 'Эта справка'],
      ['Esc', 'Закрыть окно'],
      ['Ctrl + Z / Ctrl + Shift + Z', 'Отмена и возврат в редакторе изображений'],
      ['Ctrl + S', 'Сохранить результат (в редакторе)']
    ]),
    el('hr', { class: 'sep' }),
    el('h4', { text: 'Совместимость' }), ui.spacer(8),
    ui.muted('Нужен современный браузер: Chrome/Edge 105+, Firefox 113+, Safari 16.4+. ' +
             'Часть форматов (AVIF, WebP-энкодер) зависит от возможностей браузера.'),
    PT.mode === 'web' ? el('div', {}, [
      el('hr', { class: 'sep' }),
      el('h4', { text: 'Офлайн-режим' }), ui.spacer(8),
      ui.muted('Страницы уже работают без сети. Тяжёлые модули (PDF, Excel, QR — около 3 МБ) ' +
               'подгружаются по мере надобности: нажми кнопку, чтобы сохранить их заранее.'),
      ui.spacer(10),
      ui.btn('Скачать все модули для офлайна', prefetchVendor)
    ]) : null
  ]));
}
PT.showHelp = showHelp;

/** Просим service worker сложить в кэш все внешние модули — тогда офлайн полный. */
function prefetchVendor(){
  const urls = Object.values(VENDOR).map(v => PT.base + 'assets/vendor/' + v.file)
    .concat([PT.base + 'assets/vendor/pdf.worker.min.js']);
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller){
    PT.toast('Офлайн-кэш ещё не активен — обнови страницу и попробуй снова', 'err');
    return;
  }
  PT.toast('Скачиваю модули…');
  navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_VENDOR', urls });
  navigator.serviceWorker.addEventListener('message', function once(e){
    if (!e.data) return;
    if (e.data.type === 'VENDOR_READY') PT.toast('Готово: теперь всё работает без интернета', 'ok');
    if (e.data.type === 'VENDOR_FAILED') PT.toast('Не удалось скачать часть модулей', 'err');
    navigator.serviceWorker.removeEventListener('message', once);
  });
}

/* ---------- запуск ---------- */
PT.boot = function(){
  applyTheme(store.get('theme', 'dark'));
  buildShell();
  route();
  if (PT.mode === 'web') window.addEventListener('popstate', route);
  else window.addEventListener('hashchange', route);

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) ||
                   document.activeElement.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); PT.palette(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '/'){ e.preventDefault(); showHelp(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey){ e.preventDefault(); PT.palette(); }
  });

  // общий приём файлов: перетаскивание в окно подсвечивает активную зону
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
};


/* ===== core/04-helpers.js ===== */
/* ======================================================================
   PIXTOOL CORE — типовые сценарии инструментов
====================================================================== */

/**
 * Пакетная обработка изображений: дропзона + список + настройки + результаты + ZIP.
 * opts: { accept, multiple, hint, form:[spec], onChange(id, values, api),
 *         process(img, values, file, api) -> {blob, name, meta} | null,
 *         actionLabel, note, auto }
 */
PT.imageBatch = function(root, opts){
  opts = opts || {};
  const files = [];
  const status = ui.status();
  const progress = ui.progress();
  const results = [];

  const drop = ui.drop({
    accept: opts.accept || 'image/*',
    multiple: opts.multiple !== false,
    title: opts.multiple === false ? 'Перетащи изображение' : 'Перетащи изображения',
    hint: opts.hint || 'PNG, JPEG, WebP, GIF, BMP, SVG · можно вставить из буфера (Ctrl+V)',
    onFiles: add
  });

  const list = ui.fileList(i => { files.splice(i, 1); list.render(files); syncUI(); });
  const form = opts.form ? ui.form(opts.form, (id, values) => {
    if (opts.onChange) opts.onChange(id, values, api);
  }) : null;

  const goBtn = ui.btn(opts.actionLabel || 'Обработать →', run);
  const zipBtn = ui.btn('Скачать всё архивом', downloadZip, { ghost: true });
  zipBtn.style.display = 'none';
  const clearBtn = ui.btn('Очистить', () => {
    files.length = 0; results.length = 0; list.render(files);
    resultBox.clear(); grid.clear(); zipBtn.style.display = 'none'; status.set(''); syncUI();
  }, { ghost: true, small: true });

  const grid = ui.thumbGrid();
  const resultBox = ui.result();

  const card = ui.card([
    drop, list,
    form ? el('div', {}, [el('hr', { class: 'sep' }), form]) : null,
    opts.note ? el('p', { class: 'hint', text: opts.note }) : null,
    ui.spacer(14),
    el('div', { class: 'row gap' }, [goBtn, zipBtn, clearBtn]),
    progress, status
  ]);
  root.appendChild(card);
  root.appendChild(grid);
  root.appendChild(resultBox);

  const api = {
    status, progress, files, results, form,
    values: () => (form ? form.values() : {}),
    rerun: run
  };

  function add(newFiles){
    newFiles.forEach(f => files.push(f));
    list.render(files);
    status.set(files.length === 1 ? files[0].name : files.length + ' файлов готовы к обработке');
    syncUI();
    if (opts.auto) run();
  }
  function syncUI(){
    goBtn.disabled = !files.length;
    if (opts.onFilesChange) opts.onFilesChange(files, api);
  }
  syncUI();

  async function run(){
    if (!files.length){ status.err('Сначала добавь файлы'); return; }
    results.length = 0;
    grid.clear(); resultBox.clear(); zipBtn.style.display = 'none';
    const values = api.values();
    status.busy('Обработка');
    goBtn.disabled = true;
    try{
      for (let i = 0; i < files.length; i++){
        progress.set(i / files.length, '');
        const file = files[i];
        let img = null;
        if (!/^image\/svg/.test(file.type) || true){
          try { img = await loadImage(file); } catch(e){ img = null; }
        }
        if (!img){ status.err('Не удалось прочитать ' + file.name); continue; }
        const out = await opts.process(img, values, file, api);
        if (!out) continue;
        const arr = Array.isArray(out) ? out : [out];
        arr.forEach(o => {
          results.push(o);
          const url = URL.createObjectURL(o.blob);
          grid.add(url, o.name.length > 22 ? o.name.slice(0, 20) + '…' : o.name, () => downloadBlob(o.blob, o.name));
        });
      }
      progress.set(1);
      setTimeout(() => progress.hide(), 400);
      if (!results.length){ status.err('Ничего не получилось обработать'); return; }
      if (results.length === 1){
        resultBox.file(results[0].blob, results[0].name, results[0].meta);
      } else {
        zipBtn.style.display = '';
        const total = results.reduce((a, r) => a + r.blob.size, 0);
        resultBox.open();
        resultBox.text('Готово файлов', String(results.length));
        resultBox.text('Общий размер', fmtBytes(total));
        resultBox.add(ui.muted('Клик по превью — скачать отдельный файл.'));
      }
      status.ok('Готово: ' + results.length + ' файл(ов)');
    } catch(err){
      console.error(err);
      progress.hide();
      status.err('Ошибка: ' + err.message);
    } finally {
      goBtn.disabled = false;
    }
  }

  async function downloadZip(){
    if (!results.length) return;
    status.busy('Упаковка архива');
    const used = {};
    const entries = results.map(r => {
      let name = r.name;
      if (used[name]){ const n = ++used[name]; name = name.replace(/(\.[^.]+)$/, '-' + n + '$1'); }
      else used[r.name] = 1;
      return { name, data: r.blob };
    });
    const blob = await zip(entries);
    downloadBlob(blob, 'pixtool-' + (opts.zipName || 'batch') + '.zip');
    status.ok('Архив собран: ' + fmtBytes(blob.size));
  }

  return api;
};

/**
 * Текстовый инструмент: слева ввод, справа результат, кнопки действий.
 * opts: { inputLabel, outputLabel, placeholder, sample, form:[spec], live,
 *         run(text, values) -> string | {text, status, badge}, actions:[{label, fn(api)}] }
 */
PT.textTool = function(root, opts){
  const status = ui.status();
  const inputTA = el('textarea', { rows: 14, placeholder: opts.placeholder || 'Вставь текст сюда…', spellcheck: 'false' });
  const outputTA = el('textarea', { rows: 14, readonly: true, spellcheck: 'false' });
  const form = opts.form ? ui.form(opts.form, () => { if (opts.live !== false) go(); }) : null;

  const api = {
    status, input: inputTA, output: outputTA, form,
    values: () => (form ? form.values() : {}),
    get: () => inputTA.value,
    set: v => { inputTA.value = v; go(); },
    setOutput: v => { outputTA.value = v; },
    run: () => go()
  };

  function go(){
    const text = inputTA.value;
    if (!text.trim() && !opts.allowEmpty){ outputTA.value = ''; status.set(''); return; }
    try{
      const r = opts.run(text, api.values(), api);
      if (r && typeof r === 'object' && !(r instanceof Promise)){
        outputTA.value = r.text != null ? r.text : '';
        if (r.status) status.set(r.status, r.kind || 'ok');
        else status.set('');
      } else if (r instanceof Promise){
        status.busy('Считаю');
        r.then(v => {
          if (v && typeof v === 'object'){ outputTA.value = v.text || ''; status.set(v.status || '', v.kind || 'ok'); }
          else { outputTA.value = v || ''; status.ok('Готово'); }
        }).catch(e => { outputTA.value = ''; status.err(e.message); });
      } else {
        outputTA.value = r == null ? '' : r;
        status.ok('Готово');
      }
    } catch(err){
      outputTA.value = '';
      status.err(err.message);
    }
  }

  inputTA.addEventListener('input', opts.live === false ? () => {} : debounce(go, 220));

  const actionRow = el('div', { class: 'row gap' }, [
    opts.live === false ? ui.btn(opts.actionLabel || 'Выполнить →', go) : null,
    ui.btn('Копировать результат', () => copy(outputTA.value), { ghost: true, small: true }),
    ui.btn('Вставить из буфера', async () => {
      try { inputTA.value = await navigator.clipboard.readText(); go(); }
      catch(e){ PT.toast('Браузер не дал доступ к буферу — вставь вручную (Ctrl+V)', 'err'); }
    }, { ghost: true, small: true }),
    opts.sample ? ui.btn('Пример', () => { inputTA.value = opts.sample; go(); }, { ghost: true, small: true }) : null,
    ui.btn('Очистить', () => { inputTA.value = ''; outputTA.value = ''; status.set(''); }, { ghost: true, small: true }),
    opts.download !== false ? ui.btn('Скачать', () => {
      downloadText(outputTA.value, opts.downloadName || 'pixtool-output.txt');
    }, { ghost: true, small: true }) : null
  ].concat((opts.actions || []).map(a => ui.btn(a.label, () => a.fn(api), { ghost: true, small: true }))));

  root.appendChild(ui.card([
    form ? el('div', {}, [form, el('hr', { class: 'sep' })]) : null,
    el('div', { class: 'split' }, [
      el('div', {}, [el('label', { text: opts.inputLabel || 'Ввод' }), inputTA]),
      el('div', {}, [el('label', { text: opts.outputLabel || 'Результат' }), outputTA])
    ]),
    ui.spacer(12),
    actionRow,
    status
  ]));

  if (opts.initial){ inputTA.value = opts.initial; go(); }
  return api;
};

/** Инструмент «одна кнопка — один файл»: дропзона + разбор + отчёт. */
PT.fileTool = function(root, opts){
  const status = ui.status();
  const out = el('div');
  const drop = ui.drop({
    accept: opts.accept, multiple: opts.multiple,
    title: opts.title, hint: opts.hint,
    onFiles: async files => {
      status.busy(opts.busy || 'Читаю файл');
      out.innerHTML = '';
      try{
        await opts.onFiles(opts.multiple ? files : files[0], { out, status });
        if (!status.classList.contains('err')) status.ok('Готово');
      } catch(err){
        console.error(err);
        status.err('Ошибка: ' + err.message);
      }
    }
  });
  root.appendChild(ui.card([drop, opts.note ? el('p', { class: 'hint', text: opts.note }) : null, status]));
  root.appendChild(out);
  return { status, out, drop };
};

/** Обёртка «предпросмотр + экспорт PNG/SVG/CSS» для генераторов. */
PT.exportRow = function(getters){
  const row = el('div', { class: 'row gap' });
  if (getters.css) row.appendChild(ui.btn('Копировать CSS', () => copy(getters.css()), { ghost: true }));
  if (getters.svg) row.appendChild(ui.btn('Скачать SVG', () => {
    downloadText(getters.svg(), (getters.name || 'pixtool') + '.svg', 'image/svg+xml');
  }, { ghost: true }));
  if (getters.png) row.appendChild(ui.btn('Скачать PNG', async () => {
    const canvas = await getters.png();
    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, (getters.name || 'pixtool') + '.png');
  }));
  return row;
};


/* ===== tools/10-image.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: ИЗОБРАЖЕНИЯ
====================================================================== */

/* ---------- кодеки, которых нет в браузере ---------- */
function canvasToBmp(canvas){
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelSize = rowSize * h;
  const buf = new ArrayBuffer(54 + pixelSize);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4D);
  v.setUint32(2, 54 + pixelSize, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, pixelSize, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  let off = 54;
  for (let y = h - 1; y >= 0; y--){
    for (let x = 0; x < w; x++){
      const i = (y * w + x) * 4;
      bytes[off++] = data[i + 2]; bytes[off++] = data[i + 1]; bytes[off++] = data[i];
    }
    off += rowSize - w * 3;
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/** ICO с несколькими размерами (каждый кадр — PNG внутри контейнера). */
async function canvasToIco(source, sizes){
  sizes = sizes || [16, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes){
    const c = smartResize(source, s, s);
    const blob = await canvasToBlob(c, 'image/png');
    pngs.push({ size: s, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  const headerSize = 6 + 16 * pngs.length;
  const header = new ArrayBuffer(headerSize);
  const v = new DataView(header);
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, pngs.length, true);
  let offset = headerSize;
  pngs.forEach((p, i) => {
    const o = 6 + i * 16;
    v.setUint8(o, p.size >= 256 ? 0 : p.size);
    v.setUint8(o + 1, p.size >= 256 ? 0 : p.size);
    v.setUint8(o + 2, 0); v.setUint8(o + 3, 0);
    v.setUint16(o + 4, 1, true); v.setUint16(o + 6, 32, true);
    v.setUint32(o + 8, p.bytes.length, true);
    v.setUint32(o + 12, offset, true);
    offset += p.bytes.length;
  });
  return new Blob([header, ...pngs.map(p => p.bytes)], { type: 'image/x-icon' });
}
PT.canvasToIco = canvasToIco;
PT.canvasToBmp = canvasToBmp;

async function encodeCanvas(canvas, type, quality){
  if (type === 'image/bmp') return canvasToBmp(canvas);
  if (type === 'image/x-icon') return canvasToIco(canvas);
  const blob = await canvasToBlob(canvas, type, quality);
  if (!blob || (blob.type !== type && type !== 'image/png')){
    throw new Error('Браузер не умеет сохранять в ' + type.split('/')[1].toUpperCase());
  }
  return blob;
}
PT.encodeCanvas = encodeCanvas;

/** Отрисовка с белой подложкой — для форматов без прозрачности. */
function flatten(canvas, bg){
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = bg || '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}
PT.flatten = flatten;

const IMG_FORMATS = [
  ['image/png', 'PNG — без потерь, прозрачность'],
  ['image/jpeg', 'JPEG — фото, малый размер'],
  ['image/webp', 'WebP — лучше JPEG при том же весе'],
  ['image/avif', 'AVIF — максимальное сжатие (не везде)'],
  ['image/bmp', 'BMP — без сжатия'],
  ['image/x-icon', 'ICO — иконка Windows']
];

/* ======================================================================
   Конвертер изображений
====================================================================== */
PT.tool({
  id: 'image-convert', cat: 'image', icon: '⇄',
  title: 'Конвертер изображений',
  desc: 'PNG, JPEG, WebP, AVIF, BMP, ICO и SVG — пакетно, с масштабом и качеством.',
  keywords: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'ico', 'heic', 'конвертация', 'формат'],
  render(root){
    PT.imageBatch(root, {
      zipName: 'converted',
      accept: 'image/*,.svg',
      form: [
        { id: 'fmt', type: 'select', label: 'Формат на выходе', col: 4, options: IMG_FORMATS },
        { id: 'q', type: 'range', label: 'Качество', col: 4, min: 10, max: 100, value: 92, unit: '%' },
        { id: 'scale', type: 'select', label: 'Масштаб', col: 4, value: '1', options: [
          ['1', 'Оригинальный размер'], ['0.75', '75%'], ['0.5', '50%'], ['0.25', '25%'], ['2', '200%']
        ] },
        { id: 'bg', type: 'color', label: 'Фон вместо прозрачности', col: 4, value: '#ffffff' },
        { id: 'keepName', type: 'checkbox', label: 'Сохранять исходные имена файлов', col: 8, value: true }
      ],
      note: 'JPEG, BMP и ICO не хранят прозрачность — она заливается выбранным фоном.',
      async process(img, v, file){
        const scale = parseFloat(v.scale);
        let canvas = scale === 1 ? imgToCanvas(img)
                                 : smartResize(img, img.naturalWidth * scale, img.naturalHeight * scale, { sharpen: scale > 1 });
        const noAlpha = ['image/jpeg', 'image/bmp'].includes(v.fmt);
        if (noAlpha) canvas = flatten(canvas, v.bg);
        const blob = await encodeCanvas(canvas, v.fmt, v.q / 100);
        const ext = PT.mimeExt(v.fmt);
        const name = (v.keepName ? baseName(file.name) : 'pixtool-' + Date.now()) + '.' + ext;
        return { blob, name, meta: canvas.width + '×' + canvas.height + ' · было ' + fmtBytes(file.size) };
      }
    });
  }
});

/* ======================================================================
   Сжатие изображений
====================================================================== */
PT.tool({
  id: 'image-compress', cat: 'image', icon: '⤓',
  title: 'Сжатие изображений',
  desc: 'Уменьшает вес фото до нужного размера в килобайтах, показывая экономию.',
  keywords: ['сжать', 'оптимизация', 'вес', 'compress', 'уменьшить размер', 'килобайт'],
  render(root){
    PT.imageBatch(root, {
      zipName: 'compressed',
      actionLabel: 'Сжать →',
      form: [
        { id: 'mode', type: 'select', label: 'Режим', col: 4, options: [
          ['target', 'Уложиться в размер (КБ)'], ['quality', 'Фиксированное качество']
        ] },
        { id: 'target', type: 'number', label: 'Целевой размер, КБ', col: 4, value: 200, min: 5, step: 5 },
        { id: 'q', type: 'range', label: 'Качество', col: 4, min: 10, max: 100, value: 80, unit: '%' },
        { id: 'fmt', type: 'select', label: 'Формат', col: 4, value: 'image/webp', options: [
          ['image/webp', 'WebP (лучшее сжатие)'], ['image/jpeg', 'JPEG (совместимость)'], ['image/avif', 'AVIF']
        ] },
        { id: 'maxDim', type: 'number', label: 'Ограничить длинную сторону, px (0 — не менять)', col: 8, value: 0, min: 0, step: 100 }
      ],
      onChange(id, v, api){
        api.form.show('target', v.mode === 'target');
        api.form.show('q', v.mode === 'quality');
      },
      note: 'Подбор качества идёт двоичным поиском — обычно 7 попыток на файл.',
      async process(img, v, file){
        let canvas = imgToCanvas(img);
        if (v.maxDim > 0 && Math.max(canvas.width, canvas.height) > v.maxDim){
          const k = v.maxDim / Math.max(canvas.width, canvas.height);
          canvas = smartResize(canvas, canvas.width * k, canvas.height * k);
        }
        if (v.fmt === 'image/jpeg') canvas = flatten(canvas);
        let blob, usedQ;
        if (v.mode === 'quality'){
          usedQ = v.q / 100;
          blob = await encodeCanvas(canvas, v.fmt, usedQ);
        } else {
          const limit = v.target * 1024;
          let lo = 0.05, hi = 0.98, best = null, bestQ = lo;
          for (let i = 0; i < 7; i++){
            const mid = (lo + hi) / 2;
            const candidate = await encodeCanvas(canvas, v.fmt, mid);
            if (candidate.size <= limit){ best = candidate; bestQ = mid; lo = mid; }
            else hi = mid;
          }
          if (!best){ best = await encodeCanvas(canvas, v.fmt, 0.05); bestQ = 0.05; }
          blob = best; usedQ = bestQ;
        }
        const saved = file.size ? Math.round((1 - blob.size / file.size) * 100) : 0;
        return {
          blob,
          name: baseName(file.name) + '.' + PT.mimeExt(v.fmt),
          meta: `было ${fmtBytes(file.size)} → стало ${fmtBytes(blob.size)} (−${saved}%), качество ${Math.round(usedQ * 100)}%`
        };
      }
    });
  }
});

/* ======================================================================
   Размер и апскейл
====================================================================== */
PT.tool({
  id: 'image-resize', cat: 'image', icon: '⤢',
  title: 'Размер и апскейл',
  desc: 'Увеличение с пошаговым сглаживанием и резкостью, точные размеры, вписывание и обрезка.',
  keywords: ['resize', 'апскейл', 'увеличить', 'уменьшить', 'разрешение', 'px', 'обрезать', 'пиксель-арт'],
  render(root){
    PT.imageBatch(root, {
      zipName: 'resized',
      form: [
        { id: 'mode', type: 'select', label: 'Режим', col: 4, options: [
          ['scale', 'Множитель'], ['exact', 'Точный размер'], ['fit', 'Вписать в размер'], ['cover', 'Заполнить и обрезать']
        ] },
        { id: 'factor', type: 'select', label: 'Множитель', col: 4, value: '2', options: [
          ['4', '×4'], ['3', '×3'], ['2', '×2'], ['1.5', '×1.5'], ['0.75', '×0.75'], ['0.5', '×0.5'], ['0.25', '×0.25']
        ] },
        { id: 'w', type: 'number', label: 'Ширина, px', col: 4, value: 1920, min: 1 },
        { id: 'h', type: 'number', label: 'Высота, px', col: 4, value: 1080, min: 1 },
        { id: 'algo', type: 'select', label: 'Алгоритм', col: 4, options: [
          ['smooth', 'Плавный (фото)'], ['sharp', 'Плавный + резкость'], ['pixel', 'Без сглаживания (пиксель-арт)']
        ] },
        { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [
          ['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']
        ] }
      ],
      onChange(id, v, api){
        api.form.show('factor', v.mode === 'scale');
        api.form.show('w', v.mode !== 'scale');
        api.form.show('h', v.mode !== 'scale');
      },
      onFilesChange(files, api){
        if (files.length === 1){
          loadImage(files[0]).then(img => {
            api.form.set('w', img.naturalWidth);
            api.form.set('h', img.naturalHeight);
            api.status.set(`${files[0].name} — ${img.naturalWidth}×${img.naturalHeight}px`);
          }).catch(() => {});
        }
      },
      async process(img, v, file){
        const iw = img.naturalWidth, ih = img.naturalHeight;
        let canvas;
        const opts = { smooth: v.algo !== 'pixel', sharpen: v.algo === 'sharp' ? 0.55 : 0 };
        if (v.mode === 'scale'){
          const f = parseFloat(v.factor);
          canvas = smartResize(img, iw * f, ih * f, opts);
        } else if (v.mode === 'exact'){
          canvas = smartResize(img, v.w, v.h, opts);
        } else if (v.mode === 'fit'){
          const k = Math.min(v.w / iw, v.h / ih);
          canvas = smartResize(img, iw * k, ih * k, opts);
        } else {
          const k = Math.max(v.w / iw, v.h / ih);
          const scaled = smartResize(img, iw * k, ih * k, opts);
          canvas = makeCanvas(v.w, v.h);
          canvas.getContext('2d').drawImage(scaled, (scaled.width - v.w) / 2, (scaled.height - v.h) / 2,
            v.w, v.h, 0, 0, v.w, v.h);
        }
        if (v.fmt === 'image/jpeg') canvas = flatten(canvas);
        const blob = await encodeCanvas(canvas, v.fmt, 0.94);
        return {
          blob,
          name: baseName(file.name) + `-${canvas.width}x${canvas.height}.` + PT.mimeExt(v.fmt),
          meta: `${iw}×${ih} → ${canvas.width}×${canvas.height}`
        };
      }
    });
  }
});

/* ======================================================================
   Обрезка (интерактивная)
====================================================================== */
PT.tool({
  id: 'image-crop', cat: 'image', icon: '▭',
  title: 'Обрезка и рамка',
  desc: 'Выдели область мышью или задай пропорции: 1:1, 16:9, обложка, сторис.',
  keywords: ['crop', 'обрезать', 'кадрировать', 'пропорции', 'аватарка', 'сторис'],
  render(root){
    let img = null, sel = null, dragging = false, ratio = 0, start = null;
    const status = ui.status();
    const canvas = el('canvas', { id: 'cropCanvas' });
    const hud = el('div', { class: 'canvas-hud', text: 'выдели область мышью' });
    const wrap = el('div', { class: 'canvas-wrap' }, [canvas, hud]);
    wrap.style.display = 'none';
    const ctx = canvas.getContext('2d');

    const ratios = [['0', 'Свободно'], ['1', '1:1 квадрат'], ['1.7777', '16:9'], ['0.5625', '9:16 сторис'],
                    ['1.3333', '4:3'], ['0.75', '3:4'], ['1.91', '1.91:1 обложка OG']];
    const form = ui.form([
      { id: 'ratio', type: 'select', label: 'Пропорции', col: 4, options: ratios },
      { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] },
      { id: 'pad', type: 'number', label: 'Поля вокруг, px', col: 4, value: 0, min: 0 },
      { id: 'padColor', type: 'color', label: 'Цвет полей', col: 4, value: '#ffffff' }
    ], (id, v) => {
      ratio = parseFloat(v.ratio) || 0;
      if (ratio && sel){ sel.h = sel.w / ratio; draw(); }
    });

    const drop = ui.drop({
      accept: 'image/*', title: 'Перетащи изображение',
      onFiles: async files => {
        img = await loadImage(files[0]);
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        sel = { x: img.naturalWidth * 0.1, y: img.naturalHeight * 0.1, w: img.naturalWidth * 0.8, h: img.naturalHeight * 0.8 };
        if (ratio) sel.h = sel.w / ratio;
        wrap.style.display = 'flex';
        draw();
        status.ok(`${files[0].name} — ${img.naturalWidth}×${img.naturalHeight}px`);
      }
    });

    function draw(){
      if (!img) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      if (sel){
        ctx.fillStyle = 'rgba(10,12,15,0.62)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.beginPath(); ctx.rect(sel.x, sel.y, sel.w, sel.h); ctx.clip();
        ctx.drawImage(img, 0, 0);
        ctx.restore();
        ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = Math.max(2, canvas.width / 500);
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = Math.max(1, canvas.width / 900);
        for (let i = 1; i < 3; i++){
          ctx.beginPath();
          ctx.moveTo(sel.x + sel.w * i / 3, sel.y); ctx.lineTo(sel.x + sel.w * i / 3, sel.y + sel.h);
          ctx.moveTo(sel.x, sel.y + sel.h * i / 3); ctx.lineTo(sel.x + sel.w, sel.y + sel.h * i / 3);
          ctx.stroke();
        }
        hud.textContent = `${Math.round(sel.w)} × ${Math.round(sel.h)} px`;
      }
    }
    function pos(e){
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height };
    }
    canvas.addEventListener('pointerdown', e => { dragging = true; start = pos(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!dragging || !start) return;
      const p = pos(e);
      let w = p.x - start.x, h = p.y - start.y;
      if (ratio) h = Math.sign(h || 1) * Math.abs(w) / ratio;
      sel = { x: Math.min(start.x, start.x + w), y: Math.min(start.y, start.y + h), w: Math.abs(w), h: Math.abs(h) };
      draw();
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    const exportBtn = ui.btn('Обрезать и скачать', async () => {
      if (!img || !sel || sel.w < 2){ status.err('Сначала выдели область'); return; }
      const v = form.values();
      const pad = v.pad || 0;
      const out = makeCanvas(sel.w + pad * 2, sel.h + pad * 2);
      const octx = out.getContext('2d');
      if (pad){ octx.fillStyle = v.padColor; octx.fillRect(0, 0, out.width, out.height); }
      octx.drawImage(img, sel.x, sel.y, sel.w, sel.h, pad, pad, sel.w, sel.h);
      const canvasOut = v.fmt === 'image/jpeg' ? flatten(out, v.padColor) : out;
      const blob = await encodeCanvas(canvasOut, v.fmt, 0.94);
      downloadBlob(blob, `crop-${Math.round(sel.w)}x${Math.round(sel.h)}.` + PT.mimeExt(v.fmt));
    });
    const selectAll = ui.btn('Выделить всё', () => {
      if (!img) return;
      sel = { x: 0, y: 0, w: img.naturalWidth, h: ratio ? img.naturalWidth / ratio : img.naturalHeight };
      draw();
    }, { ghost: true, small: true });
    const center = ui.btn('По центру', () => {
      if (!img || !sel) return;
      sel.x = (img.naturalWidth - sel.w) / 2; sel.y = (img.naturalHeight - sel.h) / 2;
      draw();
    }, { ghost: true, small: true });

    root.appendChild(ui.card([drop, ui.spacer(14), form, ui.spacer(14),
      el('div', { class: 'row gap' }, [exportBtn, selectAll, center]), status]));
    root.appendChild(wrap);
  }
});

/* ======================================================================
   Водяной знак
====================================================================== */
PT.tool({
  id: 'image-watermark', cat: 'image', icon: '◈',
  title: 'Водяной знак',
  desc: 'Текстовая или графическая подпись на всю пачку фотографий сразу.',
  keywords: ['watermark', 'копирайт', 'подпись', 'логотип', 'защита'],
  render(root){
    let logo = null;
    const logoDrop = ui.drop({
      accept: 'image/*', title: 'Логотип (необязательно)',
      hint: 'PNG с прозрачностью — лучший вариант',
      onFiles: async files => { logo = await loadImage(files[0]); PT.toast('Логотип загружен', 'ok'); }
    });
    PT.imageBatch(root, {
      zipName: 'watermarked',
      actionLabel: 'Нанести знак →',
      form: [
        { id: 'text', type: 'text', label: 'Текст', col: 6, value: '© Pixset Studio' },
        { id: 'pos', type: 'select', label: 'Положение', col: 3, value: 'br', options: [
          ['br', 'Снизу справа'], ['bl', 'Снизу слева'], ['tr', 'Сверху справа'], ['tl', 'Сверху слева'],
          ['c', 'По центру'], ['tile', 'Плиткой по всей картинке']
        ] },
        { id: 'size', type: 'range', label: 'Размер', col: 3, min: 2, max: 20, value: 5, unit: '%' },
        { id: 'opacity', type: 'range', label: 'Прозрачность', col: 3, min: 5, max: 100, value: 55, unit: '%' },
        { id: 'color', type: 'color', label: 'Цвет текста', col: 3, value: '#ffffff' },
        { id: 'angle', type: 'range', label: 'Наклон', col: 3, min: -90, max: 90, value: 0, unit: '°' },
        { id: 'margin', type: 'range', label: 'Отступ', col: 3, min: 0, max: 15, value: 3, unit: '%' },
        { id: 'shadow', type: 'checkbox', label: 'Тень под знаком (читается на любом фоне)', col: 6, value: true },
        { id: 'useLogo', type: 'checkbox', label: 'Использовать логотип вместо текста', col: 6, value: false },
        { id: 'html', type: 'html', node: el('div', { class: 'field' }, logoDrop) }
      ],
      async process(img, v, file){
        const canvas = imgToCanvas(img);
        const ctx = canvas.getContext('2d');
        const base = Math.min(canvas.width, canvas.height);
        const markH = base * v.size / 100;
        const margin = base * v.margin / 100;
        ctx.globalAlpha = v.opacity / 100;
        if (v.shadow){
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = markH * 0.22;
          ctx.shadowOffsetY = markH * 0.05;
        }
        const useLogo = v.useLogo && logo;
        let mw, mh;
        if (useLogo){
          mh = markH * 1.6;
          mw = mh * (logo.naturalWidth / logo.naturalHeight);
        } else {
          ctx.font = `700 ${markH}px 'Space Mono', monospace`;
          ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          ctx.fillStyle = v.color;
          mw = ctx.measureText(v.text).width;
          mh = markH;
        }
        const draw = (x, y) => {
          ctx.save();
          ctx.translate(x + mw / 2, y + mh / 2);
          ctx.rotate(v.angle * Math.PI / 180);
          if (useLogo) ctx.drawImage(logo, -mw / 2, -mh / 2, mw, mh);
          else { ctx.textAlign = 'center'; ctx.fillText(v.text, 0, 0); }
          ctx.restore();
        };
        if (v.pos === 'tile'){
          const stepX = mw + base * 0.12, stepY = mh + base * 0.12;
          for (let y = -mh; y < canvas.height + mh; y += stepY)
            for (let x = -mw; x < canvas.width + mw; x += stepX) draw(x, y);
        } else {
          const positions = {
            br: [canvas.width - mw - margin, canvas.height - mh - margin],
            bl: [margin, canvas.height - mh - margin],
            tr: [canvas.width - mw - margin, margin],
            tl: [margin, margin],
            c:  [(canvas.width - mw) / 2, (canvas.height - mh) / 2]
          };
          const [x, y] = positions[v.pos] || positions.br;
          draw(x, y);
        }
        ctx.globalAlpha = 1; ctx.shadowColor = 'transparent';
        const blob = await encodeCanvas(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.93);
        return { blob, name: baseName(file.name) + '-wm.' + (file.type === 'image/png' ? 'png' : 'jpg') };
      }
    });
  }
});

/* ======================================================================
   Удаление фона по цвету
====================================================================== */
PT.tool({
  id: 'image-bgremove', cat: 'image', icon: '◌',
  title: 'Удаление фона',
  desc: 'Убирает однотонный фон: кликни по нему пипеткой и подбери допуск.',
  keywords: ['фон', 'прозрачность', 'background', 'chroma', 'хромакей', 'вырезать', 'png'],
  render(root){
    let img = null, picked = '#ffffff';
    const status = ui.status();
    const canvas = el('canvas');
    const wrap = el('div', { class: 'canvas-wrap' }, [canvas,
      el('div', { class: 'canvas-hud', text: 'клик по картинке — взять цвет фона' })]);
    wrap.style.display = 'none';

    const form = ui.form([
      { id: 'color', type: 'color', label: 'Цвет фона', col: 3, value: '#ffffff' },
      { id: 'tol', type: 'range', label: 'Допуск', col: 3, min: 1, max: 100, value: 22, unit: '%' },
      { id: 'feather', type: 'range', label: 'Смягчение края', col: 3, min: 0, max: 40, value: 12, unit: '%' },
      { id: 'corners', type: 'checkbox', label: 'Брать цвет из углов автоматически', col: 3, value: true },
      { id: 'fill', type: 'select', label: 'Чем заменить фон', col: 4, options: [
        ['none', 'Прозрачность'], ['color', 'Сплошной цвет'], ['blur', 'Размытая копия фото']
      ] },
      { id: 'fillColor', type: 'color', label: 'Цвет замены', col: 4, value: '#101216' }
    ], () => apply());

    const drop = ui.drop({
      accept: 'image/*',
      onFiles: async files => {
        img = await loadImage(files[0]);
        wrap.style.display = 'flex';
        if (form.get('corners')) autoPick();
        apply();
        status.ok(`${files[0].name} — ${img.naturalWidth}×${img.naturalHeight}`);
      }
    });

    function autoPick(){
      const c = imgToCanvas(img);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const pts = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]];
      let r = 0, g = 0, b = 0;
      pts.forEach(([x, y]) => { const i = (y * c.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; });
      picked = Color.rgbToHex(r / 4, g / 4, b / 4);
      form.set('color', picked);
    }

    function apply(){
      if (!img) return;
      const v = form.values();
      const src = imgToCanvas(img);
      const ctx = src.getContext('2d');
      const data = ctx.getImageData(0, 0, src.width, src.height);
      const d = data.data;
      const target = Color.hexToRgb(v.color);
      const tol = v.tol / 100 * 442;              // 442 ≈ максимум евклидова расстояния RGB
      const feather = v.feather / 100 * 442;
      for (let i = 0; i < d.length; i += 4){
        const dist = Math.sqrt((d[i] - target.r) ** 2 + (d[i + 1] - target.g) ** 2 + (d[i + 2] - target.b) ** 2);
        if (dist <= tol) d[i + 3] = 0;
        else if (feather > 0 && dist <= tol + feather){
          d[i + 3] = Math.round(d[i + 3] * (dist - tol) / feather);
        }
      }
      ctx.putImageData(data, 0, 0);

      let out = src;
      if (v.fill === 'color'){
        out = makeCanvas(src.width, src.height);
        const o = out.getContext('2d');
        o.fillStyle = v.fillColor; o.fillRect(0, 0, out.width, out.height);
        o.drawImage(src, 0, 0);
      } else if (v.fill === 'blur'){
        out = makeCanvas(src.width, src.height);
        const o = out.getContext('2d');
        o.filter = 'blur(' + Math.max(6, src.width / 60) + 'px)';
        o.drawImage(img, 0, 0, out.width, out.height);
        o.filter = 'none';
        o.drawImage(src, 0, 0);
      }
      canvas.width = out.width; canvas.height = out.height;
      canvas.getContext('2d').drawImage(out, 0, 0);
      canvas._result = out;
    }

    canvas.addEventListener('click', e => {
      if (!img) return;
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) * canvas.width / r.width);
      const y = Math.floor((e.clientY - r.top) * canvas.height / r.height);
      const c = imgToCanvas(img);
      const p = c.getContext('2d').getImageData(clamp(x, 0, c.width - 1), clamp(y, 0, c.height - 1), 1, 1).data;
      form.set('color', Color.rgbToHex(p[0], p[1], p[2]));
      apply();
    });

    root.appendChild(ui.card([
      drop, ui.spacer(14), form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать PNG', async () => {
          if (!canvas._result) { status.err('Сначала загрузи изображение'); return; }
          downloadBlob(await canvasToBlob(canvas._result, 'image/png'), 'no-bg.png');
        }),
        ui.btn('Взять цвет из углов', () => { autoPick(); apply(); }, { ghost: true, small: true })
      ]),
      status,
      ui.muted('Работает для однотонных фонов: студийные снимки, скриншоты, логотипы. Для сложных сцен нужен ручной редактор.')
    ]));
    root.appendChild(wrap);
  }
});

/* ======================================================================
   EXIF и метаданные
====================================================================== */
function parseExif(buffer){
  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xFFD8) return null;         // не JPEG
  let offset = 2;
  while (offset < view.byteLength - 4){
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (marker === 0xE1){
      const start = offset + 4;
      const tag = String.fromCharCode(view.getUint8(start), view.getUint8(start + 1),
                                      view.getUint8(start + 2), view.getUint8(start + 3));
      if (tag === 'Exif') return readTiff(view, start + 6);
    }
    if (marker === 0xDA) break;
    offset += 2 + size;
  }
  return null;
}

const EXIF_TAGS = {
  0x010F: 'Производитель', 0x0110: 'Модель камеры', 0x0112: 'Ориентация', 0x0131: 'Программа',
  0x0132: 'Дата изменения', 0x829A: 'Выдержка', 0x829D: 'Диафрагма', 0x8827: 'ISO',
  0x9003: 'Дата съёмки', 0x9004: 'Дата оцифровки', 0x920A: 'Фокусное расстояние',
  0xA002: 'Ширина', 0xA003: 'Высота', 0xA434: 'Объектив', 0x9209: 'Вспышка',
  0x8822: 'Режим экспозиции', 0xA405: 'Экв. фокусное (35мм)', 0x0128: 'Единицы разрешения',
  0x011A: 'Разрешение X', 0x011B: 'Разрешение Y', 0x013B: 'Автор', 0x8298: 'Копирайт'
};
const GPS_TAGS = { 1: 'Широта (полушарие)', 2: 'Широта', 3: 'Долгота (полушарие)', 4: 'Долгота', 6: 'Высота' };

function readTiff(view, tiffStart){
  const le = view.getUint16(tiffStart) === 0x4949;
  const get16 = o => view.getUint16(o, le);
  const get32 = o => view.getUint32(o, le);
  if (get16(tiffStart + 2) !== 0x002A) return null;
  const out = {};
  const readIFD = (dirStart, tagMap, prefix) => {
    const count = get16(dirStart);
    for (let i = 0; i < count; i++){
      const entry = dirStart + 2 + i * 12;
      const tag = get16(entry), type = get16(entry + 2), num = get32(entry + 4);
      const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
      const byteLen = (sizes[type] || 1) * num;
      const valOff = byteLen > 4 ? tiffStart + get32(entry + 8) : entry + 8;
      let value;
      try{
        if (type === 2){
          let s = '';
          for (let j = 0; j < num - 1; j++) s += String.fromCharCode(view.getUint8(valOff + j));
          value = s.trim();
        } else if (type === 3){ value = get16(valOff); }
        else if (type === 4 || type === 9){ value = get32(valOff); }
        else if (type === 5 || type === 10){
          const nums = [];
          for (let j = 0; j < num; j++){
            const n = get32(valOff + j * 8), d = get32(valOff + j * 8 + 4);
            nums.push(d ? n / d : 0);
          }
          value = nums.length === 1 ? nums[0] : nums;
        } else value = null;
      } catch(e){ value = null; }
      if (value === null || value === '') continue;
      if (tag === 0x8769 && !prefix){ try { readIFD(tiffStart + value, EXIF_TAGS, ''); } catch(e){} continue; }
      if (tag === 0x8825 && !prefix){ try { readIFD(tiffStart + value, GPS_TAGS, 'GPS '); } catch(e){} continue; }
      const label = tagMap[tag];
      if (label) out[(prefix || '') + label] = value;
    }
  };
  readIFD(tiffStart + get32(tiffStart + 4), EXIF_TAGS, '');
  return out;
}

function stripJpegMeta(buffer){
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.getUint16(0) !== 0xFFD8) return null;
  const parts = [new Uint8Array([0xFF, 0xD8])];
  let offset = 2;
  while (offset < bytes.length - 1){
    if (bytes[offset] !== 0xFF) break;
    const marker = bytes[offset + 1];
    if (marker === 0xDA){ parts.push(bytes.subarray(offset)); break; }
    const size = view.getUint16(offset + 2);
    const isMeta = (marker >= 0xE0 && marker <= 0xEF) || marker === 0xFE;   // APPn и комментарии
    if (!isMeta) parts.push(bytes.subarray(offset, offset + 2 + size));
    offset += 2 + size;
  }
  return new Blob(parts, { type: 'image/jpeg' });
}

PT.tool({
  id: 'image-exif', cat: 'image', icon: '⌕',
  title: 'EXIF и метаданные',
  desc: 'Показывает камеру, дату и GPS-координаты снимка — и вычищает их одним нажатием.',
  keywords: ['exif', 'метаданные', 'gps', 'геолокация', 'приватность', 'очистить', 'камера'],
  render(root){
    PT.fileTool(root, {
      accept: 'image/jpeg,image/jpg,image/png,image/webp',
      title: 'Перетащи фотографию',
      hint: 'EXIF есть у JPEG со смартфонов и фотоаппаратов',
      note: 'Метаданные могут содержать точные координаты съёмки — проверяй фото перед публикацией.',
      async onFiles(file, { out, status }){
        const buf = await file.arrayBuffer();
        const img = await loadImage(file);
        const exif = file.type.includes('jpeg') || file.type.includes('jpg') ? parseExif(buf) : null;
        const rows = [
          ['Файл', file.name],
          ['Размер файла', fmtBytes(file.size)],
          ['Размеры', img.naturalWidth + ' × ' + img.naturalHeight + ' px'],
          ['Тип', file.type || 'неизвестен'],
          ['Изменён', new Date(file.lastModified).toLocaleString('ru-RU')]
        ];
        const card = ui.card([ui.h('Файл'), ui.kv(rows)]);
        out.appendChild(card);

        if (exif && Object.keys(exif).length){
          const list = Object.entries(exif).map(([k, v]) => {
            let val = v;
            if (k === 'Выдержка' && typeof v === 'number' && v < 1) val = '1/' + Math.round(1 / v) + ' с';
            else if (k === 'Диафрагма') val = 'f/' + Number(v).toFixed(1);
            else if (k === 'Фокусное расстояние') val = Number(v).toFixed(0) + ' мм';
            else if (Array.isArray(v)) val = v.map(x => Number(x).toFixed(4)).join(', ');
            return [k, val];
          });
          const gps = exif['GPS Широта'] && exif['GPS Долгота'];
          const geoCard = ui.card([
            ui.h('EXIF — ' + list.length + ' записей', gps ? '⚠ В файле есть координаты съёмки' : null),
            ui.kv(list)
          ]);
          if (gps){
            const toDeg = a => Array.isArray(a) ? a[0] + a[1] / 60 + a[2] / 3600 : a;
            const lat = toDeg(exif['GPS Широта']) * (exif['GPS Широта (полушарие)'] === 'S' ? -1 : 1);
            const lon = toDeg(exif['GPS Долгота']) * (exif['GPS Долгота (полушарие)'] === 'W' ? -1 : 1);
            geoCard.appendChild(ui.spacer(10));
            geoCard.appendChild(ui.copyBox(lat.toFixed(6) + ', ' + lon.toFixed(6), { label: 'Координаты', rows: 1 }));
          }
          out.appendChild(geoCard);
        } else {
          out.appendChild(ui.card([ui.h('EXIF'), ui.muted('Метаданных не найдено — либо их нет, либо формат их не хранит.')]));
        }

        const actions = ui.card([
          ui.h('Очистка', 'Удаляет EXIF, GPS, комментарии и профили — картинка остаётся прежней'),
          el('div', { class: 'row gap' }, [
            ui.btn('Скачать без метаданных', async () => {
              let blob = null;
              if (file.type.includes('jpeg') || file.type.includes('jpg')) blob = stripJpegMeta(buf);
              if (!blob) blob = await canvasToBlob(imgToCanvas(img), file.type || 'image/png', 0.95);
              downloadBlob(blob, baseName(file.name) + '-clean.' + (extOf(file.name) || 'jpg'));
            }),
            ui.btn('Скачать как чистый PNG', async () => {
              downloadBlob(await canvasToBlob(imgToCanvas(img), 'image/png'), baseName(file.name) + '-clean.png');
            }, { ghost: true })
          ])
        ]);
        out.appendChild(actions);
        status.ok('Разобрано');
      }
    });
  }
});

/* ======================================================================
   Фавиконки и иконки приложения
====================================================================== */
PT.tool({
  id: 'image-favicon', cat: 'image', icon: '◉',
  title: 'Фавиконки и иконки PWA',
  desc: 'Полный комплект иконок сайта: PNG всех размеров, favicon.ico, манифест и HTML-код.',
  keywords: ['favicon', 'ico', 'иконка', 'pwa', 'манифест', 'apple-touch-icon'],
  render(root){
    const sizes = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512];
    PT.fileTool(root, {
      accept: 'image/*',
      title: 'Перетащи квадратную картинку',
      hint: 'Лучше 512×512 и больше — PNG или SVG',
      async onFiles(file, { out, status }){
        const img = await loadImage(file);
        const grid = ui.thumbGrid();
        const entries = [];
        for (const s of sizes){
          const c = smartResize(img, s, s);
          const blob = await canvasToBlob(c, 'image/png');
          entries.push({ name: `icon-${s}x${s}.png`, data: blob });
          if ([32, 64, 180, 192, 512].includes(s)) grid.add(URL.createObjectURL(blob), s + 'px');
        }
        const ico = await canvasToIco(imgToCanvas(img), [16, 32, 48, 64, 128, 256]);
        entries.push({ name: 'favicon.ico', data: ico });

        const manifest = {
          name: 'Моё приложение', short_name: 'App', start_url: '/', display: 'standalone',
          background_color: '#101216', theme_color: '#e8a33d',
          icons: [192, 512].map(s => ({ src: `/icon-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' }))
        };
        entries.push({ name: 'manifest.webmanifest', data: JSON.stringify(manifest, null, 2) });

        const html = [
          '<link rel="icon" href="/favicon.ico" sizes="any">',
          '<link rel="icon" type="image/png" sizes="32x32" href="/icon-32x32.png">',
          '<link rel="icon" type="image/png" sizes="16x16" href="/icon-16x16.png">',
          '<link rel="apple-touch-icon" sizes="180x180" href="/icon-180x180.png">',
          '<link rel="manifest" href="/manifest.webmanifest">',
          '<meta name="theme-color" content="#e8a33d">'
        ].join('\n');
        entries.push({ name: 'head-snippet.html', data: html });

        out.appendChild(ui.card([
          ui.h('Готовый комплект', sizes.length + ' PNG + favicon.ico + манифест'),
          grid,
          ui.spacer(14),
          ui.btn('Скачать архив (.zip)', async () => {
            downloadBlob(await zip(entries), 'pixtool-favicons.zip');
          }),
          ui.spacer(14),
          ui.copyBox(html, { label: 'Вставь в <head> сайта', rows: 7 })
        ]));
        status.ok('Комплект собран');
      }
    });
  }
});

/* ======================================================================
   Заглушки
====================================================================== */
PT.tool({
  id: 'image-placeholder', cat: 'image', icon: '▦',
  title: 'Картинки-заглушки',
  desc: 'Плейсхолдеры любого размера с текстом, сеткой и своими цветами — без внешних сервисов.',
  keywords: ['placeholder', 'заглушка', 'макет', 'mock', 'превью'],
  render(root){
    const preview = el('canvas', { style: { maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--line)' } });
    const form = ui.form([
      { id: 'w', type: 'number', label: 'Ширина', col: 3, value: 1200, min: 1 },
      { id: 'h', type: 'number', label: 'Высота', col: 3, value: 630, min: 1 },
      { id: 'text', type: 'text', label: 'Текст (пусто — размер)', col: 6, value: '' },
      { id: 'bg', type: 'color', label: 'Фон', col: 3, value: '#1d2127' },
      { id: 'fg', type: 'color', label: 'Текст и линии', col: 3, value: '#e8a33d' },
      { id: 'style', type: 'select', label: 'Стиль', col: 3, options: [
        ['cross', 'Диагонали'], ['grid', 'Сетка'], ['dots', 'Точки'], ['plain', 'Без узора'], ['noise', 'Шум']
      ] },
      { id: 'fmt', type: 'select', label: 'Формат', col: 3, options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] }
    ], () => draw());

    const presets = el('div', { class: 'pillbar' }, [
      ['OG-картинка', 1200, 630], ['Full HD', 1920, 1080], ['Сторис', 1080, 1920],
      ['Квадрат', 1080, 1080], ['Баннер', 728, 90], ['Аватар', 400, 400]
    ].map(([label, w, h]) => el('button', { class: 'pill', type: 'button', text: label, onclick: () => {
      form.set('w', w); form.set('h', h); draw();
    } })));

    function draw(){
      const v = form.values();
      const w = clamp(v.w, 1, 8000), h = clamp(v.h, 1, 8000);
      preview.width = w; preview.height = h;
      const ctx = preview.getContext('2d');
      ctx.fillStyle = v.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = v.fg; ctx.fillStyle = v.fg;
      ctx.globalAlpha = 0.22;
      const unit = Math.max(2, Math.min(w, h) / 220);
      if (v.style === 'cross'){
        ctx.lineWidth = unit;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
        ctx.strokeRect(unit, unit, w - unit * 2, h - unit * 2);
      } else if (v.style === 'grid'){
        ctx.lineWidth = Math.max(1, unit / 2);
        const step = Math.max(24, Math.min(w, h) / 12);
        for (let x = step; x < w; x += step){ ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = step; y < h; y += step){ ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      } else if (v.style === 'dots'){
        const step = Math.max(20, Math.min(w, h) / 16);
        for (let x = step / 2; x < w; x += step)
          for (let y = step / 2; y < h; y += step){
            ctx.beginPath(); ctx.arc(x, y, unit, 0, Math.PI * 2); ctx.fill();
          }
      } else if (v.style === 'noise'){
        const n = Math.round(w * h / 220);
        for (let i = 0; i < n; i++){
          ctx.globalAlpha = Math.random() * 0.16;
          ctx.fillRect(Math.random() * w, Math.random() * h, unit, unit);
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = v.fg;
      const label = v.text || `${w} × ${h}`;
      let fontSize = Math.min(w, h) / 8;
      ctx.font = `700 ${fontSize}px 'Space Mono', monospace`;
      while (ctx.measureText(label).width > w * 0.84 && fontSize > 8){
        fontSize *= 0.92;
        ctx.font = `700 ${fontSize}px 'Space Mono', monospace`;
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2);
    }

    root.appendChild(ui.card([
      presets, form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать', async () => {
          const v = form.values();
          const blob = await encodeCanvas(preview, v.fmt, 0.92);
          downloadBlob(blob, `placeholder-${preview.width}x${preview.height}.` + PT.mimeExt(v.fmt));
        }),
        ui.btn('Копировать как Data URI', () => copy(preview.toDataURL('image/png')), { ghost: true })
      ])
    ]));
    root.appendChild(ui.card([ui.h('Предпросмотр'), preview]));
    draw();
  }
});

/* ======================================================================
   Сравнение изображений
====================================================================== */
PT.tool({
  id: 'image-compare', cat: 'image', icon: '◫',
  title: 'Сравнение изображений',
  desc: 'Шторка «до/после» и карта попиксельных отличий двух картинок.',
  keywords: ['сравнить', 'diff', 'до после', 'разница', 'compare'],
  render(root){
    let a = null, b = null;
    const status = ui.status();
    const stage = el('div', { class: 'canvas-wrap', style: { display: 'none' } });
    const canvas = el('canvas');
    stage.appendChild(canvas);
    const slider = el('input', { type: 'range', min: 0, max: 100, value: 50 });
    const modeSel = ui.form([
      { id: 'mode', type: 'select', label: 'Режим', col: 6, options: [
        ['split', 'Шторка до/после'], ['diff', 'Карта отличий'], ['onion', 'Наложение с прозрачностью']
      ] },
      { id: 'amp', type: 'range', label: 'Усиление отличий', col: 6, min: 1, max: 20, value: 6, unit: '×' }
    ], () => draw());

    const dropA = ui.drop({ accept: 'image/*', title: 'Изображение A (до)', onFiles: async f => { a = await loadImage(f[0]); draw(); } });
    const dropB = ui.drop({ accept: 'image/*', title: 'Изображение B (после)', onFiles: async f => { b = await loadImage(f[0]); draw(); } });
    slider.addEventListener('input', () => draw());

    function draw(){
      if (!a || !b){ status.set('Загрузи оба изображения'); return; }
      stage.style.display = 'flex';
      const w = Math.max(a.naturalWidth, b.naturalWidth), h = Math.max(a.naturalHeight, b.naturalHeight);
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const v = modeSel.values();
      const pos = Number(slider.value) / 100;
      ctx.clearRect(0, 0, w, h);
      if (v.mode === 'split'){
        ctx.drawImage(a, 0, 0, w, h);
        ctx.save();
        ctx.beginPath(); ctx.rect(w * pos, 0, w - w * pos, h); ctx.clip();
        ctx.drawImage(b, 0, 0, w, h);
        ctx.restore();
        ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = Math.max(2, w / 400);
        ctx.beginPath(); ctx.moveTo(w * pos, 0); ctx.lineTo(w * pos, h); ctx.stroke();
        status.set('Двигай ползунок под картинкой');
      } else if (v.mode === 'onion'){
        ctx.drawImage(a, 0, 0, w, h);
        ctx.globalAlpha = pos;
        ctx.drawImage(b, 0, 0, w, h);
        ctx.globalAlpha = 1;
        status.set('Прозрачность верхнего слоя: ' + Math.round(pos * 100) + '%');
      } else {
        const ca = imgToCanvas(a, w, h).getContext('2d').getImageData(0, 0, w, h);
        const cb = imgToCanvas(b, w, h).getContext('2d').getImageData(0, 0, w, h);
        const outData = ctx.createImageData(w, h);
        let changed = 0;
        for (let i = 0; i < ca.data.length; i += 4){
          const d = (Math.abs(ca.data[i] - cb.data[i]) + Math.abs(ca.data[i + 1] - cb.data[i + 1]) +
                     Math.abs(ca.data[i + 2] - cb.data[i + 2])) / 3;
          const amp = clamp(d * v.amp, 0, 255);
          if (d > 3) changed++;
          outData.data[i] = amp; outData.data[i + 1] = amp * 0.35; outData.data[i + 2] = amp * 0.1;
          outData.data[i + 3] = 255;
        }
        ctx.putImageData(outData, 0, 0);
        const pct = (changed / (w * h) * 100).toFixed(2);
        status.ok(`Отличается пикселей: ${pct}% (${fmtNum(changed, 0)} из ${fmtNum(w * h, 0)})`);
      }
    }

    root.appendChild(ui.card([
      el('div', { class: 'grid cols-2' }, [dropA, dropB]),
      ui.spacer(14), modeSel, ui.spacer(10),
      el('label', { text: 'Положение шторки / прозрачность' }), slider,
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать результат', async () => {
          if (!a || !b) return;
          downloadBlob(await canvasToBlob(canvas, 'image/png'), 'compare.png');
        }, { ghost: true })
      ]),
      status
    ]));
    root.appendChild(stage);
  }
});

/* ======================================================================
   Ретро-эффекты: пиксель-арт, дизеринг, ASCII
====================================================================== */
PT.tool({
  id: 'image-retro', cat: 'image', icon: '▩',
  title: 'Пиксель-арт и дизеринг',
  desc: 'Превращает фото в пиксель-арт, 1-битный дизеринг или ASCII-картину.',
  keywords: ['пиксель', 'pixel art', 'дизеринг', 'dither', 'ascii', 'ретро', '8 бит'],
  render(root){
    let img = null;
    const status = ui.status();
    const canvas = el('canvas');
    const asciiOut = el('pre', { class: 'code-out', style: { display: 'none', fontSize: '5px', lineHeight: '1' } });
    const stage = el('div', { class: 'canvas-wrap', style: { display: 'none' } }, canvas);

    const PALETTES = {
      none: null,
      gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
      cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
      c64: ['#000000', '#ffffff', '#883932', '#67b6bd', '#8b3f96', '#55a049', '#40318d', '#bfce72'],
      mono: ['#101216', '#e9e7e1'],
      pixset: ['#101216', '#e8a33d', '#5fb3a3', '#e9e7e1']
    };

    const form = ui.form([
      { id: 'mode', type: 'select', label: 'Эффект', col: 4, options: [
        ['pixel', 'Пиксель-арт'], ['dither', 'Дизеринг (Флойд–Стейнберг)'], ['ascii', 'ASCII-арт']
      ] },
      { id: 'size', type: 'range', label: 'Размер пикселя', col: 4, min: 2, max: 40, value: 8, unit: 'px' },
      { id: 'palette', type: 'select', label: 'Палитра', col: 4, options: [
        ['none', 'Цвета оригинала'], ['gameboy', 'Game Boy'], ['c64', 'Commodore 64'], ['cga', 'CGA'],
        ['mono', 'Монохром'], ['pixset', 'Pixset']
      ] },
      { id: 'cols', type: 'range', label: 'Ширина ASCII, символов', col: 4, min: 40, max: 300, value: 140 },
      { id: 'contrast', type: 'range', label: 'Контраст', col: 4, min: 50, max: 250, value: 110, unit: '%' },
      { id: 'invert', type: 'checkbox', label: 'Инвертировать', col: 4, value: false }
    ], () => render());

    const drop = ui.drop({ accept: 'image/*', onFiles: async f => { img = await loadImage(f[0]); render(); } });

    function nearest(palette, r, g, b){
      let best = null, bestD = Infinity;
      for (const hex of palette){
        const c = Color.hexToRgb(hex);
        const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
        if (d < bestD){ bestD = d; best = c; }
      }
      return best;
    }

    function render(){
      if (!img) return;
      const v = form.values();
      const palette = PALETTES[v.palette];
      stage.style.display = v.mode === 'ascii' ? 'none' : 'flex';
      asciiOut.style.display = v.mode === 'ascii' ? 'block' : 'none';

      if (v.mode === 'ascii'){
        const chars = v.invert ? ' .:-=+*#%@' : '@%#*+=-:. ';
        const cols = v.cols;
        const rows = Math.max(1, Math.round(cols * img.naturalHeight / img.naturalWidth * 0.5));
        const c = smartResize(img, cols, rows);
        const d = c.getContext('2d').getImageData(0, 0, cols, rows).data;
        let text = '';
        for (let y = 0; y < rows; y++){
          for (let x = 0; x < cols; x++){
            const i = (y * cols + x) * 4;
            let lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            lum = clamp((lum - 0.5) * (v.contrast / 100) + 0.5, 0, 1);
            text += chars[clamp(Math.round(lum * (chars.length - 1)), 0, chars.length - 1)];
          }
          text += '\n';
        }
        asciiOut.textContent = text;
        asciiOut._text = text;
        status.ok(`ASCII: ${cols}×${rows} символов`);
        return;
      }

      const px = v.size;
      const smallW = Math.max(2, Math.round(img.naturalWidth / px));
      const smallH = Math.max(2, Math.round(img.naturalHeight / px));
      const small = smartResize(img, smallW, smallH);
      const sctx = small.getContext('2d');
      const data = sctx.getImageData(0, 0, smallW, smallH);
      const d = data.data;

      for (let i = 0; i < d.length; i += 4){
        for (let c = 0; c < 3; c++) d[i + c] = clamp((d[i + c] - 128) * (v.contrast / 100) + 128, 0, 255);
        if (v.invert){ d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      }

      if (palette){
        if (v.mode === 'dither'){
          for (let y = 0; y < smallH; y++){
            for (let x = 0; x < smallW; x++){
              const i = (y * smallW + x) * 4;
              const old = [d[i], d[i + 1], d[i + 2]];
              const near = nearest(palette, old[0], old[1], old[2]);
              d[i] = near.r; d[i + 1] = near.g; d[i + 2] = near.b;
              const err = [old[0] - near.r, old[1] - near.g, old[2] - near.b];
              const spread = [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]];
              spread.forEach(([dx, dy, k]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= smallW || ny >= smallH) return;
                const ni = (ny * smallW + nx) * 4;
                for (let c = 0; c < 3; c++) d[ni + c] = clamp(d[ni + c] + err[c] * k, 0, 255);
              });
            }
          }
        } else {
          for (let i = 0; i < d.length; i += 4){
            const near = nearest(palette, d[i], d[i + 1], d[i + 2]);
            d[i] = near.r; d[i + 1] = near.g; d[i + 2] = near.b;
          }
        }
      }
      sctx.putImageData(data, 0, 0);
      canvas.width = smallW * px; canvas.height = smallH * px;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
      status.ok(`${smallW}×${smallH} блоков по ${px}px`);
    }

    root.appendChild(ui.card([
      drop, ui.spacer(14), form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать', async () => {
          const v = form.values();
          if (v.mode === 'ascii'){ downloadText(asciiOut._text || '', 'ascii-art.txt'); return; }
          downloadBlob(await canvasToBlob(canvas, 'image/png'), 'pixel-art.png');
        }),
        ui.btn('Копировать ASCII', () => copy(asciiOut._text || ''), { ghost: true, small: true })
      ]),
      status
    ]));
    root.appendChild(stage);
    root.appendChild(asciiOut);
  }
});


/* ===== tools/11-editor.js ===== */
/* ======================================================================
   ИНСТРУМЕНТ: РЕДАКТОР ИЗОБРАЖЕНИЙ
====================================================================== */
PT.tool({
  id: 'image-editor', cat: 'image', icon: '✎',
  title: 'Редактор изображений',
  desc: 'Обрезка, повороты, фильтры, надписи, кисть, фигуры и замазывание — с историей отмен.',
  keywords: ['редактор', 'editor', 'рисовать', 'фильтры', 'текст', 'стрелка', 'замазать', 'скриншот'],
  render(root){
    const MAX_DIM = 2400;
    let canvas = null, ctx = null;
    let snapshot = null;                       // ImageData текущего зафиксированного состояния
    const history = [], redoStack = [];
    let tool = 'crop';
    let brushColor = '#e8a33d';

    const status = ui.status();
    const hud = el('div', { class: 'canvas-hud', text: '' });
    const stage = el('div', { class: 'canvas-wrap' }, hud);
    const panel = el('div', { class: 'card' });
    const toolbar = el('div', { class: 'card editor-tools' });
    const shell = el('div', { class: 'editor-shell', style: { display: 'none' } }, [toolbar, stage, panel]);

    const TOOLS = [
      ['crop', '▭ Обрезка'],
      ['transform', '↻ Поворот'],
      ['filters', '◐ Фильтры'],
      ['text', 'A Текст'],
      ['draw', '✎ Кисть'],
      ['shape', '◇ Фигуры'],
      ['blur', '▨ Замазать'],
      ['resize', '⤢ Размер']
    ];

    /* ---------- загрузка ---------- */
    const drop = ui.drop({
      accept: 'image/*',
      title: 'Перетащи изображение',
      hint: 'или вставь скриншот из буфера (Ctrl+V)',
      onFiles: async files => {
        const img = await loadImage(files[0]);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (Math.max(w, h) > MAX_DIM){
          const k = MAX_DIM / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k);
          PT.toast('Изображение уменьшено до ' + w + '×' + h + ' для скорости', 'ok');
        }
        canvas = makeCanvas(w, h);
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        stage.innerHTML = ''; stage.appendChild(canvas); stage.appendChild(hud);
        history.length = 0; redoStack.length = 0;
        commit(true);
        shell.style.display = 'grid';
        exportCard.style.display = 'block';
        loadCard.style.display = 'none';
        selectTool('crop');
        status.ok(files[0].name + ' — ' + w + '×' + h);
      }
    });
    const loadCard = ui.card([drop, status]);

    /* ---------- история ---------- */
    function snapCanvas(){
      const c = makeCanvas(canvas.width, canvas.height);
      c.getContext('2d').drawImage(canvas, 0, 0);
      return c;
    }
    function commit(){
      history.push(snapCanvas());
      if (history.length > 14) history.shift();
      redoStack.length = 0;
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      updateHud();
    }
    function restoreSnapshot(){
      if (!snapshot) return;
      if (snapshot.width !== canvas.width || snapshot.height !== canvas.height) return;
      ctx.putImageData(snapshot, 0, 0);
    }
    function applyCanvas(source){
      canvas.width = source.width; canvas.height = source.height;
      ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      updateHud();
    }
    function undo(){
      if (history.length < 2){ PT.toast('Отменять больше нечего'); return; }
      redoStack.push(history.pop());
      applyCanvas(history[history.length - 1]);
    }
    function redo(){
      if (!redoStack.length) return;
      const c = redoStack.pop();
      history.push(c);
      applyCanvas(c);
    }
    function updateHud(){
      hud.textContent = `${canvas.width} × ${canvas.height} px · шагов: ${history.length}`;
    }

    /* ---------- координаты ---------- */
    function pos(e){
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * canvas.width / r.width,
        y: (e.clientY - r.top) * canvas.height / r.height
      };
    }
    let handlers = [];
    function onCanvas(type, fn){
      canvas.addEventListener(type, fn);
      handlers.push({ type, fn });
    }
    function clearHandlers(){
      handlers.forEach(({ type, fn }) => canvas.removeEventListener(type, fn));
      handlers = [];
    }

    /* ---------- панель инструментов ---------- */
    TOOLS.forEach(([id, label]) => {
      toolbar.appendChild(el('button', { type: 'button', 'data-tool': id, text: label, onclick: () => selectTool(id) }));
    });
    toolbar.appendChild(el('hr', { class: 'sep' }));
    toolbar.appendChild(ui.btn('← Отменить', undo, { ghost: true, small: true }));
    toolbar.appendChild(ui.btn('Вернуть →', redo, { ghost: true, small: true }));
    toolbar.appendChild(el('hr', { class: 'sep' }));
    toolbar.appendChild(ui.btn('Сбросить всё', () => {
      if (history.length){ applyCanvas(history[0]); history.length = 1; redoStack.length = 0; }
    }, { ghost: true, small: true }));
    toolbar.appendChild(ui.btn('Другой файл', () => {
      shell.style.display = 'none'; exportCard.style.display = 'none'; loadCard.style.display = 'block';
    }, { ghost: true, small: true }));

    function selectTool(id){
      tool = id;
      $$('button[data-tool]', toolbar).forEach(b => b.classList.toggle('active', b.dataset.tool === id));
      clearHandlers();
      panel.innerHTML = '';
      ({ crop: cropPanel, transform: transformPanel, filters: filtersPanel, text: textPanel,
         draw: drawPanel, shape: shapePanel, blur: blurPanel, resize: resizePanel }[id] || (() => {}))();
    }

    /* ---------- ОБРЕЗКА ---------- */
    function cropPanel(){
      let sel = null, start = null, ratio = 0;
      const form = ui.form([
        { id: 'ratio', type: 'select', label: 'Пропорции', options: [
          ['0', 'Свободно'], ['1', '1:1'], ['1.7777', '16:9'], ['0.5625', '9:16'], ['1.3333', '4:3'], ['1.91', '1.91:1']
        ] }
      ], (i, v) => { ratio = parseFloat(v.ratio) || 0; });
      panel.appendChild(ui.h('Обрезка', 'Выдели область мышью'));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Применить обрезку', () => {
        if (!sel || sel.w < 3 || sel.h < 3){ PT.toast('Сначала выдели область', 'err'); return; }
        const out = makeCanvas(sel.w, sel.h);
        restoreSnapshot();
        out.getContext('2d').drawImage(canvas, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
        applyCanvas(out);
        commit();
        sel = null;
      }, { wide: true }));
      panel.appendChild(ui.spacer(8));
      panel.appendChild(ui.btn('Снять выделение', () => { sel = null; restoreSnapshot(); }, { ghost: true, small: true, wide: true }));

      onCanvas('pointerdown', e => { start = pos(e); canvas.setPointerCapture(e.pointerId); });
      onCanvas('pointermove', e => {
        if (!start) return;
        const p = pos(e);
        let w = p.x - start.x, h = p.y - start.y;
        if (ratio) h = Math.sign(h || 1) * Math.abs(w) / ratio;
        sel = {
          x: Math.round(Math.min(start.x, start.x + w)), y: Math.round(Math.min(start.y, start.y + h)),
          w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h))
        };
        restoreSnapshot();
        ctx.save();
        ctx.fillStyle = 'rgba(10,12,15,0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
        ctx.putImageData(snapshot, 0, 0, sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
        ctx.restore();
        hud.textContent = `выделено ${Math.round(sel.w)} × ${Math.round(sel.h)} px`;
      });
      onCanvas('pointerup', () => { start = null; });
    }

    /* ---------- ПОВОРОТ ---------- */
    function transformPanel(){
      panel.appendChild(ui.h('Поворот и отражение'));
      const mk = (label, fn) => ui.btn(label, () => { fn(); commit(); }, { ghost: true, small: true });
      const rotate = dir => {
        const src = snapCanvas();
        const out = makeCanvas(src.height, src.width);
        const o = out.getContext('2d');
        o.translate(out.width / 2, out.height / 2);
        o.rotate(dir * Math.PI / 2);
        o.drawImage(src, -src.width / 2, -src.height / 2);
        applyCanvas(out);
      };
      const flip = horizontal => {
        const src = snapCanvas();
        const out = makeCanvas(src.width, src.height);
        const o = out.getContext('2d');
        o.translate(horizontal ? out.width : 0, horizontal ? 0 : out.height);
        o.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
        o.drawImage(src, 0, 0);
        applyCanvas(out);
      };
      panel.appendChild(el('div', { class: 'row gap' }, [
        mk('↺ −90°', () => rotate(-1)), mk('↻ +90°', () => rotate(1)),
        mk('⇋ Отразить', () => flip(true)), mk('⇵ Перевернуть', () => flip(false))
      ]));
      panel.appendChild(el('hr', { class: 'sep' }));
      const angleForm = ui.form([
        { id: 'angle', type: 'range', label: 'Произвольный угол', min: -45, max: 45, value: 0, unit: '°' },
        { id: 'bg', type: 'color', label: 'Цвет заливки углов', value: '#ffffff' }
      ]);
      panel.appendChild(angleForm);
      panel.appendChild(ui.spacer(10));
      panel.appendChild(ui.btn('Повернуть на угол', () => {
        const v = angleForm.values();
        if (!v.angle) return;
        const src = snapCanvas();
        const rad = v.angle * Math.PI / 180;
        const w = Math.abs(src.width * Math.cos(rad)) + Math.abs(src.height * Math.sin(rad));
        const h = Math.abs(src.width * Math.sin(rad)) + Math.abs(src.height * Math.cos(rad));
        const out = makeCanvas(w, h);
        const o = out.getContext('2d');
        o.fillStyle = v.bg; o.fillRect(0, 0, out.width, out.height);
        o.translate(out.width / 2, out.height / 2);
        o.rotate(rad);
        o.drawImage(src, -src.width / 2, -src.height / 2);
        applyCanvas(out); commit();
        angleForm.set('angle', 0);
      }, { wide: true }));
    }

    /* ---------- ФИЛЬТРЫ ---------- */
    function filtersPanel(){
      const source = snapCanvas();
      const form = ui.form([
        { id: 'brightness', type: 'range', label: 'Яркость', min: 0, max: 200, value: 100, unit: '%' },
        { id: 'contrast', type: 'range', label: 'Контраст', min: 0, max: 200, value: 100, unit: '%' },
        { id: 'saturate', type: 'range', label: 'Насыщенность', min: 0, max: 250, value: 100, unit: '%' },
        { id: 'hue', type: 'range', label: 'Оттенок', min: -180, max: 180, value: 0, unit: '°' },
        { id: 'blur', type: 'range', label: 'Размытие', min: 0, max: 20, value: 0, unit: 'px' },
        { id: 'sepia', type: 'range', label: 'Сепия', min: 0, max: 100, value: 0, unit: '%' },
        { id: 'gray', type: 'range', label: 'Обесцветить', min: 0, max: 100, value: 0, unit: '%' },
        { id: 'invert', type: 'range', label: 'Инверсия', min: 0, max: 100, value: 0, unit: '%' }
      ], preview);

      const PRESETS = {
        'Оригинал': {},
        'Тёплый': { brightness: 105, saturate: 125, sepia: 18 },
        'Холодный': { brightness: 102, saturate: 88, hue: -12 },
        'Винтаж': { sepia: 45, contrast: 92, saturate: 78, brightness: 104 },
        'Ч/Б плёнка': { gray: 100, contrast: 118 },
        'Драма': { contrast: 138, saturate: 118, brightness: 96 },
        'Пастель': { saturate: 72, brightness: 108, contrast: 92 },
        'Негатив': { invert: 100 }
      };
      panel.appendChild(ui.h('Фильтры'));
      panel.appendChild(el('div', { class: 'pillbar' }, Object.keys(PRESETS).map(name =>
        el('button', { class: 'pill', type: 'button', text: name, onclick: () => {
          const defaults = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, sepia: 0, gray: 0, invert: 0 };
          const p = Object.assign({}, defaults, PRESETS[name]);
          Object.keys(p).forEach(k => form.set(k, p[k]));
          preview();
        } })
      )));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Применить', () => { preview(); commit(); }, { wide: true }));

      function filterString(){
        const v = form.values();
        return `brightness(${v.brightness}%) contrast(${v.contrast}%) saturate(${v.saturate}%) ` +
               `hue-rotate(${v.hue}deg) blur(${v.blur}px) sepia(${v.sepia}%) grayscale(${v.gray}%) invert(${v.invert}%)`;
      }
      function preview(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = filterString();
        ctx.drawImage(source, 0, 0);
        ctx.filter = 'none';
      }
    }

    /* ---------- ТЕКСТ ---------- */
    function textPanel(){
      const form = ui.form([
        { id: 'text', type: 'text', label: 'Текст', value: 'PixTool' },
        { id: 'size', type: 'range', label: 'Размер', min: 8, max: 400, value: Math.round(canvas.width / 12), unit: 'px' },
        { id: 'font', type: 'select', label: 'Шрифт', options: [
          ["'Space Mono', monospace", 'Space Mono'], ["'Inter', sans-serif", 'Inter'],
          ['Georgia, serif', 'Georgia'], ['Impact, sans-serif', 'Impact'], ['Arial, sans-serif', 'Arial']
        ] },
        { id: 'color', type: 'color', label: 'Цвет', value: '#e8a33d', col: 6 },
        { id: 'stroke', type: 'color', label: 'Обводка', value: '#101216', col: 6 },
        { id: 'strokeW', type: 'range', label: 'Толщина обводки', min: 0, max: 20, value: 0, unit: 'px' },
        { id: 'shadow', type: 'checkbox', label: 'Тень', value: false }
      ]);
      panel.appendChild(ui.h('Текст', 'Кликни по картинке, чтобы поставить надпись'));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Зафиксировать', () => commit(), { wide: true }));

      onCanvas('click', e => {
        const p = pos(e);
        const v = form.values();
        ctx.save();
        ctx.font = `700 ${v.size}px ${v.font}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        if (v.shadow){ ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = v.size * 0.18; ctx.shadowOffsetY = v.size * 0.04; }
        if (v.strokeW > 0){ ctx.lineWidth = v.strokeW; ctx.strokeStyle = v.stroke; ctx.lineJoin = 'round'; ctx.strokeText(v.text, p.x, p.y); }
        ctx.fillStyle = v.color;
        ctx.fillText(v.text, p.x, p.y);
        ctx.restore();
      });
    }

    /* ---------- КИСТЬ ---------- */
    function drawPanel(){
      const form = ui.form([
        { id: 'color', type: 'color', label: 'Цвет', value: brushColor, col: 6 },
        { id: 'size', type: 'range', label: 'Толщина', min: 1, max: 120, value: Math.max(3, Math.round(canvas.width / 250)), unit: 'px' },
        { id: 'opacity', type: 'range', label: 'Непрозрачность', min: 5, max: 100, value: 100, unit: '%' },
        { id: 'mode', type: 'select', label: 'Режим', options: [
          ['brush', 'Кисть'], ['marker', 'Маркер (полупрозрачный)'], ['eraser', 'Ластик']
        ] }
      ]);
      panel.appendChild(ui.h('Кисть', 'Рисуй мышью или пальцем'));
      panel.appendChild(form);
      const swatches = el('div', { class: 'swatches' },
        ['#e8a33d', '#5fb3a3', '#e0685c', '#ffffff', '#101216', '#4a8cf7', '#8b5cf6', '#22c55e'].map(hex =>
          el('div', { class: 'swatch', style: { background: hex }, onclick: () => { form.set('color', hex); brushColor = hex; } })));
      panel.appendChild(ui.spacer(10));
      panel.appendChild(swatches);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Зафиксировать', () => commit(), { wide: true }));

      let drawing = false, last = null;
      onCanvas('pointerdown', e => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); dot(last); });
      onCanvas('pointermove', e => {
        if (!drawing) return;
        const p = pos(e);
        stroke(last, p);
        last = p;
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => onCanvas(t, () => { drawing = false; }));

      function setup(){
        const v = form.values();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = v.size;
        ctx.globalAlpha = v.mode === 'marker' ? Math.min(0.35, v.opacity / 100) : v.opacity / 100;
        ctx.globalCompositeOperation = v.mode === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = v.color; ctx.fillStyle = v.color;
        return v;
      }
      function reset(){ ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      function dot(p){ const v = setup(); ctx.beginPath(); ctx.arc(p.x, p.y, v.size / 2, 0, Math.PI * 2); ctx.fill(); reset(); }
      function stroke(a, b){ setup(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); reset(); }
    }

    /* ---------- ФИГУРЫ ---------- */
    function shapePanel(){
      const form = ui.form([
        { id: 'shape', type: 'select', label: 'Фигура', options: [
          ['rect', 'Прямоугольник'], ['ellipse', 'Эллипс'], ['line', 'Линия'], ['arrow', 'Стрелка']
        ] },
        { id: 'color', type: 'color', label: 'Цвет', value: '#e0685c', col: 6 },
        { id: 'width', type: 'range', label: 'Толщина', min: 1, max: 40, value: Math.max(2, Math.round(canvas.width / 300)), unit: 'px' },
        { id: 'fill', type: 'checkbox', label: 'Залить фигуру' }
      ]);
      panel.appendChild(ui.h('Фигуры', 'Удобно для скриншотов и пояснений'));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Зафиксировать', () => commit(), { wide: true }));

      let start = null;
      onCanvas('pointerdown', e => { start = pos(e); canvas.setPointerCapture(e.pointerId); });
      onCanvas('pointermove', e => {
        if (!start) return;
        restoreSnapshot();
        paint(start, pos(e));
      });
      onCanvas('pointerup', e => {
        if (start){ restoreSnapshot(); paint(start, pos(e)); snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); }
        start = null;
      });

      function paint(a, b){
        const v = form.values();
        ctx.save();
        ctx.strokeStyle = v.color; ctx.fillStyle = v.color; ctx.lineWidth = v.width;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (v.shape === 'rect'){
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
          v.fill ? ctx.fillRect(x, y, w, h) : ctx.strokeRect(x, y, w, h);
        } else if (v.shape === 'ellipse'){
          ctx.beginPath();
          ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
          v.fill ? ctx.fill() : ctx.stroke();
        } else if (v.shape === 'line'){
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        } else {
          const head = Math.max(10, v.width * 4);
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
          ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }

    /* ---------- ЗАМАЗАТЬ ---------- */
    function blurPanel(){
      const form = ui.form([
        { id: 'mode', type: 'select', label: 'Способ', options: [
          ['pixelate', 'Пикселизация'], ['blur', 'Размытие'], ['fill', 'Заливка цветом']
        ] },
        { id: 'strength', type: 'range', label: 'Сила', min: 4, max: 60, value: 18 },
        { id: 'color', type: 'color', label: 'Цвет заливки', value: '#101216' }
      ]);
      panel.appendChild(ui.h('Замазать', 'Выдели область — скроет данные на скриншоте'));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Зафиксировать', () => commit(), { wide: true }));

      let start = null;
      onCanvas('pointerdown', e => { start = pos(e); canvas.setPointerCapture(e.pointerId); });
      onCanvas('pointermove', e => {
        if (!start) return;
        const p = pos(e);
        restoreSnapshot();
        const r = rect(start, p);
        ctx.save();
        ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      });
      onCanvas('pointerup', e => {
        if (!start) return;
        const r = rect(start, pos(e));
        start = null;
        restoreSnapshot();
        if (r.w < 3 || r.h < 3) return;
        const v = form.values();
        if (v.mode === 'fill'){
          ctx.fillStyle = v.color;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        } else if (v.mode === 'blur'){
          const part = makeCanvas(r.w, r.h);
          part.getContext('2d').drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          ctx.save();
          ctx.filter = `blur(${v.strength / 2}px)`;
          ctx.drawImage(part, r.x, r.y);
          ctx.restore();
        } else {
          const px = Math.max(2, Math.round(v.strength / 2));
          const smallW = Math.max(1, Math.round(r.w / px)), smallH = Math.max(1, Math.round(r.h / px));
          const small = makeCanvas(smallW, smallH);
          small.getContext('2d').drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, smallW, smallH);
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(small, 0, 0, smallW, smallH, r.x, r.y, r.w, r.h);
          ctx.restore();
        }
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      });
      function rect(a, b){
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      }
    }

    /* ---------- РАЗМЕР ---------- */
    function resizePanel(){
      const form = ui.form([
        { id: 'w', type: 'number', label: 'Ширина, px', value: canvas.width, col: 6 },
        { id: 'h', type: 'number', label: 'Высота, px', value: canvas.height, col: 6 },
        { id: 'lock', type: 'checkbox', label: 'Сохранять пропорции', value: true },
        { id: 'sharpen', type: 'checkbox', label: 'Добавить резкости при увеличении', value: true }
      ], (id, v) => {
        if (!v.lock) return;
        const aspect = canvas.width / canvas.height;
        if (id === 'w') form.set('h', Math.round(v.w / aspect));
        if (id === 'h') form.set('w', Math.round(v.h * aspect));
      });
      panel.appendChild(ui.h('Размер холста'));
      panel.appendChild(form);
      panel.appendChild(ui.spacer(12));
      panel.appendChild(ui.btn('Изменить размер', () => {
        const v = form.values();
        const out = smartResize(snapCanvas(), v.w, v.h, { sharpen: v.sharpen && v.w > canvas.width ? 0.5 : 0 });
        applyCanvas(out); commit();
      }, { wide: true }));
      panel.appendChild(ui.spacer(10));
      panel.appendChild(ui.muted('Кратное уменьшение идёт половинками — так текст остаётся читаемым.'));
    }

    /* ---------- экспорт ---------- */
    const exportForm = ui.form([
      { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [
        ['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']
      ] },
      { id: 'q', type: 'range', label: 'Качество', col: 4, min: 30, max: 100, value: 92, unit: '%' },
      { id: 'name', type: 'text', label: 'Имя файла', col: 4, value: 'pixtool-edit' }
    ]);
    const exportCard = ui.card([
      ui.h('Сохранение'),
      exportForm,
      ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать', doExport),
        ui.btn('Копировать в буфер', async () => {
          try{
            const blob = await canvasToBlob(canvas, 'image/png');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            PT.toast('Картинка скопирована', 'ok');
          } catch(e){ PT.toast('Браузер не разрешил копирование картинки', 'err'); }
        }, { ghost: true })
      ])
    ]);
    exportCard.style.display = 'none';

    async function doExport(){
      const v = exportForm.values();
      const src = v.fmt === 'image/jpeg' ? flatten(canvas) : canvas;
      const blob = await encodeCanvas(src, v.fmt, v.q / 100);
      downloadBlob(blob, (v.name || 'pixtool-edit') + '.' + PT.mimeExt(v.fmt));
    }

    /* ---------- горячие клавиши ---------- */
    const keyHandler = e => {
      if (!canvas || !shell.isConnected) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); doExport(); }
    };
    document.addEventListener('keydown', keyHandler);
    PT.onCleanup(() => document.removeEventListener('keydown', keyHandler));

    root.appendChild(loadCard);
    root.appendChild(shell);
    root.appendChild(exportCard);
  }
});


/* ===== tools/20-media.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: МЕДИА (видео, аудио, GIF, запись экрана)
====================================================================== */

/* ---------- квантование цветов: медианный срез ---------- */
function medianCut(pixels, maxColors){
  const boxes = [{ pixels, min: [0, 0, 0], max: [255, 255, 255] }];
  const fit = box => {
    const min = [255, 255, 255], max = [0, 0, 0];
    for (let i = 0; i < box.pixels.length; i += 3){
      for (let c = 0; c < 3; c++){
        if (box.pixels[i + c] < min[c]) min[c] = box.pixels[i + c];
        if (box.pixels[i + c] > max[c]) max[c] = box.pixels[i + c];
      }
    }
    box.min = min; box.max = max;
    box.range = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    box.channel = [max[0] - min[0], max[1] - min[1], max[2] - min[2]].indexOf(box.range);
    return box;
  };
  fit(boxes[0]);
  while (boxes.length < maxColors){
    boxes.sort((a, b) => b.range * b.pixels.length - a.range * a.pixels.length);
    const box = boxes.shift();
    if (!box || box.pixels.length <= 3 || box.range === 0){ if (box) boxes.push(box); break; }
    const ch = box.channel;
    const triples = [];
    for (let i = 0; i < box.pixels.length; i += 3) triples.push(box.pixels.subarray(i, i + 3));
    triples.sort((a, b) => a[ch] - b[ch]);
    const mid = Math.floor(triples.length / 2);
    const left = new Uint8Array(mid * 3), right = new Uint8Array((triples.length - mid) * 3);
    triples.forEach((t, i) => {
      const target = i < mid ? left : right;
      const off = (i < mid ? i : i - mid) * 3;
      target[off] = t[0]; target[off + 1] = t[1]; target[off + 2] = t[2];
    });
    boxes.push(fit({ pixels: left }), fit({ pixels: right }));
  }
  return boxes.map(box => {
    let r = 0, g = 0, b = 0;
    const n = box.pixels.length / 3 || 1;
    for (let i = 0; i < box.pixels.length; i += 3){ r += box.pixels[i]; g += box.pixels[i + 1]; b += box.pixels[i + 2]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/* ---------- GIF-энкодер (GIF89a + LZW) ---------- */
function GifWriter(width, height){
  const chunks = [];
  let palette = null, colorBits = 8;

  const byte = b => chunks.push(new Uint8Array([b]));
  const bytes = arr => chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
  const short = v => bytes([v & 255, (v >> 8) & 255]);

  function buildPalette(colors){
    colorBits = Math.max(1, Math.ceil(Math.log2(Math.max(2, colors.length))));
    const size = 1 << colorBits;
    const table = new Uint8Array(size * 3);
    colors.forEach((c, i) => { table[i * 3] = c[0]; table[i * 3 + 1] = c[1]; table[i * 3 + 2] = c[2]; });
    palette = { table, size, colors };
  }

  function nearestIndex(r, g, b){
    let best = 0, bestD = Infinity;
    const cs = palette.colors;
    for (let i = 0; i < cs.length; i++){
      const d = (cs[i][0] - r) ** 2 + (cs[i][1] - g) ** 2 + (cs[i][2] - b) ** 2;
      if (d < bestD){ bestD = d; best = i; if (!d) break; }
    }
    return best;
  }

  function lzw(indices, minCodeSize){
    const out = [];
    let cur = 0, curBits = 0;
    const clear = 1 << minCodeSize, eoi = clear + 1;
    let codeSize = minCodeSize + 1, next = eoi + 1;
    let dict = new Map();
    const push = code => {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8){ out.push(cur & 255); cur >>= 8; curBits -= 8; }
    };
    push(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++){
      const k = indices[i];
      const key = prefix * 4096 + k;
      if (dict.has(key)) prefix = dict.get(key);
      else {
        push(prefix);
        dict.set(key, next++);
        if (next > (1 << codeSize)){
          if (codeSize < 12) codeSize++;
          else { push(clear); dict = new Map(); next = eoi + 1; codeSize = minCodeSize + 1; }
        }
        prefix = k;
      }
    }
    push(prefix);
    push(eoi);
    if (curBits > 0) out.push(cur & 255);
    return out;
  }

  return {
    start(colors, loop){
      buildPalette(colors);
      bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);                 // GIF89a
      short(width); short(height);
      byte(0x80 | ((colorBits - 1) << 4) | (colorBits - 1));        // GCT есть
      byte(0); byte(0);
      bytes(palette.table);
      // расширение Netscape: бесконечный цикл
      bytes([0x21, 0xFF, 0x0B]);
      bytes(Array.from('NETSCAPE2.0').map(c => c.charCodeAt(0)));
      bytes([0x03, 0x01]); short(loop === false ? 1 : 0); byte(0);
    },
    addFrame(imageData, delayMs){
      const px = imageData.data;
      const indices = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < px.length; i += 4, j++){
        indices[j] = nearestIndex(px[i], px[i + 1], px[i + 2]);
      }
      bytes([0x21, 0xF9, 0x04, 0x04]);
      short(Math.max(2, Math.round(delayMs / 10)));
      byte(0); byte(0);
      byte(0x2C); short(0); short(0); short(width); short(height); byte(0);
      const minCodeSize = Math.max(2, colorBits);
      byte(minCodeSize);
      const data = lzw(indices, minCodeSize);
      for (let i = 0; i < data.length; i += 255){
        const block = data.slice(i, i + 255);
        byte(block.length);
        bytes(block);
      }
      byte(0);
    },
    finish(){
      byte(0x3B);
      return new Blob(chunks, { type: 'image/gif' });
    }
  };
}

async function framesToGif(frames, opts){
  opts = opts || {};
  const width = frames[0].width, height = frames[0].height;
  const sampleStep = Math.max(1, Math.floor(width * height / 12000)) * 4;
  const sample = [];
  frames.slice(0, 12).forEach(f => {
    const d = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
    for (let i = 0; i < d.length; i += sampleStep){ sample.push(d[i], d[i + 1], d[i + 2]); }
  });
  const colors = medianCut(new Uint8Array(sample), opts.colors || 128);
  const gif = GifWriter(width, height);
  gif.start(colors, opts.loop);
  for (let i = 0; i < frames.length; i++){
    const data = frames[i].getContext('2d').getImageData(0, 0, width, height);
    gif.addFrame(data, opts.delay || 100);
    if (opts.onProgress) opts.onProgress((i + 1) / frames.length);
    if (i % 4 === 0) await sleep(0);
  }
  return gif.finish();
}
PT.framesToGif = framesToGif;

/* ---------- работа с видео ---------- */
function loadVideo(file){
  return new Promise((res, rej) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => res(video);
    video.onerror = () => rej(new Error('Браузер не смог открыть это видео'));
  });
}
function seekTo(video, time){
  return new Promise(res => {
    const done = () => { video.removeEventListener('seeked', done); res(); };
    video.addEventListener('seeked', done);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.02));
  });
}

/* ======================================================================
   Запись экрана
====================================================================== */
PT.tool({
  id: 'media-record', cat: 'media', icon: '⏺',
  title: 'Запись экрана и камеры',
  desc: 'Пишет экран, окно или вкладку со звуком — файл сразу сохраняется на диск.',
  keywords: ['запись', 'экран', 'screen record', 'вебкамера', 'скринкаст', 'видео', 'демо'],
  render(root){
    let recorder = null, stream = null, chunks = [], timer = null, startedAt = 0;
    const status = ui.status();
    const preview = el('video', { autoplay: true, muted: true, playsinline: true,
      style: { width: '100%', maxHeight: '420px', background: '#000', borderRadius: '8px', display: 'none' } });
    const timeEl = el('div', { class: 'canvas-hud', style: { position: 'static', display: 'none' }, text: '00:00' });
    const resultBox = ui.result();

    const form = ui.form([
      { id: 'source', type: 'select', label: 'Источник', col: 4, options: [
        ['screen', 'Экран / окно / вкладка'], ['camera', 'Веб-камера'], ['both', 'Экран + камера в углу']
      ] },
      { id: 'audio', type: 'select', label: 'Звук', col: 4, options: [
        ['system', 'Системный (если разрешит браузер)'], ['mic', 'Микрофон'], ['both', 'Система + микрофон'], ['none', 'Без звука']
      ] },
      { id: 'quality', type: 'select', label: 'Качество', col: 4, value: '4000000', options: [
        ['8000000', 'Высокое (8 Мбит/с)'], ['4000000', 'Среднее (4 Мбит/с)'], ['1500000', 'Экономное (1.5 Мбит/с)']
      ] }
    ]);

    const startBtn = ui.btn('● Начать запись', start);
    const stopBtn = ui.btn('■ Остановить', stop, { danger: true });
    stopBtn.style.display = 'none';

    async function buildStream(v){
      const wantMic = v.audio === 'mic' || v.audio === 'both';
      const wantSystem = v.audio === 'system' || v.audio === 'both';
      let base;
      if (v.source === 'camera'){
        base = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: wantMic });
        return base;
      }
      base = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: wantSystem
      });
      if (wantMic){
        try{
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          if (base.getAudioTracks().length) audioCtx.createMediaStreamSource(new MediaStream(base.getAudioTracks())).connect(dest);
          audioCtx.createMediaStreamSource(mic).connect(dest);
          const merged = new MediaStream([...base.getVideoTracks(), ...dest.stream.getAudioTracks()]);
          merged._extra = [base, mic];
          return merged;
        } catch(e){ PT.toast('Микрофон недоступен — пишу без него', 'err'); }
      }
      if (v.source === 'both'){
        try{
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 320 } });
          return composite(base, cam);
        } catch(e){ PT.toast('Камера недоступна — пишу только экран', 'err'); }
      }
      return base;
    }

    /** Композит «экран + камера в углу» через canvas. */
    function composite(screenStream, camStream){
      const screenVideo = el('video', { autoplay: true, muted: true, playsinline: true });
      const camVideo = el('video', { autoplay: true, muted: true, playsinline: true });
      screenVideo.srcObject = screenStream; camVideo.srcObject = camStream;
      const settings = screenStream.getVideoTracks()[0].getSettings();
      const canvas = makeCanvas(settings.width || 1280, settings.height || 720);
      const ctx = canvas.getContext('2d');
      let raf;
      const paint = () => {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        const cw = canvas.width / 5, ch = cw * 0.5625;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18;
        ctx.drawImage(camVideo, canvas.width - cw - 24, canvas.height - ch - 24, cw, ch);
        ctx.restore();
        raf = requestAnimationFrame(paint);
      };
      paint();
      const out = canvas.captureStream(30);
      screenStream.getAudioTracks().forEach(t => out.addTrack(t));
      out._extra = [screenStream, camStream];
      out._stopPaint = () => cancelAnimationFrame(raf);
      return out;
    }

    async function start(){
      const v = form.values();
      try{
        stream = await buildStream(v);
      } catch(err){
        status.err('Доступ не выдан: ' + err.message);
        return;
      }
      preview.srcObject = stream;
      preview.style.display = 'block';
      timeEl.style.display = 'inline-block';
      chunks = [];
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Number(v.quality) });
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = finish;
      recorder.start(1000);
      startedAt = Date.now();
      timer = setInterval(() => { timeEl.textContent = '● ' + fmtDuration((Date.now() - startedAt) / 1000); }, 500);
      startBtn.style.display = 'none';
      stopBtn.style.display = '';
      status.ok('Идёт запись… Останови кнопкой или прекращением доступа в браузере.');
      stream.getVideoTracks()[0].addEventListener('ended', stop);
    }

    function stop(){
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      clearInterval(timer);
    }

    function finish(){
      const type = chunks[0] ? chunks[0].type : 'video/webm';
      const blob = new Blob(chunks, { type });
      const dur = (Date.now() - startedAt) / 1000;
      resultBox.clear();
      resultBox.file(blob, 'screen-record-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') +
        (type.includes('mp4') ? '.mp4' : '.webm'), fmtDuration(dur));
      [stream, ...(stream._extra || [])].forEach(s => { if (s && s.getTracks) s.getTracks().forEach(t => t.stop()); });
      if (stream._stopPaint) stream._stopPaint();
      preview.srcObject = null;
      preview.style.display = 'none';
      timeEl.style.display = 'none';
      startBtn.style.display = '';
      stopBtn.style.display = 'none';
      status.ok('Запись готова: ' + fmtDuration(dur) + ', ' + fmtBytes(blob.size));
    }

    PT.onCleanup(() => { if (recorder && recorder.state !== 'inactive') recorder.stop();
      if (stream) stream.getTracks().forEach(t => t.stop()); clearInterval(timer); });

    root.appendChild(ui.card([
      form, ui.spacer(14),
      el('div', { class: 'row gap' }, [startBtn, stopBtn, timeEl]),
      status,
      ui.muted('Формат — WebM (VP9). Он открывается в браузерах, Telegram и большинстве плееров; ' +
               'для монтажа конвертируй в MP4 в видеоредакторе.'),
      preview
    ]));
    root.appendChild(resultBox);
  }
});

/* ======================================================================
   Кадры из видео
====================================================================== */
PT.tool({
  id: 'media-frames', cat: 'media', icon: '⊞',
  title: 'Кадры из видео',
  desc: 'Вытаскивает кадры по времени или через интервал: PNG-архив, контактный лист, обложка.',
  keywords: ['видео', 'кадр', 'frame', 'скриншот видео', 'превью', 'обложка', 'раскадровка'],
  render(root){
    let video = null, file = null;
    const status = ui.status();
    const grid = ui.thumbGrid();
    const frames = [];
    const progress = ui.progress();

    const form = ui.form([
      { id: 'mode', type: 'select', label: 'Что извлечь', col: 4, options: [
        ['interval', 'Кадры через интервал'], ['count', 'Равномерно N кадров'], ['single', 'Один кадр по времени'], ['sheet', 'Контактный лист (сетка)']
      ] },
      { id: 'interval', type: 'number', label: 'Интервал, сек', col: 4, value: 2, min: 0.1, step: 0.1 },
      { id: 'count', type: 'number', label: 'Сколько кадров', col: 4, value: 12, min: 1, max: 200 },
      { id: 'time', type: 'number', label: 'Момент, сек', col: 4, value: 1, min: 0, step: 0.1 },
      { id: 'width', type: 'number', label: 'Ширина кадра, px (0 — как есть)', col: 4, value: 0, min: 0, step: 80 },
      { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']] }
    ], (id, v) => {
      form.show('interval', v.mode === 'interval');
      form.show('count', v.mode === 'count' || v.mode === 'sheet');
      form.show('time', v.mode === 'single');
    });
    form.show('count', false); form.show('time', false);

    const drop = ui.drop({
      accept: 'video/*',
      title: 'Перетащи видео',
      hint: 'MP4, WebM, MOV — всё, что открывает браузер',
      onFiles: async files => {
        file = files[0];
        video = await loadVideo(file);
        status.ok(`${file.name} — ${fmtDuration(video.duration)}, ${video.videoWidth}×${video.videoHeight}`);
      }
    });

    async function grab(){
      if (!video){ status.err('Сначала загрузи видео'); return; }
      const v = form.values();
      frames.length = 0; grid.clear();
      const times = [];
      if (v.mode === 'single') times.push(v.time);
      else if (v.mode === 'interval') for (let t = 0; t < video.duration; t += Math.max(0.1, v.interval)) times.push(t);
      else { const n = Math.max(1, v.count); for (let i = 0; i < n; i++) times.push(video.duration * (i + 0.5) / n); }
      if (times.length > 300){ status.err('Слишком много кадров (' + times.length + '). Увеличь интервал.'); return; }

      status.busy('Извлекаю кадры');
      const w = v.width > 0 ? v.width : video.videoWidth;
      const h = Math.round(w * video.videoHeight / video.videoWidth);
      for (let i = 0; i < times.length; i++){
        await seekTo(video, times[i]);
        const c = makeCanvas(w, h);
        c.getContext('2d').drawImage(video, 0, 0, w, h);
        c._time = times[i];
        frames.push(c);
        progress.set((i + 1) / times.length);
      }
      progress.hide();

      if (v.mode === 'sheet'){
        const cols = Math.ceil(Math.sqrt(frames.length));
        const rows = Math.ceil(frames.length / cols);
        const pad = 8;
        const sheet = makeCanvas(cols * w + pad * (cols + 1), rows * h + pad * (rows + 1) + 34);
        const sctx = sheet.getContext('2d');
        sctx.fillStyle = '#101216'; sctx.fillRect(0, 0, sheet.width, sheet.height);
        frames.forEach((f, i) => {
          const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + pad);
          sctx.drawImage(f, x, y);
          sctx.fillStyle = 'rgba(0,0,0,0.6)';
          sctx.fillRect(x, y + h - 20, 62, 20);
          sctx.fillStyle = '#e8a33d';
          sctx.font = "12px 'Space Mono', monospace";
          sctx.fillText(fmtDuration(f._time), x + 6, y + h - 6);
        });
        sctx.fillStyle = '#989da6';
        sctx.font = "14px 'Space Mono', monospace";
        sctx.fillText(`${file.name} · ${fmtDuration(video.duration)} · ${video.videoWidth}×${video.videoHeight}`,
          pad, sheet.height - 12);
        const blob = await encodeCanvas(sheet, v.fmt, 0.9);
        downloadBlob(blob, baseName(file.name) + '-contact-sheet.' + PT.mimeExt(v.fmt));
        grid.add(URL.createObjectURL(blob), 'контактный лист');
        status.ok('Контактный лист готов');
        return;
      }

      const blobs = [];
      for (const f of frames){
        const blob = await encodeCanvas(f, v.fmt, 0.92);
        blobs.push({ blob, time: f._time });
        grid.add(URL.createObjectURL(blob), fmtDuration(f._time), () =>
          downloadBlob(blob, baseName(file.name) + '-' + f._time.toFixed(1) + 's.' + PT.mimeExt(v.fmt)));
      }
      grid._blobs = blobs;
      status.ok('Готово кадров: ' + blobs.length + '. Клик по превью — скачать.');
    }

    root.appendChild(ui.card([
      drop, ui.spacer(14), form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Извлечь кадры →', grab),
        ui.btn('Скачать все архивом', async () => {
          if (!grid._blobs || !grid._blobs.length){ status.err('Сначала извлеки кадры'); return; }
          const v = form.values();
          const entries = grid._blobs.map((b, i) =>
            ({ name: `frame-${String(i + 1).padStart(4, '0')}-${b.time.toFixed(2)}s.${PT.mimeExt(v.fmt)}`, data: b.blob }));
          downloadBlob(await zip(entries), baseName(file.name) + '-frames.zip');
        }, { ghost: true })
      ]),
      progress, status
    ]));
    root.appendChild(grid);
  }
});

/* ======================================================================
   Видео → GIF
====================================================================== */
PT.tool({
  id: 'media-gif', cat: 'media', icon: '◨',
  title: 'GIF из видео и картинок',
  desc: 'Собирает анимированный GIF: обрезка по времени, частота кадров, размер и палитра.',
  keywords: ['gif', 'анимация', 'видео в гиф', 'мем', 'зацикленный'],
  render(root){
    let video = null, images = [], srcName = 'animation';
    const status = ui.status();
    const progress = ui.progress();
    const resultBox = ui.result();

    const form = ui.form([
      { id: 'start', type: 'number', label: 'Начало, сек', col: 3, value: 0, min: 0, step: 0.1 },
      { id: 'duration', type: 'number', label: 'Длительность, сек', col: 3, value: 4, min: 0.2, step: 0.1 },
      { id: 'fps', type: 'range', label: 'Кадров в секунду', col: 3, min: 2, max: 24, value: 12 },
      { id: 'width', type: 'number', label: 'Ширина, px', col: 3, value: 480, min: 60, step: 20 },
      { id: 'colors', type: 'select', label: 'Палитра', col: 3, value: '128', options: [
        ['256', '256 цветов (лучше)'], ['128', '128 цветов'], ['64', '64 цвета (легче)'], ['32', '32 цвета']
      ] },
      { id: 'loop', type: 'checkbox', label: 'Зациклить', col: 3, value: true }
    ]);

    const videoDrop = ui.drop({
      accept: 'video/*', title: 'Видео → GIF',
      onFiles: async files => {
        video = await loadVideo(files[0]); images = []; srcName = baseName(files[0].name);
        form.set('duration', Math.min(5, Math.round(video.duration * 10) / 10));
        status.ok(`${files[0].name} — ${fmtDuration(video.duration)}`);
      }
    });
    const imgDrop = ui.drop({
      accept: 'image/*', multiple: true, title: 'Или набор картинок → GIF',
      hint: 'кадры в порядке имён файлов',
      onFiles: async files => {
        const sorted = files.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
        images = await Promise.all(sorted.map(loadImage));
        video = null; srcName = 'animation';
        status.ok('Кадров загружено: ' + images.length);
      }
    });

    async function build(){
      const v = form.values();
      const w = v.width;
      let frames = [];
      status.busy('Собираю кадры');
      if (video){
        const total = Math.max(1, Math.round(v.duration * v.fps));
        const h = Math.round(w * video.videoHeight / video.videoWidth / 2) * 2;
        for (let i = 0; i < total; i++){
          await seekTo(video, v.start + i / v.fps);
          const c = makeCanvas(w, h);
          c.getContext('2d').drawImage(video, 0, 0, w, h);
          frames.push(c);
          progress.set(i / total * 0.5);
        }
      } else if (images.length){
        const h = Math.round(w * images[0].naturalHeight / images[0].naturalWidth);
        frames = images.map(img => smartResize(img, w, h));
      } else {
        status.err('Загрузи видео или картинки');
        return;
      }
      status.busy('Кодирую GIF');
      const blob = await framesToGif(frames, {
        delay: 1000 / v.fps,
        colors: Number(v.colors),
        loop: v.loop,
        onProgress: p => progress.set(0.5 + p * 0.5)
      });
      progress.hide();
      resultBox.clear();
      resultBox.file(blob, srcName + '.gif', frames.length + ' кадров · ' + frames[0].width + '×' + frames[0].height);
      status.ok('GIF готов: ' + fmtBytes(blob.size));
    }

    root.appendChild(ui.card([
      el('div', { class: 'grid cols-2' }, [videoDrop, imgDrop]),
      ui.spacer(14), form, ui.spacer(14),
      ui.btn('Собрать GIF →', () => build().catch(e => { progress.hide(); status.err(e.message); })),
      progress, status,
      ui.muted('GIF кодируется прямо здесь: медианный срез палитры + LZW. Для веса меньше 5 МБ держи ширину до 640px и 12 кадров/с.')
    ]));
    root.appendChild(resultBox);
  }
});

/* ======================================================================
   Аудио: обрезка и конвертация
====================================================================== */
function audioBufferToWav(buffer, opts){
  opts = opts || {};
  const channels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const bitDepth = opts.bitDepth || 16;
  const bytesPerSample = bitDepth / 8;
  const length = buffer.length * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + length);
  const view = new DataView(out);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + length, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, bitDepth, true);
  writeStr(36, 'data'); view.setUint32(40, length, true);
  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++){
    for (let c = 0; c < channels; c++){
      const s = clamp(data[c][i], -1, 1);
      if (bitDepth === 16){ view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); offset += 2; }
      else { view.setUint8(offset, (s * 0.5 + 0.5) * 255); offset += 1; }
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
PT.audioBufferToWav = audioBufferToWav;

PT.tool({
  id: 'media-audio', cat: 'media', icon: '♪',
  title: 'Аудио: обрезка и конвертация',
  desc: 'Вырезает фрагмент, нормализует громкость, меняет скорость и достаёт звук из видео в WAV.',
  keywords: ['аудио', 'звук', 'обрезать', 'wav', 'mp3', 'громкость', 'извлечь звук', 'рингтон'],
  render(root){
    let buffer = null, srcName = 'audio';
    const status = ui.status();
    const resultBox = ui.result();
    const wave = el('canvas', { style: { width: '100%', height: '120px', borderRadius: '8px', border: '1px solid var(--line)' } });
    const player = el('audio', { controls: true, style: { width: '100%', marginTop: '10px' } });

    const form = ui.form([
      { id: 'start', type: 'number', label: 'Начало, сек', col: 3, value: 0, min: 0, step: 0.1 },
      { id: 'end', type: 'number', label: 'Конец, сек', col: 3, value: 0, min: 0, step: 0.1 },
      { id: 'speed', type: 'range', label: 'Скорость', col: 3, min: 50, max: 200, value: 100, unit: '%' },
      { id: 'volume', type: 'range', label: 'Громкость', col: 3, min: 10, max: 300, value: 100, unit: '%' },
      { id: 'normalize', type: 'checkbox', label: 'Нормализовать (выровнять до максимума)', col: 6, value: false },
      { id: 'fade', type: 'checkbox', label: 'Плавное начало и затухание в конце', col: 6, value: false },
      { id: 'mono', type: 'checkbox', label: 'Свести в моно', col: 6, value: false }
    ]);

    const drop = ui.drop({
      accept: 'audio/*,video/*',
      title: 'Перетащи аудио или видео',
      hint: 'MP3, WAV, OGG, M4A, MP4 — звук будет извлечён',
      onFiles: async files => {
        status.busy('Декодирую звук');
        srcName = baseName(files[0].name);
        const audioCtx = new AudioContext();
        try{
          buffer = await audioCtx.decodeAudioData(await files[0].arrayBuffer());
        } catch(e){
          status.err('Не удалось декодировать этот файл');
          return;
        }
        form.set('end', Math.round(buffer.duration * 10) / 10);
        drawWave();
        player.src = URL.createObjectURL(files[0]);
        status.ok(`${files[0].name} — ${fmtDuration(buffer.duration)}, ${buffer.sampleRate} Гц, ` +
                  `${buffer.numberOfChannels === 1 ? 'моно' : 'стерео'}`);
      }
    });

    function drawWave(){
      if (!buffer) return;
      const w = wave.width = wave.clientWidth * 2 || 1200;
      const h = wave.height = 240;
      const ctx = wave.getContext('2d');
      const styles = getComputedStyle(document.documentElement);
      ctx.fillStyle = styles.getPropertyValue('--surface-2').trim() || '#1d2127';
      ctx.fillRect(0, 0, w, h);
      const data = buffer.getChannelData(0);
      const step = Math.ceil(data.length / w);
      ctx.strokeStyle = styles.getPropertyValue('--accent').trim() || '#e8a33d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x++){
        let min = 1, max = -1;
        for (let i = 0; i < step; i++){
          const v = data[x * step + i] || 0;
          if (v < min) min = v; if (v > max) max = v;
        }
        ctx.moveTo(x, (1 + min) * h / 2);
        ctx.lineTo(x, (1 + max) * h / 2);
      }
      ctx.stroke();
    }

    async function process(){
      if (!buffer){ status.err('Сначала загрузи файл'); return; }
      const v = form.values();
      const start = clamp(v.start, 0, buffer.duration);
      const end = v.end > start ? Math.min(v.end, buffer.duration) : buffer.duration;
      const speed = v.speed / 100;
      const channels = v.mono ? 1 : buffer.numberOfChannels;
      const frames = Math.round((end - start) * buffer.sampleRate / speed);
      status.busy('Обрабатываю');

      const offline = new OfflineAudioContext(channels, frames, buffer.sampleRate);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      const gain = offline.createGain();
      gain.gain.value = v.volume / 100;
      if (v.fade){
        const dur = (end - start) / speed;
        const f = Math.min(0.4, dur / 6);
        gain.gain.setValueAtTime(0, 0);
        gain.gain.linearRampToValueAtTime(v.volume / 100, f);
        gain.gain.setValueAtTime(v.volume / 100, Math.max(f, dur - f));
        gain.gain.linearRampToValueAtTime(0, dur);
      }
      source.connect(gain); gain.connect(offline.destination);
      source.start(0, start, end - start);
      let rendered = await offline.startRendering();

      if (v.normalize){
        let peak = 0;
        for (let c = 0; c < rendered.numberOfChannels; c++){
          const d = rendered.getChannelData(c);
          for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
        }
        if (peak > 0 && peak < 0.99){
          const k = 0.98 / peak;
          for (let c = 0; c < rendered.numberOfChannels; c++){
            const d = rendered.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= k;
          }
        }
      }
      const blob = audioBufferToWav(rendered);
      resultBox.clear();
      resultBox.file(blob, srcName + '-edit.wav', fmtDuration(rendered.duration) + ' · ' + rendered.sampleRate + ' Гц');
      status.ok('Готово: ' + fmtDuration(rendered.duration));
    }

    root.appendChild(ui.card([
      drop, ui.spacer(14), wave, player, ui.spacer(14), form, ui.spacer(14),
      ui.btn('Обработать →', () => process().catch(e => status.err(e.message))),
      status,
      ui.muted('Выход — WAV без потерь (браузер не умеет кодировать MP3 без сторонних библиотек). ' +
               'WAV принимают все редакторы, мессенджеры и телефоны.')
    ]));
    root.appendChild(resultBox);
  }
});


/* ===== tools/30-data.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: ДАННЫЕ И КОД (часть 1)
====================================================================== */

/* ---------- MD5 (в SubtleCrypto его нет) ---------- */
function md5(bytes){
  const rotl = (x, c) => (x << c) | (x >>> (32 - c));
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22, 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23, 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const len = bytes.length;
  const withPad = new Uint8Array((((len + 8) >> 6) + 1) * 64);
  withPad.set(bytes);
  withPad[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 8, bitLen >>> 0, true);
  dv.setUint32(withPad.length - 4, Math.floor(bitLen / 4294967296), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let chunk = 0; chunk < withPad.length; chunk += 64){
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(chunk + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++){
      let F, g;
      if (i < 16){ F = (B & C) | (~B & D); g = i; }
      else if (i < 32){ F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48){ F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0 >>> 0, true); ov.setUint32(4, b0 >>> 0, true);
  ov.setUint32(8, c0 >>> 0, true); ov.setUint32(12, d0 >>> 0, true);
  return out;
}
const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
PT.md5 = md5; PT.toHex = toHex;

/* ---------- JSON ↔ YAML ↔ XML ---------- */
function toYaml(value, indent){
  indent = indent || 0;
  const pad = '  '.repeat(indent);
  if (value === null) return 'null';
  if (Array.isArray(value)){
    if (!value.length) return '[]';
    return value.map(v => {
      const inner = toYaml(v, indent + 1);
      return (typeof v === 'object' && v !== null && Object.keys(v).length)
        ? pad + '- ' + inner.trimStart()
        : pad + '- ' + inner;
    }).join('\n');
  }
  if (typeof value === 'object'){
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return keys.map(k => {
      const v = value[k];
      if (v !== null && typeof v === 'object' && Object.keys(v).length){
        return pad + k + ':\n' + toYaml(v, indent + 1);
      }
      return pad + k + ': ' + toYaml(v, indent + 1);
    }).join('\n');
  }
  if (typeof value === 'string'){
    return /[:#\-{}\[\]&*?|>%@`"'\n]/.test(value) || value === '' ? JSON.stringify(value) : value;
  }
  return String(value);
}

function parseYaml(text){
  // Компактный парсер подмножества YAML: отступы, списки, скаляры.
  const lines = text.split('\n').filter(l => l.trim() && !/^\s*#/.test(l));
  let pos = 0;
  const indentOf = l => l.match(/^ */)[0].length;
  const scalar = s => {
    s = s.trim();
    if (s === '') return '';
    if (s === 'null' || s === '~') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'"))){
      try { return JSON.parse(s.replace(/^'|'$/g, '"')); } catch(e){ return s.slice(1, -1); }
    }
    return s;
  };
  function parseBlock(minIndent){
    const isList = lines[pos] && /^\s*-\s/.test(lines[pos]);
    const result = isList ? [] : {};
    while (pos < lines.length){
      const line = lines[pos];
      const ind = indentOf(line);
      if (ind < minIndent) break;
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')){
        const rest = trimmed.slice(2);
        pos++;
        if (rest.includes(': ')){
          const obj = {};
          const [k, ...v] = rest.split(': ');
          obj[k.trim()] = scalar(v.join(': '));
          while (pos < lines.length && indentOf(lines[pos]) > ind){
            const sub = lines[pos].trim();
            const [sk, ...sv] = sub.split(': ');
            obj[sk.trim()] = scalar(sv.join(': '));
            pos++;
          }
          result.push(obj);
        } else result.push(scalar(rest));
      } else {
        const idx = trimmed.indexOf(':');
        if (idx < 0){ pos++; continue; }
        const key = trimmed.slice(0, idx).trim();
        const rest = trimmed.slice(idx + 1).trim();
        pos++;
        if (rest === ''){
          if (pos < lines.length && indentOf(lines[pos]) > ind) result[key] = parseBlock(indentOf(lines[pos]));
          else result[key] = null;
        } else result[key] = scalar(rest);
      }
    }
    return result;
  }
  return parseBlock(0);
}
PT.toYaml = toYaml; PT.parseYaml = parseYaml;

function toXml(value, name, indent){
  name = name || 'root'; indent = indent || 0;
  const pad = '  '.repeat(indent);
  const safe = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const tag = String(name).replace(/[^\w.-]/g, '_');
  if (Array.isArray(value)) return value.map(v => toXml(v, tag.replace(/s$/, '') || 'item', indent)).join('\n');
  if (value !== null && typeof value === 'object'){
    const inner = Object.keys(value).map(k => toXml(value[k], k, indent + 1)).join('\n');
    return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`;
  }
  return `${pad}<${tag}>${safe(value === null ? '' : value)}</${tag}>`;
}
PT.toXml = toXml;

/* ======================================================================
   JSON-мастерская
====================================================================== */
PT.tool({
  id: 'data-json', cat: 'data', icon: '{}',
  title: 'JSON: формат и конвертация',
  desc: 'Проверка и красивый вывод JSON, минификация, конвертация в YAML, XML, CSV и обратно.',
  keywords: ['json', 'yaml', 'xml', 'csv', 'formatter', 'валидатор', 'минификация', 'красиво'],
  render(root){
    const api = PT.textTool(root, {
      inputLabel: 'Исходные данные',
      outputLabel: 'Результат',
      placeholder: '{"name": "PixTool", "tools": 40}',
      downloadName: 'data.json',
      sample: '{"проект":"PixTool","версия":2,"инструменты":["json","qr","gif"],"офлайн":true}',
      form: [
        { id: 'from', type: 'select', label: 'Что на входе', col: 4, options: [
          ['auto', 'Определить автоматически'], ['json', 'JSON'], ['yaml', 'YAML'], ['csv', 'CSV']
        ] },
        { id: 'to', type: 'select', label: 'Во что превратить', col: 4, options: [
          ['pretty', 'JSON с отступами'], ['min', 'JSON в одну строку'], ['yaml', 'YAML'],
          ['xml', 'XML'], ['csv', 'CSV'], ['keys', 'Список всех путей']
        ] },
        { id: 'indent', type: 'select', label: 'Отступ', col: 4, value: '2', options: [['2', '2 пробела'], ['4', '4 пробела'], ['\t', 'Табуляция']] }
      ],
      run(text, v){
        let data;
        const from = v.from === 'auto' ? detect(text) : v.from;
        if (from === 'yaml') data = parseYaml(text);
        else if (from === 'csv') data = csvToObjects(text);
        else data = JSON.parse(text);

        const indent = v.indent === '\t' ? '\t' : Number(v.indent);
        const stats = summarize(data);
        if (v.to === 'pretty') return { text: JSON.stringify(data, null, indent), status: 'Валидный JSON · ' + stats };
        if (v.to === 'min'){
          const min = JSON.stringify(data);
          const saved = text.length ? Math.round((1 - min.length / text.length) * 100) : 0;
          return { text: min, status: `Сжато на ${saved}% · ${fmtBytes(min.length)}` };
        }
        if (v.to === 'yaml') return { text: toYaml(data), status: 'YAML готов · ' + stats };
        if (v.to === 'xml') return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(data, 'root'), status: 'XML готов' };
        if (v.to === 'csv'){
          const rows = Array.isArray(data) ? data : [data];
          if (typeof rows[0] !== 'object') throw new Error('В CSV можно превратить только массив объектов');
          return { text: objectsToCSV(rows), status: rows.length + ' строк' };
        }
        return { text: paths(data).join('\n'), status: paths(data).length + ' путей' };
      }
    });

    function detect(text){
      const t = text.trim();
      if (t.startsWith('{') || t.startsWith('[')) return 'json';
      if (/^[\w"']+\s*[,;]/.test(t.split('\n')[0]) && t.split('\n').length > 1 && !t.includes(': ')) return 'csv';
      return 'yaml';
    }
    function summarize(data){
      if (Array.isArray(data)) return data.length + ' элементов';
      if (data && typeof data === 'object') return Object.keys(data).length + ' ключей';
      return typeof data;
    }
    function paths(obj, prefix){
      prefix = prefix || '';
      const out = [];
      if (Array.isArray(obj)){
        obj.forEach((v, i) => out.push(...paths(v, `${prefix}[${i}]`)));
      } else if (obj && typeof obj === 'object'){
        Object.keys(obj).forEach(k => out.push(...paths(obj[k], prefix ? prefix + '.' + k : k)));
      } else {
        out.push(prefix + ' = ' + JSON.stringify(obj));
      }
      return out;
    }
  }
});

/* ======================================================================
   Base64
====================================================================== */
PT.tool({
  id: 'data-base64', cat: 'data', icon: '⧉',
  title: 'Base64 и Data URI',
  desc: 'Кодирует и декодирует текст, а любой файл превращает в data:-ссылку для вставки в код.',
  keywords: ['base64', 'data uri', 'кодирование', 'декодирование', 'btoa', 'atob', 'встроить'],
  render(root){
    PT.textTool(root, {
      inputLabel: 'Текст',
      outputLabel: 'Результат',
      sample: 'Привет, PixTool!',
      form: [
        { id: 'dir', type: 'select', label: 'Направление', col: 6, options: [['enc', 'Текст → Base64'], ['dec', 'Base64 → текст']] },
        { id: 'url', type: 'checkbox', label: 'URL-safe (- и _ вместо + и /)', col: 6 }
      ],
      run(text, v){
        if (v.dir === 'enc'){
          const bytes = new TextEncoder().encode(text);
          let bin = '';
          bytes.forEach(b => bin += String.fromCharCode(b));
          let out = btoa(bin);
          if (v.url) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          return { text: out, status: `${fmtBytes(bytes.length)} → ${fmtBytes(out.length)}` };
        }
        let src = text.trim().replace(/-/g, '+').replace(/_/g, '/');
        src = src.replace(/^data:[^,]+,/, '');
        while (src.length % 4) src += '=';
        const bin = atob(src);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { text: new TextDecoder().decode(bytes), status: 'Раскодировано ' + fmtBytes(bytes.length) };
      }
    });

    const fileOut = el('div');
    root.appendChild(ui.card([
      ui.h('Файл → Data URI', 'Картинки и шрифты, встроенные прямо в CSS или HTML'),
      ui.drop({
        title: 'Перетащи файл', hint: 'до ~5 МБ — иначе строка будет неподъёмной',
        onFiles: async files => {
          const file = files[0];
          const dataUrl = await readDataURL(file);
          fileOut.innerHTML = '';
          fileOut.appendChild(ui.kv([
            ['Файл', file.name],
            ['Размер', fmtBytes(file.size)],
            ['Длина строки', fmtNum(dataUrl.length, 0) + ' символов (+' + Math.round(dataUrl.length / file.size * 100 - 100) + '%)']
          ]));
          fileOut.appendChild(ui.spacer(12));
          fileOut.appendChild(ui.copyBox(dataUrl, { label: 'Data URI', rows: 6 }));
          if (file.type.startsWith('image/')){
            fileOut.appendChild(ui.spacer(12));
            fileOut.appendChild(ui.copyBox(`background-image: url("${dataUrl.slice(0, 60)}…");`,
              { label: 'Пример для CSS (полная строка — выше)', rows: 2 }));
          }
        }
      }),
      fileOut
    ]));
  }
});

/* ======================================================================
   Хэши и контрольные суммы
====================================================================== */
PT.tool({
  id: 'data-hash', cat: 'data', icon: '#',
  title: 'Хэши и контрольные суммы',
  desc: 'MD5, SHA-1, SHA-256, SHA-512 и CRC32 для текста и файлов любого размера.',
  keywords: ['хэш', 'hash', 'md5', 'sha256', 'sha1', 'crc32', 'контрольная сумма', 'checksum'],
  render(root){
    const textOut = el('div');
    const textIn = el('textarea', { rows: 5, placeholder: 'Текст для хэширования…', spellcheck: 'false' });

    async function hashBytes(bytes){
      const out = {};
      out['CRC32'] = crc32(bytes).toString(16).padStart(8, '0');
      out['MD5'] = toHex(md5(bytes));
      for (const algo of ['SHA-1', 'SHA-256', 'SHA-512']){
        try {
          const digest = await crypto.subtle.digest(algo, bytes);
          out[algo] = toHex(new Uint8Array(digest));
        } catch(e){ out[algo] = 'недоступно (нужен https или localhost)'; }
      }
      return out;
    }
    function showHashes(target, map, extra){
      target.innerHTML = '';
      if (extra) target.appendChild(ui.kv(extra));
      target.appendChild(ui.spacer(10));
      Object.entries(map).forEach(([algo, value]) => {
        target.appendChild(ui.copyBox(value, { label: algo, rows: value.length > 70 ? 2 : 1 }));
      });
    }

    const recalc = debounce(async () => {
      if (!textIn.value){ textOut.innerHTML = ''; return; }
      const bytes = new TextEncoder().encode(textIn.value);
      showHashes(textOut, await hashBytes(bytes), [['Символов', textIn.value.length], ['Байт (UTF-8)', bytes.length]]);
    }, 250);
    textIn.addEventListener('input', recalc);

    root.appendChild(ui.card([ui.h('Текст'), textIn, ui.spacer(12), textOut]));

    const fileOut = el('div');
    const compareIn = el('input', { type: 'text', placeholder: 'Вставь эталонную сумму для проверки…' });
    let lastHashes = null;
    compareIn.addEventListener('input', () => {
      if (!lastHashes) return;
      const val = compareIn.value.trim().toLowerCase();
      if (!val){ compareResult.textContent = ''; return; }
      const match = Object.entries(lastHashes).find(([, v]) => v === val);
      compareResult.className = 'status-line ' + (match ? 'ok' : 'err');
      compareResult.textContent = match ? '✓ Совпадает с ' + match[0] + ' — файл не повреждён' : '✕ Ни один хэш не совпал';
    });
    const compareResult = ui.status();

    root.appendChild(ui.card([
      ui.h('Файл', 'Считается потоком — работает и с большими файлами'),
      ui.drop({
        title: 'Перетащи файл',
        onFiles: async files => {
          const file = files[0];
          fileOut.innerHTML = '';
          const status = ui.status().busy('Считаю хэши');
          fileOut.appendChild(status);
          const bytes = new Uint8Array(await file.arrayBuffer());
          lastHashes = await hashBytes(bytes);
          showHashes(fileOut, lastHashes, [['Файл', file.name], ['Размер', fmtBytes(file.size)]]);
        }
      }),
      fileOut,
      ui.spacer(12),
      el('label', { text: 'Сверить с эталоном' }), compareIn, compareResult
    ]));
  }
});

/* ======================================================================
   JWT
====================================================================== */
PT.tool({
  id: 'data-jwt', cat: 'data', icon: '⚿',
  title: 'JWT-декодер',
  desc: 'Разбирает токен на заголовок и полезную нагрузку, показывает срок действия.',
  keywords: ['jwt', 'токен', 'token', 'jose', 'авторизация', 'bearer'],
  render(root){
    const status = ui.status();
    const out = el('div');
    const input = el('textarea', { rows: 5, placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', spellcheck: 'false' });

    function decodePart(part){
      let s = part.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    const parse = debounce(() => {
      out.innerHTML = '';
      const token = input.value.trim().replace(/^Bearer\s+/i, '');
      if (!token) { status.set(''); return; }
      const parts = token.split('.');
      if (parts.length < 2){ status.err('Это не похоже на JWT: нужно минимум две части через точку'); return; }
      try{
        const header = decodePart(parts[0]);
        const payload = decodePart(parts[1]);
        out.appendChild(ui.copyBox(JSON.stringify(header, null, 2), { label: 'Заголовок', rows: 5 }));
        out.appendChild(ui.spacer(12));
        out.appendChild(ui.copyBox(JSON.stringify(payload, null, 2), { label: 'Полезная нагрузка', rows: 10 }));

        const rows = [];
        const now = Date.now() / 1000;
        if (payload.exp){
          const left = payload.exp - now;
          rows.push(['Истекает', new Date(payload.exp * 1000).toLocaleString('ru-RU') +
            (left > 0 ? ` (через ${fmtDuration(left)})` : ' — ПРОСРОЧЕН')]);
        }
        if (payload.iat) rows.push(['Выдан', new Date(payload.iat * 1000).toLocaleString('ru-RU')]);
        if (payload.nbf) rows.push(['Действует с', new Date(payload.nbf * 1000).toLocaleString('ru-RU')]);
        if (payload.sub) rows.push(['Субъект (sub)', payload.sub]);
        if (payload.iss) rows.push(['Издатель (iss)', payload.iss]);
        rows.push(['Алгоритм', header.alg || '—']);
        rows.push(['Подпись', parts[2] ? parts[2].slice(0, 24) + '…' : 'отсутствует']);
        out.appendChild(ui.spacer(12));
        out.appendChild(ui.kv(rows));
        const expired = payload.exp && payload.exp < now;
        status.set(expired ? 'Токен разобран, но срок действия истёк' : 'Токен разобран', expired ? 'err' : 'ok');
      } catch(err){
        status.err('Не удалось разобрать: ' + err.message);
      }
    }, 200);
    input.addEventListener('input', parse);

    root.appendChild(ui.card([
      el('label', { text: 'Токен' }), input, status,
      ui.spacer(10),
      ui.muted('Подпись здесь не проверяется — для этого нужен секретный ключ, который нельзя вставлять в чужие сервисы. ' +
               'Декодирование идёт локально, токен никуда не отправляется.')
    ]));
    root.appendChild(out);
  }
});

/* ======================================================================
   Генератор идентификаторов
====================================================================== */
PT.tool({
  id: 'data-uuid', cat: 'data', icon: '⁙',
  title: 'UUID и идентификаторы',
  desc: 'UUID v4, ULID, короткие ID и произвольные ключи пачками по 1–1000 штук.',
  keywords: ['uuid', 'guid', 'ulid', 'nanoid', 'идентификатор', 'ключ', 'id'],
  render(root){
    const out = ui.copyBox('', { label: 'Результат', rows: 12 });
    const form = ui.form([
      { id: 'type', type: 'select', label: 'Тип', col: 4, options: [
        ['uuid4', 'UUID v4 (случайный)'], ['ulid', 'ULID (сортируемый по времени)'],
        ['nano', 'Короткий ID (21 символ)'], ['hex', 'HEX-ключ'], ['num', 'Числовой ID']
      ] },
      { id: 'count', type: 'number', label: 'Сколько', col: 4, value: 10, min: 1, max: 1000 },
      { id: 'len', type: 'number', label: 'Длина (для HEX/числовых)', col: 4, value: 32, min: 4, max: 128 },
      { id: 'upper', type: 'checkbox', label: 'Верхний регистр', col: 4 },
      { id: 'braces', type: 'checkbox', label: 'В фигурных скобках {…}', col: 4 },
      { id: 'quotes', type: 'checkbox', label: 'В кавычках с запятыми (для кода)', col: 4 }
    ], generate);

    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    function ulid(){
      let time = Date.now(), timePart = '';
      for (let i = 9; i >= 0; i--){ timePart = ALPHABET[time % 32] + timePart; time = Math.floor(time / 32); }
      const rnd = crypto.getRandomValues(new Uint8Array(16));
      let randPart = '';
      for (let i = 0; i < 16; i++) randPart += ALPHABET[rnd[i] % 32];
      return timePart + randPart;
    }
    function nano(size){
      const chars = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
      const bytes = crypto.getRandomValues(new Uint8Array(size || 21));
      return Array.from(bytes).map(b => chars[b % chars.length]).join('');
    }
    function generate(){
      const v = form.values();
      const list = [];
      for (let i = 0; i < clamp(v.count, 1, 1000); i++){
        let id;
        if (v.type === 'uuid4') id = crypto.randomUUID ? crypto.randomUUID() : manualUuid();
        else if (v.type === 'ulid') id = ulid();
        else if (v.type === 'nano') id = nano(21);
        else if (v.type === 'hex') id = toHex(crypto.getRandomValues(new Uint8Array(Math.ceil(v.len / 2)))).slice(0, v.len);
        else {
          const digits = crypto.getRandomValues(new Uint32Array(Math.ceil(v.len / 9)));
          id = Array.from(digits).map(d => String(d)).join('').slice(0, v.len);
        }
        if (v.upper) id = id.toUpperCase();
        if (v.braces) id = '{' + id + '}';
        if (v.quotes) id = '"' + id + '",';
        list.push(id);
      }
      out.setValue(list.join('\n'));
    }
    function manualUuid(){
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = toHex(b);
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }

    root.appendChild(ui.card([
      form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Сгенерировать', generate),
        ui.btn('Скачать списком', () => downloadText(out.getValue(), 'ids.txt'), { ghost: true, small: true })
      ]),
      ui.spacer(14), out
    ]));
    generate();
  }
});

/* ======================================================================
   Шифрование текста и файлов
====================================================================== */
PT.tool({
  id: 'data-crypto', cat: 'data', icon: '⌾',
  title: 'Шифрование паролем',
  desc: 'AES-256-GCM для текста и файлов: ключ выводится из пароля через PBKDF2, всё локально.',
  keywords: ['шифрование', 'aes', 'пароль', 'зашифровать', 'расшифровать', 'секрет', 'приватность'],
  render(root){
    const status = ui.status();
    const passIn = el('input', { type: 'password', placeholder: 'Надёжный пароль' });
    const textIn = el('textarea', { rows: 7, placeholder: 'Текст для шифрования или строка PIXTOOL1:…', spellcheck: 'false' });
    const textOut = ui.copyBox('', { label: 'Результат', rows: 7 });

    async function deriveKey(pass, salt){
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    }
    async function encryptBytes(bytes, pass){
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pass, salt);
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
      const out = new Uint8Array(8 + 16 + 12 + cipher.length);
      out.set(new TextEncoder().encode('PIXTOOL1'), 0);
      out.set(salt, 8); out.set(iv, 24); out.set(cipher, 36);
      return out;
    }
    async function decryptBytes(bytes, pass){
      const magic = new TextDecoder().decode(bytes.slice(0, 8));
      if (magic !== 'PIXTOOL1') throw new Error('Это не файл PixTool или он повреждён');
      const key = await deriveKey(pass, bytes.slice(8, 24));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(24, 36) }, key, bytes.slice(36));
      return new Uint8Array(plain);
    }
    function checkPass(){
      if (!passIn.value){ status.err('Введи пароль'); return false; }
      if (passIn.value.length < 6) PT.toast('Короткий пароль легко подобрать', 'err');
      return true;
    }

    root.appendChild(ui.card([
      ui.h('Пароль', 'Без него расшифровать нельзя — восстановить невозможно'),
      passIn,
      ui.spacer(16),
      ui.h('Текст'),
      textIn, ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Зашифровать', async () => {
          if (!checkPass()) return;
          const bytes = await encryptBytes(new TextEncoder().encode(textIn.value), passIn.value);
          let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
          textOut.setValue('PIXTOOL1:' + btoa(bin));
          status.ok('Зашифровано — скопируй строку целиком');
        }),
        ui.btn('Расшифровать', async () => {
          if (!checkPass()) return;
          try{
            const raw = textIn.value.trim().replace(/^PIXTOOL1:/, '');
            const bin = atob(raw);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const plain = await decryptBytes(bytes, passIn.value);
            textOut.setValue(new TextDecoder().decode(plain));
            status.ok('Расшифровано');
          } catch(e){ status.err('Не удалось расшифровать — неверный пароль или повреждённые данные'); }
        }, { ghost: true })
      ]),
      ui.spacer(14), textOut, status
    ]));

    root.appendChild(ui.card([
      ui.h('Файлы', 'Зашифрованный файл получает расширение .pixenc'),
      ui.drop({
        title: 'Перетащи файл для шифрования или .pixenc для расшифровки',
        onFiles: async files => {
          if (!checkPass()) return;
          const file = files[0];
          const bytes = new Uint8Array(await file.arrayBuffer());
          try{
            if (file.name.endsWith('.pixenc')){
              status.busy('Расшифровываю');
              const plain = await decryptBytes(bytes, passIn.value);
              downloadBlob(new Blob([plain]), file.name.replace(/\.pixenc$/, ''));
              status.ok('Файл расшифрован');
            } else {
              status.busy('Шифрую');
              const enc = await encryptBytes(bytes, passIn.value);
              downloadBlob(new Blob([enc]), file.name + '.pixenc');
              status.ok('Файл зашифрован: ' + fmtBytes(enc.length));
            }
          } catch(e){ status.err('Не удалось: неверный пароль или файл повреждён'); }
        }
      }),
      ui.spacer(10),
      ui.muted('Алгоритм: AES-256-GCM, ключ из пароля через PBKDF2-SHA256 (250 000 итераций). ' +
               'Всё считает браузер — ни пароль, ни данные никуда не уходят.')
    ]));
  }
});


/* ===== tools/31-text.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: ДАННЫЕ И КОД (часть 2) — текст, время, числа
====================================================================== */

/* ======================================================================
   Текстовые операции
====================================================================== */
PT.tool({
  id: 'text-tools', cat: 'data', icon: '¶',
  title: 'Операции над текстом',
  desc: 'Регистр, сортировка, дубликаты, нумерация, транслитерация, обрезка пробелов и статистика.',
  keywords: ['текст', 'регистр', 'camelcase', 'сортировка', 'дубликаты', 'транслит', 'слова', 'строки'],
  render(root){
    const stats = el('div');
    const api = PT.textTool(root, {
      inputLabel: 'Исходный текст',
      outputLabel: 'Результат',
      sample: 'Привет, мир\nПривет, PixTool\nпривет, мир\n  лишние пробелы  ',
      downloadName: 'text.txt',
      form: [
        { id: 'op', type: 'select', label: 'Операция', col: 6, options: [
          ['upper', 'ВЕРХНИЙ РЕГИСТР'], ['lower', 'нижний регистр'], ['title', 'Каждое Слово С Большой'],
          ['sentence', 'Как в предложении'], ['camel', 'camelCase'], ['pascal', 'PascalCase'],
          ['snake', 'snake_case'], ['kebab', 'kebab-case'], ['const', 'CONSTANT_CASE'],
          ['sort', 'Сортировать строки'], ['rsort', 'Сортировать в обратном порядке'],
          ['shuffle', 'Перемешать строки'], ['uniq', 'Убрать дубликаты строк'],
          ['reverse', 'Перевернуть порядок строк'], ['revchars', 'Перевернуть символы'],
          ['trim', 'Убрать лишние пробелы'], ['nospace', 'Убрать все пробелы'],
          ['numbered', 'Пронумеровать строки'], ['noempty', 'Убрать пустые строки'],
          ['translit', 'Транслитерация в латиницу'], ['slug', 'Ссылка-слаг (URL)'],
          ['escape', 'Экранировать HTML'], ['unescape', 'Раскодировать HTML'],
          ['wrap', 'Обернуть каждую строку'], ['join', 'Склеить строки через разделитель']
        ] },
        { id: 'extra', type: 'text', label: 'Разделитель / обёртка', col: 3, value: ', ' },
        { id: 'ci', type: 'checkbox', label: 'Игнорировать регистр при сортировке', col: 3, value: true }
      ],
      run(text, v){
        const lines = text.split('\n');
        const words = w => w.replace(/[_\-]+/g, ' ').replace(/([a-zа-я])([A-ZА-Я])/g, '$1 $2')
                            .split(/\s+/).filter(Boolean);
        let out;
        switch (v.op){
          case 'upper': out = text.toUpperCase(); break;
          case 'lower': out = text.toLowerCase(); break;
          case 'title': out = text.replace(/\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); break;
          case 'sentence': out = text.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toUpperCase()); break;
          case 'camel': out = words(text).map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(''); break;
          case 'pascal': out = words(text).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(''); break;
          case 'snake': out = words(text).map(w => w.toLowerCase()).join('_'); break;
          case 'kebab': out = words(text).map(w => w.toLowerCase()).join('-'); break;
          case 'const': out = words(text).map(w => w.toUpperCase()).join('_'); break;
          case 'sort': out = lines.slice().sort((a, b) => (v.ci ? a.toLowerCase() : a).localeCompare(v.ci ? b.toLowerCase() : b, 'ru', { numeric: true })).join('\n'); break;
          case 'rsort': out = lines.slice().sort((a, b) => (v.ci ? b.toLowerCase() : b).localeCompare(v.ci ? a.toLowerCase() : a, 'ru', { numeric: true })).join('\n'); break;
          case 'shuffle': { const a = lines.slice();
            for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
            out = a.join('\n'); break; }
          case 'uniq': { const seen = new Set(); out = lines.filter(l => {
            const k = v.ci ? l.trim().toLowerCase() : l.trim();
            if (seen.has(k)) return false; seen.add(k); return true;
          }).join('\n'); break; }
          case 'reverse': out = lines.slice().reverse().join('\n'); break;
          case 'revchars': out = Array.from(text).reverse().join(''); break;
          case 'trim': out = lines.map(l => l.trim().replace(/\s+/g, ' ')).join('\n'); break;
          case 'nospace': out = text.replace(/\s+/g, ''); break;
          case 'numbered': out = lines.map((l, i) => `${String(i + 1).padStart(String(lines.length).length, ' ')}. ${l}`).join('\n'); break;
          case 'noempty': out = lines.filter(l => l.trim()).join('\n'); break;
          case 'translit': out = translit(text); break;
          case 'slug': out = translit(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); break;
          case 'escape': out = esc(text); break;
          case 'unescape': { const d = document.createElement('textarea'); d.innerHTML = text; out = d.value; break; }
          case 'wrap': out = lines.map(l => l.trim() ? v.extra + l + v.extra : l).join('\n'); break;
          case 'join': out = lines.filter(l => l.trim()).join(v.extra); break;
          default: out = text;
        }
        showStats(text, out);
        return out;
      }
    });

    function translit(s){
      const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
        н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',
        э:'e',ю:'yu',я:'ya' };
      return s.replace(/[а-яё]/gi, ch => {
        const lower = ch.toLowerCase();
        const rep = map[lower] || ch;
        return ch === lower ? rep : rep.charAt(0).toUpperCase() + rep.slice(1);
      });
    }
    function showStats(input, output){
      const words = input.trim() ? input.trim().split(/\s+/).length : 0;
      const lines = input ? input.split('\n').length : 0;
      const chars = input.length;
      const noSpace = input.replace(/\s/g, '').length;
      const readMin = Math.max(1, Math.round(words / 180));
      stats.innerHTML = '';
      stats.appendChild(ui.kv([
        ['Символов', fmtNum(chars, 0)],
        ['Без пробелов', fmtNum(noSpace, 0)],
        ['Слов', fmtNum(words, 0)],
        ['Строк', fmtNum(lines, 0)],
        ['Абзацев', fmtNum(input.split(/\n\s*\n/).filter(p => p.trim()).length, 0)],
        ['Время чтения', '≈ ' + readMin + ' мин'],
        ['Размер в UTF-8', fmtBytes(new TextEncoder().encode(input).length)],
        ['В результате символов', fmtNum(output.length, 0)]
      ]));
    }
    root.appendChild(ui.card([ui.h('Статистика'), stats]));
    showStats('', '');
  }
});

/* ======================================================================
   Сравнение текстов
====================================================================== */
PT.tool({
  id: 'text-diff', cat: 'data', icon: '⇹',
  title: 'Сравнение текстов',
  desc: 'Построчный diff двух версий с подсветкой добавленных и удалённых строк.',
  keywords: ['diff', 'сравнить', 'различия', 'версии', 'патч', 'изменения'],
  render(root){
    const a = el('textarea', { rows: 14, placeholder: 'Версия A…', spellcheck: 'false' });
    const b = el('textarea', { rows: 14, placeholder: 'Версия B…', spellcheck: 'false' });
    const out = el('div', { class: 'code-out', style: { maxHeight: '520px' } });
    const status = ui.status();
    const form = ui.form([
      { id: 'trim', type: 'checkbox', label: 'Игнорировать пробелы по краям', col: 4, value: true },
      { id: 'ci', type: 'checkbox', label: 'Игнорировать регистр', col: 4 },
      { id: 'ctx', type: 'checkbox', label: 'Показывать только изменения', col: 4 }
    ], () => run());

    function lcsDiff(left, right){
      const n = left.length, m = right.length;
      if (n * m > 4000000) return null;              // защита от гигантских текстов
      const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      const res = [];
      let i = 0, j = 0;
      while (i < n && j < m){
        if (left[i] === right[j]){ res.push(['=', left[i]]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]){ res.push(['-', left[i]]); i++; }
        else { res.push(['+', right[j]]); j++; }
      }
      while (i < n) res.push(['-', left[i++]]);
      while (j < m) res.push(['+', right[j++]]);
      return res;
    }

    function run(){
      const v = form.values();
      const norm = s => { let x = s; if (v.trim) x = x.trim(); if (v.ci) x = x.toLowerCase(); return x; };
      const linesA = a.value.split('\n'), linesB = b.value.split('\n');
      const diff = lcsDiff(linesA.map(norm), linesB.map(norm));
      if (!diff){ status.err('Тексты слишком большие для построчного сравнения'); return; }
      let added = 0, removed = 0;
      out.innerHTML = '';
      let ai = 0, bi = 0;
      diff.forEach(([type, line]) => {
        let display, color, prefix, num;
        if (type === '='){ display = linesA[ai]; ai++; bi++; prefix = ' '; color = 'var(--dim)'; num = ai; }
        else if (type === '-'){ display = linesA[ai]; ai++; removed++; prefix = '−'; color = 'var(--danger)'; num = ai; }
        else { display = linesB[bi]; bi++; added++; prefix = '+'; color = 'var(--teal)'; num = bi; }
        if (v.ctx && type === '=') return;
        out.appendChild(el('div', { style: { color, whiteSpace: 'pre-wrap' } },
          `${String(num).padStart(4, ' ')} ${prefix} ${display}`));
      });
      const same = diff.filter(d => d[0] === '=').length;
      status.set(`Добавлено: ${added} · удалено: ${removed} · без изменений: ${same}`,
        added || removed ? 'err' : 'ok');
    }

    a.addEventListener('input', debounce(run, 300));
    b.addEventListener('input', debounce(run, 300));

    root.appendChild(ui.card([
      form, ui.spacer(12),
      el('div', { class: 'split' }, [
        el('div', {}, [el('label', { text: 'Версия A (старая)' }), a]),
        el('div', {}, [el('label', { text: 'Версия B (новая)' }), b])
      ]),
      ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Сравнить', run),
        ui.btn('Поменять местами', () => { const t = a.value; a.value = b.value; b.value = t; run(); }, { ghost: true, small: true }),
        ui.btn('Скачать отчёт', () => downloadText(out.textContent, 'diff.txt'), { ghost: true, small: true })
      ]),
      status
    ]));
    root.appendChild(ui.card([ui.h('Различия'), out]));
  }
});

/* ======================================================================
   Регулярные выражения
====================================================================== */
PT.tool({
  id: 'text-regex', cat: 'data', icon: '.*',
  title: 'Тестер регулярных выражений',
  desc: 'Подсветка совпадений, группы, замена и готовые шаблоны для почты, телефонов и дат.',
  keywords: ['regex', 'регулярка', 'regexp', 'поиск', 'замена', 'шаблон', 'match'],
  render(root){
    const patternIn = el('input', { type: 'text', spellcheck: 'false',
      placeholder: '\\b\\w+@\\w+\\.\\w+\\b', value: '[\\w.+-]+@[\\w-]+\\.[\\w.]+' });
    const flagsIn = el('input', { type: 'text', value: 'gim', placeholder: 'gimsuy' });
    const replaceIn = el('input', { type: 'text', placeholder: 'Строка замены, например $1' });
    const textIn = el('textarea', { rows: 10, spellcheck: 'false',
      value: 'Напиши на mail@pixset.dev или support@example.com\nТелефон: +7 999 123-45-67\nДата релиза: 2026-08-08' });
    const highlight = el('div', { class: 'code-out' });
    const groupsOut = el('div');
    const replaceOut = ui.copyBox('', { label: 'После замены', rows: 5 });
    const status = ui.status();

    const PRESETS = [
      ['E-mail', '[\\w.+-]+@[\\w-]+\\.[\\w.]+'],
      ['Телефон РФ', '(?:\\+7|8)[\\s(-]*\\d{3}[\\s)-]*\\d{3}[\\s-]*\\d{2}[\\s-]*\\d{2}'],
      ['URL', 'https?://[^\\s"\'<>]+'],
      ['Дата ISO', '\\d{4}-\\d{2}-\\d{2}'],
      ['HEX-цвет', '#(?:[0-9a-fA-F]{3}){1,2}\\b'],
      ['IP-адрес', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b'],
      ['Теги HTML', '<[^>]+>'],
      ['Числа', '-?\\d+(?:[.,]\\d+)?'],
      ['Кириллица', '[А-Яа-яЁё]+']
    ];

    function run(){
      const pattern = patternIn.value;
      groupsOut.innerHTML = '';
      if (!pattern){ highlight.textContent = textIn.value; status.set(''); return; }
      let re;
      try { re = new RegExp(pattern, flagsIn.value); }
      catch(err){ status.err('Ошибка в выражении: ' + err.message); return; }
      const text = textIn.value;
      const matches = [];
      if (re.global){
        let m; re.lastIndex = 0;
        let guard = 0;
        while ((m = re.exec(text)) !== null && guard++ < 10000){
          matches.push(m);
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        const m = re.exec(text);
        if (m) matches.push(m);
      }

      highlight.innerHTML = '';
      let last = 0;
      matches.forEach(m => {
        highlight.appendChild(document.createTextNode(text.slice(last, m.index)));
        highlight.appendChild(el('mark', {
          style: { background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: '3px', padding: '0 2px' },
          text: m[0]
        }));
        last = m.index + m[0].length;
      });
      highlight.appendChild(document.createTextNode(text.slice(last)));

      if (matches.length){
        const rows = matches.slice(0, 40).map((m, i) => {
          const groups = m.slice(1).map((g, gi) => `$${gi + 1}=${g === undefined ? '—' : g}`).join('  ');
          return ['#' + (i + 1) + ' поз. ' + m.index, m[0] + (groups ? '   ' + groups : '')];
        });
        groupsOut.appendChild(ui.kv(rows));
        if (matches.length > 40) groupsOut.appendChild(ui.muted('Показаны первые 40 из ' + matches.length));
      }
      try { replaceOut.setValue(text.replace(re, replaceIn.value)); } catch(e){}
      status.set(matches.length ? `Найдено совпадений: ${matches.length}` : 'Совпадений нет',
        matches.length ? 'ok' : '');
    }

    [patternIn, flagsIn, replaceIn, textIn].forEach(node => node.addEventListener('input', debounce(run, 200)));

    root.appendChild(ui.card([
      el('div', { class: 'pillbar' }, PRESETS.map(([label, p]) =>
        el('button', { class: 'pill', type: 'button', text: label, onclick: () => { patternIn.value = p; run(); } }))),
      el('div', { class: 'grid cols-3' }, [
        el('div', {}, [el('label', { text: 'Выражение' }), patternIn]),
        el('div', {}, [el('label', { text: 'Флаги' }), flagsIn]),
        el('div', {}, [el('label', { text: 'Замена' }), replaceIn])
      ]),
      ui.spacer(14),
      el('label', { text: 'Текст' }), textIn,
      status
    ]));
    root.appendChild(ui.card([ui.h('Совпадения'), highlight, ui.spacer(12), groupsOut, ui.spacer(12), replaceOut]));
    run();
  }
});

/* ======================================================================
   Дата и время
====================================================================== */
PT.tool({
  id: 'data-datetime', cat: 'data', icon: '◷',
  title: 'Дата, время и таймстемпы',
  desc: 'Unix-время в дату и обратно, разница между датами, часовые пояса и форматы.',
  keywords: ['время', 'дата', 'timestamp', 'unix', 'iso', 'часовой пояс', 'таймстемп', 'разница дат'],
  render(root){
    const nowBox = el('div');
    const tsIn = el('input', { type: 'text', placeholder: '1786291200 или 2026-08-08T12:00:00Z' });
    const tsOut = el('div');
    const status = ui.status();

    function paintNow(){
      const now = new Date();
      nowBox.innerHTML = '';
      nowBox.appendChild(ui.kv([
        ['Сейчас (локально)', now.toLocaleString('ru-RU')],
        ['Unix (секунды)', Math.floor(now.getTime() / 1000)],
        ['Unix (миллисекунды)', now.getTime()],
        ['ISO 8601 (UTC)', now.toISOString()],
        ['Часовой пояс', Intl.DateTimeFormat().resolvedOptions().timeZone + ' (UTC' +
          (now.getTimezoneOffset() > 0 ? '-' : '+') + Math.abs(now.getTimezoneOffset() / 60) + ')'],
        ['День года', Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)],
        ['Неделя года', Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7)]
      ]));
    }
    paintNow();
    const timer = setInterval(paintNow, 1000);
    PT.onCleanup(() => clearInterval(timer));

    function convert(){
      const raw = tsIn.value.trim();
      tsOut.innerHTML = '';
      if (!raw){ status.set(''); return; }
      let date;
      if (/^\d{9,10}$/.test(raw)) date = new Date(Number(raw) * 1000);
      else if (/^\d{12,14}$/.test(raw)) date = new Date(Number(raw));
      else date = new Date(raw);
      if (isNaN(date.getTime())){ status.err('Не удалось разобрать дату'); return; }
      const zones = ['UTC', 'Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Asia/Novosibirsk',
                     'Asia/Vladivostok', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'];
      const rows = [
        ['Локально', date.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'medium' })],
        ['ISO 8601', date.toISOString()],
        ['Unix (сек)', Math.floor(date.getTime() / 1000)],
        ['Unix (мс)', date.getTime()],
        ['RFC 2822', date.toUTCString()],
        ['Относительно сейчас', relative(date)]
      ];
      zones.forEach(tz => {
        try { rows.push([tz, date.toLocaleString('ru-RU', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })]); }
        catch(e){}
      });
      tsOut.appendChild(ui.kv(rows));
      status.ok('Разобрано');
    }
    function relative(date){
      const diff = (date.getTime() - Date.now()) / 1000;
      const abs = Math.abs(diff);
      const units = [[31536000, 'г.'], [2592000, 'мес.'], [86400, 'дн.'], [3600, 'ч.'], [60, 'мин.'], [1, 'сек.']];
      for (const [sec, label] of units){
        if (abs >= sec) return (diff > 0 ? 'через ' : '') + Math.round(abs / sec) + ' ' + label + (diff < 0 ? ' назад' : '');
      }
      return 'только что';
    }
    tsIn.addEventListener('input', debounce(convert, 200));

    // разница между датами
    const d1 = el('input', { type: 'datetime-local' });
    const d2 = el('input', { type: 'datetime-local' });
    const diffOut = el('div');
    function calcDiff(){
      if (!d1.value || !d2.value){ diffOut.innerHTML = ''; return; }
      const a = new Date(d1.value), b = new Date(d2.value);
      const ms = Math.abs(b - a);
      const days = ms / 86400000;
      diffOut.innerHTML = '';
      diffOut.appendChild(ui.kv([
        ['Дней', fmtNum(days, 2)],
        ['Часов', fmtNum(ms / 3600000, 1)],
        ['Минут', fmtNum(ms / 60000, 0)],
        ['Секунд', fmtNum(ms / 1000, 0)],
        ['Рабочих дней (пн–пт)', String(workdays(a < b ? a : b, a < b ? b : a))],
        ['Недель', fmtNum(days / 7, 1)]
      ]));
    }
    function workdays(from, to){
      let count = 0;
      const cur = new Date(from);
      cur.setHours(0, 0, 0, 0);
      while (cur <= to){
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }
    [d1, d2].forEach(n => n.addEventListener('change', calcDiff));

    root.appendChild(ui.card([ui.h('Прямо сейчас'), nowBox, ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Копировать Unix-время', () => copy(String(Math.floor(Date.now() / 1000))), { ghost: true, small: true }),
        ui.btn('Копировать ISO', () => copy(new Date().toISOString()), { ghost: true, small: true })
      ])]));
    root.appendChild(ui.card([
      ui.h('Разобрать дату', 'Unix-время в секундах или миллисекундах, ISO, любой понятный браузеру формат'),
      tsIn, status, ui.spacer(12), tsOut
    ]));
    root.appendChild(ui.card([
      ui.h('Разница между датами'),
      el('div', { class: 'grid cols-2' }, [
        el('div', {}, [el('label', { text: 'Дата A' }), d1]),
        el('div', {}, [el('label', { text: 'Дата B' }), d2])
      ]),
      ui.spacer(12), diffOut
    ]));
  }
});

/* ======================================================================
   Системы счисления
====================================================================== */
PT.tool({
  id: 'data-numbers', cat: 'data', icon: '⑂',
  title: 'Системы счисления и биты',
  desc: 'Перевод между 2, 8, 10, 16 и любой другой базой плюс побитовые операции.',
  keywords: ['двоичный', 'hex', 'шестнадцатеричный', 'binary', 'октальный', 'биты', 'конвертер чисел'],
  render(root){
    const fields = {};
    const bases = [['bin', 2, 'Двоичная (2)'], ['oct', 8, 'Восьмеричная (8)'], ['dec', 10, 'Десятичная (10)'],
                   ['hex', 16, 'Шестнадцатеричная (16)'], ['b36', 36, 'Base36']];
    const status = ui.status();
    const bitsOut = el('div');

    const grid = el('div', { class: 'grid cols-2' });
    bases.forEach(([id, base, label]) => {
      const input = el('input', { type: 'text', spellcheck: 'false' });
      fields[id] = { input, base };
      input.addEventListener('input', () => sync(id));
      grid.appendChild(el('div', {}, [el('label', { text: label }), input]));
    });
    const customBase = el('input', { type: 'number', value: 5, min: 2, max: 36 });
    const customOut = el('input', { type: 'text', readonly: true });
    customBase.addEventListener('input', () => sync('dec', true));

    function sync(sourceId, keep){
      const src = fields[sourceId];
      const raw = src.input.value.trim().replace(/\s/g, '');
      if (!raw){ Object.keys(fields).forEach(k => { if (k !== sourceId) fields[k].input.value = ''; }); bitsOut.innerHTML = ''; return; }
      let value;
      try{
        value = parseInt(raw, src.base);
        if (isNaN(value)) throw new Error('нечисло');
      } catch(e){ status.err('Не число для этой системы'); return; }
      if (!isFinite(value)){ status.err('Слишком большое число'); return; }
      Object.entries(fields).forEach(([id, f]) => {
        if (id !== sourceId || keep) f.input.value = value.toString(f.base).toUpperCase();
      });
      customOut.value = value.toString(clamp(Number(customBase.value) || 5, 2, 36)).toUpperCase();
      status.ok('Число: ' + fmtNum(value, 0));

      const int = value >>> 0;
      bitsOut.innerHTML = '';
      bitsOut.appendChild(ui.kv([
        ['32-битное двоичное', int.toString(2).padStart(32, '0').replace(/(.{8})/g, '$1 ').trim()],
        ['Байт', Math.ceil(Math.max(1, value).toString(2).length / 8)],
        ['Инверсия (~n)', String(~value)],
        ['Сдвиг влево (n<<1)', String(value << 1)],
        ['Сдвиг вправо (n>>1)', String(value >> 1)],
        ['Единичных битов', String(int.toString(2).split('1').length - 1)],
        ['Как размер данных', fmtBytes(value)],
        ['Как цвет', value <= 0xFFFFFF ? '#' + int.toString(16).padStart(6, '0') : '—']
      ]));
    }

    root.appendChild(ui.card([
      grid, ui.spacer(14),
      el('div', { class: 'grid cols-2' }, [
        el('div', {}, [el('label', { text: 'Своя система счисления (2–36)' }), customBase]),
        el('div', {}, [el('label', { text: 'Результат' }), customOut])
      ]),
      status
    ]));
    root.appendChild(ui.card([ui.h('Битовое представление'), bitsOut]));
    fields.dec.input.value = '255';
    sync('dec');
  }
});

/* ======================================================================
   URL
====================================================================== */
PT.tool({
  id: 'data-url', cat: 'data', icon: '⇢',
  title: 'URL: кодирование и разбор',
  desc: 'Кодирует и раскодирует ссылки, разбирает параметры запроса и собирает их обратно.',
  keywords: ['url', 'urlencode', 'percent', 'query', 'параметры', 'utm', 'ссылка'],
  render(root){
    PT.textTool(root, {
      inputLabel: 'Ссылка или текст',
      outputLabel: 'Результат',
      sample: 'https://pixset.dev/поиск?q=привет мир&utm_source=telegram',
      form: [
        { id: 'op', type: 'select', label: 'Операция', col: 6, options: [
          ['enc', 'Закодировать (encodeURIComponent)'], ['encFull', 'Закодировать ссылку целиком (encodeURI)'],
          ['dec', 'Раскодировать'], ['punycode', 'Домен в punycode-вид']
        ] }
      ],
      run(text, v){
        if (v.op === 'enc') return encodeURIComponent(text);
        if (v.op === 'encFull') return encodeURI(text);
        if (v.op === 'dec') return decodeURIComponent(text.replace(/\+/g, ' '));
        try { return new URL(text.includes('://') ? text : 'https://' + text).href; }
        catch(e){ throw new Error('Не похоже на адрес'); }
      }
    });

    const urlIn = el('input', { type: 'text', placeholder: 'https://example.com/path?a=1&b=2#hash',
      value: 'https://pixset.dev/tools?utm_source=tg&utm_campaign=launch&page=2#top' });
    const parts = el('div');
    const params = el('div');
    const status = ui.status();

    function parse(){
      parts.innerHTML = ''; params.innerHTML = '';
      let url;
      try { url = new URL(urlIn.value.includes('://') ? urlIn.value : 'https://' + urlIn.value); }
      catch(e){ status.err('Некорректный адрес'); return; }
      parts.appendChild(ui.kv([
        ['Протокол', url.protocol.replace(':', '')],
        ['Домен', url.hostname],
        ['Порт', url.port || '(по умолчанию)'],
        ['Путь', url.pathname],
        ['Якорь', url.hash || '—'],
        ['Параметров', String(Array.from(url.searchParams).length)]
      ]));
      const entries = Array.from(url.searchParams.entries());
      if (entries.length){
        const table = el('table', { class: 'data' }, [
          el('thead', {}, el('tr', {}, [el('th', { text: 'Параметр' }), el('th', { text: 'Значение' }),
            el('th', { text: 'Раскодированное' })])),
          el('tbody', {}, entries.map(([k, val]) => el('tr', {}, [
            el('td', { text: k }), el('td', { text: val }),
            el('td', { text: (() => { try { return decodeURIComponent(val); } catch(e){ return val; } })() })
          ])))
        ]);
        params.appendChild(el('div', { class: 'table-scroll' }, table));
      } else params.appendChild(ui.muted('Параметров запроса нет.'));
      status.ok('Разобрано');
    }
    urlIn.addEventListener('input', debounce(parse, 200));

    root.appendChild(ui.card([
      ui.h('Разбор ссылки'),
      urlIn, status, ui.spacer(14), parts, ui.spacer(14), params
    ]));
    parse();
  }
});

/* ======================================================================
   Генератор тестовых данных
====================================================================== */
PT.tool({
  id: 'data-mock', cat: 'data', icon: '⁂',
  title: 'Тестовые данные и «рыба»',
  desc: 'Имена, e-mail, телефоны, адреса и целые таблицы в JSON, CSV или SQL — плюс Lorem ipsum.',
  keywords: ['mock', 'фейковые данные', 'lorem', 'рыба', 'тестовые', 'генератор', 'seed', 'json'],
  render(root){
    const out = ui.copyBox('', { label: 'Результат', rows: 16 });
    const NAMES_M = ['Александр','Дмитрий','Максим','Сергей','Андрей','Алексей','Артём','Илья','Кирилл','Михаил','Никита','Матвей','Роман','Егор','Арсений'];
    const NAMES_F = ['Анна','Мария','Елена','Дарья','Алина','Ирина','Екатерина','Арина','Полина','София','Виктория','Ольга','Ксения','Милана','Вера'];
    const SURNAMES = ['Иванов','Смирнов','Кузнецов','Попов','Васильев','Петров','Соколов','Михайлов','Новиков','Фёдоров','Морозов','Волков','Алексеев','Лебедев','Семёнов'];
    const CITIES = ['Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Казань','Нижний Новгород','Челябинск','Самара','Омск','Ростов-на-Дону','Уфа','Красноярск','Пермь','Воронеж','Волгоград'];
    const STREETS = ['Ленина','Советская','Молодёжная','Центральная','Школьная','Садовая','Лесная','Набережная','Заречная','Мира','Гагарина','Пушкина'];
    const DOMAINS = ['example.com','mail.ru','gmail.com','yandex.ru','pixset.dev','test.org'];
    const COMPANIES = ['ООО «Ромашка»','ИП Иванов','АО «Технопарк»','ООО «Северсталь-Групп»','Студия Pixset','ООО «Кодовый Барс»'];
    const PRODUCTS = ['Клавиатура','Монитор','Наушники','Ноутбук','Мышь','Веб-камера','Микрофон','Кресло','Стол','Флешка'];
    const LOREM = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore ' +
      'et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea ' +
      'commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur').split(' ');

    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));

    const form = ui.form([
      { id: 'type', type: 'select', label: 'Что сгенерировать', col: 4, options: [
        ['people', 'Люди (имя, почта, телефон, город)'], ['orders', 'Заказы (товар, цена, дата)'],
        ['companies', 'Компании и контакты'], ['lorem', 'Lorem ipsum'], ['numbers', 'Числа'], ['emails', 'Только e-mail']
      ] },
      { id: 'count', type: 'number', label: 'Количество', col: 4, value: 25, min: 1, max: 5000 },
      { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [
        ['json', 'JSON'], ['csv', 'CSV'], ['sql', 'SQL INSERT'], ['text', 'Простой текст']
      ] },
      { id: 'seed', type: 'number', label: 'Seed (одинаковый — одинаковый результат)', col: 4, value: 12345 },
      { id: 'paras', type: 'number', label: 'Абзацев (для lorem)', col: 4, value: 3, min: 1, max: 50 }
    ], generate);

    function person(){
      const female = rnd() > 0.5;
      const first = female ? pick(NAMES_F) : pick(NAMES_M);
      const last = pick(SURNAMES) + (female ? 'а' : '');
      const login = translitSimple(first).toLowerCase() + '.' + translitSimple(last).toLowerCase() + int(1, 99);
      return {
        id: int(1000, 9999),
        имя: first + ' ' + last,
        email: login + '@' + pick(DOMAINS),
        телефон: `+7 (9${int(10, 99)}) ${int(100, 999)}-${int(10, 99)}-${int(10, 99)}`,
        город: pick(CITIES),
        адрес: `ул. ${pick(STREETS)}, д. ${int(1, 120)}, кв. ${int(1, 300)}`,
        возраст: int(18, 65),
        дата_регистрации: new Date(Date.now() - int(1, 900) * 86400000).toISOString().slice(0, 10)
      };
    }
    function translitSimple(s){
      const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
        о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
      return s.toLowerCase().replace(/[а-яё]/g, c => map[c] || '');
    }

    function generate(){
      const v = form.values();
      seed = v.seed || 1;
      const n = clamp(v.count, 1, 5000);
      let rows = [];
      if (v.type === 'people') rows = Array.from({ length: n }, person);
      else if (v.type === 'emails') rows = Array.from({ length: n }, () => ({ email: person().email }));
      else if (v.type === 'orders') rows = Array.from({ length: n }, () => ({
        номер: 'ORD-' + int(10000, 99999),
        товар: pick(PRODUCTS),
        количество: int(1, 5),
        цена: int(500, 90000),
        статус: pick(['новый', 'оплачен', 'доставлен', 'отменён']),
        дата: new Date(Date.now() - int(0, 200) * 86400000).toISOString().slice(0, 10)
      }));
      else if (v.type === 'companies') rows = Array.from({ length: n }, () => ({
        компания: pick(COMPANIES),
        инн: String(int(1000000000, 9999999999)),
        контакт: person().имя,
        email: person().email,
        город: pick(CITIES),
        сотрудников: int(3, 900)
      }));
      else if (v.type === 'numbers') rows = Array.from({ length: n }, (_, i) => ({ n: i + 1, значение: int(1, 1000000) }));
      else {
        const paras = [];
        for (let p = 0; p < v.paras; p++){
          const sentences = [];
          for (let s = 0; s < int(3, 6); s++){
            const words = Array.from({ length: int(6, 14) }, () => pick(LOREM));
            words[0] = words[0][0].toUpperCase() + words[0].slice(1);
            sentences.push(words.join(' ') + '.');
          }
          paras.push(sentences.join(' '));
        }
        out.setValue(paras.join('\n\n'));
        return;
      }

      if (v.fmt === 'json') out.setValue(JSON.stringify(rows, null, 2));
      else if (v.fmt === 'csv') out.setValue(objectsToCSV(rows));
      else if (v.fmt === 'sql'){
        const table = { people: 'users', orders: 'orders', companies: 'companies', numbers: 'numbers', emails: 'emails' }[v.type];
        const keys = Object.keys(rows[0]);
        const lines = rows.map(r => `INSERT INTO ${table} (${keys.join(', ')}) VALUES (` +
          keys.map(k => typeof r[k] === 'number' ? r[k] : `'${String(r[k]).replace(/'/g, "''")}'`).join(', ') + ');');
        out.setValue(lines.join('\n'));
      } else {
        out.setValue(rows.map(r => Object.values(r).join(' · ')).join('\n'));
      }
    }

    root.appendChild(ui.card([
      form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Сгенерировать', generate),
        ui.btn('Новый seed', () => { form.set('seed', Math.floor(Math.random() * 999999)); generate(); }, { ghost: true, small: true }),
        ui.btn('Скачать', () => {
          const v = form.values();
          const ext = { json: 'json', csv: 'csv', sql: 'sql', text: 'txt' }[v.fmt];
          downloadText(out.getValue(), 'mock-data.' + ext);
        }, { ghost: true, small: true })
      ]),
      ui.spacer(14), out
    ]));
    generate();
  }
});


/* ===== tools/40-design.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: ДИЗАЙН И CSS
====================================================================== */

/* ======================================================================
   Конвертер цветов и контраст
====================================================================== */
PT.tool({
  id: 'design-color', cat: 'design', icon: '◑',
  title: 'Цвета и контраст',
  desc: 'HEX, RGB, HSL, OKLCH и CMYK, оттенки, проверка контраста по WCAG и симуляция дальтонизма.',
  keywords: ['цвет', 'hex', 'rgb', 'hsl', 'oklch', 'cmyk', 'контраст', 'wcag', 'доступность', 'палитра'],
  render(root){
    let hex = '#e8a33d';
    const swatch = el('div', { style: { height: '90px', borderRadius: '8px', border: '1px solid var(--line)' } });
    const picker = el('input', { type: 'color', value: hex });
    const hexIn = el('input', { type: 'text', value: hex, spellcheck: 'false' });
    const formats = el('div');
    const shades = el('div');
    const contrastBox = el('div');
    const bgIn = el('input', { type: 'color', value: '#101216' });

    function setHex(v, silent){
      const clean = v.startsWith('#') ? v : '#' + v;
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) return;
      hex = Color.rgbToHex(...Object.values(Color.hexToRgb(clean)));
      picker.value = hex;
      if (!silent) hexIn.value = hex;
      paint();
    }

    function paint(){
      const rgb = Color.hexToRgb(hex);
      const hsl = Color.rgbToHsl(rgb.r, rgb.g, rgb.b);
      const hsv = Color.rgbToHsv(rgb.r, rgb.g, rgb.b);
      const cmyk = Color.rgbToCmyk(rgb.r, rgb.g, rgb.b);
      const oklch = Color.rgbToOklch(rgb.r, rgb.g, rgb.b);
      swatch.style.background = hex;

      const values = [
        ['HEX', hex.toUpperCase()],
        ['RGB', `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
        ['RGBA', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`],
        ['HSL', `hsl(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${hsl.l.toFixed(0)}%)`],
        ['HSV', `${hsv.h.toFixed(0)}°, ${hsv.s.toFixed(0)}%, ${hsv.v.toFixed(0)}%`],
        ['OKLCH', `oklch(${oklch.l.toFixed(1)}% ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)})`],
        ['CMYK', `${cmyk.c.toFixed(0)}, ${cmyk.m.toFixed(0)}, ${cmyk.y.toFixed(0)}, ${cmyk.k.toFixed(0)}`],
        ['CSS-переменная', `--color: ${hex};`],
        ['Android', '0xFF' + hex.slice(1).toUpperCase()],
        ['Swift', `UIColor(red: ${(rgb.r / 255).toFixed(3)}, green: ${(rgb.g / 255).toFixed(3)}, blue: ${(rgb.b / 255).toFixed(3)}, alpha: 1)`]
      ];
      formats.innerHTML = '';
      values.forEach(([label, value]) => {
        formats.appendChild(el('div', { class: 'res-kv', style: { cursor: 'pointer' },
          onclick: () => copy(value) }, [el('span', { text: label }), el('b', { text: value })]));
      });

      // оттенки и тона
      shades.innerHTML = '';
      const row = el('div', { class: 'palette-row' });
      for (let i = 1; i <= 9; i++){
        const l = i * 10;
        const c = Color.hslToHex(hsl.h, hsl.s, l);
        const cell = el('div', { class: 'palette-cell', style: { background: c }, onclick: () => setHex(c) },
          el('span', { text: c }));
        row.appendChild(cell);
      }
      shades.appendChild(row);

      // контраст
      const bg = bgIn.value;
      const ratio = Color.contrast(hex, bg);
      const grade = (r, big) => r >= (big ? 4.5 : 7) ? 'AAA' : r >= (big ? 3 : 4.5) ? 'AA' : 'не проходит';
      contrastBox.innerHTML = '';
      contrastBox.appendChild(el('div', {
        style: { background: bg, color: hex, padding: '18px', borderRadius: '8px', border: '1px solid var(--line)' }
      }, [
        el('div', { style: { fontSize: '22px', fontWeight: '700' }, text: 'Крупный заголовок 24px' }),
        el('div', { style: { fontSize: '14px' }, text: 'Обычный текст 14px — так он будет выглядеть на этом фоне.' })
      ]));
      contrastBox.appendChild(ui.spacer(12));
      contrastBox.appendChild(ui.kv([
        ['Коэффициент контраста', ratio.toFixed(2) + ' : 1'],
        ['Обычный текст (WCAG)', grade(ratio, false)],
        ['Крупный текст (18px+)', grade(ratio, true)],
        ['Интерфейсные элементы', ratio >= 3 ? 'проходит' : 'не проходит'],
        ['Рекомендация', ratio >= 4.5 ? 'Годится для основного текста'
          : ratio >= 3 ? 'Только для крупных надписей и иконок' : 'Слишком мало контраста — читать тяжело']
      ]));

      // дальтонизм
      const sims = [
        ['Протанопия (нет красного)', [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]]],
        ['Дейтеранопия (нет зелёного)', [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]]],
        ['Тританопия (нет синего)', [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]]],
        ['Ахроматопсия (ч/б)', [[0.299, 0.587, 0.114], [0.299, 0.587, 0.114], [0.299, 0.587, 0.114]]]
      ];
      cbBox.innerHTML = '';
      sims.forEach(([label, m]) => {
        const r = rgb.r * m[0][0] + rgb.g * m[0][1] + rgb.b * m[0][2];
        const g = rgb.r * m[1][0] + rgb.g * m[1][1] + rgb.b * m[1][2];
        const b = rgb.r * m[2][0] + rgb.g * m[2][1] + rgb.b * m[2][2];
        const simHex = Color.rgbToHex(r, g, b);
        cbBox.appendChild(el('div', { class: 'thumb', style: { background: simHex, padding: '18px 8px' } },
          el('span', { style: { color: Color.readableOn(simHex) }, text: label })));
      });
    }
    const cbBox = el('div', { class: 'thumb-grid' });

    picker.addEventListener('input', () => setHex(picker.value));
    hexIn.addEventListener('input', () => setHex(hexIn.value, true));
    bgIn.addEventListener('input', paint);

    root.appendChild(ui.card([
      el('div', { class: 'grid cols-3' }, [
        el('div', {}, [el('label', { text: 'Выбор цвета' }), picker]),
        el('div', {}, [el('label', { text: 'HEX' }), hexIn]),
        el('div', {}, [el('label', { text: 'Фон для проверки контраста' }), bgIn])
      ]),
      ui.spacer(14), swatch, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Случайный цвет', () => setHex(Color.rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255)), { ghost: true, small: true }),
        ui.btn('Дополнительный', () => { const h = Color.hexToHsl(hex); setHex(Color.hslToHex(h.h + 180, h.s, h.l)); }, { ghost: true, small: true }),
        ui.btn('Инвертировать', () => { const c = Color.hexToRgb(hex); setHex(Color.rgbToHex(255 - c.r, 255 - c.g, 255 - c.b)); }, { ghost: true, small: true })
      ])
    ]));
    root.appendChild(ui.card([ui.h('Форматы', 'Клик по строке — копировать'), formats]));
    root.appendChild(ui.card([ui.h('Тона от тёмного к светлому'), shades]));
    root.appendChild(ui.card([ui.h('Контраст и читаемость'), contrastBox]));
    root.appendChild(ui.card([ui.h('Как видят люди с дальтонизмом'), cbBox]));
    paint();
  }
});

/* ======================================================================
   Палитры
====================================================================== */
PT.tool({
  id: 'design-palette', cat: 'design', icon: '☰',
  title: 'Генератор палитр',
  desc: 'Палитра из фотографии или по правилам гармонии, с экспортом в CSS, Tailwind и JSON.',
  keywords: ['палитра', 'цвета', 'гармония', 'из изображения', 'tailwind', 'css переменные', 'бренд'],
  render(root){
    let colors = ['#e8a33d', '#5fb3a3', '#e0685c', '#4a8cf7', '#8b5cf6'];
    const row = el('div', { class: 'palette-row' });
    const status = ui.status();
    const exportBox = el('div');

    const form = ui.form([
      { id: 'base', type: 'color', label: 'Базовый цвет', col: 3, value: '#e8a33d' },
      { id: 'scheme', type: 'select', label: 'Схема', col: 3, options: [
        ['analogous', 'Аналоговая'], ['complementary', 'Комплементарная'], ['split', 'Раздельно-комплементарная'],
        ['triadic', 'Триада'], ['tetradic', 'Тетрада'], ['mono', 'Монохромная'], ['shades', 'Тона одного цвета']
      ] },
      { id: 'count', type: 'number', label: 'Сколько цветов', col: 3, value: 5, min: 3, max: 10 },
      { id: 'name', type: 'text', label: 'Название палитры', col: 3, value: 'brand' }
    ], generate);

    function generate(){
      const v = form.values();
      const { h, s, l } = Color.hexToHsl(v.base);
      const n = clamp(v.count, 3, 10);
      const offsets = {
        analogous: i => h + (i - (n - 1) / 2) * 24,
        complementary: i => i % 2 ? h + 180 : h,
        split: i => [h, h + 150, h + 210, h + 30, h - 30][i % 5],
        triadic: i => h + (i % 3) * 120,
        tetradic: i => h + (i % 4) * 90,
        mono: () => h,
        shades: () => h
      }[v.scheme];
      colors = Array.from({ length: n }, (_, i) => {
        const hue = offsets(i);
        let light, sat = s;
        if (v.scheme === 'mono') light = 18 + i * (64 / (n - 1));
        else if (v.scheme === 'shades'){ light = 15 + i * (70 / (n - 1)); sat = clamp(s - i * 3, 10, 100); }
        else light = clamp(l + (i - (n - 1) / 2) * 9, 22, 82);
        return Color.hslToHex(hue, sat, light);
      });
      paint();
    }

    function paint(){
      row.innerHTML = '';
      colors.forEach((hex, i) => {
        const cell = el('div', { class: 'palette-cell', style: { background: hex },
          onclick: () => { copy(hex); status.ok('Скопировано: ' + hex); } },
          el('span', { text: hex.toUpperCase() }));
        row.appendChild(cell);
      });
      const cssVars = colors.map((c, i) => `  --${form.get('name')}-${(i + 1) * 100}: ${c};`).join('\n');
      const tailwind = JSON.stringify({
        theme: { extend: { colors: { [form.get('name')]: Object.fromEntries(colors.map((c, i) => [(i + 1) * 100, c])) } } }
      }, null, 2);
      exportBox.innerHTML = '';
      exportBox.appendChild(ui.copyBox(`:root {\n${cssVars}\n}`, { label: 'CSS-переменные', rows: colors.length + 2 }));
      exportBox.appendChild(ui.spacer(12));
      exportBox.appendChild(ui.copyBox(tailwind, { label: 'tailwind.config.js', rows: 8 }));
      exportBox.appendChild(ui.spacer(12));
      exportBox.appendChild(ui.copyBox(JSON.stringify(colors, null, 2), { label: 'JSON', rows: 4 }));
    }

    const drop = ui.drop({
      accept: 'image/*',
      title: 'Извлечь палитру из изображения',
      hint: 'фото, скриншот, логотип',
      onFiles: async files => {
        const img = await loadImage(files[0]);
        const size = 100;
        const c = smartResize(img, size, size);
        const d = c.getContext('2d').getImageData(0, 0, size, size).data;
        const pixels = [];
        for (let i = 0; i < d.length; i += 4){
          if (d[i + 3] < 128) continue;
          pixels.push(d[i], d[i + 1], d[i + 2]);
        }
        const found = medianCut(new Uint8Array(pixels), clamp(form.get('count'), 3, 10));
        colors = found.map(([r, g, b]) => Color.rgbToHex(r, g, b))
          .sort((a, b) => Color.hexToHsl(b).l - Color.hexToHsl(a).l);
        paint();
        status.ok('Извлечено цветов: ' + colors.length);
      }
    });

    root.appendChild(ui.card([
      form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Сгенерировать', generate),
        ui.btn('Случайная палитра', () => {
          form.set('base', Color.rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255));
          generate();
        }, { ghost: true, small: true }),
        ui.btn('Скачать PNG-раскладку', async () => {
          const w = 1200, h = 400;
          const canvas = makeCanvas(w, h);
          const ctx = canvas.getContext('2d');
          const cw = w / colors.length;
          colors.forEach((hex, i) => {
            ctx.fillStyle = hex; ctx.fillRect(i * cw, 0, cw, h);
            ctx.fillStyle = Color.readableOn(hex);
            ctx.font = "600 22px 'Space Mono', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(hex.toUpperCase(), i * cw + cw / 2, h - 34);
          });
          downloadBlob(await canvasToBlob(canvas, 'image/png'), 'palette.png');
        }, { ghost: true, small: true })
      ]),
      row, status, ui.spacer(14), drop
    ]));
    root.appendChild(ui.card([ui.h('Экспорт'), exportBox]));
    generate();
  }
});

/* ======================================================================
   Градиенты
====================================================================== */
PT.tool({
  id: 'design-gradient', cat: 'design', icon: '▤',
  title: 'Конструктор градиентов',
  desc: 'Линейные, радиальные и конические градиенты с любым числом опорных точек, CSS и PNG.',
  keywords: ['градиент', 'gradient', 'css', 'фон', 'обложка', 'conic', 'radial'],
  render(root){
    let stops = [{ color: '#e8a33d', pos: 0 }, { color: '#5fb3a3', pos: 100 }];
    const preview = el('div', { class: 'preview-pane', style: { height: '240px' } });
    const stopsBox = el('div');
    const cssOut = ui.copyBox('', { label: 'CSS', rows: 3 });

    const form = ui.form([
      { id: 'type', type: 'select', label: 'Тип', col: 3, options: [
        ['linear', 'Линейный'], ['radial', 'Радиальный'], ['conic', 'Конический']
      ] },
      { id: 'angle', type: 'range', label: 'Угол', col: 3, min: 0, max: 360, value: 135, unit: '°' },
      { id: 'size', type: 'select', label: 'Размер PNG', col: 3, options: [
        ['1200x630', '1200×630 — OG'], ['1920x1080', '1920×1080'], ['1080x1080', '1080×1080'],
        ['1080x1920', '1080×1920 — сторис'], ['2560x1440', '2560×1440']
      ] },
      { id: 'noise', type: 'checkbox', label: 'Добавить зернистость в PNG', col: 3 }
    ], update);

    function css(){
      const v = form.values();
      const list = stops.slice().sort((a, b) => a.pos - b.pos)
        .map(s => `${s.color} ${s.pos}%`).join(', ');
      if (v.type === 'linear') return `linear-gradient(${v.angle}deg, ${list})`;
      if (v.type === 'radial') return `radial-gradient(circle at 50% 50%, ${list})`;
      return `conic-gradient(from ${v.angle}deg at 50% 50%, ${list})`;
    }

    function update(){
      preview.style.background = css();
      cssOut.setValue('background: ' + css() + ';');
      renderStops();
    }

    function renderStops(){
      stopsBox.innerHTML = '';
      stops.forEach((stop, i) => {
        const colorIn = el('input', { type: 'color', value: stop.color });
        const posIn = el('input', { type: 'range', min: 0, max: 100, value: stop.pos });
        const posOut = el('b', { text: stop.pos + '%', style: { fontFamily: 'var(--mono)', minWidth: '44px' } });
        colorIn.addEventListener('input', () => { stop.color = colorIn.value; update(); });
        posIn.addEventListener('input', () => { stop.pos = Number(posIn.value); posOut.textContent = stop.pos + '%'; update(); });
        stopsBox.appendChild(el('div', { class: 'row gap', style: { marginBottom: '8px' } }, [
          el('div', { style: { width: '52px' } }, colorIn),
          el('div', { style: { flex: '1', minWidth: '120px' } }, posIn),
          posOut,
          stops.length > 2 ? ui.iconBtn('✕', 'Удалить точку', () => { stops.splice(i, 1); update(); }) : null
        ]));
      });
    }

    async function toCanvas(){
      const v = form.values();
      const [w, h] = v.size.split('x').map(Number);
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext('2d');
      const sorted = stops.slice().sort((a, b) => a.pos - b.pos);
      let grad;
      if (v.type === 'linear'){
        const rad = (v.angle - 90) * Math.PI / 180;
        const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
        const cx = w / 2, cy = h / 2;
        grad = ctx.createLinearGradient(
          cx - Math.cos(rad) * len / 2, cy - Math.sin(rad) * len / 2,
          cx + Math.cos(rad) * len / 2, cy + Math.sin(rad) * len / 2);
      } else if (v.type === 'radial'){
        grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
      } else {
        grad = ctx.createConicGradient
          ? ctx.createConicGradient(v.angle * Math.PI / 180, w / 2, h / 2)
          : ctx.createLinearGradient(0, 0, w, h);
      }
      sorted.forEach(s => grad.addColorStop(clamp(s.pos / 100, 0, 1), s.color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      if (v.noise){
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4){
          const n = (Math.random() - 0.5) * 26;
          d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
        }
        ctx.putImageData(img, 0, 0);
      }
      return canvas;
    }

    root.appendChild(ui.card([
      form, ui.spacer(14), preview, ui.spacer(14),
      ui.h('Опорные точки'),
      stopsBox,
      el('div', { class: 'row gap' }, [
        ui.btn('+ Точка', () => {
          const sorted = stops.slice().sort((a, b) => a.pos - b.pos);
          const mid = Math.round((sorted[0].pos + sorted[sorted.length - 1].pos) / 2);
          stops.push({ color: Color.rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255), pos: mid });
          update();
        }, { ghost: true, small: true }),
        ui.btn('Случайный градиент', () => {
          const base = Math.random() * 360;
          stops = [
            { color: Color.hslToHex(base, 70, 55), pos: 0 },
            { color: Color.hslToHex(base + 40 + Math.random() * 80, 65, 45), pos: 100 }
          ];
          form.set('angle', Math.round(Math.random() * 360));
          update();
        }, { ghost: true, small: true }),
        ui.btn('Развернуть', () => { stops = stops.map(s => ({ color: s.color, pos: 100 - s.pos })); update(); }, { ghost: true, small: true })
      ]),
      ui.spacer(14), cssOut, ui.spacer(12),
      PT.exportRow({
        name: 'gradient',
        png: toCanvas,
        svg: () => {
          const v = form.values();
          const [w, h] = v.size.split('x').map(Number);
          const sorted = stops.slice().sort((a, b) => a.pos - b.pos);
          const stopTags = sorted.map(s => `    <stop offset="${s.pos}%" stop-color="${s.color}"/>`).join('\n');
          const def = v.type === 'radial'
            ? `  <radialGradient id="g">\n${stopTags}\n  </radialGradient>`
            : `  <linearGradient id="g" gradientTransform="rotate(${v.angle - 90}, 0.5, 0.5)">\n${stopTags}\n  </linearGradient>`;
          return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>\n${def}\n</defs>\n<rect width="${w}" height="${h}" fill="url(#g)"/>\n</svg>`;
        }
      })
    ]));
    update();
  }
});

/* ======================================================================
   Тени
====================================================================== */
PT.tool({
  id: 'design-shadow', cat: 'design', icon: '◧',
  title: 'Тени и стекло',
  desc: 'box-shadow, text-shadow, неоморфизм и стеклянные карточки — с живым предпросмотром.',
  keywords: ['тень', 'box-shadow', 'text-shadow', 'glassmorphism', 'неоморфизм', 'css', 'блик'],
  render(root){
    const card = el('div', {
      style: { width: '190px', height: '130px', borderRadius: '14px', background: 'var(--surface)',
               display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)', fontSize: '13px' }
    }, 'PixTool');
    const stage = el('div', {
      style: { display: 'grid', placeItems: 'center', minHeight: '260px', borderRadius: '10px',
               background: 'linear-gradient(135deg,#20242b,#2c3138)', border: '1px solid var(--line)' }
    }, card);
    const out = ui.copyBox('', { label: 'CSS', rows: 5 });

    const form = ui.form([
      { id: 'type', type: 'select', label: 'Тип', col: 4, options: [
        ['box', 'Тень блока'], ['text', 'Тень текста'], ['neo', 'Неоморфизм'], ['glass', 'Стекло']
      ] },
      { id: 'x', type: 'range', label: 'Смещение X', col: 4, min: -60, max: 60, value: 0, unit: 'px' },
      { id: 'y', type: 'range', label: 'Смещение Y', col: 4, min: -60, max: 60, value: 14, unit: 'px' },
      { id: 'blur', type: 'range', label: 'Размытие', col: 4, min: 0, max: 120, value: 34, unit: 'px' },
      { id: 'spread', type: 'range', label: 'Растяжение', col: 4, min: -40, max: 60, value: -6, unit: 'px' },
      { id: 'opacity', type: 'range', label: 'Прозрачность', col: 4, min: 0, max: 100, value: 42, unit: '%' },
      { id: 'color', type: 'color', label: 'Цвет тени', col: 4, value: '#000000' },
      { id: 'bg', type: 'color', label: 'Цвет поверхности', col: 4, value: '#262b33' },
      { id: 'inset', type: 'checkbox', label: 'Внутренняя тень (inset)', col: 4 }
    ], update);

    function update(){
      const v = form.values();
      const rgb = Color.hexToRgb(v.color);
      const shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(v.opacity / 100).toFixed(2)})`;
      let css = '', style = {};
      if (v.type === 'box'){
        css = `box-shadow: ${v.inset ? 'inset ' : ''}${v.x}px ${v.y}px ${v.blur}px ${v.spread}px ${shadowColor};`;
        style = { boxShadow: `${v.inset ? 'inset ' : ''}${v.x}px ${v.y}px ${v.blur}px ${v.spread}px ${shadowColor}`,
                  background: v.bg, color: '#e9e7e1', backdropFilter: 'none', border: 'none' };
      } else if (v.type === 'text'){
        css = `text-shadow: ${v.x}px ${v.y}px ${v.blur}px ${shadowColor};`;
        style = { textShadow: `${v.x}px ${v.y}px ${v.blur}px ${shadowColor}`, background: v.bg,
                  boxShadow: 'none', fontSize: '26px', fontWeight: '700', color: '#e9e7e1', border: 'none' };
      } else if (v.type === 'neo'){
        const light = Color.hslToHex(Color.hexToHsl(v.bg).h, Color.hexToHsl(v.bg).s, clamp(Color.hexToHsl(v.bg).l + 9, 0, 100));
        const dark = Color.hslToHex(Color.hexToHsl(v.bg).h, Color.hexToHsl(v.bg).s, clamp(Color.hexToHsl(v.bg).l - 9, 0, 100));
        const d = Math.max(4, v.blur / 3);
        const shadow = `${v.inset ? 'inset ' : ''}${d}px ${d}px ${d * 2}px ${dark}, ${v.inset ? 'inset ' : ''}-${d}px -${d}px ${d * 2}px ${light}`;
        css = `background: ${v.bg};\nbox-shadow: ${shadow};\nborder-radius: 14px;`;
        style = { boxShadow: shadow, background: v.bg, color: '#e9e7e1', border: 'none' };
      } else {
        const blur = Math.max(2, v.blur / 4);
        css = `background: rgba(255, 255, 255, ${(v.opacity / 300).toFixed(3)});\n` +
              `backdrop-filter: blur(${blur}px);\n-webkit-backdrop-filter: blur(${blur}px);\n` +
              `border: 1px solid rgba(255, 255, 255, 0.18);\nborder-radius: 16px;\n` +
              `box-shadow: 0 ${v.y}px ${v.blur}px ${shadowColor};`;
        style = { background: `rgba(255,255,255,${v.opacity / 300})`, backdropFilter: `blur(${blur}px)`,
                  border: '1px solid rgba(255,255,255,0.18)',
                  boxShadow: `0 ${v.y}px ${v.blur}px ${shadowColor}`, color: '#fff' };
      }
      Object.assign(card.style, { boxShadow: '', textShadow: '', backdropFilter: '', fontSize: '13px', fontWeight: '400' }, style);
      out.setValue(css);
    }

    const presets = el('div', { class: 'pillbar' }, [
      ['Мягкая', { y: 12, blur: 30, spread: -6, opacity: 32 }],
      ['Резкая', { y: 4, blur: 0, spread: 0, opacity: 100 }],
      ['Парящая', { y: 30, blur: 60, spread: -12, opacity: 46 }],
      ['Обводка', { x: 0, y: 0, blur: 0, spread: 3, opacity: 100 }],
      ['Свечение', { x: 0, y: 0, blur: 40, spread: 4, opacity: 70, color: '#e8a33d' }]
    ].map(([label, preset]) => el('button', { class: 'pill', type: 'button', text: label, onclick: () => {
      Object.entries(preset).forEach(([k, val]) => form.set(k, val));
      update();
    } })));

    root.appendChild(ui.card([presets, form, ui.spacer(14), stage, ui.spacer(14), out]));
    update();
  }
});

/* ======================================================================
   Кривые анимации
====================================================================== */
PT.tool({
  id: 'design-bezier', cat: 'design', icon: '∿',
  title: 'Кривые анимации',
  desc: 'Редактор cubic-bezier с живой демонстрацией движения и готовыми пресетами.',
  keywords: ['cubic-bezier', 'easing', 'анимация', 'transition', 'кривая', 'css'],
  render(root){
    let p = [0.34, 1.56, 0.64, 1];
    const size = 300;
    const canvas = el('canvas', { width: size, height: size,
      style: { borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'crosshair', touchAction: 'none' } });
    const ball = el('div', { style: { width: '34px', height: '34px', borderRadius: '50%', background: 'var(--accent)' } });
    const track = el('div', { style: { padding: '14px', border: '1px solid var(--line)', borderRadius: '10px',
      background: 'var(--surface-2)', overflow: 'hidden' } }, ball);
    const out = ui.copyBox('', { label: 'CSS', rows: 3 });
    const status = ui.status();

    const PRESETS = {
      'ease': [0.25, 0.1, 0.25, 1], 'linear': [0, 0, 1, 1],
      'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
      'Резкий старт': [0.7, 0, 0.84, 0], 'Плавный выход': [0.16, 1, 0.3, 1],
      'Пружина': [0.34, 1.56, 0.64, 1], 'Отскок': [0.68, -0.55, 0.27, 1.55]
    };

    function draw(){
      const ctx = canvas.getContext('2d');
      const pad = 40, w = size - pad * 2;
      ctx.clearRect(0, 0, size, size);
      const styles = getComputedStyle(document.documentElement);
      const line = styles.getPropertyValue('--line-strong').trim() || '#333';
      const accent = styles.getPropertyValue('--accent').trim() || '#e8a33d';
      const teal = styles.getPropertyValue('--teal').trim() || '#5fb3a3';

      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.strokeRect(pad, pad, w, w);
      const toXY = (x, y) => [pad + x * w, pad + (1 - y) * w];

      ctx.strokeStyle = teal; ctx.lineWidth = 1.5;
      [[0, 0, p[0], p[1]], [1, 1, p[2], p[3]]].forEach(([ax, ay, bx, by]) => {
        ctx.beginPath(); ctx.moveTo(...toXY(ax, ay)); ctx.lineTo(...toXY(bx, by)); ctx.stroke();
      });

      ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(...toXY(0, 0));
      ctx.bezierCurveTo(...toXY(p[0], p[1]), ...toXY(p[2], p[3]), ...toXY(1, 1));
      ctx.stroke();

      [[p[0], p[1]], [p[2], p[3]]].forEach(([x, y]) => {
        const [cx, cy] = toXY(x, y);
        ctx.fillStyle = teal;
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      });
      out.setValue(`transition: all 0.8s cubic-bezier(${p.map(n => n.toFixed(2)).join(', ')});`);
    }

    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect();
      const pad = 40, w = size - pad * 2;
      const x = (e.clientX - r.left) * size / r.width, y = (e.clientY - r.top) * size / r.height;
      const d1 = Math.hypot(x - (pad + p[0] * w), y - (pad + (1 - p[1]) * w));
      const d2 = Math.hypot(x - (pad + p[2] * w), y - (pad + (1 - p[3]) * w));
      drag = d1 < d2 ? 0 : 1;
      canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    canvas.addEventListener('pointermove', e => { if (drag !== null) move(e); });
    canvas.addEventListener('pointerup', () => { drag = null; });
    function move(e){
      const r = canvas.getBoundingClientRect();
      const pad = 40, w = size - pad * 2;
      const x = clamp(((e.clientX - r.left) * size / r.width - pad) / w, 0, 1);
      const y = clamp(1 - ((e.clientY - r.top) * size / r.height - pad) / w, -0.6, 1.6);
      p[drag * 2] = x; p[drag * 2 + 1] = y;
      draw();
    }

    function play(){
      ball.style.transition = 'none';
      ball.style.transform = 'translateX(0)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ball.style.transition = `transform 1s cubic-bezier(${p.join(',')})`;
        ball.style.transform = `translateX(calc(100% + ${track.clientWidth - 80}px))`;
      }));
    }

    root.appendChild(ui.card([
      el('div', { class: 'pillbar' }, Object.entries(PRESETS).map(([name, val]) =>
        el('button', { class: 'pill', type: 'button', text: name, onclick: () => { p = val.slice(); draw(); play(); } }))),
      el('div', { class: 'grid cols-2' }, [
        canvas,
        el('div', {}, [
          ui.h('Демонстрация', 'Перетаскивай точки на графике'),
          track, ui.spacer(14),
          ui.btn('Проиграть ещё раз', play, { ghost: true }),
          ui.spacer(14), out
        ])
      ]),
      status
    ]));
    draw();
    setTimeout(play, 300);
  }
});

/* ======================================================================
   Мета-теги и OG
====================================================================== */
PT.tool({
  id: 'design-meta', cat: 'design', icon: '⌘',
  title: 'Мета-теги и OG-превью',
  desc: 'Генератор тегов для поиска и соцсетей с предпросмотром карточки Telegram и Google.',
  keywords: ['seo', 'og', 'open graph', 'meta', 'twitter card', 'превью ссылки', 'теги'],
  render(root){
    const out = ui.copyBox('', { label: 'Код для <head>', rows: 16 });
    const googlePreview = el('div', { style: { background: 'var(--surface-2)', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)' } });
    const socialPreview = el('div', { style: { background: 'var(--surface-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' } });

    const form = ui.form([
      { id: 'title', type: 'text', label: 'Заголовок', col: 6, value: 'PixTool — инструменты в браузере' },
      { id: 'url', type: 'text', label: 'Адрес страницы', col: 6, value: 'https://example.com/' },
      { id: 'desc', type: 'textarea', label: 'Описание', rows: 3, value: 'Конвертеры, редактор изображений и генераторы. Всё работает локально — файлы не загружаются на сервер.' },
      { id: 'image', type: 'text', label: 'Картинка (1200×630)', col: 6, value: 'https://example.com/og.png' },
      { id: 'site', type: 'text', label: 'Название сайта', col: 6, value: 'PixTool' },
      { id: 'type', type: 'select', label: 'Тип', col: 4, options: [['website', 'Сайт'], ['article', 'Статья'], ['product', 'Товар']] },
      { id: 'locale', type: 'select', label: 'Язык', col: 4, options: [['ru_RU', 'Русский'], ['en_US', 'English']] },
      { id: 'robots', type: 'select', label: 'Индексация', col: 4, options: [
        ['index, follow', 'Индексировать'], ['noindex, nofollow', 'Скрыть от поиска']
      ] }
    ], update);

    function update(){
      const v = form.values();
      const tags = [
        `<title>${esc(v.title)}</title>`,
        `<meta name="description" content="${esc(v.desc)}">`,
        `<meta name="robots" content="${v.robots}">`,
        `<link rel="canonical" href="${esc(v.url)}">`,
        '',
        `<meta property="og:type" content="${v.type}">`,
        `<meta property="og:site_name" content="${esc(v.site)}">`,
        `<meta property="og:title" content="${esc(v.title)}">`,
        `<meta property="og:description" content="${esc(v.desc)}">`,
        `<meta property="og:url" content="${esc(v.url)}">`,
        `<meta property="og:image" content="${esc(v.image)}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:locale" content="${v.locale}">`,
        '',
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(v.title)}">`,
        `<meta name="twitter:description" content="${esc(v.desc)}">`,
        `<meta name="twitter:image" content="${esc(v.image)}">`
      ].join('\n');
      out.setValue(tags);

      const titleLen = v.title.length, descLen = v.desc.length;
      googlePreview.innerHTML = '';
      googlePreview.appendChild(el('div', { style: { color: 'var(--dim)', fontSize: '12.5px' }, text: v.url }));
      googlePreview.appendChild(el('div', { style: { color: '#8ab4f8', fontSize: '18px', margin: '3px 0' },
        text: titleLen > 60 ? v.title.slice(0, 60) + '…' : v.title }));
      googlePreview.appendChild(el('div', { style: { fontSize: '13.5px', color: 'var(--dim)' },
        text: descLen > 160 ? v.desc.slice(0, 160) + '…' : v.desc }));
      googlePreview.appendChild(ui.spacer(10));
      googlePreview.appendChild(el('div', { class: 'row gap' }, [
        el('span', { class: 'badge ' + (titleLen <= 60 ? 'ok' : 'warn'), text: `Заголовок: ${titleLen}/60` }),
        el('span', { class: 'badge ' + (descLen >= 70 && descLen <= 160 ? 'ok' : 'warn'), text: `Описание: ${descLen}/160` })
      ]));

      socialPreview.innerHTML = '';
      socialPreview.appendChild(el('div', {
        style: { height: '140px', borderRadius: '8px', marginBottom: '10px',
                 background: `linear-gradient(135deg, var(--accent-soft), var(--teal-soft))`,
                 display: 'grid', placeItems: 'center', color: 'var(--dim)', fontFamily: 'var(--mono)', fontSize: '12px' }
      }, 'og:image 1200 × 630'));
      socialPreview.appendChild(el('div', { style: { fontWeight: '700' }, text: v.title }));
      socialPreview.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--dim)' }, text: v.desc }));
      socialPreview.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--faint)', marginTop: '6px' }, text: v.site }));
    }

    root.appendChild(ui.card([form]));
    root.appendChild(el('div', { class: 'grid cols-2' }, [
      ui.card([ui.h('Как увидит Google'), googlePreview]),
      ui.card([ui.h('Как увидят соцсети'), socialPreview])
    ]));
    root.appendChild(ui.card([out]));
    update();
  }
});

/* ======================================================================
   Паттерны и фоны
====================================================================== */
PT.tool({
  id: 'design-pattern', cat: 'design', icon: '⁛',
  title: 'Фоновые паттерны',
  desc: 'Сетки, полоски, точки, шахматка и шум в виде готового CSS или SVG-подложки.',
  keywords: ['паттерн', 'фон', 'background', 'сетка', 'полоски', 'текстура', 'svg', 'шум'],
  render(root){
    const preview = el('div', { class: 'preview-pane', style: { height: '260px' } });
    const out = ui.copyBox('', { label: 'CSS', rows: 6 });

    const form = ui.form([
      { id: 'type', type: 'select', label: 'Узор', col: 4, options: [
        ['grid', 'Сетка'], ['dots', 'Точки'], ['stripes', 'Полоски'], ['diagonal', 'Диагонали'],
        ['checker', 'Шахматка'], ['cross', 'Крестики'], ['noise', 'Шум']
      ] },
      { id: 'size', type: 'range', label: 'Размер ячейки', col: 4, min: 4, max: 90, value: 26, unit: 'px' },
      { id: 'thickness', type: 'range', label: 'Толщина', col: 4, min: 1, max: 14, value: 1, unit: 'px' },
      { id: 'bg', type: 'color', label: 'Фон', col: 4, value: '#101216' },
      { id: 'fg', type: 'color', label: 'Узор', col: 4, value: '#e8a33d' },
      { id: 'opacity', type: 'range', label: 'Прозрачность узора', col: 4, min: 5, max: 100, value: 22, unit: '%' },
      { id: 'angle', type: 'range', label: 'Угол (для полосок)', col: 4, min: 0, max: 180, value: 45, unit: '°' }
    ], update);

    function patternCss(){
      const v = form.values();
      const rgb = Color.hexToRgb(v.fg);
      const fg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(v.opacity / 100).toFixed(2)})`;
      const s = v.size, t = v.thickness;
      switch (v.type){
        case 'grid':
          return `background-color: ${v.bg};\nbackground-image: linear-gradient(${fg} ${t}px, transparent ${t}px),\n` +
                 `  linear-gradient(90deg, ${fg} ${t}px, transparent ${t}px);\nbackground-size: ${s}px ${s}px;`;
        case 'dots':
          return `background-color: ${v.bg};\nbackground-image: radial-gradient(${fg} ${t}px, transparent ${t + 0.5}px);\n` +
                 `background-size: ${s}px ${s}px;`;
        case 'stripes':
          return `background-color: ${v.bg};\nbackground-image: repeating-linear-gradient(${v.angle}deg, ${fg} 0 ${t}px, transparent ${t}px ${s}px);`;
        case 'diagonal':
          return `background-color: ${v.bg};\nbackground-image: repeating-linear-gradient(45deg, ${fg} 0 ${t}px, transparent ${t}px ${s}px),\n` +
                 `  repeating-linear-gradient(-45deg, ${fg} 0 ${t}px, transparent ${t}px ${s}px);`;
        case 'checker':
          return `background-color: ${v.bg};\nbackground-image: repeating-conic-gradient(${fg} 0% 25%, transparent 0% 50%);\n` +
                 `background-size: ${s * 2}px ${s * 2}px;`;
        case 'cross':
          return `background-color: ${v.bg};\nbackground-image: linear-gradient(${fg} ${t}px, transparent ${t}px),\n` +
                 `  linear-gradient(90deg, ${fg} ${t}px, transparent ${t}px);\n` +
                 `background-size: ${s}px ${s}px;\nbackground-position: center;`;
        default: {
          const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s * 4}' height='${s * 4}'>` +
            `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/></filter>` +
            `<rect width='100%' height='100%' filter='url(#n)' opacity='${v.opacity / 100}'/></svg>`;
          return `background-color: ${v.bg};\nbackground-image: url("data:image/svg+xml,${encodeURIComponent(svg)}");`;
        }
      }
    }

    function update(){
      const css = patternCss();
      out.setValue(css);
      preview.style.cssText = 'height:260px;border:1px solid var(--line);border-radius:8px;' + css.replace(/\n/g, '');
    }

    root.appendChild(ui.card([form, ui.spacer(14), preview, ui.spacer(14), out]));
    update();
  }
});

/* ======================================================================
   Единицы и типографика
====================================================================== */
PT.tool({
  id: 'design-units', cat: 'design', icon: '⇱',
  title: 'CSS-единицы и шкала',
  desc: 'Перевод px ↔ rem ↔ em ↔ pt ↔ %, модульная типографская шкала и clamp() для адаптива.',
  keywords: ['px', 'rem', 'em', 'pt', 'vw', 'clamp', 'типографика', 'шкала', 'адаптив'],
  render(root){
    const table = el('div');
    const scaleOut = el('div');
    const clampOut = ui.copyBox('', { label: 'Адаптивный размер', rows: 2 });

    const form = ui.form([
      { id: 'px', type: 'number', label: 'Значение в px', col: 3, value: 24, step: 1 },
      { id: 'root', type: 'number', label: 'Базовый размер шрифта', col: 3, value: 16, min: 1 },
      { id: 'parent', type: 'number', label: 'Размер родителя (для em)', col: 3, value: 16, min: 1 },
      { id: 'vw', type: 'number', label: 'Ширина экрана', col: 3, value: 1440, min: 100 },
      { id: 'ratio', type: 'select', label: 'Шкала', col: 4, value: '1.25', options: [
        ['1.125', 'Мажорная секунда 1.125'], ['1.2', 'Малая терция 1.2'], ['1.25', 'Большая терция 1.25'],
        ['1.333', 'Кварта 1.333'], ['1.414', 'Тритон 1.414'], ['1.5', 'Квинта 1.5'], ['1.618', 'Золотое сечение']
      ] },
      { id: 'minW', type: 'number', label: 'Мин. ширина экрана', col: 4, value: 380 },
      { id: 'maxW', type: 'number', label: 'Макс. ширина экрана', col: 4, value: 1440 }
    ], update);

    function update(){
      const v = form.values();
      const px = v.px;
      table.innerHTML = '';
      table.appendChild(ui.kv([
        ['px', px + 'px'],
        ['rem', (px / v.root).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 'rem'],
        ['em', (px / v.parent).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 'em'],
        ['pt', (px * 0.75).toFixed(2) + 'pt'],
        ['%', (px / v.parent * 100).toFixed(1) + '%'],
        ['vw', (px / v.vw * 100).toFixed(3) + 'vw'],
        ['ch (≈)', (px / (v.root * 0.5)).toFixed(2) + 'ch'],
        ['Пункты печати (мм)', (px * 0.2646).toFixed(2) + ' мм']
      ]));

      const ratio = parseFloat(v.ratio);
      const steps = [-2, -1, 0, 1, 2, 3, 4, 5];
      scaleOut.innerHTML = '';
      const rows = steps.map(step => {
        const size = v.root * Math.pow(ratio, step);
        return [`Шаг ${step >= 0 ? '+' + step : step}`, size.toFixed(1) + 'px  /  ' + (size / v.root).toFixed(3) + 'rem'];
      });
      scaleOut.appendChild(ui.kv(rows));
      scaleOut.appendChild(ui.spacer(12));
      steps.slice(2).forEach(step => {
        const size = v.root * Math.pow(ratio, step);
        scaleOut.appendChild(el('div', { style: { fontSize: Math.min(size, 52) + 'px', lineHeight: '1.2', marginBottom: '4px' },
          text: 'Заголовок ' + size.toFixed(0) + 'px' }));
      });
      scaleOut.appendChild(ui.spacer(10));
      scaleOut.appendChild(ui.copyBox(steps.map((s, i) =>
        `  --step-${i}: ${(v.root * Math.pow(ratio, s)).toFixed(2)}px;`).join('\n'), { label: 'CSS-переменные шкалы', rows: 8 }));

      // clamp
      const minSize = px * 0.72, maxSize = px;
      const slope = (maxSize - minSize) / (v.maxW - v.minW);
      const yInter = minSize - slope * v.minW;
      clampOut.setValue(`font-size: clamp(${minSize.toFixed(2)}px, ${yInter.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw, ${maxSize.toFixed(2)}px);`);
    }

    root.appendChild(ui.card([form, ui.spacer(14), table, ui.spacer(14), clampOut]));
    root.appendChild(ui.card([ui.h('Модульная шкала', 'Размеры заголовков, кратные выбранному коэффициенту'), scaleOut]));
    update();
  }
});


/* ===== tools/50-doc.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: ДОКУМЕНТЫ
====================================================================== */

/* ---------- разбор диапазонов страниц: «1-3, 5, 8-» ---------- */
function parseRanges(spec, total){
  if (!spec || !spec.trim()) return Array.from({ length: total }, (_, i) => i);
  const out = new Set();
  spec.split(',').forEach(part => {
    const chunk = part.trim();
    if (!chunk) return;
    const m = chunk.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (m){
      const from = m[1] ? parseInt(m[1]) : 1;
      const to = m[2] ? parseInt(m[2]) : total;
      for (let i = from; i <= Math.min(to, total); i++) if (i >= 1) out.add(i - 1);
    } else {
      const n = parseInt(chunk);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  });
  return Array.from(out).sort((a, b) => a - b);
}
PT.parseRanges = parseRanges;

/* ======================================================================
   PDF: объединение, разделение, повороты
====================================================================== */
PT.tool({
  id: 'doc-pdf', cat: 'doc', icon: '❐',
  title: 'PDF: объединить и разделить',
  desc: 'Склейка нескольких PDF, извлечение страниц, удаление, поворот и водяной знак.',
  keywords: ['pdf', 'объединить', 'merge', 'split', 'разделить', 'страницы', 'повернуть', 'удалить'],
  render(root){
    const files = [];
    const status = ui.status();
    const list = ui.fileList(i => { files.splice(i, 1); list.render(files); refresh(); });
    const info = el('div');

    const drop = ui.drop({
      accept: 'application/pdf,.pdf', multiple: true,
      title: 'Перетащи PDF-файлы',
      hint: 'порядок склейки — как в списке ниже',
      onFiles: async newFiles => {
        newFiles.forEach(f => files.push(f));
        list.render(files);
        await refresh();
      }
    });

    async function refresh(){
      info.innerHTML = '';
      if (!files.length){ status.set(''); return; }
      status.busy('Читаю документы');
      const { PDFDocument } = await load();
      const rows = [];
      let totalPages = 0;
      for (const f of files){
        try{
          const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
          totalPages += doc.getPageCount();
          rows.push([f.name, doc.getPageCount() + ' стр. · ' + fmtBytes(f.size)]);
        } catch(e){ rows.push([f.name, 'не удалось прочитать']); }
      }
      rows.push(['Всего страниц', String(totalPages)]);
      info.appendChild(ui.kv(rows));
      status.ok('Загружено файлов: ' + files.length);
    }

    async function load(){
      await PT.need('pdflib');
      return window.PDFLib;
    }

    const form = ui.form([
      { id: 'op', type: 'select', label: 'Операция', col: 4, options: [
        ['merge', 'Объединить все в один'], ['extract', 'Извлечь страницы'], ['remove', 'Удалить страницы'],
        ['split', 'Разбить по одной странице'], ['rotate', 'Повернуть страницы'], ['watermark', 'Водяной знак']
      ] },
      { id: 'pages', type: 'text', label: 'Страницы (например 1-3, 5, 8-)', col: 4, value: '1-3' },
      { id: 'angle', type: 'select', label: 'Поворот', col: 4, value: '90', options: [['90', '90° по часовой'], ['180', '180°'], ['270', '90° против часовой']] },
      { id: 'text', type: 'text', label: 'Текст водяного знака', col: 6, value: 'ЧЕРНОВИК' },
      { id: 'opacity', type: 'range', label: 'Прозрачность знака', col: 6, min: 5, max: 100, value: 22, unit: '%' }
    ], (id, v) => {
      form.show('pages', ['extract', 'remove', 'rotate', 'watermark'].includes(v.op));
      form.show('angle', v.op === 'rotate');
      form.show('text', v.op === 'watermark');
      form.show('opacity', v.op === 'watermark');
    });
    form.show('angle', false); form.show('text', false); form.show('opacity', false);

    async function run(){
      if (!files.length){ status.err('Добавь хотя бы один PDF'); return; }
      const v = form.values();
      const { PDFDocument, degrees, rgb, StandardFonts } = await load();
      status.busy('Обрабатываю');

      if (v.op === 'merge'){
        const out = await PDFDocument.create();
        for (const f of files){
          const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
        }
        const bytes = await out.save();
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
        status.ok('Объединено страниц: ' + out.getPageCount());
        return;
      }

      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();

      if (v.op === 'split'){
        const entries = [];
        for (let i = 0; i < total; i++){
          const out = await PDFDocument.create();
          const [page] = await out.copyPages(src, [i]);
          out.addPage(page);
          entries.push({ name: `${baseName(files[0].name)}-page-${String(i + 1).padStart(3, '0')}.pdf`,
                         data: new Blob([await out.save()]) });
        }
        downloadBlob(await zip(entries), baseName(files[0].name) + '-pages.zip');
        status.ok('Разбито на ' + total + ' файлов');
        return;
      }

      if (v.op === 'extract' || v.op === 'remove'){
        const selected = parseRanges(v.pages, total);
        const keep = v.op === 'extract' ? selected
          : Array.from({ length: total }, (_, i) => i).filter(i => !selected.includes(i));
        if (!keep.length){ status.err('После операции не осталось ни одной страницы'); return; }
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, keep);
        pages.forEach(p => out.addPage(p));
        downloadBlob(new Blob([await out.save()], { type: 'application/pdf' }),
          baseName(files[0].name) + (v.op === 'extract' ? '-extract.pdf' : '-trimmed.pdf'));
        status.ok('Готово, страниц в результате: ' + keep.length);
        return;
      }

      if (v.op === 'rotate'){
        const targets = parseRanges(v.pages, total);
        targets.forEach(i => {
          const page = src.getPage(i);
          page.setRotation(degrees((page.getRotation().angle + Number(v.angle)) % 360));
        });
        downloadBlob(new Blob([await src.save()], { type: 'application/pdf' }), baseName(files[0].name) + '-rotated.pdf');
        status.ok('Повёрнуто страниц: ' + targets.length);
        return;
      }

      // водяной знак
      const font = await src.embedFont(StandardFonts.Helvetica);
      const targets = parseRanges(v.pages, total);
      // встроенная Helvetica не содержит кириллицы — заменяем её латиницей
      const safeLabel = /[А-Яа-яЁё]/.test(v.text) ? translitForPdf(v.text) : v.text;
      targets.forEach(i => {
        const page = src.getPage(i);
        const { width, height } = page.getSize();
        const size = Math.min(width, height) / 7;
        page.drawText(safeLabel, {
          x: width / 2 - font.widthOfTextAtSize(safeLabel, size) / 2,
          y: height / 2 - size / 2,
          size, font, color: rgb(0.9, 0.64, 0.24), opacity: v.opacity / 100,
          rotate: degrees(35)
        });
      });
      downloadBlob(new Blob([await src.save()], { type: 'application/pdf' }), baseName(files[0].name) + '-watermark.pdf');
      status.ok('Знак нанесён на ' + targets.length + ' страниц');
    }

    function translitForPdf(s){
      const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
        о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
      return s.replace(/[а-яё]/gi, ch => {
        const lower = ch.toLowerCase();
        const rep = map[lower] || ch;
        return ch === lower ? rep : rep.toUpperCase();
      });
    }

    root.appendChild(ui.card([
      drop, list, info, ui.spacer(14), form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Выполнить →', () => run().catch(e => status.err('Ошибка: ' + e.message))),
        ui.btn('Очистить список', () => { files.length = 0; list.render(files); info.innerHTML = ''; status.set(''); }, { ghost: true, small: true })
      ]),
      status,
      ui.muted('Кириллица в водяном знаке заменяется латиницей: встроенные шрифты PDF не содержат русских букв.')
    ]));
  }
});

/* ======================================================================
   PDF ↔ изображения
====================================================================== */
PT.tool({
  id: 'doc-pdf-images', cat: 'doc', icon: '⇵',
  title: 'PDF ↔ изображения',
  desc: 'Рендер страниц PDF в PNG/JPEG нужного разрешения и сборка PDF из картинок.',
  keywords: ['pdf в png', 'pdf в jpg', 'картинки в pdf', 'скан', 'рендер', 'конвертация'],
  render(root){
    const status = ui.status();
    const grid = ui.thumbGrid();
    const progress = ui.progress();

    /* --- PDF → изображения --- */
    const pdfForm = ui.form([
      { id: 'scale', type: 'select', label: 'Качество', col: 4, value: '2', options: [
        ['1', '72 dpi — для экрана'], ['2', '150 dpi — стандарт'], ['3', '220 dpi'], ['4', '300 dpi — печать']
      ] },
      { id: 'fmt', type: 'select', label: 'Формат', col: 4, options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] },
      { id: 'pages', type: 'text', label: 'Страницы (пусто — все)', col: 4, value: '' }
    ]);

    const pdfDrop = ui.drop({
      accept: 'application/pdf,.pdf',
      title: 'PDF → картинки',
      hint: 'перетащи документ',
      onFiles: async files => {
        const file = files[0];
        status.busy('Загружаю движок PDF');
        await PT.need('pdfjs');
        const v = pdfForm.values();
        const data = new Uint8Array(await file.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data }).promise;
        const pages = parseRanges(v.pages, doc.numPages);
        grid.clear();
        const blobs = [];
        status.busy('Рендерю страницы');
        for (let i = 0; i < pages.length; i++){
          const page = await doc.getPage(pages[i] + 1);
          const viewport = page.getViewport({ scale: Number(v.scale) });
          const canvas = makeCanvas(viewport.width, viewport.height);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await encodeCanvas(canvas, v.fmt, 0.92);
          const name = `${baseName(file.name)}-${String(pages[i] + 1).padStart(3, '0')}.${PT.mimeExt(v.fmt)}`;
          blobs.push({ name, data: blob });
          grid.add(URL.createObjectURL(blob), 'стр. ' + (pages[i] + 1), () => downloadBlob(blob, name));
          progress.set((i + 1) / pages.length);
        }
        progress.hide();
        grid._entries = blobs;
        status.ok(`Отрендерено страниц: ${blobs.length}. Клик по превью — скачать.`);
      }
    });

    /* --- изображения → PDF --- */
    const imgFiles = [];
    const imgList = ui.fileList(i => { imgFiles.splice(i, 1); imgList.render(imgFiles); });
    const imgForm = ui.form([
      { id: 'size', type: 'select', label: 'Размер страницы', col: 4, options: [
        ['fit', 'По размеру картинки'], ['a4', 'A4 книжная'], ['a4l', 'A4 альбомная'], ['letter', 'Letter']
      ] },
      { id: 'margin', type: 'number', label: 'Поля, мм', col: 4, value: 0, min: 0, max: 50 },
      { id: 'quality', type: 'range', label: 'Качество JPEG', col: 4, min: 40, max: 100, value: 88, unit: '%' }
    ]);
    const imgDrop = ui.drop({
      accept: 'image/*', multiple: true,
      title: 'Картинки → PDF',
      hint: 'каждая картинка станет отдельной страницей',
      onFiles: files => {
        files.forEach(f => imgFiles.push(f));
        imgFiles.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
        imgList.render(imgFiles);
        status.ok('Картинок в очереди: ' + imgFiles.length);
      }
    });

    async function buildPdf(){
      if (!imgFiles.length){ status.err('Сначала добавь картинки'); return; }
      await PT.need('pdflib');
      const { PDFDocument } = window.PDFLib;
      const v = imgForm.values();
      const doc = await PDFDocument.create();
      const SIZES = { a4: [595.28, 841.89], a4l: [841.89, 595.28], letter: [612, 792] };
      const margin = v.margin * 2.8346;
      status.busy('Собираю PDF');
      for (let i = 0; i < imgFiles.length; i++){
        const file = imgFiles[i];
        const img = await loadImage(file);
        const canvas = flatten(imgToCanvas(img));
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', v.quality / 100);
        const embedded = await doc.embedJpg(await jpeg.arrayBuffer());
        let pageW, pageH;
        if (v.size === 'fit'){ pageW = embedded.width + margin * 2; pageH = embedded.height + margin * 2; }
        else { [pageW, pageH] = SIZES[v.size]; }
        const page = doc.addPage([pageW, pageH]);
        const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
        const k = Math.min(maxW / embedded.width, maxH / embedded.height);
        const w = embedded.width * k, h = embedded.height * k;
        page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        progress.set((i + 1) / imgFiles.length);
      }
      progress.hide();
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'images.pdf');
      status.ok('PDF собран: ' + imgFiles.length + ' страниц');
    }

    root.appendChild(ui.card([ui.h('PDF → изображения'), pdfForm, ui.spacer(14), pdfDrop,
      ui.spacer(12),
      ui.btn('Скачать все страницы архивом', async () => {
        if (!grid._entries || !grid._entries.length){ status.err('Сначала отрендерь PDF'); return; }
        downloadBlob(await zip(grid._entries), 'pdf-pages.zip');
      }, { ghost: true })
    ]));
    root.appendChild(ui.card([ui.h('Изображения → PDF'), imgForm, ui.spacer(14), imgDrop, imgList,
      ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Собрать PDF →', () => buildPdf().catch(e => { progress.hide(); status.err(e.message); })),
        ui.btn('Очистить', () => { imgFiles.length = 0; imgList.render(imgFiles); }, { ghost: true, small: true })
      ])
    ]));
    root.appendChild(el('div', {}, [progress, status]));
    root.appendChild(grid);
  }
});

/* ======================================================================
   Текст из PDF
====================================================================== */
PT.tool({
  id: 'doc-pdf-text', cat: 'doc', icon: '⌸',
  title: 'Текст из PDF',
  desc: 'Извлекает текстовый слой документа постранично — с поиском и выгрузкой в TXT.',
  keywords: ['pdf', 'текст', 'извлечь', 'копировать', 'распознать', 'ocr', 'выгрузить'],
  render(root){
    const status = ui.status();
    const out = ui.copyBox('', { label: 'Текст документа', rows: 20, editable: true });
    const info = el('div');

    PT.fileTool(root, {
      accept: 'application/pdf,.pdf',
      title: 'Перетащи PDF',
      hint: 'работает с документами, где есть текстовый слой',
      note: 'Отсканированные листы без текстового слоя дадут пустой результат — там нужен OCR.',
      async onFiles(file, ctx){
        ctx.status.busy('Загружаю движок PDF');
        await PT.need('pdfjs');
        const data = new Uint8Array(await file.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data }).promise;
        ctx.status.busy('Читаю страницы');
        const parts = [];
        for (let i = 1; i <= doc.numPages; i++){
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let lastY = null, line = [], lines = [];
          content.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            if (lastY !== null && Math.abs(y - lastY) > 3){ lines.push(line.join('')); line = []; }
            line.push(item.str);
            lastY = y;
          });
          if (line.length) lines.push(line.join(''));
          parts.push(`\n───── Страница ${i} ─────\n` + lines.join('\n'));
        }
        const text = parts.join('\n');
        out.setValue(text.trim());
        const meta = await doc.getMetadata().catch(() => ({ info: {} }));
        ctx.out.innerHTML = '';
        ctx.out.appendChild(ui.card([
          ui.h('Документ'),
          ui.kv([
            ['Файл', file.name],
            ['Страниц', String(doc.numPages)],
            ['Заголовок', (meta.info && meta.info.Title) || '—'],
            ['Автор', (meta.info && meta.info.Author) || '—'],
            ['Программа', (meta.info && meta.info.Producer) || '—'],
            ['Символов текста', fmtNum(text.length, 0)],
            ['Слов', fmtNum(text.trim().split(/\s+/).filter(Boolean).length, 0)]
          ])
        ]));
        ctx.out.appendChild(ui.card([
          out, ui.spacer(12),
          ui.btn('Скачать TXT', () => downloadText(out.getValue(), baseName(file.name) + '.txt'), { ghost: true })
        ]));
        if (!text.trim()) ctx.status.err('Текстового слоя нет — похоже, это скан');
        else ctx.status.ok('Извлечено ' + fmtNum(text.length, 0) + ' символов');
      }
    });
  }
});

/* ======================================================================
   Markdown-редактор
====================================================================== */
PT.tool({
  id: 'doc-markdown', cat: 'doc', icon: 'M',
  title: 'Markdown-редактор',
  desc: 'Живой предпросмотр, экспорт в HTML и печать в PDF, конвертация HTML обратно в Markdown.',
  keywords: ['markdown', 'md', 'readme', 'html', 'предпросмотр', 'редактор', 'документация'],
  render(root){
    const SAMPLE = `# Заголовок документа

Обычный текст с **жирным**, *курсивом* и \`кодом\`.

## Список дел
- [x] Написать документацию
- [ ] Проверить ссылки
- [ ] Выложить на сайт

## Таблица
| Инструмент | Категория |
|-----------|-----------|
| PixTool   | Утилиты   |

> Цитата для акцента.

\`\`\`js
console.log('Привет, PixTool');
\`\`\`
`;
    const input = el('textarea', { rows: 22, spellcheck: 'false', value: SAMPLE });
    const preview = el('div', { style: { padding: '18px', border: '1px solid var(--line)', borderRadius: '8px',
      background: 'var(--surface-2)', minHeight: '420px', overflow: 'auto', maxHeight: '640px' } });
    const status = ui.status();

    async function render(){
      await PT.need('marked');
      const html = marked.parse(input.value, { breaks: true, gfm: true });
      preview.innerHTML = html;
      preview.querySelectorAll('table').forEach(t => { t.className = 'data'; });
      preview.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
      const words = input.value.trim().split(/\s+/).filter(Boolean).length;
      status.set(`${words} слов · ${input.value.length} символов · ≈ ${Math.max(1, Math.round(words / 180))} мин чтения`);
    }
    input.addEventListener('input', debounce(render, 250));

    function fullHtml(){
      return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc((input.value.match(/^#\s+(.+)$/m) || [, 'Документ'])[1])}</title>
<style>
body{max-width:820px;margin:40px auto;padding:0 20px;font:16px/1.65 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1b1d21;}
pre{background:#f4f2ee;padding:14px;border-radius:8px;overflow:auto;}
code{background:#f4f2ee;padding:2px 5px;border-radius:4px;font-size:0.92em;}
pre code{padding:0;background:none;}
table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;}
th{background:#f4f2ee;}blockquote{border-left:3px solid #e8a33d;margin:0;padding:4px 16px;color:#555;}
img{max-width:100%;}h1,h2,h3{line-height:1.25;}
</style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;
    }

    const actions = el('div', { class: 'row gap' }, [
      ui.btn('Скачать HTML', () => downloadText(fullHtml(), 'document.html', 'text/html')),
      ui.btn('Скачать Markdown', () => downloadText(input.value, 'document.md', 'text/markdown'), { ghost: true }),
      ui.btn('Печать / PDF', () => {
        const w = window.open('', '_blank');
        if (!w){ PT.toast('Браузер заблокировал новое окно', 'err'); return; }
        w.document.write(fullHtml());
        w.document.close();
        setTimeout(() => w.print(), 400);
      }, { ghost: true }),
      ui.btn('HTML → Markdown', async () => {
        await PT.need('turndown');
        const html = prompt('Вставь HTML-код:');
        if (!html) return;
        input.value = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(html);
        render();
      }, { ghost: true, small: true }),
      ui.btn('Загрузить .md', () => {
        const picker = el('input', { type: 'file', accept: '.md,.markdown,.txt', style: { display: 'none' } });
        picker.addEventListener('change', async () => {
          if (picker.files[0]){ input.value = await picker.files[0].text(); render(); }
        });
        document.body.appendChild(picker); picker.click(); picker.remove();
      }, { ghost: true, small: true })
    ]);

    root.appendChild(ui.card([
      el('div', { class: 'split' }, [
        el('div', {}, [el('label', { text: 'Markdown' }), input]),
        el('div', {}, [el('label', { text: 'Предпросмотр' }), preview])
      ]),
      ui.spacer(14), actions, status
    ]));
    render();
  }
});

/* ======================================================================
   Таблицы
====================================================================== */
PT.tool({
  id: 'doc-table', cat: 'doc', icon: '▦',
  title: 'Таблицы: CSV, Excel, JSON',
  desc: 'Просмотр с сортировкой и фильтром, конвертация между CSV, JSON, XLSX и Markdown.',
  keywords: ['csv', 'xlsx', 'excel', 'таблица', 'json', 'конвертация', 'markdown таблица', 'данные'],
  render(root){
    let rows = [], headers = [], sortKey = null, sortAsc = true, srcName = 'table';
    const status = ui.status();
    const tableBox = el('div');
    const filterIn = el('input', { type: 'search', placeholder: 'Фильтр по всем колонкам…' });
    const info = el('div');

    const drop = ui.drop({
      accept: '.csv,.tsv,.json,.xlsx,.xls',
      title: 'Перетащи таблицу',
      hint: 'CSV, TSV, JSON, XLSX, XLS',
      onFiles: async files => {
        const file = files[0];
        srcName = baseName(file.name);
        const ext = extOf(file.name);
        status.busy('Читаю файл');
        try{
          if (ext === 'xlsx' || ext === 'xls'){
            await PT.need('xlsx');
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          } else if (ext === 'json'){
            const data = JSON.parse(await file.text());
            rows = Array.isArray(data) ? data : [data];
          } else {
            rows = csvToObjects(await file.text());
          }
          if (!rows.length) throw new Error('В файле нет данных');
          headers = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
          paint();
          status.ok(`${rows.length} строк · ${headers.length} колонок`);
        } catch(err){
          status.err('Не удалось прочитать: ' + err.message);
        }
      }
    });

    function visibleRows(){
      const q = filterIn.value.trim().toLowerCase();
      let out = q ? rows.filter(r => headers.some(h => String(r[h] == null ? '' : r[h]).toLowerCase().includes(q))) : rows.slice();
      if (sortKey){
        out.sort((a, b) => {
          const x = a[sortKey], y = b[sortKey];
          const nx = parseFloat(x), ny = parseFloat(y);
          const cmp = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : String(x).localeCompare(String(y), 'ru', { numeric: true });
          return sortAsc ? cmp : -cmp;
        });
      }
      return out;
    }

    function paint(){
      const data = visibleRows();
      tableBox.innerHTML = '';
      const table = el('table', { class: 'data' }, [
        el('thead', {}, el('tr', {}, headers.map(h => el('th', {
          text: h + (sortKey === h ? (sortAsc ? '  ↑' : '  ↓') : ''),
          onclick: () => { if (sortKey === h) sortAsc = !sortAsc; else { sortKey = h; sortAsc = true; } paint(); }
        })))),
        el('tbody', {}, data.slice(0, 500).map(r => el('tr', {}, headers.map(h =>
          el('td', { text: r[h] == null ? '' : String(r[h]), title: String(r[h] == null ? '' : r[h]) })))))
      ]);
      tableBox.appendChild(el('div', { class: 'table-scroll' }, table));
      if (data.length > 500) tableBox.appendChild(ui.muted(`Показаны первые 500 строк из ${data.length}. В экспорт попадут все.`));

      info.innerHTML = '';
      const numericCols = headers.filter(h => rows.every(r => r[h] === '' || r[h] == null || !isNaN(parseFloat(r[h]))));
      const summary = [['Строк', String(rows.length)], ['Колонок', String(headers.length)],
                       ['Отфильтровано', String(data.length)]];
      numericCols.slice(0, 5).forEach(h => {
        const nums = rows.map(r => parseFloat(r[h])).filter(n => !isNaN(n));
        if (!nums.length) return;
        const sum = nums.reduce((a, b) => a + b, 0);
        summary.push([`«${h}»`, `сумма ${fmtNum(sum)} · среднее ${fmtNum(sum / nums.length)} · ` +
          `мин ${fmtNum(Math.min(...nums))} · макс ${fmtNum(Math.max(...nums))}`]);
      });
      info.appendChild(ui.kv(summary));
    }
    filterIn.addEventListener('input', debounce(paint, 200));

    function toMarkdown(data){
      const head = `| ${headers.join(' | ')} |`;
      const sep = `| ${headers.map(() => '---').join(' | ')} |`;
      const body = data.map(r => `| ${headers.map(h => String(r[h] == null ? '' : r[h]).replace(/\|/g, '\\|')).join(' | ')} |`);
      return [head, sep, ...body].join('\n');
    }

    const exportRow = el('div', { class: 'row gap' }, [
      ui.btn('CSV', () => downloadText(objectsToCSV(visibleRows()), srcName + '.csv', 'text/csv'), { ghost: true, small: true }),
      ui.btn('JSON', () => downloadText(JSON.stringify(visibleRows(), null, 2), srcName + '.json', 'application/json'), { ghost: true, small: true }),
      ui.btn('XLSX', async () => {
        await PT.need('xlsx');
        const ws = XLSX.utils.json_to_sheet(visibleRows());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), srcName + '.xlsx');
      }, { ghost: true, small: true }),
      ui.btn('Markdown', () => downloadText(toMarkdown(visibleRows()), srcName + '.md', 'text/markdown'), { ghost: true, small: true }),
      ui.btn('SQL', () => {
        const lines = visibleRows().map(r => `INSERT INTO ${srcName.replace(/\W/g, '_')} (${headers.join(', ')}) VALUES (` +
          headers.map(h => isNaN(parseFloat(r[h])) ? `'${String(r[h] == null ? '' : r[h]).replace(/'/g, "''")}'` : r[h]).join(', ') + ');');
        downloadText(lines.join('\n'), srcName + '.sql', 'text/plain');
      }, { ghost: true, small: true }),
      ui.btn('Копировать Markdown', () => copy(toMarkdown(visibleRows())), { ghost: true, small: true })
    ]);

    root.appendChild(ui.card([drop, ui.spacer(14), filterIn, status, ui.spacer(14), exportRow]));
    root.appendChild(ui.card([ui.h('Данные'), tableBox]));
    root.appendChild(ui.card([ui.h('Сводка'), info]));
  }
});

/* ======================================================================
   Конвертер документов
====================================================================== */
PT.tool({
  id: 'doc-convert', cat: 'doc', icon: '⇋',
  title: 'Конвертер документов',
  desc: 'Markdown, HTML, обычный текст и Word (.docx) — в любом сочетании.',
  keywords: ['docx', 'word', 'markdown', 'html', 'txt', 'конвертация', 'документ'],
  render(root){
    const status = ui.status();
    const out = ui.copyBox('', { label: 'Результат', rows: 16, editable: true });
    let currentName = 'document';

    const form = ui.form([
      { id: 'to', type: 'select', label: 'Во что превратить', col: 6, options: [
        ['md', 'Markdown (.md)'], ['html', 'HTML (.html)'], ['txt', 'Обычный текст (.txt)'], ['docx', 'Word (.docx)']
      ] }
    ]);

    async function readAny(file){
      const ext = extOf(file.name);
      if (ext === 'docx'){
        const files = await unzip(file);
        const xml = new TextDecoder().decode(files['word/document.xml'] || new Uint8Array());
        if (!xml) throw new Error('Это не похоже на .docx');
        const paragraphs = xml.split(/<w:p[ >]/).slice(1).map(p => {
          const texts = Array.from(p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]);
          const isHeading = /<w:pStyle[^>]*w:val="(Heading|Заголовок)/.test(p);
          const text = texts.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          return isHeading && text ? '## ' + text : text;
        });
        return { md: paragraphs.filter(p => p !== '').join('\n\n'), kind: 'md' };
      }
      const text = await file.text();
      if (ext === 'html' || ext === 'htm'){
        await PT.need('turndown');
        return { md: new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(text), kind: 'html', html: text };
      }
      if (ext === 'md' || ext === 'markdown') return { md: text, kind: 'md' };
      return { md: text, kind: 'txt' };
    }

    function buildDocx(markdown){
      const escXml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const paragraphs = markdown.split('\n').map(line => {
        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        if (heading){
          return `<w:p><w:pPr><w:pStyle w:val="Heading${heading[1].length}"/></w:pPr>` +
                 `<w:r><w:rPr><w:b/><w:sz w:val="${34 - heading[1].length * 4}"/></w:rPr>` +
                 `<w:t xml:space="preserve">${escXml(heading[2])}</w:t></w:r></w:p>`;
        }
        const bullet = line.match(/^[-*]\s+(.*)$/);
        const text = bullet ? '• ' + bullet[1] : line;
        return `<w:p><w:r><w:t xml:space="preserve">${escXml(text.replace(/[*_`]/g, ''))}</w:t></w:r></w:p>`;
      }).join('');

      const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr></w:body>
</w:document>`;
      const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
      const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
      return zip([
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rels },
        { name: 'word/document.xml', data: document }
      ]);
    }

    PT.fileTool(root, {
      accept: '.md,.markdown,.html,.htm,.txt,.docx',
      title: 'Перетащи документ',
      hint: 'Markdown, HTML, TXT или Word (.docx)',
      async onFiles(file, ctx){
        currentName = baseName(file.name);
        const parsed = await readAny(file);
        const v = form.values();
        if (v.to === 'md'){ out.setValue(parsed.md); }
        else if (v.to === 'html'){
          await PT.need('marked');
          out.setValue(marked.parse(parsed.md));
        } else if (v.to === 'txt'){
          out.setValue(parsed.md.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1'));
        } else {
          const blob = await buildDocx(parsed.md);
          downloadBlob(blob, currentName + '.docx');
          out.setValue(parsed.md);
        }
        ctx.status.ok('Конвертировано');
      }
    });

    root.appendChild(ui.card([
      form, ui.spacer(14), out, ui.spacer(12),
      el('div', { class: 'row gap' }, [
        ui.btn('Скачать результат', async () => {
          const v = form.values();
          if (v.to === 'docx'){ downloadBlob(await buildDocx(out.getValue()), currentName + '.docx'); return; }
          const types = { md: 'text/markdown', html: 'text/html', txt: 'text/plain' };
          downloadText(out.getValue(), currentName + '.' + v.to, types[v.to]);
        }),
        ui.btn('Преобразовать текст из поля', async () => {
          const v = form.values();
          if (v.to === 'html'){ await PT.need('marked'); out.setValue(marked.parse(out.getValue())); }
          else if (v.to === 'md'){ await PT.need('turndown'); out.setValue(new TurndownService().turndown(out.getValue())); }
          status.ok('Готово');
        }, { ghost: true }),
      ]),
      status,
      ui.muted('.docx собирается по стандарту OOXML — открывается в Word, LibreOffice и Google Документах. ' +
               'Сложное форматирование при конвертации упрощается.')
    ]));
  }
});


/* ===== tools/60-util.js ===== */
/* ======================================================================
   ИНСТРУМЕНТЫ: УТИЛИТЫ
====================================================================== */

/* ======================================================================
   QR-коды: генератор и сканер
====================================================================== */
PT.tool({
  id: 'util-qr', cat: 'util', icon: '▚',
  title: 'QR-коды: создать и прочитать',
  desc: 'Генератор с логотипом, цветами и шаблонами Wi-Fi, визитки, SMS — плюс сканер через камеру.',
  keywords: ['qr', 'qr-код', 'сканер', 'wifi', 'визитка', 'vcard', 'ссылка', 'штрихкод'],
  render(root){
    let logo = null, matrix = null;
    const status = ui.status();
    const canvas = el('canvas', { style: { maxWidth: '100%', borderRadius: '8px', imageRendering: 'pixelated' } });
    const textIn = el('textarea', { rows: 3, spellcheck: 'false', value: 'https://pixset.dev' });

    const form = ui.form([
      { id: 'preset', type: 'select', label: 'Шаблон', col: 4, options: [
        ['text', 'Текст или ссылка'], ['wifi', 'Wi-Fi'], ['vcard', 'Контакт (визитка)'],
        ['sms', 'SMS'], ['mail', 'E-mail'], ['geo', 'Геолокация'], ['tel', 'Телефон']
      ] },
      { id: 'size', type: 'number', label: 'Размер, px', col: 4, value: 512, min: 128, max: 2048, step: 64 },
      { id: 'ec', type: 'select', label: 'Коррекция ошибок', col: 4, value: 'M', options: [
        ['L', 'L — 7% (максимум данных)'], ['M', 'M — 15%'], ['Q', 'Q — 25%'], ['H', 'H — 30% (для логотипа)']
      ] },
      { id: 'dark', type: 'color', label: 'Цвет кода', col: 4, value: '#101216' },
      { id: 'light', type: 'color', label: 'Фон', col: 4, value: '#ffffff' },
      { id: 'margin', type: 'range', label: 'Поля', col: 4, min: 0, max: 8, value: 4, unit: ' мод.' },
      { id: 'style', type: 'select', label: 'Стиль модулей', col: 4, options: [
        ['square', 'Квадраты'], ['dots', 'Точки'], ['rounded', 'Скруглённые']
      ] },
      { id: 'transparent', type: 'checkbox', label: 'Прозрачный фон (PNG)', col: 4 }
    ], () => generate());

    /* поля шаблонов */
    const presetForms = {
      wifi: ui.form([
        { id: 'ssid', type: 'text', label: 'Имя сети (SSID)', col: 6, value: '' },
        { id: 'pass', type: 'text', label: 'Пароль', col: 6, value: '' },
        { id: 'enc', type: 'select', label: 'Шифрование', col: 6, options: [['WPA', 'WPA/WPA2'], ['WEP', 'WEP'], ['nopass', 'Без пароля']] },
        { id: 'hidden', type: 'checkbox', label: 'Скрытая сеть', col: 6 }
      ], () => generate()),
      vcard: ui.form([
        { id: 'name', type: 'text', label: 'Имя и фамилия', col: 6, value: '' },
        { id: 'org', type: 'text', label: 'Компания', col: 6, value: '' },
        { id: 'title', type: 'text', label: 'Должность', col: 6, value: '' },
        { id: 'phone', type: 'text', label: 'Телефон', col: 6, value: '' },
        { id: 'email', type: 'text', label: 'E-mail', col: 6, value: '' },
        { id: 'site', type: 'text', label: 'Сайт', col: 6, value: '' }
      ], () => generate()),
      sms: ui.form([
        { id: 'phone', type: 'text', label: 'Номер', col: 6, value: '' },
        { id: 'text', type: 'text', label: 'Текст сообщения', col: 6, value: '' }
      ], () => generate()),
      mail: ui.form([
        { id: 'to', type: 'text', label: 'Кому', col: 4, value: '' },
        { id: 'subject', type: 'text', label: 'Тема', col: 4, value: '' },
        { id: 'body', type: 'text', label: 'Текст', col: 4, value: '' }
      ], () => generate()),
      geo: ui.form([
        { id: 'lat', type: 'text', label: 'Широта', col: 6, value: '55.7558' },
        { id: 'lon', type: 'text', label: 'Долгота', col: 6, value: '37.6173' }
      ], () => generate()),
      tel: ui.form([
        { id: 'phone', type: 'text', label: 'Номер телефона', col: 12, value: '+7' }
      ], () => generate())
    };
    const presetBox = el('div');

    function payload(){
      const v = form.values();
      const escapeWifi = s => String(s).replace(/([\\;,:"])/g, '\\$1');
      if (v.preset === 'text') return textIn.value;
      const f = presetForms[v.preset].values();
      if (v.preset === 'wifi')
        return `WIFI:T:${f.enc};S:${escapeWifi(f.ssid)};${f.enc === 'nopass' ? '' : 'P:' + escapeWifi(f.pass) + ';'}${f.hidden ? 'H:true;' : ''};`;
      if (v.preset === 'vcard')
        return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${f.name}`, f.org ? `ORG:${f.org}` : '', f.title ? `TITLE:${f.title}` : '',
                f.phone ? `TEL:${f.phone}` : '', f.email ? `EMAIL:${f.email}` : '', f.site ? `URL:${f.site}` : '', 'END:VCARD']
               .filter(Boolean).join('\n');
      if (v.preset === 'sms') return `SMSTO:${f.phone}:${f.text}`;
      if (v.preset === 'mail') return `mailto:${f.to}?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.body)}`;
      if (v.preset === 'geo') return `geo:${f.lat},${f.lon}`;
      return `tel:${f.phone}`;
    }

    async function generate(){
      const v = form.values();
      presetBox.innerHTML = '';
      if (v.preset !== 'text') presetBox.appendChild(presetForms[v.preset]);
      textIn.parentElement.style.display = v.preset === 'text' ? '' : 'none';

      const data = payload();
      if (!data || !data.trim()){ status.set('Введи данные для кода'); return; }
      try{
        await PT.need('qrgen');
        const qr = qrcode(0, v.ec);
        qr.addData(data);
        qr.make();
        matrix = qr;
        draw(qr, v);
        status.ok(`Готово · ${qr.getModuleCount()}×${qr.getModuleCount()} модулей · ${data.length} символов`);
      } catch(err){
        status.err(err.message.includes('overflow') || err.message.includes('long')
          ? 'Слишком много данных для QR-кода — сократи текст или понизь коррекцию ошибок'
          : 'Ошибка: ' + err.message);
      }
    }

    function draw(qr, v){
      const count = qr.getModuleCount();
      const margin = v.margin;
      const total = count + margin * 2;
      const cell = Math.max(1, Math.floor(v.size / total));
      const size = cell * total;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!v.transparent){ ctx.fillStyle = v.light; ctx.fillRect(0, 0, size, size); }
      else ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = v.dark;
      for (let r = 0; r < count; r++){
        for (let c = 0; c < count; c++){
          if (!qr.isDark(r, c)) continue;
          const x = (c + margin) * cell, y = (r + margin) * cell;
          if (v.style === 'dots'){
            ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell / 2 * 0.92, 0, Math.PI * 2); ctx.fill();
          } else if (v.style === 'rounded'){
            const r2 = cell * 0.3;
            ctx.beginPath();
            if (ctx.roundRect) { ctx.roundRect(x, y, cell, cell, r2); ctx.fill(); }
            else ctx.fillRect(x, y, cell, cell);
          } else ctx.fillRect(x, y, cell, cell);
        }
      }
      if (logo){
        const logoSize = size * 0.22;
        const lx = (size - logoSize) / 2, ly = (size - logoSize) / 2;
        ctx.fillStyle = v.transparent ? '#ffffff' : v.light;
        ctx.fillRect(lx - cell, ly - cell, logoSize + cell * 2, logoSize + cell * 2);
        ctx.drawImage(logo, lx, ly, logoSize, logoSize);
      }
    }

    function svgString(){
      if (!matrix) return '';
      const v = form.values();
      const count = matrix.getModuleCount();
      const total = count + v.margin * 2;
      let paths = '';
      for (let r = 0; r < count; r++)
        for (let c = 0; c < count; c++)
          if (matrix.isDark(r, c)) paths += `M${c + v.margin},${r + v.margin}h1v1h-1z`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${v.size}" height="${v.size}" shape-rendering="crispEdges">` +
             (v.transparent ? '' : `<rect width="${total}" height="${total}" fill="${v.light}"/>`) +
             `<path d="${paths}" fill="${v.dark}"/></svg>`;
    }

    const logoDrop = ui.drop({
      accept: 'image/*', title: 'Логотип в центр (необязательно)',
      hint: 'при логотипе ставь коррекцию H',
      onFiles: async files => { logo = await loadImage(files[0]); form.set('ec', 'H'); generate(); }
    });

    root.appendChild(ui.card([
      ui.h('Генератор'),
      form, presetBox,
      el('div', {}, [el('label', { text: 'Текст или ссылка' }), textIn]),
      ui.spacer(14),
      el('div', { class: 'grid cols-2' }, [
        el('div', { style: { display: 'grid', placeItems: 'center' } }, canvas),
        el('div', {}, [
          logoDrop, ui.spacer(12),
          el('div', { class: 'row gap' }, [
            ui.btn('Скачать PNG', async () => downloadBlob(await canvasToBlob(canvas, 'image/png'), 'qr-code.png')),
            ui.btn('Скачать SVG', () => downloadText(svgString(), 'qr-code.svg', 'image/svg+xml'), { ghost: true }),
            ui.btn('Убрать логотип', () => { logo = null; generate(); }, { ghost: true, small: true })
          ]),
          ui.spacer(12), status
        ])
      ])
    ]));

    /* ---------- сканер ---------- */
    const scanStatus = ui.status();
    const scanOut = el('div');
    const video = el('video', { playsinline: true, muted: true,
      style: { width: '100%', maxWidth: '420px', borderRadius: '8px', display: 'none', background: '#000' } });
    let scanning = false, scanStream = null;

    async function startScan(){
      await PT.need('jsqr');
      try{
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch(e){ scanStatus.err('Камера недоступна: ' + e.message); return; }
      video.srcObject = scanStream;
      video.style.display = 'block';
      await video.play();
      scanning = true;
      scanStatus.busy('Наведи камеру на код');
      const work = makeCanvas(1, 1);
      const tick = () => {
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA){
          work.width = video.videoWidth; work.height = video.videoHeight;
          const ctx = work.getContext('2d');
          ctx.drawImage(video, 0, 0);
          const data = ctx.getImageData(0, 0, work.width, work.height);
          const found = jsQR(data.data, data.width, data.height);
          if (found){ showScan(found.data); stopScan(); return; }
        }
        requestAnimationFrame(tick);
      };
      tick();
    }
    function stopScan(){
      scanning = false;
      if (scanStream) scanStream.getTracks().forEach(t => t.stop());
      video.style.display = 'none';
    }
    function showScan(text){
      scanOut.innerHTML = '';
      scanOut.appendChild(ui.copyBox(text, { label: 'Содержимое кода', rows: 4 }));
      if (/^https?:\/\//i.test(text)){
        scanOut.appendChild(ui.spacer(10));
        scanOut.appendChild(el('a', { href: text, target: '_blank', rel: 'noopener noreferrer',
          class: 'download-link', text: 'Открыть ссылку' }));
        scanOut.appendChild(ui.muted('Проверь адрес перед переходом — QR-коды часто ведут на фишинговые сайты.'));
      }
      scanStatus.ok('Код прочитан');
    }
    PT.onCleanup(stopScan);

    root.appendChild(ui.card([
      ui.h('Сканер', 'Через камеру или из файла с картинкой'),
      el('div', { class: 'row gap' }, [
        ui.btn('Включить камеру', startScan),
        ui.btn('Остановить', stopScan, { ghost: true, small: true })
      ]),
      ui.spacer(12), video, ui.spacer(12),
      ui.drop({
        accept: 'image/*', title: 'Или перетащи картинку с QR-кодом',
        onFiles: async files => {
          await PT.need('jsqr');
          const img = await loadImage(files[0]);
          const c = imgToCanvas(img);
          const data = c.getContext('2d').getImageData(0, 0, c.width, c.height);
          const found = jsQR(data.data, data.width, data.height);
          if (found) showScan(found.data);
          else scanStatus.err('QR-код не найден на изображении');
        }
      }),
      scanStatus, scanOut
    ]));

    generate();
  }
});

/* ======================================================================
   Пароли
====================================================================== */
PT.tool({
  id: 'util-password', cat: 'util', icon: '✳',
  title: 'Генератор паролей',
  desc: 'Пароли, парольные фразы и PIN-коды с оценкой стойкости и подсчётом энтропии.',
  keywords: ['пароль', 'password', 'генератор', 'стойкость', 'энтропия', 'парольная фраза', 'pin'],
  render(root){
    const out = ui.copyBox('', { label: 'Результат', rows: 8 });
    const meter = el('div');
    const WORDS = ('якорь ветер сокол камень поле роса берег туман кедр пламя зерно ирис лотос мрамор нефрит облако ' +
      'парус ручей север титан утёс фонарь холст цапля чайка шторм щит эхо юрта ясень аметист базальт вишня гранит ' +
      'дюна ель жемчуг закат изумруд кобальт луна мята нить осень пепел рубин соль тополь урожай фиалка хвоя цикада').split(' ');

    const form = ui.form([
      { id: 'mode', type: 'select', label: 'Тип', col: 4, options: [
        ['random', 'Случайный пароль'], ['phrase', 'Парольная фраза'], ['pin', 'PIN-код'], ['memorable', 'Произносимый']
      ] },
      { id: 'length', type: 'range', label: 'Длина', col: 4, min: 4, max: 96, value: 20 },
      { id: 'count', type: 'number', label: 'Сколько сгенерировать', col: 4, value: 5, min: 1, max: 100 },
      { id: 'words', type: 'range', label: 'Слов во фразе', col: 4, min: 3, max: 10, value: 4 },
      { id: 'sep', type: 'text', label: 'Разделитель слов', col: 4, value: '-' },
      { id: 'upper', type: 'checkbox', label: 'Заглавные A–Z', col: 3, value: true },
      { id: 'lower', type: 'checkbox', label: 'Строчные a–z', col: 3, value: true },
      { id: 'digits', type: 'checkbox', label: 'Цифры 0–9', col: 3, value: true },
      { id: 'symbols', type: 'checkbox', label: 'Символы !@#$', col: 3, value: true },
      { id: 'noAmbiguous', type: 'checkbox', label: 'Без похожих символов (0/O, 1/l/I)', col: 6, value: true }
    ], generate);

    function randomInt(max){
      const arr = new Uint32Array(1);
      const limit = Math.floor(0xFFFFFFFF / max) * max;
      let v;
      do { crypto.getRandomValues(arr); v = arr[0]; } while (v >= limit);
      return v % max;
    }

    function makeOne(v){
      if (v.mode === 'phrase'){
        const parts = Array.from({ length: v.words }, () => WORDS[randomInt(WORDS.length)]);
        if (v.upper) parts[randomInt(parts.length)] = parts[0].toUpperCase();
        if (v.digits) parts.push(String(randomInt(100)));
        return parts.join(v.sep || '-');
      }
      if (v.mode === 'pin'){
        return Array.from({ length: Math.max(4, Math.min(v.length, 16)) }, () => randomInt(10)).join('');
      }
      if (v.mode === 'memorable'){
        const cons = 'bcdfghjklmnpqrstvwxz', vow = 'aeiouy';
        let s = '';
        while (s.length < v.length){
          s += cons[randomInt(cons.length)] + vow[randomInt(vow.length)];
          if (s.length % 6 === 0 && v.digits) s += randomInt(10);
        }
        s = s.slice(0, v.length);
        return v.upper ? s[0].toUpperCase() + s.slice(1) : s;
      }
      let chars = '';
      if (v.upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (v.lower) chars += 'abcdefghijklmnopqrstuvwxyz';
      if (v.digits) chars += '0123456789';
      if (v.symbols) chars += '!@#$%^&*()-_=+[]{};:,.<>?';
      if (v.noAmbiguous) chars = chars.replace(/[0O1lI|`'".,;:]/g, '');
      if (!chars) return '(выбери хотя бы один набор символов)';
      return Array.from({ length: v.length }, () => chars[randomInt(chars.length)]).join('');
    }

    function entropyOf(pass, v){
      if (v.mode === 'phrase') return Math.log2(WORDS.length) * v.words + (v.digits ? 6.6 : 0);
      let pool = 0;
      if (/[a-z]/.test(pass)) pool += 26;
      if (/[A-Z]/.test(pass)) pool += 26;
      if (/[0-9]/.test(pass)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(pass)) pool += 24;
      return pass.length * Math.log2(Math.max(pool, 2));
    }

    function generate(){
      const v = form.values();
      form.show('length', v.mode !== 'phrase');
      form.show('words', v.mode === 'phrase');
      form.show('sep', v.mode === 'phrase');
      const list = Array.from({ length: clamp(v.count, 1, 100) }, () => makeOne(v));
      out.setValue(list.join('\n'));

      const bits = entropyOf(list[0], v);
      const guesses = Math.pow(2, bits);
      const perSec = 1e11;                                    // современная видеокарта, оффлайн-перебор
      const seconds = guesses / perSec;
      const label = bits < 40 ? 'Очень слабый' : bits < 60 ? 'Слабый' : bits < 80 ? 'Средний' : bits < 100 ? 'Хороший' : 'Отличный';
      const kind = bits < 60 ? 'err' : bits < 80 ? 'warn' : 'ok';
      meter.innerHTML = '';
      meter.appendChild(ui.kv([
        ['Стойкость', label],
        ['Энтропия', bits.toFixed(1) + ' бит'],
        ['Длина', String(list[0].length)],
        ['Подбор перебором', humanTime(seconds)]
      ]));
      meter.appendChild(ui.spacer(10));
      const bar = el('div', { class: 'progress', style: { display: 'block' } },
        el('i', { style: { width: clamp(bits / 128 * 100, 2, 100) + '%',
          background: kind === 'err' ? 'var(--danger)' : kind === 'warn' ? 'var(--accent)' : 'var(--teal)' } }));
      meter.appendChild(bar);
    }

    function humanTime(sec){
      if (sec < 1) return 'мгновенно';
      const units = [[31536000 * 1000, 'тысяч лет'], [31536000, 'лет'], [86400, 'дней'], [3600, 'часов'], [60, 'минут'], [1, 'секунд']];
      for (const [size, name] of units){
        if (sec >= size){
          const n = sec / size;
          return (n > 1e9 ? n.toExponential(1) : fmtNum(n, 0)) + ' ' + name;
        }
      }
      return 'мгновенно';
    }

    root.appendChild(ui.card([
      form, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Сгенерировать', generate),
        ui.btn('Копировать первый', () => copy(out.getValue().split('\n')[0]), { ghost: true, small: true }),
        ui.btn('Скачать список', () => downloadText(out.getValue(), 'passwords.txt'), { ghost: true, small: true })
      ]),
      ui.spacer(14), out
    ]));
    root.appendChild(ui.card([ui.h('Оценка стойкости', 'Расчёт для первого пароля в списке'), meter,
      ui.spacer(12),
      ui.muted('Пароли создаются через crypto.getRandomValues прямо в браузере и никуда не отправляются. ' +
               'Оценка перебора дана для 100 млрд попыток в секунду — это уровень серьёзной атаки на утёкшую базу.')]));
    generate();
  }
});

/* ======================================================================
   Конвертер единиц
====================================================================== */
PT.tool({
  id: 'util-units', cat: 'util', icon: '⚖',
  title: 'Конвертер величин',
  desc: 'Длина, вес, объём, площадь, температура, скорость, данные, время и давление.',
  keywords: ['конвертер', 'единицы', 'метры', 'футы', 'килограммы', 'температура', 'мегабайты', 'мили'],
  render(root){
    const UNITS = {
      length: { title: 'Длина', base: 'м', items: { 'мм': 0.001, 'см': 0.01, 'м': 1, 'км': 1000,
        'дюйм': 0.0254, 'фут': 0.3048, 'ярд': 0.9144, 'миля': 1609.344, 'морская миля': 1852 } },
      mass: { title: 'Масса', base: 'кг', items: { 'мг': 1e-6, 'г': 0.001, 'кг': 1, 'т': 1000,
        'унция': 0.0283495, 'фунт': 0.453592, 'стоун': 6.35029, 'карат': 0.0002 } },
      volume: { title: 'Объём', base: 'л', items: { 'мл': 0.001, 'л': 1, 'м³': 1000,
        'чайная ложка': 0.00492892, 'столовая ложка': 0.0147868, 'стакан (US)': 0.236588,
        'пинта (US)': 0.473176, 'галлон (US)': 3.78541 } },
      area: { title: 'Площадь', base: 'м²', items: { 'см²': 0.0001, 'м²': 1, 'сотка': 100, 'га': 10000,
        'км²': 1e6, 'фут²': 0.092903, 'акр': 4046.86 } },
      speed: { title: 'Скорость', base: 'м/с', items: { 'м/с': 1, 'км/ч': 0.277778, 'миль/ч': 0.44704,
        'узел': 0.514444, 'мах': 340.29 } },
      data: { title: 'Данные', base: 'байт', items: { 'бит': 0.125, 'байт': 1, 'КБ': 1024, 'МБ': 1048576,
        'ГБ': 1073741824, 'ТБ': 1099511627776, 'ПБ': 1125899906842624 } },
      time: { title: 'Время', base: 'сек', items: { 'мс': 0.001, 'сек': 1, 'мин': 60, 'час': 3600,
        'сутки': 86400, 'неделя': 604800, 'месяц (30д)': 2592000, 'год': 31536000 } },
      pressure: { title: 'Давление', base: 'Па', items: { 'Па': 1, 'кПа': 1000, 'бар': 100000,
        'атм': 101325, 'мм рт. ст.': 133.322, 'psi': 6894.76 } },
      energy: { title: 'Энергия', base: 'Дж', items: { 'Дж': 1, 'кДж': 1000, 'кал': 4.184, 'ккал': 4184,
        'Вт·ч': 3600, 'кВт·ч': 3600000 } }
    };

    const catSel = ui.form([
      { id: 'cat', type: 'select', label: 'Категория', col: 6, options:
        Object.entries(UNITS).map(([k, v]) => [k, v.title]).concat([['temp', 'Температура']]) },
      { id: 'value', type: 'number', label: 'Значение', col: 6, value: 1, step: 'any' }
    ], render);
    const out = el('div');

    function render(){
      const v = catSel.values();
      out.innerHTML = '';
      if (v.cat === 'temp'){
        const c = v.value;
        out.appendChild(ui.kv([
          ['Цельсий °C', fmtNum(c, 2)],
          ['Фаренгейт °F', fmtNum(c * 9 / 5 + 32, 2)],
          ['Кельвин K', fmtNum(c + 273.15, 2)],
          ['Реомюр °Ré', fmtNum(c * 0.8, 2)]
        ]));
        out.appendChild(ui.muted('Ввод трактуется как градусы Цельсия.'));
        return;
      }
      const group = UNITS[v.cat];
      const fromSel = el('select', {}, Object.keys(group.items).map(u => el('option', { value: u, text: u })));
      fromSel.value = group.base;
      const table = el('div');
      const recalc = () => {
        const inBase = v.value * group.items[fromSel.value];
        table.innerHTML = '';
        table.appendChild(ui.kv(Object.entries(group.items).map(([unit, k]) => {
          const val = inBase / k;
          const shown = Math.abs(val) >= 1e9 || (Math.abs(val) < 1e-4 && val !== 0)
            ? val.toExponential(4) : fmtNum(val, 6);
          return [unit, shown];
        })));
      };
      fromSel.addEventListener('change', recalc);
      out.appendChild(el('div', {}, [el('label', { text: 'Единица введённого значения' }), fromSel]));
      out.appendChild(ui.spacer(14));
      out.appendChild(table);
      recalc();
    }

    root.appendChild(ui.card([catSel, ui.spacer(14), out]));
  }
});

/* ======================================================================
   Проценты и расчёты
====================================================================== */
PT.tool({
  id: 'util-percent', cat: 'util', icon: '%',
  title: 'Проценты и расчёты',
  desc: 'Скидки, НДС, наценка, изменение в процентах, пропорции и разбивка суммы на части.',
  keywords: ['процент', 'скидка', 'ндс', 'наценка', 'пропорция', 'калькулятор', 'выгода'],
  render(root){
    const out = el('div');
    const form = ui.form([
      { id: 'op', type: 'select', label: 'Задача', col: 6, options: [
        ['of', 'Сколько будет X% от числа'], ['what', 'Какой процент одно число от другого'],
        ['change', 'На сколько % изменилось'], ['discount', 'Цена со скидкой'],
        ['markup', 'Цена с наценкой'], ['vat', 'НДС'], ['proportion', 'Пропорция (X отн. к Y)']
      ] },
      { id: 'a', type: 'number', label: 'Число A', col: 3, value: 1000, step: 'any' },
      { id: 'b', type: 'number', label: 'Число B / процент', col: 3, value: 20, step: 'any' },
      { id: 'vatRate', type: 'number', label: 'Ставка НДС, %', col: 3, value: 20, step: 'any' },
      { id: 'vatMode', type: 'select', label: 'НДС', col: 3, options: [['add', 'Начислить сверху'], ['extract', 'Выделить из суммы']] }
    ], calc);

    function calc(){
      const v = form.values();
      form.show('vatRate', v.op === 'vat');
      form.show('vatMode', v.op === 'vat');
      const rows = [];
      const a = v.a, b = v.b;
      switch (v.op){
        case 'of':
          rows.push([`${b}% от ${fmtNum(a)}`, fmtNum(a * b / 100)]);
          rows.push(['Остаток', fmtNum(a - a * b / 100)]);
          break;
        case 'what':
          rows.push([`${fmtNum(a)} от ${fmtNum(b)}`, b ? fmtNum(a / b * 100) + '%' : '—']);
          rows.push(['Обратно', a ? fmtNum(b / a * 100) + '%' : '—']);
          break;
        case 'change': {
          const diff = b - a;
          rows.push(['Изменение', fmtNum(diff)]);
          rows.push(['В процентах', a ? (diff >= 0 ? '+' : '') + fmtNum(diff / Math.abs(a) * 100) + '%' : '—']);
          rows.push(['Во сколько раз', a ? fmtNum(b / a) + '×' : '—']);
          break;
        }
        case 'discount':
          rows.push(['Цена без скидки', fmtNum(a)]);
          rows.push([`Скидка ${b}%`, fmtNum(a * b / 100)]);
          rows.push(['Итоговая цена', fmtNum(a * (1 - b / 100))]);
          break;
        case 'markup':
          rows.push(['Себестоимость', fmtNum(a)]);
          rows.push([`Наценка ${b}%`, fmtNum(a * b / 100)]);
          rows.push(['Цена продажи', fmtNum(a * (1 + b / 100))]);
          rows.push(['Маржа от цены', fmtNum(b / (100 + b) * 100) + '%']);
          break;
        case 'vat': {
          const rate = v.vatRate;
          if (v.vatMode === 'add'){
            rows.push(['Сумма без НДС', fmtNum(a)]);
            rows.push([`НДС ${rate}%`, fmtNum(a * rate / 100)]);
            rows.push(['Итого с НДС', fmtNum(a * (1 + rate / 100))]);
          } else {
            const net = a / (1 + rate / 100);
            rows.push(['Сумма с НДС', fmtNum(a)]);
            rows.push([`НДС ${rate}% в составе`, fmtNum(a - net)]);
            rows.push(['Сумма без НДС', fmtNum(net)]);
          }
          break;
        }
        default:
          rows.push(['Отношение', b ? fmtNum(a / b) : '—']);
          rows.push(['В процентах', b ? fmtNum(a / b * 100) + '%' : '—']);
          rows.push(['Доля A', fmtNum(a / (a + b) * 100) + '%']);
          rows.push(['Доля B', fmtNum(b / (a + b) * 100) + '%']);
      }
      out.innerHTML = '';
      out.appendChild(ui.kv(rows));
    }

    root.appendChild(ui.card([form, ui.spacer(14), out]));
    calc();
  }
});

/* ======================================================================
   Случайный выбор
====================================================================== */
PT.tool({
  id: 'util-random', cat: 'util', icon: '⚂',
  title: 'Жребий и случайность',
  desc: 'Числа, монетка, кубики, выбор из списка и перемешивание — на честном генераторе.',
  keywords: ['случайное', 'random', 'жребий', 'монетка', 'кубик', 'выбрать', 'розыгрыш', 'перемешать'],
  render(root){
    const bigOut = el('div', { style: { fontFamily: 'var(--mono)', fontSize: '38px', textAlign: 'center',
      padding: '26px', border: '1px solid var(--line)', borderRadius: '10px', background: 'var(--surface-2)',
      wordBreak: 'break-word', minHeight: '104px', display: 'grid', placeItems: 'center' }, text: '—' });
    const history = el('div');
    const log = [];
    const listIn = el('textarea', { rows: 7, placeholder: 'По одному варианту в строке…',
      value: 'Пицца\nСуши\nБургеры\nПаста' });

    const form = ui.form([
      { id: 'mode', type: 'select', label: 'Что бросаем', col: 4, options: [
        ['number', 'Случайное число'], ['coin', 'Монетка'], ['dice', 'Кубики'],
        ['list', 'Выбор из списка'], ['shuffle', 'Перемешать список'], ['teams', 'Разбить на команды']
      ] },
      { id: 'min', type: 'number', label: 'От', col: 4, value: 1 },
      { id: 'max', type: 'number', label: 'До', col: 4, value: 100 },
      { id: 'dice', type: 'select', label: 'Кубик', col: 4, value: '6', options: [['4', 'd4'], ['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12'], ['20', 'd20'], ['100', 'd100']] },
      { id: 'count', type: 'number', label: 'Сколько бросков / команд', col: 4, value: 1, min: 1, max: 50 },
      { id: 'unique', type: 'checkbox', label: 'Без повторов', col: 4, value: false }
    ], () => { const v = form.values(); toggle(v); });

    function toggle(v){
      form.show('min', v.mode === 'number');
      form.show('max', v.mode === 'number');
      form.show('dice', v.mode === 'dice');
      form.show('unique', v.mode === 'number' || v.mode === 'list');
      listBox.style.display = ['list', 'shuffle', 'teams'].includes(v.mode) ? '' : 'none';
    }
    const listBox = el('div', {}, [el('label', { text: 'Список вариантов' }), listIn]);

    function rnd(max){
      const arr = new Uint32Array(1);
      const limit = Math.floor(0xFFFFFFFF / max) * max;
      let x;
      do { crypto.getRandomValues(arr); x = arr[0]; } while (x >= limit);
      return x % max;
    }

    function roll(){
      const v = form.values();
      const items = listIn.value.split('\n').map(s => s.trim()).filter(Boolean);
      let result = '';
      if (v.mode === 'number'){
        const lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max);
        const span = hi - lo + 1;
        if (v.unique && v.count <= span){
          const pool = Array.from({ length: span }, (_, i) => lo + i);
          const picked = [];
          for (let i = 0; i < v.count; i++) picked.push(pool.splice(rnd(pool.length), 1)[0]);
          result = picked.join(', ');
        } else result = Array.from({ length: v.count }, () => lo + rnd(span)).join(', ');
      } else if (v.mode === 'coin'){
        result = Array.from({ length: v.count }, () => rnd(2) ? 'Орёл' : 'Решка').join(', ');
      } else if (v.mode === 'dice'){
        const faces = Number(v.dice);
        const rolls = Array.from({ length: v.count }, () => 1 + rnd(faces));
        result = rolls.join(' + ') + (v.count > 1 ? ' = ' + rolls.reduce((a, b) => a + b, 0) : '');
      } else if (v.mode === 'list'){
        if (!items.length){ result = 'Список пуст'; }
        else if (v.unique && v.count <= items.length){
          const pool = items.slice();
          result = Array.from({ length: v.count }, () => pool.splice(rnd(pool.length), 1)[0]).join(', ');
        } else result = Array.from({ length: v.count }, () => items[rnd(items.length)]).join(', ');
      } else if (v.mode === 'shuffle'){
        const a = items.slice();
        for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
        result = a.join('\n');
      } else {
        const a = items.slice();
        for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
        const teams = Array.from({ length: Math.max(1, v.count) }, () => []);
        a.forEach((item, i) => teams[i % teams.length].push(item));
        result = teams.map((t, i) => `Команда ${i + 1}: ${t.join(', ')}`).join('\n');
      }
      bigOut.style.fontSize = result.length > 40 ? '15px' : result.length > 16 ? '24px' : '38px';
      bigOut.style.whiteSpace = 'pre-line';
      bigOut.textContent = result;
      log.unshift(new Date().toLocaleTimeString('ru-RU') + ' — ' + result.replace(/\n/g, ' | '));
      history.innerHTML = '';
      history.appendChild(ui.kv(log.slice(0, 10).map(l => {
        const [time, ...rest] = l.split(' — ');
        return [time, rest.join(' — ')];
      })));
    }

    root.appendChild(ui.card([
      form, listBox, ui.spacer(14), bigOut, ui.spacer(14),
      el('div', { class: 'row gap' }, [
        ui.btn('Бросить!', roll),
        ui.btn('Копировать', () => copy(bigOut.textContent), { ghost: true, small: true }),
        ui.btn('Очистить историю', () => { log.length = 0; history.innerHTML = ''; }, { ghost: true, small: true })
      ])
    ]));
    root.appendChild(ui.card([ui.h('История бросков'), history]));
    toggle(form.values());
  }
});

/* ======================================================================
   Блокнот
====================================================================== */
PT.tool({
  id: 'util-notes', cat: 'util', icon: '✐',
  title: 'Блокнот с автосохранением',
  desc: 'Быстрые заметки прямо в браузере: сохраняются локально и переживают перезагрузку.',
  keywords: ['заметки', 'блокнот', 'notepad', 'записать', 'буфер', 'черновик', 'todo'],
  render(root){
    const notes = store.get('notes', [{ id: uid('n'), title: 'Заметка 1', text: '', updated: Date.now() }]);
    let currentId = notes[0].id;
    const status = ui.status();
    const listBox = el('div', { class: 'filelist', style: { marginTop: 0 } });
    const titleIn = el('input', { type: 'text', placeholder: 'Название заметки' });
    const textIn = el('textarea', { rows: 18, placeholder: 'Пиши здесь. Всё сохраняется автоматически.', spellcheck: 'true' });

    function current(){ return notes.find(n => n.id === currentId) || notes[0]; }
    function save(){
      const note = current();
      note.title = titleIn.value || 'Без названия';
      note.text = textIn.value;
      note.updated = Date.now();
      store.set('notes', notes);
      status.ok('Сохранено в ' + new Date().toLocaleTimeString('ru-RU'));
      paintList();
    }
    const autosave = debounce(save, 700);

    function open(id){
      currentId = id;
      const note = current();
      titleIn.value = note.title;
      textIn.value = note.text;
      paintList();
    }
    function paintList(){
      listBox.innerHTML = '';
      notes.slice().sort((a, b) => b.updated - a.updated).forEach(note => {
        const row = el('div', { class: 'file-row', style: { cursor: 'pointer',
          background: note.id === currentId ? 'var(--accent-soft)' : '' }, onclick: () => open(note.id) }, [
          el('span', { class: 'f-name', text: note.title || 'Без названия' }),
          el('span', { class: 'f-size muted', text: new Date(note.updated).toLocaleDateString('ru-RU') }),
          ui.iconBtn('✕', 'Удалить', e => {
            e.stopPropagation();
            const i = notes.findIndex(n => n.id === note.id);
            notes.splice(i, 1);
            if (!notes.length) notes.push({ id: uid('n'), title: 'Заметка', text: '', updated: Date.now() });
            store.set('notes', notes);
            open(notes[0].id);
          })
        ]);
        listBox.appendChild(row);
      });
    }

    titleIn.addEventListener('input', autosave);
    textIn.addEventListener('input', autosave);

    root.appendChild(el('div', { class: 'grid cols-3' }, [
      ui.card([
        ui.h('Заметки'),
        ui.btn('+ Новая заметка', () => {
          const note = { id: uid('n'), title: 'Заметка ' + (notes.length + 1), text: '', updated: Date.now() };
          notes.push(note); store.set('notes', notes); open(note.id); titleIn.focus();
        }, { wide: true, small: true }),
        ui.spacer(12), listBox
      ]),
      el('div', { style: { gridColumn: 'span 2' } }, ui.card([
        titleIn, ui.spacer(12), textIn, ui.spacer(12),
        el('div', { class: 'row gap' }, [
          ui.btn('Сохранить сейчас', save, { small: true }),
          ui.btn('Скачать .txt', () => downloadText(textIn.value, (titleIn.value || 'note') + '.txt'), { ghost: true, small: true }),
          ui.btn('Скачать .md', () => downloadText('# ' + titleIn.value + '\n\n' + textIn.value,
            (titleIn.value || 'note') + '.md', 'text/markdown'), { ghost: true, small: true }),
          ui.btn('Копировать', () => copy(textIn.value), { ghost: true, small: true })
        ]),
        status,
        ui.muted('Заметки хранятся в localStorage этого браузера. Очистка данных сайта их удалит — важное скачивай файлом.')
      ]))
    ]));
    open(currentId);
  }
});
