# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Start the local dev server (required due to ES module CORS restrictions):

```bash
python server.py
```

Then open `http://localhost:5500` in a browser. There is no build step — the game runs directly from source.

## Multiplayer Local Testing

The real Squidly platform injects `window.SquidlyAPI` automatically. For local testing without the platform, you need to supply your own mock that implements the same interface (see Squidly API section below). The old `squidly-mock.js` file has been removed — recreate it if needed.

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
| `js/squidly.js` | Integration with the real Squidly platform API: gaze cursor slicing, remote blade trail, Firebase high score persistence. Exports `remoteTrail` array consumed by `input.js`. |
| `js/sync.js` | Two-player multiplayer sync over Firebase. Host is authoritative for spawning, scoring, and misses. Participant receives spawns and mirrors state. Slice events carry position so halves spawn at the correct location on both screens. |
| `js/music.js` | Background music and slice sound effect management. |

### Key design patterns

- **Shared mutable state**: `constants.js` exports a single `state` object imported by all modules. This is intentional — changes to `state.score` in `input.js` are immediately visible in `game.js`.
- **Host authority**: In multiplayer, only the host spawns fruits and increments the miss counter. The participant receives spawns via Firebase and mirrors score/misses from host writes. Both players can slice; slices are published to Firebase and applied on the other side.
- **Fruit `userData`**: Every fruit mesh stores physics (`vx`, `vy`, `vz`, `rotSpeedX/Y/Z`), game state (`sliced`, `missed`, `scored`, `isBomb`, `fruitName`), visual properties (`juiceColor`, `fruitColor`, `fruitRadius`), and multiplayer ID (`netId`) on `mesh.userData`.
- **GLTF fallback**: Fruit builders check `models.*Model` before using GLTF. If the model hasn't loaded yet (or failed), they fall back to procedural Three.js geometry so the game always works.

## Squidly API Reference

`window.SquidlyAPI` is injected by the Squidly platform at runtime. It is `null`/undefined when running locally without a mock. All code that touches it must guard with `if (!squidly) return`.

### Firebase (Realtime Database)

All paths are automatically sandboxed under `appdata/` — use relative paths like `"game/score"`.  
**Values must be primitives** (string, number, boolean). Max 5 KB per value.

```js
SquidlyAPI.firebaseSet(path, value)        // write
SquidlyAPI.firebaseOnValue(path, callback) // persistent listener; fires on every change
```

### Icon Buttons

The icon overlay uses a **4×5 grid** by default (rows × cols). **Position (0, 0) is reserved for the platform's Exit button — never call `setIcon(0, 0, ...)`.**

```js
const key = SquidlyAPI.setIcon(row, col, { symbol, displayValue, type }, callback);
// type: "action" (red) | "normal" (blue) | "white" | "lightGreen"
// symbol: string name (e.g. "play_arrow") or { url: "path/to/img.png" }
SquidlyAPI.removeIcon(key);
SquidlyAPI.setGridSize(rows, cols); // override default 4×5
```

Use `<access-button access-group="g" access-order="1">` to wrap custom HTML buttons. Listen with `"access-click"` (not `"click"`) for dwell/switch-control compatibility.

### Cursor / Gaze

```js
SquidlyAPI.addCursorListener((data) => {
  // data.user   : "host-mouse" | "host-eyes" | "participant-mouse" | "participant-eyes"
  // data.x, data.y : screen coordinates relative to app viewport
  // data.source : "local" | "remote"
});
```

`source === "local"` → this device's cursor/gaze (use for slicing).  
`source === "remote"` → other player's cursor (display only; slices arrive via Firebase).

### Session Info

```js
SquidlyAPI.addSessionInfoListener((info) => {
  // info.user             : same values as cursor data.user
  // info.participantActive: boolean — true when a participant is connected
});
```

`info.user.startsWith("host")` → this device is the host.

### Settings

```js
SquidlyAPI.setSettings(path, value)
SquidlyAPI.getSettings(path, callback)        // one-time read
SquidlyAPI.addSettingsListener(path, callback) // persistent
// Common paths: "host/access/dwellTime", "host/volume/level", "participant/cursors/cursorSize"
```

### Deployment

Contact the Squidly team to register the app. The app must be hosted at a reachable domain URL. No `squidly-mock.js` is needed in production.
