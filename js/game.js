// ============================================================
// Fruit Ninja 3D — Main Entry Point
// ============================================================

import {
  GRAVITY, MAX_MISSES, SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX,
  FRUIT_TYPES, BOMB_CHANCE, MIN_SPAWN_DIST,
  SLOWMO_DURATION, SLOWMO_TIME_SCALE, SLOWMO_POINTER_SCALE, SCORE_MILESTONE,
  state, fruits, slicedParts, juiceParticles, explosionParts
} from './constants.js';

import { scene, camera, renderer } from './scene.js';
import { spawnJuice, updateJuiceParticles, spawnExplosion, updateExplosionParticles } from './particles.js';
import { fruitBuilders, fruitScores } from './fruits.js';
import { createBomb } from './bombs.js';
import { createHalf } from './slicing.js';
import { initInput, resizeTrailCanvas, drawTrail } from './input.js';
import { initSquidly, saveHighScore } from './squidly.js';
import {
  initSync, getIsHost, resetSync,
  assignNetId, registerFruit, publishSpawn,
  publishScore, publishMiss, publishGameStart, publishGameOver, publishStartRequest, publishMute
} from './sync.js';
import { startMusic, stopMusic, playBackgroundMusic, stopBackgroundMusic, toggleMute, getMuted } from './music.js';
import { modelsReady } from './models.js';

// ---- DOM ----
const scoreLabel = document.getElementById('score-label');
const comboLabel = document.getElementById('combo-labyel');
const missLabel = document.getElementById('miss-label');
const menuMain = document.getElementById('menu-main');
const menuGameover = document.getElementById('menu-gameover');
const finalScoreEl = document.getElementById('final-score');
const slowmoNode = document.getElementById('slowmo');
const slowmoBarNode = document.getElementById('slowmo-bar');

// ---- Spawn Fruit ----
function getWorldXForScreenFrac(frac, y = -2, z = 0) {
  // frac: 0=left, 0.5=center, 1=right
  const ndcX = frac * 2 - 1;
  const ndcY = 1 - ((y + 2) / 4) * 2; // y=-2 maps to NDC y=1 (top), y=2 to NDC y=-1 (bottom)
  const vec = new THREE.Vector3(ndcX, 0, 0.5); // y=0 for horizontal, z=0.5 for perspective
  vec.unproject(camera);
  return vec.x;
}

function spawnFruit() {
  const isBomb = false;
  let fruit;

  if (isBomb) {
    fruit = createBomb();
  } else {
    const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
    fruit = fruitBuilders[type]();
  }

  const isSlowmo = state.slowmoRemaining > 0;
  const MIN_X_DIST = isSlowmo ? MIN_SPAWN_DIST * 4.5 : MIN_SPAWN_DIST * 1.6;
  const MIN_Y_DIST = isSlowmo ? 3.5 : 2.0;
  const MAX_ATTEMPTS = isSlowmo ? 80 : 30;

  // Pick position and velocity together so trajectory checks stay consistent
  function pickParams() {
    const side = Math.floor(Math.random() * 3);
    const y = -2 + Math.random() * 0.4;
    const leftX   = getWorldXForScreenFrac(0.08, y);
    const rightX  = getWorldXForScreenFrac(0.92, y);
    const centerX = getWorldXForScreenFrac(0.5,  y);
    let x, nvx;
    if (side === 0)      { x = leftX  + Math.random() * 0.7; nvx =  2.5 + Math.random() * 1.5; }
    else if (side === 2) { x = rightX - Math.random() * 0.7; nvx = -2.5 - Math.random() * 1.5; }
    else                 { x = centerX + (Math.random() - 0.5) * 1.5; nvx = (Math.random() - 0.5) * 2; }
    return { x, y, vx: nvx, vy: 13 + Math.random() * 5, vz: (Math.random() - 0.5) * 2 };
  }

  // Reject if any time-slice of the new trajectory is too close to an existing fruit.
  // Both fruits experience the same gravity so the halfGt² terms cancel in the Y check,
  // leaving relative motion driven only by initial positions and velocities.
  function wouldOverlap(nx, ny, nvx, nvy) {
    return fruits.some(f => {
      if (f.position.y < -3) return false;
      const fvx = f.userData.vx || 0;
      const fvy = f.userData.vy || 0;
      for (const t of [0, 0.35, 0.7]) {
        const halfGt2 = 0.5 * GRAVITY * t * t;
        if (
          Math.abs((f.position.x + fvx * t) - (nx + nvx * t)) < MIN_X_DIST &&
          Math.abs((f.position.y + fvy * t + halfGt2) - (ny + nvy * t + halfGt2)) < MIN_Y_DIST
        ) return true;
      }
      return false;
    });
  }

  // During slow-mo, avoid scoreboard area (left 20% of screen)
  const forbiddenLeft  = getWorldXForScreenFrac(0.00);
  const forbiddenRight = getWorldXForScreenFrac(0.20);

  let p = pickParams();
  for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
    const inForbidden = isSlowmo && p.x > forbiddenLeft && p.x < forbiddenRight;
    if (!inForbidden && !wouldOverlap(p.x, p.y, p.vx, p.vy)) break;
    p = pickParams();
  }

  fruit.position.set(p.x, p.y, 0);
  fruit.userData.vx = p.vx;
  fruit.userData.vy = p.vy;
  fruit.userData.vz = p.vz;
  fruit.userData.rotSpeedX = (Math.random() - 0.5) * 4;
  fruit.userData.rotSpeedY = (Math.random() - 0.5) * 4;
  fruit.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
  fruit.userData.sliced = false;
  fruit.userData.missed = false;
  fruit.userData.scored = false;

  assignNetId(fruit);
  scene.add(fruit);
  fruits.push(fruit);
  registerFruit(fruit);
  publishSpawn(fruit);
}

// ---- Slow-Mo HUD ----
function renderSlowmoStatus(pct) {
  slowmoNode.style.opacity = pct === 0 ? 0 : 1;
  slowmoBarNode.style.transform = `scaleX(${pct.toFixed(3)})`;
}

// ---- Score / HUD ----
function updateScore() {
  scoreLabel.textContent = 'Score: ' + state.score;
  publishScore();

  const currentMilestone = Math.floor(state.score / SCORE_MILESTONE) * SCORE_MILESTONE;
  if (currentMilestone > state.lastMilestone && currentMilestone > 0) {
    state.lastMilestone = currentMilestone;
    if (state.slowmoCooldown <= 0 && state.slowmoRemaining <= 0) {
      state.slowmoRemaining = SLOWMO_DURATION;
      state.slowmoCooldown = 8000;
    }
  }
}

function updateMisses() {
  const xs = '❌'.repeat(state.misses) + '⭕'.repeat(MAX_MISSES - state.misses);
  missLabel.textContent = xs;
  publishMiss();
}

// ---- Game Flow ----
function startGame() {
  state.score = 0;
  state.misses = 0;
  state.comboCount = 0;
  state.comboTimer = 0;
  state.spawnTimer = 0;
  state.nextSpawnDelay = 1200;
  state.slowmoRemaining = 0;
  state.slowmoCooldown = 0;
  state.gameSpeed = 1;
  state.lastMilestone = 0;
  state.gameRunning = true;

  resetSync();
  publishStartRequest();
  publishGameStart();

  playBackgroundMusic(); // Start background music
  startMusic(); // Start main music

  fruits.forEach(f => scene.remove(f));
  fruits.length = 0;
  slicedParts.forEach(f => scene.remove(f));
  slicedParts.length = 0;
  juiceParticles.forEach(p => scene.remove(p));
  juiceParticles.length = 0;
  explosionParts.forEach(p => scene.remove(p));
  explosionParts.length = 0;

  updateScore();
  updateMisses();

  menuMain.classList.add('hidden');
  menuGameover.classList.add('hidden');

  state.gazePrevX = null;
  state.gazePrevY = null;

  state.clock = new THREE.Clock();
  state.clock.start();
}

function endGame(bombDeath) {
  state.gameRunning = false;
  publishGameOver(bombDeath);
  stopBackgroundMusic(); // Stop background music
  stopMusic();
  saveHighScore();
  const hsText = state.highScore > 0 ? ` | Best: ${state.highScore}` : '';
  finalScoreEl.textContent = 'Score: ' + state.score + hsText;
  const goTitle = menuGameover.querySelector('h1');
  goTitle.textContent = bombDeath ? '\ud83d\udca3 BOOM!' : 'Game Over';
  menuGameover.classList.remove('hidden');
}

// ---- Menu Handler ----
function menuHandler() {
  menuGameover.classList.add('hidden');
  menuMain.classList.remove('hidden');
  fruits.forEach(f => scene.remove(f));
  fruits.length = 0;
  slicedParts.forEach(f => scene.remove(f));
  slicedParts.length = 0;
  juiceParticles.forEach(p => scene.remove(p));
  juiceParticles.length = 0;
}

// ---- Button Handlers ----
const squidlyApi = window.SquidlyAPI || null;
const btnMute = document.getElementById('btn-mute');
btnMute.textContent = getMuted() ? '🔇' : '🔊';
btnMute.addEventListener('click', () => {
  const muted = toggleMute();
  btnMute.textContent = muted ? '🔇' : '🔊';
  publishMute(muted);
});
window.addEventListener('mute-state-changed', () => {
  btnMute.textContent = getMuted() ? '🔇' : '🔊';
});

const btnRestart = document.getElementById('btn-restart');
const btnMenu = document.getElementById('btn-menu');
const btnStart = document.getElementById('btn-start');


btnRestart.addEventListener('click', startGame);
if (btnRestart.parentElement && btnRestart.parentElement.tagName === 'ACCESS-BUTTON') {
  btnRestart.parentElement.addEventListener('access-click', startGame);
}

btnMenu.addEventListener('click', menuHandler);
if (btnMenu.parentElement && btnMenu.parentElement.tagName === 'ACCESS-BUTTON') {
  btnMenu.parentElement.addEventListener('access-click', menuHandler);
}

// Main menu START GAME button handler
if (btnStart) {
  btnStart.addEventListener('click', startGame);
  if (btnStart.parentElement && btnStart.parentElement.tagName === 'ACCESS-BUTTON') {
    btnStart.parentElement.addEventListener('access-click', startGame);
  }
}

// ---- Resize ----
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeTrailCanvas();
}
window.addEventListener('resize', onResize);

// ---- Enable clipping ----
renderer.localClippingEnabled = true;

// ---- Initialize subsystems ----
initInput({ endGame, updateScore });
initSquidly({ endGame, updateScore });
initSync({ endGame, updateScore, updateMisses, startGame, modelsReady });

// ---- Main Loop ----
function animate() {
  requestAnimationFrame(animate);

  const rawDt = state.clock ? Math.min(state.clock.getDelta(), 0.05) : 0.016;
  const rawDtMs = rawDt * 1000;

  // Slow-mo system
  let targetSpeed = 1;
  if (state.slowmoRemaining > 0) {
    state.slowmoRemaining -= rawDtMs;
    if (state.slowmoRemaining < 0) state.slowmoRemaining = 0;
    targetSpeed = state.pointerDown ? SLOWMO_POINTER_SCALE : SLOWMO_TIME_SCALE;
  } else if (state.slowmoCooldown > 0) {
    state.slowmoCooldown -= rawDtMs;
    if (state.slowmoCooldown < 0) state.slowmoCooldown = 0;
  }
  const lag = rawDt * 60;
  state.gameSpeed += (targetSpeed - state.gameSpeed) / 22 * lag;
  state.gameSpeed = Math.max(0, Math.min(1, state.gameSpeed));

  renderSlowmoStatus(state.slowmoRemaining / SLOWMO_DURATION);

  const dt = rawDt * state.gameSpeed;

  if (state.gameRunning) {
    // Spawn — only the host spawns fruits; participant receives them via Firebase
    const isSlowmo = state.slowmoRemaining > 0;
    if (getIsHost()) {
      const spawnMultiplier = isSlowmo ? 2.5 : 1;
      state.spawnTimer += rawDtMs * spawnMultiplier;
      if (state.spawnTimer >= state.nextSpawnDelay) {
        state.spawnTimer = 0;
        state.nextSpawnDelay = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
        const count = isSlowmo ? (Math.random() < 0.3 ? 2 : 1) : (Math.random() < 0.10 ? 2 : 1);
        const stagger = isSlowmo ? 700 : 150;
        for (let c = 0; c < count; c++) {
          setTimeout(() => { if (state.gameRunning) spawnFruit(); }, c * stagger);
        }
      }
    }

    // Combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboCount = 0;
        comboLabel.style.opacity = '0';
      }
    }

    // Update fruits
    for (let i = fruits.length - 1; i >= 0; i--) {
      const f = fruits[i];
      f.position.x += f.userData.vx * dt;
      f.position.y += f.userData.vy * dt;
      f.position.z += f.userData.vz * dt;
      f.userData.vy += GRAVITY * dt;

      f.rotation.x += f.userData.rotSpeedX * dt;
      f.rotation.y += f.userData.rotSpeedY * dt;
      f.rotation.z += f.userData.rotSpeedZ * dt;

      if (f.position.y < -4 && f.userData.vy < 0) {
        if (!f.userData.sliced && !f.userData.missed && !f.userData.isBomb) {
          f.userData.missed = true;
          if (getIsHost()) {
            state.misses++;
            updateMisses();
            if (state.misses >= MAX_MISSES) {
              endGame();
            }
          }
        }
        scene.remove(f);
        fruits.splice(i, 1);
      }
    }

    // Update sliced halves
    for (let i = slicedParts.length - 1; i >= 0; i--) {
      const h = slicedParts[i];
      h.position.x += h.userData.vx * dt;
      h.position.y += h.userData.vy * dt;
      h.position.z += (h.userData.vz || 0) * dt;
      h.userData.vy += GRAVITY * dt;
      h.rotation.x += (h.userData.rotSpeedX || 0) * dt;
      h.rotation.y += (h.userData.rotSpeedY || 0) * dt;
      h.rotation.z += (h.userData.rotSpeedZ || 0) * dt;
      h.userData.life -= dt * 0.4;

      // Cache mesh list on first update to avoid traverse() every frame
      if (!h.userData._meshes) {
        h.userData._meshes = [];
        h.traverse(child => {
          if (child.isMesh) {
            child.material.transparent = true;
            h.userData._meshes.push(child);
          }
        });
      }
      const opacity = Math.max(0, h.userData.life);
      for (let m = 0; m < h.userData._meshes.length; m++) {
        h.userData._meshes[m].material.opacity = opacity;
      }

      if (h.userData.life <= 0 || h.position.y < -10) {
        scene.remove(h);
        slicedParts.splice(i, 1);
      }
    }

    // Update juice particles
    updateJuiceParticles(dt);

    // Update explosion particles
    updateExplosionParticles(rawDt);
  }

  drawTrail();
  renderer.render(scene, camera);
}

state.clock = new THREE.Clock();
animate();
