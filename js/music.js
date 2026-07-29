// ============================================================
// Background Music
// ============================================================

const music = new Audio('music.mp3');
music.loop = true;
music.volume = 0.22;

let musicStarted = false;

export function startMusic() {
  if (!musicStarted) {
    music.play().catch(() => {});
    musicStarted = true;
  }
}

export function stopMusic() {
  music.pause();
  music.currentTime = 0;
  musicStarted = false;
}

// Background music (secondary, lower volume)
const backgroundMusic = new Audio('background_music.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.1; // softer than main music
let backgroundMusicStarted = false;

export function playBackgroundMusic() {
  if (!backgroundMusicStarted) {
    backgroundMusic.play().catch(() => {});
    backgroundMusicStarted = true;
  }
}

export function stopBackgroundMusic() {
  backgroundMusic.pause();
  backgroundMusic.currentTime = 0;
  backgroundMusicStarted = false;
}

let _muted = false;

function emitMuteState() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mute-state-changed', {
      detail: { muted: _muted }
    }));
  }
}

function applyMuteState(val) {
  _muted = !!val;
  music.muted = _muted;
  backgroundMusic.muted = _muted;
  if (masterGain) masterGain.gain.value = _muted ? 0 : 1;
  emitMuteState();
}

export function toggleMute() {
  applyMuteState(!_muted);
  return _muted;
}
export function setMute(val) {
  applyMuteState(val);
}
export function getMuted() { return _muted; }

// Slice sound effect — uses Web Audio API for extra-loud playback
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SLICE_GAIN = 0.8; // quieter slice impact
let masterGain = null;

if (audioCtx) {
  masterGain = audioCtx.createGain();
  masterGain.gain.value = _muted ? 0 : 1;
  masterGain.connect(audioCtx.destination);
}

let sliceBuffer = null;
fetch('slice.wav')
  .then(r => r.arrayBuffer())
  .then(buf => audioCtx.decodeAudioData(buf))
  .then(decoded => { sliceBuffer = decoded; })
  .catch(() => {});

export function playSlice() {
  if (!sliceBuffer || _muted) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const source = audioCtx.createBufferSource();
  source.buffer = sliceBuffer;
  const gain = audioCtx.createGain();
  gain.gain.value = SLICE_GAIN;
  source.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  source.start(0);
}
