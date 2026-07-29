// ============================================================
// GLTF Model Loaders
// ============================================================

const gltfLoader = new THREE.GLTFLoader();
const dracoLoader = new THREE.DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

// Resolves once every GLB has finished loading (or failed)
let _resolveModelsReady;
export const modelsReady = new Promise(resolve => { _resolveModelsReady = resolve; });
let _modelsTotal = 12; // must match the number of load attempts below, including skipped heavy assets
let _modelsLoaded = 0;
function _onModelSettled() {
  if (++_modelsLoaded >= _modelsTotal) _resolveModelsReady();
}
function _skipHeavyModel(label) {
  console.info(`${label}: using procedural fallback to reduce startup cost`);
  _onModelSettled();
}

export let dragonFruitModel = null;
export let watermelonModel = null;
export let watermelonHalfModel = null;
export let orangeWholeModel = null;
export let orangeHalfModel = null;
export let papayaWholeModel = null;
export let papayaHalfModel = null;
export let mangoWholeModel = null;
export let mangoHalfModel = null;
export let kiwiWholeModel = null;
export let kiwiHalfModel = null;
export let pomegranateWholeModel = null;
export let pomegranateHalfModel = null;
export let comicalBombModel = null;
export let fatManBombModel = null;

// Shared helper: split a GLB containing whole + half side-by-side into two
// separate THREE.Groups. Clusters meshes along the X-axis midpoint, then picks
// the larger bounding-box volume as the whole and the smaller as the half.
// Returns { whole, half } or null if the GLB has no meshes.
function splitCombinedGLB(root, label) {
  root.updateWorldMatrix(true, true);

  const meshes = [];
  root.traverse(c => { if (c.isMesh) meshes.push(c); });
  console.log(`${label} GLB loaded, meshes:`, meshes.map(m => m.name));

  if (meshes.length === 0) {
    console.warn(`${label} GLB has no meshes`);
    return null;
  }

  const entries = meshes.map(m => {
    const box = new THREE.Box3().setFromObject(m);
    const center = new THREE.Vector3();
    box.getCenter(center);
    return { mesh: m, box, center };
  });

  entries.sort((a, b) => a.center.x - b.center.x);
  const midX = (entries[0].center.x + entries[entries.length - 1].center.x) / 2;

  const groupA = [];
  const groupB = [];
  for (const e of entries) {
    if (e.center.x < midX) groupA.push(e);
    else groupB.push(e);
  }

  if (groupA.length === 0 || groupB.length === 0) {
    console.warn(`${label}: could not separate whole and half, using full model for both`);
    return { whole: root.clone(true), half: root.clone(true) };
  }

  function clusterVolume(cluster) {
    const box = new THREE.Box3();
    cluster.forEach(e => box.union(e.box));
    const s = new THREE.Vector3();
    box.getSize(s);
    return s.x * s.y * s.z;
  }
  const volA = clusterVolume(groupA);
  const volB = clusterVolume(groupB);
  const wholeCluster = volA >= volB ? groupA : groupB;
  const halfCluster  = volA >= volB ? groupB : groupA;

  function buildGroup(cluster) {
    const g = new THREE.Group();
    for (const e of cluster) {
      const clone = e.mesh.clone();
      clone.material = e.mesh.material ? e.mesh.material.clone() : clone.material;
      e.mesh.updateWorldMatrix(true, false);
      clone.matrix.copy(e.mesh.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      if (clone.material) clone.material.side = THREE.DoubleSide;
      
      
      g.add(clone);
    }
    return g;
  }

  console.log(`${label} split → whole:`, wholeCluster.length, 'mesh(es), half:', halfCluster.length, 'mesh(es)');
  return { whole: buildGroup(wholeCluster), half: buildGroup(halfCluster) };
}

// Orange — single GLB containing BOTH whole and half side-by-side.
// Same spatial clustering strategy as pomegranate: split by X midpoint,
// then pick the larger-volume cluster as whole.
gltfLoader.load('3d_model/orange_model.glb', (gltf) => {
  const split = splitCombinedGLB(gltf.scene, 'Orange');
  if (split) { orangeWholeModel = split.whole; orangeHalfModel = split.half; }
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load orange_model.glb:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/watermelon.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  watermelonModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load watermelon.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/half_of_juicy_watermelon.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  watermelonHalfModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load half_of_juicy_watermelon.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/dragon_fruit.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {
       
      if (child.material) {
        child.material.side = THREE.DoubleSide;
        if (child.material.transparent && child.material.opacity === 0) child.material.opacity = 1;
      }
    }
  });
  dragonFruitModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load dragon_fruit.glb, using fallback geometry:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/papaya_fruit.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  papayaWholeModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load papaya_fruit.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/half_papaya.optimized.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  papayaHalfModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load half_papaya.optimized.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/mango.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  mangoWholeModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load mango.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/half_mango.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  mangoHalfModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load half_mango.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/kiwi.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  kiwiWholeModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load kiwi.glb, using fallback:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/half_kiwi.optimized.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  kiwiHalfModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load half_kiwi.optimized.glb, using fallback:', err);
  _onModelSettled();
});

// Pomegranate — single GLB containing BOTH whole and half side-by-side.
// Uses the shared GLTF loader with DRACOLoader enabled.
const pomegranateLoader = gltfLoader;

gltfLoader.load('3d_model/pomegranate.optimized.glb', (gltf) => {
  const split = splitCombinedGLB(gltf.scene, 'Pomegranate');
  if (split) { pomegranateWholeModel = split.whole; pomegranateHalfModel = split.half; }
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load pomegranate.optimized.glb:', err);
  _onModelSettled();
});

gltfLoader.load('3d_model/comical_bomb.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse(child => {
    if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
  });
  comicalBombModel = model;
  _onModelSettled();
}, null, (err) => {
  console.warn('Could not load comical_bomb.glb:', err);
  _onModelSettled();
});

// gltfLoader.load('3d_model/fat_man_bomb.glb', (gltf) => {
//   const model = gltf.scene;
//   model.traverse(child => {
//     if (child.isMesh) {   if (child.material) child.material.side = THREE.DoubleSide; }
//   });
//   fatManBombModel = model;
//   _onModelSettled();
// }, null, (err) => {
//   console.warn('Could not load fat_man_bomb.glb:', err);
//   _onModelSettled();
// });
