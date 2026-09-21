/* =============================================================================
   BYTE BLASTER — ГЕЙМПАДЫ (Gamepad API: Xbox, PlayStation, Switch Pro и любые совместимые)

   Что умеет
     • Игра: один геймпад управляет игроком 1. В режиме «на двоих» на одном ПК первый
       подключённый геймпад — игрок 1, второй — игрок 2. Если геймпад один, он ведёт
       игрока 1, а игрок 2 остаётся на клавиатуре, как раньше.
     • Меню: крестовина или левый стик двигают выбор, A — нажать, B — назад, Start —
       пауза. На карте мира: стрелки/A/B, а LB и RB листают миры.
     • Отключили геймпад посреди уровня — игра встаёт на паузу.

   Раскладка по умолчанию (как у Xbox; у PlayStation те же позиции: ✕ = A, ○ = B, □ = X, △ = Y)
       Влево/вправо ........ крестовина или левый стик (не переназначается)
       Прыжок .............. A или Y            ┐
       Выстрел ............. X, B, RT или RB    ├ меняется в Настройки → Управление → Геймпад
       Пауза ............... Start              ┘ (settings.js кладёт номера кнопок в controls.padJump / padShoot / padPause)
       В меню: нажать / назад ... A или Start / B (фиксированно)

   Как это устроено
     Геймпад не притворяется клавиатурой: в игровом процессе он выставляет флаги
     window.Pad.p1 / window.Pad.p2, а game.js читает их наравне с клавишами (так клавиатура и
     геймпад не мешают друг другу и работают одновременно). В меню и на карте нажатия
     превращаются в обычные события клавиатуры (Enter/Escape/стрелки) или в перемещение
     подсветки по кнопкам на экране.
   ============================================================================= */
(function () {
  'use strict';
  if (window.Pad) return;

  var DEAD = 0.45;            // мёртвая зона стика: меньше — считаем, что стик отпущен
  var REPEAT_DELAY = 380;     // мс до автоповтора при удержании направления в меню
  var REPEAT_RATE = 120;      // мс между повторами
  var FOCUS_CLASS = 'padFocus';

  var hasAPI = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  var blank = function () { return { left: false, right: false, jump: false, shoot: false }; };

  var Pad = window.Pad = {
    p1: blank(),              // читает game.js: { left, right, jump, shoot }
    p2: blank(),
    count: 0,                 // сколько геймпадов подключено
    usingPad: false,          // последним ввели с геймпада (тогда рисуем подсветку в меню)
  };

  var order = [];             // индексы подключённых геймпадов в порядке подключения: первый — игрок 1
  var memo = {};              // по индексу геймпада: что было нажато в прошлом кадре
  var focusEl = null;
  var captureCb = null;       // ждём следующую кнопку для привязки в настройках (Pad.capture)

  // ── Раскладка из настроек ───────────────────────────────────────────────────
  // В controls номера кнопок лежат строкой «0,3»: так они проходят через ту же машинерию
  // «черновик → Сохранить / Отмена», что и клавиши. Пустая строка — действие ни на что не
  // назначено; отсутствие значения (старое сохранение) — стандартная раскладка.
  var DEFAULT_BINDS = { jump: [0, 3], shoot: [2, 1, 7, 5], pause: [9] };

  function parseList(v, fallback) {
    if (v === undefined || v === null) return fallback;
    if (v === '') return [];
    return String(v).split(',').map(Number).filter(function (n) { return n >= 0 && n < 32; });
  }

  function binds() {
    var c = (window.gameSettings && window.gameSettings.controls) || {};
    return {
      jump: parseList(c.padJump, DEFAULT_BINDS.jump),
      shoot: parseList(c.padShoot, DEFAULT_BINDS.shoot),
      pause: parseList(c.padPause, DEFAULT_BINDS.pause),
    };
  }

  function anyBtn(gp, list) {
    for (var i = 0; i < list.length; i++) if (btn(gp, list[i])) return true;
    return false;
  }

  // ── Чтение геймпада ─────────────────────────────────────────────────────────
  function btn(gp, i) {
    var b = gp.buttons && gp.buttons[i];
    return !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);
  }

  function readPad(gp) {
    var lx = (gp.axes && gp.axes[0]) || 0;
    var ly = (gp.axes && gp.axes[1]) || 0;
    return {
      left: lx < -DEAD || btn(gp, 14), right: lx > DEAD || btn(gp, 15),
      up: ly < -DEAD || btn(gp, 12), down: ly > DEAD || btn(gp, 13),
      a: btn(gp, 0), b: btn(gp, 1), x: btn(gp, 2), y: btn(gp, 3),
      lb: btn(gp, 4), rb: btn(gp, 5), rt: btn(gp, 7), start: btn(gp, 9),
    };
  }

  function connectedPads() {
    var raw = navigator.getGamepads() || [];
    order = order.filter(function (i) { return raw[i] && raw[i].connected; });
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].connected && order.indexOf(i) < 0) order.push(i);
    }
    return order.map(function (i) { return raw[i]; });
  }

  // ── Что сейчас на экране ────────────────────────────────────────────────────
  function cutsceneActive() {
    try { if (typeof _csActive !== 'undefined' && _csActive) return true; } catch (e) { /* нет game.js */ }
    var ov = document.getElementById('cinOv');
    return !!(ov && ov.style.display === 'block');
  }

  function inGameplay() {
    try {
      return typeof gState !== 'undefined' && typeof navScr !== 'undefined' &&
             gState === 'playing' && navScr === 'game' && !cutsceneActive();
    } catch (e) { return false; }
  }

  function onWorldMap() {
    try { return typeof navScr !== 'undefined' && navScr === 'map'; } catch (e) { return false; }
  }

  // ── События клавиатуры для мест, где игра слушает именно клавиши ────────────
  function sendKey(code, key) {
    var opts = { code: code, key: key, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));   // сразу отпускаем: K[code] не залипнет
  }

  // ── Навигация по кнопкам на экране (главное меню, настройки, пауза, итоги) ──
  var INTERACTIVE = 'button,a[href],select,input:not([type=hidden]),textarea,[tabindex]:not([tabindex="-1"]),[role="button"]';

  function center(r) { return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }

  /** Выбирает соседа в нужную сторону. Промах по перпендикуляру штрафуется сильнее, чем расстояние:
   *  в сетке карточек «вправо» должно вести в тот же ряд, а не на ближайшую кнопку строкой ниже. */
  function pickNext(from, cands, dir) {
    var fc = center(from), best = null, bestScore = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var cc = center(cands[i].rect), dx = cc.x - fc.x, dy = cc.y - fc.y, along, across;
      if (dir === 'right') { along = dx; across = Math.abs(dy); }
      else if (dir === 'left') { along = -dx; across = Math.abs(dy); }
      else if (dir === 'down') { along = dy; across = Math.abs(dx); }
      else { along = -dy; across = Math.abs(dx); }
      if (along < 1) continue;                       // не в ту сторону (или тот же элемент)
      var score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = cands[i]; }
    }
    return best;
  }

  function isVisible(el) {
    if (!el.getClientRects || !el.getClientRects().length) return null;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null;
    var cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || parseFloat(cs.opacity) < 0.05) return null;
    // Закрытый другим окном элемент нам не нужен: смотрим, что лежит в его центре.
    if (document.elementFromPoint) {
      var c = center(r), top = document.elementFromPoint(Math.min(Math.max(c.x, 0), vw - 1), Math.min(Math.max(c.y, 0), vh - 1));
      if (top && !(top === el || el.contains(top) || top.contains(el))) return null;
    }
    return r;
  }

  function isClickable(el) {
    if (el.disabled) return false;
    if (el.closest && el.closest('#touchRoot,.touchCtl,.padIgnore')) return false;
    if (el.matches && el.matches(INTERACTIVE)) return true;
    if (typeof el.onclick === 'function' || el.hasAttribute('onclick')) return true;
    return window.getComputedStyle(el).cursor === 'pointer';
  }

  function collect() {
    var nodes = document.body.querySelectorAll('*'), out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isClickable(el)) continue;
      var r = isVisible(el);
      if (r) out.push({ el: el, rect: r });
    }
    // Оставляем «листья»: если карточка целиком кликабельна и внутри неё есть своя кнопка,
    // выбирать надо кнопку, а не рамку вокруг неё.
    return out.filter(function (c) {
      return !out.some(function (o) { return o !== c && c.el.contains(o.el) && c.el.tagName !== 'SELECT'; });
    });
  }

  function setFocus(el) {
    if (focusEl && focusEl.classList) focusEl.classList.remove(FOCUS_CLASS);
    focusEl = el;
    if (el && el.classList) {
      el.classList.add(FOCUS_CLASS);
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* старые движки */ }
    }
  }

  function clearFocus() { setFocus(null); }

  function currentCandidate(list) {
    if (!focusEl || !focusEl.isConnected) return null;
    for (var i = 0; i < list.length; i++) if (list[i].el === focusEl) return list[i];
    return null;
  }

  function firstCandidate(list) {
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].rect;
      if (!best || r.top < best.rect.top - 4 || (Math.abs(r.top - best.rect.top) <= 4 && r.left < best.rect.left)) best = list[i];
    }
    return best;
  }

  function stepSelect(sel, delta) {
    var n = sel.options.length; if (!n) return;
    var next = (sel.selectedIndex + delta + n) % n;
    if (next === sel.selectedIndex) return;
    sel.selectedIndex = next;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function stepRange(inp, delta) {
    var step = parseFloat(inp.step) || 1, min = parseFloat(inp.min), max = parseFloat(inp.max);
    var v = (parseFloat(inp.value) || 0) + delta * step;
    if (!isNaN(min)) v = Math.max(min, v);
    if (!isNaN(max)) v = Math.min(max, v);
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function domMove(dir) {
    var list = collect();
    if (!list.length) return;
    var cur = currentCandidate(list);
    if (!cur) { var f = firstCandidate(list); if (f) setFocus(f.el); return; }
    // Список и ползунок меняются влево-вправо, а не «уходят» на соседа.
    if ((dir === 'left' || dir === 'right') && cur.el.tagName === 'SELECT') { stepSelect(cur.el, dir === 'right' ? 1 : -1); return; }
    if ((dir === 'left' || dir === 'right') && cur.el.tagName === 'INPUT' && cur.el.type === 'range') { stepRange(cur.el, dir === 'right' ? 1 : -1); return; }
    var next = pickNext(cur.rect, list.filter(function (c) { return c !== cur; }), dir);
    if (next) setFocus(next.el);
  }

  function domActivate() {
    var list = collect();
    var cur = currentCandidate(list);
    if (!cur) { var f = firstCandidate(list); if (f) setFocus(f.el); return; }   // первое нажатие только показывает, где выбор
    var el = cur.el;
    if (el.tagName === 'SELECT') { stepSelect(el, 1); return; }
    if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number' || el.type === 'search' || el.type === 'password')) { el.focus(); return; }
    el.click();
  }

  // ── Подсказки на экране ─────────────────────────────────────────────────────
  function toast(text) {
    if (!document.body) return;
    var d = document.createElement('div');
    d.className = 'padIgnore';
    d.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;' +
      "background:#000c;color:#39ff14;border:1px solid #39ff14;padding:8px 14px;font:10px 'Press Start 2P',monospace;" +
      'pointer-events:none;max-width:90vw;text-align:center';
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2600);
  }

  function shortName(gp) {
    return String(gp.id || 'gamepad').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  }

  function injectStyle() {
    if (document.getElementById('padFocusStyle')) return;
    var s = document.createElement('style'); s.id = 'padFocusStyle';
    s.textContent = '.' + FOCUS_CLASS + '{outline:3px solid #ffd700!important;outline-offset:3px!important;box-shadow:0 0 16px #ffd700!important}';
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Главный цикл ────────────────────────────────────────────────────────────
  function tick(now) {
    var pads = connectedPads();
    Pad.count = pads.length;
    var p1 = blank(), p2 = blank();
    var play = inGameplay();
    var two = false;
    try { two = typeof twoPlayer !== 'undefined' && !!twoPlayer; } catch (e) { /* нет game.js */ }
    var any = false;
    var B = binds();

    for (var n = 0; n < pads.length; n++) {
      var gp = pads[n], s = readPad(gp);
      var st = memo[gp.index] || (memo[gp.index] = { held: {}, next: {}, btn: [] });
      var pressed = function (name, val) {
        var on = val === undefined ? !!s[name] : !!val;
        var was = !!st.held[name]; st.held[name] = on; return on && !was;
      };
      // Любые физические кнопки «по фронту» — для режима привязки в настройках.
      var cur = [], edges = [];
      for (var bi = 0; bi < gp.buttons.length; bi++) { cur[bi] = btn(gp, bi); if (cur[bi] && !st.btn[bi]) edges.push(bi); }
      st.btn = cur;

      // Нажатия «по фронту» считаем всегда, даже в игре: иначе A, зажатая на прыжке, сработает
      // как «нажать» в тот же миг, когда откроется меню.
      var okP = pressed('a'), backP = pressed('b'), startP = pressed('start'), lbP = pressed('lb'), rbP = pressed('rb');
      var pauseP = pressed('pause', anyBtn(gp, B.pause));
      var dirs = {};
      ['left', 'right', 'up', 'down'].forEach(function (d) {
        var was = !!st.held['d_' + d]; st.held['d_' + d] = !!s[d];
        var fire = false;
        if (s[d] && !was) { fire = true; st.next[d] = now + REPEAT_DELAY; }
        else if (s[d] && now >= st.next[d]) { fire = true; st.next[d] = now + REPEAT_RATE; }
        dirs[d] = fire;
      });

      var touched = s.left || s.right || s.up || s.down || s.a || s.b || s.x || s.y || s.lb || s.rb || s.rt || s.start;
      if (touched) any = true;

      // Идёт привязка кнопки: нажатие уходит настройкам, а не меню и не игре. Состояния «было нажато»
      // выше уже обновлены, так что зажатая кнопка не превратится в «нажать» сразу после привязки.
      if (captureCb) {
        if (edges.length) { var done = captureCb; captureCb = null; done(edges[0]); }
        continue;
      }

      if (play) {
        // Игровой процесс. В режиме на двоих второй геймпад — игрок 2; третий и дальше не нужны.
        if (two && n >= 2) continue;
        var t = (two && n === 1) ? p2 : p1;
        t.left = t.left || s.left; t.right = t.right || s.right;
        t.jump = t.jump || anyBtn(gp, B.jump);
        t.shoot = t.shoot || anyBtn(gp, B.shoot);
        if (pauseP) sendKey('Escape', 'Escape');          // пауза — по своей кнопке (по умолчанию Start)
        continue;
      }

      // Меню, карта, катсцены.
      if (!touched) continue;
      var keyboardCtx = onWorldMap() || cutsceneActive();
      if (onWorldMap()) {
        if (dirs.left) sendKey('ArrowLeft', 'ArrowLeft');
        if (dirs.right) sendKey('ArrowRight', 'ArrowRight');
        if (dirs.up) sendKey('ArrowUp', 'ArrowUp');
        if (dirs.down) sendKey('ArrowDown', 'ArrowDown');
        if (lbP) sendKey('KeyQ', 'q');
        if (rbP) sendKey('KeyE', 'e');
      } else if (!cutsceneActive()) {
        ['left', 'right', 'up', 'down'].forEach(function (d) { if (dirs[d]) domMove(d); });
      }
      if (okP || startP) { if (keyboardCtx) sendKey('Enter', 'Enter'); else domActivate(); }
      if (backP) sendKey('Escape', 'Escape');
    }

    Pad.p1 = p1; Pad.p2 = p2;
    if (any) Pad.usingPad = true;
    if (!Pad.usingPad && focusEl) clearFocus();
  }

  function loop(now) {
    try { if (hasAPI) tick(now || (window.performance && performance.now()) || Date.now()); } catch (e) { /* ввод не должен ронять игру */ }
    window.requestAnimationFrame(loop);
  }

  // ── События подключения ─────────────────────────────────────────────────────
  function slotLabel(gp) { var i = order.indexOf(gp.index); return i < 0 ? '?' : 'P' + (i + 1); }

  window.addEventListener('gamepadconnected', function (e) {
    if (!hasAPI || !e.gamepad) return;
    connectedPads();
    toast('🎮 ' + slotLabel(e.gamepad) + ' · ' + shortName(e.gamepad));
  });

  window.addEventListener('gamepaddisconnected', function (e) {
    if (!e.gamepad) return;
    var label = slotLabel(e.gamepad);
    toast('🎮 ✖ ' + label + ' · ' + shortName(e.gamepad));
    delete memo[e.gamepad.index];
    // Геймпад пропал посреди уровня — ставим на паузу, а не оставляем героя без управления.
    if (inGameplay()) sendKey('Escape', 'Escape');
  });

  // Мышь или клавиатура — значит, подсветка выбора с геймпада больше не нужна.
  document.addEventListener('mousemove', function (e) { if (e.isTrusted && Pad.usingPad) { Pad.usingPad = false; clearFocus(); } }, true);
  document.addEventListener('keydown', function (e) { if (e.isTrusted && Pad.usingPad) { Pad.usingPad = false; clearFocus(); } }, true);
  window.addEventListener('blur', function () { Pad.p1 = blank(); Pad.p2 = blank(); memo = {}; });

  /** Привязка кнопки: следующая нажатая кнопка любого геймпада уйдёт в cb(номер). Зажатые
   *  заранее кнопки не считаются — нужно отпустить и нажать. Повторный вызов заменяет ожидание. */
  Pad.capture = function (cb) { captureCb = typeof cb === 'function' ? cb : null; };
  Pad.cancelCapture = function () { captureCb = null; };

  // Для проверок вне браузера.
  Pad._test = { pickNext: pickNext, readPad: readPad, binds: binds };

  if (hasAPI && typeof window.requestAnimationFrame === 'function') {
    injectStyle();
    window.requestAnimationFrame(loop);
  }
})();
