// ============================================================
// Particles — juice splashes and explosion debris
// ============================================================

import { scene, camera } from './scene.js';
import { GRAVITY, juiceParticles, explosionParts } from './constants.js';

const particleGeo = new THREE.SphereGeometry(0.18, 4, 4);
const explosionGeo = new THREE.SphereGeometry(0.2, 4, 4);

// Reuse particle meshes instead of creating new materials every slice
const _juicePool = [];
function _getJuiceParticle() {
  if (_juicePool.length > 0) return _juicePool.pop();
  return new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ transparent: true }));
}

export function spawnJuice(position, color, count) {
  for (let i = 0; i < count; i++) {
    const p = _getJuiceParticle();
    p.material.color.set(color);
    p.material.opacity = 0.9;
    p.position.copy(position);
    p.scale.setScalar(0.5 + Math.random() * 1.0);
    const speed = 3 + Math.random() * 5;
    const angle = Math.random() * Math.PI * 2;
    const upAngle = Math.random() * Math.PI * 0.6 + 0.2;
    p.userData.vx = Math.cos(angle) * Math.sin(upAngle) * speed;
    p.userData.vy = Math.cos(upAngle) * speed * 0.5 + Math.random() * 3;
    p.userData.vz = Math.sin(angle) * Math.sin(upAngle) * speed;
    p.userData.life = 1.0;
    p.userData.decay = 0.6 + Math.random() * 0.8;
    scene.add(p);
    juiceParticles.push(p);
  }
}

export function spawnSliceBurst(position, color, count = 16) {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;inset:0;z-index:90;pointer-events:none;
    background:radial-gradient(circle at 50% 50%, rgba(255,255,255,0.28), rgba(255,244,190,0.12), rgba(255,180,80,0.04), transparent 74%);
    animation: sliceBurstFlash 0.4s ease-out forwards;
  `;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 450);

  if (!document.getElementById('slice-burst-style')) {
    const style = document.createElement('style');
    style.id = 'slice-burst-style';
    style.textContent = `
      @keyframes sliceBurstFlash {
        0% { opacity: 0.9; transform: scale(0.8); }
        100% { opacity: 0; transform: scale(1.18); }
      }
    `;
    document.head.appendChild(style);
  }

  const base = new THREE.Color(color || 0xfff3b0);
  const accentA = base.clone().offsetHSL(0.04, 0.15, 0.2);
  const accentB = base.clone().offsetHSL(-0.05, 0.2, 0.25);
  const accentC = new THREE.Color(0xffffff);
  const accents = [base, accentA, accentB, accentC];

  for (let i = 0; i < count; i++) {
    const pick = accents[Math.floor(Math.random() * accents.length)];
    const mat = new THREE.MeshBasicMaterial({
      color: pick,
      transparent: true,
      opacity: 0.92
    });
    const p = new THREE.Mesh(explosionGeo, mat);
    p.position.copy(position);
    p.scale.setScalar(0.12 + Math.random() * 0.16);

    const speed = 1.8 + Math.random() * 3.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.65;
    p.userData.vx = Math.sin(phi) * Math.cos(theta) * speed;
    p.userData.vy = Math.cos(phi) * speed * 0.7 + 1.0;
    p.userData.vz = Math.sin(theta) * speed * 0.2;
    p.userData.life = 0.28 + Math.random() * 0.16;
    p.userData.decay = 1.4 + Math.random() * 0.35;
    p.userData.isSliceBurst = true;

    scene.add(p);
    explosionParts.push(p);
  }

  const ringGeo = new THREE.RingGeometry(0.03, 0.22, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff5c2,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  ring.lookAt(camera.position);
  ring.userData.vx = 0;
  ring.userData.vy = 0;
  ring.userData.vz = 0;
  ring.userData.life = 0.22;
  ring.userData.decay = 1.9;
  ring.userData.isRing = true;
  ring.userData.isSliceBurst = true;
  scene.add(ring);
  explosionParts.push(ring);
}

export function spawnExplosion(position) {
  // Screen flash
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;inset:0;z-index:100;pointer-events:none;
    background:radial-gradient(circle at 50% 50%, rgba(255,200,50,0.9), rgba(255,80,0,0.6), transparent 70%);
    animation: bombFlash 0.6s ease-out forwards;
  `;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 700);

  if (!document.getElementById('bomb-flash-style')) {
    const style = document.createElement('style');
    style.id = 'bomb-flash-style';
    style.textContent = `
      @keyframes bombFlash {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.5); }
      }
      @keyframes bombShake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
        20%, 40%, 60%, 80% { transform: translateX(8px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.style.animation = 'bombShake 0.4s ease-out';
  setTimeout(() => { document.body.style.animation = ''; }, 450);

  // 3D explosion particles
  const fireColors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0x222222];
  for (let i = 0; i < 25; i++) {
    const color = fireColors[Math.floor(Math.random() * fireColors.length)];
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1.0
    });
    const p = new THREE.Mesh(explosionGeo, mat);
    p.position.copy(position);
    p.scale.setScalar(0.5 + Math.random() * 1.5);

    const speed = 5 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    p.userData.vx = Math.sin(phi) * Math.cos(theta) * speed;
    p.userData.vy = Math.sin(phi) * Math.sin(theta) * speed * 0.7 + 3;
    p.userData.vz = Math.cos(phi) * speed * 0.5;
    p.userData.life = 0.8 + Math.random() * 0.6;
    p.userData.decay = 0.8 + Math.random() * 0.5;

    scene.add(p);
    explosionParts.push(p);
  }

  // Expanding fireball ring
  const ringGeo = new THREE.RingGeometry(0.1, 0.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  ring.lookAt(camera.position);
  ring.userData.vx = 0;
  ring.userData.vy = 0;
  ring.userData.vz = 0;
  ring.userData.life = 0.5;
  ring.userData.decay = 1.0;
  ring.userData.isRing = true;
  scene.add(ring);
  explosionParts.push(ring);
}

export function updateJuiceParticles(dt) {
  for (let i = juiceParticles.length - 1; i >= 0; i--) {
    const p = juiceParticles[i];
    p.position.x += p.userData.vx * dt;
    p.position.y += p.userData.vy * dt;
    p.position.z += p.userData.vz * dt;
    p.userData.vy += GRAVITY * 0.7 * dt;
    p.userData.life -= dt * p.userData.decay;
    p.material.opacity = Math.max(0, p.userData.life);

    if (p.userData.life <= 0) {
      scene.remove(p);
      juiceParticles.splice(i, 1);
      _juicePool.push(p);
    }
  }
}

export function updateExplosionParticles(rawDt) {
  for (let i = explosionParts.length - 1; i >= 0; i--) {
    const p = explosionParts[i];
    p.position.x += p.userData.vx * rawDt;
    p.position.y += p.userData.vy * rawDt;
    p.position.z += (p.userData.vz || 0) * rawDt;
    p.userData.vy += GRAVITY * 0.4 * rawDt;
    p.userData.life -= rawDt * p.userData.decay;
    p.material.opacity = Math.max(0, p.userData.life);

    if (p.userData.isRing) {
      const ringLife = p.userData.isSliceBurst ? 0.25 : 0.5;
      const s = 1 + (1 - p.userData.life / ringLife) * (p.userData.isSliceBurst ? 3.5 : 8);
      p.scale.setScalar(s);
    }

    if (p.userData.life <= 0) {
      scene.remove(p);
      explosionParts.splice(i, 1);
    }
  }
}
