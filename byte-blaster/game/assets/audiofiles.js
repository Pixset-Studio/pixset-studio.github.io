// ============================================================================
//  SAMPLE AUDIO LAYER — plays the baked assets/audio/Music + assets/audio/SFX .mp3 files.
// ----------------------------------------------------------------------------
//  The game's original audio is fully procedural: every 16th-note spawns ~10
//  WebAudio nodes via setTimeout. On phones that stutters badly and steals main-
//  thread time from the renderer. Pre-rendered .mp3 loops (tools/gen-audio.js)
//  play through ONE buffer source — near-zero per-frame cost — so the music is
//  smooth and the game runs lighter. Falls back to the procedural engine if the
//  files are missing or fail to decode.
//
//  Files are loaded as base64 over the Electron IPC bridge (window.audioAPI) when
//  running under file://, or via fetch() on the web / Capacitor (https) build.
// ============================================================================
(function () {
  'use strict';

  // Список берём из assets/music-data.js — того же файла, из которого генератор
  // печёт mp3. Раньше он был вписан руками и при добавлении трека его забывали.
  const MUSIC = (window.BBMusic && Object.keys(window.BBMusic.TRACKS)) || [];
  // Список берём из assets/sfx-data.js, чтобы добавленный звук не приходилось
  // дописывать ещё и сюда — раньше рассинхрон приводил к молчащим эффектам.
  const SFX = (window.BBSfx && window.BBSfx.names) || [];

  let AC = null, sfxBus = null, musicBus = null;
  const sfxBuf = {}, musicBuf = {}, loopPt = {};
  let curSrc = null, curName = null, initStarted = false;

  // Read a file's bytes: IPC base64 under file://, else fetch (web / Capacitor).
  async function readBytes(rel) {
    if (window.audioAPI && typeof window.audioAPI.read === 'function') {
      const b64 = await window.audioAPI.read(rel);
      if (!b64) throw new Error('audioAPI returned null for ' + rel);
      const bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
    const res = await fetch(rel);
    if (!res.ok) throw new Error('fetch failed ' + rel);
    return await res.arrayBuffer();
  }

  // decodeAudioData returns a promise in modern engines; wrap the callback form too.
  function decode(arrayBuf) {
    return new Promise((resolve, reject) => {
      const p = AC.decodeAudioData(arrayBuf, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  // Find the non-silent span of a decoded buffer so looping skips the MP3 codec's
  // leading/trailing padding silence — giving a clean, near-seamless loop.
  function findLoop(buf) {
    const ch = buf.getChannelData(0), n = ch.length, thr = 0.004;
    let s = 0, e = n - 1;
    while (s < n && Math.abs(ch[s]) < thr) s++;
    while (e > s && Math.abs(ch[e]) < thr) e--;
    if (s >= e) { s = 0; e = n - 1; }
    return [s / buf.sampleRate, (e + 1) / buf.sampleRate];
  }

  /* ── Где лежит музыка ──────────────────────────────────────────────────
     Обычный стиль лежит в самой сборке. Восьмибитный — нет: он весит столько
     же, а нужен не каждому, и класть его в каждый .apk значит удваивать музыку ради
     тех, кто её не включит. Он скачивается с сайта при выборе стиля и остаётся
     в кэше устройства.

     Пока пачка не скачалась (нет сети, первый запуск), игра играет чиптюн
     живым синтезом. Это не заглушка: чиптюн — родной звук этого движка, так
     что «8 бит» работает сразу и без интернета, просто чуть тяжелее для
     телефона, пока файлы не приедут. */
  // Адрес набора можно переопределить через window.BB_CHIP_BASE — пригодится,
  // если музыка переедет на другой хост.
  const CHIP_DEFAULT = 'https://pixset-studio.github.io/byte-blaster/audio/chip/';
  const chipBase = () => window.BB_CHIP_BASE || CHIP_DEFAULT;

  function musicStyle() {
    const s = window.gameSettings && window.gameSettings.musicStyle;
    return s === 'chip' ? 'chip' : 'modern';
  }
  const musicPath = (name) => 'assets/audio/Music/modern/' + name + '.mp3';

  /* Кэш скачанного. В Electron страница живёт на file://, где Cache Storage
     недоступен, поэтому там файлы кладёт на диск главный процесс. */
  const chipStore = {
    async get(name) {
      if (window.audioAPI && window.audioAPI.cacheGet) {
        const b64 = await window.audioAPI.cacheGet('chip/' + name + '.mp3');
        if (!b64) return null;
        const bin = atob(b64), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a.buffer;
      }
      if (!self.caches) return null;
      const c = await caches.open('bb-chip-v1');
      const r = await c.match(chipBase() + name + '.mp3');
      return r ? await r.arrayBuffer() : null;
    },
    async put(name, ab) {
      try {
        if (window.audioAPI && window.audioAPI.cachePut) {
          let s = '';
          const a = new Uint8Array(ab);
          for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
          await window.audioAPI.cachePut('chip/' + name + '.mp3', btoa(s));
          return;
        }
        if (!self.caches) return;
        const c = await caches.open('bb-chip-v1');
        await c.put(chipBase() + name + '.mp3', new Response(ab));
      } catch (e) { /* нет места или запрещено — переживём, скачаем снова */ }
    },
  };

  // Что показывать в настройках: 'ready' | 'loading' | 'offline'
  let chipState = 'ready';
  const notifyStyleState = () => {
    if (typeof window._syncStyleState === 'function') { try { window._syncStyleState(); } catch (e) {} }
  };

  /** Байты восьмибитного трека: из кэша, иначе с сайта. */
  async function chipBytes(name) {
    const cached = await chipStore.get(name).catch(() => null);
    if (cached && cached.byteLength) { chipState = 'ready'; notifyStyleState(); return cached; }
    chipState = 'loading'; notifyStyleState();
    try {
      const res = await fetch(chipBase() + name + '.mp3', { cache: 'no-cache' });
      if (!res.ok) throw new Error('chip ' + res.status);
      const ab = await res.arrayBuffer();
      chipStore.put(name, ab.slice(0));
      chipState = 'ready'; notifyStyleState();
      return ab;
    } catch (e) {
      // Нет сети или набор ещё не опубликован — не беда: чиптюн отыграет живой
      // синтез, он для этого движка родной.
      chipState = 'offline'; notifyStyleState();
      throw e;
    }
  }

  async function loadSfx(name) {
    const ab = await readBytes('assets/audio/SFX/' + name + '.mp3');
    sfxBuf[name] = await decode(ab);
  }

  /* Музыку декодируем по одному треку и держим в памяти только нужное.
     Секунда музыки после декода — это ~190 КБ (48 кГц, Float32), а треков
     четверть часа: разом это под три сотни мегабайт, чего телефон не переживёт.
     Поэтому кэш на два трека: играющий и предыдущий, чтобы возврат в меню не
     упирался в повторный декод. */
  const CACHE_LIMIT = 2;
  const order = [];
  const decoding = {};

  function remember(name) {
    const i = order.indexOf(name);
    if (i >= 0) order.splice(i, 1);
    order.push(name);
    while (order.length > CACHE_LIMIT) {
      // Играющий трек выбрасывать нельзя, но и терять из учёта тоже: раньше он
      // просто уходил из очереди и оставался в памяти навсегда. Ищем самый
      // старый из тех, что можно освободить.
      const idx = order.findIndex((n) => n !== curName);
      if (idx < 0) break;
      const drop = order.splice(idx, 1)[0];
      delete musicBuf[drop]; delete loopPt[drop];
    }
  }

  async function loadMusic(name) {
    if (musicBuf[name]) { remember(name); return musicBuf[name]; }
    if (decoding[name]) return decoding[name];
    const key = musicStyle() + '/' + name;
    decoding[name] = (async () => {
      const bytes = key.startsWith('chip/') ? await chipBytes(name) : await readBytes(musicPath(name));
      const buf = await decode(bytes);
      // Стиль могли переключить, пока файл декодировался — тогда результат
      // уже не тот, что нужен.
      if (key !== musicStyle() + '/' + name) return null;
      musicBuf[name] = buf; loopPt[name] = findLoop(buf);
      remember(name);
      return buf;
    })();
    try { return await decoding[name]; } finally { delete decoding[name]; }
  }

  /** Сменили стиль в настройках — весь кэш музыки протух. */
  function reloadStyle() {
    for (const k of Object.keys(musicBuf)) delete musicBuf[k];
    for (const k of Object.keys(loopPt)) delete loopPt[k];
    order.length = 0;
    const again = curName;
    stopMusic();
    if (again && typeof window.onAudioFilesReady === 'function') {
      try { window.onAudioFilesReady(); } catch (e) {}
    }
  }

  // Звуки декодируем сразу: их сорок с лишним, но все короткие — вместе это
  // единицы мегабайт, и задержка на первом ударе была бы слышна.
  async function init(ac, sBus, mBus) {
    if (initStarted) return;
    initStarted = true;
    AC = ac; sfxBus = sBus; musicBus = mBus;
    const results = await Promise.allSettled(SFX.map(loadSfx));
    const failed = results.filter(r => r.status === 'rejected').length;
    API.sfxReady = SFX.every(n => sfxBuf[n]);
    // Музыка теперь грузится по требованию, поэтому «готовность» значит не
    // «всё декодировано», а «файлы вообще есть».
    API.musicReady = MUSIC.length > 0;
    API.ready = API.musicReady || API.sfxReady;
    if (failed) console.warn('🔊 AudioFiles: ' + failed + ' звук(ов) не загрузились — для них останется синтез.');
    else console.log('✅ AudioFiles: звуки декодированы, музыка грузится по требованию.');
    if (API.musicReady && typeof window.onAudioFilesReady === 'function') {
      try { window.onAudioFilesReady(); } catch (e) {}
    }
  }

  function stopMusic() {
    if (curSrc) { try { curSrc.stop(); } catch (e) {} try { curSrc.disconnect(); } catch (e) {} curSrc = null; }
    curName = null;
  }

  // Loop `name` through the music bus. Returns false if the sample isn't available
  // (caller then uses the procedural engine). If decoding is still in flight the
  // request is remembered and started when ready.
  function playMusic(name) {
    if (!AC) return false;
    const buf = musicBuf[name];
    if (!buf) {
      // Ещё не декодирован: запускаем декод и отвечаем «не могу». Игра включит
      // живой синтез, а когда файл будет готов — onAudioFilesReady пересадит её
      // на него, тем же путём, что и раньше при старте.
      loadMusic(name).then((b) => {
        if (b && typeof window.onAudioFilesReady === 'function') {
          try { window.onAudioFilesReady(); } catch (e) {}
        }
      }).catch(() => {});
      return false;
    }
    if (curName === name && curSrc) return true; // already playing this track
    stopMusic();
    const src = AC.createBufferSource();
    src.buffer = buf;
    const lp = loopPt[name] || [0, buf.duration];
    src.loop = true; src.loopStart = lp[0]; src.loopEnd = lp[1];
    src.connect(musicBus);
    try { src.start(0, lp[0]); } catch (e) { try { src.start(); } catch (e2) { return false; } }
    curSrc = src; curName = name;
    return true;
  }

  function playSfx(name) {
    const buf = sfxBuf[name];
    if (!buf || !AC) return false;
    const src = AC.createBufferSource();
    src.buffer = buf;
    src.connect(sfxBus);
    try { src.start(); } catch (e) { return false; }
    return true;
  }

  const API = {
    ready: false, musicReady: false, sfxReady: false,
    init, playMusic, playSfx, stopMusic, reloadStyle,
    hasMusic: (n) => !!musicBuf[n],
    hasSfx: (n) => !!sfxBuf[n],
    style: musicStyle,
    chipState: () => chipState,
    // Для проверок: сколько треков реально держим в памяти.
    cached: () => Object.keys(musicBuf).length,
  };
  window.AudioFiles = API;
})();
