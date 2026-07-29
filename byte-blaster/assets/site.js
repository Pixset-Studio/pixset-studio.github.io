/* BYTE BLASTER — site behaviour: language switch, wiki filter, active section.
   Plain JS, no dependencies: the site is static files on GitHub Pages. */
(function () {
  'use strict';

  /* ── Visit counter ─────────────────────────────────────────────────────────
     GitHub Pages serves static files and cannot count anything, so the page
     tells the game's relay server that it was opened. Nothing personal is sent:
     the path, the interface language, and that's it. Failures are ignored —
     a counter must never break the page. */
  var STATS_API = window.BB_STATS_API || 'https://byte-blaster-server-production.up.railway.app';
  try {
    // One hit per tab per page, so a language switch or a re-render doesn't
    // inflate the number.
    if (!sessionStorage.getItem('bbHit:' + location.pathname)) {
      sessionStorage.setItem('bbHit:' + location.pathname, '1');
      fetch(STATS_API + '/api/hit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'site',
          page: location.pathname.replace('/byte-blaster', '') || '/',
          lang: document.documentElement.getAttribute('data-site-lang') || 'ru',
        }),
        keepalive: true,
      }).catch(function () {});
    }
  } catch (e) {}

  /* ── Language ──────────────────────────────────────────────────────────────
     Both languages sit in the markup; CSS hides the inactive one based on
     <html data-site-lang>. The choice is: saved preference → browser language →
     Russian. The attribute is written by an inline snippet in <head> so the page
     never flashes the wrong language before this file loads. */
  var KEY = 'bbSiteLang';

  function detect() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'ru' || saved === 'en') return saved;
    } catch (e) {}
    // Cyrillic-script locales get Russian; everyone else gets English.
    var langs = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i]).toLowerCase();
      if (/^(ru|uk|be|kk|ky|uz|tg|tk|az|hy|mo)\b/.test(l)) return 'ru';
      if (/^[a-z]{2}/.test(l)) return 'en';
    }
    return 'ru';
  }

  function apply(lang, remember) {
    document.documentElement.setAttribute('data-site-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    if (remember) { try { localStorage.setItem(KEY, lang); } catch (e) {} }
    var btns = document.querySelectorAll('.langsw button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].dataset.lang === lang));
    }
    // Swap <title>/description too — they are outside the body and CSS can't
    // hide them; the alternates travel in data attributes on <html>.
    var alt = document.documentElement.dataset['title' + (lang === 'en' ? 'En' : 'Ru')];
    if (alt) document.title = alt;
    var d = document.querySelector('meta[name="description"]');
    var altD = document.documentElement.dataset['desc' + (lang === 'en' ? 'En' : 'Ru')];
    if (d && altD) d.setAttribute('content', altD);
  }

  apply(document.documentElement.getAttribute('data-site-lang') || detect(), false);

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.langsw button') : null;
    if (!b) return;
    if (b.getAttribute('aria-pressed') === 'true') return;   // already this language
    // Dip the page's opacity for a moment so the text does not pop from one
    // alphabet to another; the swap itself happens at the darkest point.
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { apply(b.dataset.lang, true); return; }
    document.body.classList.remove('langswap');
    void document.body.offsetWidth;                          // restart the animation
    document.body.classList.add('langswap');
    setTimeout(function () { apply(b.dataset.lang, true); }, 130);
    setTimeout(function () { document.body.classList.remove('langswap'); }, 380);
  });

  /* ── Smooth in-page jumps ──────────────────────────────────────────────────
     Native anchor jumps land under the sticky bar on some browsers even with
     scroll-margin-top, and the address bar fills with #hashes. Scrolling
     manually to a measured offset is exact on every one of them. */
  function barHeight() {
    var bar = document.querySelector('header.top');
    return bar ? bar.getBoundingClientRect().height + 14 : 88;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href');
    if (id === '#' || id.length < 2) return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    var y = window.pageYOffset + target.getBoundingClientRect().top - barHeight();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  });


  /* ═══ Motion ══════════════════════════════════════════════════════════════
     Scroll reveals, counting numbers, a reading-progress bar and a back-to-top
     button. All of it is added from here rather than from the markup, so the
     seven pages stay free of animation plumbing.
     Everything below no-ops when the visitor asked for reduced motion. */

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Reveal on scroll ──────────────────────────────────────────────────── */
  function tagReveals() {
    // Direct children of a section reveal together with a small stagger; cards
    // and table rows get their own so a grid does not arrive as one slab.
    var groups = [
      ['main > section, article > section, .hero', '', 0],
      ['.card', 'zoom', 60],
      ['.stat', '', 45],
      ['.rel', 'left', 70],
      ['.tw', '', 0],
      ['.note', 'left', 0],
      ['ul.clean', '', 0],
    ];
    groups.forEach(function (g) {
      var els = document.querySelectorAll(g[0]);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.hasAttribute('data-rv')) continue;
        // Skip anything inside a collapsed <details>: while it is closed it has
        // no box, so it never intersects the viewport, the observer never fires
        // and the content would stay at opacity 0 forever once expanded.
        if (el.closest('details')) continue;
        el.setAttribute('data-rv', g[1]);
        if (g[2]) el.style.setProperty('--d', ((i % 6) * g[2] / 1000) + 's');
      }
    });
  }

  function watchReveals() {
    var els = document.querySelectorAll('[data-rv]');
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        var h = e.target.querySelector('h2');
        if (h) h.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);

    // Safety net. An element that is somehow never observed — inside a
    // container that was hidden at load, or a browser quirk — must not stay
    // invisible. Anything still untouched after 4 seconds is simply shown.
    setTimeout(function () {
      var left = document.querySelectorAll('[data-rv]:not(.in)');
      for (var k = 0; k < left.length; k++) left[k].classList.add('in');
    }, 4000);
  }

  /* ── Counting numbers ──────────────────────────────────────────────────────
     The stat tiles count up from zero the first time they appear. Only plain
     integers are touched, so "110" animates and "1.0.2" is left alone. */
  function countUp(el) {
    var raw = el.textContent.trim();
    if (!/^\d{1,7}$/.test(raw)) return;
    var target = parseInt(raw, 10);
    if (target < 2) return;
    var dur = 900, t0 = 0;
    el.textContent = '0';
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      // easeOutCubic: fast at first, settles gently on the real number.
      var v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = raw;
    }
    requestAnimationFrame(step);
  }

  function watchCounters() {
    var nums = document.querySelectorAll('.stat b');
    if (!nums.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        countUp(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    for (var i = 0; i < nums.length; i++) io.observe(nums[i]);
  }

  /* ── Reading progress + back to top ────────────────────────────────────── */
  function chrome() {
    var bar = document.createElement('div');
    bar.id = 'readProgress';
    document.body.appendChild(bar);

    var top = document.createElement('button');
    top.id = 'toTop';
    top.type = 'button';
    top.textContent = '↑';
    top.setAttribute('aria-label',
      document.documentElement.getAttribute('data-site-lang') === 'en' ? 'Back to top' : 'Наверх');
    document.body.appendChild(top);
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var p = h > 0 ? Math.min(1, window.pageYOffset / h) : 0;
        bar.style.transform = 'scaleX(' + p + ')';
        top.classList.toggle('show', window.pageYOffset > 500);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (!reduced) {
    tagReveals();
    watchReveals();
    watchCounters();
  }
  chrome();


  /* ── Launch sequence ────────────────────────────────────────────────────────
     Any link into the game plays a short boot animation before navigating, so
     starting the game feels like connecting to the GRID rather than following a
     hyperlink. The navigation still happens for certain — a failed animation or
     a closed tab must never strand the player on the site. */
  function launchSequence() {
    var LINES_RU = ['УСТАНОВКА СВЯЗИ С GRID…', 'АУТЕНТИФИКАЦИЯ UNIT-7…', 'ЗАГРУЗКА МИРА…', 'ГОТОВО'];
    var LINES_EN = ['CONNECTING TO GRID…', 'AUTHENTICATING UNIT-7…', 'LOADING WORLD…', 'READY'];

    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      // Only links that actually enter the game, and only plain left clicks —
      // ctrl/cmd-click and middle click must keep opening a new tab as usual.
      if (!/\/game\/(full|demo)\//.test(a.getAttribute('href') || '')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (a.target && a.target !== '_self') return;

      e.preventDefault();
      var href = a.href;
      var lang = document.documentElement.getAttribute('data-site-lang') === 'en' ? 'en' : 'ru';
      var lines = lang === 'en' ? LINES_EN : LINES_RU;
      var demo = /\/demo\//.test(href);

      var fx = document.createElement('div');
      fx.id = 'launchFx';
      fx.innerHTML =
        '<div class="fxInner">' +
          '<img class="fxLogo" src="/byte-blaster/assets/logo-512.png" alt="">' +
          '<div class="fxTitle">BYTE BLASTER' + (demo ? ' · DEMO' : '') + '</div>' +
          '<div class="fxLog"></div>' +
          '<div class="fxBar"><i></i></div>' +
        '</div>';
      document.body.appendChild(fx);
      // Force a reflow so the .on transition actually runs from its start state.
      void fx.offsetWidth;
      fx.classList.add('on');

      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var log = fx.querySelector('.fxLog');
      var i = 0;
      var step = reduce ? 90 : 330;
      var tick = setInterval(function () {
        log.textContent = lines[i] || '';
        i++;
        if (i >= lines.length) clearInterval(tick);
      }, step);
      log.textContent = lines[0];

      // Navigate when the sequence ends. The timer is the single source of
      // truth — if anything above throws, this still fires.
      setTimeout(function () { window.location.href = href; }, reduce ? 260 : 1450);
    });

    // Coming back from the game via the Back button leaves the overlay in the
    // bfcache-restored page; clear it so the site is usable again.
    window.addEventListener('pageshow', function (ev) {
      if (!ev.persisted) return;
      var old = document.getElementById('launchFx');
      if (old) old.remove();
    });
  }
  launchSequence();

  /* ── Wiki: filter the contents, highlight the current section ────────────── */
  var list = document.getElementById('tocList');
  if (!list) return;
  var links = [].slice.call(list.querySelectorAll('a'));

  var find = document.getElementById('tocFind');
  if (find) {
    // Match the link text AND the section body, so a word from inside a section
    // finds it even when the heading doesn't contain it.
    var hay = links.map(function (a) {
      var sec = document.querySelector(a.getAttribute('href'));
      return (a.textContent + ' ' + (sec ? sec.textContent : '')).toLowerCase();
    });
    find.addEventListener('input', function () {
      var q = find.value.trim().toLowerCase();
      links.forEach(function (a, i) {
        a.style.display = (!q || hay[i].indexOf(q) !== -1) ? '' : 'none';
      });
    });
    find.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { find.value = ''; find.dispatchEvent(new Event('input')); }
    });
  }

  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function markActive() {
    var best = null, bestTop = -Infinity, off = barHeight() + 20;
    for (var i = 0; i < sections.length; i++) {
      var top = sections[i].getBoundingClientRect().top - off;
      if (top <= 0 && top > bestTop) { bestTop = top; best = sections[i]; }
    }
    if (!best) best = sections[0];
    links.forEach(function (a) {
      a.classList.toggle('active', !!best && a.getAttribute('href') === '#' + best.id);
    });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { markActive(); ticking = false; });
  }, { passive: true });
  markActive();
})();
