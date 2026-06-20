// ═══════════════════════════════════════════════════════════
//  BYTE BLASTER — NETWORK MODULE
//  Self-contained: no dependencies on game internals except
//  showMain(), hideAll(), mkPlayer(), twoPlayer, and the
//  game-start functions.
// ═══════════════════════════════════════════════════════════
(function(){
'use strict';

const SERVER_URL = 'wss://byte-blaster-server-production.up.railway.app';
const MAX_NET_PLAYERS = 5;

// ── Colour presets (10 popular rainbow hues, fixed s/l for good contrast) ───────────────────
const COLOR_PRESETS = [
  {h:0,  s:90,l:52},  // red (default)
  {h:28, s:95,l:52},  // orange
  {h:50, s:95,l:50},  // yellow
  {h:135,s:78,l:45},  // green
  {h:180,s:85,l:45},  // cyan / teal
  {h:202,s:90,l:52},  // sky blue
  {h:222,s:90,l:56},  // blue
  {h:255,s:80,l:60},  // indigo
  {h:282,s:80,l:58},  // violet / purple
  {h:322,s:85,l:56},  // pink / magenta
];

// ── State ────────────────────────────────────────────────────────────────────
let ws        = null;
let myId      = null;
let myColor   = COLOR_PRESETS[0];
let myNick    = 'PLAYER';
let roomCode  = null;
let isHost    = false;
let isReady   = false;
let players   = [];   // [{id,nickname,color,ready,isHost}]
let roomMaxPlayers = MAX_NET_PLAYERS; // current room cap (from server)

// ── Lobby UI state ────────────────────────────────────────────────
let _uiView      = 'create';  // 'create' | 'find' — which connect sub-view is shown
let _myColorIdx  = 0;         // index into COLOR_PRESETS (persisted)
let _createPublic= true;      // create-room: OPEN(true=public) / CLOSED(false=private)
let _createMax   = MAX_NET_PLAYERS; // create-room: chosen player limit (2–5)

// LAN endpoint for the «LOCAL» source toggle. The Electron app auto-starts an
// embedded relay (see local-server.js) on port 3000, so the HOST reaches it at
// localhost. A LAN peer joining another machine's room types that machine's IP
// into the 'HOST ADDRESS' field; we persist it and connect there instead.
const LAN_PORT = 3000;
// Only the desktop (Electron) build runs the embedded LAN relay. The web build
// has no localhost relay it could reach, so its «LOCAL» source transparently
// uses the cloud relay instead — same-machine/LAN friends still play together by
// room code, just routed through the internet. (electronAPI is exposed by preload.)
const IS_DESKTOP = !!(window.electronAPI && typeof window.electronAPI.getLanInfo === 'function');
let _lanHost = 'localhost';
try { const _lh = localStorage.getItem('bb_net_lanhost'); if(_lh) _lanHost = _lh; } catch(e){}
function lanUrl(){
  if(!IS_DESKTOP) return SERVER_URL;   // web: no localhost relay — fall back to cloud
  const h=(_lanHost||'localhost').trim()||'localhost'; return 'ws://'+h+':'+LAN_PORT;
}
let _connectedUrl = null;     // URL the live socket is using (so we know when to reconnect)
let _lobbyMode = 'server';    // 'lan' | 'server' — source toggle + lobby header style
function activeUrl(){ return _lobbyMode === 'lan' ? lanUrl() : SERVER_URL; }

// Expose to global scope so main game loop can read/call them
Object.defineProperty(window,'netIsHost',{get:()=>isHost});
Object.defineProperty(window,'netWs',    {get:()=>ws});
window.netWsSend = (obj) => wsSend(obj);
let pingStart = 0;
let pingMs    = 0;
let pingTimer = null;

// Selected level for next game
let _netMode  = 'infinite';
let _netLevel = 1;
let _netSeed  = 0;
// Expose so main game loop can update them
Object.defineProperty(window,'_netLevel',{get:()=>_netLevel,set:(v)=>{_netLevel=v;}});
Object.defineProperty(window,'_netMode', {get:()=>_netMode, set:(v)=>{_netMode=v;}});
Object.defineProperty(window,'_netSeed', {get:()=>_netSeed, set:(v)=>{_netSeed=v;}});

// Remote players for in-game rendering
// netPlayers: Map<id, {x,y,vx,vy,facing,action,color,nickname,playerObj}>
window.netPlayers = new Map();
window.netActive  = false;  // true when a network game is running

// ── DOM refs ────────────────────────────────────────────────────────────────
const $lobby       = document.getElementById('netLobby');
const $connect     = document.getElementById('netConnect');
const $room        = document.getElementById('netRoom');
const $connStatus  = document.getElementById('netConnStatus');
const $roomCode    = document.getElementById('netRoomCode');
const $playerList  = document.getElementById('netPlayerList');
const $readyBtn    = document.getElementById('netReadyBtn');
const $startBtn    = document.getElementById('netStartBtn');
const $roomStatus  = document.getElementById('netRoomStatus');
const $chat        = document.getElementById('netChat');
const $chatInput   = document.getElementById('netChatInput');
const $pingEl      = document.getElementById('netPing');
const $gamePing    = document.getElementById('netGamePing');

// Update the in-game ping readout (top-right corner). Visible only during a
// network game; colour-coded by latency like the lobby ping.
function updateGamePing(){
  if(!$gamePing) return;
  if(window.netActive){
    $gamePing.style.display = 'block';
    $gamePing.textContent   = '📶 ' + pingMs + ' ms';
    $gamePing.style.color   = pingMs < 90 ? '#0f8' : (pingMs < 200 ? '#fc0' : '#f55');
  } else {
    $gamePing.style.display = 'none';
  }
}

// ── Saved profile (nickname + colour persist across sessions) ──────────────
function loadProfile(){
  try{
    const n = localStorage.getItem('bb_net_nick');
    if(n) myNick = sanitizeNick(n);
    const ci = parseInt(localStorage.getItem('bb_net_color'), 10);
    if(!isNaN(ci) && ci>=0 && ci<COLOR_PRESETS.length){ _myColorIdx = ci; myColor = COLOR_PRESETS[ci]; }
  }catch(e){ /* localStorage blocked — fall back to defaults */ }
}
function saveProfile(){
  try{
    localStorage.setItem('bb_net_nick', myNick);
    localStorage.setItem('bb_net_color', String(_myColorIdx));
  }catch(e){ /* ignore */ }
}

// ── Colour picker ────────────────────────────────────────────────────────────
function buildColorPicker(){
  const ring = document.getElementById('netColorPicker');
  ring.innerHTML = '';
  COLOR_PRESETS.forEach((col, i) => {
    const sw = document.createElement('div');
    sw.className = 'net-color-swatch' + (i===_myColorIdx?' selected':'');
    sw.style.background = `hsl(${col.h},${col.s}%,${col.l}%)`;
    sw.style.boxShadow  = `0 0 8px hsl(${col.h},${col.s}%,${col.l}%88)`;
    sw.dataset.idx = i;
    sw.onclick = () => {
      ring.querySelectorAll('.net-color-swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      _myColorIdx = i;
      myColor = COLOR_PRESETS[i];
      saveProfile();
      // Apply immediately to local player if in-game
      if(typeof player !== 'undefined' && player) player.colorScheme = myColor;
      // Update my own avatar in the player list
      const myEntry = players.find(p=>p.id===myId);
      if(myEntry){ myEntry.color = myColor; refreshPlayerList(); }
      // Notify others in room
      if(ws && ws.readyState===1 && roomCode){
        wsSend({type:'set_color', color:myColor});
      }
    };
    ring.appendChild(sw);
  });
}

// ── WebSocket ────────────────────────────────────────────────────────────────
let _reconnectTimer = null;
let _reconnectTries = 0;
let _manualClose    = false;  // true when WE close the socket (leave) — don't reconnect

function connect(){
  if(_reconnectTimer){ clearTimeout(_reconnectTimer); _reconnectTimer=null; }
  _manualClose = false;
  if(ws && ws.readyState < 2){ try{ ws.close(); }catch(e){} }
  $connStatus.textContent = T('netConnectingShort');
  $connStatus.classList.remove('net-error');
  let sock;
  const url = activeUrl();
  _connectedUrl = url;
  try{
    sock = ws = new WebSocket(url);
  }catch(e){
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    if(ws !== sock) return; // a newer socket superseded this one
    _reconnectTries = 0;
    $connStatus.textContent = T('netConnected');
    $connStatus.classList.remove('net-error');
    hideConnLost();
    startPing();
  };

  ws.onmessage = (e) => {
    if(ws !== sock) return;
    let msg;
    try{ msg=JSON.parse(e.data); }catch{ return; }
    handleServerMsg(msg);
  };

  ws.onclose = () => {
    if(ws !== sock) return; // stale socket closing — don't touch the live one's UI/state
    stopPing();
    if(_manualClose) return;
    // Mid-game drop: can't silently rejoin a relay room — surface it.
    if(window.netActive){
      showConnLost();
      return;
    }
    // Dropped while sitting in a room lobby: the relay forgets membership on
    // disconnect, so we can't silently rejoin. Bounce back to the connect screen.
    if(roomCode && $room.style.display !== 'none'){
      roomCode = null; isHost = false; isReady = false; players = [];
      $room.style.display = 'none';
      $connect.style.display = 'flex';
    }
    $connStatus.textContent = T('netDisconnected');
    $connStatus.classList.add('net-error');
    if($lobby.style.display==='flex') scheduleReconnect();
  };

  ws.onerror = () => {
    if(ws !== sock) return;
    if(!window.netActive){
      $connStatus.textContent = T('netConnError');
      $connStatus.classList.add('net-error');
    }
  };
}

// Exponential-ish backoff, capped, so a downed server doesn't hammer the network.
function scheduleReconnect(){
  if(_manualClose) return;
  if(_reconnectTimer) return;
  _reconnectTries++;
  const delay = Math.min(1000 * Math.pow(1.6, Math.min(_reconnectTries, 6)), 12000);
  $connStatus.textContent = _reconnectTries > 1 ? T('netConnFailed') : T('netDisconnected');
  _reconnectTimer = setTimeout(()=>{ _reconnectTimer=null; connect(); }, delay);
}

function showConnLost(){
  const ov = document.getElementById('netConnLost');
  if(ov){ ov.style.display='flex'; netApplyLang(); }
}
function hideConnLost(){
  const ov = document.getElementById('netConnLost');
  if(ov) ov.style.display='none';
}

function wsSend(obj){
  if(ws && ws.readyState===1) ws.send(JSON.stringify(obj));
}

// ── Ping ─────────────────────────────────────────────────────────────────────
function startPing(){
  stopPing();
  pingTimer = setInterval(()=>{
    pingStart = Date.now();
    wsSend({type:'ping'});
  }, 3000);
}
function stopPing(){ if(pingTimer){ clearInterval(pingTimer); pingTimer=null; } }

// ── Server message handler ───────────────────────────────────────────────────
function handleServerMsg(msg){
  switch(msg.type){

    case 'rooms_list':
      renderPublicRooms(msg.rooms || []);
      break;

    case 'connected':
      myId = msg.id;
      break;

    case 'pong':
      pingMs = Date.now() - pingStart;
      $pingEl.textContent = pingMs + ' ms';
      // Colour by latency: green < 90ms, yellow < 200ms, red otherwise
      $pingEl.style.color = pingMs < 90 ? '#0f8' : (pingMs < 200 ? '#fc0' : '#f55');
      updateGamePing(); // keep the in-game readout in sync
      break;

    case 'room_created':
    case 'room_joined':
      roomCode = msg.code;
      isHost   = (msg.id===msg.hostId)||(msg.type==='room_created');
      myId     = msg.id;
      players  = msg.players || [];
      roomMaxPlayers = msg.maxPlayers || MAX_NET_PLAYERS;
      enterRoomScreen();
      break;

    case 'player_joined':
      players = msg.players || [];
      refreshPlayerList();
      updateStartBtn();
      addChat('★', T('netPlayerJoined', esc(msg.player.nickname)));
      break;

    case 'player_left':
      {
        const gone = players.find(p=>p.id===msg.id);
        players = msg.players || [];
        refreshPlayerList();
        updateStartBtn();
        if(gone) addChat('★', T('netPlayerLeft', esc(gone.nickname)));
        // Remove from live render map
        window.netPlayers.delete(msg.id);
        // If we're mid-level waiting on finishers, a leaver must not block the
        // room: drop them from the tally and re-check whether everyone left is done.
        if(isHost && window.netActive && _netFinished && _netFinished.size > 0){
          _netFinished.delete(msg.id);
          _hostBroadcastProgress();
        }
      }
      break;

    case 'ready_changed':
      players = msg.players || [];
      refreshPlayerList();
      updateStartBtn();
      break;

    case 'color_changed':
      const cp = players.find(p=>p.id===msg.id);
      if(cp){ cp.color=msg.color; refreshPlayerList(); }
      // Update live render if in-game
      const np = window.netPlayers.get(msg.id);
      if(np && np.playerObj){ np.playerObj.colorScheme=msg.color; }
      break;

    case 'promoted_to_host':
      isHost = true;
      $startBtn.style.display = 'block';
      const $lp2 = document.getElementById('netLevelPicker');
      if($lp2) $lp2.style.display = 'flex';
      setRoomStatus(T('netNowHost'));
      updateStartBtn();
      break;

    // The server reassigned the host (e.g. the previous host's tab froze and the
    // freeze-watchdog handed authority to another player). Everyone gets this so
    // their player list / host marker stays correct. Crucially, if I *was* the
    // host and authority moved away from me, I must drop my host role now —
    // otherwise a recovered (un-frozen) old host would keep driving enemy/boss AI
    // and fight the new host for authority. The new host is told separately via
    // 'promoted_to_host'.
    case 'host_changed':
      if(Array.isArray(msg.players)) players = msg.players;
      if(msg.hostId && msg.hostId !== myId && isHost){
        isHost = false;
        if($startBtn) $startBtn.style.display = 'none';
        const $lp4 = document.getElementById('netLevelPicker');
        if($lp4) $lp4.style.display = 'none';
      }
      {
        const _nh = players.find(p=>p.id===msg.hostId);
        if(_nh) addChat('★', T('netNewHost', esc(_nh.nickname)));
      }
      refreshPlayerList();
      updateStartBtn();
      break;

    case 'level_selected':
      _netMode  = msg.mode  || 'infinite';
      _netLevel = msg.level || 1;
      _netSeed  = msg.seed  || 0;
      // Update level picker UI for host, and status for others
      updateLevelStatus();
      break;

    case 'level_complete':
      _netLevel = msg.nextLevel || _netLevel;
      // The co-op mode is fixed for the whole session (chosen before game_started)
      // and never changes between levels — only the level number advances. We do
      // NOT take msg.mode here: a buggy/old relay could echo the wrong mode (e.g.
      // 'adventure' for an infinite room) and wrongly flip the whole room. Keep our
      // current _netMode so infinite stays infinite. (Server is also fixed.)
      // Everyone reached the flag — clear the "waiting for players" state.
      _resetFinishState();
      // Show countdown and start next level for all clients
      showNetCountdown(_netMode, _netLevel, () => {
        window._netLevelAdvancing = false; // new level — allow it to be completed
        if(typeof hardMode!=='undefined') hardMode=false; // keep co-op deterministic
        if(_netMode === 'adventure'){
          if(typeof startAdv === 'function') startAdv(_netLevel, false);
        } else {
          if(typeof level !== 'undefined') level = _netLevel;
          if(typeof startInf === 'function') startInf(false);
        }
        // Re-apply colours after level reload
        if(typeof player !== 'undefined' && player){
          player.colorScheme = myColor;
          player.nickname    = myNick;
        }
      });
      break;

    case 'game_started':
      players   = msg.players || [];
      _resetFinishState();
      _netMode  = msg.mode    || _netMode  || 'infinite';
      _netLevel = msg.level   || _netLevel || 1;
      _netSeed  = msg.seed    || _netSeed  || Date.now();
      showNetCountdown(_netMode, _netLevel, () => startNetworkGame(players));
      break;

    case 'player_state':
      updateRemotePlayer(msg);
      break;

    case 'enemies_sync':
      applyEnemiesSync(msg.enemies);
      break;

    case 'boss_sync':
      applyBossSync(msg.boss);
      break;

    case 'bullets_sync':
      applyBulletsSync(msg.bullets);
      break;

    case 'ebullets_sync':
      applyEBulletsSync(msg.bullets);
      break;

    case 'game_event':
      handleRemoteEvent(msg);
      break;

    case 'chat':
      const sender = players.find(p=>p.id===msg.id);
      addChat(esc(sender?sender.nickname:'???'), esc(msg.text));
      break;

    case 'error':
      handleError(msg.reason, msg.max);
      break;
  }
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function enterRoomScreen(){
  $connect.style.display = 'none';
  $room.style.display    = 'flex';
  $roomCode.textContent  = roomCode;
  isReady = false;
  $readyBtn.textContent  = T('netReady');
  $readyBtn.style.borderColor = '';
  $readyBtn.style.color       = '';
  $startBtn.style.display = isHost ? 'block' : 'none';
  // Show level picker only for host
  const $lp = document.getElementById('netLevelPicker');
  if($lp) $lp.style.display = isHost ? 'flex' : 'none';
  updateLevelStatus();
  refreshPlayerList();
  if(typeof netApplyLang==='function') netApplyLang(); // refresh 'PLAYERS (max N)' for this room's cap
  if(isHost){ updateStartBtn(); }
  else { setRoomStatus(T('netWaitHost')); }
  // Clear chat from any previous room
  $chat.innerHTML = '';
}

function refreshPlayerList(){
  $playerList.innerHTML = '';
  const slots = Math.max(players.length, 2);
  for(let i=0; i<slots; i++){
    const p = players[i];
    const row = document.createElement('div');
    row.className = 'net-player-row';
    if(!p){
      const empty = document.createElement('span');
      empty.className = 'net-player-name';
      empty.style.color = '#4af4';
      empty.textContent = T('netEmptySlot');
      row.appendChild(empty);
      row.style.opacity = '0.4';
      $playerList.appendChild(row);
      continue;
    }
    if(p.ready) row.classList.add('is-ready');
    // Mini robot avatar
    const img = document.createElement('img');
    img.className = 'net-player-avatar';
    img.src = robotIconURL(p.color || 'blue');
    row.appendChild(img);

    const name = document.createElement('div');
    name.className = 'net-player-name';
    name.textContent = p.nickname;
    row.appendChild(name);

    if(p.id === myId){
      const tag = document.createElement('span');
      tag.className='net-player-tag you'; tag.textContent=T('netYou');
      row.appendChild(tag);
    }
    if(p.isHost){
      const tag = document.createElement('span');
      tag.className='net-player-tag host'; tag.textContent=T('netHostTag');
      row.appendChild(tag);
    }
    if(p.ready){
      const tag = document.createElement('span');
      tag.className='net-player-tag ready'; tag.textContent=T('netReadyTag');
      row.appendChild(tag);
    }
    $playerList.appendChild(row);
  }
}

function updateStartBtn(){
  if(!isHost) return;
  const allReady = players.filter(p=>p.id!==myId).every(p=>p.ready);
  const enough   = players.length >= 2;
  $startBtn.disabled = !(allReady && enough);
  setRoomStatus(enough
    ? (allReady ? T('netAllReady') : T('netWaitReady'))
    : T('netNeed2'));
}

function setRoomStatus(txt, isErr=false){
  $roomStatus.textContent = txt;
  $roomStatus.classList.toggle('net-error', isErr);
}

// Escape user-supplied text before it goes into innerHTML.
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function addChat(who, text){
  const msg = document.createElement('div');
  msg.className = 'net-chat-msg';
  // `who` / `text` are pre-escaped by callers; system messages pass safe glyphs.
  msg.innerHTML = `<span class="who">${who}:</span> ${text}`;
  $chat.appendChild(msg);
  // Cap chat history so the box can't grow unbounded
  while($chat.children.length > 60) $chat.removeChild($chat.firstChild);
  $chat.scrollTop = $chat.scrollHeight;
}

function handleError(reason, max){
  // A 'not_in_room' is a benign race (e.g. a keepalive sent between leaving and
  // rejoining); it does not mean the socket is down, so never surface it as a
  // connection error.
  if(reason === 'not_in_room') return;
  const map = {
    room_not_found: 'netErrRoomNotFound',
    room_full:      'netErrRoomFull',
    not_host:       'netErrNotHost',
    not_in_room:    'netErrNotInRoom',
    not_all_ready:  'netErrNotAllReady',
  };
  const txt = map[reason]
    ? T(map[reason], max || roomMaxPlayers || MAX_NET_PLAYERS)
    : T('netErrGeneric', reason);
  $connStatus.textContent = txt;
  $connStatus.classList.add('net-error');
  setRoomStatus(txt, true);
}

// ── Game start / sync ────────────────────────────────────────────────────────

// Spawn offsets so up to 5 players don't stack on the same pixel
const SPAWN_OFFSETS = [0, 36, -36, 72, -72];

// Show 3-2-1-GO countdown then call onDone()
let _countdownIv = null;
// ── Co-op: wait for ALL players to finish the level ─────────────────────
// When a player reaches the flag they freeze and a dim overlay shows «waiting for
// players X/N». The host tallies finishers and only advances the whole room once
// everyone is done. This keeps the host simulating enemies for players still in
// the level (we never drop the host into the single-player 'levelclear' state).
let _netFinished = new Set();
// Whether OUR local player has reached the flag this level. The "waiting for
// players" overlay must only dim the screen for players who already finished —
// players still in the level keep playing and must NOT see it, even though the
// host broadcasts the X/N progress to everyone.
let _iFinished = false;
function _resetFinishState(){ _netFinished = new Set(); _iFinished = false; window._netLevelAdvancing = false; hideNetWaiting(); }

function showNetWaiting(count, total){
  const ov = document.getElementById('netWaiting');
  if(!ov) return;
  const t = document.getElementById('netWaitingTxt');
  if(t) t.textContent = T('netWaitingPlayers', count, total);
  if(typeof window.applyI18nDOM==='function') window.applyI18nDOM();
  ov.style.display = 'flex';
}
function hideNetWaiting(){
  const ov = document.getElementById('netWaiting');
  if(ov) ov.style.display = 'none';
}

// Called from game.js when OUR local player reaches the flag.
window.netReportFinish = function(){
  if(!window.netActive) return;
  _iFinished = true; // from now on we may see the waiting overlay
  if(isHost){
    _hostMarkFinished(myId);
  } else {
    wsSend({type:'game_event', event:'finish'});
    // Optimistic overlay; the host's finish_progress broadcast corrects the count.
    showNetWaiting(1, players.length || 1);
  }
};

function _hostMarkFinished(id){
  if(!isHost) return;
  _netFinished.add(id);
  _hostBroadcastProgress();
}
// Broadcast the current X/N progress to everyone and advance if all are done.
function _hostBroadcastProgress(){
  if(!isHost) return;
  const total = players.length || 1;
  const count = Math.min(_netFinished.size, total);
  if(count <= 0) return;
  // Only show the overlay to ourselves if WE'VE finished (the host may still be
  // playing while other players reach the flag).
  if(_iFinished) showNetWaiting(count, total);
  if(ws && ws.readyState===1) wsSend({type:'game_event', event:'finish_progress', data:{count, total}});
  if(count >= total) _hostAdvanceRoom();
}
// Everyone finished → host drives the whole room to the next level (or win).
function _hostAdvanceRoom(){
  if(!isHost || window._netLevelAdvancing) return;
  window._netLevelAdvancing = true;
  const adv  = (typeof advMode!=='undefined' && advMode);
  const next = adv ? ((typeof advLevel!=='undefined'?advLevel:1)+1)
                   : ((typeof level!=='undefined'?level:1)+1);
  const mode = adv ? 'adventure' : 'infinite';
  if(adv && next>100){
    // Final level cleared by the whole room — win for everyone.
    if(ws && ws.readyState===1) wsSend({type:'game_event', event:'won'});
    hideNetWaiting();
    if(typeof showWin==='function') showWin();
    return;
  }
  _netLevel = next; _netMode = mode;
  if(ws && ws.readyState===1) wsSend({type:'level_complete', nextLevel:next, mode});
}

function showNetCountdown(mode, level, onDone){
  const $loading = document.getElementById('netLoading');
  const $title   = document.getElementById('netLoadTitle');
  const $count   = document.getElementById('netLoadCount');
  const $sub     = document.getElementById('netLoadSub');
  $title.textContent = mode === 'adventure' ? T('netAdvLvlTitle', level) : T('netInfModeTitle');
  if($sub) $sub.textContent = T('netGetReadySub');
  $loading.style.display = 'flex';
  if(_countdownIv) clearInterval(_countdownIv);
  let n = 3;
  $count.textContent = n;
  $count.style.animation = 'none'; void $count.offsetWidth; $count.style.animation = 'netCountPop .4s ease-out';
  _countdownIv = setInterval(() => {
    n--;
    if(n > 0){
      $count.textContent = n;
      $count.style.animation = 'none'; void $count.offsetWidth; $count.style.animation = 'netCountPop .4s ease-out';
    } else {
      clearInterval(_countdownIv); _countdownIv = null;
      $count.textContent = T('netGo');
      $count.style.animation = 'none'; void $count.offsetWidth; $count.style.animation = 'netCountPop .4s ease-out';
      setTimeout(() => { $loading.style.display = 'none'; onDone(); }, 600);
    }
  }, 900);
}

function startNetworkGame(allPlayers){
  $lobby.style.display = 'none';
  window.netActive = true;
  window._netLevelAdvancing = false;
  window.netPlayers.clear();
  updateGamePing(); // reveal the in-game ping readout

  // Disable local 2P — network handles multiplayer
  if(typeof twoPlayer !== 'undefined') twoPlayer = false;

  // Co-op always uses normal difficulty: the lobby has no hardcore toggle, and
  // hardMode changes the adventure seed AND difficulty, so a client still flagged
  // hardcore from an earlier single-player run would generate a DIFFERENT level
  // and break index-based enemy sync. Force it off so all clients gen identically.
  if(typeof hardMode!=='undefined') hardMode=false;

  // Launch the correct mode using the shared params
  // For adventure: startAdv uses mkRNG(n*9001+12345) — deterministic, same for all players
  // For infinite: set level number first so all players get same difficulty/theme
  if(_netMode === 'adventure'){
    if(typeof startAdv === 'function') startAdv(_netLevel, true);
  } else {
    // Sync level so infinite starts at same difficulty for everyone
    if(typeof level !== 'undefined') level = _netLevel;
    if(typeof startInf === 'function') startInf(true);
  }

  // After startAdv/startInf: player is spawned, spawnX/spawnY are set
  if(typeof player !== 'undefined' && player){
    player.colorScheme = myColor;
    player.nickname    = myNick;
  }

  // Create ghost objects for every remote player
  const myIdx = allPlayers.findIndex(p => p.id === myId);
  allPlayers.forEach((p, i) => {
    if(p.id === myId) return;
    const offsetX = SPAWN_OFFSETS[Math.abs(i - myIdx)] || (i * 36);
    const pObj = mkPlayer(
      (typeof spawnX !== 'undefined' ? spawnX : 60) + offsetX,
      (typeof spawnY !== 'undefined' ? spawnY : 300),
      p.color || {h:210,s:80,l:55}
    );
    pObj.nickname   = p.nickname;
    pObj.isNetGhost = true;
    window.netPlayers.set(p.id, { playerObj: pObj, lastUpdate: Date.now() });
  });

  startStateLoop();
  // Keep game logic ticking even if this tab gets hidden / a dialog opens. The
  // host's enemy/boss AI lives in the game loop, so a frozen host froze the whole
  // room; the background ticker (Web Worker driven) prevents that.
  if(typeof window.startBgTicker==='function') window.startBgTicker();
}

let _stateInterval = null;
let _netTickDiv = 0; // for sending enemies/bullets at lower rate than position
let _lastStateSend = 0;
// One iteration of the state broadcast. Normally driven by a 20 Hz setInterval,
// but ALSO callable from the background ticker (game.js) so that when this tab is
// hidden — and the interval is throttled to ~1 Hz — the host still pumps enemy/
// boss snapshots at full rate and the room doesn't freeze. `_lastStateSend`
// throttles the combined callers to one send per ~50 ms.
function _stateTick(){
    if(!window.netActive || !ws || ws.readyState!==1) return;
    if(typeof player==='undefined' || !player) return;
    const _now = Date.now();
    if(_now - _lastStateSend < 45) return; // ~20 Hz cap across both drivers
    _lastStateSend = _now;

    _netTickDiv++;

    // ── Player state (20 Hz) ─────────────────────────────────────────────────
    wsSend({
      type:    'game_state',
      x:       Math.round(player.x),
      y:       Math.round(player.y),
      vx:      +player.vx.toFixed(2),
      vy:      +player.vy.toFixed(2),
      facing:  player.facing,
      action:  player.onGnd ? (Math.abs(player.vx)>0.5?'run':'idle') : 'jump',
      hp:      typeof lives!=='undefined' ? lives : 3,
      // powerup states
      blaster: !!player.blaster,
      broken:  !!player.broken,
      starMode:!!player.starMode,
      fireMode:!!player.fireMode,
      iceMode: !!player.iceMode,
      boots:   !!player.boots,
    });

    // ── Host: sync enemies + boss + bullets every 3 ticks (~7 Hz) ────────────
    // Enemies are synced by ARRAY INDEX: every client generates an identical
    // enemy array from the same seed, so enemies[i] is the same enemy on every
    // client. We only send the small mutable state (position, hp, status flags)
    // and apply it in order. Guest enemy/boss AI is disabled (host authoritative).
    if(isHost && _netTickDiv % 3 === 0){
      if(typeof enemies!=='undefined'){
        wsSend({
          type: 'enemies_sync',
          enemies: enemies.map(e=>({
            x:   Math.round(e.x),
            y:   Math.round(e.y),
            vx:  +(e.vx||0).toFixed(2),
            hp:  e.hp,
            al:  e.alive ? 1 : 0,
            fl:  e.flash|0,
            fz:  e._frozen ? 1 : 0,
            bn:  e._burning ? 1 : 0,
            sh:  e.shielded ? 1 : 0,
            t:   e.type, // needed so guests can build stubs for host-spawned extras (split enemies)
          })),
        });
      }
      // Boss authoritative state (null when no boss / dead)
      if(typeof boss!=='undefined'){
        wsSend({
          type: 'boss_sync',
          boss: (boss && boss.alive) ? {
            x:    Math.round(boss.x),
            y:    Math.round(boss.y),
            hp:   boss.hp,
            facing: boss.facing,
            phase: boss.phase,
            flash: boss.flash|0,
            anim:  boss.anim|0,
            orbs:  Array.isArray(boss.orbs)?boss.orbs.map(o=>o.alive?1:0):null,
            nodes: Array.isArray(boss.nodes)?boss.nodes.map(n=>n.alive?1:0):null,
            shieldsDown: !!boss.shieldsDown,
            solid: !!boss.solid,
            windowOpen: !!boss.windowOpen,
            // Extra gate state guests need to decide if their shots can hurt the
            // boss (see _bossBulletContact()'s canHit logic in game.js).
            descending: !!boss.descending,
            shellBroken: !!boss.shellBroken,
            stunTimer: boss.stunTimer|0,
          } : null,
        });
      }
      // Player bullets (host) — guests render these as ghost bullets
      if(typeof pBullets!=='undefined'){
        wsSend({
          type:    'bullets_sync',
          bullets: pBullets.map(b=>({
            x:   Math.round(b.x),
            y:   Math.round(b.y),
            w:   b.w, h: b.h,
            col: b.col || null,
          })),
        });
      }
      // Enemy bullets (host authoritative) — guests must see them to dodge/render
      if(typeof eBullets!=='undefined'){
        wsSend({
          type:    'ebullets_sync',
          bullets: eBullets.map(b=>({
            x:   Math.round(b.x),
            y:   Math.round(b.y),
            vx:  +(b.vx||0).toFixed(2),
            vy:  +(b.vy||0).toFixed(2),
            w:   b.w, h: b.h,
            round: b.round ? 1 : 0,
          })),
        });
      }
    }
}
// Let the background ticker pump state too (see _stateTick comment).
window.netStateTick = _stateTick;

function startStateLoop(){
  if(_stateInterval) clearInterval(_stateInterval);
  _lastStateSend = 0;
  _stateInterval = setInterval(_stateTick, 50); // 20 Hz (foreground driver)
}

function stopStateLoop(){
  if(_stateInterval){ clearInterval(_stateInterval); _stateInterval=null; }
  window.netStateTick = null;
}

// Update a remote player's object with received state.
// Position is stored as a *target* and smoothed per-frame in interpolateGhosts()
// so motion stays fluid even though updates arrive at only ~20 Hz.
function updateRemotePlayer(msg){
  const entry = window.netPlayers.get(msg.id);
  if(!entry) return;
  const p = entry.playerObj;
  if(!p) return;
  // First packet: snap straight to position (avoid a long slide from spawn).
  if(entry.tx === undefined){ p.x = msg.x; p.y = msg.y; }
  entry.tx  = msg.x;
  entry.ty  = msg.y;
  p.vx      = msg.vx || 0;
  p.vy      = msg.vy || 0;
  if(msg.facing) p.facing = msg.facing;
  // Sync all powerup/damage states so rendering is identical
  p.blaster  = !!msg.blaster;
  p.broken   = !!msg.broken;
  p.starMode = !!msg.starMode;
  p.fireMode = !!msg.fireMode;
  p.iceMode  = !!msg.iceMode;
  p.boots    = !!msg.boots;
  entry.lastUpdate = Date.now();
}

// Called once per render frame: ease each ghost toward its last known target and
// keep its motion trail fresh. Large gaps snap (teleport / respawn), small gaps lerp.
function interpolateGhosts(){
  for(const [, entry] of window.netPlayers){
    const p = entry.playerObj;
    if(!p || entry.tx === undefined) continue;
    const dx = entry.tx - p.x, dy = entry.ty - p.y;
    if(Math.abs(dx) > 220 || Math.abs(dy) > 220){
      p.x = entry.tx; p.y = entry.ty;          // teleport: snap
    } else {
      p.x += dx * 0.30;                         // smooth follow
      p.y += dy * 0.30;
      if(Math.abs(dx) < 0.4) p.x = entry.tx;
      if(Math.abs(dy) < 0.4) p.y = entry.ty;
    }
    // Motion trail
    if(!p.trail) p.trail = [];
    if(Math.abs(p.vx) > 0.5 || Math.abs(p.vy) > 0.5) p.trail.unshift({x:p.x+p.w/2, y:p.y+p.h/2});
    if(p.trail.length > 12) p.trail.length = 12;
  }
}

// Non-host: receive authoritative enemy state from host (index-based).
// Both clients generate an identical enemy array from the shared seed, so
// enemies[i] is the same enemy everywhere — we just copy host state in order.
function applyEnemiesSync(list){
  if(!list||isHost) return;
  if(typeof enemies==='undefined'||!enemies) return;
  for(let i=0;i<list.length;i++){
    const ne=list[i];
    let e=enemies[i];
    if(!e){
      // Host has more enemies than us (e.g. split-enemy children spawned host-side).
      // Build a drawable stub from the enemy config so it renders + can be hit.
      const cfg=(typeof EC!=='undefined')?EC[ne.t]:null;
      e={type:ne.t, moveType:cfg?cfg.moveType:'walk',
         col:cfg?cfg.col:'#f4a', glow:cfg?cfg.glow:'#f4a',
         w:cfg?cfg.w:24, h:cfg?cfg.h:24,
         vy:0, onGnd:false, a:0, fpH:0, fAmp:0, orbitAngle:0,
         px:ne.x, py:ne.y};
      enemies[i]=e;
    }
    e.x  = ne.x;
    e.y  = ne.y;
    e.vx = ne.vx;
    e.hp = ne.hp;
    e.alive    = !!ne.al;
    e.flash    = ne.fl|0;
    e._frozen  = !!ne.fz;
    e._burning = !!ne.bn;
    e.shielded = !!ne.sh;
  }
  // Host array shrank below ours? (shouldn't normally happen) trim extras.
  if(enemies.length>list.length) enemies.length=list.length;
}

// Non-host: receive authoritative boss state from host.
function applyBossSync(b){
  if(isHost) return;
  if(typeof boss==='undefined') return;
  if(!b){
    // Host says boss is gone/dead — play a local death flourish then clear it
    if(boss){
      const bx=boss.x, bw=boss.w; // remember position before we null the boss
      if(typeof burst==='function'){
        burst(boss.x+boss.w/2, boss.y+boss.h/2, (typeof CT!=='undefined'&&CT.clr)||'#fff', 40, 6, 7);
        burst(boss.x+boss.w/2, boss.y+boss.h/2, '#fff', 20, 4, 5);
      }
      if(typeof camShake!=='undefined') camShake = 20;
      boss.alive=false; boss=null;
      // Boss levels park the exit flag off-world (flagX=worldW+99999) until the
      // boss dies; the host reveals it inside killBoss(), which guests never run.
      // Reveal it here too — otherwise the guest can never reach the flag and the
      // whole room hangs forever waiting on them. (flagX/worldW/flagDone are
      // game.js globals shared across the page's classic scripts.)
      if(typeof flagX!=='undefined' && typeof worldW!=='undefined' && flagX>worldW){
        flagX = bx + bw/2 - 15;
        flagDone = false;
      }
    }
    return;
  }
  if(!boss) return; // guest hasn't spawned boss locally yet; wait until it does
  boss.x      = b.x;
  boss.y      = b.y;
  boss.hp     = b.hp;
  boss.facing = b.facing;
  boss.phase  = b.phase;
  boss.flash  = b.flash|0;
  boss.anim   = b.anim|0;
  boss.shieldsDown = !!b.shieldsDown;
  boss.solid  = !!b.solid;
  boss.windowOpen = !!b.windowOpen;
  boss.descending = !!b.descending;
  boss.shellBroken = !!b.shellBroken;
  boss.stunTimer = b.stunTimer|0;
  if(b.orbs && Array.isArray(boss.orbs)){
    for(let i=0;i<boss.orbs.length&&i<b.orbs.length;i++) boss.orbs[i].alive = !!b.orbs[i];
  }
  if(b.nodes && Array.isArray(boss.nodes)){
    for(let i=0;i<boss.nodes.length&&i<b.nodes.length;i++) boss.nodes[i].alive = !!b.nodes[i];
  }
}

// Non-host: receive host player's bullets and render them locally
window._netHostBullets = [];
function applyBulletsSync(list){
  if(isHost) return;
  window._netHostBullets = list || [];
}

// Non-host: receive enemy bullets from host. We replace the local eBullets
// array so collision (against the local player) and rendering both work.
function applyEBulletsSync(list){
  if(isHost) return;
  if(typeof eBullets==='undefined') return;
  eBullets.length = 0;
  for(const b of (list||[])){
    eBullets.push({x:b.x,y:b.y,w:b.w||10,h:b.h||10,vx:b.vx||0,vy:b.vy||0,dist:0,max:99999,round:!!b.round});
  }
}

function handleRemoteEvent(msg){
  if(msg.event === 'died'){
    const entry = window.netPlayers.get(msg.id);
    if(entry && entry.playerObj){ entry.playerObj.alive = false; }
    // Spawn death particles at remote player's last position
    if(entry && typeof burst==='function'){
      burst(entry.playerObj.x+12, entry.playerObj.y+16, '#f44', 12, 3.5, 4);
    }
  }
  if(msg.event === 'respawn'){
    const entry = window.netPlayers.get(msg.id);
    if(entry && entry.playerObj){ entry.playerObj.alive = true; }
  }
  // A remote player took a checkpoint — recolour it to THEIR colour on our screen
  // too, so every client sees the same checkpoint colour (the toucher's).
  if(msg.event === 'checkpoint' && msg.data){
    const d = msg.data;
    if(typeof checkpoints!=='undefined' && checkpoints[d.idx]){
      const cp = checkpoints[d.idx];
      cp.taken = true; cp.anim = 0; if(d.color) cp.color = d.color;
      if(typeof burst==='function'){ burst(cp.x+cp.w/2, cp.y+8, cp.color||'#4af', 18, 4, 5); }
    }
  }
  // ── A player reached the flag → add them to the finish tally. The room only
  //    advances once EVERYONE has finished (see _hostMarkFinished). Host only.
  if(isHost && msg.event === 'finish'){
    _hostMarkFinished(msg.id);
  }
  // Host broadcasts X/N progress to everyone, but only players who themselves
  // already reached the flag should see the dim "waiting" overlay — players still
  // in the level keep playing without it.
  if(msg.event === 'finish_progress' && msg.data){
    if(_iFinished) showNetWaiting(msg.data.count|0, msg.data.total|0);
  }
  // Final level cleared by the whole room → win for everyone.
  if(msg.event === 'won'){
    hideNetWaiting();
    if(typeof showWin === 'function') showWin();
  }
  // ── Host-authoritative damage from a guest's attack ──────────────────────
  // Guests can't kill enemies locally (host owns hp). They report the hit and
  // the host applies it via hurtE/damageBoss; the result syncs back to all.
  if(isHost && msg.event === 'hit_enemy' && msg.data){
    const d = msg.data;
    if(typeof enemies!=='undefined' && enemies[d.idx] && enemies[d.idx].alive){
      const e = enemies[d.idx];
      if(typeof hurtE==='function') hurtE(e, d.dmg||1, !!d.stomp);
      // Apply elemental status the same way local bullets do
      if(e.alive && d.elem==='fire'){ if(!e._burning){e._burning=true;e._burnT=0;e._burnTotal=300;} }
      if(e.alive && d.elem==='ice'){  if(!e._frozen){e._frozen=true;e._freezeT=90;e._origSpd=e.spd||1;} e.vx=0; }
    }
  }
  if(isHost && msg.event === 'hit_boss' && msg.data){
    const d = msg.data;
    if(typeof boss!=='undefined' && boss && boss.alive){
      if(typeof damageBoss==='function') damageBoss(d.dmg||1);
      if(boss && boss.alive && d.elem==='fire'){ if(!boss._burning){boss._burning=true;boss._burnT=0;boss._burnTotal=300;} }
      if(boss && boss.alive && d.elem==='ice'){  boss._slowed=true;boss._slowT=180; }
    }
  }
  // A guest destroyed a boss part (orb/node) — apply it on the authoritative boss.
  // The result rides back to everyone in the next boss_sync.
  if(isHost && msg.event === 'hit_boss_part' && msg.data){
    const d = msg.data;
    if(typeof boss!=='undefined' && boss && boss.alive){
      const arr = d.kind==='orb' ? boss.orbs : (d.kind==='node' ? boss.nodes : null);
      if(Array.isArray(arr) && arr[d.idx] && arr[d.idx].alive){
        arr[d.idx].alive = false;
        if(d.kind==='node') arr[d.idx].flashT = 20;
      }
    }
  }
}

// Guest helper: report a hit on enemy index `idx` to the host.
window.netReportEnemyHit = function(idx, dmg, stomp, elem){
  if(!window.netActive || isHost) return;
  wsSend({type:'game_event', event:'hit_enemy', data:{idx:idx|0, dmg:dmg||1, stomp:!!stomp, elem:elem||null}});
};
window.netReportBossHit = function(dmg, elem){
  if(!window.netActive || isHost) return;
  wsSend({type:'game_event', event:'hit_boss', data:{dmg:dmg||1, elem:elem||null}});
};
// Guest helper: report destruction of a boss part (orb / node) by index. The host
// owns the part state and syncs it back via boss_sync.
window.netReportBossPart = function(kind, idx){
  if(!window.netActive || isHost) return;
  wsSend({type:'game_event', event:'hit_boss_part', data:{kind:kind, idx:idx|0}});
};

// ── Button wiring ────────────────────────────────────────────────────────────
// Toggle helper: highlight a button as active (coloured) or inactive (secondary).
function _tog(btn, on, col){
  if(!btn) return;
  col = col || '#0ff';
  btn.classList.toggle('secondary', !on);
  btn.style.borderColor = on ? col : '';
  btn.style.color       = on ? col : '';
}

// Read + persist the nickname from the input. Called before every create/join.
function commitNick(){
  myNick = sanitizeNick(document.getElementById('netNick').value);
  const el = document.getElementById('netNick');
  if(el) el.value = myNick;
  saveProfile();
  return myNick;
}
document.getElementById('netNick').addEventListener('change', commitNick);

// ── CREATE-ROOM view ─────────────────────────────────────────────────────
function applyVisUI(){
  _tog(document.getElementById('netVisOpenBtn'),   _createPublic,  '#0f8');
  _tog(document.getElementById('netVisClosedBtn'), !_createPublic, '#fc3');
  const hint = document.getElementById('netVisHint');
  if(hint){
    hint.textContent = _createPublic ? T('netOpenHint') : T('netClosedHint');
    hint.style.color = _createPublic ? '#4af9' : '#fc3';
  }
}
function applyMaxUI(){
  document.querySelectorAll('#netMaxRow .net-max-btn').forEach(b => {
    _tog(b, parseInt(b.dataset.max,10)===_createMax, '#0ff');
  });
}
document.getElementById('netVisOpenBtn').onclick   = () => { _createPublic = true;  applyVisUI(); };
document.getElementById('netVisClosedBtn').onclick = () => { _createPublic = false; applyVisUI(); };
document.querySelectorAll('#netMaxRow .net-max-btn').forEach(b => {
  b.onclick = () => { _createMax = parseInt(b.dataset.max,10) || MAX_NET_PLAYERS; applyMaxUI(); };
});
document.getElementById('netDoCreateBtn').onclick = () => {
  commitNick();
  wsSend({type:'create_room', nickname:myNick, color:myColor, isPublic:_createPublic, maxPlayers:_createMax});
};

// ── FIND-ROOM view ──────────────────────────────────────────────────────
function applySrcUI(){
  _tog(document.getElementById('netSrcServerBtn'),       _lobbyMode==='server', '#f0f');
  _tog(document.getElementById('netSrcLocalBtn'),        _lobbyMode==='lan',    '#0f8');
  _tog(document.getElementById('netCreateSrcServerBtn'), _lobbyMode==='server', '#f0f');
  _tog(document.getElementById('netCreateSrcLocalBtn'),  _lobbyMode==='lan',    '#0f8');
  refreshLanHostUI();
}

// LAN-only: show the host-address input (so a peer can target the host's IP) and
// list this machine's own LAN IPs (so the host can read them out to friends).
function refreshLanHostUI(){
  // Web: «LOCAL» routes through the cloud relay, so the LAN host-address input is
  // meaningless — hide it and show a one-line hint that local play uses the
  // online server in the browser. (Both create + find views carry a hint span.)
  const showHint = (!IS_DESKTOP && _lobbyMode === 'lan');
  document.querySelectorAll('.net-local-web-hint').forEach(el => {
    el.style.display = showHint ? 'block' : 'none';
    if(showHint) el.textContent = T('netLocalWebHint');
  });

  const row = document.getElementById('netLanHostRow');
  if(!row) return;
  const show = (IS_DESKTOP && _lobbyMode === 'lan' && _uiView === 'find');
  row.style.display = show ? 'flex' : 'none';
  if(!show) return;
  const inp = document.getElementById('netLanHost');
  if(inp && document.activeElement !== inp) inp.value = _lanHost || 'localhost';
  // Populate our own LAN IPs (Electron only).
  const ipsEl = document.getElementById('netLanIps');
  if(ipsEl && window.electronAPI && typeof window.electronAPI.getLanInfo === 'function'){
    window.electronAPI.getLanInfo().then(info => {
      if(!info) return;
      const ips = (info.ips || []);
      ipsEl.textContent = ips.length
        ? T('netLanYourIp', ips.join(', '))
        : T('netLanNoIp');
    }).catch(()=>{});
  }
}
function commitLanHost(){
  const inp = document.getElementById('netLanHost');
  if(!inp) return;
  const v = (inp.value || '').trim() || 'localhost';
  if(v === _lanHost) return;
  _lanHost = v;
  try { localStorage.setItem('bb_net_lanhost', _lanHost); } catch(e){}
  // Reconnect to the new endpoint if we're in LAN mode.
  if(_lobbyMode === 'lan'){
    _manualClose = false;
    if(ws){ try{ ws.close(); }catch(e){} }
    connect();
    if(_uiView === 'find') setTimeout(loadPublicRooms, 600);
  }
}
// Switch the room source (cloud vs LAN). Reconnects to the right endpoint and
// reloads the room list so the player sees rooms from the chosen source.
function setSource(mode){
  if(_lobbyMode === mode){ if(_uiView === 'find') loadPublicRooms(); return; }
  _lobbyMode = mode;
  applySrcUI();
  netApplyLang();
  const refreshList = (_uiView === 'find');
  if(!ws || ws.readyState > 1 || _connectedUrl !== activeUrl()){
    _manualClose = false;
    if(ws){ try{ ws.close(); }catch(e){} }
    connect();
    if(refreshList) setTimeout(loadPublicRooms, 600);
  } else if(refreshList){
    loadPublicRooms();
  }
}
document.getElementById('netSrcServerBtn').onclick       = () => setSource('server');
document.getElementById('netSrcLocalBtn').onclick        = () => setSource('lan');
document.getElementById('netCreateSrcServerBtn').onclick = () => setSource('server');
document.getElementById('netCreateSrcLocalBtn').onclick  = () => setSource('lan');

document.getElementById('netReloadRoomsBtn').onclick = loadPublicRooms;
(function(){
  const lh = document.getElementById('netLanHost');
  if(lh){ lh.addEventListener('change', commitLanHost); lh.addEventListener('blur', commitLanHost); }
})();

function loadPublicRooms(){
  const $list = document.getElementById('netRoomsList');
  if($list) $list.innerHTML = `<div class="net-status">${esc(T('netLoadingRooms'))}</div>`;
  wsSend({type:'list_rooms'});
}

function renderPublicRooms(roomArr){
  const $list = document.getElementById('netRoomsList');
  if(!$list) return;
  if(!roomArr.length){
    $list.innerHTML = `<div class="net-status" style="color:#4af4">${esc(T('netNoRooms'))}</div>`;
    return;
  }
  $list.innerHTML = '';
  roomArr.forEach(r => {
    const row = document.createElement('div');
    row.className = 'net-pub-room';
    const modeStr = r.mode
      ? (r.mode==='adventure' ? T('netRoomMetaAdv', r.level) : T('netRoomMetaInf'))
      : T('netRoomMetaNotSet');
    row.innerHTML = `
      <div class="net-pub-room-info">
        <div class="net-pub-room-host">👤 ${esc(r.hostName)}</div>
        <div class="net-pub-room-meta">${esc(modeStr)} &nbsp;·&nbsp; ${esc(T('netRoomCodeWord'))}: ${esc(r.code)}</div>
      </div>
      <div class="net-pub-room-count">${r.playerCount}/${r.maxPlayers}</div>
    `;
    row.onclick = () => {
      commitNick();
      wsSend({type:'join_room', code:r.code, nickname:myNick, color:myColor});
    };
    $list.appendChild(row);
  });
}

document.getElementById('netJoinBtn').onclick = () => {
  commitNick();
  const code = document.getElementById('netCodeInput').value.toUpperCase().trim();
  if(code.length!==6){ $connStatus.textContent=T('netEnterCode'); $connStatus.classList.add('net-error'); return; }
  wsSend({type:'join_room', code, nickname:myNick, color:myColor});
};

$readyBtn.onclick = () => {
  isReady = !isReady;
  $readyBtn.textContent = isReady ? T('netUnready') : T('netReady');
  $readyBtn.style.borderColor = isReady ? '#0f0' : '';
  $readyBtn.style.color       = isReady ? '#0f0' : '';
  wsSend({type:'set_ready', ready:isReady});
};

$startBtn.onclick = () => {
  // Client-side guard mirroring the server check: never request a start unless
  // there are ≥2 players and EVERY other player is ready. The button is normally
  // disabled in that case too, but guarding here also protects against any state
  // desync and against an older relay that doesn't enforce readiness server-side.
  const allReady = players.filter(p=>p.id!==myId).every(p=>p.ready);
  if(players.length < 2 || !allReady){
    setRoomStatus(players.length < 2 ? T('netNeed2') : T('netWaitReady'), true);
    return;
  }
  wsSend({type:'start_game'});
};

// ── Level picker (host only) ────────────────────────────────────────────────
let _hostMode = 'infinite';

document.getElementById('netModeAdv').onclick = () => {
  _hostMode = 'adventure';
  _netLevel = parseInt(document.getElementById('netLvlInput').value)||1;
  document.getElementById('netLvlRow').style.display = 'flex';
  document.getElementById('netModeAdv').style.borderColor = '#0ff';
  document.getElementById('netModeAdv').style.color = '#0ff';
  document.getElementById('netModeInf').style.borderColor = '';
  document.getElementById('netModeInf').style.color = '';
  wsSend({type:'select_level', mode:'adventure', level:_netLevel, seed:Date.now()});
};

document.getElementById('netModeInf').onclick = () => {
  _hostMode = 'infinite';
  document.getElementById('netLvlRow').style.display = 'none';
  document.getElementById('netModeInf').style.borderColor = '#0ff';
  document.getElementById('netModeInf').style.color = '#0ff';
  document.getElementById('netModeAdv').style.borderColor = '';
  document.getElementById('netModeAdv').style.color = '';
  wsSend({type:'select_level', mode:'infinite', level:1, seed:Date.now()});
};

document.getElementById('netLvlInput').oninput = () => {
  const n = Math.min(100, Math.max(1, parseInt(document.getElementById('netLvlInput').value)||1));
  _netLevel = n;
  wsSend({type:'select_level', mode:'adventure', level:n, seed:Date.now()});
};

function updateLevelStatus(){
  const $s = document.getElementById('netLevelStatus');
  if(!$s) return;
  if(_netMode === 'adventure'){
    $s.textContent = T('netAdvLevelStatus', _netLevel);
    $s.style.color = '#0ff';
  } else if(_netMode === 'infinite'){
    $s.textContent = T('netInfSelectedStatus');
    $s.style.color = '#0f8';
  } else {
    $s.textContent = T('netChooseMode');
    $s.style.color = '#ff0';
  }
  // Reflect the active mode on the picker buttons too
  const adv = document.getElementById('netModeAdv');
  const inf = document.getElementById('netModeInf');
  if(adv && inf){
    const onAdv = _netMode === 'adventure';
    adv.style.borderColor = onAdv ? '#0ff' : '';
    adv.style.color       = onAdv ? '#0ff' : '';
    inf.style.borderColor = _netMode === 'infinite' ? '#0ff' : '';
    inf.style.color       = _netMode === 'infinite' ? '#0ff' : '';
    const lvlRow = document.getElementById('netLvlRow');
    if(lvlRow) lvlRow.style.display = onAdv ? 'flex' : 'none';
  }
}

document.getElementById('netLeaveBtn').onclick = () => {
  leaveRoom();
};

document.getElementById('netBackBtn').onclick = () => {
  $lobby.style.display = 'none';
  if(typeof showNetType==='function') showNetType();
  else if(typeof showMain==='function') showMain();
};

document.getElementById('netConnLostBtn').onclick = () => {
  hideConnLost();
  leaveRoom();
};

$chatInput.onkeydown = (e) => {
  if(e.key==='Enter' && $chatInput.value.trim()){
    wsSend({type:'chat', text:$chatInput.value.trim().slice(0,80)});
    $chatInput.value='';
  }
};

function leaveRoom(){
  _manualClose = true;
  if(_reconnectTimer){ clearTimeout(_reconnectTimer); _reconnectTimer=null; }
  stopStateLoop();
  if(typeof window.stopBgTicker==='function') window.stopBgTicker();
  stopPing();
  hideConnLost();
  _resetFinishState();   // clear any "waiting for players" overlay/tally
  window.netActive = false;
  window.netPlayers.clear();
  updateGamePing(); // hide the in-game ping readout
  _netMode = 'infinite'; _netLevel = 1; _netSeed = 0;
  // Tell the relay to drop us NOW so the room is deleted immediately instead of
  // lingering under the disconnect grace timer (which showed it as a ghost room).
  if(ws && ws.readyState===1 && roomCode){ try{ wsSend({type:'leave_room'}); }catch(e){} }
  roomCode = null; isHost = false; isReady = false; players = [];
  if(ws){ try{ ws.close(); }catch(e){} ws=null; }
  $room.style.display    = 'none';
  $connect.style.display = 'flex';
  $lobby.style.display   = 'none';
  if(typeof showNetType==='function') showNetType();
  else if(typeof showMain==='function') showMain();
  setTimeout(connect, 300);
}

// ── Public API ───────────────────────────────────────────────────────────────
// Re-apply all network UI text in the active language. Safe to call any time.
function netApplyLang(){
  // Lobby header (mode-dependent)
  const h2 = document.getElementById('netLobbyTitle');
  if(h2){
    if(_lobbyMode === 'lan'){
      h2.textContent = T('netLobbyLocal');
      h2.style.color = '#0f8'; h2.style.textShadow = '0 0 14px #0f8';
    } else {
      h2.textContent = T('netLobbyOnline');
      h2.style.color = '#f0f'; h2.style.textShadow = '0 0 14px #f0f';
    }
  }
  // Players-count label
  const pl = document.getElementById('netPlayersLabel');
  if(pl) pl.textContent = T('netPlayersMax', roomMaxPlayers);
  // Re-seed connect-screen toggle UI (labels/hints depend on language).
  if($connect && $connect.style.display !== 'none'){
    if(typeof applyVisUI==='function' && _uiView==='create'){ applyVisUI(); applyMaxUI(); }
    if(typeof applySrcUI==='function'){ applySrcUI(); }
  }
  // Ready button reflects current state
  if($readyBtn) $readyBtn.textContent = isReady ? T('netUnready') : T('netReady');
  // Connection-lost overlay
  const clT = document.getElementById('netConnLostTitle');
  const clS = document.getElementById('netConnLostSub');
  const clB = document.getElementById('netConnLostBtn');
  if(clT) clT.textContent = T('netConnLost');
  if(clS) clS.textContent = T('netConnLostSub');
  if(clB) clB.textContent = T('netReturnLobby');
  // Loading sub-text
  const ls = document.getElementById('netLoadSub');
  if(ls) ls.textContent = T('netGetReadySub');
  // Re-render dynamic lists/statuses
  if($room && $room.style.display !== 'none'){
    refreshPlayerList();
    updateLevelStatus();
    if(isHost) updateStartBtn();
    else setRoomStatus(T('netWaitHost'));
  }
}
window.netApplyLang = netApplyLang;

window.NetPlay = {
  // view: 'create' | 'find'. Create always hosts on the cloud server; Find lets
  // the player toggle between server (cloud) and local (LAN) room sources.
  open(view='create'){
    _uiView = (view === 'find') ? 'find' : 'create';

    loadProfile();
    buildColorPicker();
    const nickEl = document.getElementById('netNick');
    if(nickEl) nickEl.value = myNick;

    // Show the right sub-view and seed its toggle UI.
    const cv = document.getElementById('netCreateView');
    const fv = document.getElementById('netFindView');
    if(cv) cv.style.display = _uiView==='create' ? 'flex' : 'none';
    if(fv) fv.style.display = _uiView==='find'   ? 'flex' : 'none';
    if(_uiView === 'create'){ applyVisUI(); applyMaxUI(); applySrcUI(); }
    else { applySrcUI(); }

    netApplyLang();
    if(typeof window.applyI18nDOM==='function') window.applyI18nDOM();
    $connect.style.display = 'flex';
    $room.style.display    = 'none';
    $lobby.style.display   = 'flex';

    // (Re)connect to the endpoint for the active source, then list rooms in Find.
    if(!ws || ws.readyState > 1 || _connectedUrl !== activeUrl()){
      _manualClose = false;
      if(ws){ try{ ws.close(); }catch(e){} }
      connect();
      if(_uiView === 'find') setTimeout(loadPublicRooms, 600);
    } else if(_uiView === 'find'){
      loadPublicRooms();
    }
  },
  close: leaveRoom,
  isActive(){ return window.netActive; },
};

// ── Util ─────────────────────────────────────────────────────────────────────
function sanitizeNick(s){
  return (s||'').replace(/[^A-Za-z0-9_ ]/g,'').trim().slice(0,16).toUpperCase() || 'PLAYER';
}

// ── Patch startAdv/startInf to apply network colour ──────────────────────────
setTimeout(() => {
  if(typeof drawPlayer !== 'function') return;
  const _origDrawPlayer = drawPlayer;
  window.drawPlayer = function(){
    // Guarantee the local robot always wears the colour the player picked. The
    // local player object can be re-created on level loads, so re-assert it every
    // frame in network mode (cheap) — this fixes "others see my colour but I don't".
    if(window.netActive && typeof player!=='undefined' && player && myColor && typeof myColor==='object'){
      player.colorScheme = myColor;
    }
    _origDrawPlayer();
    if(!window.netActive) return;
    interpolateGhosts();
    for(const [, entry] of window.netPlayers){
      if(entry.playerObj) drawOnePlayer(entry.playerObj);
    }
  };

  // Wrap startAdv
  if(typeof startAdv === 'function'){
    const _origStartAdv = startAdv;
    window.startAdv = function(n, f){
      _origStartAdv(n, f);
      if(window.netActive && typeof player !== 'undefined' && player){
        player.colorScheme = myColor;
        player.nickname    = myNick;
      }
    };
  }

  // Wrap startInf
  if(typeof startInf === 'function'){
    const _origStartInf = startInf;
    window.startInf = function(f){
      _origStartInf(f);
      if(window.netActive && typeof player !== 'undefined' && player){
        player.colorScheme = myColor;
        player.nickname    = myNick;
      }
    };
  }

  // Also patch drawBullets to show host bullets on non-host screens
  if(typeof drawBullets === 'function'){
    const _origDrawBullets = drawBullets;
    window.drawBullets = function(){
      _origDrawBullets();
      if(!window.netActive || isHost) return;
      const hb = window._netHostBullets || [];
      for(const b of hb){
        const cx=(b.x||0)+6, cy=(b.y||0)+4;
        ctx.fillStyle = b.col || '#0cf';
        ctx.beginPath();ctx.ellipse(cx,cy,8*.7,4*.5,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(cx,cy,4*.3,0,Math.PI*2);ctx.fill();
      }
    };
  }

  // Non-host: disable local enemy AI (host is authoritative)
  if(typeof updateEnemies === 'function'){
    const _origUpdateEnemies = updateEnemies;
    window.updateEnemies = function(){
      if(window.netActive && !isHost) return;
      _origUpdateEnemies();
    };
  }

  // Non-host: disable local boss AI (host is authoritative; state arrives via boss_sync)
  if(typeof updateBoss === 'function'){
    const _origUpdateBoss = updateBoss;
    window.updateBoss = function(){
      if(window.netActive && !isHost) return;
      _origUpdateBoss();
    };
  }

  // ── Guest damage redirect ───────────────────────────────────────────────────
  // On a guest, hp is owned by the host. When the guest's bullet/stomp hits an
  // enemy, report the hit to the host (which applies it and syncs hp back) and
  // suppress the local hp mutation so the two don't fight. Visual feedback (the
  // hit flash / particles) still comes back through enemies_sync.
  if(typeof hurtE === 'function'){
    const _origHurtE = hurtE;
    window.hurtE = function(e, dmg, stomped){
      if(window.netActive && !isHost){
        if(typeof enemies!=='undefined' && e){
          const idx = enemies.indexOf(e);
          if(idx>=0){
            // Determine element from the in-flight bullet context isn't available
            // here, so pass null; fire/ice status is applied host-side on its own
            // bullet collisions. Stomp/plain shots are the common case.
            window.netReportEnemyHit(idx, dmg, stomped, e._netHitElem||null);
          }
        }
        return; // host is authoritative — no local hp change
      }
      return _origHurtE(e, dmg, stomped);
    };
  }
  if(typeof damageBoss === 'function'){
    const _origDamageBoss = damageBoss;
    window.damageBoss = function(dmg){
      if(window.netActive && !isHost){
        window.netReportBossHit(dmg, (typeof boss!=='undefined'&&boss)?boss._netHitElem||null:null);
        return; // host authoritative
      }
      return _origDamageBoss(dmg);
    };
  }
}, 300);

})();
