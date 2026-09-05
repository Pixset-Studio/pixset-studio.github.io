/* ═══════════════════════════════════════════════════════════════════════════
   ПРОИГРЫВАТЕЛЬ МУЗЫКИ ИГРЫ
   ═══════════════════════════════════════════════════════════════════════════
   Треков как файлов НЕ СУЩЕСТВУЕТ — ни здесь, ни в самой игре. Есть только
   партитура (assets/music-data.js): лады, аккордовая последовательность, форма
   и тембры. Музыка собирается из неё нотами прямо в браузере через Web Audio.

   Отсюда и защита, о которой просили. Скачать нечего:
     • ни одного mp3/ogg/wav на сервере нет — в панели «Сеть» пусто;
     • нет ни <audio>, ни blob-ссылки, ни MediaStream — сохранять не из чего;
     • «Сохранить аудио» в контекстном меню не появляется: нет медиаэлемента.

   Честная граница. Партитура — это JavaScript, и она открыта, как и весь код
   игры на этом сайте. Кто угодно может взять её и написать свой синтезатор.
   Но ГОТОВОГО ТРЕКА, который перетаскивают мышкой в папку, не существует —
   именно это и требовалось.

   Синтез повторяет запасной движок игры (см. _mTick в assets/game.js): те же
   виды событий, те же тембры, тот же общий фильтр на всю музыку.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var AC = null, master = null, lp = null, noiseBuf = null;
  var song = null, map = null, step = 0, timer = 0;
  var playing = false, current = null;
  var onTick = null, onEnd = null;

  function ctx() {
    if (AC) return AC;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    master = AC.createGain();
    master.gain.value = 0.8;
    // Общий низкочастотный фильтр на всю музыку, а не на каждую ноту: отдельный
    // узел на ноту съел бы всю экономию, ради которой этот движок и существует.
    lp = AC.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4600; lp.Q.value = 0.5;
    lp.connect(master); master.connect(AC.destination);
    return AC;
  }

  function noise() {
    if (noiseBuf) return noiseBuf;
    var n = AC.sampleRate * 0.4, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b; return b;
  }

  /** Одна нота. Огибающая короткая на атаке и мягкая на спаде — иначе щелчки. */
  function tone(f, w, dur, vol, detune) {
    if (!AC || !f) return;
    var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = w || 'sine';
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, dur));
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(t + Math.max(0.05, dur) + 0.02);
  }

  function kick(vol) {
    var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
  }
  function burst(vol, hp, dur) {
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
    s.buffer = noise();
    f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  var snare = function (v) { burst(v * 0.9, 1200, 0.13); };
  var hat   = function (v) { burst(v * 0.5, 7000, 0.035); };

  function tick() {
    if (!playing || !song) return;
    var sec = song.spb, list = map[step % song.steps];
    if (list) for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var d = sec * (e.len || 1) * 0.9;
      // Пилу и квадрат смягчаем до треугольника — так же, как «обычный» стиль
      // в игре: без этого Web Audio даёт жёсткий восьмибитный призвук.
      var w = (e.w === 'sawtooth' || e.w === 'square') ? 'triangle' : (e.w || 'sine');
      switch (e.k) {
        case 'lead':  tone(e.f, w, d, e.vol, 7); tone(e.f, w, d, e.vol * 0.5, -11); break;
        case 'lead2': tone(e.f, w, d, e.vol, -9); break;
        case 'bass':  tone(e.f, w, d, e.vol, 0); break;
        case 'sub':   tone(e.f, 'sine', d, e.vol, 0); break;
        case 'arp':   tone(e.f, w, sec * (e.len || 1) * 0.7, e.vol, 4); break;
        case 'kick':  kick(e.vol); break;
        case 'snare': snare(e.vol); break;
        case 'hat':   hat(e.vol); break;
      }
    }
    step++;
    if (onTick) onTick(step % song.steps, song.steps);
    // Трек играет один раз и останавливается: это витрина, а не фон.
    if (step >= song.steps) { stop(); if (onEnd) onEnd(current); return; }
    timer = setTimeout(tick, sec * 1000);
  }

  function play(name) {
    if (!ctx()) return false;
    if (AC.state === 'suspended') AC.resume();
    if (!root.BBMusic) return false;
    var s = root.BBMusic.buildSong(name);
    if (!s) return false;
    stop();
    song = s; map = root.BBMusic.byStep(s); step = 0; current = name; playing = true;
    tick();
    return true;
  }
  function stop() {
    playing = false;
    if (timer) { clearTimeout(timer); timer = 0; }
  }
  function volume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); }

  root.BBPlayer = {
    play: play,
    stop: stop,
    volume: volume,
    isPlaying: function () { return playing; },
    current: function () { return current; },
    /** Сколько всего шагов и секунд в треке — для полосы прогресса. */
    length: function (name) {
      if (!root.BBMusic) return null;
      var s = root.BBMusic.buildSong(name);
      return s ? { steps: s.steps, seconds: s.steps * s.spb } : null;
    },
    onTick: function (fn) { onTick = fn; },
    onEnd: function (fn) { onEnd = fn; },
  };
})(window);
