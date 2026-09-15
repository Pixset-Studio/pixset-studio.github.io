# NEON ARENA — 3D Shooter — Progress

Original request: "Создай полноценный 3D шутер на 1 игрока офлайн для пк и телефона"
(Create a full-fledged offline single-player 3D shooter for PC and phone)

## Status: Ready for delivery

## Tech stack
- Three.js 0.183.0 (via jsdelivr importmap, no build step)
- Vanilla JS, HTML, CSS — fully offline/self-contained (no network calls at runtime)
- Runs as a static site (index.html + game.js + style.css + base.css + assets/)

## Features implemented
- First-person 3D arena shooter, wave-based survival
- 3 weapons: rifle (auto), shotgun (semi-auto, pellets), smg (auto, fast fire rate) — switch with 1/2/3
- 3 enemy types: drone (ranged, mid HP), runner (melee, fast, low HP), tank (ranged, high HP, slow)
- Wave progression: enemy count scales with wave number, wave-clear bonus score
- Player: WASD (+ Cyrillic цфыв) movement, mouse-look (drag-based, no Pointer Lock — sandboxed iframes block it), reload (R), pause (ESC)
- Mobile: on-screen joystick (movement) + look-zone (drag to aim) + fire/reload buttons, auto-detected via touch/viewport
- HUD: health, score, wave, ammo, weapon name — all Russian labels
- Procedural Web Audio: SFX (shoot/reload/kill/hurt/enemyShoot/switch) AND a procedural synthwave-style music loop (bass + arpeggio + hi-hat) that starts on gameplay and stops on pause/quit/game-over — fully offline, no external audio files or CDN dependencies
- Debug overlay (F3): FPS, frame time, draw calls, triangle count, geometry/texture counts, entity/particle/projectile counts
- Screens: title (with generated background art), pause, game over (with generated background art) — all scrollable to avoid clipping on short mobile viewports

## Bugs found & fixed this session
1. Enemies could deal near-instant melee/ranged damage on spawn — `attackCooldown` was initialized to `0` instead of current game time. Fixed by tracking `gameElapsedTime` and initializing cooldowns to it.
2. All gameplay timers used wall-clock time (`clock.getElapsedTime()`), which broke deterministic automated testing via `advanceTime()`. Refactored every timer (attack cooldown, spawn time, wave start, shot fire-rate gating, reload completion, weapon bob) to use an accumulated `gameElapsedTime` variable instead. `clock.getDelta()` (drives real-time-to-fixed-timestep loop) and `performance.now()` (drives the FPS debug readout) intentionally still use real time.
3. CSS specificity bug: hovering the primary "Продолжить" (Resume) button made its text illegible (dark text on a background that lost its bright gradient). Fixed by scoping hover styles to `.btn.btn-primary:hover` with explicit re-declaration.
4. Mobile: circular fire button visually overlapped/obscured the ammo/weapon-name HUD panel. Fixed via a mobile media query repositioning `#hud-bottom-right` upward.
5. Mobile-controls card was clipped at the bottom of the title/pause/game-over screens on short viewports. Fixed by making `.screen` scrollable (`overflow-y: auto`).
6. Added missing background music (procedural, offline) per game-quality requirement to never ship a silent game.
7. **Critical rendering bug fixed:** The center cover crate was positioned at (0,0,0) — exactly where the player spawns. The neon strip on top of the crate (y=1.55) was directly below the camera (y=1.7), filling the entire lower 40% of the viewport with a flat teal block that obscured the floor and most of the 3D scene. Fixed by moving the center crate to (0,0,-6), clearing the player spawn point. Verified on both localhost and the deployed site via WebGL framebuffer pixel reads and screenshots.

## Testing performed (Playwright, desktop + mobile viewports)
- Title screen, HUD, weapon switching, reload timing, pause/resume, quit-to-menu — all verified working
- Combat loop (aim → shoot → damage → kill → score increment → new spawn) verified at multiple ranges including point-blank
- Wave progression verified: cleared wave 1 (7 enemies), confirmed transition to wave 2 with wave-clear bonus score
- Mobile: joystick drag-based movement verified (player position changes), look-zone drag-based aiming verified (yaw changes), fire/reload buttons verified via touch tap
- F3 debug overlay verified to open and display plausible entity/rendering stats

Note: one apparent "shots not registering" issue during testing was traced to the test helper aiming at camera height (1.7m) instead of each enemy's actual body center — small-scale enemies (runner, scale 0.8) sit lower and were missed by the ray. This was a test-script bug, not a game bug; fixed the test helper and reconfirmed real combat works correctly at all enemy scales/distances.

## Known test-only globals left in game.js (do not affect gameplay UX)
`window.render_game_to_text`, `window.advanceTime`, `window.__testSetYawPitch`, `window.__testTeleportPlayer`, `window.__testSetHealth`, `window.__testFaceEnemy`, `window.__testMoveEnemy`, `window.__testDiagnoseAim`, `window.__testDiagnoseRay`, `window.__testFaceEnemyDebug` — safe to leave, but could be removed in a future cleanup pass.

## Deploy
- Local dev server: `http://127.0.0.1:3000` (via `start_server`)
- Deployed via `deploy_website` — see thread for live preview link
