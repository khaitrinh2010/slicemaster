// ============================================================
// Squidly API Integration — icons, gaze, firebase
// ============================================================

import { state, fruits, trail, TRAIL_LENGTH, slicedParts, juiceParticles } from './constants.js';
import { scene, camera } from './scene.js';
import { spawnJuice, spawnExplosion } from './particles.js';
import { createHalf } from './slicing.js';
import { fruitScores } from './fruits.js';
import { playSlice } from './music.js';
import { publishSlice } from './sync.js';

export const remoteTrail = [];

const squidly = window.SquidlyAPI || null;

// Callbacks set by game.js via initSquidly()
let _endGame = null;
let _updateScore = null;

export function initSquidly(deps) {
  _endGame = deps.endGame;
  _updateScore = deps.updateScore;
  initGazeListener();
  loadHighScore();
}

// ---- Gaze Listener (alternative slicing input) ----
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

function initGazeListener() {
  if (!squidly) return;

  squidly.addCursorListener((data) => {
    if (!state.gameRunning) return;

    if (data.source === 'remote') {
      remoteTrail.push({ x: data.x, y: data.y, time: performance.now() });
      while (remoteTrail.length > TRAIL_LENGTH) remoteTrail.shift();
      return;
    }

    const x = data.x;
    const y = data.y;

    if (state.gazePrevX !== null && state.gazePrevY !== null) {
      const dx = x - state.gazePrevX;
      const dy = y - state.gazePrevY;
      const speed = Math.sqrt(dx * dx + dy * dy);

      if (speed > 2) {
        state.gazeTrailActive = true;
        trail.push({ x, y, time: performance.now() });
        while (trail.length > TRAIL_LENGTH) trail.shift();

        pointerNDC.x = (x / window.innerWidth) * 2 - 1;
        pointerNDC.y = -(y / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        for (let i = fruits.length - 1; i >= 0; i--) {
          const fruit = fruits[i];
          if (fruit.userData.sliced) continue;
          const dist = raycaster.ray.distanceToPoint(fruit.position);

          if (dist < 1.8) {
            // BOMB CHECK (gaze)
            if (fruit.userData.isBomb) {
              fruit.userData.sliced = true;
              spawnExplosion(fruit.position.clone());
              publishSlice(fruit, 0, dx, dy);
              scene.remove(fruit);
              fruits.splice(i, 1);
              if (_endGame) _endGame(true);
              return;
            }

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
              const comboLabel = document.getElementById('combo-label');
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
      } else {
        state.gazeTrailActive = false;
      }
    }

    state.gazePrevX = x;
    state.gazePrevY = y;
  });
}

// ---- Firebase High Score ----
export function loadHighScore() {
  if (!squidly) return;
  squidly.firebaseOnValue("game/highScore", (val) => {
    if (val !== null && val !== undefined) {
      state.highScore = val;
    }
  });
}

export function saveHighScore() {
  if (!squidly) return;
  if (state.score > state.highScore) {
    state.highScore = state.score;
    squidly.firebaseSet("game/highScore", state.highScore);
  }
}
