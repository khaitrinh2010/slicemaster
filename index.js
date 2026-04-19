// ============================================================
// Fruit Ninja 3D — Three.js
// ============================================================

(function () {
  'use strict';

  // ---- Constants ----
  const GRAVITY = -12;
  const MAX_MISSES = 5;
  const SPAWN_INTERVAL_MIN = 1400;
  const SPAWN_INTERVAL_MAX = 3000;
  const FRUIT_TYPES = ['watermelon', 'orange'];

  // ---- Slow-Mo (reference: index.js pattern) ----
  const SLOWMO_DURATION = 1500;       // ms of slow-mo
  const SLOWMO_COOLDOWN = 8000;       // ms cooldown before slow-mo can trigger again
  const SLOWMO_TIME_SCALE = 0.3;      // target gameSpeed during slow-mo
  const SLOWMO_POINTER_SCALE = 0.075; // even slower while swiping in slow-mo
  const SCORE_MILESTONE = 50;         // activate slow-mo every N points
  let slowmoRemaining = 0;            // ms remaining
  let slowmoCooldown = 0;             // ms cooldown remaining
  let gameSpeed = 1;                  // current time multiplier (lerps)
  let lastMilestone = 0;              // last milestone score crossed

  // ---- State ----
  let score = 0;
  let misses = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let gameRunning = false;
  let spawnTimer = 0;
  let nextSpawnDelay = 1000;
  let clock;

  // ---- Squidly API Integration ----
  const squidly = window.SquidlyAPI || null;


  // ---- Squidly Cursor/Gaze Listener (alternative slicing input) ----
  let gazePrevX = null;
  let gazePrevY = null;
  let gazeTrailActive = false;

  if (squidly) {
    squidly.addCursorListener((data) => {
      if (!gameRunning) return;
      const x = data.x;
      const y = data.y;

      if (gazePrevX !== null && gazePrevY !== null) {
        const dx = x - gazePrevX;
        const dy = y - gazePrevY;
        const speed = Math.sqrt(dx * dx + dy * dy);

        // Treat gaze movement as a continuous swipe
        if (speed > 2) {
          gazeTrailActive = true;
          trail.push({ x, y, time: performance.now() });
          while (trail.length > TRAIL_LENGTH) trail.shift();

          // Raycast at gaze position
          pointerNDC.x = (x / window.innerWidth) * 2 - 1;
          pointerNDC.y = -(y / window.innerHeight) * 2 + 1;
          raycaster.setFromCamera(pointerNDC, camera);

          for (let i = fruits.length - 1; i >= 0; i--) {
            const fruit = fruits[i];
            if (fruit.userData.sliced) continue;
            const fruitPos = fruit.position.clone();
            const dist = raycaster.ray.distanceToPoint(fruitPos);

            if (dist < 1.8) {
              // BOMB CHECK (gaze)
              if (fruit.userData.isBomb) {
                fruit.userData.sliced = true;
                spawnExplosion(fruit.position.clone());
                scene.remove(fruit);
                fruits.splice(i, 1);
                endGame(true);
                return;
              }

              fruit.userData.sliced = true;
              const name = fruit.userData.fruitName;
              const pts = fruitScores[name] || 10;
              score += pts;

              comboCount++;
              comboTimer = 0.5;
              if (comboCount >= 3) {
                const comboBonus = comboCount * 5;
                score += comboBonus;
                comboLabel.textContent = `🔥 ${comboCount}x COMBO! +${comboBonus}`;
                comboLabel.style.opacity = '1';
              }
              updateScore();

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
          gazeTrailActive = false;
        }
      }

      gazePrevX = x;
      gazePrevY = y;
    });
  }

  // ---- Squidly Firebase High Score ----
  let highScore = 0;

  function loadHighScore() {
    if (!squidly) return;
    squidly.firebaseOnValue("game/highScore", (val) => {
      if (val !== null && val !== undefined) {
        highScore = val;
      }
    });
  }

  function saveHighScore() {
    if (!squidly) return;
    if (score > highScore) {
      highScore = score;
      squidly.firebaseSet("game/highScore", highScore);
    }
  }

  loadHighScore();

  // ---- DOM ----
  const scoreLabel = document.getElementById('score-label');
  const comboLabel = document.getElementById('combo-label');
  const missLabel = document.getElementById('miss-label');
  const menuMain = document.getElementById('menu-main');
  const menuGameover = document.getElementById('menu-gameover');
  const finalScoreEl = document.getElementById('final-score');
  const trailCanvas = document.getElementById('trail-canvas');
  const trailCtx = trailCanvas.getContext('2d');

  // ---- Three.js Setup ----
  const scene = new THREE.Scene();

  // Background gradient via hemisphere light + fog color
  scene.background = new THREE.Color(0x1a0a2e);
  scene.fog = new THREE.Fog(0x1a0a2e, 40, 80);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 18);
  camera.lookAt(0, 5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  // ---- Lighting ----
  const ambientLight = new THREE.AmbientLight(0x8888cc, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
  dirLight.position.set(5, 15, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
  rimLight.position.set(-5, 5, -10);
  scene.add(rimLight);

  // ---- Procedural environment map for realistic reflections ----
  const envScene = new THREE.Scene();
  const envGeo = new THREE.BoxGeometry(20, 20, 20);
  const envMats = [
    new THREE.MeshBasicMaterial({ color: 0x556688, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: 0x445577, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: 0x99aabb, side: THREE.BackSide }), // top (sky)
    new THREE.MeshBasicMaterial({ color: 0x222233, side: THREE.BackSide }), // bottom
    new THREE.MeshBasicMaterial({ color: 0x667799, side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ color: 0x556688, side: THREE.BackSide }),
  ];
  envScene.add(new THREE.Mesh(envGeo, envMats));
  // Bright spot for specular highlight
  const spotGeo = new THREE.SphereGeometry(1.5, 8, 8);
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spotMesh = new THREE.Mesh(spotGeo, spotMat);
  spotMesh.position.set(5, 8, 6);
  envScene.add(spotMesh);

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
    format: THREE.RGBAFormat, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 30, cubeRenderTarget);
  cubeCamera.update(renderer, envScene);
  const envMap = cubeRenderTarget.texture;

  // ---- Fruit Geometry Builders ----

  function createApple() {
    const group = new THREE.Group();
    // Body — lathe with more segments for smoother shape
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const angle = t * Math.PI;
      let r = Math.sin(angle) * 0.7;
      // Wider bottom lobe
      if (t > 0.4 && t < 0.8) r *= 1.05;
      // Indent top (stem cavity)
      if (t < 0.15) r *= 0.5 + t * 3.0;
      // Indent bottom
      if (t > 0.9) r *= 1 - (t - 0.9) * 5;
      pts.push(new THREE.Vector2(r, t * 1.2 - 0.6));
    }
    const bodyGeo = new THREE.LatheGeometry(pts, 36);

    // Vertex colors — red body with green-yellow near the top
    const colors = [];
    const posAttr = bodyGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const normalizedY = (y + 0.6) / 1.2; // 0 = bottom, 1 = top

      // Base deep red
      let r = 0.78, g = 0.06, b = 0.04;

      // Green-yellow blush near stem (top)
      if (normalizedY > 0.7) {
        const blend = (normalizedY - 0.7) / 0.3;
        r = r * (1 - blend * 0.6) + 0.45 * blend * 0.6;
        g = g * (1 - blend * 0.6) + 0.55 * blend * 0.6;
        b = b * (1 - blend * 0.4) + 0.12 * blend * 0.4;
      }

      // Subtle streaky variation based on angle
      const angle = Math.atan2(z, x);
      const streak = Math.sin(angle * 5) * 0.06;
      r = Math.min(1, Math.max(0, r + streak));

      // Slight bright highlight near equator
      if (normalizedY > 0.35 && normalizedY < 0.65) {
        r = Math.min(1, r + 0.05);
      }

      colors.push(r, g, b);
    }
    bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const bodyMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.25,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
      envMap: envMap,
      envMapIntensity: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Stem — tapered cylinder with slight bend
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.32, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a2e12, roughness: 0.9 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.6;
    stem.rotation.z = 0.18;
    group.add(stem);

    // Leaf — more detailed with a vein
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.05, 0.1, 0.18, 0.16, 0.28, 0.02);
    leafShape.bezierCurveTo(0.18, 0.08, 0.06, -0.02, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape);
    const leafMat = new THREE.MeshPhysicalMaterial({
      color: 0x2d8c2d,
      roughness: 0.4,
      side: THREE.DoubleSide,
      clearcoat: 0.3,
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
    group.scale.setScalar(2.025);
    return group;
  }

  function createOrange() {
    const group = new THREE.Group();

    if (orangeWholeModel) {
      const model = orangeWholeModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
        }
      });

      // Auto-center and auto-scale
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
      group.add(wrapper);
    } else {
      // Fallback — simple orange sphere
      const bodyGeo = new THREE.SphereGeometry(0.65, 36, 28);
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xff8c00, roughness: 0.55, clearcoat: 0.2,
        envMap: envMap, envMapIntensity: 0.25,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      group.add(body);
    }

    group.userData.juiceColor = 0xffcc44;
    group.userData.fruitColor = 0xff8c00;
    group.userData.fleshColor = 0xffa726;
    group.userData.skinColor = 0xff8c00;
    group.userData.seedColor = 0xffffff;
    group.userData.fruitRadius = 0.88;
    group.userData.fruitName = 'orange';
    group.scale.setScalar(2.025);
    return group;
  }

  function createBanana() {
    const group = new THREE.Group();
    // Curved banana using tube geometry along a curve
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.5, -0.3, 0),
      new THREE.Vector3(-0.2, 0.1, 0.05),
      new THREE.Vector3(0.15, 0.35, 0.05),
      new THREE.Vector3(0.5, 0.5, 0)
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.18, 14, false);

    // Vertex colors — yellow with green tips and brown age spots
    const colors = [];
    const tubePos = tubeGeo.attributes.position;
    const segments = 28;
    const radialSegs = 14;
    for (let i = 0; i < tubePos.count; i++) {
      const segIndex = Math.floor(i / (radialSegs + 1));
      const t = segIndex / segments; // 0=start (bottom tip), 1=end (stem tip)

      // Base bright yellow
      let r = 1.0, g = 0.87, b = 0.0;

      // Green tint at the ends (unripe tips)
      if (t < 0.12) {
        const blend = (0.12 - t) / 0.12;
        r -= blend * 0.35;
        g += blend * 0.05;
        b += blend * 0.02;
      }
      if (t > 0.88) {
        const blend = (t - 0.88) / 0.12;
        r -= blend * 0.25;
        g -= blend * 0.1;
        b += blend * 0.02;
      }

      // Subtle brown freckles/spots
      const px = tubePos.getX(i), py = tubePos.getY(i), pz = tubePos.getZ(i);
      const spotNoise = Math.sin(px * 50 + py * 30) * Math.cos(pz * 40 + px * 20);
      if (spotNoise > 0.7) {
        const spotStrength = (spotNoise - 0.7) / 0.3 * 0.3;
        r = Math.max(0, r - spotStrength * 0.3);
        g = Math.max(0, g - spotStrength * 0.4);
        b = Math.max(0, b);
      }

      // Slight longitudinal ridges (bananas have flat sides)
      const angle = Math.atan2(pz, py) || 0;
      const ridge = Math.abs(Math.sin(angle * 2.5)) * 0.04;
      r = Math.min(1, r + ridge);
      g = Math.min(1, g + ridge * 0.5);

      colors.push(r, g, b);
    }
    tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const bodyMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.3,
      envMap: envMap,
      envMapIntensity: 0.3,
    });
    const body = new THREE.Mesh(tubeGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Cap ends — darker brown/green tips
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

    // Stem tip
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
    group.scale.setScalar(2.025);
    return group;
  }

  function createWatermelon() {
    const group = new THREE.Group();

    if (watermelonModel) {
      const model = watermelonModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
        }
      });

      // Auto-center and auto-scale
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
      group.add(wrapper);
    } else {
      // Fallback — simple green sphere
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
      body.castShadow = true;
      group.add(body);
    }

    group.userData.juiceColor = 0xff6666;
    group.userData.fruitColor = 0xcc2222;
    group.userData.fleshColor = 0xe53935;
    group.userData.skinColor = 0x2d7a2d;
    group.userData.seedColor = 0x1b1b1b;
    group.userData.fruitRadius = 1.0;
    group.userData.fruitName = 'watermelon';
    group.scale.setScalar(3.0);
    return group;
  }

  // ---- GLTF Model Loaders ----
  const gltfLoader = new THREE.GLTFLoader();
  let dragonFruitModel = null;
  let watermelonModel = null;
  let watermelonHalfModel = null;
  let orangeWholeModel = null;
  let orangeHalfModel = null;
  let comicalBombModel = null;
  let fatManBombModel = null;

  gltfLoader.load('3d_model/fresh_orange.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.side = THREE.DoubleSide;
          child.material.color = new THREE.Color(0xffaa00);
          child.material.map = null;
          child.material.needsUpdate = true;
        }
      }
    });
    orangeWholeModel = model;
    console.log('Orange whole model ready');
  }, null, (err) => {
    console.warn('Could not load fresh_orange.glb, using fallback:', err);
  });

  gltfLoader.load('3d_model/orange_half.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          // Replace material entirely with a fresh one to override all textures
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.5,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
        }
      }
    });
    orangeHalfModel = model;
    console.log('Orange half model ready');
  }, null, (err) => {
    console.warn('Could not load orange_half.glb, using fallback:', err);
  });

  gltfLoader.load('3d_model/watermelon.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.side = THREE.DoubleSide;
      }
    });
    watermelonModel = model;
    console.log('Watermelon model ready');
  }, null, (err) => {
    console.warn('Could not load watermelon.glb, using fallback:', err);
  });

  gltfLoader.load('3d_model/half_of_juicy_watermelon.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.side = THREE.DoubleSide;
      }
    });
    watermelonHalfModel = model;
    console.log('Watermelon half model ready');
  }, null, (err) => {
    console.warn('Could not load half_of_juicy_watermelon.glb, using fallback:', err);
  });

  gltfLoader.load('3d_model/dragon_fruit.glb', (gltf) => {
    const model = gltf.scene;

    // Debug: log what we got
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log('Dragon fruit GLB loaded! Size:', size, 'Children:', model.children.length);

    // Ensure all meshes have proper materials and shadows
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // If material has no map and is black/default, make it visible
        if (child.material) {
          child.material.side = THREE.DoubleSide;
          // Ensure material isn't fully transparent
          if (child.material.transparent && child.material.opacity === 0) {
            child.material.opacity = 1;
          }
        }
      }
    });

    dragonFruitModel = model;
    console.log('Dragon fruit model ready for use');
  }, (progress) => {
    console.log('Loading dragon_fruit.glb...', Math.round((progress.loaded / (progress.total || 1)) * 100) + '%');
  }, (err) => {
    console.warn('Could not load dragon_fruit.glb, using fallback geometry:', err);
  });

  // ---- Bomb Model Loaders ----
  gltfLoader.load('3d_model/comical_bomb.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.side = THREE.DoubleSide;
      }
    });
    comicalBombModel = model;
    console.log('Comical bomb model ready');
  }, null, (err) => {
    console.warn('Could not load comical_bomb.glb:', err);
  });

  gltfLoader.load('3d_model/fat_man_bomb.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) child.material.side = THREE.DoubleSide;
      }
    });
    fatManBombModel = model;
    console.log('Fat man bomb model ready');
  }, null, (err) => {
    console.warn('Could not load fat_man_bomb.glb:', err);
  });

  // ---- Bomb Builder ----
  function createBomb() {
    const group = new THREE.Group();
    const sourceModel = Math.random() < 0.5 ? comicalBombModel : fatManBombModel;

    if (sourceModel) {
      const model = sourceModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
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
        wrapper.scale.setScalar(1.4 / maxDim);
      }
      group.add(wrapper);
    } else {
      // Fallback — dark sphere with a fuse
      const bodyGeo = new THREE.SphereGeometry(0.5, 20, 16);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      group.add(body);

      const fuseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6);
      const fuseMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 });
      const fuse = new THREE.Mesh(fuseGeo, fuseMat);
      fuse.position.y = 0.6;
      fuse.rotation.z = 0.3;
      group.add(fuse);

      // Spark at tip
      const sparkGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const sparkMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 2 });
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.set(0.08, 0.75, 0);
      group.add(spark);
    }

    group.userData.isBomb = true;
    group.userData.fruitName = 'bomb';
    group.userData.fruitRadius = 0.8;
    group.scale.setScalar(2.5);
    return group;
  }

  // ---- Explosion Effect ----
  const explosionParts = [];

  function spawnExplosion(position) {
    // Screen flash
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;inset:0;z-index:100;pointer-events:none;
      background:radial-gradient(circle at 50% 50%, rgba(255,200,50,0.9), rgba(255,80,0,0.6), transparent 70%);
      animation: bombFlash 0.6s ease-out forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 700);

    // Add flash animation style if not present
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

    // Screen shake
    document.body.style.animation = 'bombShake 0.4s ease-out';
    setTimeout(() => { document.body.style.animation = ''; }, 450);

    // 3D explosion particles — fiery debris
    const fireColors = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0x222222];
    for (let i = 0; i < 40; i++) {
      const geo = new THREE.SphereGeometry(0.15 + Math.random() * 0.3, 6, 6);
      const color = fireColors[Math.floor(Math.random() * fireColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: i < 20 ? 1.5 : 0,
        roughness: 0.5,
        transparent: true,
        opacity: 1.0
      });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(position);

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

  function createDragonFruit() {
    const group = new THREE.Group();

    if (dragonFruitModel) {
      // Clone the loaded GLTF model
      const model = dragonFruitModel.clone(true);

      // Deep clone materials so each fruit instance is independent
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
        }
      });

      // Auto-center and auto-scale the model
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Create a wrapper to apply centering offset
      const wrapper = new THREE.Group();
      model.position.set(-center.x, -center.y, -center.z);
      wrapper.add(model);

      // Scale so the longest dimension fits ~1.2 units
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const desiredSize = 1.2;
        wrapper.scale.setScalar(desiredSize / maxDim);
      }

      group.add(wrapper);
    } else {
      // Procedural dragon fruit — egg-shaped body with layered petal scales
      // Body — elongated egg shape via lathe
      const pts = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        const angle = t * Math.PI;
        // Egg shape: wider at bottom, tapered top
        let r = Math.sin(angle) * 0.52;
        if (t < 0.3) r *= 0.7 + t * 1.0; // narrow top
        if (t > 0.85) r *= 1 - (t - 0.85) * 3; // taper bottom nub
        pts.push(new THREE.Vector2(r, t * 1.4 - 0.7));
      }
      const bodyGeo = new THREE.LatheGeometry(pts, 28);

      // Vertex colors — hot pink body with darker pink at poles, yellow-pink undertones
      const posAttr = bodyGeo.attributes.position;
      const colors = [];
      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const normalizedY = (y + 0.7) / 1.4;

        // Hot pink base
        let cr = 0.87, cg = 0.12, cb = 0.35;

        // Darker magenta near the top
        if (normalizedY > 0.75) {
          const blend = (normalizedY - 0.75) / 0.25;
          cr -= blend * 0.15;
          cg -= blend * 0.04;
          cb += blend * 0.08;
        }
        // Yellowy-pink near the bottom tip
        if (normalizedY < 0.15) {
          const blend = (0.15 - normalizedY) / 0.15;
          cr += blend * 0.1;
          cg += blend * 0.12;
          cb -= blend * 0.1;
        }

        // Scale-like pattern from angle
        const angle = Math.atan2(z, x);
        const scalePattern = Math.sin(angle * 6 + normalizedY * 8) * 0.06;
        cr = Math.min(1, Math.max(0, cr + scalePattern));

        colors.push(cr, cg, cb);
      }
      bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const bodyMat = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.35,
        metalness: 0.0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      group.add(body);

      // Petal/scale leaves — layered rows curving outward like a real dragon fruit
      const petalRows = [
        { y: 0.45, count: 5, size: 0.28, tilt: 0.7, color: 0x44cc55 },  // top green
        { y: 0.20, count: 6, size: 0.24, tilt: 0.5, color: 0xdd2870 },  // upper pink
        { y: -0.05, count: 7, size: 0.22, tilt: 0.35, color: 0xee3388 }, // mid pink
        { y: -0.25, count: 6, size: 0.18, tilt: 0.25, color: 0xcc2266 }, // lower pink
      ];

      for (const row of petalRows) {
        for (let i = 0; i < row.count; i++) {
          const theta = (i / row.count) * Math.PI * 2 + row.y; // offset per row

          // Petal shape
          const petalShape = new THREE.Shape();
          petalShape.moveTo(0, 0);
          petalShape.bezierCurveTo(-0.06, row.size * 0.4, -0.04, row.size * 0.8, 0, row.size);
          petalShape.bezierCurveTo(0.04, row.size * 0.8, 0.06, row.size * 0.4, 0, 0);
          const petalGeo = new THREE.ShapeGeometry(petalShape);
          const petalMat = new THREE.MeshStandardMaterial({
            color: row.color,
            roughness: 0.4,
            side: THREE.DoubleSide,
          });
          const petal = new THREE.Mesh(petalGeo, petalMat);

          // Get body radius at this Y
          const bodyT = (row.y + 0.7) / 1.4;
          const bodyAngle = bodyT * Math.PI;
          let bodyR = Math.sin(bodyAngle) * 0.52;
          if (bodyT < 0.3) bodyR *= 0.7 + bodyT * 1.0;

          petal.position.set(
            Math.cos(theta) * bodyR,
            row.y,
            Math.sin(theta) * bodyR
          );

          // Face outward and tilt backward
          petal.lookAt(
            Math.cos(theta) * (bodyR + 1),
            row.y + row.tilt,
            Math.sin(theta) * (bodyR + 1)
          );

          petal.castShadow = true;
          group.add(petal);
        }
      }

      // Tiny green tip at the very top
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
    group.scale.setScalar(2.8);
    return group;
  }

  const fruitBuilders = {
    apple: createApple,
    orange: createOrange,
    banana: createBanana,
    watermelon: createWatermelon,
    dragonfruit: createDragonFruit,
  };

  const fruitScores = { apple: 10, orange: 10, banana: 15, watermelon: 20, dragonfruit: 25 };

  // ---- Active Fruit List ----
  const fruits = [];
  const slicedParts = [];
  const juiceParticles = [];

  // ---- Juice Particle System ----
  const particleGeo = new THREE.SphereGeometry(0.18, 6, 6);

  function spawnJuice(position, color, count) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        transparent: true,
        opacity: 0.9
      });
      const p = new THREE.Mesh(particleGeo, mat);
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

  // ---- Hemisphere geometry (actual half-sphere) ----
  function makeHemisphereGeo(radius, side) {
    // side: 1 = top half (phi 0 to PI/2), -1 = bottom half (phi PI/2 to PI)
    const phiStart = side > 0 ? 0 : Math.PI * 0.5;
    const phiLength = Math.PI * 0.5;
    return new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, phiStart, phiLength);
  }

  // ---- Cross section disc (inner flesh) ----
  function createCrossSection(fruitData) {
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
  function createBananaHalf(fruitGroup, sliceDir) {
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
    tubeMesh.castShadow = true;
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
  function createOrangeHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (orangeHalfModel) {
      const model = orangeHalfModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
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
  function createWatermelonHalf(fruitGroup, sliceDir) {
    const data = fruitGroup.userData;
    const half = new THREE.Group();
    half.position.copy(fruitGroup.position);
    half.rotation.copy(fruitGroup.rotation);
    half.scale.copy(fruitGroup.scale).multiplyScalar(0.85);

    if (watermelonHalfModel) {
      const model = watermelonHalfModel.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.castShadow = true;
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
  function createDragonFruitHalf(fruitGroup, sliceDir) {
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

  // ---- Sliced Fruit Halves ----
  function createHalf(fruitGroup, sliceDir, swipeDX, swipeDY) {
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
    hemiMesh.castShadow = true;
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

  // ---- Spawn Fruit ----
  const MIN_SPAWN_DIST = 2.5; // minimum X distance between active fruits near spawn
  const BOMB_CHANCE = 0.15; // 15% chance to spawn a bomb instead of fruit

  function spawnFruit() {
    const isBomb = Math.random() < BOMB_CHANCE;
    let fruit;

    if (isBomb) {
      fruit = createBomb();
    } else {
      const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
      fruit = fruitBuilders[type]();
    }

    // Launch from bottom, random X — avoid overlapping other recent fruits
    const spread = 8;
    let startX;
    let attempts = 0;
    do {
      startX = (Math.random() - 0.5) * spread;
      attempts++;
    } while (attempts < 10 && fruits.some(f => {
      // Only check fruits still near the bottom (recently spawned)
      if (f.position.y > 2) return false;
      return Math.abs(f.position.x - startX) < MIN_SPAWN_DIST;
    }));

    fruit.position.set(startX, -2, 0);

    // Velocity — arc upward, spread apart based on position
    const vx = (Math.random() - 0.5) * 3 - startX * 0.3;
    const vy = 9 + Math.random() * 4;
    const vz = (Math.random() - 0.5) * 2;

    fruit.userData.vx = vx;
    fruit.userData.vy = vy;
    fruit.userData.vz = vz;
    fruit.userData.rotSpeedX = (Math.random() - 0.5) * 4;
    fruit.userData.rotSpeedY = (Math.random() - 0.5) * 4;
    fruit.userData.rotSpeedZ = (Math.random() - 0.5) * 4;
    fruit.userData.sliced = false;
    fruit.userData.missed = false;
    fruit.userData.scored = false;

    scene.add(fruit);
    fruits.push(fruit);
  }

  // ---- Blade Trail ----
  const trail = [];
  const TRAIL_LENGTH = 12;

  function resizeTrailCanvas() {
    trailCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    trailCanvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    trailCanvas.style.width = window.innerWidth + 'px';
    trailCanvas.style.height = window.innerHeight + 'px';
    trailCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  }

  function drawTrail() {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    if (trail.length < 2) return;

    const now = performance.now();
    trailCtx.lineCap = 'round';
    trailCtx.lineJoin = 'round';

    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i].time) / 150;
      if (age > 1) continue;
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
      if (age > 1) continue;
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

  // ---- Pointer / Swipe ----
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  function onPointerDown(e) {
    if (!gameRunning) return;
    if (window.__squidlyMockGazeOnly && window.__squidlyMockGazeOnly()) return;
    const x = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const y = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    pointerDown = true;
    pointerX = x;
    pointerY = y;
    lastPointerX = x;
    lastPointerY = y;
    trail.length = 0;
    trail.push({ x, y, time: performance.now() });
  }

  function onPointerMove(e) {
    if (!pointerDown || !gameRunning) return;
    if (window.__squidlyMockGazeOnly && window.__squidlyMockGazeOnly()) return;
    const x = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    const y = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    lastPointerX = pointerX;
    lastPointerY = pointerY;
    pointerX = x;
    pointerY = y;

    trail.push({ x, y, time: performance.now() });
    while (trail.length > TRAIL_LENGTH) trail.shift();

    // Check swipe speed
    const dx = pointerX - lastPointerX;
    const dy = pointerY - lastPointerY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 3) return;

    // Raycast for fruit hits
    pointerNDC.x = (x / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    let hitThisFrame = false;
    for (let i = fruits.length - 1; i >= 0; i--) {
      const fruit = fruits[i];
      if (fruit.userData.sliced) continue;

      // Use bounding sphere check
      const fruitPos = fruit.position.clone();
      const ray = raycaster.ray;
      const dist = ray.distanceToPoint(fruitPos);

      if (dist < 1.8) {
        // BOMB CHECK
        if (fruit.userData.isBomb) {
          fruit.userData.sliced = true;
          spawnExplosion(fruit.position.clone());
          scene.remove(fruit);
          fruits.splice(i, 1);
          endGame(true);
          return;
        }

        // SLICED!
        fruit.userData.sliced = true;
        const name = fruit.userData.fruitName;
        const pts = fruitScores[name] || 10;
        score += pts;
        hitThisFrame = true;

        // Combo
        comboCount++;
        comboTimer = 0.5;

        if (comboCount >= 3) {
          const comboBonus = comboCount * 5;
          score += comboBonus;
          comboLabel.textContent = `🔥 ${comboCount}x COMBO! +${comboBonus}`;
          comboLabel.style.opacity = '1';
        }

        updateScore();

        // Spawn halves
        const sliceDir = dx > 0 ? 1 : -1;
        createHalf(fruit, sliceDir, dx, dy);
        createHalf(fruit, -sliceDir, dx, dy);

        // Juice particles
        spawnJuice(fruit.position, fruit.userData.juiceColor, 20);
        spawnJuice(fruit.position, fruit.userData.fruitColor, 10);

        // Remove original
        scene.remove(fruit);
        fruits.splice(i, 1);
      }
    }

    if (!hitThisFrame) {
      // Reset combo on miss-swing
      // (only reset if enough time passes without hitting — handled in update)
    }
  }

  function onPointerUp() {
    pointerDown = false;
  }

  window.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchstart', e => { e.preventDefault(); onPointerDown(e.touches[0]); }, { passive: false });
  window.addEventListener('touchmove', e => { e.preventDefault(); onPointerMove(e.touches[0]); }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  // ---- Keyboard: S key toggles slow-mo ----
  window.addEventListener('keydown', e => {
    if (e.key === 's' || e.key === 'S') {
      if (!gameRunning) return;
      if (slowmoRemaining > 0) {
        slowmoRemaining = 0;
      } else {
        slowmoRemaining = SLOWMO_DURATION;
      }
    }
  });

  // ---- Slow-Mo HUD ----
  const slowmoNode = document.getElementById('slowmo');
  const slowmoBarNode = document.getElementById('slowmo-bar');

  function renderSlowmoStatus(pct) {
    slowmoNode.style.opacity = pct === 0 ? 0 : 1;
    slowmoBarNode.style.transform = `scaleX(${pct.toFixed(3)})`;
  }

  // ---- Score / HUD ----
  function updateScore() {
    scoreLabel.textContent = 'Score: ' + score;

    // Milestone check — activate slow-mo every SCORE_MILESTONE points (if off cooldown)
    const currentMilestone = Math.floor(score / SCORE_MILESTONE) * SCORE_MILESTONE;
    if (currentMilestone > lastMilestone && currentMilestone > 0) {
      lastMilestone = currentMilestone;
      if (slowmoCooldown <= 0 && slowmoRemaining <= 0) {
        slowmoRemaining = SLOWMO_DURATION;
        slowmoCooldown = SLOWMO_COOLDOWN;
      }
    }
  }

  function updateMisses() {
    const xs = '❌'.repeat(misses) + '⭕'.repeat(MAX_MISSES - misses);
    missLabel.textContent = xs;
  }

  // ---- Game Flow ----
  function startGame() {
    score = 0;
    misses = 0;
    comboCount = 0;
    comboTimer = 0;
    spawnTimer = 0;
    nextSpawnDelay = 1200;
    slowmoRemaining = 0;
    slowmoCooldown = 0;
    gameSpeed = 1;
    lastMilestone = 0;
    gameRunning = true;

    // Clear scene of fruits
    fruits.forEach(f => scene.remove(f));
    fruits.length = 0;
    slicedParts.forEach(f => scene.remove(f));
    slicedParts.length = 0;
    juiceParticles.forEach(p => scene.remove(p));
    juiceParticles.length = 0;
    explosionParts.forEach(p => scene.remove(p));
    explosionParts.length = 0;

    updateScore();
    updateMisses();

    menuMain.classList.add('hidden');
    menuGameover.classList.add('hidden');

    // Reset gaze tracking
    gazePrevX = null;
    gazePrevY = null;

    clock = new THREE.Clock();
    clock.start();
  }

  function endGame(bombDeath) {
    gameRunning = false;
    saveHighScore();
    const hsText = highScore > 0 ? ` | Best: ${highScore}` : '';
    finalScoreEl.textContent = 'Score: ' + score + hsText;
    const goTitle = menuGameover.querySelector('h1');
    goTitle.textContent = bombDeath ? '💣 BOOM!' : 'Game Over';
    menuGameover.classList.remove('hidden');
  }

  // ---- Button Handlers ----
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const btnMenu = document.getElementById('btn-menu');

  btnPlay.addEventListener('click', startGame);
  btnRestart.addEventListener('click', startGame);

  // Squidly access-button events (fired by dwell/switch instead of click)
  if (btnPlay.parentElement && btnPlay.parentElement.tagName === 'ACCESS-BUTTON') {
    btnPlay.parentElement.addEventListener('access-click', startGame);
  }
  if (btnRestart.parentElement && btnRestart.parentElement.tagName === 'ACCESS-BUTTON') {
    btnRestart.parentElement.addEventListener('access-click', startGame);
  }

  const menuHandler = () => {
    menuGameover.classList.add('hidden');
    menuMain.classList.remove('hidden');
    // Clear scene
    fruits.forEach(f => scene.remove(f));
    fruits.length = 0;
    slicedParts.forEach(f => scene.remove(f));
    slicedParts.length = 0;
    juiceParticles.forEach(p => scene.remove(p));
    juiceParticles.length = 0;
  };
  btnMenu.addEventListener('click', menuHandler);
  if (btnMenu.parentElement && btnMenu.parentElement.tagName === 'ACCESS-BUTTON') {
    btnMenu.parentElement.addEventListener('access-click', menuHandler);
  }

  // ---- Resize ----
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTrailCanvas();
  }
  window.addEventListener('resize', onResize);
  resizeTrailCanvas();

  // ---- Enable clipping ----
  renderer.localClippingEnabled = true;

  // ---- Main Loop ----
  function animate() {
    requestAnimationFrame(animate);

    const rawDt = clock ? Math.min(clock.getDelta(), 0.05) : 0.016;
    const rawDtMs = rawDt * 1000;

    // ---- Slow-mo system (mirrors index.js pattern) ----
    let targetSpeed = 1;
    if (slowmoRemaining > 0) {
      slowmoRemaining -= rawDtMs;
      if (slowmoRemaining < 0) slowmoRemaining = 0;
      targetSpeed = pointerDown ? SLOWMO_POINTER_SCALE : SLOWMO_TIME_SCALE;
    } else if (slowmoCooldown > 0) {
      slowmoCooldown -= rawDtMs;
      if (slowmoCooldown < 0) slowmoCooldown = 0;
    }
    // Smooth lerp — same feel as reference: gameSpeed += (target - gameSpeed) / 22 * lag
    const lag = rawDt * 60; // normalize to ~60fps
    gameSpeed += (targetSpeed - gameSpeed) / 22 * lag;
    gameSpeed = Math.max(0, Math.min(1, gameSpeed));

    renderSlowmoStatus(slowmoRemaining / SLOWMO_DURATION);

    const dt = rawDt * gameSpeed;

    if (gameRunning) {
      // Spawn — faster during slow-mo so there's more to slice
      const isSlowmo = slowmoRemaining > 0;
      const spawnMultiplier = isSlowmo ? 2.5 : 1;
      spawnTimer += rawDtMs * spawnMultiplier;
      if (spawnTimer >= nextSpawnDelay) {
        spawnTimer = 0;
        nextSpawnDelay = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
        const count = isSlowmo ? (Math.random() < 0.4 ? 3 : 2) : (Math.random() < 0.10 ? 2 : 1);
        for (let c = 0; c < count; c++) {
          setTimeout(() => { if (gameRunning) spawnFruit(); }, c * 120);
        }
      }

      // Combo decay
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          comboCount = 0;
          comboLabel.style.opacity = '0';
        }
      }

      // Update fruits
      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i];
        f.position.x += f.userData.vx * dt;
        f.position.y += f.userData.vy * dt;
        f.position.z += f.userData.vz * dt;
        f.userData.vy += GRAVITY * dt;

        f.rotation.x += f.userData.rotSpeedX * dt;
        f.rotation.y += f.userData.rotSpeedY * dt;
        f.rotation.z += f.userData.rotSpeedZ * dt;

        // Fell off screen
        if (f.position.y < -4 && f.userData.vy < 0) {
          if (!f.userData.sliced && !f.userData.missed && !f.userData.isBomb) {
            f.userData.missed = true;
            misses++;
            updateMisses();
            if (misses >= MAX_MISSES) {
              endGame();
            }
          }
          scene.remove(f);
          fruits.splice(i, 1);
        }
      }

      // Update sliced halves
      for (let i = slicedParts.length - 1; i >= 0; i--) {
        const h = slicedParts[i];
        h.position.x += h.userData.vx * dt;
        h.position.y += h.userData.vy * dt;
        h.position.z += (h.userData.vz || 0) * dt;
        h.userData.vy += GRAVITY * dt;
        h.rotation.x += (h.userData.rotSpeedX || 0) * dt;
        h.rotation.y += (h.userData.rotSpeedY || 0) * dt;
        h.rotation.z += (h.userData.rotSpeedZ || 0) * dt;
        h.userData.life -= dt * 0.4;

        if (!h.userData._meshes) {
          h.userData._meshes = [];
          h.traverse(child => {
            if (child.isMesh) {
              child.material.transparent = true;
              h.userData._meshes.push(child);
            }
          });
        }
        const opacity = Math.max(0, h.userData.life);
        for (let m = 0; m < h.userData._meshes.length; m++) {
          h.userData._meshes[m].material.opacity = opacity;
        }

        if (h.userData.life <= 0 || h.position.y < -10) {
          scene.remove(h);
          slicedParts.splice(i, 1);
        }
      }

      // Update juice particles
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
        }
      }

      // Update explosion particles
      for (let i = explosionParts.length - 1; i >= 0; i--) {
        const p = explosionParts[i];
        p.position.x += p.userData.vx * rawDt;
        p.position.y += p.userData.vy * rawDt;
        p.position.z += (p.userData.vz || 0) * rawDt;
        p.userData.vy += GRAVITY * 0.4 * rawDt;
        p.userData.life -= rawDt * p.userData.decay;
        p.material.opacity = Math.max(0, p.userData.life);

        if (p.userData.isRing) {
          const s = 1 + (1 - p.userData.life / 0.5) * 8;
          p.scale.setScalar(s);
        }

        if (p.userData.life <= 0) {
          scene.remove(p);
          explosionParts.splice(i, 1);
        }
      }
    }

    // Draw trail
    drawTrail();

    renderer.render(scene, camera);
  }

  clock = new THREE.Clock();
  animate();
})();
