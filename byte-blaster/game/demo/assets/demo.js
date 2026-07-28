// ===============================================================
//  BYTE BLASTER — DEMO EDITION
// ===============================================================
// Everything that makes the demo a demo lives here. The rest of the game asks
// this module questions ("is this level past the demo?", "should this card be
// locked?") instead of scattering `if (demo)` branches through the codebase —
// so the FULL build behaves exactly as before: with BB_EDITION === "full" every
// helper below is a no-op and `Demo.on` is false.
//
// What the demo cuts (see docs/BUILD_GUIDE.md):
//   • adventure stops after level BB_DEMO_LEVELS (World 1 / Cyber City)
//   • world map shows that one world only
//   • INFINITE mode        — locked
//   • HARDCORE difficulty  — locked
//   • 2 PLAYERS (local)    — locked
//   • ONLINE multiplayer   — locked
//
// Loaded before every other game script (see index.html) so `window.Demo` is
// available to all of them. Nothing here touches the DOM at load time — the end
// screen is built on first use.
(function () {
  'use strict';

  const T = (k, ...a) => (typeof window.t === 'function' ? window.t(k, ...a) : k);

  const ON = String(window.BB_EDITION || 'full').toLowerCase() === 'demo';
  const LEVELS = Math.max(1, Math.min(110, parseInt(window.BB_DEMO_LEVELS, 10) || 10));
  const URL = String(window.BB_DEMO_URL || '');

  // ── Queries the game asks ────────────────────────────────────────────────
  // Level cap. In the full game the answer is whatever the caller already had.
  function totalLevels(fullValue) { return ON ? LEVELS : fullValue; }
  // True when a level number is outside the demo (level 11 in a 10-level demo).
  function beyond(n) { return ON && n > LEVELS; }
  // Clamp a stored "highest unlocked level" so the demo can never unlock more.
  function capMax(n) { return ON ? Math.min(n, LEVELS) : n; }
  // How many worlds the map may show (the demo is World 1 only).
  function worldCount(fullValue) { return ON ? Math.ceil(LEVELS / 10) : fullValue; }

  // ── Locking menu cards ───────────────────────────────────────────────────
  // Cards already have a `.locked` style in the game's CSS; this reuses it and
  // swaps the icon/description so the player is told WHY, not just that it's off.
  function lockCard(card, descKey) {
    if (!ON || !card) return false;
    card.classList.add('locked');
    const icon = card.querySelector('.mIcon');
    const desc = card.querySelector('.mDesc');
    if (icon) icon.textContent = '🔒';
    if (desc) desc.innerHTML = T(descKey);
    return true;
  }

  // Feedback when a locked thing is clicked: a short shake + the "denied" sound,
  // so the click clearly registers as refused rather than as a dead button.
  function refuse(el) {
    if (!ON) return false;
    if (window.SFX && window.SFX.back) window.SFX.back();
    if (el) {
      el.classList.remove('demoRefuse');
      void el.offsetWidth; // restart the animation
      el.classList.add('demoRefuse');
      setTimeout(() => el.classList.remove('demoRefuse'), 420);
    }
    return true;
  }

  // ── DEMO badge next to the version tag ───────────────────────────────────
  function tagVersion(text) { return ON ? text + ' · ' + T('demoTag') : text; }

  // ── Styles (injected once, only in the demo build) ───────────────────────
  let stylesDone = false;
  function ensureStyles() {
    if (stylesDone || !ON) return;
    stylesDone = true;
    const css = document.createElement('style');
    css.textContent = `
      @keyframes demoShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}
        40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
      .demoRefuse{animation:demoShake .38s ease}
      /* The player-count toggle has no locked state in the base stylesheet
         (nothing ever locked it before the demo), so it gets one here. */
      .ptBtn.locked{opacity:.45;cursor:not-allowed;filter:grayscale(.7)}
      .ptBtn.locked:hover{background:transparent;color:#4af}
      #bbDemoEnd{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;
        background:radial-gradient(ellipse at 50% 40%,#12002a 0%,#04040f 70%);
        font-family:'Press Start 2P',monospace;overflow-y:auto}
      #bbDemoEnd .deTitle{font-size:20px;color:#0ff;text-shadow:0 0 18px #0ff,0 0 40px #0ff6;
        letter-spacing:4px;line-height:1.6}
      #bbDemoEnd .deSub{font-family:'Share Tech Mono',monospace;font-size:13px;color:#ff0;
        letter-spacing:2px;text-shadow:0 0 10px #ff08}
      #bbDemoEnd .deBody{font-family:'Share Tech Mono',monospace;font-size:12px;color:#9fd;
        line-height:2;max-width:520px}
      #bbDemoEnd .deBody b{color:#0ff}
      #bbDemoEnd .deCta{font-size:9px;color:#f0f;text-shadow:0 0 12px #f0f;line-height:2;
        letter-spacing:2px;max-width:520px;margin-top:2px}
      #bbDemoEnd .deUrl{font-family:'Share Tech Mono',monospace;font-size:11px;color:#0ff8;
        letter-spacing:1px;word-break:break-all}
      #bbDemoEnd .deBtn{font-family:'Press Start 2P',monospace;font-size:9px;padding:12px 20px;
        background:#0ff1;color:#0ff;border:2px solid #0ff;cursor:pointer;letter-spacing:2px;
        text-shadow:0 0 8px #0ff;transition:background .15s,box-shadow .15s}
      #bbDemoEnd .deBtn:hover{background:#0ff3;box-shadow:0 0 18px #0ff8}
      #bbDemoEnd .deBtn.deGet{color:#f0f;border-color:#f0f;background:#f0f1;text-shadow:0 0 8px #f0f}
      #bbDemoEnd .deBtn.deGet:hover{background:#f0f3;box-shadow:0 0 18px #f0f8}
      #bbDemoEnd .deRow{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:6px}
      #bbDemoEnd .deScore{font-family:'Share Tech Mono',monospace;font-size:12px;color:#0f8;letter-spacing:2px}
      @media (max-width:640px){
        #bbDemoEnd .deTitle{font-size:13px}
        #bbDemoEnd .deBody,#bbDemoEnd .deSub{font-size:11px}
        #bbDemoEnd .deCta{font-size:8px}
      }`;
    document.head.appendChild(css);
  }

  // ── End-of-demo screen ───────────────────────────────────────────────────
  // Shown INSTEAD of loading level LEVELS+1. It is a real ending screen, not an
  // error popup: the player just beat the demo's final boss and should be told
  // what they finished, what the full game holds, and where to get it.
  let ov = null;
  function buildOverlay() {
    ensureStyles();
    ov = document.createElement('div');
    ov.id = 'bbDemoEnd';
    ov.innerHTML =
      '<div class="deTitle" id="deTitle"></div>' +
      '<div class="deSub" id="deSub"></div>' +
      '<div class="deScore" id="deScore"></div>' +
      '<div class="deBody" id="deBody"></div>' +
      '<div class="deCta" id="deCta"></div>' +
      '<div class="deUrl" id="deUrl"></div>' +
      '<div class="deRow">' +
        '<button class="deBtn deGet" id="deGetBtn" style="display:none"></button>' +
        '<button class="deBtn" id="deMenuBtn"></button>' +
      '</div>';
    document.body.appendChild(ov);

    ov.querySelector('#deMenuBtn').onclick = () => {
      if (window.SFX && window.SFX.menu) window.SFX.menu();
      hide();
      if (typeof window.showMain === 'function') window.showMain();
    };
    ov.querySelector('#deGetBtn').onclick = () => {
      if (window.SFX && window.SFX.menu) window.SFX.menu();
      openStore();
    };
  }

  // Opening a link has to work in all three shells: Electron (external browser
  // via the preload bridge), Android (Capacitor's Browser/window.open) and web.
  function openStore() {
    if (!URL) return;
    try {
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(URL);
        return;
      }
    } catch (e) {}
    try { window.open(URL, '_blank', 'noopener'); } catch (e) {}
  }

  function showEnd() {
    if (!ON) return false;
    if (!ov) buildOverlay();

    // Take the game down first — same order showWin() uses.
    if (typeof window.hideAll === 'function') window.hideAll();
    if (typeof window.stopMusic === 'function') window.stopMusic();
    // Same story as `score` below: gState is a script-level `let`, reachable
    // only by bare name. Leaving it on 'levelclear' would let the pending
    // level-clear timer keep running behind this screen.
    try { gState = 'menu'; navScr = 'demoEnd'; } catch (e) {}
    // Cancel a pending level-advance so nothing loads behind this screen.
    try { if (_goNextTimer) { clearTimeout(_goNextTimer); _goNextTimer = 0; } } catch (e) {}

    ov.querySelector('#deTitle').textContent = T('demoEndTitle');
    ov.querySelector('#deSub').textContent = T('demoEndSub', LEVELS);
    ov.querySelector('#deBody').innerHTML = T('demoEndBody');
    ov.querySelector('#deCta').textContent = T('demoEndCta');

    // `score` is a script-level `let` in game.js, so it is NOT on window — it
    // lives in the shared global lexical scope and has to be read by bare name.
    let sc = 0;
    try { sc = (typeof score === 'number') ? score : 0; } catch (e) {}
    const scEl = ov.querySelector('#deScore');
    scEl.textContent = sc ? T('finalScore', sc) : '';
    scEl.style.display = sc ? '' : 'none';

    const urlEl = ov.querySelector('#deUrl');
    const getBtn = ov.querySelector('#deGetBtn');
    urlEl.textContent = URL;
    urlEl.style.display = URL ? '' : 'none';
    getBtn.style.display = URL ? '' : 'none';
    getBtn.textContent = T('demoEndGet');
    ov.querySelector('#deMenuBtn').textContent = T('demoEndMenu');

    ov.style.display = 'flex';
    return true;
  }

  function hide() { if (ov) ov.style.display = 'none'; }

  window.Demo = {
    get on() { return ON; },
    get levels() { return LEVELS; },
    get url() { return URL; },
    totalLevels, beyond, capMax, worldCount,
    lockCard, refuse, tagVersion,
    showEnd, hide,
  };

  // Inject the demo-only stylesheet right away: the refuse animation and the
  // locked player-count toggle are needed the first time the player opens the
  // mode screen, which is long before the end-of-demo overlay is ever built.
  if (ON) {
    ensureStyles();
    console.log('⚠ DEMO EDITION — adventure capped at level ' + LEVELS);
  }
})();
