// ── Launch counter ───────────────────────────────────────────────────────────
// Reports ONE "the game was opened" event to the project's relay server, so the
// admin page can show how many people actually play. Deliberately minimal:
//
//   • what is sent: edition (full/demo), platform (web/android/desktop), UI
//     language. Nothing that identifies a person, no progress, no scores.
//   • sent once per session, never repeated.
//   • every failure is swallowed — an offline player or a sleeping server must
//     not affect the game in any way.
//
// Set window.BB_STATS_API before this file loads to point it elsewhere; set it
// to an empty string to disable reporting entirely.
(function () {
  'use strict';
  var API = (typeof window.BB_STATS_API === 'string')
    ? window.BB_STATS_API
    : 'https://byte-blaster-server-production.up.railway.app';
  if (!API) return;

  function platform() {
    // Capacitor exposes itself on the window inside the Android WebView;
    // Electron sets a preload bridge. Everything else is the browser build.
    if (window.Capacitor || /Android/i.test(navigator.userAgent) && window.location.protocol === 'file:') return 'android';
    if (window.electronAPI || window.saveAPI) return 'desktop';
    return 'web';
  }

  function report() {
    try {
      if (sessionStorage.getItem('bbLaunchSent')) return;
      sessionStorage.setItem('bbLaunchSent', '1');
    } catch (e) { /* private mode — send anyway, once per load */ }

    var body = {
      kind: 'game',
      edition: window.BB_EDITION === 'demo' ? 'demo' : 'full',
      platform: platform(),
      lang: (window.gameSettings && window.gameSettings.language) || 'auto',
    };
    try {
      fetch(API + '/api/hit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // Wait for the menu to exist: reporting a launch that crashed on boot would
  // count players who never saw the game.
  if (document.readyState === 'complete') setTimeout(report, 2500);
  else window.addEventListener('load', function () { setTimeout(report, 2500); });
})();
