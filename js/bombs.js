// ============================================================
// Bomb Builder
// ============================================================

import * as models from './models.js';

export function createBomb() {
  const group = new THREE.Group();
  const sourceModel = models.comicalBombModel;

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
  group.scale.setScalar(3.2); // was 5.0
  return group;
}
