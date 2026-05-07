import { scene } from './scene.js';
import * as models from './models.js';
import { slicedParts } from './constants.js';

  // ---- Hemisphere geometry (actual half-sphere) ----
  export function makeHemisphereGeo(radius, side) {
    // side: 1 = top half (phi 0 to PI/2), -1 = bottom half (phi PI/2 to PI)
    const phiStart = side > 0 ? 0 : Math.PI * 0.5;
    const phiLength = Math.PI * 0.5;
    return new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, phiStart, phiLength);
  }

  // ---- Cross section disc (inner flesh) ----
  export function createCrossSection(fruitData) {
    const radius = fruitData.fruitRadius || 0.6;
    const fleshColor = fruitData.fleshColor || 0xffeedd;
    const skinColor = fruitData.skinColor || 0xcc4444;
    const seedColor = fruitData.seedColor;
    const fruitName = fruitData.fruitName;

    const group = new THREE.Group();

    // Outer skin ring
    const ringGeo = new THREE.RingGeometry(radius * 0.88, radius * 1.01, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: skinColor, roughness: 0.5, side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(ringGeo, ringMat));

    // Inner flesh disc
    const fleshGeo = new THREE.CircleGeometry(radius * 0.89, 32);
    const fleshMat = new THREE.MeshStandardMaterial({
      color: fleshColor, roughness: 0.55, side: THREE.DoubleSide
    });
    const flesh = new THREE.Mesh(fleshGeo, fleshMat);
    flesh.position.z = 0.002;
    group.add(flesh);

    // Fruit-specific interior details
    if (fruitName === 'watermelon' && seedColor) {
      const seedGeo = new THREE.CircleGeometry(0.04, 5);
      const seedMat = new THREE.MeshStandardMaterial({ color: seedColor, side: THREE.DoubleSide });
      for (let i = 0; i < 14; i++) {
        const seed = new THREE.Mesh(seedGeo, seedMat);
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * radius * 0.6;
        seed.position.set(Math.cos(a) * d, Math.sin(a) * d, 0.004);
        group.add(seed);
      }
    } else if (fruitName === 'apple' && seedColor) {
      const coreGeo = new THREE.CircleGeometry(radius * 0.15, 16);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xeedd99, roughness: 0.7, side: THREE.DoubleSide });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.z = 0.004;
      group.add(core);
      const seedGeo = new THREE.CircleGeometry(0.035, 5);
      const seedMat = new THREE.MeshStandardMaterial({ color: seedColor, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const seed = new THREE.Mesh(seedGeo, seedMat);
        const a = (i / 5) * Math.PI * 2 + 0.3;
        seed.position.set(Math.cos(a) * radius * 0.18, Math.sin(a) * radius * 0.18, 0.006);
        group.add(seed);
      }
    } else if (fruitName === 'orange') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const segGeo = new THREE.CircleGeometry(radius * 0.35, 3);
        const segMat = new THREE.MeshStandardMaterial({ color: 0xffcc80, roughness: 0.5, side: THREE.DoubleSide });
        const seg = new THREE.Mesh(segGeo, segMat);
        seg.position.set(Math.cos(a) * radius * 0.35, Math.sin(a) * radius * 0.35, 0.004);
        seg.rotation.z = a + Math.PI / 2;
        seg.scale.set(0.65, 0.95, 1);
        group.add(seg);
      }
      const pithGeo = new THREE.CircleGeometry(radius * 0.12, 12);
      const pithMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
      const pith = new THREE.Mesh(pithGeo, pithMat);
      pith.position.z = 0.005;
      group.add(pith);
    } else if (fruitName === 'dragonfruit' && seedColor) {
      // White flesh with scattered black seeds (like real dragon fruit inside)
      const seedGeo = new THREE.CircleGeometry(0.025, 4);
      const seedMat = new THREE.MeshStandardMaterial({ color: seedColor, side: THREE.DoubleSide });
      for (let i = 0; i < 30; i++) {
        const seed = new THREE.Mesh(seedGeo, seedMat);
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * radius * 0.7;
        seed.position.set(Math.cos(a) * d, Math.sin(a) * d, 0.004);
        group.add(seed);
      }
    }

    return group;
  }

  // ---- Sliced Banana Half (curved tube cut lengthwise) ----
  export function createBananaHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    // Recreate the banana curve
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.5, -0.3, 0),
      new THREE.Vector3(-0.2, 0.1, 0.05),
      new THREE.Vector3(0.15, 0.35, 0.05),
      new THREE.Vector3(0.5, 0.5, 0)
    ]);

    // Build a proper half-tube with matching segments
    const tubeSeg = 28;
    const radSeg = 14;
    const tubeGeo = new THREE.TubeGeometry(curve, tubeSeg, 0.18, radSeg, false);
    const pos = tubeGeo.attributes.position;

    // Collapse vertices on the hidden half to the curve center
    for (let i = 0; i <= tubeSeg; i++) {
      for (let j = 0; j <= radSeg; j++) {
        const idx = i * (radSeg + 1) + j;
        const angle = (j / radSeg) * Math.PI * 2;
        if (sliceDir > 0 && angle > Math.PI && angle < Math.PI * 2) {
          const t = i / tubeSeg;
          const pt = curve.getPoint(t);
          pos.setXYZ(idx, pt.x, pt.y, pt.z);
        } else if (sliceDir < 0 && angle >= 0 && angle < Math.PI) {
          const t = i / tubeSeg;
          const pt = curve.getPoint(t);
          pos.setXYZ(idx, pt.x, pt.y, pt.z);
        }
      }
    }
    tubeGeo.computeVertexNormals();

    // Vertex colors matching the whole banana — yellow with green tips
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
      const segIndex = Math.floor(i / (radSeg + 1));
      const t = segIndex / tubeSeg;
      let r = 1.0, g = 0.87, b = 0.0;
      if (t < 0.12) {
        const blend = (0.12 - t) / 0.12;
        r -= blend * 0.35; g += blend * 0.05; b += blend * 0.02;
      }
      if (t > 0.88) {
        const blend = (t - 0.88) / 0.12;
        r -= blend * 0.25; g -= blend * 0.1; b += blend * 0.02;
      }
      colors.push(r, g, b);
    }
    tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const skinMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.3,
      side: THREE.DoubleSide
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, skinMat);
    
    half.add(tubeMesh);

    // Flat flesh face — thicker visible cross-section along the cut
    const steps = 40;
    const curvePts = curve.getPoints(steps);
    const fleshShape = new THREE.Shape();
    const thickness = 0.16; // visible flesh width
    // Top edge
    fleshShape.moveTo(curvePts[0].x, curvePts[0].y);
    for (let i = 1; i < curvePts.length; i++) {
      fleshShape.lineTo(curvePts[i].x, curvePts[i].y);
    }
    // Bottom edge (offset for thickness)
    for (let i = curvePts.length - 1; i >= 0; i--) {
      const tangent = curve.getTangentAt(i / steps);
      const nx = -tangent.y, ny = tangent.x; // perpendicular
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      fleshShape.lineTo(
        curvePts[i].x + (nx / len) * thickness,
        curvePts[i].y + (ny / len) * thickness
      );
    }
    const fleshGeo = new THREE.ShapeGeometry(fleshShape);
    const fleshMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4, roughness: 0.5, side: THREE.DoubleSide
    });
    const fleshMesh = new THREE.Mesh(fleshGeo, fleshMat);
    fleshMesh.position.z = sliceDir * 0.005;
    half.add(fleshMesh);

    // Cap ends — brown tips
    const capGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a7a30, roughness: 0.6 });
    const cap1 = new THREE.Mesh(capGeo, capMat);
    cap1.position.copy(curve.getPoint(0));
    half.add(cap1);
    const capMat2 = new THREE.MeshStandardMaterial({ color: 0x5a4a1a, roughness: 0.7 });
    const cap2 = new THREE.Mesh(capGeo, capMat2);
    cap2.position.copy(curve.getPoint(1));
    cap2.scale.setScalar(0.7);
    half.add(cap2);

    // Physics
    half.userData.vx = data.vx * 0.3 + sliceDir * (2 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = sliceDir * (1 + Math.random());
    half.userData.rotSpeedX = (Math.random() - 0.5) * 5;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 3;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 5;
    half.userData.life = 2.0;
    half.userData.sliced = false;
    half.userData.fruitName = 'banana';

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Orange Half (use orange GLB half model) ----
  export function createOrangeHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.orangeHalfModel) {
      const model = models.orangeHalfModel.clone(true);
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
        wrapper.scale.setScalar(1.2 / maxDim);
      }

      if (sliceDir < 0) {
        wrapper.scale.x *= -1;
      }

      half.add(wrapper);
    } else {
      // Fallback — hemisphere + cross-section
      const radius = data.fruitRadius || 0.88;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0xff8c00, roughness: 0.4, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'orange';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Watermelon Half (use half_of_juicy_watermelon.glb) ----
  export function createWatermelonHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.watermelonHalfModel) {
      const model = models.watermelonHalfModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          
        }
      });

      // Auto-center and auto-scale to match the whole fruit size
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
        wrapper.scale.setScalar(1.2 / maxDim);
      }

      // Mirror one half so they fly apart in opposite directions
      if (sliceDir < 0) {
        wrapper.scale.x *= -1;
      }

      half.add(wrapper);
    } else {
      // Fallback — hemisphere + cross-section
      const radius = data.fruitRadius || 1.0;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0x2d7a2d, roughness: 0.4, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    // Physics
    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'watermelon';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Dragon Fruit Half (clip the actual model) ----
  export function createDragonFruitHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;

    // Clone the entire fruit group — preserves exact hierarchy and look
    const half = fruitGroup.clone(true);
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    // Clipping plane in WORLD space — must be at the fruit's actual position
    const worldPos = new THREE.Vector3();
    fruitGroup.getWorldPosition(worldPos);
    const clipPlane = new THREE.Plane(
      new THREE.Vector3(sliceDir, 0, 0),
      -sliceDir * worldPos.x
    );

    // Apply clipping to every mesh inside the cloned group
    half.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.clippingPlanes = [clipPlane];
        child.material.clipShadows = true;
        child.material.side = THREE.DoubleSide;
      }
    });

    // Cross-section disc on the cut face — white flesh with black seeds
    const radius = data.fruitRadius || 0.8;
    const cross = createCrossSection(data);
    cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
    half.add(cross);

    // Clear old userData and set physics
    half.userData = {};
    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'dragonfruit';
    half.userData.fruitRadius = radius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Papaya Half (use papaya GLB half model) ----
  export function createPapayaHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.papayaHalfModel) {
      const model = models.papayaHalfModel.clone(true);
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

      if (sliceDir < 0) wrapper.scale.x *= -1;

      half.add(wrapper);
    } else {
      const radius = data.fruitRadius || 0.9;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0xff9933, roughness: 0.45, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'papaya';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Mango Half (use mango GLB half model) ----
  export function createMangoHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.mangoHalfModel) {
      const model = models.mangoHalfModel.clone(true);
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

      if (sliceDir < 0) wrapper.scale.x *= -1;

      half.add(wrapper);
    } else {
      const radius = data.fruitRadius || 0.85;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0xffc233, roughness: 0.4, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'mango';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Kiwi Half (use kiwi GLB half model) ----
  export function createKiwiHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.kiwiHalfModel) {
      const model = models.kiwiHalfModel.clone(true);
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

      if (sliceDir < 0) wrapper.scale.x *= -1;

      half.add(wrapper);
    } else {
      const radius = data.fruitRadius || 0.75;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0x8b6f3b, roughness: 0.8, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'kiwi';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Pomegranate Half (use pomegranate half extracted from combined GLB) ----
  export function createPomegranateHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (models.pomegranateHalfModel) {
      const model = models.pomegranateHalfModel.clone(true);
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

      if (sliceDir < 0) wrapper.scale.x *= -1;

      half.add(wrapper);
    } else {
      const radius = data.fruitRadius || 0.8;
      const hemiGeo = makeHemisphereGeo(radius, sliceDir);
      const hemiMat = new THREE.MeshStandardMaterial({
        color: data.skinColor || 0xa12f3b, roughness: 0.5, side: THREE.DoubleSide
      });
      const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
      hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(hemiMesh);

      const cross = createCrossSection(data);
      cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
      half.add(cross);
    }

    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;
    half.userData.fruitName = 'pomegranate';
    half.userData.fruitRadius = data.fruitRadius;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }

  // ---- Sliced Fruit Halves ----
  export function createHalf(fruitGroup, sliceDir, swipeDX, swipeDY) {
    // Banana gets special slicing
    if (fruitGroup.userData.fruitName === 'banana') {
      createBananaHalf(fruitGroup, sliceDir);
      return;
    }

    // Dragon fruit — clip the actual model in half
    if (fruitGroup.userData.fruitName === 'dragonfruit') {
      createDragonFruitHalf(fruitGroup, sliceDir);
      return;
    }

    // Watermelon — use the half GLB model
    if (fruitGroup.userData.fruitName === 'watermelon') {
      createWatermelonHalf(fruitGroup, sliceDir);
      return;
    }

    // Orange — use the half GLB model
    if (fruitGroup.userData.fruitName === 'orange') {
      createOrangeHalf(fruitGroup, sliceDir);
      return;
    }

    // Papaya — use the half GLB model
    if (fruitGroup.userData.fruitName === 'papaya') {
      createPapayaHalf(fruitGroup, sliceDir);
      return;
    }

    // Mango — use the half GLB model
    if (fruitGroup.userData.fruitName === 'mango') {
      createMangoHalf(fruitGroup, sliceDir);
      return;
    }

    // Kiwi — use the half GLB model
    if (fruitGroup.userData.fruitName === 'kiwi') {
      createKiwiHalf(fruitGroup, sliceDir);
      return;
    }

    // Pomegranate — use the half GLB model
    if (fruitGroup.userData.fruitName === 'pomegranate') {
      createPomegranateHalf(fruitGroup, sliceDir);
      return;
    }

    const data = fruitGroup.userData;
    const radius = data.fruitRadius || 0.65;
    const skinColor = data.skinColor || 0xcc4444;

    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    // Build a true hemisphere shell (the outer skin half)
    const hemiGeo = makeHemisphereGeo(radius, sliceDir);
    const hemiMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.4,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const hemiMesh = new THREE.Mesh(hemiGeo, hemiMat);
    
    // Rotate so the flat cut faces sideways (X axis) instead of up/down
    hemiMesh.rotation.z = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
    half.add(hemiMesh);

    // Add the cross-section disc (flesh face) on the flat side
    const cross = createCrossSection(data);
    // Rotate disc to face the cut direction
    cross.rotation.y = sliceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
    half.add(cross);

    // Physics — halves fly apart
    half.userData.vx = data.vx * 0.3 + sliceDir * (2.5 + Math.random() * 2);
    half.userData.vy = data.vy * 0.4 + 1.5 + Math.random() * 3;
    half.userData.vz = (Math.random() - 0.5) * 2;
    half.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    half.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    half.userData.life = 2.0;

    // Track fruit data for re-slicing (keep same radius — geometry is already half)
    half.userData.fruitName = data.fruitName;
    half.userData.fruitRadius = data.fruitRadius || 0.65;
    half.userData.skinColor = data.skinColor;
    half.userData.fleshColor = data.fleshColor;
    half.userData.seedColor = data.seedColor;
    half.userData.juiceColor = data.juiceColor;
    half.userData.fruitColor = data.fruitColor;
    half.userData.cutLevel = (data.cutLevel || 0) + 1;
    half.userData.sliced = false;

    scene.add(half);
    slicedParts.push(half);
  }
