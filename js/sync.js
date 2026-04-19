// ============================================================
// Squidly Multiplayer Sync — N-player
//
// Firebase paths (all under the app-sandboxed "appdata/" namespace):
//   game/running            number  0|1
//   game/gameOver           number  0|1|2
//   game/score              number
//   game/misses             number
//   game/spawn              string  "netId|type|x|y|vx|vy|vz|rx|ry|rz"
//   game/slices/<userId>    string  "ts|netId|pts|dx|dy"  (one channel per player)
//
// Host is authoritative for spawn, score, and misses.
// Every player publishes their own slices; all other players apply them.
// ============================================================

import { state, fruits, MAX_MISSES } from './constants.js';
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

let _isHost    = true;
let _myUserId  = null;

// Players whose slice channels we are already subscribed to
const _knownPlayers = new Set();
// Per-player dedup timestamp
const _lastSliceTs  = new Map();

// fruit netId registry (host assigns IDs sequentially)
let _netIdCounter = 1;
const _netFruits  = new Map();

// ---- Public API ----------------------------------------

export function initSync(deps) {
  _endGame      = deps.endGame;
  _updateScore  = deps.updateScore;
  _updateMisses = deps.updateMisses;
  _startGame    = deps.startGame;

  if (!squidly) return;

  // Learn our own userId and subscribe to all currently-known players
  squidly.addSessionInfoListener((info) => {
    _myUserId = info.user || 'host';
    _isHost   = _myUserId.startsWith('host');

    const players = info.players || [_myUserId];
    players.forEach(userId => _subscribeToPlayer(userId));
  });

  // Non-host auto-starts when host starts the game
  squidly.firebaseOnValue('game/running', (val) => {
    if (_isHost || !val) return;
    if (!state.gameRunning && _startGame) _startGame();
  });

  // Non-host receives fruit spawns from host
  squidly.firebaseOnValue('game/spawn', (val) => {
    if (!val || _isHost) return;
    _applyRemoteSpawn(val);
  });

  // Non-host mirrors score from host
  squidly.firebaseOnValue('game/score', (val) => {
    if (_isHost || val === null || val === undefined) return;
    state.score = val;
    if (_updateScore) _updateScore();
  });

  // Non-host mirrors miss count from host
  squidly.firebaseOnValue('game/misses', (val) => {
    if (_isHost || val === null || val === undefined) return;
    state.misses = val;
    if (_updateMisses) _updateMisses();
    if (state.misses >= MAX_MISSES && state.gameRunning) {
      if (_endGame) _endGame(false);
    }
  });

  // Non-host follows host game-over signal
  squidly.firebaseOnValue('game/gameOver', (val) => {
    if (_isHost || !val || !state.gameRunning) return;
    if (_endGame) _endGame(val === 2);
  });
}

/**
 * Subscribe to a player's slice channel (idempotent).
 * Called from initSync (via session info) and from squidly.js (via cursor events)
 * so that any newly-discovered player is immediately wired up.
 */
export function ensurePlayerSubscribed(userId) {
  if (!squidly || !userId) return;
  _subscribeToPlayer(userId);
}

export function getIsHost()       { return _isHost; }
export function getMyUserId()     { return _myUserId; }
export function getIsMultiplayer(){ return _knownPlayers.size > 1; }

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
    d.rotSpeedX.toFixed(4), d.rotSpeedY.toFixed(4), d.rotSpeedZ.toFixed(4)
  ].join('|');
  squidly.firebaseSet('game/spawn', data);
}

export function publishSlice(fruit, pts, dx, dy) {
  if (!squidly || !_myUserId) return;
  const netId = fruit.userData.netId;
  if (netId === undefined) return;
  const ts   = Date.now();
  const data = `${ts}|${netId}|${pts}|${dx.toFixed(2)}|${dy.toFixed(2)}`;
  squidly.firebaseSet(`game/slices/${_myUserId}`, data);
}

export function publishMiss() {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/misses', state.misses);
}

export function publishScore() {
  if (!squidly || !_isHost) return;
  squidly.firebaseSet('game/score', state.score);
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
  // Reset dedup timestamps so old events are not replayed on restart
  _lastSliceTs.forEach((_, userId) => _lastSliceTs.set(userId, 0));
}

// ---- Internal helpers ----------------------------------

function _subscribeToPlayer(userId) {
  if (_knownPlayers.has(userId)) return;
  _knownPlayers.add(userId);
  _lastSliceTs.set(userId, 0);

  squidly.firebaseOnValue(`game/slices/${userId}`, (val) => {
    // Firebase echoes our own writes back — skip them
    if (!val || userId === _myUserId) return;
    _applyRemoteSlice(val, userId);
  });
}

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

    fruit.position.set(x, y, 0);
    fruit.userData.netId     = netId;
    fruit.userData.vx        = vx;
    fruit.userData.vy        = vy;
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

function _applyRemoteSlice(val, fromUserId) {
  try {
    const p     = val.split('|');
    const ts    = parseInt(p[0]);
    const netId = parseInt(p[1]);
    const pts   = parseInt(p[2]);
    const dx    = parseFloat(p[3]);
    const dy    = parseFloat(p[4]);

    // Per-sender dedup
    const lastTs = _lastSliceTs.get(fromUserId) || 0;
    if (ts <= lastTs) return;
    _lastSliceTs.set(fromUserId, ts);

    const fruit = _netFruits.get(netId);
    if (!fruit || fruit.userData.sliced || fruit.userData.missed) return;

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

    // Host is score-authoritative
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
