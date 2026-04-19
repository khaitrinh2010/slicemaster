# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Start the local dev server (required due to ES module CORS restrictions):

```bash
python server.py
```

Then open `http://localhost:5500` in a browser. There is no build step — the game runs directly from source.

## Multiplayer Local Testing

`squidly-mock.js` simulates the Squidly platform API locally using `BroadcastChannel` for cross-tab Firebase sync.

- **Tab 1** (host): `http://localhost:5500`
- **Tab 2** (participant): `http://localhost:5500/?role=participant`

Mock keyboard shortcuts while testing:
- `P` — toggle host/participant role within a single tab
- `G` — toggle gaze-only slicing mode (mouse movement drives the gaze cursor)

**Important:** Remove the `<script src="squidly-mock.js">` tag in `index.html` before deploying to the real Squidly platform.

## Architecture

The game is a 3D Fruit Ninja clone built on Three.js (loaded from CDN). All JS is written as ES modules under `js/`.

### Module responsibilities

| File | Role |
|---|---|
| `js/game.js` | Entry point. Owns the `requestAnimationFrame` loop, fruit spawning logic, slow-mo system, HUD updates, and game flow (start/end). |
| `js/constants.js` | All tunable constants plus the single shared mutable `state` object and shared arrays (`fruits`, `slicedParts`, `juiceParticles`, `explosionParts`, `trail`). Import by reference — mutations in one module are visible everywhere. |
| `js/scene.js` | Three.js scene, camera, renderer, lighting, environment map setup. |
| `js/fruits.js` | Geometry builders (`createWatermelon`, `createOrange`, etc.) and `fruitScores` map. Builders fall back to procedural geometry when GLTF models aren't loaded yet. |
| `js/models.js` | Async GLTF model loading for all `.glb` files in `3d_model/`. |
| `js/bombs.js` | Bomb mesh creation. |
| `js/slicing.js` | `createHalf()` — generates a clipped half-fruit mesh after a slice event. |
| `js/particles.js` | Juice splash and explosion particle systems. |
| `js/input.js` | Mouse/touch pointer handling, blade trail drawing on `#trail-canvas`, and hit-detection against `fruits[]`. |
| `js/squidly.js` | Integration with the real Squidly platform API: gaze cursor slicing, Firebase high score persistence. |
| `js/sync.js` | Two-player multiplayer sync over Firebase. Host is authoritative for spawning, scoring, and misses. Participant receives spawns and mirrors state. Slice events are published in both directions and deduplicated by timestamp. |
| `js/music.js` | Background music and slice sound effect management. |
| `squidly-mock.js` | Local-only Squidly API mock. Implements `window.SquidlyAPI` with an in-memory Firebase store synced across tabs via `BroadcastChannel`. |

### Key design patterns

- **Shared mutable state**: `constants.js` exports a single `state` object imported by all modules. This is intentional — changes to `state.score` in `input.js` are immediately visible in `game.js`.
- **Host authority**: In multiplayer, only the host spawns fruits and increments the miss counter. The participant receives spawns via Firebase and mirrors score/misses from host writes. Both players can slice; slices are published to Firebase and applied on the other side.
- **Fruit `userData`**: Every fruit mesh stores physics (`vx`, `vy`, `vz`, `rotSpeedX/Y/Z`), game state (`sliced`, `missed`, `scored`, `isBomb`, `fruitName`), visual properties (`juiceColor`, `fruitColor`, `fruitRadius`), and multiplayer ID (`netId`) on `mesh.userData`.
- **GLTF fallback**: Fruit builders check `models.*Model` before using GLTF. If the model hasn't loaded yet (or failed), they fall back to procedural Three.js geometry so the game always works.
