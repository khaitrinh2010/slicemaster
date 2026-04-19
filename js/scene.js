// ============================================================
// Three.js Scene Setup — camera, renderer, lights, env map
// ============================================================

const scene = new THREE.Scene();
const bgLoader = new THREE.TextureLoader();
bgLoader.load('background.jpg', (texture) => {
  scene.background = texture;
});
scene.fog = new THREE.Fog(0x1a0a2e, 40, 80);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5, 18);
camera.lookAt(0, 5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.localClippingEnabled = true;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

// Lighting
const ambientLight = new THREE.AmbientLight(0x8888cc, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(5, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(512, 512);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
rimLight.position.set(-5, 5, -10);
scene.add(rimLight);

// Procedural environment map for realistic reflections
const envScene = new THREE.Scene();
const envGeo = new THREE.BoxGeometry(20, 20, 20);
const envMats = [
  new THREE.MeshBasicMaterial({ color: 0x556688, side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ color: 0x445577, side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ color: 0x99aabb, side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ color: 0x222233, side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ color: 0x667799, side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ color: 0x556688, side: THREE.BackSide }),
];
envScene.add(new THREE.Mesh(envGeo, envMats));
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

export { scene, camera, renderer, envMap };
