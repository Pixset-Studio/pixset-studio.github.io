// ===============================================================
//  BYTE BLASTER — ЗАДНИЕ ФОНЫ: ОДИН СЛОЙ НА МИР
// ===============================================================
// Раньше фон каждого мира собирался из множества слоёв: небо, свечение
// горизонта, дымка, звёзды, светлячки, окна домов, полосы силуэтов с
// параллаксом. Всё это рисовалось каждый кадр, наезжало друг на друга и
// превращалось в кашу, из-за которой не читалась сама геометрия уровня.
//
// Здесь фон — ОДИН слой. Он целиком запекается в холст один раз (при смене
// мира или размера окна), а в кадре рисуется двумя вызовами drawImage с
// медленным сдвигом. Ничего лишнего: небо, линия горизонта и, где это уместно
// для мира, один акцент.
//
// Силуэт строится периодической функцией с целыми частотами, поэтому левый и
// правый края холста совпадают по высоте — полотно стыкуется само с собой и
// сдвиг не даёт шва.
(function (root) {
  'use strict';

  /* ── Профили горизонта ─────────────────────────────────────────────────
     Каждый возвращает высоту силуэта в точке x (0..1 по ширине полотна).
     Все — суммы синусов с целым числом периодов, поэтому f(0) === f(1). */
  // Треугольная волна: даёт настоящий излом на вершине, тогда как |sin| —
  // округлую макушку, из-за которой «горы» были неотличимы от холмов.
  const tri = (u, k, ph) => {
    const t = (u * k + ph) % 1;
    return 1 - Math.abs(((t < 0 ? t + 1 : t) * 2) - 1);
  };

  const PROFILES = {
    // Холмы: мягкая волна.
    hills(u, s) {
      return (Math.sin(u * Math.PI * 2 * 2 + s) * 0.6
            + Math.sin(u * Math.PI * 2 * 5 + s * 1.7) * 0.4) * 0.35 + 0.5;
    },
    // Пики: острые вершины разной высоты.
    peaks(u, s) {
      return Math.min(1, tri(u, 4, s * 0.1) * 0.75 + tri(u, 9, s * 0.3) * 0.3);
    },
    // Кроны: плотные округлые бугры, частые и невысокие.
    canopy(u, s) {
      return (Math.sin(u * Math.PI * 2 * 9 + s) * 0.3
            + Math.sin(u * Math.PI * 2 * 17 + s * 2.3) * 0.2
            + Math.sin(u * Math.PI * 2 * 4 + s * 0.7) * 0.5) * 0.4 + 0.55;
    },
    // Хвойный лес: ряд треугольных крон разной высоты.
    //
    // Вертикальные «стволы» читались забором из-за одинаковой ширины и плоских
    // макушек. Треугольник опознаётся как ель мгновенно, а разброс высот не даёт
    // ряду выглядеть штампованным.
    conifers(u, s) {
      const k = 15;                                   // деревьев на ширину экрана
      const i = Math.floor(u * k) % k;                // номер дерева
      const t = (u * k) % 1;                          // положение внутри дерева
      const h = 0.5 + (Math.sin(i * 2.3 + s) * 0.5 + 0.5) * 0.5;
      // Подлесок: кроны не должны касаться земли остриём, иначе между деревьями
      // просвечивает небо до самого низа.
      return Math.max(0.22, h * (1 - Math.abs(t * 2 - 1)));
    },
    // Почти ровная линия — для миров, где важен простор, а не рельеф.
    flat(u, s) {
      return Math.sin(u * Math.PI * 2 * 2 + s) * 0.16 + 0.5;
    },
  };

  /* Блочные силуэты (город, руины, крепость) рисуются прямоугольниками, а не
     кривой: у застройки должны быть вертикальные грани. Функция отдаёт высоту
     блока по его номеру; число блоков подбирается под ширину экрана. */
  const BLOCKS = {
    city(i, n, s) {
      const u = i / n;
      const h = Math.sin(u * Math.PI * 2 * 3 + s) * 0.5
              + Math.sin(u * Math.PI * 2 * 7 + s * 2) * 0.3
              + Math.sin(u * Math.PI * 2 * 13 + s * 3) * 0.2;
      return 0.30 + (h * 0.5 + 0.5) * 0.70;
    },
    ruins(i, n, s) {
      const u = i / n;
      const step = Math.round((Math.sin(u * Math.PI * 2 * 5 + s) * 0.5 + 0.5) * 4) / 4;
      // Провалы — часть облика руин: не сплошная стена, а то, что от неё осталось.
      return Math.sin(u * Math.PI * 2 * 9 + s * 3) > 0.62 ? 0.12 : 0.25 + step * 0.75;
    },
    fortress(i, n, s) {
      const u = i / n;
      // Зубцы стены: ровная высокая стена с ритмичными выступами.
      const merlon = tri(u, n / 2, 0) > 0.5 ? 0.16 : 0;
      return 0.62 + merlon + Math.sin(u * Math.PI * 2 * 2 + s) * 0.1;
    },
  };

  /* ── Миры ──────────────────────────────────────────────────────────────
     Для каждого: форма горизонта, его высота (доля экрана), насколько высоко
     поднимается свечение неба и один акцент. Цвета берутся из темы мира, чтобы
     фон и платформы оставались одной палитрой.

     accent: 'stars' звёзды | 'glow' зарево у горизонта | 'none' ничего  */
  // disc — одна крупная деталь в небе: луна, солнце, планета. Ровно одна на
  // мир и запечена в тот же слой, поэтому «одним слоем» это быть не перестаёт,
  // зато каждый мир опознаётся с первого взгляда.
  //   [доля ширины, доля высоты, радиус в долях высоты, яркость]
  const WORLDS = {
    // 🏙 кибергород: плотная высокая застройка и низкая луна между башнями
    0:  { blocks: 'city', n: 26, h: 0.46, seed: 1.1, accent: 'stars', horizon: 0.52,
          disc: [0.74, 0.26, 0.085, 0.5] },
    // 🌿 джунгли: густая невысокая крона, тепло и близко
    1:  { profile: 'canopy', h: 0.34, seed: 2.4, accent: 'none', horizon: 0.66, warm: 0.25 },
    // 🌋 лава: острые скалы на фоне зарева
    2:  { profile: 'peaks', h: 0.44, seed: 3.9, accent: 'glow', horizon: 0.58 },
    // ❄ лёд: высокие кристаллы, бледное небо, тусклая луна
    3:  { profile: 'peaks', h: 0.40, seed: 4.2, accent: 'stars', horizon: 0.56,
          disc: [0.24, 0.22, 0.10, 0.34] },
    // 🏜 пустыня: обломки стен и низкое солнце
    4:  { blocks: 'ruins', n: 20, h: 0.34, seed: 5.6, accent: 'glow', horizon: 0.60,
          disc: [0.62, 0.50, 0.13, 0.5] },
    // 🛸 станция: пустота, ровная кромка и планета
    5:  { profile: 'flat', h: 0.14, seed: 6.3, accent: 'stars', horizon: 0.76,
          disc: [0.30, 0.34, 0.22, 0.3] },
    // 🌲 тёмный лес: редкие высокие стволы, почти чёрное небо
    6:  { profile: 'conifers', h: 0.42, seed: 7.1, accent: 'none', horizon: 0.64, dark: 0.3 },
    // ☣ токсичная зона: низкие холмы и тяжёлое свечение снизу
    7:  { profile: 'hills', h: 0.24, seed: 8.8, accent: 'glow', horizon: 0.68 },
    // ⚡ вершины: самые высокие и рваные горы в игре
    8:  { profile: 'peaks', h: 0.46, seed: 9.4, accent: 'none', horizon: 0.62 },
    // 🔱 крепость: сплошная зубчатая стена во весь горизонт
    9:  { blocks: 'fortress', n: 18, h: 0.40, seed: 10.7, accent: 'glow', horizon: 0.58 },
    // 🌈 призма: мягкие волны и яркий диск
    10: { profile: 'hills', h: 0.22, seed: 11.2, accent: 'stars', horizon: 0.70,
          disc: [0.68, 0.28, 0.12, 0.55] },
  };

  /* ── Цвет ──────────────────────────────────────────────────────────────
     Осветление и затемнение без разбора формата: браузер сам приведёт цвет к
     rgb(), а мы только сместим яркость. */
  let probeCtx = null;
  function toRGB(col) {
    if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
    probeCtx.fillStyle = '#000';
    probeCtx.fillStyle = col;
    const s = probeCtx.fillStyle;
    if (s[0] === '#') {
      const h = s.length === 4
        ? s.slice(1).split('').map(c => parseInt(c + c, 16))
        : [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      return h;
    }
    const m = s.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }
  const mix = (a, b, t) => {
    const A = toRGB(a), B = toRGB(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ','
                  + Math.round(A[1] + (B[1] - A[1]) * t) + ','
                  + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  };
  const rgba = (col, a) => { const c = toRGB(col); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  /** Детерминированный ГПСЧ: фон одного мира выглядит одинаково при каждом входе. */
  function rng(seed) {
    let s = Math.floor(seed * 100000) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* ── Запекание ─────────────────────────────────────────────────────────
     Полотно шириной ровно в экран. Всё, что здесь нарисовано, за кадр
     обходится в два drawImage — против десятков заливок и путей раньше. */
  let cache = null;   // {cv, w, h, id}

  function bake(W, H, theme) {
    const spec = WORLDS[theme.id] || WORLDS[0];
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, W); cv.height = Math.max(1, H);
    const c = cv.getContext('2d');
    const r = rng(spec.seed);

    // 1. Небо. Один вертикальный градиент от глубокого верха к цвету горизонта.
    const horizonY = H * spec.horizon;
    const deep = theme.bg || '#04040f';
    const near = theme.bg2 || theme.bg || '#0a0a20';
    const accentCol = theme.mc || theme.grid || '#4af';
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(deep, '#000000', 0.35 + (spec.dark || 0)));
    g.addColorStop(0.55, deep);
    g.addColorStop(1, mix(near, accentCol, 0.10 + (spec.warm || 0)));
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // 2. Диск — единственная крупная деталь в небе. Рисуется до силуэта, чтобы
    //    тот его перекрывал: так читается расстояние.
    if (spec.disc) {
      const [dx, dy, dr, da] = spec.disc;
      const x = W * dx, y = H * dy, r0 = H * dr;
      const halo = c.createRadialGradient(x, y, r0 * 0.6, x, y, r0 * 2.4);
      halo.addColorStop(0, rgba(accentCol, da * 0.25));
      halo.addColorStop(1, rgba(accentCol, 0));
      c.fillStyle = halo;
      c.beginPath(); c.arc(x, y, r0 * 2.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba(mix(accentCol, '#ffffff', 0.5), da);
      c.beginPath(); c.arc(x, y, r0, 0, Math.PI * 2); c.fill();
    }

    // 3. Акцент — ровно один на мир, и только если он мир характеризует.
    if (spec.accent === 'stars') {
      // Звёзды только выше горизонта и без свечения: точки, а не гирлянда.
      const n = Math.round(W * H / 9000);
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * horizonY;
        const a = 0.18 + r() * 0.5, s = r() < 0.85 ? 1 : 2;
        c.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
        c.fillRect(x | 0, y | 0, s, s);
      }
    } else if (spec.accent === 'glow') {
      // Зарево у самой линии горизонта — свет мира снизу.
      const gg = c.createLinearGradient(0, horizonY - H * 0.22, 0, horizonY + H * 0.05);
      gg.addColorStop(0, rgba(accentCol, 0));
      gg.addColorStop(1, rgba(accentCol, 0.20));
      c.fillStyle = gg; c.fillRect(0, horizonY - H * 0.22, W, H * 0.27);
    }

    // 4. Силуэт горизонта — единственная форма на полотне.
    //    Застройка рисуется прямоугольниками (у домов и стен есть вертикальные
    //    грани), природа — сплошной кривой.
    const band = H * spec.h;
    const topOf = (u) => horizonY - band * (PROFILES[spec.profile] || PROFILES.hills)(u, spec.seed);
    // Силуэт заливаем градиентом, а не одним тоном. Сплошной тёмный цвет на
    // тёмном небе просто исчезал: у блочных миров были видны одни крыши, а тела
    // домов сливались с фоном. Верх силуэта ловит свет неба, низ уходит в тень —
    // форма читается, и появляется глубина.
    const silG = c.createLinearGradient(0, horizonY - band, 0, H);
    silG.addColorStop(0, mix(deep, accentCol, spec.dark ? 0.07 : 0.17));
    silG.addColorStop(1, mix(deep, '#000000', 0.72));
    const edge = rgba(accentCol, 0.55);
    c.fillStyle = silG;
    c.strokeStyle = edge;
    c.lineWidth = 2;

    if (spec.blocks) {
      const fn = BLOCKS[spec.blocks];
      const n = spec.n, bw = W / n;
      for (let i = 0; i < n; i++) {
        const hgt = band * fn(i, n, spec.seed);
        const x = i * bw, y = horizonY - hgt;
        c.fillRect(x, y, bw + 1, H - y);
        // Подсвечиваем только крышу: вертикальные грани оставляем тёмными,
        // иначе получается сетка, а не силуэт.
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + bw, y); c.stroke();
      }
    } else {
      const STEP = 2;
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x <= W; x += STEP) c.lineTo(x, topOf(x / W));
      c.lineTo(W, H); c.closePath(); c.fill();
      c.beginPath();
      for (let x = 0; x <= W; x += STEP) {
        const y = topOf(x / W);
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }

    return cv;
  }

  /**
   * Нарисовать фон. Сдвиг — медленный параллакс: полотно шириной в экран
   * рисуется дважды со смещением, стык не виден, потому что края совпадают.
   */
  function draw(ctx, W, H, theme, camX) {
    if (!cache || cache.w !== W || cache.h !== H || cache.id !== theme.id) {
      cache = { cv: bake(W, H, theme), w: W, h: H, id: theme.id };
    }
    const off = ((camX * 0.14) % W + W) % W;
    ctx.drawImage(cache.cv, -off, 0);
    if (off > 0) ctx.drawImage(cache.cv, W - off, 0);
  }

  /** Сбросить кэш — при смене темы или размера. */
  function invalidate() { cache = null; }

  root.BBBackdrop = { draw, invalidate, WORLDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
