/* BYTE BLASTER — wiki behaviour: section filter + active heading tracking.
   Plain JS, no dependencies: the site is served as static files from GitHub
   Pages and must work with nothing to install. */
(function () {
  'use strict';

  var list = document.getElementById('tocList');
  var find = document.getElementById('tocFind');
  if (!list) return;

  var links = [].slice.call(list.querySelectorAll('a'));

  /* ── Filter the contents by what the reader types ─────────────────────────
     Matches the link text AND the text of the section it points at, so typing
     "щит" finds "Враги и щиты" even though the word is not in every heading. */
  if (find) {
    var haystack = links.map(function (a) {
      var sec = document.querySelector(a.getAttribute('href'));
      return (a.textContent + ' ' + (sec ? sec.textContent : '')).toLowerCase();
    });
    find.addEventListener('input', function () {
      var q = find.value.trim().toLowerCase();
      links.forEach(function (a, i) {
        a.style.display = (!q || haystack[i].indexOf(q) !== -1) ? '' : 'none';
      });
    });
    // Esc clears the filter — faster than selecting and deleting.
    find.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { find.value = ''; find.dispatchEvent(new Event('input')); }
    });
  }

  /* ── Highlight the section currently on screen ──────────────────────────── */
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function markActive() {
    var best = null, bestTop = -Infinity;
    // The heading closest to (but not past) 120px from the top wins.
    for (var i = 0; i < sections.length; i++) {
      var top = sections[i].getBoundingClientRect().top - 120;
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
