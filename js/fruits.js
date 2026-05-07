// ============================================================
// Fruit Geometry Builders
// ============================================================

import { envMap } from './scene.js';
import * as models from './models.js';

export function createApple() {
  const group = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const angle = t * Math.PI;
    let r = Math.sin(angle) * 0.7;
    if (t > 0.4 && t < 0.8) r *= 1.05;
    if (t < 0.15) r *= 0.5 + t * 3.0;
    if (t > 0.9) r *= 1 - (t - 0.9) * 5;
    pts.push(new THREE.Vector2(r, t * 1.2 - 0.6));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 36);

  const colors = [];
  const posAttr = bodyGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const normalizedY = (y + 0.6) / 1.2;
    let r = 0.78, g = 0.06, b = 0.04;
    if (normalizedY > 0.7) {
      const blend = (normalizedY - 0.7) / 0.3;
      r = r * (1 - blend * 0.6) + 0.45 * blend * 0.6;
      g = g * (1 - blend * 0.6) + 0.55 * blend * 0.6;
      b = b * (1 - blend * 0.4) + 0.12 * blend * 0.4;
    }
    const angle = Math.atan2(z, x);
    const streak = Math.sin(angle * 5) * 0.06;
    r = Math.min(1, Math.max(0, r + streak));
    if (normalizedY > 0.35 && normalizedY < 0.65) {
      r = Math.min(1, r + 0.05);
    }
    colors.push(r, g, b);
  }
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.25, metalness: 0.0,
    clearcoat: 0.7, clearcoatRoughness: 0.15,
    envMap: envMap, envMapIntensity: 0.5,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  
  group.add(body);

  const stemGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.32, 8);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a2e12, roughness: 0.9 });
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = 0.6;
  stem.rotation.z = 0.18;
  group.add(stem);

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.05, 0.1, 0.18, 0.16, 0.28, 0.02);
  leafShape.bezierCurveTo(0.18, 0.08, 0.06, -0.02, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape);
  const leafMat = new THREE.MeshPhysicalMaterial({
    color: 0x2d8c2d, roughness: 0.4, side: THREE.DoubleSide, clearcoat: 0.3,
  });
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set(0.06, 0.68, 0);
  leaf.rotation.z = -0.35;
  group.add(leaf);

  group.userData.juiceColor = 0xffeeee;
  group.userData.fruitColor = 0xcc1111;
  group.userData.fleshColor = 0xfff9c4;
  group.userData.skinColor = 0xcc1111;
  group.userData.seedColor = 0x5d4037;
  group.userData.fruitRadius = 0.95;
  group.userData.fruitName = 'apple';
  group.scale.setScalar(3.78);
  return group;
}

export function createOrange() {
  const group = new THREE.Group();

  if (models.orangeWholeModel) {
    const model = models.orangeWholeModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.2 / maxDim);
    group.add(wrapper);
  } else {
    const bodyGeo = new THREE.SphereGeometry(0.65, 36, 28);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xff8c00, roughness: 0.55, clearcoat: 0.2,
      envMap: envMap, envMapIntensity: 0.25,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xffcc44;
  group.userData.fruitColor = 0xff8c00;
  group.userData.fleshColor = 0xffa726;
  group.userData.skinColor = 0xff8c00;
  group.userData.seedColor = 0xffffff;
  group.userData.fruitRadius = 0.88;
  group.userData.fruitName = 'orange';
  group.scale.setScalar(3.78);
  return group;
}

export function createBanana() {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, -0.3, 0),
    new THREE.Vector3(-0.2, 0.1, 0.05),
    new THREE.Vector3(0.15, 0.35, 0.05),
    new THREE.Vector3(0.5, 0.5, 0)
  ]);
  const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.18, 14, false);

  const colors = [];
  const tubePos = tubeGeo.attributes.position;
  const segments = 28;
  const radialSegs = 14;
  for (let i = 0; i < tubePos.count; i++) {
    const segIndex = Math.floor(i / (radialSegs + 1));
    const t = segIndex / segments;
    let r = 1.0, g = 0.87, b = 0.0;
    if (t < 0.12) {
      const blend = (0.12 - t) / 0.12;
      r -= blend * 0.35; g += blend * 0.05; b += blend * 0.02;
    }
    if (t > 0.88) {
      const blend = (t - 0.88) / 0.12;
      r -= blend * 0.25; g -= blend * 0.1; b += blend * 0.02;
    }
    const px = tubePos.getX(i), py = tubePos.getY(i), pz = tubePos.getZ(i);
    const spotNoise = Math.sin(px * 50 + py * 30) * Math.cos(pz * 40 + px * 20);
    if (spotNoise > 0.7) {
      const spotStrength = (spotNoise - 0.7) / 0.3 * 0.3;
      r = Math.max(0, r - spotStrength * 0.3);
      g = Math.max(0, g - spotStrength * 0.4);
      b = Math.max(0, b);
    }
    const angle = Math.atan2(pz, py) || 0;
    const ridge = Math.abs(Math.sin(angle * 2.5)) * 0.04;
    r = Math.min(1, r + ridge);
    g = Math.min(1, g + ridge * 0.5);
    colors.push(r, g, b);
  }
  tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.35, metalness: 0.0,
    clearcoat: 0.3, clearcoatRoughness: 0.3,
    envMap: envMap, envMapIntensity: 0.3,
  });
  const body = new THREE.Mesh(tubeGeo, bodyMat);
  
  group.add(body);

  const capGeo = new THREE.SphereGeometry(0.18, 10, 10);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8a7a30, roughness: 0.6 });
  const cap1 = new THREE.Mesh(capGeo, capMat);
  cap1.position.copy(curve.getPoint(0));
  cap1.scale.set(0.8, 0.8, 0.8);
  group.add(cap1);

  const capMat2 = new THREE.MeshStandardMaterial({ color: 0x5a4a1a, roughness: 0.7 });
  const cap2 = new THREE.Mesh(capGeo, capMat2);
  cap2.position.copy(curve.getPoint(1));
  cap2.scale.set(0.6, 0.6, 0.6);
  group.add(cap2);

  const stemGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.15, 6);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a3a15, roughness: 0.9 });
  const stem = new THREE.Mesh(stemGeo, stemMat);
  const endPoint = curve.getPoint(1);
  stem.position.set(endPoint.x + 0.08, endPoint.y + 0.07, endPoint.z);
  group.add(stem);

  group.userData.juiceColor = 0xffffaa;
  group.userData.fruitColor = 0xffdd00;
  group.userData.fleshColor = 0xfff8e1;
  group.userData.skinColor = 0xffdd00;
  group.userData.seedColor = null;
  group.userData.fruitRadius = 0.6;
  group.userData.fruitName = 'banana';
  group.scale.setScalar(3.78);
  return group;
}

export function createWatermelon() {
  const group = new THREE.Group();

  if (models.watermelonModel) {
    const model = models.watermelonModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.2 / maxDim);
    group.add(wrapper);
  } else {
    const bodyGeo = new THREE.SphereGeometry(0.75, 40, 28);
    const posAttr = bodyGeo.attributes.position;
    const colors = [];
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const angle = Math.atan2(z, x);
      const stripeVal = Math.sin(angle * 8);
      let r = 0.22, g = 0.55, b = 0.22;
      if (stripeVal > 0) {
        const intensity = Math.pow(stripeVal, 0.6);
        r -= intensity * 0.07; g -= intensity * 0.12; b -= intensity * 0.07;
      } else {
        const li = Math.pow(-stripeVal, 0.8) * 0.4;
        r += li * 0.15; g += li * 0.18; b += li * 0.05;
      }
      colors.push(Math.min(1, r), Math.min(1, g), Math.min(1, Math.max(0, b)));
    }
    bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const bodyMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.4, clearcoat: 0.35,
      envMap: envMap, envMapIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 0.85, 0.9);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xff6666;
  group.userData.fruitColor = 0xcc2222;
  group.userData.fleshColor = 0xe53935;
  group.userData.skinColor = 0x2d7a2d;
  group.userData.seedColor = 0x1b1b1b;
  group.userData.fruitRadius = 1.0;
  group.userData.fruitName = 'watermelon';
  group.scale.setScalar(5.4);
  return group;
}

export function createDragonFruit() {
  const group = new THREE.Group();

  if (models.dragonFruitModel) {
    const model = models.dragonFruitModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const desiredSize = 1.2;
      wrapper.scale.setScalar(desiredSize / maxDim);
    }
    group.add(wrapper);
  } else {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const angle = t * Math.PI;
      let r = Math.sin(angle) * 0.52;
      if (t < 0.3) r *= 0.7 + t * 1.0;
      if (t > 0.85) r *= 1 - (t - 0.85) * 3;
      pts.push(new THREE.Vector2(r, t * 1.4 - 0.7));
    }
    const bodyGeo = new THREE.LatheGeometry(pts, 28);

    const posAttr = bodyGeo.attributes.position;
    const colors = [];
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const normalizedY = (y + 0.7) / 1.4;
      let cr = 0.87, cg = 0.12, cb = 0.35;
      if (normalizedY > 0.75) {
        const blend = (normalizedY - 0.75) / 0.25;
        cr -= blend * 0.15; cg -= blend * 0.04; cb += blend * 0.08;
      }
      if (normalizedY < 0.15) {
        const blend = (0.15 - normalizedY) / 0.15;
        cr += blend * 0.1; cg += blend * 0.12; cb -= blend * 0.1;
      }
      const angle = Math.atan2(z, x);
      const scalePattern = Math.sin(angle * 6 + normalizedY * 8) * 0.06;
      cr = Math.min(1, Math.max(0, cr + scalePattern));
      colors.push(cr, cg, cb);
    }
    bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const bodyMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.35, metalness: 0.0,
      clearcoat: 0.4, clearcoatRoughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    
    group.add(body);

    const petalRows = [
      { y: 0.45, count: 5, size: 0.28, tilt: 0.7, color: 0x44cc55 },
      { y: 0.20, count: 6, size: 0.24, tilt: 0.5, color: 0xdd2870 },
      { y: -0.05, count: 7, size: 0.22, tilt: 0.35, color: 0xee3388 },
      { y: -0.25, count: 6, size: 0.18, tilt: 0.25, color: 0xcc2266 },
    ];

    for (const row of petalRows) {
      for (let i = 0; i < row.count; i++) {
        const theta = (i / row.count) * Math.PI * 2 + row.y;
        const petalShape = new THREE.Shape();
        petalShape.moveTo(0, 0);
        petalShape.bezierCurveTo(-0.06, row.size * 0.4, -0.04, row.size * 0.8, 0, row.size);
        petalShape.bezierCurveTo(0.04, row.size * 0.8, 0.06, row.size * 0.4, 0, 0);
        const petalGeo = new THREE.ShapeGeometry(petalShape);
        const petalMat = new THREE.MeshStandardMaterial({
          color: row.color, roughness: 0.4, side: THREE.DoubleSide,
        });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        const bodyT = (row.y + 0.7) / 1.4;
        const bodyAngle = bodyT * Math.PI;
        let bodyR = Math.sin(bodyAngle) * 0.52;
        if (bodyT < 0.3) bodyR *= 0.7 + bodyT * 1.0;
        petal.position.set(Math.cos(theta) * bodyR, row.y, Math.sin(theta) * bodyR);
        petal.lookAt(Math.cos(theta) * (bodyR + 1), row.y + row.tilt, Math.sin(theta) * (bodyR + 1));
        
        group.add(petal);
      }
    }

    const tipGeo = new THREE.ConeGeometry(0.06, 0.12, 6);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x55cc55, roughness: 0.5 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.68;
    group.add(tip);
  }

  group.userData.juiceColor = 0xff66aa;
  group.userData.fruitColor = 0xdd2266;
  group.userData.fleshColor = 0xffffff;
  group.userData.skinColor = 0xdd2266;
  group.userData.seedColor = 0x222222;
  group.userData.fruitRadius = 0.8;
  group.userData.fruitName = 'dragonfruit';
  group.scale.setScalar(4.73);
  return group;
}

export function createPapaya() {
  const group = new THREE.Group();

  if (models.papayaWholeModel) {
    const model = models.papayaWholeModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.4 / maxDim);
    group.add(wrapper);
  } else {
    // Fallback — elongated papaya shape
    const bodyGeo = new THREE.SphereGeometry(0.55, 32, 24);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xff9933, roughness: 0.45, clearcoat: 0.3,
      envMap: envMap, envMapIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.85, 1.35, 0.85);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xff8855;
  group.userData.fruitColor = 0xff7733;
  group.userData.fleshColor = 0xff6b3d;
  group.userData.skinColor = 0xff9933;
  group.userData.seedColor = 0x111111;
  group.userData.fruitRadius = 0.9;
  group.userData.fruitName = 'papaya';
  group.scale.setScalar(4.05);
  return group;
}

export function createMango() {
  const group = new THREE.Group();

  if (models.mangoWholeModel) {
    const model = models.mangoWholeModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.3 / maxDim);
    group.add(wrapper);
  } else {
    const bodyGeo = new THREE.SphereGeometry(0.55, 32, 24);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc233, roughness: 0.4, clearcoat: 0.35,
      envMap: envMap, envMapIntensity: 0.35,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.9, 1.25, 0.85);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xffdd66;
  group.userData.fruitColor = 0xffa726;
  group.userData.fleshColor = 0xffb74d;
  group.userData.skinColor = 0xffc233;
  group.userData.seedColor = 0xc78a2a;
  group.userData.fruitRadius = 0.85;
  group.userData.fruitName = 'mango';
  group.scale.setScalar(3.92);
  return group;
}

export function createKiwi() {
  const group = new THREE.Group();

  if (models.kiwiWholeModel) {
    const model = models.kiwiWholeModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.1 / maxDim);
    group.add(wrapper);
  } else {
    const bodyGeo = new THREE.SphereGeometry(0.5, 32, 24);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b6f3b, roughness: 0.8, clearcoat: 0.1,
      envMap: envMap, envMapIntensity: 0.2,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.9, 1.15, 0.9);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xccee88;
  group.userData.fruitColor = 0x8b6f3b;
  group.userData.fleshColor = 0x9acd32;
  group.userData.skinColor = 0x8b6f3b;
  group.userData.seedColor = 0x111111;
  group.userData.fruitRadius = 0.75;
  group.userData.fruitName = 'kiwi';
  group.scale.setScalar(3.78);
  return group;
}

export function createPomegranate() {
  const group = new THREE.Group();

  if (models.pomegranateWholeModel) {
    const model = models.pomegranateWholeModel.clone(true);
    model.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    model.position.set(-center.x, -center.y, -center.z);
    wrapper.add(model);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) wrapper.scale.setScalar(1.2 / maxDim);
    group.add(wrapper);
  } else {
    const bodyGeo = new THREE.SphereGeometry(0.55, 32, 24);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xa12f3b, roughness: 0.5, clearcoat: 0.3,
      envMap: envMap, envMapIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    
    group.add(body);
  }

  group.userData.juiceColor = 0xff3355;
  group.userData.fruitColor = 0xa12f3b;
  group.userData.fleshColor = 0xc42848;
  group.userData.skinColor = 0xa12f3b;
  group.userData.seedColor = 0xe63946;
  group.userData.fruitRadius = 0.8;
  group.userData.fruitName = 'pomegranate';
  group.scale.setScalar(3.78);
  return group;
}

export const fruitBuilders = {
  apple: createApple,
  orange: createOrange,
  banana: createBanana,
  watermelon: createWatermelon,
  dragonfruit: createDragonFruit,
  papaya: createPapaya,
  mango: createMango,
  kiwi: createKiwi,
  pomegranate: createPomegranate,
};

export const fruitScores = { apple: 10, orange: 10, banana: 15, watermelon: 20, dragonfruit: 25, papaya: 15, mango: 15, kiwi: 15, pomegranate: 20 };
