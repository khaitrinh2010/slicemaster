// ============================================================
// Constants & Shared State
// ============================================================

export const GRAVITY = -12;
export const MAX_MISSES = 5;
export const SPAWN_INTERVAL_MIN = 1400;
export const SPAWN_INTERVAL_MAX = 3000;
export const FRUIT_TYPES = ['watermelon', 'orange'];
export const BOMB_CHANCE = 0.15;
export const MIN_SPAWN_DIST = 2.5;

// Slow-Mo
export const SLOWMO_DURATION = 1500;
export const SLOWMO_COOLDOWN = 8000;
export const SLOWMO_TIME_SCALE = 0.3;
export const SLOWMO_POINTER_SCALE = 0.075;
export const SCORE_MILESTONE = 50;

// Shared mutable game state — imported by reference
export const state = {
  score: 0,
  misses: 0,
  comboCount: 0,
  comboTimer: 0,
  gameRunning: false,
  spawnTimer: 0,
  nextSpawnDelay: 1000,
  clock: null,
  slowmoRemaining: 0,
  slowmoCooldown: 0,
  gameSpeed: 1,
  lastMilestone: 0,
  pointerDown: false,
  pointerX: 0,
  pointerY: 0,
  lastPointerX: 0,
  lastPointerY: 0,
  highScore: 0,
  gazePrevX: null,
  gazePrevY: null,
  gazeTrailActive: false,
};

// Shared arrays
export const fruits = [];
export const slicedParts = [];
export const juiceParticles = [];
export const explosionParts = [];
export const trail = [];
export const TRAIL_LENGTH = 12;
