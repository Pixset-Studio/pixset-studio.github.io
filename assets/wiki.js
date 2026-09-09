/* Вики Pixset Studio — то, чего нет на остальных страницах сайта.
 *
 * Язык, темы и кнопка аккаунта приходят из общих файлов (studio.js,
 * pixset-me.js): вики теперь живёт по тем же правилам, что и весь сайт.
 * Здесь остаётся только своё:
 *
 *   • переключатели языка и темы встают в навигацию вики — у неё своя
 *     разметка, и studio.js их сам туда не поставит;
 *   • гамбургер-меню;
 *   • появление блоков по прокрутке;
 *   • декор «неонового терминала» (курсор и летающие точки) — он включается
 *     только в темах, которые притворяются экраном игры.
 *
 * 19 страниц вики собраны каждая сама по себе, поэтому всё общее — здесь:
 * 19 копий одного обработчика разошлись бы при первой же правке.
 */
(function () {
  'use strict';

  function theme() { return document.documentElement.getAttribute('data-theme') || 'industrial'; }
  function neon() { return theme() === 'byteblaster' || theme() === 'arcade'; }
  function lang() {
    return document.documentElement.getAttribute('data-site-lang') === 'en' ? 'en' : 'ru';
  }
  function accent() {
    return getComputedStyle(document.documentElement).getPropertyValue('--y').trim() || '#ffd400';
  }

  /* ── Переключатели в навигацию вики ───────────────────────────────────
     Кнопки строит studio.js, но ищет их место по разметке основного сайта
     (nav.main). У вики список ссылок — <ul class="nav-links">, поэтому сюда
     переключатели ставим сами; обработчики кликов общие. */
  function switchers() {
    var list = document.querySelector('nav .nav-links');
    var mobile = document.getElementById('mobileNav');

    if (list && window.PixsetLang) {
      var li = document.createElement('li');
      list.appendChild(li);
      buildLang(li);
      var liT = document.createElement('li');
      list.appendChild(liT);
      buildTheme(liT);
    }
    // Мобильное меню вики зовётся так же, как на остальном сайте (#mobileNav),
    // поэтому переключатель языка в него уже поставил studio.js — второй был бы
    // лишним. Тема туда не попадает: её меню строится только для nav.main.
    if (mobile && window.PixsetLang) {
      buildLang(mobile, true);
      buildTheme(mobile);
    }
  }

  function buildLang(host, wide) {
    if (host.querySelector('.langsw')) return;
    var box = document.createElement('span');
    box.className = 'langsw' + (wide ? ' wide' : '');
    ['ru', 'en'].forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = id;
      b.textContent = id.toUpperCase();
      b.setAttribute('aria-pressed', String(id === lang()));
      box.appendChild(b);
    });
    host.appendChild(box);
  }

  /** Меню тем — то же самое, что в шапке остального сайта. */
  function buildTheme(host) {
    if (!window.PixsetTheme || host.querySelector('.theme-pick')) return;
    var L = window.PixsetLang.L;
    var box = document.createElement('div');
    box.className = 'theme-pick';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<span data-l="ru">Тема</span><span data-l="en">Theme</span>';

    var menu = document.createElement('div');
    menu.className = 'theme-menu';

    window.PixsetTheme.themes.forEach(function (t) {
      var item = document.createElement('button');
      item.type = 'button';
      item.dataset.themeOption = t.id;

      function paint() {
        var open = window.PixsetTheme.isOpen(t.id);
        if (open) { delete item.dataset.locked; } else { item.dataset.locked = '1'; }
        item.setAttribute('aria-pressed', String(open && t.id === window.PixsetTheme.current()));
        item.innerHTML = (open ? '' : '🔒 ') + L(t.ru, t.en) + '<small>' +
          (open ? L(t.hintRu, t.hintEn)
                : L('нужна лицензия Byte Blaster', 'requires a Byte Blaster licence')) + '</small>';
      }
      paint();
      document.addEventListener('pixset:lang', paint);
      item.onclick = function () {
        if (!window.PixsetTheme.isOpen(t.id)) { location.href = t.buy || '/store'; return; }
        window.PixsetTheme.apply(t.id);
        menu.classList.remove('open');
      };
      menu.appendChild(item);
    });

    btn.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
    document.addEventListener('click', function () { menu.classList.remove('open'); });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });

    box.appendChild(btn);
    box.appendChild(menu);
    host.appendChild(box);
  }

  /* ── Меню на узком экране ─────────────────────────────────────────────
     Раньше кнопку обслуживал onclick="toggleMenu()" из инлайн-скрипта каждой
     страницы; теперь обработчик один. */
  function menu() {
    var burger = document.getElementById('hamburger');
    var panel = document.getElementById('mobileNav');
    if (!burger || !panel) return;

    function set(open) {
      panel.classList.toggle('open', open);
      burger.classList.toggle('active', open);
    }
    burger.onclick = function (e) {
      e.stopPropagation();
      set(!panel.classList.contains('open'));
    };
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target) || burger.contains(e.target)) return;
      set(false);
    });
    panel.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { set(false); });
    });
  }

  /* ── Дерево статей на узком экране ────────────────────────────────────
     Боковое меню там скрыто, а в шапке пункта «Вики» больше нет — он вёл на
     страницу, где читатель уже стоит. Значит переходить между статьями с
     телефона нужно откуда-то ещё: копируем дерево в мобильное меню. */
  function treeIntoMenu() {
    var side = document.querySelector('.wiki-sidebar');
    var panel = document.getElementById('mobileNav');
    if (!side || !panel || panel.querySelector('.wiki-tree')) return;

    var box = document.createElement('div');
    box.className = 'wiki-tree';
    var head = side.querySelector('.sidebar-title');
    if (head) box.appendChild(head.cloneNode(true));
    side.querySelectorAll('a').forEach(function (a) { box.appendChild(a.cloneNode(true)); });
    panel.appendChild(box);
  }

  /* ── Появление блоков ─────────────────────────────────────────────────── */
  function reveal() {
    var nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('visible'); });
      return;
    }
    // То, что уже на экране, показываем сразу, не дожидаясь наблюдателя. В
    // фоновой вкладке (ссылка открыта средней кнопкой) он не срабатывает до
    // переключения на неё — и статья встречала бы читателя пустой.
    nodes.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) n.classList.add('visible');
    });

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    nodes.forEach(function (n) { if (!n.classList.contains('visible')) obs.observe(n); });
  }

  /* ── Декор ────────────────────────────────────────────────────────────
     Точки и курсор рисуются только в «экранных» темах и только если человек
     не просил убрать анимацию. При смене темы декор включается и гаснет без
     перезагрузки. */
  var raf = null;

  function cursor() {
    var dot = document.getElementById('cursor');
    var ring = document.getElementById('cursorRing');
    if (!dot || !ring) return;
    var mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    (function step() {
      if (theme() === 'byteblaster') {
        rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12;
        dot.style.left = mx + 'px'; dot.style.top = my + 'px';
        ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
      }
      requestAnimationFrame(step);
    })();
  }

  function particles() {
    var canvas = document.getElementById('particles');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dots = [];

    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    function make() {
      return {
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.4 + 0.1,
      };
    }
    for (var i = 0; i < 70; i++) dots.push(make());

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!neon()) { ctx.clearRect(0, 0, W, H); return; }
      var color = accent();
      ctx.clearRect(0, 0, W, H);
      dots.forEach(function (p) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) Object.assign(p, make());
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      for (var i = 0; i < dots.length; i++) {
        for (var j = i + 1; j < dots.length; j++) {
          var dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d >= 100) continue;
          ctx.save();
          ctx.globalAlpha = (1 - d / 100) * 0.05;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    frame();
  }

  function init() {
    switchers();
    treeIntoMenu();
    menu();
    reveal();
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) { cursor(); particles(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
