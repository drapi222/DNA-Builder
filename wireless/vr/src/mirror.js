import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PDBLoader } from 'three/addons/loaders/PDBLoader.js';

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
const ATOM_OUTLINE_LAYERS = [
  { scale: 1.32, color: 0x38bdf8, opacity: 0.22, side: THREE.BackSide },
  { scale: 1.25, color: 0xa78bfa, opacity: 0.36, side: THREE.BackSide },
  { scale: 1.16, color: OUTLINE_COLOR, opacity: 0.82, side: THREE.BackSide },
];
const BOND_OUTLINE_LAYERS = [
  { color: OUTLINE_COLOR, opacity: 0.72, side: THREE.FrontSide },
];

const ui = {
  app: document.getElementById('mirror-app'),
  atomLabel: document.getElementById('atom-label'),
  bondLabel: document.getElementById('bond-label'),
  connectionDot: document.getElementById('connection-dot'),
  connectionLabel: document.getElementById('connection-label'),
  fullscreen: document.getElementById('fullscreen-button'),
  moleculeLabel: document.getElementById('molecule-label'),
  resetCamera: document.getElementById('reset-camera-button'),
  viewLabel: document.getElementById('view-label'),
};

let camera;
let controls;
let currentModel = null;
let dnaRoot;
let followHeadset = true;
let lastAppliedModelKey = '';
let lastStateAt = 0;
let modelGroup = null;
let renderer;
let scene;

function arrayToVector3(values, fallback = new THREE.Vector3()) {
  return Array.isArray(values) && values.length >= 3
    ? new THREE.Vector3(values[0], values[1], values[2])
    : fallback.clone();
}

function setConnection(label, kind = '') {
  ui.connectionLabel.textContent = label;
  ui.connectionDot.className = `dot ${kind}`.trim();
}

function setModelLabels(model, stats = {}) {
  if (!model) {
    ui.moleculeLabel.textContent = 'No source yet';
    ui.atomLabel.textContent = '—';
    ui.bondLabel.textContent = '—';
    return;
  }

  ui.moleculeLabel.textContent = `${model.form || 'B'}-DNA · ${model.sequence || 'sequence'} · ${model.colorMode || 'base'} colors`;
  ui.atomLabel.textContent = String(stats.atomCount ?? model.atomCount ?? '—');
  ui.bondLabel.textContent = String(stats.bondCount ?? model.bondCount ?? '—');
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050b14);
  scene.fog = new THREE.Fog(0x050b14, 5.5, 14);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  ui.app.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  scene.add(new THREE.HemisphereLight(0xf8fbff, 0x12203a, 2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x7dd3fc, 1.2);
  fillLight.position.set(-3, 2.5, 1.5);
  scene.add(fillLight);

  const grid = new THREE.GridHelper(10, 40, 0x1d4ed8, 0x1e293b);
  grid.material.opacity = 0.38;
  grid.material.transparent = true;
  scene.add(grid);

  dnaRoot = new THREE.Group();
  scene.add(dnaRoot);
  useOverviewCamera(false);

  renderer.setAnimationLoop(() => {
    if (Date.now() - lastStateAt > 3500) {
      const label = lastStateAt ? 'Headset stream paused' : 'Waiting for headset…';
      setConnection(label, lastStateAt ? 'offline' : '');
    }

    if (controls.enabled) controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    if (!followHeadset) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function useOverviewCamera(updateButton = true) {
  followHeadset = false;
  camera.matrixAutoUpdate = true;
  camera.fov = 50;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.up.set(0, 1, 0);
  camera.position.set(1.9, 2.35, 1.05);
  camera.lookAt(MODEL_TARGET);
  camera.updateProjectionMatrix();
  controls.enabled = true;
  controls.target.copy(MODEL_TARGET);
  controls.update();
  if (updateButton) ui.resetCamera.textContent = 'Follow headset camera';
}

function followHeadsetCamera() {
  followHeadset = true;
  controls.enabled = false;
  ui.resetCamera.textContent = 'Use overview camera';
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
  const mode = currentModel?.colorMode || 'residue';
  if (mode === 'element') return ELEMENT_COLORS[meta.element] ?? 0xa3a3a3;
  if (mode === 'chain') return CHAIN_COLORS[meta.chain] ?? CHAIN_COLORS.DEFAULT;
  return RESIDUE_COLORS[meta.residue] ?? RESIDUE_COLORS[meta.residue.replace(/^D/, '')] ?? 0xe2e8f0;
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

function loadPDB(pdbText) {
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

  return {
    atomCount: atoms.userData.atomCount,
    bondCount: bonds?.userData.bondCount ?? 0,
  };
}

function applyObjectPose(object, pose) {
  if (!pose) return;

  if (Array.isArray(pose.matrixWorld) && pose.matrixWorld.length === 16) {
    object.matrix.fromArray(pose.matrixWorld);
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);
    return;
  }

  object.position.copy(arrayToVector3(pose.position, MODEL_HOME));
  if (Array.isArray(pose.quaternion) && pose.quaternion.length >= 4) {
    object.quaternion.fromArray(pose.quaternion);
  }

  const scale = pose.scale;
  if (Array.isArray(scale) && scale.length >= 3) {
    object.scale.set(scale[0], scale[1], scale[2]);
  } else if (Number.isFinite(scale)) {
    object.scale.setScalar(scale);
  } else {
    object.scale.setScalar(MODEL_SCALE);
  }
  object.updateMatrixWorld(true);
}

function applyCameraPose(cameraPose) {
  if (!followHeadset || !cameraPose) return;

  controls.enabled = false;
  camera.matrixAutoUpdate = false;

  if (Array.isArray(cameraPose.projectionMatrix) && cameraPose.projectionMatrix.length === 16) {
    camera.projectionMatrix.fromArray(cameraPose.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  if (Array.isArray(cameraPose.matrixWorld) && cameraPose.matrixWorld.length === 16) {
    camera.matrixWorld.fromArray(cameraPose.matrixWorld);
    camera.matrixWorld.decompose(camera.position, camera.quaternion, new THREE.Vector3());
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    return;
  }

  camera.position.copy(arrayToVector3(cameraPose.position, camera.position));
  if (Array.isArray(cameraPose.quaternion) && cameraPose.quaternion.length >= 4) {
    camera.quaternion.fromArray(cameraPose.quaternion);
  }
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

function applyMirrorState(state) {
  lastStateAt = Date.now();
  setConnection(state.source?.mode === 'xr' ? 'Live from Quest headset' : 'Live from desktop VR page', 'live');

  if (state.model?.pdb) {
    const nextModel = state.model;
    const modelKey = [
      nextModel.sequence,
      nextModel.form,
      nextModel.colorMode,
      nextModel.hydrogens ? 'h' : 'no-h',
      nextModel.pdb.length,
      nextModel.pdb.slice(0, 60),
    ].join('|');

    currentModel = nextModel;
    if (modelKey !== lastAppliedModelKey) {
      const stats = loadPDB(nextModel.pdb);
      lastAppliedModelKey = modelKey;
      setModelLabels(nextModel, stats);
    } else {
      setModelLabels(nextModel);
    }
  }

  applyObjectPose(dnaRoot, state.pose?.dna);
  applyCameraPose(state.pose?.camera);

  const mode = state.source?.mode === 'xr' ? 'headset' : 'desktop';
  const axis = state.pose?.spinAxis ? ` · ${state.pose.spinAxis.toUpperCase()} axis` : '';
  ui.viewLabel.textContent = `${mode}${axis}`;
}

async function fetchInitialState() {
  try {
    const response = await fetch('/mirror/state');
    if (!response.ok) return;
    const state = await response.json();
    if (state.model || state.pose) applyMirrorState(state);
  } catch {
    setConnection('Mirror server unavailable', 'offline');
  }
}

function connectMirrorEvents() {
  const events = new EventSource('/mirror/events');

  events.addEventListener('open', () => {
    if (!lastStateAt) setConnection('Connected · waiting for headset…');
  });

  events.addEventListener('state', (event) => {
    try {
      applyMirrorState(JSON.parse(event.data));
    } catch {
      setConnection('Bad mirror update received', 'offline');
    }
  });

  events.addEventListener('error', () => {
    if (Date.now() - lastStateAt > 1000) {
      setConnection('Reconnecting to mirror server…', 'offline');
    }
  });
}

function bindControls() {
  ui.fullscreen.addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const fullscreen = Boolean(document.fullscreenElement);
    document.body.classList.toggle('fullscreen', fullscreen);
    ui.fullscreen.textContent = fullscreen ? 'Exit fullscreen' : 'Fullscreen mirror';
  });

  ui.resetCamera.addEventListener('click', () => {
    if (followHeadset) {
      useOverviewCamera();
    } else {
      followHeadsetCamera();
    }
  });
}

initScene();
bindControls();
fetchInitialState();
connectMirrorEvents();
