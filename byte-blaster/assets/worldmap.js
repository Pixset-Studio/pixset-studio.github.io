// ===============================================
//  WORLD MAP SYSTEM — Visual level selection
// ===============================================
// Replaces the old button-based level grid with an interactive
// world map showing all 10 worlds and 100 levels as a connected path.

(function() {
  'use strict';

  console.log('🗺️ Loading World Map system...');

  // ═══════════════════════════════════════════════
  //  WORLD & LEVEL DATA
  // ═══════════════════════════════════════════════

  const WORLDS = [
    {id:0, name:'CYBER CITY',    icon:'🏙', accent:'#0ff', dark:'#001a2a', mid:'#003355', range:[1,10]},
    {id:1, name:'NEON JUNGLE',   icon:'🌿', accent:'#4f8', dark:'#001a0a', mid:'#003315', range:[11,20]},
    {id:2, name:'LAVA WORLD',    icon:'🌋', accent:'#f62', dark:'#2a0800', mid:'#441100', range:[21,30]},
    {id:3, name:'ICE CAVES',     icon:'❄',  accent:'#8cf', dark:'#001a33', mid:'#002a55', range:[31,40]},
    {id:4, name:'DESERT RUINS',  icon:'🏜', accent:'#e8a', dark:'#2a1800', mid:'#442800', range:[41,50]},
    {id:5, name:'SPACE STATION', icon:'🛸', accent:'#a0f', dark:'#1a0033', mid:'#2a0055', range:[51,60]},
    {id:6, name:'DARK FOREST',   icon:'🌲', accent:'#0b4', dark:'#001a0a', mid:'#003315', range:[61,70]},
    {id:7, name:'TOXIC ZONE',    icon:'☣',  accent:'#cf0', dark:'#1a2200', mid:'#2a3300', range:[71,80]},
    {id:8, name:'STORM PEAKS',   icon:'⚡', accent:'#88f', dark:'#0a0a1a', mid:'#15152a', range:[81,90]},
    {id:9, name:'FINAL FORTRESS', icon:'🔱', accent:'#f44', dark:'#2a0000', mid:'#440000', range:[91,100]},
  ];

  // Localized world name (falls back to the English constant). Uses the shared
  // helper from index.html so the map matches the in-game watermark.
  function wName(world) {
    if (typeof window.worldName === 'function') return window.worldName(world.id);
    return world.name;
  }

  // Generate 100 level nodes positioned along a winding path
  const LEVELS = [];

  // Path layout: snake through the map in a visually pleasing way
  // Each world gets 10 levels arranged in a cluster
  const worldPositions = [
    {cx: 280, cy: 720, spread: 140},  // World 0: bottom-left
    {cx: 480, cy: 620, spread: 130},  // World 1
    {cx: 700, cy: 560, spread: 135},  // World 2
    {cx: 920, cy: 480, spread: 140},  // World 3
    {cx: 1100, cy: 370, spread: 130}, // World 4
    {cx: 1000, cy: 240, spread: 135}, // World 5
    {cx: 820, cy: 170, spread: 130},  // World 6
    {cx: 620, cy: 160, spread: 135},  // World 7
    {cx: 420, cy: 240, spread: 140},  // World 8
    {cx: 280, cy: 380, spread: 150},  // World 9: final
  ];

  // Each world lays its 10 levels out in a DIFFERENT shape so no two worlds
  // look the same. `f` runs 0→1 across the levels; the returned local offset
  // (lx,ly in roughly [-1,1]) is scaled by the world's spread. Consecutive
  // levels stay close so the connecting road traces a coherent path.
  function layoutPoint(w, i) {
    const f = i / 9;
    let lx = 0, ly = 0;
    switch (w % 10) {
      case 0: { // Outward spiral
        const a = f * Math.PI * 2.2 - Math.PI * 0.4, r = 0.25 + f * 0.7;
        lx = Math.cos(a) * r; ly = Math.sin(a) * r;
        break;
      }
      case 1: { // Snake — zigzag rows
        const col = i % 3, row = Math.floor(i / 3);
        lx = (col - 1) * 0.72 * (row % 2 === 0 ? 1 : -1);
        ly = -0.85 + row * 0.55;
        break;
      }
      case 2: { // Rainbow arc
        const a = Math.PI * (1 - f);
        lx = Math.cos(a) * 0.95; ly = -Math.sin(a) * 0.75 + 0.25;
        break;
      }
      case 3: { // S-curve
        lx = Math.sin(f * Math.PI * 2) * 0.85;
        ly = -0.9 + f * 1.8;
        break;
      }
      case 4: { // Vertical wave climbing up
        lx = Math.sin(f * Math.PI * 3) * 0.72;
        ly = 0.9 - f * 1.8;
        break;
      }
      case 5: { // Ring / loop
        const a = f * Math.PI * 1.9 - Math.PI / 2;
        lx = Math.cos(a) * 0.9; ly = Math.sin(a) * 0.9;
        break;
      }
      case 6: { // Diagonal staircase
        lx = -0.9 + f * 1.8;
        ly = 0.75 - f * 1.5 + (i % 2 === 0 ? 0.16 : -0.16);
        break;
      }
      case 7: { // Figure-eight
        const a = f * Math.PI * 2;
        lx = Math.sin(a) * 0.9; ly = Math.sin(a * 2) * 0.5;
        break;
      }
      case 8: { // Horizontal wave
        lx = -0.9 + f * 1.8;
        ly = Math.sin(f * Math.PI * 2.5) * 0.7;
        break;
      }
      case 9: { // Inward spiral toward the center (final fortress)
        const a = f * Math.PI * 2.4, r = 1 - f * 0.82;
        lx = Math.cos(a) * r; ly = Math.sin(a) * r;
        break;
      }
    }
    // Small deterministic jitter so even similar curves feel hand-placed.
    const jx = Math.sin(w * 12.9898 + i * 78.233);
    const jy = Math.sin(w * 39.346 + i * 11.135);
    return { lx: lx + jx * 0.07, ly: ly + jy * 0.07 };
  }

  for (let w = 0; w < 10; w++) {
    const world = WORLDS[w];
    const pos = worldPositions[w];
    const [start, end] = world.range;

    for (let i = 0; i < 10; i++) {
      const levelNum = start + i;
      const isBoss = (i === 9); // Last level of each world is boss

      // World-specific shape — each world traces a distinct path.
      const lp = layoutPoint(w, i);
      const x = pos.cx + lp.lx * pos.spread;
      const y = pos.cy + lp.ly * pos.spread;

      LEVELS.push({
        id: `L${levelNum}`,
        num: levelNum,
        worldId: w,
        name: `${levelNum}${isBoss ? ' BOSS' : ''}`,
        // bx/by are the immutable base-layout coords (1400×900 reference space).
        // The on-screen x/y are recomputed from these by layoutLevels() so the
        // field can scale with resolution + Game Scale without losing the shape.
        bx: x,
        by: y,
        x: Math.round(x),
        y: Math.round(y),
        type: isBoss ? 'boss' : 'normal',
        unlocked: levelNum === 1, // Only first level unlocked initially
        completed: false,
      });
    }
  }

  // Immutable base reference for the world-zone gradients/labels (1400×900 space).
  // `worldRender` holds the on-screen copy that layoutLevels() rewrites each time
  // the field is sized.
  const BASE_WORLD = worldPositions.map(p => ({ cx: p.cx, cy: p.cy, spread: p.spread }));
  let worldRender = BASE_WORLD.map(p => ({ ...p }));

  // Base bounds of the node layout, computed once (drives every relayout).
  let BASE_MINX = Infinity, BASE_MAXX = -Infinity, BASE_MINY = Infinity, BASE_MAXY = -Infinity;
  for (const l of LEVELS) {
    if (l.bx < BASE_MINX) BASE_MINX = l.bx; if (l.bx > BASE_MAXX) BASE_MAXX = l.bx;
    if (l.by < BASE_MINY) BASE_MINY = l.by; if (l.by > BASE_MAXY) BASE_MAXY = l.by;
  }

  // Generate paths between consecutive levels
  const PATHS = [];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    PATHS.push([LEVELS[i].id, LEVELS[i + 1].id]);
  }

  // ═══════════════════════════════════════════════
  //  MAP STATE
  // ═══════════════════════════════════════════════

  const MAP_STATE = {
    currentLevelId: 'L1',
    playerX: LEVELS[0].x,
    playerY: LEVELS[0].y,
    playerMoving: false,
    playerCurve: null,
    playerT: 1,
    time: 0,
    hard: false, // Hardcore mode — drives which save slot is read and the red theme
    twoPlayer: false, // two robots walk the map in 2-player mode
    walk: null,    // active walk animation along the road (null when idle)
    walkPhase: 0,  // leg-kick phase
    faceDir: 1,    // 1 = facing right, -1 = left
  };

  // Accent colour for a world — overridden to red in Hardcore mode.
  function worldAccent(world) {
    return MAP_STATE.hard ? '#f44' : world['accent'];
  }

  // ═══════════════════════════════════════════════
  //  CANVAS SETUP
  // ═══════════════════════════════════════════════

  let mapCanvas, mapCtx;
  let mapOverlay;
  // Live canvas dimensions (follow the window/resolution) and node-size factor.
  // mapW/mapH are LOGICAL (CSS) pixels — all drawing uses them. mapDpr is the
  // device-pixel-ratio: the canvas backing store is mapW*mapDpr so the map is
  // rendered crisp on high-DPI phones (otherwise it was drawn at the low CSS
  // resolution and stretched, which made it blurry with oversized labels —
  // looking nothing like the sharp PC version).
  let mapW = 1400, mapH = 900, nodeScale = 1, mapDpr = 1;

  const clampN = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const nodeBaseR = level => (level.type === 'boss' ? 22 : 16);
  const nodeR = level => nodeBaseR(level) * nodeScale;

  // Recompute every node's on-screen position from its base coords. The playable
  // field size scales with the screen (resolution → canvas size) AND the Game
  // Scale setting; nodes are then relaxed so none overlap and clamped so none
  // leave the field. Called whenever the canvas is sized or the map is opened.
  function layoutLevels() {
    const dataW = (BASE_MAXX - BASE_MINX) || 1;
    const dataH = (BASE_MAXY - BASE_MINY) || 1;

    // HUD-safe margins: clear the top-left info stack and the bottom panel/hints.
    // Measured from the ACTUAL on-screen chrome (which fitHud() scales to the
    // screen) so level nodes never slip under a panel on small phones. Falls back
    // to fixed insets before the overlay/panels exist. Capped at ~40% per side so
    // the playable field can never collapse to nothing.
    let PAD_L = 22, PAD_R = 22, PAD_T = 150, PAD_B = 160;
    if (mapOverlay) {
      const rectOf = sel => {
        const el = mapOverlay.querySelector(sel);
        if (!el || el.style.display === 'none') return null;
        const r = el.getBoundingClientRect();
        return (r.width && r.height) ? r : null;
      };
      // Top band: below the tallest of the title/stats panel and ACHIEVEMENTS.
      let topB = 0;
      [rectOf('#mapHudTL'), rectOf('#mapAchBtn')].forEach(r => { if (r) topB = Math.max(topB, r.bottom); });
      if (topB > 0) PAD_T = clampN(topB + 16, 90, mapH * 0.4);
      // Bottom band: above the zone tag / BACK button / keyboard hint AND the
      // always-visible level-info panel ("LEVEL N"), so no node hides under them.
      let botTop = mapH;
      ['#mapZoneTag', '#mapBackTouch', '#mapKbdHint', '#mapLevelPanel'].forEach(sel => {
        const r = rectOf(sel); if (r) botTop = Math.min(botTop, r.top);
      });
      const measuredB = botTop < mapH ? (mapH - botTop) : 0;
      PAD_B = clampN(Math.max(measuredB + 16, 150), 110, mapH * 0.46);
    }
    const safeX = PAD_L, safeY = PAD_T;
    const safeW = Math.max(220, mapW - PAD_L - PAD_R);
    const safeH = Math.max(200, mapH - PAD_T - PAD_B);

    // Game Scale widens/narrows the field; resolution already set the safe box.
    const gs = (window.gameSettings && window.gameSettings.gameScale) || 0;
    const factor = gs > 0 ? clampN(gs / 3, 0.45, 1) : 1.0;
    const fieldW = safeW * factor, fieldH = safeH * factor;
    const fieldX = safeX + (safeW - fieldW) / 2, fieldY = safeY + (safeH - fieldH) / 2;

    // Size nodes from the available area so all 100 ALWAYS fit without overlap:
    // a smaller field (lower resolution / Game Scale) yields smaller nodes, a
    // larger field yields bigger ones — overlap is impossible either way.
    const cell = Math.sqrt((fieldW * fieldH) / LEVELS.length);
    // Bigger nodes that fill more of the screen: the old cap (26) left the PC
    // map looking tiny with lots of empty space. A higher multiplier + cap make
    // the level nodes chunky like the phone build while relaxation (below) still
    // guarantees all 100 fit without overlap.
    const rTarget = clampN(cell * 0.40, 9, 34);
    nodeScale = rTarget / 16; // 16 = base normal-node radius
    const maxR = 22 * nodeScale;

    const innerX = fieldX + maxR, innerY = fieldY + maxR;
    const innerW = Math.max(1, fieldW - maxR * 2), innerH = Math.max(1, fieldH - maxR * 2);
    const scale = Math.min(innerW / dataW, innerH / dataH);
    const offX = innerX + (innerW - dataW * scale) / 2;
    const offY = innerY + (innerH - dataH * scale) / 2;

    for (const l of LEVELS) {
      l.x = offX + (l.bx - BASE_MINX) * scale;
      l.y = offY + (l.by - BASE_MINY) * scale;
    }
    // worldRender centres are derived from the FINAL node positions further down
    // (after relaxation) — see the centroid pass below.

    // Relaxation: push apart any pair closer than their combined radii + gap,
    // re-clamping into the field each pass so nodes never leave the screen.
    const gap = 10 * nodeScale;
    const loX = fieldX + maxR, hiX = fieldX + fieldW - maxR;
    const loY = fieldY + maxR, hiY = fieldY + fieldH - maxR;
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let a = 0; a < LEVELS.length; a++) {
        for (let b = a + 1; b < LEVELS.length; b++) {
          const la = LEVELS[a], lb = LEVELS[b];
          let dx = lb.x - la.x, dy = lb.y - la.y;
          let d = Math.hypot(dx, dy);
          const need = nodeR(la) + nodeR(lb) + gap;
          if (d > 0.0001 && d < need) {
            const push = (need - d) / 2, ux = dx / d, uy = dy / d;
            la.x -= ux * push; la.y -= uy * push;
            lb.x += ux * push; lb.y += uy * push;
            moved = true;
          } else if (d <= 0.0001) {
            la.x -= 0.5; lb.x += 0.5; moved = true; // separate coincident nodes
          }
        }
      }
      for (const l of LEVELS) { l.x = clampN(l.x, loX, hiX); l.y = clampN(l.y, loY, hiY); }
      if (!moved) break;
    }
    for (const l of LEVELS) { l.x = Math.round(l.x); l.y = Math.round(l.y); }

    // Re-derive each world's on-screen centre + spread from where its 10 nodes
    // ACTUALLY ended up after relaxation. Relaxation can shove nodes well away
    // from the pre-relaxation cluster centre — most visibly on very wide/short
    // phone screens, where the node field spreads across the full width while
    // the old centres stayed bunched, so the world labels/zone glows (anchored
    // to those centres) drifted into a clump in the middle (the phone-vs-PC bug).
    // A centroid of the final node positions keeps labels locked on their cluster
    // on every aspect ratio.
    for (let w = 0; w < worldRender.length; w++) {
      let sx = 0, sy = 0, n = 0;
      for (const l of LEVELS) { if (l.worldId === w) { sx += l.x; sy += l.y; n++; } }
      if (!n) continue;
      const cx = sx / n, cy = sy / n;
      let maxD = 0;
      for (const l of LEVELS) {
        if (l.worldId === w) { const d = Math.hypot(l.x - cx, l.y - cy); if (d > maxD) maxD = d; }
      }
      worldRender[w].cx = cx;
      worldRender[w].cy = cy;
      worldRender[w].spread = Math.max(40, maxD); // cluster radius drives glow + label offset
    }

    // Keep the idle robot on its current node after a relayout/resize.
    const cur = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    if (cur && !MAP_STATE.walk) { MAP_STATE.playerX = cur.x; MAP_STATE.playerY = cur.y; }
  }

  function createMapCanvas() {
    mapCanvas = document.createElement('canvas');
    mapCanvas.id = 'worldMapCanvas';
    mapCanvas.width = mapW;
    mapCanvas.height = mapH;
    mapCanvas.style.cssText = `
      display: block;
      image-rendering: auto;
      cursor: pointer;
    `;
    mapCtx = mapCanvas.getContext('2d');
  }

  function createMapOverlay() {
    mapOverlay = document.createElement('div');
    mapOverlay.id = 'mapOverlay';
    mapOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(4, 4, 15, 0.98);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 3000;
    `;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // HUD overlay. Each corner panel is independently anchored so fitHud() can
    // scale it toward its own corner on small screens (no overlap on phones).
    const hud = document.createElement('div');
    hud.innerHTML = `
      <div id="mapHudTL" style="position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: calc(10px + env(safe-area-inset-left, 0px)); transform-origin: top left; pointer-events: none; z-index: 10; background: rgba(0,0,0,0.8); border: 1px solid #0ff; padding: 8px 14px; backdrop-filter: blur(4px);">
        <div id="worldMapTitle" style="font-family: 'Press Start 2P', monospace; font-size: 12px; color: #0ff; text-shadow: 0 0 10px #0ff; letter-spacing: 2px;">⚡ BYTE BLASTER</div>
        <div id="worldMapSub" style="font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0f0; letter-spacing: 2px; margin-top: 3px;">▸ <span data-i18n="mapWorldMap">WORLD MAP</span></div>
        <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #0ff; letter-spacing: 1px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #0ff3;"><span data-i18n="mapCleared">CLEARED</span>: <span id="mapClearedCount">0</span> / 100</div>
        <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #ffd23f; letter-spacing: 1px; margin-top: 4px;">★ <span data-i18n="mapStars">STARS</span>: <span id="mapStarsCount">0</span> / 300</div>
        <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #0ff; letter-spacing: 1px; margin-top: 4px;">◆ <span data-i18n="mapCrystals">CRYSTALS</span>: <span id="mapShardsCount">0</span> / 300</div>
        <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #8cf; letter-spacing: 1px; margin-top: 4px;">∑ <span data-i18n="score">SCORE</span>: <span id="mapTotalScore">0</span></div>
        <div id="mapCurrentZone" style="font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #666; letter-spacing: 2px; margin-top: 2px;">CYBER CITY</div>
      </div>
      <button id="mapAchBtn" data-i18n="achievements" style="position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(10px + env(safe-area-inset-right, 0px)); transform-origin: top right; z-index: 10; pointer-events: auto; background: rgba(0,0,0,0.8); border: 1px solid #0ff; color: #0ff; padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; letter-spacing: 1px; cursor: pointer; text-shadow: 0 0 8px #0ff;">🏆 ACHIEVEMENTS</button>
      <button id="mapBackTouch" data-i18n="back" style="position: fixed; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); right: calc(10px + env(safe-area-inset-right, 0px)); transform-origin: bottom right; z-index: 12; display: none; pointer-events: auto; background: rgba(0,0,0,0.85); border: 1px solid #f44; color: #f88; padding: 12px 16px; font-family: 'Press Start 2P', monospace; font-size: 9px; letter-spacing: 1px; cursor: pointer;">← BACK</button>
      <div id="mapZoneTag" style="position: fixed; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); left: calc(10px + env(safe-area-inset-left, 0px)); transform-origin: bottom left; z-index: 10; pointer-events: none; font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 3px; padding: 7px 12px; background: rgba(0,0,0,0.6); border-left: 3px solid #0ff; color: #0ff;">CYBER CITY</div>
      <div id="mapKbdHint" style="position: fixed; bottom: 10px; right: 10px; transform-origin: bottom right; z-index: 10; background: rgba(0,0,0,0.55); border: 1px solid #1a1a1a; padding: 7px 12px; font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #383838; line-height: 1.8; text-align: right; pointer-events: none;">
        ↑↓←→ / WASD — MOVE<br>
        ENTER / SPACE — START<br>
        ESC — BACK TO MENU
      </div>
      <div id="mapLevelPanel" style="position: fixed; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); transform-origin: bottom center; background: rgba(0,0,0,0.92); border: 2px solid #0ff; padding: 11px 28px; text-align: center; min-width: 310px; display: none; z-index: 11;">
        <div id="mapLevelName" style="font-family: 'Press Start 2P', monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; margin-bottom: 2px; color: #0ff;">LEVEL 1</div>
        <div id="mapLevelSub" style="font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #555; letter-spacing: 2px; margin-bottom: 6px;">CYBER CITY</div>
        <div id="mapLevelScore" style="font-family: 'Share Tech Mono', monospace; font-size: 9px; color: #ffd23f; letter-spacing: 1px; margin-bottom: 7px; display: none;"></div>
        <div id="mapLevelAction" style="font-family: 'Share Tech Mono', monospace; font-size: 9px; letter-spacing: 1px;"></div>
      </div>
    `;

    wrapper.appendChild(mapCanvas);
    wrapper.appendChild(hud);
    mapOverlay.appendChild(wrapper);
    document.body.appendChild(mapOverlay);

    // Achievements button (top-right of the map). The Achievements overlay sits
    // above the map and its close simply reveals the map again.
    const achBtn = mapOverlay.querySelector('#mapAchBtn');
    if (achBtn) {
      achBtn.onclick = () => {
        if (window.SFX && window.SFX.menu) window.SFX.menu();
        if (window.Achievements && window.Achievements.showMenu) window.Achievements.showMenu();
      };
      achBtn.onmouseenter = () => { achBtn.style.boxShadow = '0 0 14px #0ff'; achBtn.style.transform = 'scale(1.04)'; };
      achBtn.onmouseleave = () => { achBtn.style.boxShadow = 'none'; achBtn.style.transform = 'scale(1)'; };
    }
    // Touch-only BACK button (no ESC key on phones) — returns to the previous
    // screen (the difficulty select). It must route through the game's doEsc()
    // so navScr is updated and that screen is actually shown; calling only
    // hideWorldMap() left navScr stuck on 'map' and showed a blank screen.
    const backTouch = mapOverlay.querySelector('#mapBackTouch');
    if (backTouch) {
      backTouch.onclick = () => {
        hideWorldMap();
        if (typeof window.doEsc === 'function') window.doEsc(); // plays SFX + navigates map→diff
        else if (window.SFX && window.SFX.back) window.SFX.back();
      };
    }
    // Translate the freshly-built HUD (the achievements label uses data-i18n).
    if (typeof window.applyI18nDOM === 'function') window.applyI18nDOM();

    // Resize canvas to fit window
    resizeMapCanvas();
    window.addEventListener('resize', resizeMapCanvas);
  }

  function resizeMapCanvas() {
    // Fill the window in LOGICAL (CSS) pixels — the layout math below works in
    // this space, identical on PC and phone, so the map looks the same on both.
    mapW = Math.max(640, window.innerWidth);
    mapH = Math.max(480, window.innerHeight);
    // High-DPI: render the backing store at device resolution and scale the
    // context back to CSS pixels. This is THE fix for the phone map looking
    // blurry/zoomed (oversized labels) vs the crisp PC map — on a 2.5–3× phone
    // the canvas was previously drawn at ~960px and stretched across the screen.
    mapDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    mapCanvas.width = Math.round(mapW * mapDpr);
    mapCanvas.height = Math.round(mapH * mapDpr);
    mapCanvas.style.width = mapW + 'px';
    mapCanvas.style.height = mapH + 'px';
    // Setting canvas.width resets the transform, so (re)apply the DPR scale here.
    mapCtx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    // fitHud() scales the corner panels, then re-lays the level nodes using the
    // panels' measured sizes (so nothing overlaps). It owns layoutLevels() now.
    fitHud();
  }

  // Scale the corner HUD panels down on small screens so they never overlap or
  // spill off-screen. Each panel scales toward its own corner (transform-origin
  // set in the markup). The keyboard-hint panel is hidden on touch devices.
  function fitHud() {
    if (!mapOverlay) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
                    (window.gameSettings && window.gameSettings.touchControls === 'on');
    const kbd = mapOverlay.querySelector('#mapKbdHint');
    if (kbd) kbd.style.display = isTouch ? 'none' : '';
    // The touch BACK button replaces the (hidden) keyboard hint on touch devices.
    const backTouch = mapOverlay.querySelector('#mapBackTouch');
    if (backTouch) backTouch.style.display = isTouch ? '' : 'none';

    // On phones the ACHIEVEMENTS + BACK buttons were shrunk together with the
    // info panels down to ~3px (invisible/untappable). Give them a bigger base
    // size on touch so that — even after scaling — they stay readable and meet
    // a comfortable touch-target size. Reset to the desktop size otherwise.
    const achEl0 = mapOverlay.querySelector('#mapAchBtn');
    if (achEl0)    { achEl0.style.fontSize  = isTouch ? '13px' : ''; achEl0.style.padding = isTouch ? '12px 16px' : ''; }
    if (backTouch) { backTouch.style.fontSize = isTouch ? '13px' : ''; backTouch.style.padding = isTouch ? '14px 20px' : ''; }

    // One master scale `k` (≤1) shared by every panel so the chrome stays
    // proportional AND leaves the node field enough room. Constraints folded in:
    //  • each corner panel ≤44% width / 40% height
    //  • top-left stats + top-right ACHIEVEMENTS fit side by side (no cover-up)
    //  • the centred level panel ≤90% width
    //  • VERTICAL STACK: stats (top) + level panel (bottom) must leave the node
    //    field ≥~42% of the height — the key fix for short landscape phones where
    //    the tall stats panel + level panel otherwise eat the whole screen and
    //    push nodes underneath them.
    const panels = ['#mapHudTL', '#mapAchBtn', '#mapZoneTag', '#mapKbdHint', '#mapBackTouch']
      .map(s => mapOverlay.querySelector(s))
      .filter(el => el && el.style.display !== 'none');
    const lvl = mapOverlay.querySelector('#mapLevelPanel');
    if (lvl) lvl.style.transform = 'translateX(-50%)';   // measure natural (no scale)

    let k = 1;
    panels.forEach(el => {
      el.style.transform = '';            // measure at natural size
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return;
      k = Math.min(k, (vw * 0.44) / w, (vh * 0.40) / h);
    });
    const tlEl = mapOverlay.querySelector('#mapHudTL');
    const achEl = mapOverlay.querySelector('#mapAchBtn');
    if (tlEl && achEl) {
      const need = tlEl.offsetWidth + achEl.offsetWidth;        // natural widths
      if (need > 0) k = Math.min(k, (vw * 0.94) / need);
    }
    const lvlW = lvl ? lvl.offsetWidth : 0, lvlH = lvl ? lvl.offsetHeight : 0;
    if (lvlW > 0) k = Math.min(k, (vw * 0.90) / lvlW);
    // Vertical stack constraint (the landscape fix). On touch we reserve a bit
    // less height for the node field so the chrome can stay a readable size.
    const stackH = (tlEl ? tlEl.offsetHeight : 0) + lvlH;
    const minBand = clampN(vh * (isTouch ? 0.34 : 0.42), isTouch ? 150 : 210, 340);
    if (stackH > 0) k = Math.min(k, (vh - minBand - 98) / stackH);

    // Floor: keep the chrome readable. Higher on touch so the info panels never
    // collapse to an illegible smear like they did before.
    k = Math.max(isTouch ? 0.5 : 0.34, k);
    panels.forEach(el => { el.style.transform = k < 1 ? 'scale(' + k + ')' : ''; });
    if (lvl) lvl.style.transform = 'translateX(-50%)' + (k < 1 ? ' scale(' + k + ')' : '');
    // The two control buttons (ACHIEVEMENTS, BACK) get their own gentler floor so
    // they always stay big enough to read and tap, independent of how much the
    // info panels had to shrink. They sit in their own corners, so enlarging them
    // can't cover the stats panel.
    const kBtn = Math.min(1, Math.max(k, isTouch ? 0.85 : 0.34));
    [achEl0, backTouch].forEach(el => {
      if (el && el.style.display !== 'none') el.style.transform = kBtn < 1 ? 'scale(' + kBtn + ')' : '';
    });

    // Panels are now sized for this screen — re-lay the level nodes so they keep
    // clear of the (possibly scaled) chrome. Done here so every fitHud() caller,
    // including the post-open settle timers, gets a correct field.
    layoutLevels();
  }

  // ═══════════════════════════════════════════════
  //  DRAWING FUNCTIONS
  // ═══════════════════════════════════════════════

  function drawBackground() {
    const ctx = mapCtx;
    const W = mapW, H = mapH, t = MAP_STATE.time;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, W * 0.5, H);
    sky.addColorStop(0, '#06101e');
    sky.addColorStop(0.5, '#020c1a');
    sky.addColorStop(1, '#010912');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Nebula washes — large soft colour blobs that fill the empty space.
    const NEB = [
      { x: 0.18, y: 0.24, r: 0.30, c: '#0a2a55' }, { x: 0.80, y: 0.20, r: 0.30, c: '#2a0a55' },
      { x: 0.62, y: 0.80, r: 0.34, c: '#0a3355' }, { x: 0.16, y: 0.76, r: 0.27, c: '#3a0a44' },
      { x: 0.50, y: 0.45, r: 0.40, c: '#06243f' },
    ];
    ctx.save();
    for (let i = 0; i < NEB.length; i++) {
      const n = NEB[i], cx = n.x * W, cy = n.y * H, rr = n.r * Math.min(W, H) * (1 + Math.sin(t * 0.2 + i) * 0.05);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, n.c); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.20; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Faint tech grid for depth (single stroke — cheap).
    ctx.save();
    ctx.globalAlpha = 0.045; ctx.strokeStyle = '#0a4a66'; ctx.lineWidth = 1;
    const gs = 64; ctx.beginPath();
    for (let gx = 0; gx <= W; gx += gs) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (let gy = 0; gy <= H; gy += gs) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();
    ctx.restore();

    // Stars — density scales with the canvas area so big screens aren't bare.
    const starCount = Math.min(460, Math.round((W * H) / 4200));
    ctx.fillStyle = '#ffffee';
    for (let i = 0; i < starCount; i++) {
      const x = (i * 149.3) % W;
      const y = (i * 97.7) % H;
      const sz = i % 11 === 0 ? 2 : 1;
      ctx.globalAlpha = 0.22 + Math.sin(t * 0.6 + i) * 0.22;
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.globalAlpha = 1;

    // Drifting data motes — more of them, spread across the whole canvas.
    const moteCount = Math.min(90, Math.round((W * H) / 22000));
    ctx.save();
    for (let i = 0; i < moteCount; i++) {
      const x = ((i * 237.5 + t * 8) % W + W) % W;
      const y = ((i * 143.7 + Math.sin(t * 0.3 + i) * 24) % H + H) % H;
      const pulse = Math.sin(t * 0.6 + i * 0.5) * 0.5 + 0.5;
      ctx.globalAlpha = pulse * 0.18;
      ctx.fillStyle = i % 3 === 0 ? '#0ff' : i % 3 === 1 ? '#4af' : '#08f';
      ctx.beginPath();
      ctx.arc(x, y, 1 + pulse * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWorldZones() {
    const ctx = mapCtx;

    const t = MAP_STATE.time;
    // Draw world zone backgrounds
    for (const world of WORLDS) {
      const pos = worldRender[world.id];
      const accent = worldAccent(world);
      const R = Math.max(60, pos.spread); // keep a sensible minimum footprint

      // Zone glow — larger & a touch brighter so each cluster reads clearly.
      const gradient = ctx.createRadialGradient(pos.cx, pos.cy, 0, pos.cx, pos.cy, R * 1.5);
      gradient.addColorStop(0, world.mid + 'aa');
      gradient.addColorStop(0.55, world.dark + '55');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(pos.cx - R * 1.5, pos.cy - R * 1.5, R * 3, R * 3);

      // Dashed boundary ring around the zone.
      ctx.save();
      ctx.globalAlpha = 0.20; ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.arc(pos.cx, pos.cy, R * 1.18, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Orbiting motes around the cluster.
      ctx.save();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + t * 0.2 + world.id * 0.5;
        const radius = R * 1.05 + Math.sin(t * 0.4 + i) * 8;
        const dx = pos.cx + Math.cos(angle) * radius;
        const dy = pos.cy + Math.sin(angle) * radius;
        const pulse = Math.sin(t * 0.6 + i * 0.8) * 0.5 + 0.5;
        ctx.globalAlpha = 0.18 + pulse * 0.12;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.5 + pulse * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // World icon — a clearly visible watermark behind the cluster.
      const iconPulse = Math.sin(t * 0.4 + world.id * 0.7) * 0.15 + 0.85;
      ctx.globalAlpha = 0.13 * iconPulse;
      ctx.font = `${Math.max(34, R * 0.7)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = accent;
      ctx.fillText(world.icon, pos.cx, pos.cy);
      ctx.restore();

    }
  }

  // World NAME labels are drawn in a SEPARATE pass, on top of the paths and
  // level nodes, so they're never hidden behind a dense cluster. Each label is
  // nudged to the least-crowded side of its cluster and clamped on-screen.
  function drawWorldLabels() {
    const ctx = mapCtx;
    const placed = []; // rects already taken, to avoid label-on-label overlap
    for (const world of WORLDS) {
      const pos = worldRender[world.id];
      const accent = worldAccent(world);
      const R = Math.max(60, pos.spread);
      const label = wName(world);

      // Slightly smaller labels on dense/zoomed-out maps so plates don't collide.
      const fs = clampN(Math.round(11 * nodeScale), 12, 20);
      ctx.font = `bold ${fs}px "Share Tech Mono", monospace`;
      const tw = ctx.measureText(label).width;
      const halfW = tw / 2 + 7, halfH = fs / 2 + 4;

      // Many candidate anchors around the cluster (cardinals + diagonals at two
      // distances). Pick the one that overlaps already-placed labels the LEAST
      // (area of intersection), not just the first non-overlapping one — so when
      // everything is cramped we still spread out instead of stacking.
      const off = R * 1.15 + fs;
      const ring = (m) => [
        { x: pos.cx,           y: pos.cy - off * m }, { x: pos.cx,           y: pos.cy + off * m },
        { x: pos.cx - off * m, y: pos.cy           }, { x: pos.cx + off * m, y: pos.cy           },
        { x: pos.cx - off * m, y: pos.cy - off * m }, { x: pos.cx + off * m, y: pos.cy - off * m },
        { x: pos.cx - off * m, y: pos.cy + off * m }, { x: pos.cx + off * m, y: pos.cy + off * m },
      ];
      const cands = [...ring(1), ...ring(1.55)];
      let best = null, bestPen = Infinity;
      for (const c of cands) {
        c.x = clampN(c.x, halfW + 4, mapW - halfW - 4);
        c.y = clampN(c.y, halfH + 56, mapH - halfH - 56);
        let pen = 0;
        for (const p of placed) {
          const ox = (p.hw + halfW) - Math.abs(p.x - c.x);
          const oy = (p.hh + halfH) - Math.abs(p.y - c.y);
          if (ox > 0 && oy > 0) pen += ox * oy;     // overlap area
        }
        if (pen < bestPen) { bestPen = pen; best = c; if (pen === 0) break; }
      }
      placed.push({ x: best.x, y: best.y, hw: halfW, hh: halfH });

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Dark plate for contrast (no glow on the plate).
      ctx.globalAlpha = 0.72; ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(best.x - halfW, best.y - halfH, halfW * 2, halfH * 2);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = accent; ctx.lineWidth = 1;
      ctx.strokeRect(best.x - halfW, best.y - halfH, halfW * 2, halfH * 2);
      // Glowing text.
      ctx.globalAlpha = 1; ctx.fillStyle = accent;
      ctx.shadowBlur = 10; ctx.shadowColor = accent;
      ctx.font = `bold ${fs}px "Share Tech Mono", monospace`;
      ctx.fillText(label, best.x, best.y);
      ctx.restore();
    }
  }

  function drawPaths() {
    const ctx = mapCtx;

    for (const [fromId, toId] of PATHS) {
      const from = LEVELS.find(l => l.id === fromId);
      const to = LEVELS.find(l => l.id === toId);
      if (!from || !to) continue;

      const world = WORLDS[from.worldId];
      const unlocked = from.unlocked && to.unlocked;
      const isActive = MAP_STATE.currentLevelId === fromId || MAP_STATE.currentLevelId === toId;

      ctx.save();
      ctx.lineCap = 'round';

      if (unlocked) {
        // Shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y + 2);
        ctx.lineTo(to.x, to.y + 2);
        ctx.stroke();

        // Base road
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        // Accent line
        ctx.strokeStyle = worldAccent(world);
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.globalAlpha = isActive ? 0.9 : 0.5;
        if (isActive) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = worldAccent(world);
        }
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      } else {
        // Locked path
        ctx.strokeStyle = '#0d0d1a';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawLevelNode(level) {
    const ctx = mapCtx;
    const world = WORLDS[level.worldId];
    const isCurrent = MAP_STATE.currentLevelId === level.id;
    const R = nodeR(level);

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(level.x + 2, level.y + R * 0.6 + 3, R * 1.1, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Pulse ring for current level
    if (isCurrent && level.unlocked) {
      const pulse = 0.5 + 0.5 * Math.sin(MAP_STATE.time * 2.5);
      ctx.save();
      ctx.strokeStyle = worldAccent(world);
      ctx.lineWidth = 3;
      ctx.globalAlpha = pulse * 0.7;
      ctx.shadowBlur = 20;
      ctx.shadowColor = worldAccent(world);
      ctx.beginPath();
      ctx.arc(level.x, level.y, R + 8 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (isCurrent) {
      ctx.shadowBlur = 30;
      ctx.shadowColor = worldAccent(world);
    }

    // Circle
    ctx.beginPath();
    ctx.arc(level.x, level.y, R, 0, Math.PI * 2);
    ctx.fillStyle = !level.unlocked ? '#07071a' : level.completed ? '#041408' : '#0b0e20';
    ctx.fill();
    ctx.strokeStyle = level.unlocked ? worldAccent(world) : '#181832';
    ctx.lineWidth = isCurrent ? 3.5 : 2;
    ctx.globalAlpha = level.unlocked ? 1 : 0.25;
    ctx.stroke();

    // Icon/Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!level.unlocked) {
      // Lock icon
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#3333aa';
      ctx.fillRect(level.x - 4, level.y - 1, 8, 5);
      ctx.beginPath();
      ctx.arc(level.x, level.y - 3, 3.5, Math.PI, 0);
      ctx.strokeStyle = '#3333aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Show level number below lock
      ctx.globalAlpha = 0.15;
      ctx.font = `bold ${R * 0.4}px "Share Tech Mono", monospace`;
      ctx.fillStyle = '#666';
      ctx.fillText(level.num, level.x, level.y + R * 0.7);
    } else if (level.completed) {
      // Checkmark on top
      ctx.font = `bold ${R * 0.7}px monospace`;
      ctx.fillStyle = '#00ee44';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00ff44';
      ctx.fillText('✓', level.x, level.y - R * 0.25);
      // Level number below checkmark
      ctx.shadowBlur = 0;
      ctx.font = `bold ${R * 0.45}px "Share Tech Mono", monospace`;
      ctx.fillStyle = worldAccent(world);
      ctx.globalAlpha = 0.7;
      ctx.fillText(level.num, level.x, level.y + R * 0.35);
    } else if (level.type === 'boss') {
      // Boss icon on top
      ctx.font = `bold ${R * 0.65}px monospace`;
      ctx.fillStyle = worldAccent(world);
      ctx.shadowBlur = isCurrent ? 14 : 0;
      ctx.shadowColor = worldAccent(world);
      ctx.fillText('👑', level.x, level.y - R * 0.2);
      // Level number below crown
      ctx.shadowBlur = 0;
      ctx.font = `bold ${R * 0.4}px "Share Tech Mono", monospace`;
      ctx.fillText(level.num, level.x, level.y + R * 0.4);
    } else {
      // Level number (centered)
      ctx.font = `bold ${R * 0.55}px "Share Tech Mono", monospace`;
      ctx.fillStyle = worldAccent(world);
      ctx.shadowBlur = isCurrent ? 12 : 0;
      ctx.shadowColor = worldAccent(world);
      ctx.fillText(level.num, level.x, level.y + 1);
    }

    // Star rating row (completed levels only): 3 tiny stars below the node.
    if (level.completed && window.levelStars) {
      const stars = window.levelStars(level.num, MAP_STATE.hard);
      if (stars > 0) {
        const sy = level.y + R + 8;
        const gap = R * 0.45;
        ctx.shadowBlur = 0;
        for (let i = 0; i < 3; i++) {
          const sx = level.x + (i - 1) * gap;
          const lit = i < stars;
          ctx.globalAlpha = lit ? 0.9 : 0.2;
          ctx.fillStyle = lit ? '#ffd23f' : '#3a3a4a';
          // Tiny 5-point star
          const r = R * 0.18;
          ctx.beginPath();
          for (let p = 0; p < 10; p++) {
            const rad = (p % 2 === 0) ? r : r * 0.45;
            const ang = Math.PI * p / 5 - Math.PI / 2;
            const px = sx + rad * Math.cos(ang);
            const py = sy + rad * Math.sin(ang);
            if (p === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  // Draw one little robot token at (x,y) with optional leg animation.
  function drawRobot(x, y, body, glow, legKick = 0) {
    const ctx = mapCtx;
    const S = 3;
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = glow;
    // Legs (animated when walking)
    ctx.fillStyle = body;
    ctx.fillRect(x - S * 1.5, y + S, S * 1.2, S * 2 + legKick * 0.5);  // Left leg
    ctx.fillRect(x + S * 0.3, y + S, S * 1.2, S * 2 - legKick * 0.5);  // Right leg
    // Body
    ctx.fillRect(x - S * 2, y - S * 3, S * 4, S * 4);
    // Antenna
    ctx.fillRect(x - 0.5, y - S * 4, 1, S);
    ctx.beginPath(); ctx.arc(x, y - S * 4, 1.6, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x - S, y - S * 2, S * 0.8, S * 0.8);
    ctx.fillRect(x + S * 0.2, y - S * 2, S * 0.8, S * 0.8);
    ctx.restore();
  }

  function drawPlayer() {
    const ctx = mapCtx;
    const x = MAP_STATE.playerX;
    const y = MAP_STATE.playerY;
    const face = MAP_STATE.faceDir || 1;
    const walking = !!MAP_STATE.walk;
    const sc = 0.62;       // robot scale on the map
    const footY = y + 11;  // stand on/just below the node
    // Pronounced alternating leg kick + a little body bob while walking.
    const legOf = (ph) => walking ? Math.sin(MAP_STATE.walkPhase * 0.45 + ph) * 4 : 0;
    const bob = walking ? Math.abs(Math.sin(MAP_STATE.walkPhase * 0.45)) * 2 : 0;

    const drawOne = (px, scheme, phase) => {
      if (window.drawByteRobot) window.drawByteRobot(ctx, px, footY - bob, sc, scheme, legOf(phase), face);
      else drawRobot(px, y, scheme === 'red' ? '#ff5555' : '#2aa0ff', scheme === 'red' ? '#ff2a2a' : '#00ccff', legOf(phase));
    };

    if (MAP_STATE.twoPlayer) {
      if (walking) {
        // Red trails behind the blue leader along the facing direction (legs out of phase).
        drawOne(x - face * 13, 'red', Math.PI);
        drawOne(x, 'blue', 0);
      } else {
        drawOne(x - 9, 'blue', 0);
        drawOne(x + 9, 'red', Math.PI);
      }
    } else {
      drawOne(x, 'blue', 0);
    }
  }

  function render() {
    drawBackground();
    drawWorldZones();
    drawPaths();

    // Draw all nodes except current
    for (const level of LEVELS) {
      if (level.id !== MAP_STATE.currentLevelId) {
        drawLevelNode(level);
      }
    }

    // Draw current node on top
    const current = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    if (current) drawLevelNode(current);

    drawPlayer();

    // World name labels last, so they're never hidden behind nodes/paths.
    drawWorldLabels();
  }

  // ═══════════════════════════════════════════════
  //  UPDATE & ANIMATION
  // ═══════════════════════════════════════════════

  let animationFrame;

  function update() {
    // Honor the shared FPS limiter/counter (settings.js). Without this the map
    // ran at full refresh rate doing a heavy full redraw every frame, ignoring
    // the user's FPS-limit setting and never updating the FPS counter here.
    if (typeof window._fpsShouldSkip === 'function' && window._fpsShouldSkip()) {
      animationFrame = requestAnimationFrame(update);
      return;
    }
    if (typeof window._fpsTick === 'function') window._fpsTick();

    MAP_STATE.time += 0.016;
    stepWalk();
    render();
    updateDOM();
    animationFrame = requestAnimationFrame(update);
  }

  // Advance the walking animation: move the robot along the road polyline.
  function stepWalk() {
    const wk = MAP_STATE.walk;
    if (!wk) return;
    wk.t++;
    const u = Math.min(wk.t / wk.dur, 1);
    // Ease in/out for a natural start & stop.
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    let dist = e * wk.total, i = 0;
    while (i < wk.seg.length && dist > wk.seg[i]) { dist -= wk.seg[i]; i++; }
    if (i >= wk.seg.length) {
      const last = wk.poly[wk.poly.length - 1];
      MAP_STATE.playerX = last.x; MAP_STATE.playerY = last.y;
    } else {
      const a = wk.poly[i], b = wk.poly[i + 1];
      const f = wk.seg[i] ? dist / wk.seg[i] : 0;
      MAP_STATE.playerX = a.x + (b.x - a.x) * f;
      MAP_STATE.playerY = a.y + (b.y - a.y) * f;
      if (Math.abs(b.x - a.x) > 0.5) MAP_STATE.faceDir = (b.x - a.x) >= 0 ? 1 : -1;
    }
    MAP_STATE.walkPhase++;
    if (u >= 1) MAP_STATE.walk = null;
  }

  function updateDOM() {
    const current = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    if (!current) return;

    const world = WORLDS[current.worldId];
    const clearedCount = LEVELS.filter(l => l.completed).length;

    document.getElementById('mapClearedCount').textContent = clearedCount;

    // Update star count (total earned across all 100 levels)
    const starsCount = window.totalStars ? window.totalStars(MAP_STATE.hard) : 0;
    document.getElementById('mapStarsCount').textContent = starsCount;

    // Update crystal (data-shard) count — total collected across all 100 levels.
    const shardsEl = document.getElementById('mapShardsCount');
    if (shardsEl) {
      const shardsCount = window.totalShards ? window.totalShards(MAP_STATE.hard) : 0;
      shardsEl.textContent = shardsCount;
    }

    // Total campaign score (sum of every level's best score).
    const totalScoreEl = document.getElementById('mapTotalScore');
    if (totalScoreEl) {
      const ts = window.totalScore ? window.totalScore(MAP_STATE.hard) : 0;
      totalScoreEl.textContent = ts.toLocaleString();
    }

    document.getElementById('mapCurrentZone').textContent = wName(world);
    document.getElementById('mapCurrentZone').style.color = worldAccent(world);

    const zoneTag = document.getElementById('mapZoneTag');
    zoneTag.textContent = wName(world);
    zoneTag.style.color = worldAccent(world);
    zoneTag.style.borderColor = worldAccent(world);

    const panel = document.getElementById('mapLevelPanel');
    panel.style.display = 'block';
    panel.style.borderColor = worldAccent(world);

    const tt = (k, d) => (typeof window.t === 'function' && window.t(k) !== k) ? window.t(k) : d;
    document.getElementById('mapLevelName').textContent = `${tt('level','LEVEL')} ${current.num}${current.type === 'boss' ? ' — ' + tt('mapBoss','BOSS') : ''}`;
    document.getElementById('mapLevelName').style.color = worldAccent(world);
    document.getElementById('mapLevelSub').textContent = wName(world);

    // Per-level best score (when the player has completed it at least once).
    const scoreEl = document.getElementById('mapLevelScore');
    if (scoreEl) {
      const best = window.levelScore ? window.levelScore(current.num, MAP_STATE.hard) : 0;
      const shards = window.levelShards ? window.levelShards(current.num, MAP_STATE.hard) : 0;
      const parts = [];
      if (current.completed && best > 0) parts.push(`★ ${tt('mapBest','BEST')}: ${best.toLocaleString()}`);
      if (current.unlocked) parts.push(`<span style="color:#0ff">◆ ${shards}/3</span>`);
      if (parts.length) {
        scoreEl.innerHTML = parts.join('  ');
        scoreEl.style.display = 'block';
      } else {
        scoreEl.style.display = 'none';
      }
    }

    const action = document.getElementById('mapLevelAction');
    if (!current.unlocked) {
      action.innerHTML = `<span style="color:#444">[ ${tt('mapLocked','LOCKED')} ]</span>`;
    } else if (current.completed) {
      action.innerHTML = `<span style="color:#0f0">[ ${tt('mapCompleted','COMPLETED')} ✓ ]</span>`;
    } else {
      action.innerHTML = `<span style="color:${worldAccent(world)}">[ ${tt('mapStart','ENTER / SPACE TO START')} ]</span>`;
    }
  }

  // ═══════════════════════════════════════════════
  //  NAVIGATION & INPUT
  // ═══════════════════════════════════════════════

  function getNeighbors(levelId) {
    const neighbors = [];
    for (const [fromId, toId] of PATHS) {
      if (fromId === levelId) {
        const level = LEVELS.find(l => l.id === toId);
        if (level && level.unlocked) neighbors.push(level);
      }
      if (toId === levelId) {
        const level = LEVELS.find(l => l.id === fromId);
        if (level && level.unlocked) neighbors.push(level);
      }
    }
    return neighbors;
  }

  // Move to ANY unlocked level. The robot WALKS there along the road (following the
  // node chain) instead of teleporting; the cursor/logic updates immediately.
  function moveToLevel(targetId) {
    const target = LEVELS.find(l => l.id === targetId);
    if (!target || !target.unlocked) return;

    const cur = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    MAP_STATE.currentLevelId = targetId;
    if (window.SFX && window.SFX.menu) window.SFX.menu();

    if (!cur || cur.num === target.num) {
      MAP_STATE.playerX = target.x;
      MAP_STATE.playerY = target.y;
      return;
    }

    // Build a polyline from the current robot position through every node on the
    // way to the target (the levels form a linear chain, so this traces the road).
    const poly = [{ x: MAP_STATE.playerX, y: MAP_STATE.playerY }];
    const step = target.num > cur.num ? 1 : -1;
    for (let n = cur.num; n !== target.num; n += step) {
      const nx = LEVELS.find(l => l.num === n + step);
      if (nx) poly.push({ x: nx.x, y: nx.y });
    }
    const seg = [];
    let total = 0;
    for (let i = 1; i < poly.length; i++) {
      const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
      seg.push(d); total += d;
    }
    const hops = poly.length - 1;
    // Slower, more deliberate stroll: ~1.2s for one hop, capped for long jumps.
    MAP_STATE.walk = { poly, seg, total, t: 0, dur: Math.min(50 + hops * 35, 400) };
  }

  // Move the cursor to the nearest unlocked level in the pressed direction,
  // scanning the whole map (not just directly connected nodes).
  function navigateDirection(dx, dy) {
    const current = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    if (!current) return;

    let best = null;
    let bestScore = -Infinity;

    for (const lv of LEVELS) {
      if (lv.id === current.id || !lv.unlocked) continue;
      const vx = lv.x - current.x, vy = lv.y - current.y;
      const proj = dx * vx + dy * vy;          // travel along the desired axis
      if (proj <= 0) continue;                 // candidate must lie in that direction
      const perp = Math.abs(dx * vy - dy * vx); // sideways deviation
      const dist = Math.hypot(vx, vy) || 1;
      // Favour well-aligned, nearby nodes.
      const score = proj - perp * 1.5 - dist * 0.2;
      if (score > bestScore) { bestScore = score; best = lv; }
    }

    if (best) moveToLevel(best.id);
  }

  function startLevel() {
    const current = LEVELS.find(l => l.id === MAP_STATE.currentLevelId);
    if (!current || !current.unlocked) return;

    // Close map and start the level
    hideWorldMap();

    // Trigger level start in main game (pass mode so Hardcore launches correctly)
    if (window.startAdventureLevel) {
      window.startAdventureLevel(current.num, MAP_STATE.hard);
    }
  }

  // ═══════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════

  function showWorldMap(hard) {
    MAP_STATE.hard = !!hard;
    MAP_STATE.twoPlayer = !!window.bbTwoPlayer;

    if (!mapOverlay) {
      createMapCanvas();
      createMapOverlay();
    }

    // Re-fit the field to the current window + Game Scale setting on every open.
    resizeMapCanvas();

    // Load progress from localStorage (mode-aware)
    loadProgress();
    applyModeChrome();

    mapOverlay.style.display = 'flex';
    // Re-translate the HUD on every open so a language change made elsewhere
    // (e.g. in settings) is reflected when the map is reopened.
    if (typeof window.applyI18nDOM === 'function') window.applyI18nDOM();
    // Re-fit after translation (localised labels change panel sizes) and again a
    // beat later once fonts/layout settle in a mobile WebView.
    fitHud();
    [60, 250, 600].forEach(t => setTimeout(fitHud, t));
    // Cancel any previous map loop before starting a fresh one, so re-opening
    // the map can never leave two update() RAF chains running at once.
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
    update();

    // Setup input handlers
    setupInput();
  }

  // Recolour the static HUD chrome to match the active mode.
  function applyModeChrome() {
    const hard = MAP_STATE.hard;
    const col = hard ? '#f44' : '#0ff';
    const titleEl = mapOverlay && mapOverlay.querySelector('#worldMapTitle');
    const subEl = mapOverlay && mapOverlay.querySelector('#worldMapSub');
    if (titleEl) { titleEl.textContent = hard ? '💀 BYTE BLASTER' : '⚡ BYTE BLASTER'; titleEl.style.color = col; titleEl.style.textShadow = '0 0 10px ' + col; }
    if (subEl) {
      const tt = (k, d) => (typeof window.t === 'function' && window.t(k) !== k) ? window.t(k) : d;
      subEl.textContent = '▸ ' + (hard ? tt('mapHardcoreMap', 'HARDCORE MAP') : tt('mapWorldMap', 'WORLD MAP'));
    }
  }

  function hideWorldMap() {
    if (mapOverlay) {
      mapOverlay.style.display = 'none';
    }
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    cleanupInput();
  }

  function loadProgress() {
    // Reset every node first so switching between Normal/Hardcore never leaks
    // the other mode's completion/unlock state into this view.
    for (const level of LEVELS) {
      level.completed = false;
      level.unlocked = (level.num === 1);
    }
    MAP_STATE.currentLevelId = 'L1';
    MAP_STATE.playerX = LEVELS[0].x;
    MAP_STATE.playerY = LEVELS[0].y;
    MAP_STATE.walk = null; // cancel any in-progress walk animation

    try {
      const saved = localStorage.getItem(MAP_STATE.hard ? 'bbAdvH' : 'bbAdv3');
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.done && Array.isArray(data.done)) {
          // Mark levels as completed
          for (const levelNum of data.done) {
            const level = LEVELS.find(l => l.num === levelNum);
            if (level) {
              level.completed = true;
              level.unlocked = true;
            }
          }

          // Unlock all levels up to max
          if (data.max) {
            for (let i = 1; i <= data.max; i++) {
              const level = LEVELS.find(l => l.num === i);
              if (level) level.unlocked = true;
            }
          }

          // Set current level to highest unlocked
          const maxUnlocked = data.max || 1;
          const currentLevel = LEVELS.find(l => l.num === maxUnlocked);
          if (currentLevel) {
            MAP_STATE.currentLevelId = currentLevel.id;
            MAP_STATE.playerX = currentLevel.x;
            MAP_STATE.playerY = currentLevel.y;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }

  // Input handling
  let keyHandler, clickHandler;

  function setupInput() {
    keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        hideWorldMap();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startLevel();
        return;
      }

      let dx = 0, dy = 0;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = 1;
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dx = -1;
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dy = -1;
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dy = 1;
      else return;

      e.preventDefault();
      navigateDirection(dx, dy);
    };

    clickHandler = (e) => {
      const rect = mapCanvas.getBoundingClientRect();
      // Map the click into LOGICAL (CSS-pixel) space — the same space node x/y
      // live in. Uses mapW/mapH, not the (DPR-scaled) backing store size.
      const scaleX = mapW / rect.width;
      const scaleY = mapH / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      // Find clicked level
      for (const level of LEVELS) {
        const R = nodeR(level);
        const dist = Math.hypot(mx - level.x, my - level.y);
        if (dist < R + 10) {
          if (level.id === MAP_STATE.currentLevelId) {
            startLevel();
          } else {
            moveToLevel(level.id);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', keyHandler);
    mapCanvas.addEventListener('click', clickHandler);
  }

  function cleanupInput() {
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    if (clickHandler) mapCanvas.removeEventListener('click', clickHandler);
  }

  // Refresh progress from localStorage. Optional `hard` switches the active mode
  // so the in-game level-complete hook can target the right save slot.
  function refresh(hard) {
    if (typeof hard === 'boolean') MAP_STATE.hard = hard;
    loadProgress();
  }

  // Immediately mark a level node completed (and unlocked) in the given mode.
  // Used by the game so the final level (100) reliably shows its checkmark.
  function markCompleted(num, hard) {
    if (typeof hard === 'boolean') MAP_STATE.hard = hard;
    const level = LEVELS.find(l => l.num === num);
    if (level) { level.completed = true; level.unlocked = true; }
  }

  // Expose API
  window.WorldMap = {
    show: showWorldMap,
    hide: hideWorldMap,
    refresh: refresh,
    markCompleted: markCompleted,
  };

  console.log('✅ World Map system loaded');

})();
