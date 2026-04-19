// ============================================================
// GLTF Model Loaders
// ============================================================

const gltfLoader = new THREE.GLTFLoader();

export let dragonFruitModel = null;
export let watermelonModel = null;
export let watermelonHalfModel = null;
export let orangeWholeModel = null;
export let orangeHalfModel = null;
export let comicalBombModel = null;
export let fatManBombModel = null;

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
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log('Dragon fruit GLB loaded! Size:', size, 'Children:', model.children.length);

  model.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material.side = THREE.DoubleSide;
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
