// ===============================================
//  SETTINGS SYSTEM
// ===============================================

(function() {
  'use strict';

  console.log('⚙️ Loading settings system...');

  // ── Non-blocking confirm ──────────────────────────────────────────
  // window.confirm() blocks the whole JS thread until the user clicks — and a
  // blocking dialog on a network HOST freezes the enemy AI for the entire room
  // (the bug this whole change set fixes). This overlay is a drop-in async
  // replacement: it never blocks the event loop, so the game loop / network
  // snapshots keep running underneath it. `onYes` fires only if the user accepts.
  function nonBlockingConfirm(message, onYes, onNo) {
    const tt = (k, fb) => {
      const v = (typeof window.t === 'function') ? window.t(k) : k;
      return (v && v !== k) ? v : fb;
    };
    // Re-use one overlay node if called repeatedly.
    let ov = document.getElementById('nbConfirmOv');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'nbConfirmOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;'+
      'align-items:center;justify-content:center;background:rgba(0,0,0,.72);'+
      'backdrop-filter:blur(2px);font-family:inherit;';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:420px;width:86%;background:#0d1117;'+
      'border:2px solid #2dd4bf;border-radius:12px;padding:24px 22px;'+
      'box-shadow:0 0 24px rgba(45,212,191,.35);color:#e6edf3;text-align:center;';
    const p = document.createElement('p');
    p.textContent = message;
    p.style.cssText = 'margin:0 0 20px;font-size:16px;line-height:1.5;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const mkBtn = (label, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'flex:1;max-width:160px;padding:10px 14px;border-radius:8px;'+
        'font-size:15px;cursor:pointer;border:2px solid '+(primary?'#2dd4bf':'#444c56')+';'+
        'background:'+(primary?'#0f766e':'transparent')+';color:#e6edf3;transition:all .12s;';
      b.onmouseenter = () => { b.style.transform='scale(1.05)'; b.style.boxShadow='0 0 12px currentColor'; };
      b.onmouseleave = () => { b.style.transform='scale(1)';   b.style.boxShadow='none'; };
      return b;
    };
    const yes = mkBtn(tt('restartNow', 'Restart now'), true);
    const no  = mkBtn(tt('later', 'Later'), false);
    const close = () => { ov.remove(); };
    yes.onclick = () => { close(); if (window.SFX && window.SFX.menu) window.SFX.menu(); if (typeof onYes === 'function') onYes(); };
    no.onclick  = () => { close(); if (window.SFX && window.SFX.menu) window.SFX.menu(); if (typeof onNo  === 'function') onNo();  };
    ov.onclick  = (e) => { if (e.target === ov) no.onclick(); };
    row.appendChild(yes); row.appendChild(no);
    box.appendChild(p); box.appendChild(row);
    ov.appendChild(box);
    document.body.appendChild(ov);
  }
  window.nonBlockingConfirm = nonBlockingConfirm;

  // Default settings
  const defaultSettings = {
    resolution: '1600x900',
    customResolution: '1600x900',
    gameScale: 0,            // 0 = auto-fit to window (preserve aspect ratio)
    showFPS: false,
    fpsLimit: 0,
    vsync: true,             // V-Sync (applied at startup; off = uncapped FPS)
    graphicsQuality: 'auto', // preset name, 'auto' (detect on first run) or 'custom'
    // Individually tunable graphics parameters (multipliers). A preset just
    // pre-fills these; the player can then change any of them (→ 'custom').
    gfx: { glow:1.0, particleMul:1.0, bgDetail:1.0, trails:1.0, bossFx:1.0, decorMul:1.0, renderScale:2.0 },
    windowMode: 'windowed',
    language: 'auto',        // 'auto' = detect from system on first run
    cutscenes: true,         // story dialogue cutscenes on/off
    // Audio settings
    masterVolume: 100,
    musicVolume: 100,
    sfxVolume: 100,
    // Gameplay settings
    screenShake: true,
    shakeIntensity: 100,     // 0-150% multiplier on screen shake strength
    particles: true,
    combatText: true,        // floating damage/pickup text
    autoSave: true,
    showHints: true,         // bottom control-hint bar
    // Control settings (key codes)
    controls: {
      p1Left: 'KeyA',
      p1Right: 'KeyD',
      p1Jump: 'Space',
      p1Shoot: 'KeyZ',
      p2Left: 'ArrowLeft',
      p2Right: 'ArrowRight',
      p2Jump: 'ArrowUp',
      p2Shoot: 'Period'
    }
  };

  // Human-readable label for a KeyboardEvent.code (e.g. 'KeyA' → 'A').
  function keyLabel(code) {
    if (!code) return '—';
    const map = {
      Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Backspace: '⌫',
      ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
      Period: '.', Comma: ',', Slash: '/', Backslash: '\\', Semicolon: ';',
      Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
      ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', ShiftLeft: 'L-SHIFT',
      ShiftRight: 'R-SHIFT', AltLeft: 'L-ALT', AltRight: 'R-ALT',
    };
    if (map[code]) return map[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6);
    return code.toUpperCase();
  }

  // Load settings from localStorage
  function loadSettings() {
    try {
      const saved = localStorage.getItem('bbSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
          const merged = { ...defaultSettings, ...settings };
          // Merge controls separately to ensure all keys exist
          merged.controls = { ...defaultSettings.controls, ...(settings.controls || {}) };
          // Merge gfx the same way so any missing parameter keeps a sane default.
          merged.gfx = { ...defaultSettings.gfx, ...(settings.gfx || {}) };
          // Volume floor: by default volume is never below 1 (avoids stale 0 = muted on load).
          ['masterVolume', 'musicVolume', 'sfxVolume'].forEach(k => {
            const v = parseInt(merged[k], 10);
            merged[k] = (isNaN(v) || v < 1) ? (isNaN(v) ? 100 : 1) : Math.min(v, 100);
          });
          return merged;
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return { ...defaultSettings };
  }

  // Save settings to localStorage
  function saveSettings(settings) {
    try {
      localStorage.setItem('bbSettings', JSON.stringify(settings));
      console.log('✔ Settings saved:', settings);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // Current settings
  window.gameSettings = loadSettings();

  // Apply window mode
  function applyWindowMode(mode) {
    if (window.electronAPI && window.electronAPI.setWindowMode) {
      window.electronAPI.setWindowMode(mode).catch(() => {});
    } else if (mode === 'fullscreen' && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (mode === 'windowed' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  // Автодетект качества графики
  function detectGraphicsQuality() {
    let score = 0;
    const cores = navigator.hardwareConcurrency || 2;
    if (cores >= 16) score += 3; else if (cores >= 8) score += 2; else if (cores >= 4) score += 1;
    const ram = navigator.deviceMemory || 0;
    if (ram >= 16) score += 3; else if (ram >= 8) score += 2; else if (ram >= 4) score += 1;
    try {
      const bc = document.createElement('canvas');
      bc.width = 128; bc.height = 128;
      const bx = bc.getContext('2d');
      if (bx) {
        const t0 = performance.now();
        for (let i = 0; i < 200; i++) {
          const g = bx.createRadialGradient(64,64,0,64,64,64);
          g.addColorStop(0,'#ff0'); g.addColorStop(1,'#00f');
          bx.fillStyle = g; bx.fillRect(0,0,128,128);
        }
        const ms = performance.now() - t0;
        if (ms < 20) score += 3; else if (ms < 50) score += 2; else if (ms < 120) score += 1;
      }
    } catch(e) { score += 1; }
    if (score >= 8) return 'ultra';
    if (score >= 6) return 'high';
    if (score >= 4) return 'medium';
    if (score >= 2) return 'low';
    return 'verylow';
  }

  // Apply the per-parameter graphics settings (gameSettings.gfx) to the engine.
  function applyGfxSettings() {
    const g = (window.gameSettings && window.gameSettings.gfx) ||
              (window.GFX_TIERS && window.GFX_TIERS.high) || {};
    // Particle cap derives from the particle-amount multiplier (high≈160).
    const pm = (g.particleMul != null) ? g.particleMul : 1;
    window.GFX_MAX_PARTICLES = Math.max(20, Math.round(160 * pm));
    if (typeof window.applyGfxValues === 'function') window.applyGfxValues(g);
    else if (typeof window.applyGfxTier === 'function') window.applyGfxTier(window.gameSettings.graphicsQuality || 'high');
    console.log('✔ Graphics applied:', g, '| max particles:', window.GFX_MAX_PARTICLES);
  }
  // Legacy alias (kept so any external caller still works).
  function applyGraphicsQuality() { applyGfxSettings(); }

  // Apply resolution (changes WINDOW size only)
  function applyResolution(resolution) {
    let resString = resolution;
    if (resolution === 'custom') {
      resString = window.gameSettings.customResolution || '1600x900';
    }

    // Validate format strictly to avoid setSize(NaN, NaN) crashing Electron
    if (!/^\d{3,4}x\d{3,4}$/.test(resString)) {
      console.warn('Invalid resolution, falling back to 1600x900:', resString);
      resString = '1600x900';
    }
    let [width, height] = resString.split('x').map(Number);
    width = Math.max(800, Math.min(width, 3840));
    height = Math.max(600, Math.min(height, 2160));

    if (window.electronAPI && window.electronAPI.resizeWindow) {
      // Electron environment - change WINDOW size
      window.electronAPI.resizeWindow(width, height)
        .then(() => {
          console.log('✔ Window resolution applied:', width + 'x' + height);
        })
        .catch(e => {
          console.log('Could not change window size:', e.message);
        });
    }
  }

  // Apply game scale — auto-fit canvas to viewport while preserving 800:420 aspect ratio.
  // The `scale` argument is now a "max scale ceiling" (1.0 = native pixel size, 0 = unlimited).
  // The actual rendered size is computed from window.innerWidth/innerHeight every resize.
  function applyGameScale(scale) {
    const canvas = document.getElementById('c');
    if (!canvas) {
      setTimeout(() => applyGameScale(scale), 100);
      return;
    }

    // Logical (coordinate) resolution is fixed at 800×420. The canvas backing
    // store may be larger (HiDPI) — never read canvas.width here or the fit math
    // would feed the scaled-up backing size back in and compound on each resize.
    const baseW = 800;
    const baseH = 420;

    function fit() {
      // Reserve a bit of vertical space for the HUD bar (#ui) above the canvas.
      const ui = document.getElementById('ui');
      const uiH = (ui && ui.offsetHeight) ? ui.offsetHeight + 12 : 0;
      const availW = Math.max(320, window.innerWidth  - 16);
      const availH = Math.max(240, window.innerHeight - uiH - 16);
      let s = Math.min(availW / baseW, availH / baseH);
      // Ceiling — so users on huge monitors aren't forced to a 4× upscale they didn't ask for.
      const ceiling = (typeof scale === 'number' && scale > 0) ? scale : 99;
      s = Math.min(s, ceiling);
      // Snap to an integer multiple when possible (sharper pixels), else allow fractional.
      const intS = Math.floor(s);
      if (intS >= 1 && (s - intS) < 0.15) s = intS;
      const dispW = Math.floor(baseW * s);
      const dispH = Math.floor(baseH * s);
      canvas.style.width  = dispW + 'px';
      canvas.style.height = dispH + 'px';
      canvas.style.display = 'block';
      canvas.style.margin  = '0 auto';
      canvas.style.maxWidth = '';
      canvas.style.maxHeight = '';
      canvas.style.objectFit = '';
      // The game now renders its backing store at native (HiDPI) resolution, so
      // let the browser sample it smoothly rather than nearest-neighbour — this
      // keeps text crisp instead of blocky/blurry at fractional display scales.
      canvas.style.imageRendering = 'auto';
      // HUD spans the same width as the canvas so the layout looks unified.
      if (ui) { ui.style.width = dispW + 'px'; ui.style.boxSizing = 'border-box'; }
      window._gameScale = s;
      // Resize the backing store to match the displayed size × DPR for crisp output.
      if (typeof window.applyRenderResolution === 'function') window.applyRenderResolution();
    }

    fit();
    if (!window._fitBound) {
      window._fitBound = true;
      let raf = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(fit);
      });
    }
  }
  
  // FPS Counter and Limiter
  let fpsCounter = null;
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fps = 0;
  let lastLimitTime = performance.now();

  function createFPSCounter() {
    if (fpsCounter) return;
    
    fpsCounter = document.createElement('div');
    fpsCounter.id = 'fpsCounter';
    fpsCounter.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #0f0;
      padding: 8px 12px;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      font-weight: bold;
      border: 2px solid #0f0;
      border-radius: 4px;
      z-index: 10000;
      pointer-events: none;
      text-shadow: 0 0 5px #0f0;
    `;
    fpsCounter.textContent = 'FPS: 60';
    document.body.appendChild(fpsCounter);
  }

  function removeFPSCounter() {
    if (fpsCounter) {
      fpsCounter.remove();
      fpsCounter = null;
    }
  }

  function updateFPS() {
    if (!window.gameSettings.showFPS) return;
    
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    
    if (elapsed >= 1000) {
      fps = Math.round((frameCount * 1000) / elapsed);
      if (fpsCounter) {
        const limit = window.gameSettings.fpsLimit || 0;
        const displayText = limit > 0 ? `FPS: ${fps} / ${limit}` : `FPS: ${fps}`;
        fpsCounter.textContent = displayText;
        
        // Color based on FPS
        if (fps >= 55) {
          fpsCounter.style.color = '#0f0';
          fpsCounter.style.borderColor = '#0f0';
        } else if (fps >= 30) {
          fpsCounter.style.color = '#ff0';
          fpsCounter.style.borderColor = '#ff0';
        } else {
          fpsCounter.style.color = '#f00';
          fpsCounter.style.borderColor = '#f00';
        }
      }
      frameCount = 0;
      lastFrameTime = now;
    }
  }

  // FPS Limiter
  function shouldSkipFrame() {
    const limit = window.gameSettings.fpsLimit || 0;
    if (limit <= 0) return false; // No limit
    
    const now = performance.now();
    const targetFrameTime = 1000 / limit;
    const elapsed = now - lastLimitTime;
    
    if (elapsed < targetFrameTime) {
      return true; // Skip this frame
    }
    
    lastLimitTime = now;
    return false;
  }

  // Expose FPS hooks for the game's real loop() (see index.html).
  // The old approach wrapped window.loop, but the game calls the local loop()
  // declaration directly, so the wrapper never ran. These hooks are invoked
  // from inside the single real RAF chain — no parallel chains can form.
  window._fpsShouldSkip = shouldSkipFrame;
  window._fpsTick = updateFPS;

  // Apply settings on load
  function applySettings() {
    const settings = window.gameSettings;
    // First run / 'auto': detect a sensible tier and seed the per-parameter gfx
    // values from that tier's template. After that the player owns the values.
    if (settings.graphicsQuality === 'auto' || !settings.gfx) {
      const tiers = window.GFX_TIERS || {};
      let q = settings.graphicsQuality;
      if (q === 'auto' || q === 'custom' || !tiers[q]) q = detectGraphicsQuality();
      if (settings.graphicsQuality === 'auto') settings.graphicsQuality = q;
      if (!settings.gfx) settings.gfx = Object.assign({}, tiers[q] || tiers.high || {});
      saveSettings(settings);
    }
    // Language: auto-detect from system on first run, then apply.
    if (!settings.language || settings.language === 'auto') {
      let sys = 'en';
      try { sys = (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en'; } catch (e) {}
      settings.language = sys;
      saveSettings(settings);
    }
    if (typeof window.setLanguage === 'function') window.setLanguage(settings.language);
    applyGfxSettings();
    applyWindowMode(settings.windowMode || 'windowed');
    applyResolution(settings.resolution);
    setTimeout(() => applyGameScale(settings.gameScale), 200);
    if (settings.showFPS) { createFPSCounter(); } else { removeFPSCounter(); }
    if (typeof window.applyGameplaySettings === 'function') window.applyGameplaySettings();
  }

  // Create settings overlay
  function createSettingsOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'settingsOv';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(4, 4, 15, 0.95);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      font-family: 'Press Start 2P', monospace;
    `;

    overlay.innerHTML = `
      <div style="max-width: 1200px; width: 92%; max-height: 88vh; background: rgba(10, 10, 32, 0.95); padding: 20px 30px; border: 2px solid #4af; border-radius: 8px; display: flex; flex-direction: column;">
        <h2 data-i18n="settingsTitle" style="color: #0ff; text-align: center; font-size: 22px; margin-bottom: 18px; text-shadow: 0 0 10px #0ff;">SETTINGS</h2>

        <!-- Tab navigation -->
        <div id="settingsTabs" style="display: flex; gap: 8px; justify-content: center; margin-bottom: 18px; flex-wrap: wrap;">
          <button class="setTab active" data-tab="display" data-i18n="tabDisplay" style="padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #0ff; border: 2px solid #0ff; border-radius: 4px; cursor: pointer;">DISPLAY</button>
          <button class="setTab" data-tab="graphics" data-i18n="tabGraphics" style="padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #4af; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">GRAPHICS</button>
          <button class="setTab" data-tab="audio" data-i18n="tabAudio" style="padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #4af; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">AUDIO</button>
          <button class="setTab" data-tab="controls" data-i18n="tabControls" style="padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #4af; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">CONTROLS</button>
          <button class="setTab" data-tab="general" data-i18n="tabGeneral" style="padding: 8px 14px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #4af; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">GENERAL</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding-right: 10px;">

        <!-- DISPLAY TAB -->
        <div class="setPanel" data-panel="display">
          <div style="margin-bottom: 20px;">
            <label data-i18n="windowRes" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Window Resolution:</label>
            <select id="resolutionSelect" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <option value="1280x720">1280 x 720</option>
              <option value="1600x900" data-i18n="resDefault">1600 x 900 (Default)</option>
              <option value="1920x1080" data-i18n="resFullHD">1920 x 1080 (Full HD)</option>
              <option value="2560x1440" data-i18n="res2K">2560 x 1440 (2K)</option>
              <option value="custom" data-i18n="resCustom">Custom</option>
            </select>
            <div id="customResDiv" style="display: none; margin-top: 10px; gap: 10px;">
              <input type="number" id="customWidth" placeholder="Width" min="800" max="3840" style="width: 48%; padding: 8px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px;">
              <span style="color: #4af;">x</span>
              <input type="number" id="customHeight" placeholder="Height" min="600" max="2160" style="width: 48%; padding: 8px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px;">
            </div>
            <div style="margin-top: 5px; color: #888; font-size: 8px;" data-i18n="resNote">* Changes window size</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label data-i18n="gameScale" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Game Scale:</label>
            <select id="scaleSelect" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <option value="0" data-i18n="scaleAuto">Auto-Fit (Recommended)</option>
              <option value="1.0">1.0x (Native 800x420)</option>
              <option value="1.5">1.5x (1200x630)</option>
              <option value="2.0">2.0x (1600x840)</option>
              <option value="2.5">2.5x (2000x1050)</option>
              <option value="3.0">3.0x (2400x1260)</option>
            </select>
            <div style="margin-top: 5px; color: #888; font-size: 8px;" data-i18n="scaleNote">* Auto-Fit fills the window while keeping aspect ratio</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label data-i18n="windowMode" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Window Mode:</label>
            <select id="windowModeSelect" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <option value="windowed" data-i18n="windowed">🪟 Windowed</option>
              <option value="fullscreen" data-i18n="fullscreen">⛶ Fullscreen</option>
              <option value="frameless" data-i18n="borderless">▣ Borderless</option>
            </select>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="showHintsCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
              <span data-i18n="showHints">Show Hint Bar</span>
            </label>
          </div>
        </div>

        <!-- GRAPHICS TAB -->
        <div class="setPanel" data-panel="graphics" style="display:none;">
          <div style="margin-bottom: 14px;">
            <label data-i18n="gfxQuality" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Graphics Quality:</label>
            <select id="graphicsSelect" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <option value="verylow" data-i18n="gfxVeryLow">🔴 Very Low</option>
              <option value="low" data-i18n="gfxLow">🟠 Low</option>
              <option value="medium" data-i18n="gfxMedium">🟡 Medium</option>
              <option value="high" data-i18n="gfxHigh">🟢 High</option>
              <option value="veryhigh" data-i18n="gfxVeryHigh">🔵 Very High</option>
              <option value="ultra" data-i18n="gfxUltra">⚡ Ultra</option>
              <option value="custom" data-i18n="gfxCustom">⚙ Custom</option>
            </select>
            <div style="margin-top:5px;color:#888;font-size:8px;" data-i18n="gfxPresetNote">* A preset only fills the sliders below — tune any of them yourself.</div>
          </div>

          <!-- Individually tunable graphics parameters -->
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxRenderScale" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Render Resolution:</label>
            <input type="range" id="gfxRenderScaleSlider" min="100" max="300" value="200" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxRenderScaleVal">200</span>%</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxGlow" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Glow / Bloom:</label>
            <input type="range" id="gfxGlowSlider" min="0" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxGlowVal">100</span>%</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxParticleAmt" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Particle Amount:</label>
            <input type="range" id="gfxParticleMulSlider" min="0" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxParticleMulVal">100</span>%</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxBgDetail" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Background Detail:</label>
            <input type="range" id="gfxBgDetailSlider" min="20" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxBgDetailVal">100</span>%</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxTrails" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Trails:</label>
            <input type="range" id="gfxTrailsSlider" min="0" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxTrailsVal">100</span>%</div>
          </div>
          <div style="margin-bottom: 12px;">
            <label data-i18n="gfxBoss" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Boss Effects:</label>
            <input type="range" id="gfxBossFxSlider" min="0" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxBossFxVal">100</span>%</div>
          </div>
          <div style="margin-bottom: 16px;">
            <label data-i18n="gfxDecor" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Decorations:</label>
            <input type="range" id="gfxDecorMulSlider" min="20" max="200" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="gfxDecorMulVal">100</span>%</div>
          </div>

          <!-- Effect toggles (moved here from the old Gameplay tab) -->
          <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer; margin-bottom: 14px;">
            <input type="checkbox" id="particlesCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
            <span data-i18n="particles">Particles</span>
          </label>
          <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer; margin-bottom: 14px;">
            <input type="checkbox" id="combatTextCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
            <span data-i18n="combatText">Floating Combat Text</span>
          </label>
          <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer; margin-bottom: 14px;">
            <input type="checkbox" id="screenShakeCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
            <span data-i18n="screenShake">Screen Shake</span>
          </label>
          <div style="margin-bottom: 18px;">
            <label data-i18n="shakeIntensity" style="color: #4af; font-size: 11px; display: block; margin-bottom: 6px;">Shake Intensity:</label>
            <input type="range" id="shakeIntensitySlider" min="0" max="150" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 3px;"><span id="shakeIntensityVal">100</span>%</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label data-i18n="fpsLimit" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">FPS Limit:</label>
            <select id="fpsLimitSelect" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <option value="0" data-i18n="fpsNoLimit">No Limit (Unlimited)</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="120">120 FPS</option>
              <option value="144">144 FPS</option>
              <option value="custom" data-i18n="fpsCustom">Custom...</option>
            </select>
            <div id="fpsCustomDiv" style="display:none; margin-top:10px; align-items:center; gap:8px;">
              <input type="number" id="fpsCustomInput" min="10" max="1000" placeholder="60" style="width: 100%; padding: 8px; font-family: 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px;">
              <span style="color:#4af; font-size:9px;">FPS</span>
            </div>
            <div style="margin-top: 5px; color: #888; font-size: 8px;" data-i18n="fpsNote">* Limits maximum frame rate</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="fpsCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
              <span data-i18n="showFps">Show FPS Counter</span>
            </label>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="vsyncCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
              <span data-i18n="vsync">V-Sync</span>
            </label>
            <div style="margin-top: 5px; color: #888; font-size: 8px;" data-i18n="vsyncNote">* On = smooth, capped at refresh. Off = uncapped FPS (may tear). Restart required.</div>
          </div>
        </div>

        <!-- AUDIO TAB -->
        <div class="setPanel" data-panel="audio" style="display:none;">
          <div style="margin-bottom: 20px;">
            <label data-i18n="masterVolume" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Master Volume:</label>
            <input type="range" id="masterVolumeSlider" min="1" max="100" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 5px;"><span id="masterVolumeVal">100</span>%</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label data-i18n="musicVolume" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Music Volume:</label>
            <input type="range" id="musicVolumeSlider" min="1" max="100" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 5px;"><span id="musicVolumeVal">100</span>%</div>
          </div>

          <div style="margin-bottom: 20px;">
            <label data-i18n="sfxVolume" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">SFX Volume:</label>
            <input type="range" id="sfxVolumeSlider" min="1" max="100" value="100" style="width: 100%; cursor: pointer;">
            <div style="text-align: center; color: #fff; font-size: 10px; margin-top: 5px;"><span id="sfxVolumeVal">100</span>%</div>
          </div>
        </div>

        <!-- CONTROLS TAB -->
        <div class="setPanel" data-panel="controls" style="display:none;">
          <div style="margin-bottom: 24px;">
            <h3 data-i18n="controlsP1" style="color: #0ff; font-size: 12px; margin-bottom: 12px; text-shadow: 0 0 8px #0ff;">🎮 PLAYER 1 / SINGLE PLAYER</h3>
            <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #aaa; line-height: 2.2;">
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlMoveLeft" style="color: #4af;">Move Left:</span>
                <button class="keyBtn" data-key="p1Left" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #0ff; border: 1px solid #0ff; border-radius: 3px; cursor: pointer;">A</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlMoveRight" style="color: #4af;">Move Right:</span>
                <button class="keyBtn" data-key="p1Right" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #0ff; border: 1px solid #0ff; border-radius: 3px; cursor: pointer;">D</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlJump" style="color: #4af;">Jump:</span>
                <button class="keyBtn" data-key="p1Jump" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #0ff; border: 1px solid #0ff; border-radius: 3px; cursor: pointer;">SPACE</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlShoot" style="color: #4af;">Shoot:</span>
                <button class="keyBtn" data-key="p1Shoot" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #0ff; border: 1px solid #0ff; border-radius: 3px; cursor: pointer;">Z</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 24px;">
            <h3 data-i18n="controlsP2" style="color: #f55; font-size: 12px; margin-bottom: 12px; text-shadow: 0 0 8px #f55;">🎮 PLAYER 2 (2-Player Mode)</h3>
            <div style="font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #aaa; line-height: 2.2;">
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlMoveLeft" style="color: #4af;">Move Left:</span>
                <button class="keyBtn" data-key="p2Left" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #f55; border: 1px solid #f55; border-radius: 3px; cursor: pointer;">←</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlMoveRight" style="color: #4af;">Move Right:</span>
                <button class="keyBtn" data-key="p2Right" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #f55; border: 1px solid #f55; border-radius: 3px; cursor: pointer;">→</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlJump" style="color: #4af;">Jump:</span>
                <button class="keyBtn" data-key="p2Jump" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #f55; border: 1px solid #f55; border-radius: 3px; cursor: pointer;">↑</button>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1a1a2a; align-items: center;">
                <span data-i18n="ctrlShoot" style="color: #4af;">Shoot:</span>
                <button class="keyBtn" data-key="p2Shoot" style="min-width: 80px; padding: 4px 8px; font-family: 'Press Start 2P', monospace; font-size: 8px; background: #0a0a20; color: #f55; border: 1px solid #f55; border-radius: 3px; cursor: pointer;">.</button>
              </div>
            </div>
          </div>

          <div style="padding: 12px; background: rgba(0, 255, 255, 0.05); border: 1px solid #0ff4; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #0ff; line-height: 1.8;">
              <div data-i18n="ctrlRebindHint">💡 Click a key, then press the new key to bind it (ESC cancels)</div>
              <div data-i18n="ctrlNote1">💡 In 1-player mode, use either WASD or Arrow Keys</div>
              <div data-i18n="ctrlNote2">💡 Stomp enemies by jumping on them from above</div>
            </div>
          </div>

          <button id="resetControlsBtn" data-i18n="ctrlReset" style="width: 100%; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 9px; background: #0a0a20; color: #f80; border: 2px solid #f80; border-radius: 4px; cursor: pointer;">RESET TO DEFAULT</button>
        </div>

        <!-- GENERAL TAB -->
        <div class="setPanel" data-panel="general" style="display:none;">
          <div style="margin-bottom: 20px;">
            <label data-i18n="lang" style="color: #4af; font-size: 11px; display: block; margin-bottom: 8px;">Language:</label>
            <select id="languageSelect" style="width: 100%; padding: 10px; font-family: 'Twemoji Country Flags', 'Press Start 2P', monospace; font-size: 10px; background: #0a0a20; color: #fff; border: 2px solid #4af; border-radius: 4px; cursor: pointer;">
              <!-- options are populated dynamically from the localisation/ folder -->
            </select>
          </div>
          <div style="margin-bottom: 20px;">
            <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="cutscenesCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
              <span data-i18n="showDialogues">Story Dialogues</span>
            </label>
            <div style="margin-top: 5px; color: #888; font-size: 8px;" data-i18n="showDialoguesNote">* Turn off to skip all story cutscenes</div>
          </div>
          <label style="color: #4af; font-size: 11px; display: flex; align-items: center; cursor: pointer; margin-bottom: 16px;">
            <input type="checkbox" id="autoSaveCheckbox" style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
            <span data-i18n="autoSave">Auto-Save Progress</span>
          </label>
        </div>

        </div><!-- /scrollable area -->

        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid #4af4;">
          <button id="saveSettingsBtn" data-i18n="save" style="padding: 12px 24px; font-family: 'Press Start 2P', monospace; font-size: 11px; background: #0a0a20; color: #0ff; border: 2px solid #0ff; border-radius: 4px; cursor: pointer; transition: all 0.2s;">SAVE</button>
          <button id="cancelSettingsBtn" data-i18n="cancel" style="padding: 12px 24px; font-family: 'Press Start 2P', monospace; font-size: 11px; background: #0a0a20; color: #f44; border: 2px solid #f44; border-radius: 4px; cursor: pointer; transition: all 0.2s;">CANCEL</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Tab switching logic
    overlay.querySelectorAll('.setTab').forEach(tab => {
      tab.onclick = function() {
        const target = this.getAttribute('data-tab');
        overlay.querySelectorAll('.setTab').forEach(t => {
          const isActive = t.getAttribute('data-tab') === target;
          t.classList.toggle('active', isActive);
          t.style.color = isActive ? '#0ff' : '#4af';
          t.style.borderColor = isActive ? '#0ff' : '#4af';
        });
        overlay.querySelectorAll('.setPanel').forEach(p => {
          p.style.display = (p.getAttribute('data-panel') === target) ? 'block' : 'none';
        });
        if (window.SFX && window.SFX.menu) window.SFX.menu();
      };
    });

    // Load current settings into form
    const resSelect = document.getElementById('resolutionSelect');
    const scaleSelect = document.getElementById('scaleSelect');
    const fpsCheck = document.getElementById('fpsCheckbox');
    const fpsLimitSelect = document.getElementById('fpsLimitSelect');
    const customResDiv = document.getElementById('customResDiv');
    const customWidth = document.getElementById('customWidth');
    const customHeight = document.getElementById('customHeight');

    resSelect.value = window.gameSettings.resolution;
    scaleSelect.value = window.gameSettings.gameScale.toString();
    fpsCheck.checked = window.gameSettings.showFPS;
    const vsyncCheck = document.getElementById('vsyncCheckbox');
    if (vsyncCheck) vsyncCheck.checked = window.gameSettings.vsync !== false;
    // FPS limit: if the saved value isn't one of the presets, treat it as Custom.
    const fpsCustomDiv = document.getElementById('fpsCustomDiv');
    const fpsCustomInput = document.getElementById('fpsCustomInput');
    const fpsVal = (window.gameSettings.fpsLimit || 0);
    const fpsPresets = ['0', '30', '60', '120', '144'];
    if (fpsPresets.includes(String(fpsVal))) {
      fpsLimitSelect.value = String(fpsVal);
      if (fpsCustomDiv) fpsCustomDiv.style.display = 'none';
    } else {
      fpsLimitSelect.value = 'custom';
      if (fpsCustomInput) fpsCustomInput.value = fpsVal;
      if (fpsCustomDiv) fpsCustomDiv.style.display = 'flex';
    }
    if (fpsLimitSelect) fpsLimitSelect.onchange = function () {
      if (fpsCustomDiv) fpsCustomDiv.style.display = (this.value === 'custom') ? 'flex' : 'none';
    };
    const graphicsSelect = document.getElementById('graphicsSelect');
    const windowModeSelect = document.getElementById('windowModeSelect');

    // ── Per-parameter graphics sliders ──────────────────────────────────────
    // Each row maps a gfx key to its slider; UI value is a percentage that maps
    // to the multiplier (value/100). renderScale uses 100–300% → 1.0–3.0×.
    const GFX_ROWS = [
      { key:'renderScale', slider:'gfxRenderScaleSlider', val:'gfxRenderScaleVal' },
      { key:'glow',        slider:'gfxGlowSlider',        val:'gfxGlowVal' },
      { key:'particleMul', slider:'gfxParticleMulSlider', val:'gfxParticleMulVal' },
      { key:'bgDetail',    slider:'gfxBgDetailSlider',    val:'gfxBgDetailVal' },
      { key:'trails',      slider:'gfxTrailsSlider',      val:'gfxTrailsVal' },
      { key:'bossFx',      slider:'gfxBossFxSlider',      val:'gfxBossFxVal' },
      { key:'decorMul',    slider:'gfxDecorMulSlider',    val:'gfxDecorMulVal' },
    ];
    const gfxNow = Object.assign({}, (window.GFX_TIERS && window.GFX_TIERS.high) || {}, window.gameSettings.gfx || {});
    function gfxFillSlidersFrom(obj) {
      GFX_ROWS.forEach(r => {
        const sl = document.getElementById(r.slider), vl = document.getElementById(r.val);
        if (!sl) return;
        const pct = Math.round(((obj[r.key] != null ? obj[r.key] : 1)) * 100);
        sl.value = pct; if (vl) vl.textContent = pct;
      });
    }
    gfxFillSlidersFrom(gfxNow);
    GFX_ROWS.forEach(r => {
      const sl = document.getElementById(r.slider), vl = document.getElementById(r.val);
      if (!sl) return;
      sl.oninput = function () {
        if (vl) vl.textContent = this.value;
        // Hand-tuning any slider switches the preset selector to "Custom".
        if (graphicsSelect) graphicsSelect.value = 'custom';
      };
    });
    if (graphicsSelect) {
      const gq = window.gameSettings.graphicsQuality;
      graphicsSelect.value = (gq && (gq === 'custom' || (window.GFX_TIERS && window.GFX_TIERS[gq]))) ? gq : 'custom';
      // Selecting a preset just pre-fills the sliders (templates).
      graphicsSelect.onchange = function () {
        const tiers = window.GFX_TIERS || {};
        if (this.value !== 'custom' && tiers[this.value]) gfxFillSlidersFrom(tiers[this.value]);
      };
    }
    if (windowModeSelect) windowModeSelect.value = window.gameSettings.windowMode || 'windowed';

    // Audio sliders
    const masterVolumeSlider = document.getElementById('masterVolumeSlider');
    const masterVolumeVal = document.getElementById('masterVolumeVal');
    const musicVolumeSlider = document.getElementById('musicVolumeSlider');
    const musicVolumeVal = document.getElementById('musicVolumeVal');
    const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
    const sfxVolumeVal = document.getElementById('sfxVolumeVal');
    if (masterVolumeSlider) {
      masterVolumeSlider.value = window.gameSettings.masterVolume || 100;
      masterVolumeVal.textContent = masterVolumeSlider.value;
      masterVolumeSlider.oninput = function() { masterVolumeVal.textContent = this.value; };
    }
    if (musicVolumeSlider) {
      musicVolumeSlider.value = window.gameSettings.musicVolume || 100;
      musicVolumeVal.textContent = musicVolumeSlider.value;
      musicVolumeSlider.oninput = function() { musicVolumeVal.textContent = this.value; };
    }
    if (sfxVolumeSlider) {
      sfxVolumeSlider.value = window.gameSettings.sfxVolume || 100;
      sfxVolumeVal.textContent = sfxVolumeSlider.value;
      sfxVolumeSlider.oninput = function() { sfxVolumeVal.textContent = this.value; };
    }

    // Gameplay checkboxes
    const screenShakeCheck = document.getElementById('screenShakeCheckbox');
    const particlesCheck = document.getElementById('particlesCheckbox');
    const autoSaveCheck = document.getElementById('autoSaveCheckbox');
    const combatTextCheck = document.getElementById('combatTextCheckbox');
    const showHintsCheck = document.getElementById('showHintsCheckbox');
    const cutscenesCheck = document.getElementById('cutscenesCheckbox');
    if (screenShakeCheck) screenShakeCheck.checked = window.gameSettings.screenShake !== false;
    if (particlesCheck) particlesCheck.checked = window.gameSettings.particles !== false;
    if (autoSaveCheck) autoSaveCheck.checked = window.gameSettings.autoSave !== false;
    if (combatTextCheck) combatTextCheck.checked = window.gameSettings.combatText !== false;
    if (showHintsCheck) showHintsCheck.checked = window.gameSettings.showHints !== false;
    if (cutscenesCheck) cutscenesCheck.checked = window.gameSettings.cutscenes !== false;

    // Shake intensity slider
    const shakeIntensitySlider = document.getElementById('shakeIntensitySlider');
    const shakeIntensityVal = document.getElementById('shakeIntensityVal');
    if (shakeIntensitySlider) {
      const si = (typeof window.gameSettings.shakeIntensity === 'number') ? window.gameSettings.shakeIntensity : 100;
      shakeIntensitySlider.value = si;
      shakeIntensityVal.textContent = si;
      shakeIntensitySlider.oninput = function() { shakeIntensityVal.textContent = this.value; };
    }

    // ── Controls: key rebinding ───────────────────────────────────────────
    // Edits go to a pending copy; they are only committed to gameSettings on Save
    // (so Cancel discards them). `_syncControlsForm` resets the pending copy each
    // time the panel opens.
    let pendingControls = { ...defaultSettings.controls, ...(window.gameSettings.controls || {}) };
    let listeningBtn = null;
    let activeOnKey = null; // the pending capture-phase keydown listener, if any
    const keyButtons = overlay.querySelectorAll('.keyBtn');

    function refreshKeyLabels() {
      keyButtons.forEach(btn => {
        if (btn === listeningBtn) return;
        btn.textContent = keyLabel(pendingControls[btn.getAttribute('data-key')]);
      });
    }
    function stopListening() {
      if (activeOnKey) { document.removeEventListener('keydown', activeOnKey, true); activeOnKey = null; }
      if (listeningBtn) listeningBtn.style.boxShadow = 'none';
      listeningBtn = null;
      refreshKeyLabels();
    }

    keyButtons.forEach(btn => {
      btn.onclick = function (e) {
        e.stopPropagation();
        if (listeningBtn === btn) { stopListening(); return; } // click again to cancel
        stopListening();
        listeningBtn = btn;
        btn.textContent = '? ? ?';
        btn.style.boxShadow = '0 0 12px currentColor';
        if (window.SFX && window.SFX.menu) window.SFX.menu();

        // Capture the next key BEFORE the game's global keydown handler sees it.
        const onKey = function (ev) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          document.removeEventListener('keydown', onKey, true);
          activeOnKey = null;
          if (ev.code === 'Escape') { stopListening(); return; } // cancel rebind
          const action = btn.getAttribute('data-key');
          // A physical key can only drive one action — clear any existing clash.
          Object.keys(pendingControls).forEach(k => {
            if (pendingControls[k] === ev.code) pendingControls[k] = '';
          });
          pendingControls[action] = ev.code;
          listeningBtn = null;
          btn.style.boxShadow = 'none';
          refreshKeyLabels();
          if (window.SFX && window.SFX.menu) window.SFX.menu();
        };
        activeOnKey = onKey;
        document.addEventListener('keydown', onKey, true);
      };
    });

    const resetControlsBtn = document.getElementById('resetControlsBtn');
    if (resetControlsBtn) {
      resetControlsBtn.onclick = function () {
        stopListening();
        pendingControls = { ...defaultSettings.controls };
        refreshKeyLabels();
        if (window.SFX && window.SFX.menu) window.SFX.menu();
      };
    }

    // Expose helpers the rest of settings.js needs (save commit + open reset).
    window._commitControls = function () { window.gameSettings.controls = { ...pendingControls }; };
    window._syncControlsForm = function () {
      stopListening();
      pendingControls = { ...defaultSettings.controls, ...(window.gameSettings.controls || {}) };
      refreshKeyLabels();
    };
    refreshKeyLabels();

    // Language select + live switching. Options are built from whatever locale
    // files exist (localisation/ folder) so adding a language needs no UI edit.
    function populateLanguages() {
      const sel = document.getElementById('languageSelect');
      if (!sel) return;
      let langs = [];
      if (typeof window.getAvailableLanguages === 'function') langs = window.getAvailableLanguages();
      if (!langs.length) langs = [{ code: 'en', name: 'English' }, { code: 'ru', name: 'Русский' }];
      const current = (typeof window.i18nLang === 'function') ? window.i18nLang() : (window.gameSettings.language || 'en');
      sel.innerHTML = '';
      langs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.code;
        const flag = (typeof window.langFlag === 'function') ? window.langFlag(l.code) : '';
        opt.textContent = (flag ? flag + '  ' : '') + l.name;
        sel.appendChild(opt);
      });
      sel.value = langs.some(l => l.code === current) ? current : (langs[0] && langs[0].code) || 'en';
    }
    // Let the i18n loader refresh the picker once locales finish loading.
    window.refreshLanguagePicker = populateLanguages;
    populateLanguages();
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
      languageSelect.onchange = function () {
        if (typeof window.setLanguage === 'function') window.setLanguage(this.value);
        // Re-translate the open settings panel immediately
        if (typeof window.applyI18nDOM === 'function') window.applyI18nDOM();
      };
    }
    // Translate the freshly-built settings panel
    if (typeof window.applyI18nDOM === 'function') window.applyI18nDOM();

    // Show custom resolution inputs if custom is selected
    resSelect.onchange = function() {
      if (this.value === 'custom') {
        customResDiv.style.display = 'flex';
        const [w, h] = window.gameSettings.customResolution.split('x');
        customWidth.value = w;
        customHeight.value = h;
      } else {
        customResDiv.style.display = 'none';
      }
    };
    
    // Trigger initial check
    if (resSelect.value === 'custom') {
      customResDiv.style.display = 'flex';
      const [w, h] = window.gameSettings.customResolution.split('x');
      customWidth.value = w;
      customHeight.value = h;
    }

    // Save button
    document.getElementById('saveSettingsBtn').onclick = function() {
      // Get resolution
      if (resSelect.value === 'custom') {
        let w = parseInt(customWidth.value) || 1600;
        let h = parseInt(customHeight.value) || 900;
        
        // Validate custom resolution
        if (w < 800) w = 800;
        if (w > 3840) w = 3840;
        if (h < 600) h = 600;
        if (h > 2160) h = 2160;
        
        window.gameSettings.resolution = 'custom';
        window.gameSettings.customResolution = w + 'x' + h;
      } else {
        window.gameSettings.resolution = resSelect.value;
      }
      
      window.gameSettings.gameScale = parseFloat(scaleSelect.value);
      window.gameSettings.showFPS = fpsCheck.checked;
      // FPS limit: a preset, or a clamped custom value (10–1000) when "Custom" chosen.
      if (fpsLimitSelect.value === 'custom') {
        let cf = parseInt(fpsCustomInput && fpsCustomInput.value, 10);
        if (isNaN(cf) || cf <= 0) cf = 0;
        else cf = Math.max(10, Math.min(cf, 1000));
        window.gameSettings.fpsLimit = cf;
      } else {
        window.gameSettings.fpsLimit = parseInt(fpsLimitSelect.value, 10) || 0;
      }
      
      const gfxSel = document.getElementById('graphicsSelect');
      if (gfxSel) { window.gameSettings.graphicsQuality = gfxSel.value; }
      // Read the per-parameter graphics sliders into gameSettings.gfx.
      (function () {
        const rows = [
          ['renderScale','gfxRenderScaleSlider'], ['glow','gfxGlowSlider'],
          ['particleMul','gfxParticleMulSlider'], ['bgDetail','gfxBgDetailSlider'],
          ['trails','gfxTrailsSlider'], ['bossFx','gfxBossFxSlider'], ['decorMul','gfxDecorMulSlider'],
        ];
        const g = Object.assign({}, window.gameSettings.gfx || {});
        rows.forEach(function (r) {
          const sl = document.getElementById(r[1]);
          if (sl) g[r[0]] = (parseInt(sl.value, 10) || 0) / 100;
        });
        window.gameSettings.gfx = g;
      })();
      // V-Sync (startup-only switch). Remember if it changed so we can offer a restart.
      const prevVsync = window.gameSettings.vsync !== false;
      if (vsyncCheck) window.gameSettings.vsync = vsyncCheck.checked;
      const vsyncChanged = (window.gameSettings.vsync !== false) !== prevVsync;
      const wmSel = document.getElementById('windowModeSelect');
      if (wmSel) { window.gameSettings.windowMode = wmSel.value; }
      const langSel = document.getElementById('languageSelect');
      if (langSel) { window.gameSettings.language = langSel.value; }

      // Audio settings
      if (masterVolumeSlider) window.gameSettings.masterVolume = parseInt(masterVolumeSlider.value);
      if (musicVolumeSlider) window.gameSettings.musicVolume = parseInt(musicVolumeSlider.value);
      if (sfxVolumeSlider) window.gameSettings.sfxVolume = parseInt(sfxVolumeSlider.value);

      // Gameplay settings
      if (screenShakeCheck) window.gameSettings.screenShake = screenShakeCheck.checked;
      if (particlesCheck) window.gameSettings.particles = particlesCheck.checked;
      if (autoSaveCheck) window.gameSettings.autoSave = autoSaveCheck.checked;
      if (combatTextCheck) window.gameSettings.combatText = combatTextCheck.checked;
      if (showHintsCheck) window.gameSettings.showHints = showHintsCheck.checked;
      if (cutscenesCheck) window.gameSettings.cutscenes = cutscenesCheck.checked;
      if (shakeIntensitySlider) window.gameSettings.shakeIntensity = parseInt(shakeIntensitySlider.value);

      // Control bindings
      if (typeof window._commitControls === 'function') window._commitControls();

      saveSettings(window.gameSettings);
      applySettings();

      // Apply audio volumes immediately
      if (typeof window.applyAudioVolumes === 'function') window.applyAudioVolumes();
      // Apply gameplay settings (infinite lives, hint bar, etc.)
      if (typeof window.applyGameplaySettings === 'function') window.applyGameplaySettings();

      overlay.style.display = 'none';

      // Play sound if available
      if (window.SFX && window.SFX.menu) window.SFX.menu();

      // V-Sync only takes effect at startup (command-line switch). Offer a restart.
      if (vsyncChanged && window.electronAPI && typeof window.electronAPI.relaunch === 'function') {
        const msg = (typeof window.t === 'function' && window.t('vsyncRestart') !== 'vsyncRestart')
          ? window.t('vsyncRestart')
          : 'V-Sync change needs a restart. Restart now?';
        nonBlockingConfirm(msg, function(){ window.electronAPI.relaunch(); });
      }
    };

    // Cancel button
    document.getElementById('cancelSettingsBtn').onclick = function() {
      overlay.style.display = 'none';
      if (window.SFX && window.SFX.menu) window.SFX.menu();
    };

    // Hover effects
    const buttons = overlay.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.onmouseenter = function() {
        this.style.transform = 'scale(1.05)';
        this.style.boxShadow = '0 0 15px currentColor';
      };
      btn.onmouseleave = function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = 'none';
      };
    });
  }

  // Show settings
  window.showSettings = function() {
    const overlay = document.getElementById('settingsOv');
    if (overlay) {
      // Re-sync the control bindings so unsaved edits from a previous open
      // (closed via Cancel) don't linger.
      if (typeof window._syncControlsForm === 'function') window._syncControlsForm();
      if (typeof window.refreshLanguagePicker === 'function') window.refreshLanguagePicker();
      overlay.style.display = 'flex';
    }
  };

  // Add settings button to main menu (idempotent — safe to call repeatedly)
  function addSettingsButton() {
    if (document.getElementById('settingsBtn')) return true;
    const mainOv = document.getElementById('mainOv');
    if (!mainOv) return false;
    const startBtn = mainOv.querySelector('.ovBtn');
    if (!startBtn) return false;
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'settingsBtn';
    settingsBtn.className = 'ovBtn';
    settingsBtn.setAttribute('data-i18n', 'settings');
    settingsBtn.textContent = (typeof window.t === 'function') ? window.t('settings') : '⚙ SETTINGS';
    settingsBtn.style.marginTop = '10px';
    settingsBtn.onclick = function() {
      if (window.SFX && window.SFX.menu) window.SFX.menu();
      window.showSettings();
    };
    startBtn.parentNode.insertBefore(settingsBtn, startBtn.nextSibling);
    console.log('✔ Settings button added to menu');
    return true;
  }

  // Single poll loop until the button is in place (then it self-stops)
  function ensureSettingsButton() {
    if (addSettingsButton()) return;
    const checkMenu = setInterval(() => {
      if (addSettingsButton()) clearInterval(checkMenu);
    }, 100);
    setTimeout(() => clearInterval(checkMenu), 5000);
  }

  // Initialize
  createSettingsOverlay();
  applySettings();

  // Add button when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSettingsButton);
  } else {
    ensureSettingsButton();
  }

  console.log('✅ Settings system loaded');

})();
