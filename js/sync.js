// ============================================================
// Squidly Multiplayer Sync — two-channel (host / participant)
//
// Firebase paths (under app-sandboxed "appdata/" namespace):
//   game/running          number  0|1
//   game/gameOver         number  0|1|2
//   game/score            number
//   game/misses           number
//   game/spawn            string  "netId|type|x|y|vx|vy|vz|rx|ry|rz"
//   game/hostSlice        string  "ts|netId|pts|dx|dy"
//   game/participantSlice string  "ts|netId|pts|dx|dy"
//
// Host is authoritative for spawn, score, misses, and game flow.
// Host slices → game/hostSlice → participant applies.
// Participant slices → game/participantSlice → host applies (and adds pts).
// ============================================================

import { state, fruits, MAX_MISSES, GRAVITY } from './constants.js';
import { scene } from './scene.js';
import { fruitBuilders } from './fruits.js';
import { createBomb } from './bombs.js';
import { createHalf } from './slicing.js';
import { spawnJuice, spawnExplosion } from './particles.js';
import { playSlice } from './music.js';

const squidly = window.SquidlyAPI || null;

let _endGame      = null;
let _updateScore  = null;
let _updateMisses = null;
let _startGame    = null;
let _modelsReady  = Promise.resolve(); // replaced by initSync if models.js is available

// Role is unknown until addSessionInfoListener fires.
// Use null so we can detect "not yet known" vs a confirmed role.
let _isHost = null;

let _netIdCounter = 1;
const _netFruits  = new Map();
let _lastHostSliceTs        = 0;
let _lastParticipantSliceTs = 0;

// ---- Public API -------------------------------------------

export function initSync(deps) {
  _endGame      = deps.endGame;
  _updateScore  = deps.updateScore;
  _updateMisses = deps.updateMisses;
  _startGame    = deps.startGame;
  if (deps.modelsReady) _modelsReady = deps.modelsReady;

  if (!squidly) return;

  // Cache latest Firebase values so we can replay them once role is confirmed
  let _cachedRunning  = null;
  let _cachedScore    = null;
  let _cachedMisses   = null;
  let _cachedGameOver = null;

  function _onRoleKnown() {
    if (_isHost) return;
    // Wait for all GLTFs before replaying cached state so the participant never
    // sees fallback geometry or a black background on join
    _modelsReady.then(() => {
      if (_cachedRunning && !state.gameRunning && _startGame) _startGame();
      if (_cachedScore    !== null) { state.score  = _cachedScore;  if (_updateScore)  _updateScore();  }
      if (_cachedMisses   !== null) { state.misses = _cachedMisses; if (_updateMisses) _updateMisses(); }
      if (_cachedGameOver && !state.gameRunning && _endGame) _endGame(_cachedGameOver === 2);
    });
  }

  squidly.addSessionInfoListener((info) => {
    const user = (info && info.user) || 'host';
    // "host", "host-mouse", "host-eyes" → host. Anything else → participant.
    _isHost = String(user).startsWith('host');
    _onRoleKnown();
  });

  // Non-host auto-starts when host starts (gated on models being ready)
  squidly.firebaseOnValue('game/running', (val) => {
    _cachedRunning = val;
    if (_isHost === null || _isHost || !val) return;
    _modelsReady.then(() => {
      if (!state.gameRunning && _startGame) _startGame();
    });
  });

  // Either player can request a game start
  squidly.firebaseOnValue('game/startRequest', (val) => {
    if (!val || state.gameRunning) return;
    _modelsReady.then(() => {
      if (!state.gameRunning && _startGame) _startGame();
    });
  });

  // Non-host receives fruit spawns from host
  squidly.firebaseOnValue('game/spawn', (val) => {
    if (!val || _isHost === null || _isHost) return;
    _applyRemoteSpawn(val);
  });

  // Host receives participant slices
  squidly.firebaseOnValue('game/participantSlice', (val) => {
    if (!val || _isHost === null || !_isHost) return;
    _applyRemoteSlice(val, 'participant');
  });

  // Participant receives host slices
  squidly.firebaseOnValue('game/hostSlice', (val) => {
    if (!val || _isHost === null || _isHost) return;
    _applyRemoteSlice(val, 'host');
  });

  // Non-host mirrors score
  squidly.firebaseOnValue('game/score', (val) => {
    if (val === null || val === undefined) return;
    _cachedScore = val;
    if (_isHost === null || _isHost) return;
    state.score = val;
    if (_updateScore) _updateScore();
  });

  // Non-host mirrors miss count
  squidly.firebaseOnValue('game/misses', (val) => {
    if (val === null || val === undefined) return;
    _cachedMisses = val;
    if (_isHost === null || _isHost) return;
    state.misses = val;
    if (_updateMisses) _updateMisses();
    if (state.misses >= MAX_MISSES && state.gameRunning && _endGame) {
      _endGame(false);
    }
  });

  // Non-host follows host game-over signal
  squidly.firebaseOnValue('game/gameOver', (val) => {
    _cachedGameOver = val;
    if (_isHost === null || _isHost || !val || !state.gameRunning) return;
    if (_endGame) _endGame(val === 2);
  });
}

// null = role not yet known → treat as host so spawning isn't blocked on host device
export function getIsHost() { return _isHost !== false; }

export function assignNetId(fruit) {
  fruit.userData.netId = _netIdCounter++;
}

export function registerFruit(fruit) {
  const id = fruit.userData.netId;
  if (id !== undefined) _netFruits.set(id, fruit);
}

export function publishSpawn(fruit) {
  if (!squidly || !_isHost) return;
  const d = fruit.userData;
  const p = fruit.position;
  const type = d.isBomb ? 'bomb' : d.fruitName;
  const data = [
    d.netId, type,
    p.x.toFixed(4), p.y.toFixed(4),
    d.vx.toFixed(4), d.vy.toFixed(4), d.vz.toFixed(4),
    d.rotSpeedX.toFixed(4), d.rotSpeedY.toFixed(4), d.rotSpeedZ.toFixed(4),
    Date.now()
  ].join('|');
  squidly.firebaseSet('game/spawn', data);
}

export function publishSlice(fruit, pts, dx, dy) {
  if (!squidly) return;
  const netId = fruit.userData.netId;
  if (netId === undefined) return;
  const ts  = Date.now();
  const pos = fruit.position;
  const data = `${ts}|${netId}|${pts}|${dx.toFixed(2)}|${dy.toFixed(2)}|${pos.x.toFixed(3)}|${pos.y.toFixed(3)}`;
  const path = _isHost ? 'game/hostSlice' : 'game/participantSlice';
  squidly.firebaseSet(path, data);
}

export function publishMiss() {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/misses', state.misses);
}

export function publishScore() {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/score', state.score);
}

export function publishStartRequest() {
  if (!squidly) return;
  squidly.firebaseSet('game/startRequest', Date.now());
}

export function publishGameStart() {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/score',    0);
  squidly.firebaseSet('game/misses',   0);
  squidly.firebaseSet('game/gameOver', 0);
  squidly.firebaseSet('game/running',  1);
}

export function publishGameOver(bombDeath) {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/running',  0);
  squidly.firebaseSet('game/gameOver', bombDeath ? 2 : 1);
}

export function resetSync() {
  _netFruits.clear();
  _netIdCounter = 1;
  _lastHostSliceTs = 0;
  _lastParticipantSliceTs = 0;
}

// ---- Internal helpers -------------------------------------

function _applyRemoteSpawn(val) {
  try {
    const p     = val.split('|');
    const netId = parseInt(p[0]);
    const type  = p[1];
    const x  = parseFloat(p[2]);
    const y  = parseFloat(p[3]);
    const vx = parseFloat(p[4]);
    const vy = parseFloat(p[5]);
    const vz = parseFloat(p[6]);
    const rx = parseFloat(p[7]);
    const ry = parseFloat(p[8]);
    const rz = parseFloat(p[9]);
    const spawnTs = p.length > 10 ? parseInt(p[10]) : 0;

    if (_netFruits.has(netId)) return;

    let fruit;
    if (type === 'bomb') {
      fruit = createBomb();
    } else if (fruitBuilders[type]) {
      fruit = fruitBuilders[type]();
    } else {
      console.warn('[Sync] Unknown fruit type:', type);
      return;
    }

    // Fast-forward physics to compensate for Firebase latency
    const elapsed = spawnTs ? Math.min((Date.now() - spawnTs) / 1000, 1.5) : 0;
    const fx = x + vx * elapsed;
    const fy = y + vy * elapsed + 0.5 * GRAVITY * elapsed * elapsed;

    fruit.position.set(fx, fy, 0);
    fruit.userData.netId     = netId;
    fruit.userData.vx        = vx;
    fruit.userData.vy        = vy + GRAVITY * elapsed;
    fruit.userData.vz        = vz;
    fruit.userData.rotSpeedX = rx;
    fruit.userData.rotSpeedY = ry;
    fruit.userData.rotSpeedZ = rz;
    fruit.userData.sliced    = false;
    fruit.userData.missed    = false;
    fruit.userData.scored    = false;

    scene.add(fruit);
    fruits.push(fruit);
    _netFruits.set(netId, fruit);
  } catch (e) {
    console.warn('[Sync] Failed to apply remote spawn:', e);
  }
}

function _applyRemoteSlice(val, from) {
  try {
    const p     = val.split('|');
    const ts    = parseInt(p[0]);
    const netId = parseInt(p[1]);
    const pts   = parseInt(p[2]);
    const dx    = parseFloat(p[3]);
    const dy    = parseFloat(p[4]);
    const px    = p.length > 5 ? parseFloat(p[5]) : NaN;
    const py    = p.length > 6 ? parseFloat(p[6]) : NaN;

    if (from === 'host') {
      if (ts <= _lastHostSliceTs) return;
      _lastHostSliceTs = ts;
    } else {
      if (ts <= _lastParticipantSliceTs) return;
      _lastParticipantSliceTs = ts;
    }

    const fruit = _netFruits.get(netId);
    if (!fruit || fruit.userData.sliced || fruit.userData.missed) return;

    // Snap to sender's exact position so halves/juice appear at the right spot
    if (!isNaN(px) && !isNaN(py)) {
      fruit.position.x = px;
      fruit.position.y = py;
    }

    if (fruit.userData.isBomb) {
      fruit.userData.sliced = true;
      spawnExplosion(fruit.position.clone());
      scene.remove(fruit);
      const idx = fruits.indexOf(fruit);
      if (idx !== -1) fruits.splice(idx, 1);
      _netFruits.delete(netId);
      if (_endGame) _endGame(true);
      return;
    }

    playSlice();
    fruit.userData.sliced = true;

    // Host is score-authoritative — add pts on host when applying participant slice
    if (_isHost) {
      state.score += pts;
      if (_updateScore) _updateScore();
    }

    const sliceDir = dx > 0 ? 1 : -1;
    createHalf(fruit, sliceDir, dx, dy);
    createHalf(fruit, -sliceDir, dx, dy);
    spawnJuice(fruit.position, fruit.userData.juiceColor, 20);
    spawnJuice(fruit.position, fruit.userData.fruitColor, 10);

    scene.remove(fruit);
    const idx = fruits.indexOf(fruit);
    if (idx !== -1) fruits.splice(idx, 1);
    _netFruits.delete(netId);
  } catch (e) {
    console.warn('[Sync] Failed to apply remote slice:', e);
  }
}
