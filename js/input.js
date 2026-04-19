// ============================================================
// Input — pointer/swipe handlers, blade trail, keyboard
// ============================================================

import { state, fruits, trail, TRAIL_LENGTH, SLOWMO_DURATION } from './constants.js';
import { scene, camera } from './scene.js';
import { spawnJuice, spawnExplosion } from './particles.js';
import { createHalf } from './slicing.js';
import { fruitScores } from './fruits.js';
import { playSlice } from './music.js';
import { publishSlice } from './sync.js';

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// Callbacks set by game.js via initInput()
let _endGame = null;
let _updateScore = null;

// DOM
const trailCanvas = document.getElementById('trail-canvas');
const trailCtx = trailCanvas.getContext('2d');
const comboLabel = document.getElementById('combo-label');

export function initInput(deps) {
  _endGame = deps.endGame;
  _updateScore = deps.updateScore;

  window.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchstart', e => { e.preventDefault(); onPointerDown(e.touches[0]); }, { passive: false });
  window.addEventListener('touchmove', e => { e.preventDefault(); onPointerMove(e.touches[0]); }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  // S key toggles slow-mo
  window.addEventListener('keydown', e => {
    if (e.key === 's' || e.key === 'S') {
      if (!state.gameRunning) return;
      if (state.slowmoRemaining > 0) {
        state.slowmoRemaining = 0;
      } else {
        state.slowmoRemaining = SLOWMO_DURATION;
      }
    }
  });

  resizeTrailCanvas();
}

// ---- Pointer / Swipe ----
function onPointerDown(e) {
  if (!state.gameRunning) return;
  if (window.__squidlyMockGazeOnly && window.__squidlyMockGazeOnly()) return;
  const x = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
  const y = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
  state.pointerDown = true;
  state.pointerX = x;
  state.pointerY = y;
  state.lastPointerX = x;
  state.lastPointerY = y;
  trail.length = 0;
  trail.push({ x, y, time: performance.now() });
}

function onPointerMove(e) {
  if (!state.pointerDown || !state.gameRunning) return;
  if (window.__squidlyMockGazeOnly && window.__squidlyMockGazeOnly()) return;
  const x = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
  const y = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
  state.lastPointerX = state.pointerX;
  state.lastPointerY = state.pointerY;
  state.pointerX = x;
  state.pointerY = y;

  trail.push({ x, y, time: performance.now() });
  while (trail.length > TRAIL_LENGTH) trail.shift();

  const dx = state.pointerX - state.lastPointerX;
  const dy = state.pointerY - state.lastPointerY;
  const speed = Math.sqrt(dx * dx + dy * dy);
  if (speed < 3) return;

  pointerNDC.x = (x / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(y / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    if (fruit.userData.sliced) continue;

    const dist = raycaster.ray.distanceToPoint(fruit.position);

    if (dist < 1.8) {
      // BOMB CHECK
      if (fruit.userData.isBomb) {
        fruit.userData.sliced = true;
        spawnExplosion(fruit.position.clone());
        publishSlice(fruit, 0, dx, dy);
        scene.remove(fruit);
        fruits.splice(i, 1);
        if (_endGame) _endGame(true);
        return;
      }

      // SLICED!
      playSlice();
      fruit.userData.sliced = true;
      const name = fruit.userData.fruitName;
      const pts = fruitScores[name] || 10;
      const scoreBefore = state.score;
      state.score += pts;

      state.comboCount++;
      state.comboTimer = 0.5;
      if (state.comboCount >= 3) {
        const comboBonus = state.comboCount * 5;
        state.score += comboBonus;
        comboLabel.textContent = `🔥 ${state.comboCount}x COMBO! +${comboBonus}`;
        comboLabel.style.opacity = '1';
      }
      if (_updateScore) _updateScore();

      publishSlice(fruit, state.score - scoreBefore, dx, dy);

      const sliceDir = dx > 0 ? 1 : -1;
      createHalf(fruit, sliceDir, dx, dy);
      createHalf(fruit, -sliceDir, dx, dy);

      spawnJuice(fruit.position, fruit.userData.juiceColor, 20);
      spawnJuice(fruit.position, fruit.userData.fruitColor, 10);

      scene.remove(fruit);
      fruits.splice(i, 1);
    }
  }
}

function onPointerUp() {
  state.pointerDown = false;
  trail.length = 0;
}

// ---- Blade Trail ----
export function resizeTrailCanvas() {
  trailCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  trailCanvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  trailCanvas.style.width = window.innerWidth + 'px';
  trailCanvas.style.height = window.innerHeight + 'px';
  trailCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
}

export function drawTrail() {
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  if (trail.length < 2) return;

  const now = performance.now();
  trailCtx.lineCap = 'round';
  trailCtx.lineJoin = 'round';

  // REPLACE the two drawing loops in drawTrail() with this:

  for (let i = 1; i < trail.length; i++) {
    const age = (now - trail[i].time) / 150;
    const agePrev = (now - trail[i - 1].time) / 150;
    if (age > 1 || agePrev > 1) continue; // skip if EITHER point is stale
    const alpha = (1 - age) * 0.8;
    const width = (1 - age) * 6 + 1;
    trailCtx.strokeStyle = `rgba(200,230,255,${alpha.toFixed(2)})`;
    trailCtx.lineWidth = width;
    trailCtx.beginPath();
    trailCtx.moveTo(trail[i - 1].x, trail[i - 1].y);
    trailCtx.lineTo(trail[i].x, trail[i].y);
    trailCtx.stroke();
  }

  // Glow layer
  for (let i = 1; i < trail.length; i++) {
    const age = (now - trail[i].time) / 150;
    const agePrev = (now - trail[i - 1].time) / 150;
    if (age > 1 || agePrev > 1) continue; // same fix here
    const alpha = (1 - age) * 0.3;
    const width = (1 - age) * 16 + 4;
    trailCtx.strokeStyle = `rgba(150,200,255,${alpha.toFixed(2)})`;
    trailCtx.lineWidth = width;
    trailCtx.beginPath();
    trailCtx.moveTo(trail[i - 1].x, trail[i - 1].y);
    trailCtx.lineTo(trail[i].x, trail[i].y);
    trailCtx.stroke();
  }
}
