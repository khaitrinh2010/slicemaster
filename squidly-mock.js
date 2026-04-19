// ============================================================
// Squidly API Mock — for local testing only
// Remove this script tag before deploying to the real Squidly platform
//
// N-player testing: open multiple browser tabs on the same local server.
//   Tab 1 (no params or ?role=host)  → HOST
//   Tab 2+ (?role=participant)        → each gets a unique participant ID
//
// Firebase writes are shared across all tabs via BroadcastChannel.
// Cursor (mouse) events are also broadcast so every tab sees every player's cursor.
// ============================================================
(function () {
  'use strict';

  if (window.SquidlyAPI) return; // real API present, skip mock

  // ---- Stable per-tab identity --------------------------------
  // Each tab keeps a random ID in sessionStorage so refreshes stay
  // consistent but new tabs get a fresh ID.
  const _tabId = sessionStorage.getItem('squidly-tab-id') || (() => {
    const id = Math.random().toString(36).slice(2, 7);
    sessionStorage.setItem('squidly-tab-id', id);
    return id;
  })();

  const urlRole = new URLSearchParams(location.search).get('role');
  const isHost  = !urlRole || urlRole === 'host';
  // userId matches the format the real Squidly platform uses
  const _myUserId = isHost ? 'host-mouse' : `participant-${_tabId}-mouse`;

  // ---- BroadcastChannel for cross-tab sync --------------------
  const BC_CHANNEL = 'squidly-mock-db';
  let bc = null;
  try { bc = new BroadcastChannel(BC_CHANNEL); } catch (_) {}

  // ---- Shared in-memory Firebase store ------------------------
  const db          = {};
  const dbListeners = {};          // path -> [callbacks]
  const cursorListeners   = [];
  const sessionListeners  = [];

  // Track all players currently known to this tab
  const _knownPlayers = new Set([_myUserId]);

  function _fireDbListeners(path, value) {
    (dbListeners[path] || []).forEach(cb => cb(value));
  }

  function _fireSessionListeners() {
    const info = {
      user: _myUserId,
      participantActive: _knownPlayers.size > 1,
      players: [..._knownPlayers],
    };
    sessionListeners.forEach(cb => cb(info));
  }

  // ---- Cross-tab messaging ------------------------------------
  if (bc) {
    bc.onmessage = (evt) => {
      const { type, path, value, userId, x, y } = evt.data || {};

      if (type === 'db-set') {
        db[path] = value;
        _fireDbListeners(path, value);

      } else if (type === 'player-joined') {
        if (!_knownPlayers.has(userId)) {
          _knownPlayers.add(userId);
          _fireSessionListeners();
          // Announce back so the new tab discovers us too
          bc.postMessage({ type: 'player-joined', userId: _myUserId });
        }

      } else if (type === 'player-left') {
        if (_knownPlayers.has(userId) && userId !== _myUserId) {
          _knownPlayers.delete(userId);
          _fireSessionListeners();
        }

      } else if (type === 'cursor') {
        // Deliver remote players' cursor events to listeners on this tab
        cursorListeners.forEach(cb => cb({ user: userId, x, y, source: 'remote' }));
      }
    };
  }

  // Announce our presence to any already-open tabs
  if (bc) bc.postMessage({ type: 'player-joined', userId: _myUserId });

  // Clean up on tab close so other tabs can remove us from the player list
  window.addEventListener('beforeunload', () => {
    if (bc) bc.postMessage({ type: 'player-left', userId: _myUserId });
  });

  // ---- Overlay UI (icon buttons) ------------------------------
  const icons = {};
  let overlay = null;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'squidly-mock-overlay';
    overlay.style.cssText = `
      position:fixed;bottom:0;right:0;z-index:9999;
      display:flex;flex-wrap:wrap;gap:6px;padding:10px;
      background:rgba(0,0,0,0.7);border-radius:12px 0 0 0;
      pointer-events:auto;max-width:340px;
    `;
    const roleColor = isHost ? '#88ddff' : '#ffaa44';
    const label = document.createElement('div');
    label.id = 'squidly-mock-label';
    label.style.cssText = `width:100%;color:${roleColor};font-size:11px;font-family:sans-serif;text-align:center;opacity:0.9;`;
    label.textContent = `🦑 Squidly Mock [${_myUserId}] — players: ${[..._knownPlayers].join(', ')}`;
    overlay.appendChild(label);
    document.body.appendChild(overlay);

    // Update label whenever players change
    sessionListeners.push(() => {
      const lbl = document.getElementById('squidly-mock-label');
      if (lbl) lbl.textContent = `🦑 Squidly Mock [${_myUserId}] — players: ${[..._knownPlayers].join(', ')}`;
    });
  }

  function renderIcons() {
    if (!overlay) createOverlay();
    overlay.querySelectorAll('.squidly-mock-icon').forEach(el => el.remove());

    Object.entries(icons)
      .sort((a, b) => a[1].x * 100 + a[1].y - (b[1].x * 100 + b[1].y))
      .forEach(([, icon]) => {
        if (icon.options.hidden) return;
        const btn = document.createElement('button');
        btn.className = 'squidly-mock-icon';
        btn.style.cssText = `
          padding:8px 14px;border:none;border-radius:8px;cursor:pointer;
          font-size:13px;font-weight:bold;font-family:sans-serif;color:#fff;
          transition:transform 0.1s,opacity 0.1s;
          ${icon.options.disabled ? 'opacity:0.4;pointer-events:none;' : ''}
          ${icon.options.type === 'action'     ? 'background:linear-gradient(135deg,#e8272c,#ff6b35);' :
            icon.options.type === 'normal'     ? 'background:linear-gradient(135deg,#2255cc,#3388ff);' :
            icon.options.type === 'lightGreen' ? 'background:linear-gradient(135deg,#22aa44,#44dd66);' :
            'background:rgba(255,255,255,0.2);'}
        `;
        const sym = icon.options.symbol;
        const symbolText = typeof sym === 'object' ? '🖼' :
          sym === 'play_arrow' ? '▶' : sym === 'replay' ? '🔄' :
          sym === 'home' ? '🏠' : sym === 'add' ? '➕' :
          sym === 'close' ? '✖' : sym || '?';
        btn.textContent = `${symbolText} ${icon.options.displayValue || ''}`;
        btn.addEventListener('click', () => { if (icon.callback) icon.callback({ type: 'click' }); });
        overlay.appendChild(btn);
      });
  }

  // ---- SquidlyAPI implementation ------------------------------
  let idCounter = 0;
  let gazeOnlyMode = false;

  window.SquidlyAPI = {
    // --- Icons ---
    setIcon(x, y, options, callback) {
      const key = 'icon_' + (++idCounter);
      icons[key] = { x, y, options, callback };
      renderIcons();
      return key;
    },
    removeIcon(key) { delete icons[key]; renderIcons(); },
    setGridSize() {},

    // --- Firebase ---
    firebaseSet(path, value) {
      db[path] = value;
      console.log(`[Squidly Mock:${_myUserId}] firebaseSet("${path}",`, value, ')');
      _fireDbListeners(path, value);
      if (bc) bc.postMessage({ type: 'db-set', path, value });
    },
    firebaseOnValue(path, callback) {
      if (!dbListeners[path]) dbListeners[path] = [];
      dbListeners[path].push(callback);
      callback(path in db ? db[path] : null);
    },

    // --- Cursor ---
    addCursorListener(callback) { cursorListeners.push(callback); },

    // --- Settings ---
    setSettings(path, value) { console.log(`[Squidly Mock] setSettings("${path}",`, value, ')'); },
    getSettings(path, callback) { callback(null); },
    addSettingsListener() {},

    // --- Session ---
    addSessionInfoListener(callback) {
      sessionListeners.push(callback);
      callback({
        user: _myUserId,
        participantActive: _knownPlayers.size > 1,
        players: [..._knownPlayers],
      });
    },
  };

  // ---- Local mouse → cursor listeners + cross-tab broadcast ---
  window.addEventListener('mousemove', (e) => {
    cursorListeners.forEach(cb => cb({ user: _myUserId, x: e.clientX, y: e.clientY, source: 'local' }));
    if (bc) bc.postMessage({ type: 'cursor', userId: _myUserId, x: e.clientX, y: e.clientY });
  });

  // ---- Keyboard shortcuts ------------------------------------
  window.addEventListener('keydown', (e) => {
    // G — toggle gaze-only mode
    if (e.key === 'g' || e.key === 'G') {
      gazeOnlyMode = !gazeOnlyMode;
      console.log(gazeOnlyMode ? '[Squidly Mock] GAZE-ONLY ON' : '[Squidly Mock] GAZE-ONLY OFF');
    }
  });

  window.__squidlyMockGazeOnly = () => gazeOnlyMode;

  console.log(`[Squidly Mock] Loaded as ${_myUserId} — open more tabs with ?role=participant for N-player testing`);
})();
