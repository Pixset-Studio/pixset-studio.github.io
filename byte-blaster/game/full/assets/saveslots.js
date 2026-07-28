// ===============================================
//  SAVE SLOTS — selection screen (shown on PLAY)
// ===============================================
// UI layer over window.SaveSlots (the storage engine lives in index.html).
// Lets the player pick one of 3 slots to continue/start, or delete a slot.
// A slot holds ONLY level progress, achievements and player records.

(function () {
  'use strict';

  const T = (k, ...a) => (typeof window.t === 'function' ? window.t(k, ...a) : k);
  // Denominator for a slot's "levels done" line. The main story is 100 levels;
  // once the secret Prism Anomaly world (101–110) has been reached, a slot can
  // legitimately show more than 100 done — which used to read as "102/100".
  const _slotTotal = (done) => (done > 100 ? 110 : 100);
  const sfx = () => { if (window.SFX && window.SFX.menu) window.SFX.menu(); };
  let overlay = null;

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'slotOv';
    overlay.className = 'fov';
    overlay.style.cssText = `
      position: fixed; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      background: rgba(4,4,15,0.96); z-index: 2500;
      overflow: auto; -webkit-overflow-scrolling: touch;
      font-family: 'Press Start 2P', monospace;`;
    // Content lives in an inner box that JS scales to fit the viewport (see fit()).
    // The cards stay on one row (nowrap) so the whole picker shrinks proportionally
    // on a phone instead of being clipped — matching how the game UI is fitted.
    overlay.innerHTML = `
      <div id="slotInner" style="display:flex;flex-direction:column;align-items:center;transform-origin:center center;">
        <h2 data-i18n="selectSave" style="color:#0ff;font-size:18px;letter-spacing:4px;text-shadow:0 0 14px #0ff;margin-bottom:22px;">SELECT SAVE</h2>
        <div id="slotCards" style="display:flex;gap:18px;flex-wrap:nowrap;justify-content:center;"></div>
        <button id="slotBackBtn" data-i18n="back" style="margin-top:24px;padding:10px 20px;font-family:'Press Start 2P',monospace;font-size:10px;background:#0a0a20;color:#4af;border:2px solid #4af;border-radius:4px;cursor:pointer;">← BACK [ESC]</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#slotBackBtn').onclick = () => { sfx(); hide(); if (typeof showMain === 'function') showMain(); };
  }

  // Scale the inner content so the full picker always fits the screen (only ever
  // shrinks; never enlarges past native size on desktop).
  function fit() {
    if (!overlay) return;
    const inner = overlay.querySelector('#slotInner');
    if (!inner) return;
    inner.style.transform = 'none';
    const vv = window.visualViewport;
    const vpW = (vv && vv.width)  ? vv.width  : window.innerWidth;
    const vpH = (vv && vv.height) ? vv.height : window.innerHeight;
    const w = inner.offsetWidth, h = inner.offsetHeight;
    if (!w || !h) return;
    const k = Math.min((vpW * 0.94) / w, (vpH * 0.94) / h, 1);
    inner.style.transform = 'scale(' + k + ')';
  }
  let _fitBound = false;
  function bindFit() {
    if (_fitBound) return;
    _fitBound = true;
    let raf = 0;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); setTimeout(onResize, 600); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
      window.visualViewport.addEventListener('scroll', onResize);
    }
  }

  function card(i) {
    const s = window.SaveSlots.summary(i);
    const active = window.SaveSlots.getActive() === i;
    const accent = active ? '#0ff' : '#4af';
    const el = document.createElement('div');
    el.style.cssText = `
      width: 280px; background: rgba(10,10,32,0.95); border: 2px solid ${accent};
      border-radius: 8px; padding: 18px; text-align: center;
      box-shadow: ${active ? '0 0 18px #0ff5' : 'none'};`;

    const title = `<div style="color:${accent};font-size:13px;letter-spacing:2px;margin-bottom:12px;">${T('slot')} ${i + 1}</div>`;

    let body, actions;
    if (s.empty) {
      body = `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#556;letter-spacing:2px;margin:18px 0;" data-i18n="slotEmpty">— EMPTY —</div>`;
      actions = `<button class="slotPlay" style="width:100%;padding:10px;margin-top:8px;font-family:'Press Start 2P',monospace;font-size:9px;background:#0a0a20;color:#0f8;border:2px solid #0f8;border-radius:4px;cursor:pointer;">${T('slotNewGame')}</button>`;
    } else {
      const updated = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : '';
      body = `
        <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#9cf;line-height:2;text-align:left;margin:6px 2px 14px;">
          <div>${T('slotLevels', s.done, _slotTotal(s.done))}</div>
          <div>${T('slotHardcore', s.doneH, _slotTotal(s.doneH))}</div>
          <div>${T('slotAch', s.ach)}</div>
          <div>${T('slotBest', s.best)}</div>
          ${updated ? `<div style="color:#456;font-size:8px;margin-top:4px;">${updated}</div>` : ''}
        </div>`;
      actions = `
        <button class="slotPlay" style="width:100%;padding:10px;font-family:'Press Start 2P',monospace;font-size:9px;background:#0a0a20;color:#0ff;border:2px solid #0ff;border-radius:4px;cursor:pointer;">${T('slotContinue')}</button>
        <button class="slotDel" style="width:100%;padding:8px;margin-top:8px;font-family:'Press Start 2P',monospace;font-size:8px;background:#0a0a20;color:#f55;border:2px solid #f55;border-radius:4px;cursor:pointer;">${T('slotDelete')}</button>`;
    }
    el.innerHTML = title + body + actions;

    el.querySelector('.slotPlay').onclick = () => {
      sfx();
      window.SaveSlots.select(i);
      hide();
      if (typeof showMode === 'function') showMode();
    };
    const del = el.querySelector('.slotDel');
    if (del) {
      let armed = false;
      del.onclick = () => {
        sfx();
        if (!armed) { armed = true; del.textContent = T('slotDeleteConfirm'); del.style.background = '#3a0000'; return; }
        window.SaveSlots.remove(i);
        render(); // rebuild cards to reflect the now-empty slot
      };
    }
    return el;
  }

  function render() {
    const wrap = overlay.querySelector('#slotCards');
    wrap.innerHTML = '';
    for (let i = 0; i < window.SaveSlots.count; i++) wrap.appendChild(card(i));
    if (typeof window.applyI18nDOM === 'function') window.applyI18nDOM();
    fit();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); sfx(); hide(); if (typeof showMain === 'function') showMain(); }
  }

  function hide() {
    if (overlay) overlay.style.display = 'none';
    window.removeEventListener('keydown', onKey);
  }

  // Public: show the slot picker. Falls back to mode select if the engine is absent.
  window.showSlots = function () {
    if (!window.SaveSlots) { if (typeof showMode === 'function') showMode(); return; }
    if (!overlay) build();
    // Hide other full-screen overlays the way the game's hideAll() would.
    if (typeof window.hideAll === 'function') window.hideAll();
    render();
    overlay.style.display = 'flex';
    bindFit();
    fit();
    // WebViews settle their final size a beat late — re-fit a few times.
    [60, 200, 500].forEach(t => setTimeout(fit, t));
    window.addEventListener('keydown', onKey);
  };

  console.log('✅ Save slots UI loaded');
})();
