import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_PATH = 'Room.gltf';

/**
 * Minimal first-person style controller that supports WASD movement and mouse-look.
 */
class FreeFlyControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.lastMouse = new THREE.Vector2();

    this.isDragging = false;
    this.acceleration = 24;
    this.damping = 6;
    this.maxSpeed = 18;
    this.lookSpeed = 0.0025;

    const orientation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = orientation.y;
    this.pitch = orientation.x;

    // Bind listeners so we can cleanly remove them later if needed.
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onContextMenu = (event) => event.preventDefault();

    window.addEventListener('keydown', this._onKeyDown, false);
    window.addEventListener('keyup', this._onKeyUp, false);
    this.domElement.addEventListener('mousedown', this._onMouseDown, false);
    window.addEventListener('mousemove', this._onMouseMove, false);
    window.addEventListener('mouseup', this._onMouseUp, false);
    this.domElement.addEventListener('mouseleave', this._onMouseUp, false);
    this.domElement.addEventListener('contextmenu', this._onContextMenu, false);

    this.updateCameraRotation();
  }

  onKeyDown(event) {
    if (event.repeat) {
      return;
    }
    const { code } = event;
    if (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD') {
      this.keys.add(code);
      event.preventDefault();
    }
  }

  onKeyUp(event) {
    const { code } = event;
    if (this.keys.has(code)) {
      this.keys.delete(code);
      event.preventDefault();
    }
  }

  onMouseDown(event) {
    if (event.button !== 0) {
      return;
    }
    this.isDragging = true;
    this.domElement.style.cursor = 'grabbing';
    this.lastMouse.set(event.clientX, event.clientY);
    event.preventDefault();
  }

  onMouseMove(event) {
    if (!this.isDragging) {
      return;
    }
    const deltaX = event.clientX - this.lastMouse.x;
    const deltaY = event.clientY - this.lastMouse.y;
    this.lastMouse.set(event.clientX, event.clientY);

    this.yaw -= deltaX * this.lookSpeed;
    this.pitch -= deltaY * this.lookSpeed;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.updateCameraRotation();
  }

  onMouseUp(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    this.isDragging = false;
    this.domElement.style.cursor = 'grab';
  }

  updateCameraRotation() {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  update(delta) {
    if (delta <= 0) {
      return;
    }

    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();

    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) {
      move.add(this.forward);
    }
    if (this.keys.has('KeyS')) {
      move.sub(this.forward);
    }
    if (this.keys.has('KeyA')) {
      move.sub(this.right);
    }
    if (this.keys.has('KeyD')) {
      move.add(this.right);
    }

    // Constrain movement to the horizontal plane for a grounded feel.
    move.y = 0;

    if (move.lengthSq() > 0) {
      move.normalize();
      this.velocity.addScaledVector(move, this.acceleration * delta);
    }

    // Apply damping to smooth out speed when no input is active.
    const dampingFactor = Math.exp(-this.damping * delta);
    this.velocity.multiplyScalar(dampingFactor);

    // Cap top speed to keep motion comfortable.
    const speed = this.velocity.length();
    if (speed > this.maxSpeed) {
      this.velocity.multiplyScalar(this.maxSpeed / speed);
    }

    this.camera.position.addScaledVector(this.velocity, delta);
  }
}

function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'grab';
  return renderer;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);
  return camera;
}

function addLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 1.8);
  directional.position.set(5, 10, 5);
  scene.add(directional);
}

function loadModel(path) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        reject(error);
      },
    );
  });
}

async function init() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101018);

  const camera = createCamera();
  const renderer = createRenderer();

  const container = document.querySelector('#app') || document.body;
  container.appendChild(renderer.domElement);

  addLights(scene);

  const controls = new FreeFlyControls(camera, renderer.domElement);
  const clock = new THREE.Clock();

  try {
    const model = await loadModel(MODEL_PATH);
    scene.add(model);
  } catch (error) {
    console.error(`Failed to load ${MODEL_PATH}:`, error);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', onWindowResize, false);

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    controls.update(delta);
    renderer.render(scene, camera);
  }

  animate();
}

init().catch((error) => {
  console.error('Unexpected error during initialization:', error);
});
