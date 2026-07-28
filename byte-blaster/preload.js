const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] starting, contextIsolation preload script running');
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded');
});
window.addEventListener('error', (e) => {
  console.error('[preload] window error:', e && e.message, e && e.filename, e && e.lineno);
});

// Expose Steam API to the game
contextBridge.exposeInMainWorld('steamAPI', {
  // Check if Steam is available
  isAvailable: async () => {
    try {
      const result = await ipcRenderer.invoke('steam:getUsername');
      return result.success;
    } catch {
      return false;
    }
  },

  // Unlock achievement
  unlockAchievement: async (achievementId) => {
    return await ipcRenderer.invoke('steam:unlockAchievement', achievementId);
  },

  // Save to Steam Cloud
  saveToCloud: async (filename, data) => {
    return await ipcRenderer.invoke('steam:saveToCloud', filename, data);
  },

  // Load from Steam Cloud
  loadFromCloud: async (filename) => {
    return await ipcRenderer.invoke('steam:loadFromCloud', filename);
  },

  // Get Steam username
  getUsername: async () => {
    return await ipcRenderer.invoke('steam:getUsername');
  },

  // Update stat
  setStat: async (statName, value) => {
    return await ipcRenderer.invoke('steam:setStat', statName, value);
  }
});

// Expose the editable save-file API (human-readable JSON in userData)
contextBridge.exposeInMainWorld('saveAPI', {
  // Synchronous read — used at startup before the game's scripts initialise.
  readSync: () => {
    try { return ipcRenderer.sendSync('save:readSync'); } catch (e) { return null; }
  },
  write: (data) => ipcRenderer.invoke('save:write', data),
  path: () => ipcRenderer.invoke('save:path'),
});

// Expose the localisation folder so the i18n loader can auto-discover languages.
// Returns a list of language codes (file names without ".json") found in the
// "assets/localisation/" folder — so adding a new file is all it takes.
contextBridge.exposeInMainWorld('localeAPI', {
  list: () => ipcRenderer.invoke('locale:list'),
  // Read+parse a locale file via the main process (reliable under file://,
  // where fetch() of local files is blocked by Chromium).
  read: (code) => ipcRenderer.invoke('locale:read', code),
});

// Expose the baked audio (assets/audio/Music/*.mp3, assets/audio/SFX/*.mp3) as
// base64 so the sample player can decode it via the main process — reliable
// under file://, where fetch() of local files is blocked by Chromium.
contextBridge.exposeInMainWorld('audioAPI', {
  read: (rel) => ipcRenderer.invoke('audio:read', rel),
});

// Expose electron info
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  
  // Window resize
  resizeWindow: async (width, height) => {
    return await ipcRenderer.invoke('resize-window', width, height);
  },

  // Window mode: 'windowed' | 'fullscreen' | 'frameless'
  setWindowMode: async (mode) => {
    return await ipcRenderer.invoke('set-window-mode', mode);
  },

  // Quit the app (Exit button).
  quit: () => ipcRenderer.invoke('app:quit'),

  // Open an http(s) link in the player's real browser (the demo build's "get the
  // full version" button). The main process validates the URL — the renderer
  // cannot make this open anything but a web page.
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // Forward a renderer-side error/message into the main process's file log
  // (see main.js's `log()`) so a fatal renderer error ends up in the SAME
  // byte-blaster-log.txt as startup/window events — one file to check, not
  // "open DevTools AND find the log file".
  // Synchronous on purpose: this is used for crash-diagnosis checkpoints, so
  // it must be guaranteed to reach the main process (and get flushed to the
  // log file) BEFORE the very next line of renderer code runs — an async
  // send() could still be in flight if that next line is what crashes.
  log: (msg) => ipcRenderer.sendSync('renderer-log', msg),

  // Tell the main process the menu actually rendered. This is what confirms
  // the current rendering tier works — without it the app assumes the launch
  // failed and drops to a software-rendering fallback next time (see the
  // render-tier logic in main.js).
  bootOk: () => { try { return ipcRenderer.sendSync('boot:ok'); } catch (e) { return false; } },

  // Relaunch the app (apply a startup-only setting like V-Sync immediately).
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  // LAN relay info for the in-game LOCAL lobby: whether the embedded relay is
  // running and this machine's LAN IPs (so the host can share them).
  getLanInfo: () => ipcRenderer.invoke('net:lanInfo'),
});
