import * as THREE from 'three';
import { DevUI } from '@iwer/devui';
import { XRDevice, metaQuest3 } from 'iwer';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PDBLoader } from 'three/addons/loaders/PDBLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const MODEL_SCALE = 0.03;
const MODEL_HOME = new THREE.Vector3(0, 1.42, -1.25);
const MODEL_TARGET = MODEL_HOME.clone();
const ATOM_OUTLINE_SCALE = 1.2;
const BOND_RADIUS = 0.032;
const BOND_OUTLINE_RADIUS = 0.052;
const OUTLINE_COLOR = 0x020617;
const BOND_CELL_SIZE = 2.2;
const MIN_BOND_LENGTH = 0.35;
const MAX_BOND_LENGTH = 2.05;
const ELEMENT_COLORS = {
  H: 0xf8fafc,
  C: 0xe2e8f0,
  N: 0x60a5fa,
  O: 0xfb7185,
  P: 0xfbbf24,
  S: 0xfacc15,
};
const ELEMENT_RADII = {
  H: 0.25,
  C: 0.46,
  N: 0.45,
  O: 0.42,
  P: 0.56,
  S: 0.54,
};
const COVALENT_RADII = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  P: 1.07,
  S: 1.05,
};
const VALENCE_LIMITS = {
  H: 1,
  C: 4,
  N: 4,
  O: 3,
  P: 6,
  S: 6,
};
const RESIDUE_COLORS = {
  A: 0x22d3ee,
  T: 0xfb923c,
  G: 0x4ade80,
  C: 0xf472b6,
  DA: 0x22d3ee,
  DT: 0xfb923c,
  DG: 0x4ade80,
  DC: 0xf472b6,
};
const CHAIN_COLORS = {
  A: 0x38bdf8,
  B: 0xf472b6,
  DEFAULT: 0xe2e8f0,
};
const SPIN_AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const HELIX_AXIS = new THREE.Vector3(0, 0, 1);
const ATOM_OUTLINE_LAYERS = [
  { scale: 1.32, color: 0x38bdf8, opacity: 0.22, side: THREE.BackSide },
  { scale: 1.25, color: 0xa78bfa, opacity: 0.36, side: THREE.BackSide },
  { scale: 1.16, color: OUTLINE_COLOR, opacity: 0.82, side: THREE.BackSide },
];
const BOND_OUTLINE_LAYERS = [
  { color: OUTLINE_COLOR, opacity: 0.72, side: THREE.FrontSide },
];
const VIEW_PRESETS = {
  front: {
    label: 'front',
    position: new THREE.Vector3(0, 1.55, 2.55),
    target: MODEL_TARGET,
    up: new THREE.Vector3(0, 1, 0),
  },
  side: {
    label: 'side',
    position: new THREE.Vector3(2.75, 1.5, -1.25),
    target: MODEL_TARGET,
    up: new THREE.Vector3(0, 1, 0),
  },
  top: {
    label: 'top',
    position: new THREE.Vector3(0, 3.25, -1.25),
    target: MODEL_TARGET,
    up: new THREE.Vector3(0, 0, -1),
  },
  iso: {
    label: 'isometric',
    position: new THREE.Vector3(1.9, 2.35, 1.05),
    target: MODEL_TARGET,
    up: new THREE.Vector3(0, 1, 0),
  },
};

const ui = {
  app: document.getElementById('app'),
  autoSpin: document.getElementById('auto-spin'),
  build: document.getElementById('build'),
  colorMode: document.getElementById('color-mode'),
  form: document.getElementById('form'),
  hydrogens: document.getElementById('hydrogens'),
  interactionMode: document.getElementById('interaction-mode'),
  reset: document.getElementById('reset'),
  resetAxisX: document.getElementById('reset-axis-x'),
  resetAxisY: document.getElementById('reset-axis-y'),
  runtime: document.getElementById('runtime-label'),
  sequence: document.getElementById('sequence'),
  spinAxis: document.getElementById('spin-axis'),
  status: document.getElementById('status'),
  viewPreset: document.getElementById('view-preset'),
};

let camera;
let clock;
let controls;
let currentPDBText = '';
let dragSpin = {
  active: false,
  lastX: 0,
  lastY: 0,
  pointerId: null,
};
let dnaRoot;
let grabbingController = null;
let lastMirrorPublishAt = 0;
let lastModelStats = null;
let modelGroup = null;
let mirrorPublishInFlight = false;
let pendingMirrorUpdate = null;
let player;
let renderer;
let scene;

function setStatus(message, kind = '') {
  ui.status.textContent = message;
  ui.status.className = `status ${kind}`.trim();
}

function isInXR() {
  return renderer?.xr?.isPresenting ?? false;
}

function vectorToArray(vector) {
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(5)));
}

function quaternionToArray(quaternion) {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
    .map((value) => Number(value.toFixed(6)));
}

function matrixToArray(matrix) {
  return matrix.elements.map((value) => Number(value.toFixed(6)));
}

function mirrorCameraSource() {
  if (!renderer || !camera) return camera;
  if (!isInXR()) return camera;
  const xrCamera = renderer.xr.getCamera(camera);
  return xrCamera.cameras?.[0] ?? xrCamera;
}

function captureObjectPose(object) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.matrixWorld.decompose(position, quaternion, scale);

  return {
    matrixWorld: matrixToArray(object.matrixWorld),
    position: vectorToArray(position),
    quaternion: quaternionToArray(quaternion),
    scale: vectorToArray(scale),
  };
}

function captureCameraPose() {
  const source = mirrorCameraSource();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  source.updateMatrixWorld(true);
  source.matrixWorld.decompose(position, quaternion, new THREE.Vector3());

  return {
    matrixWorld: matrixToArray(source.matrixWorld),
    position: vectorToArray(position),
    projectionMatrix: matrixToArray(source.projectionMatrix),
    quaternion: quaternionToArray(quaternion),
  };
}

function mirrorModelPayload(stats = lastModelStats) {
  return {
    atomCount: stats?.atomCount ?? null,
    bondCount: stats?.bondCount ?? null,
    colorMode: ui.colorMode.value,
    form: ui.form.value,
    hydrogens: ui.hydrogens.checked,
    pdb: currentPDBText,
    sequence: ui.sequence.value.trim().toUpperCase(),
  };
}

function mirrorPosePayload() {
  if (!dnaRoot || !camera) return null;

  return {
    camera: captureCameraPose(),
    dna: captureObjectPose(dnaRoot),
    grabbing: Boolean(grabbingController),
    spinAxis: ui.spinAxis.value,
    viewPreset: ui.viewPreset.value,
  };
}

function sendMirrorUpdate(update) {
  if (mirrorPublishInFlight) {
    pendingMirrorUpdate = update;
    return;
  }

  mirrorPublishInFlight = true;
  fetch('/mirror/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
    .catch(() => {
      // The mirror is optional; keep the VR session smooth if the laptop view is closed.
    })
    .finally(() => {
      mirrorPublishInFlight = false;
      const queued = pendingMirrorUpdate;
      pendingMirrorUpdate = null;
      if (queued) sendMirrorUpdate(queued);
    });
}

function publishMirrorFrame(force = false) {
  if (!modelGroup) return;
  const now = performance.now();
  if (!force && now - lastMirrorPublishAt < 90) return;
  lastMirrorPublishAt = now;

  const pose = mirrorPosePayload();
  if (!pose) return;

  sendMirrorUpdate({
    pose,
    source: {
      mode: isInXR() ? 'xr' : 'desktop',
    },
  });
}

function publishMirrorModel(stats = lastModelStats) {
  if (!modelGroup || !currentPDBText) return;
  const pose = mirrorPosePayload();
  sendMirrorUpdate({
    model: mirrorModelPayload(stats),
    pose,
    source: {
      mode: isInXR() ? 'xr' : 'desktop',
    },
  });
}

function setCameraInteractionEnabled() {
  if (!controls) return;
  controls.enabled = !isInXR();
  controls.enableRotate = ui.interactionMode.value === 'camera';
  controls.enablePan = true;
  controls.enableZoom = true;
}

async function installQuestRuntime() {
  let nativeWebXR = false;
  if (navigator.xr) {
    try {
      nativeWebXR = await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      nativeWebXR = false;
    }
  }

  if (nativeWebXR) {
    ui.runtime.textContent = 'Native WebXR detected';
    return;
  }

  // Meta's IWER runtime emulates the Quest 3 headset and Touch Plus controllers.
  const xrDevice = new XRDevice(metaQuest3);
  xrDevice.installRuntime();
  xrDevice.fovy = THREE.MathUtils.degToRad(75);
  xrDevice.ipd = 0;

  xrDevice.controllers.right.position.set(0.15649, 1.43474, -0.38368);
  xrDevice.controllers.right.quaternion.set(
    0.14766305685043335,
    0.02471366710960865,
    -0.0037767395842820406,
    0.9887216687202454,
  );
  xrDevice.controllers.left.position.set(-0.15649, 1.43474, -0.38368);
  xrDevice.controllers.left.quaternion.set(
    0.14766305685043335,
    0.02471366710960865,
    -0.0037767395842820406,
    0.9887216687202454,
  );

  window.xrdevice = xrDevice;
  new DevUI(xrDevice);
  ui.runtime.textContent = 'Meta Quest 3 · virtual runtime';
}

function createController(index) {
  const controller = renderer.xr.getController(index);

  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const ray = new THREE.Line(
    rayGeometry,
    new THREE.LineBasicMaterial({ color: index === 0 ? 0x38bdf8 : 0xf472b6 }),
  );
  ray.scale.z = 2;
  ray.visible = false;
  controller.add(ray);

  controller.addEventListener('connected', () => {
    ray.visible = true;
  });
  controller.addEventListener('disconnected', () => {
    ray.visible = false;
    if (grabbingController === controller) releaseDNA(controller);
  });
  controller.addEventListener('selectstart', () => grabDNA(controller));
  controller.addEventListener('selectend', () => releaseDNA(controller));
  controller.addEventListener('squeezestart', () => grabDNA(controller));
  controller.addEventListener('squeezeend', () => releaseDNA(controller));

  player.add(controller);
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111f);
  scene.fog = new THREE.Fog(0x07111f, 5, 12);
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  camera.position.set(0, 1.55, 2.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.xr.enabled = true;
  ui.app.appendChild(renderer.domElement);

  player = new THREE.Group();
  player.add(camera);
  scene.add(player);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(MODEL_TARGET);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  scene.add(new THREE.HemisphereLight(0xf8fbff, 0x12203a, 2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x7dd3fc, 1.2);
  fillLight.position.set(-3, 2.5, 1.5);
  scene.add(fillLight);

  const grid = new THREE.GridHelper(10, 40, 0x1d4ed8, 0x1e293b);
  grid.material.opacity = 0.42;
  grid.material.transparent = true;
  scene.add(grid);

  dnaRoot = new THREE.Group();
  scene.add(dnaRoot);
  resetDNA();
  applyViewPreset(ui.viewPreset.value, false);
  bindCanvasSpinControls();
  setCameraInteractionEnabled();

  createController(0);
  createController(1);

  const vrButton = VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor'],
  });
  vrButton.dataset.testid = 'enter-vr-button';
  document.body.appendChild(vrButton);

  renderer.xr.addEventListener('sessionstart', () => {
    document.body.classList.add('xr-active');
    setCameraInteractionEnabled();
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('xr-active');
    setCameraInteractionEnabled();
    if (grabbingController) releaseDNA(grabbingController);
  });

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    if (ui.autoSpin.checked && modelGroup && !grabbingController) {
      rotateDNA(delta * 0.75);
    }
    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
    publishMirrorFrame();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function rotateDNA(radians) {
  if (!dnaRoot || !modelGroup) return;
  const axis = SPIN_AXES[ui.spinAxis.value] ?? SPIN_AXES.z;
  dnaRoot.rotateOnWorldAxis(axis, radians);
}

function bindCanvasSpinControls() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    if (isInXR() || ui.interactionMode.value !== 'spin' || !modelGroup) return;
    if (event.button !== 0) return;
    event.preventDefault();
    dragSpin = {
      active: true,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerId: event.pointerId,
    };
    canvas.setPointerCapture(event.pointerId);
    setStatus('Spin mode: drag to rotate the DNA on the selected axis.', 'ok');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragSpin.active || dragSpin.pointerId !== event.pointerId) return;
    event.preventDefault();
    const axis = ui.spinAxis.value;
    const deltaX = event.clientX - dragSpin.lastX;
    const deltaY = event.clientY - dragSpin.lastY;
    const pixels = axis === 'x' ? -deltaY : deltaX;
    rotateDNA(pixels * 0.012);
    dragSpin.lastX = event.clientX;
    dragSpin.lastY = event.clientY;
  });
  const stopDrag = (event) => {
    if (!dragSpin.active || dragSpin.pointerId !== event.pointerId) return;
    dragSpin.active = false;
    dragSpin.pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
}

function applyViewPreset(presetName, announce = true) {
  if (!camera || !controls) return;
  const preset = VIEW_PRESETS[presetName] ?? VIEW_PRESETS.front;
  camera.up.copy(preset.up);
  camera.position.copy(preset.position);
  controls.target.copy(preset.target);
  controls.update();
  if (announce) setStatus(`Camera set to ${preset.label} view.`, 'ok');
}

function grabDNA(controller) {
  if (!modelGroup || grabbingController) return;
  grabbingController = controller;
  controller.attach(dnaRoot);
  setStatus('DNA grabbed — move the virtual controller to inspect it.', 'ok');
}

function releaseDNA(controller) {
  if (grabbingController !== controller) return;
  scene.attach(dnaRoot);
  grabbingController = null;
  setStatus('DNA released.', 'ok');
}

function resetDNA() {
  if (!dnaRoot || !scene) return;
  if (dnaRoot.parent !== scene) scene.attach(dnaRoot);
  grabbingController = null;
  dnaRoot.position.copy(MODEL_HOME);
  dnaRoot.quaternion.identity();
  dnaRoot.scale.setScalar(MODEL_SCALE);
  ui.spinAxis.value = 'z';
  setStatus(modelGroup ? 'Model pose reset to default Z helix axis.' : 'Scene ready. Building a sample…');
  publishMirrorFrame(true);
}

function resetDNAAxis(axisName) {
  if (!dnaRoot || !scene) return;
  if (dnaRoot.parent !== scene) scene.attach(dnaRoot);
  const targetAxis = SPIN_AXES[axisName] ?? SPIN_AXES.z;
  grabbingController = null;
  dnaRoot.position.copy(MODEL_HOME);
  dnaRoot.quaternion.setFromUnitVectors(HELIX_AXIS, targetAxis);
  dnaRoot.scale.setScalar(MODEL_SCALE);
  ui.spinAxis.value = axisName;
  setStatus(`DNA reset to ${axisName.toUpperCase()} axis. Drag now spins around ${axisName.toUpperCase()} only.`, 'ok');
  publishMirrorFrame(true);
}

function disposeModel() {
  if (!modelGroup) return;
  modelGroup.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material?.dispose();
    }
  });
  dnaRoot.remove(modelGroup);
  modelGroup = null;
}

function atomElement(line) {
  const explicit = line.slice(76, 78).trim().toUpperCase();
  if (explicit) return explicit;
  const atomName = line.slice(12, 16).trim().replace(/^[0-9]+/, '');
  return atomName.charAt(0).toUpperCase() || 'C';
}

function atomMetadata(line, index, atomCount) {
  const residue = line.slice(17, 20).trim().toUpperCase();
  const chain = line.slice(21, 22).trim().toUpperCase()
    || (index < atomCount / 2 ? 'A' : 'B');
  return {
    atomName: line.slice(12, 16).trim(),
    chain,
    element: atomElement(line),
    residue,
  };
}

function atomColor(meta) {
  const mode = ui.colorMode.value;
  if (mode === 'element') return ELEMENT_COLORS[meta.element] ?? 0xa3a3a3;
  if (mode === 'chain') return CHAIN_COLORS[meta.chain] ?? CHAIN_COLORS.DEFAULT;
  return RESIDUE_COLORS[meta.residue] ?? RESIDUE_COLORS[meta.residue.replace(/^D/, '')] ?? 0xe2e8f0;
}

function applyAtomColors() {
  if (!currentPDBText) return null;
  lastModelStats = loadPDB(currentPDBText, { resetPose: false });
  publishMirrorModel(lastModelStats);
  return lastModelStats;
}

function coordKey(x, y, z) {
  return `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
}

function cellKey(x, y, z) {
  return [
    Math.floor(x / BOND_CELL_SIZE),
    Math.floor(y / BOND_CELL_SIZE),
    Math.floor(z / BOND_CELL_SIZE),
  ].join(',');
}

function addBucketMatrix(buckets, color, matrix) {
  const key = color.toString(16).padStart(6, '0');
  if (!buckets.has(key)) {
    buckets.set(key, { color, matrices: [] });
  }
  buckets.get(key).matrices.push(matrix.clone());
}

function createColorMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
  });
}

function createOutlineMaterial({
  color = OUTLINE_COLOR,
  opacity = 1,
  side = THREE.FrontSide,
} = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    side,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    toneMapped: false,
  });
}

function scaledMatrix(matrix, scale) {
  const next = matrix.clone();
  next.scale(new THREE.Vector3(scale, scale, scale));
  return next;
}

function createMeshFromMatrices(geometry, material, matrices, matrixScale = 1) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => {
    mesh.setMatrixAt(index, matrixScale === 1 ? matrix : scaledMatrix(matrix, matrixScale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function createInstancedColorGroup(baseGeometry, buckets, countKey, count, options = {}) {
  const {
    outline = false,
    outlineGeometry = baseGeometry,
    outlineLayers = [],
    outlineScale = 1,
    outlineSide = THREE.FrontSide,
  } = options;
  const group = new THREE.Group();

  buckets.forEach(({ color, matrices }) => {
    if (outline) {
      const layers = outlineLayers.length
        ? outlineLayers
        : [{ color: OUTLINE_COLOR, opacity: 1, scale: outlineScale, side: outlineSide }];

      layers.forEach((layer) => {
        group.add(createMeshFromMatrices(
          outlineGeometry.clone(),
          createOutlineMaterial({
            color: layer.color,
            opacity: layer.opacity,
            side: layer.side ?? outlineSide,
          }),
          matrices,
          layer.scale ?? outlineScale,
        ));
      });
    }

    group.add(createMeshFromMatrices(
      baseGeometry.clone(),
      createColorMaterial(color),
      matrices,
    ));
  });

  baseGeometry.dispose();
  if (outlineGeometry !== baseGeometry) outlineGeometry.dispose();
  group.userData[countKey] = count;
  return group;
}

function createAtomInstances(geometryAtoms, pdbText, center) {
  const positions = geometryAtoms.getAttribute('position');
  const atomLines = pdbText
    .split(/\r?\n/)
    .filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'));
  const count = Math.min(positions.count, atomLines.length);
  const geometry = new THREE.SphereGeometry(1, 20, 14);
  const transform = new THREE.Object3D();
  const buckets = new Map();
  const positionColors = new Map();
  const atomRecords = [];

  for (let index = 0; index < count; index += 1) {
    const meta = atomMetadata(atomLines[index], index, count);
    const color = atomColor(meta);
    const radius = ELEMENT_RADII[meta.element] ?? 0.46;
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    positionColors.set(coordKey(x, y, z), color);
    atomRecords.push({
      ...meta,
      color,
      position: new THREE.Vector3(x, y, z),
    });
    transform.position
      .set(x, y, z)
      .sub(center);
    transform.scale.setScalar(radius);
    transform.updateMatrix();
    addBucketMatrix(buckets, color, transform.matrix);
  }

  const group = createInstancedColorGroup(geometry, buckets, 'atomCount', count, {
    outline: true,
    outlineLayers: ATOM_OUTLINE_LAYERS,
    outlineScale: ATOM_OUTLINE_SCALE,
    outlineSide: THREE.BackSide,
  });
  group.userData.positionColors = positionColors;
  group.userData.atomRecords = atomRecords;
  return group;
}

function bondThreshold(atomA, atomB) {
  if (atomA.element === 'H' && atomB.element === 'H') return 0;
  const radiusA = COVALENT_RADII[atomA.element] ?? 0.75;
  const radiusB = COVALENT_RADII[atomB.element] ?? 0.75;
  const slack = atomA.element === 'H' || atomB.element === 'H' ? 0.28 : 0.42;
  return Math.min(MAX_BOND_LENGTH, radiusA + radiusB + slack);
}

function inferBonds(atomRecords) {
  const candidates = [];
  const grid = new Map();

  atomRecords.forEach((atom, index) => {
    const position = atom.position;
    const cx = Math.floor(position.x / BOND_CELL_SIZE);
    const cy = Math.floor(position.y / BOND_CELL_SIZE);
    const cz = Math.floor(position.z / BOND_CELL_SIZE);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const neighbors = grid.get([cx + dx, cy + dy, cz + dz].join(','));
          if (!neighbors) continue;

          neighbors.forEach((neighborIndex) => {
            const neighbor = atomRecords[neighborIndex];
            const threshold = bondThreshold(atom, neighbor);
            if (!threshold) return;

            const distanceSquared = position.distanceToSquared(neighbor.position);
            if (
              distanceSquared >= MIN_BOND_LENGTH * MIN_BOND_LENGTH
              && distanceSquared <= threshold * threshold
            ) {
              candidates.push({
                a: index,
                b: neighborIndex,
                distanceSquared,
              });
            }
          });
        }
      }
    }

    const key = cellKey(position.x, position.y, position.z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(index);
  });

  candidates.sort((left, right) => left.distanceSquared - right.distanceSquared);

  const bondCounts = new Array(atomRecords.length).fill(0);
  const bonds = [];

  candidates.forEach((candidate) => {
    const atomA = atomRecords[candidate.a];
    const atomB = atomRecords[candidate.b];
    const limitA = VALENCE_LIMITS[atomA.element] ?? 4;
    const limitB = VALENCE_LIMITS[atomB.element] ?? 4;

    if (bondCounts[candidate.a] >= limitA || bondCounts[candidate.b] >= limitB) return;

    bondCounts[candidate.a] += 1;
    bondCounts[candidate.b] += 1;
    bonds.push(candidate);
  });

  return bonds;
}

function createBondInstances(atomRecords, center) {
  const bonds = inferBonds(atomRecords);
  if (!bonds.length) return null;

  const geometry = new THREE.CylinderGeometry(BOND_RADIUS, BOND_RADIUS, 1, 8, 1, false);
  const outlineGeometry = new THREE.CylinderGeometry(
    BOND_OUTLINE_RADIUS,
    BOND_OUTLINE_RADIUS,
    1,
    8,
    1,
    false,
  );
  const buckets = new Map();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const transform = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  bonds.forEach((bond) => {
    const atomA = atomRecords[bond.a];
    const atomB = atomRecords[bond.b];
    start.copy(atomA.position);
    end.copy(atomB.position);
    const color = atomA.color;
    midpoint.copy(start).add(end).multiplyScalar(0.5).sub(center);
    direction.copy(end).sub(start);
    const length = direction.length();
    quaternion.setFromUnitVectors(up, direction.normalize());
    scale.set(1, length, 1);
    transform.compose(midpoint, quaternion, scale);
    addBucketMatrix(buckets, color, transform);
  });

  return createInstancedColorGroup(geometry, buckets, 'bondCount', bonds.length, {
    outline: true,
    outlineGeometry,
    outlineLayers: BOND_OUTLINE_LAYERS,
  });
}

function loadPDB(pdbText, options = {}) {
  const { resetPose = true } = options;
  currentPDBText = pdbText;
  const parsed = new PDBLoader().parse(pdbText);
  const geometryAtoms = parsed.geometryAtoms;
  geometryAtoms.computeBoundingBox();
  const center = geometryAtoms.boundingBox.getCenter(new THREE.Vector3());

  const nextModel = new THREE.Group();
  const atoms = createAtomInstances(geometryAtoms, pdbText, center);
  const bonds = createBondInstances(atoms.userData.atomRecords, center);
  nextModel.add(atoms);
  if (bonds) nextModel.add(bonds);

  disposeModel();
  modelGroup = nextModel;
  dnaRoot.add(modelGroup);
  if (resetPose) resetDNA();

  return {
    atomCount: atoms.userData.atomCount,
    bondCount: bonds?.userData.bondCount ?? 0,
  };
}

function validateSequence(sequence, form) {
  if (!/^[ATGC]+$/.test(sequence)) {
    throw new Error('Sequence must contain only A, T, G, and C.');
  }
  if (sequence.length < 2) throw new Error('Sequence must contain at least two bases.');
  if (form === 'Z' && sequence.length % 2 !== 0) {
    throw new Error('Z-DNA requires an even-length sequence.');
  }
}

async function buildDNA() {
  const sequence = ui.sequence.value.trim().toUpperCase();
  const form = ui.form.value;
  ui.sequence.value = sequence;

  try {
    validateSequence(sequence, form);
    ui.build.disabled = true;
    setStatus(`Building ${form}-DNA…`);

    const response = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence,
        form,
        method: 'zmatrix',
        hydrogens: ui.hydrogens.checked,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Build failed (${response.status})`);

    const stats = loadPDB(data.pdb);
    lastModelStats = stats;
    publishMirrorModel(stats);
    setStatus(
      `${form}-DNA ready · ${sequence.length} bp · ${stats.atomCount} atoms · ${stats.bondCount} bond segments`,
      'ok',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    ui.build.disabled = false;
  }
}

async function main() {
  ui.build.addEventListener('click', buildDNA);
  ui.colorMode.addEventListener('change', () => {
    applyAtomColors();
    setStatus(`Color mode: ${ui.colorMode.options[ui.colorMode.selectedIndex].text}.`, 'ok');
  });
  ui.interactionMode.addEventListener('change', () => {
    setCameraInteractionEnabled();
    const message = ui.interactionMode.value === 'spin'
      ? 'Spin mode on: drag the DNA to rotate it on one axis.'
      : 'Move camera mode on: orbit, pan, and zoom around the DNA.';
    setStatus(message, 'ok');
  });
  ui.reset.addEventListener('click', resetDNA);
  ui.resetAxisX.addEventListener('click', () => resetDNAAxis('x'));
  ui.resetAxisY.addEventListener('click', () => resetDNAAxis('y'));
  ui.sequence.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') buildDNA();
  });
  ui.spinAxis.addEventListener('change', () => {
    setStatus(`Spin axis set to ${ui.spinAxis.value.toUpperCase()}.`, 'ok');
    publishMirrorFrame(true);
  });
  ui.viewPreset.addEventListener('change', () => {
    applyViewPreset(ui.viewPreset.value);
    publishMirrorFrame(true);
  });

  try {
    await installQuestRuntime();
    initScene();
    await buildDNA();
  } catch (error) {
    console.error(error);
    setStatus(`VR initialization failed: ${error.message}`, 'error');
  }
}

main();
