// ============================================================================
//  SAMPLE AUDIO LAYER — plays the baked Audio/Music + Audio/SFX .mp3 files.
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

  // Names must match tools/gen-audio.js output exactly.
  const MUSIC = ['menu', 'boss', 'star', 'victory',
    'world0', 'world1', 'world2', 'world3', 'world4', 'world5', 'world6', 'world7', 'world8', 'world9'];
  const SFX = ['jump', 'dblJump', 'shoot', 'coin', 'powerup', 'stomp', 'hit', 'enemyDie',
    'playerHurt', 'block', 'clear', 'menu', 'back', 'pause', 'resume', 'flagReach',
    'respawn', 'secret', 'achievement', 'droneBuzz', 'walk'];

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

  async function loadOne(kind, name) {
    const rel = 'Audio/' + (kind === 'music' ? 'Music' : 'SFX') + '/' + name + '.mp3';
    const ab = await readBytes(rel);
    const buf = await decode(ab);
    if (kind === 'music') { musicBuf[name] = buf; loopPt[name] = findLoop(buf); }
    else sfxBuf[name] = buf;
  }

  // Decode everything once, after the AudioContext exists. Music first (it's what
  // the player hears immediately), then SFX. Resolves the `ready` flag per-bucket
  // so SFX can start working even if one music file failed.
  async function init(ac, sBus, mBus) {
    if (initStarted) return;
    initStarted = true;
    AC = ac; sfxBus = sBus; musicBus = mBus;
    const results = await Promise.allSettled([
      ...MUSIC.map(n => loadOne('music', n)),
      ...SFX.map(n => loadOne('sfx', n)),
    ]);
    const failed = results.filter(r => r.status === 'rejected').length;
    API.musicReady = MUSIC.every(n => musicBuf[n]);
    API.sfxReady = SFX.every(n => sfxBuf[n]);
    API.ready = API.musicReady || API.sfxReady;
    if (failed) console.warn('🔊 AudioFiles: ' + failed + ' file(s) failed to load — falling back to synth for those.');
    else console.log('✅ AudioFiles: all samples decoded.');
    // Tell the game to upgrade any currently-playing procedural track to its loop.
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
    if (!buf) return false;
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
    init, playMusic, playSfx, stopMusic,
    hasMusic: (n) => !!musicBuf[n],
    hasSfx: (n) => !!sfxBuf[n],
  };
  window.AudioFiles = API;
})();
