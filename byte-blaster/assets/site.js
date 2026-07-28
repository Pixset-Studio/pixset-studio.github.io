/* BYTE BLASTER — site behaviour: language switch, wiki filter, active section.
   Plain JS, no dependencies: the site is static files on GitHub Pages. */
(function () {
  'use strict';

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
    apply(b.dataset.lang, true);
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
