import './glass-chrome/index.css';
import './styles.css';
import * as THREE from 'three';
import GUI from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import avatarUrl from './avatar.glb?url';
import { createNebulaSystem } from './nebulaSystem.js';
import { serializeTextareaContent } from './noteEditing.js';
import { formatPreviewNote, wrapPreviewText } from './previewText.js';
import { renderReaderTextElement } from './readerText.js';

const canvas = document.querySelector('#scene');
const nodeTitle = document.querySelector('#node-title');
const toolbarToggle = document.querySelector('#toolbar-toggle');
const mobileControls = document.querySelector('#mobile-controls');
const moveJoystick = document.querySelector('#move-joystick');
const moveStick = document.querySelector('#move-stick');
const mobileLiftButtons = document.querySelectorAll('.mobile-lift-button');
const app = document.querySelector('#app');
const noteReader = document.querySelector('#note-reader');
const noteReaderText = document.querySelector('#note-reader-text');
const desktopApi = window.oblivionDesktop;
const vaultPanel = document.querySelector('#vault-panel');
const vaultName = document.querySelector('#vault-name');
const vaultMeta = document.querySelector('#vault-meta');
const vaultChoose = document.querySelector('#vault-choose');
const cameraToggle = document.querySelector('#camera-toggle');
const avatarChoose = document.querySelector('#avatar-choose');
const avatarMeta = document.querySelector('#avatar-meta');
const avatarName = document.querySelector('#avatar-name');
const noteToggle = document.querySelector('#note-toggle');
const noteForm = document.querySelector('#note-form');
const noteTitleInput = document.querySelector('#note-title-input');
const noteBodyInput = document.querySelector('#note-body-input');
const noteLinksInput = document.querySelector('#note-links-input');
const linkMemory = document.querySelector('#link-memory');
const noteEdit = document.querySelector('#note-edit');
const noteCancel = document.querySelector('#note-cancel');
const noteSave = document.querySelector('#note-save');
const noteFormStatus = document.querySelector('#note-form-status');
const debugMode = new URLSearchParams(window.location.search).has('debug')
  || window.location.hash.toLowerCase().includes('debug');
const maxPixelRatio = 1.5;
const hoverRaycastInterval = 1 / 12;
const publicAsset = (assetPath) => `${import.meta.env.BASE_URL}${assetPath.replace(/^\/+/, '')}`;

const settings = {
  movementSpeed: 24,
  mouseSensitivity: 0.0026,
  cameraDistance: 11.9,
  cameraHeight: 1.8,
  cameraPitch: 0.12,
  cameraMode: 'third',
  galaxyScale: 30,
  nodeSize: 1.0,
  starBrightness: 0.8,
  linkOpacity: 0.56,
  graphSpring: 0.31,
  graphRepulsion: 0.67,
  graphAnchor: 0.68,
  ambientDrift: 0.1,
  avatarInfluence: 1.0,
  avatarScale: 2.35,
  avatarYawOffset: -0.0015,
  avatarFloat: 0.151,
  avatarHairWave: 0.059,
  avatarSkirtWave: 0.068,
  nebulaIntensity: 1.31,
  nebulaMotion: 0.9,
  brushScale: 2.42,
  bloomStrength: 0.78,
  bloomRadius: 1.03,
  bloomThreshold: 0.08,
  noise: 0.1,
  chromaticAberration: 0.0031,
  vignette: 0.52,
  painterlyMix: 0.52,
  backgroundColor: '#41354b',
  fogColor: '#050413',
  nebulaColorA: '#5f38da',
  nebulaColorB: '#ad5cff',
  nebulaColorC: '#27baa3',
  nodeLowColor: '#27baa3',
  nodeHighColor: '#c671f4',
  nodeActiveColor: '#e1b4f9',
  nodeNeighborColor: '#fff2ff',
  linkColor: '#623f97',
  linkActiveColor: '#ff6beb',
  labelColor: '#faf2ff',
  starLineThinness: 0.4,
  starSketchiness: 0,
  starFlareMotion: 1.45,
  starOrganicPull: 2.2,
  starFlareReach: 0.6,
  letterClusterDistance: 12,
  letterClusterSize: 1,
  letterClusterMotion: 1,
  previewDistance: 21,
  previewWords: 250,
  pullStrength: 1,
  introEnabled: true,
  introDuration: 3,
  introAvatarHold: 0,
  introNodeSpread: 1,
  introStartRadius: 1.6,
  showToolbar: false
};

function getViewportSize() {
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? 0;
  const viewportHeight = viewport?.height ?? 0;
  return {
    width: Math.max(1, Math.round(Math.max(window.innerWidth, viewportWidth))),
    height: Math.max(1, Math.round(Math.max(window.innerHeight, viewportHeight)))
  };
}

function setAppViewportHeight(height = getViewportSize().height) {
  app?.style.setProperty('--app-height', `${height}px`);
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
const initialViewportSize = getViewportSize();
setAppViewportHeight(initialViewportSize.height);
renderer.setSize(initialViewportSize.width, initialViewportSize.height);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
scene.background = new THREE.Color(settings.backgroundColor);
scene.fog = new THREE.FogExp2(settings.fogColor, 0.0045);
const previewScene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(54, initialViewportSize.width / initialViewportSize.height, 0.05, 2600);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(10, 10);
const keys = new Set();



const haloTexture = createRadialTexture(128);
const letterTextureCache = new Map();

const player = {
  position: new THREE.Vector3(0, 0, 12),
  velocity: new THREE.Vector3(),
  yaw: Math.PI,
  pitch: settings.cameraPitch
};

const cameraRig = {
  viewYaw: player.yaw,
  wasMoving: false
};

const introState = {
  startedAt: null,
  skipped: false
};

const interactionState = {
  pointerDown: false,
  pointerMoved: false,
  pullNode: null,
  releasedNode: null,
  releaseUntil: 0,
  pullAmount: 0
};

const mobileMoveState = {
  active: false,
  pointerId: null,
  x: 0,
  y: 0
};

const mobileLiftState = {
  up: false,
  down: false
};

const readerState = {
  open: false,
  closing: false,
  node: null,
  text: '',
  startedAt: 0,
  visibleCharacters: 0,
  closeTimer: null
};

const previewState = {
  node: null,
  group: null,
  text: '',
  opening: false,
  closing: false,
  progress: 0,
  requestedId: null
};

if (debugMode) {
  window.__oblivionDebug = {
    getPlayerPosition: () => player.position.toArray(),
    getMobileMove: () => ({ x: mobileMoveState.x, y: mobileMoveState.y }),
    getMobileLift: () => ({ up: mobileLiftState.up, down: mobileLiftState.down })
  };
}

const noteFormState = {
  mode: 'create',
  editingId: null,
  originalContent: null
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  settings.bloomStrength,
  settings.bloomRadius,
  settings.bloomThreshold
);
composer.addPass(bloomPass);

const PainterlyShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNoise: { value: settings.noise },
    uAberration: { value: settings.chromaticAberration },
    uVignette: { value: settings.vignette },
    uPainterly: { value: settings.painterlyMix }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNoise;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uPainterly;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float d = length(center);
      vec2 brushWarp = vec2(
        sin((vUv.y + uTime * 0.018) * 70.0),
        cos((vUv.x - uTime * 0.014) * 52.0)
      ) * 0.0018 * uPainterly;
      vec2 uv = vUv + brushWarp;
      vec2 offset = normalize(center + 0.0001) * uAberration * (0.45 + d * 1.8);
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g, b);
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 washed = mix(color, floor(color * 16.0) / 16.0, uPainterly * 0.22);
      color = mix(color, washed + luma * 0.035, uPainterly);
      float grain = hash(floor(vUv * vec2(960.0, 540.0)) + uTime) - 0.5;
      color += grain * uNoise;
      float vig = 1.0 - smoothstep(uVignette, 1.05, d);
      color *= vig;
      gl_FragColor = vec4(color, 1.0);
    }
  `
};
const painterlyPass = new ShaderPass(PainterlyShader);
composer.addPass(painterlyPass);

let nebulaSystem = null;
const nodeMeshes = [];
const nodeHalos = [];
const sharedNodeGeometry = new THREE.SphereGeometry(1, 14, 10);
const sharedHaloGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
const graphTemps = {
  anchor: new THREE.Vector3(),
  avatarDelta: new THREE.Vector3(),
  target: new THREE.Vector3(),
  repulsionDelta: new THREE.Vector3(),
  edgeDelta: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  nodeColor: new THREE.Color(),
  linkColor: new THREE.Color(),
  linkBaseColor: new THREE.Color(),
  linkActiveColor: new THREE.Color(),
  nodeLowColor: new THREE.Color(),
  nodeHighColor: new THREE.Color(),
  nodeActiveColor: new THREE.Color(),
  nodeNeighborColor: new THREE.Color()
};
const letterTemps = {
  target: new THREE.Vector3(),
  turbulence: new THREE.Vector3(),
  curl: new THREE.Vector3(),
  color: new THREE.Color()
};
const previewTemps = {
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  drift: new THREE.Vector3(),
  scatter: new THREE.Vector3(),
  target: new THREE.Vector3()
};
let graphState = null;
let hoveredNode = null;
let activeNode = null;
let linkGeometry = null;
let graphGroup = null;
let avatar = null;
let activeNodeId = null;
let activeStartedAt = 0;
let cameraDistanceController = null;
let renderedNodeTitleKey = '';
let nextHoverRaycastAt = 0;
let hoverNeedsUpdate = true;
let avatarSource = avatarUrl;
let currentVaultKey = null;
let randomizedInitialSpawn = false;
let layoutResetPending = false;

setupLights();
setupBackgroundStars();
nebulaSystem = createNebulaSystem({ scene, settings, seeded });
init();

async function init() {
  avatar = await createAvatar();
  scene.add(avatar);
  setupGui();
  setupVaultControls();

  const graph = await loadGraph();
  createGraph(graph);
  renderLinkMemory();
  animate();
}

async function loadGraph() {
  try {
    const response = await fetch(publicAsset('graph.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Graph request failed: ${response.status}`);
    return response.json();
  } catch (error) {
    console.warn(error);
    return {
      generatedAt: null,
      nodes: [],
      edges: []
    };
  }
}

function setupVaultControls() {
  if (!vaultPanel || !vaultName || !vaultMeta || !vaultChoose) return;
  if (!desktopApi) return;

  vaultPanel.hidden = false;
  updateCameraToggle();
  if (noteEdit) {
    noteEdit.hidden = false;
    noteEdit.disabled = true;
  }
  if (noteSave) noteSave.textContent = 'Save Note';
  linkMemory.hidden = false;
  renderLinkMemory();
  vaultChoose.addEventListener('click', async () => {
    vaultChoose.disabled = true;
    vaultMeta.textContent = 'Opening folder picker...';
    const status = await desktopApi.chooseVault();
    updateVaultStatus(status);
    createGraph(await loadGraph());
    vaultChoose.disabled = false;
  });

  cameraToggle?.addEventListener('click', toggleCameraMode);
  avatarChoose?.addEventListener('click', async () => {
    avatarChoose.disabled = true;
    const status = await desktopApi.chooseAvatar();
    updateVaultStatus(status);
    await syncAvatarFromStatus(status);
    avatarChoose.disabled = false;
  });
  noteToggle?.addEventListener('click', () => {
    if (noteForm?.hidden ?? true) openCreateNodeForm();
    else setNoteFormOpen(false);
  });
  noteEdit?.addEventListener('click', () => openEditNodeForm(activeNode));
  noteCancel?.addEventListener('click', () => setNoteFormOpen(false));
  noteForm?.addEventListener('submit', createNoteFromForm);
  noteLinksInput?.addEventListener('input', renderLinkMemory);

  desktopApi.getVault().then(async (status) => {
    updateVaultStatus(status);
    await syncAvatarFromStatus(status);
  });
  desktopApi.onVaultChanged(async (status) => {
    updateVaultStatus(status);
    await syncAvatarFromStatus(status);
    createGraph(await loadGraph());
    renderLinkMemory();
  });
}

function updateVaultStatus(status) {
  if (!status || !vaultName || !vaultMeta) return;

  if (avatarMeta && avatarName) {
    avatarMeta.hidden = false;
    avatarName.textContent = status.avatarName ?? 'Default';
    avatarName.title = status.avatarSelected ? status.avatarName : 'Default avatar';
  }

  const nextVaultKey = status.connected ? status.vaultRevision : null;
  if (nextVaultKey !== currentVaultKey) {
    currentVaultKey = nextVaultKey;
    randomizedInitialSpawn = false;
    layoutResetPending = true;
  }

  if (!status.connected) {
    vaultName.textContent = 'No vault connected';
    vaultMeta.textContent = 'Choose a local Markdown folder';
    return;
  }

  vaultName.textContent = status.vaultName ?? 'Selected vault';
  vaultName.title = status.vaultName ?? 'Selected vault';
  vaultMeta.textContent = status.error
    ? status.error
    : `${status.nodeCount} notes / ${status.edgeCount} links`;
}

async function syncAvatarFromStatus(status) {
  if (!status) return;
  const nextSource = status.avatarSelected ? `/api/avatar.glb?mtime=${Date.now()}` : avatarUrl;
  if (nextSource === avatarSource) return;
  avatarSource = nextSource;
  await replaceAvatar(nextSource);
}

function updateCameraToggle() {
  if (cameraToggle) {
    cameraToggle.textContent = 'POV';
    cameraToggle.title = settings.cameraMode === 'first' ? 'Switch to third person' : 'Switch to first person';
  }
  app?.classList.toggle('first-person', settings.cameraMode === 'first');
}

function toggleCameraMode() {
  settings.cameraMode = settings.cameraMode === 'first' ? 'third' : 'first';
  updateCameraToggle();
}

function openCreateNodeForm() {
  noteFormState.mode = 'create';
  noteFormState.editingId = null;
  noteFormState.originalContent = null;
  if (noteTitleInput) noteTitleInput.value = '';
  if (noteBodyInput) noteBodyInput.value = '';
  if (noteLinksInput) noteLinksInput.value = '';
  if (noteLinksInput) noteLinksInput.hidden = false;
  if (noteToggle) noteToggle.textContent = 'New Note';
  if (noteSave) noteSave.textContent = 'Save Note';
  setNoteFormOpen(true);
  renderLinkMemory();
}

async function openEditNodeForm(node) {
  if (!node || !noteTitleInput || !noteBodyInput || !noteLinksInput) {
    if (noteFormStatus) noteFormStatus.textContent = 'Move near a node to edit it.';
    return;
  }

  let note = null;
  try {
    note = await loadNote(node.id);
  } catch {
    if (noteFormStatus) noteFormStatus.textContent = 'Could not open that note for editing.';
    return;
  }
  if (!note) return;

  noteFormState.mode = 'edit';
  noteFormState.editingId = node.id;
  noteFormState.originalContent = note.content ?? '';
  noteTitleInput.value = note.title ?? node.title;
  noteBodyInput.value = noteFormState.originalContent;
  noteLinksInput.value = '';
  noteLinksInput.hidden = true;
  linkMemory.hidden = true;
  if (noteToggle) noteToggle.textContent = 'Editing';
  if (noteSave) noteSave.textContent = 'Save Edit';
  setNoteFormOpen(true);
  renderLinkMemory();
}

function setNoteFormOpen(open) {
  if (!noteForm) return;
  noteForm.hidden = !open;
  noteToggle?.classList.toggle('is-active', open);
  if (!open) {
    noteFormState.mode = 'create';
    noteFormState.editingId = null;
    noteFormState.originalContent = null;
    if (noteToggle) noteToggle.textContent = 'New Note';
    if (noteSave) noteSave.textContent = 'Save Note';
    if (noteLinksInput) noteLinksInput.hidden = false;
  }
  if (open) {
    if (noteFormStatus) noteFormStatus.textContent = '';
    noteTitleInput?.focus();
  }
}

function getLinkTokens() {
  return String(noteLinksInput?.value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function getActiveLinkQuery() {
  return String(noteLinksInput?.value ?? '').split(',').at(-1)?.trim() ?? '';
}

function setLinkTokens(tokens) {
  if (!noteLinksInput) return;
  noteLinksInput.value = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))].join(', ');
  renderLinkMemory();
  noteLinksInput.focus();
}

function addLinkToken(title) {
  const tokens = getLinkTokens();
  if (getActiveLinkQuery()) tokens.pop();
  setLinkTokens([...tokens, title]);
}

function getLinkOptions() {
  return (graphState?.graph?.nodes ?? [])
    .map((node) => ({
      id: node.id,
      title: node.title,
      stub: node.tags?.includes('stub'),
      degree: node.degree ?? 0
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function renderLinkMemory() {
  if (!linkMemory) return;
  if (noteFormState.mode === 'edit') {
    linkMemory.hidden = true;
    linkMemory.replaceChildren();
    return;
  }
  const options = getLinkOptions();
  const selected = new Set(getLinkTokens().map((token) => token.toLowerCase()));
  const query = getActiveLinkQuery().toLowerCase();
  const matches = options
    .filter((option) => option.id !== noteFormState.editingId)
    .filter((option) => !selected.has(option.title.toLowerCase()))
    .filter((option) => !query || option.title.toLowerCase().includes(query))
    .slice(0, 8);
  const canCreate = query && !options.some((option) => option.title.toLowerCase() === query);

  linkMemory.replaceChildren();
  for (const option of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gc-chip link-memory-option';
    button.textContent = option.stub ? `${option.title} stub` : option.title;
    button.addEventListener('click', () => addLinkToken(option.title));
    linkMemory.appendChild(button);
  }

  if (canCreate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gc-chip link-memory-option is-new';
    button.textContent = `Create "${getActiveLinkQuery()}"`;
    button.addEventListener('click', () => addLinkToken(getActiveLinkQuery()));
    linkMemory.appendChild(button);
  }

  linkMemory.hidden = linkMemory.childElementCount === 0;
}

async function createNoteFromForm(event) {
  event.preventDefault();
  if (!noteTitleInput || !noteBodyInput || !noteLinksInput || !noteFormStatus) return;

  noteFormStatus.textContent = 'Saving...';
  const wasEditing = noteFormState.mode === 'edit';
  const payload = {
    title: noteTitleInput.value,
    content: wasEditing
      ? serializeTextareaContent(noteBodyInput.value, noteFormState.originalContent)
      : noteBodyInput.value,
    links: wasEditing ? '' : noteLinksInput.value
  };
  let result = null;
  if (desktopApi) {
    result = wasEditing
      ? await desktopApi.updateNote({ ...payload, id: noteFormState.editingId })
      : await desktopApi.createNote(payload);
  }

  if (!result?.ok) {
    noteFormStatus.textContent = result?.error ?? 'Could not save note.';
    return;
  }

  if (wasEditing) {
    setNoteFormOpen(false);
  } else {
    noteTitleInput.value = '';
    noteBodyInput.value = '';
    noteLinksInput.value = '';
  }
  noteFormStatus.textContent = `Saved ${result.relativePath}`;
  updateVaultStatus(result.status);
  createGraph(await loadGraph());
  renderLinkMemory();
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xbba5ff, 0x05020a, 1.4));

  const violet = new THREE.PointLight(0x8d58ff, 72, 42, 1.8);
  violet.position.set(-8, 6, 8);
  scene.add(violet);

  const teal = new THREE.PointLight(0x45e9c6, 28, 55, 2.1);
  teal.position.set(18, -6, -14);
  scene.add(teal);

  const faceSoftener = new THREE.DirectionalLight(0xffd8f2, 1.2);
  faceSoftener.position.set(0, 5, 8);
  scene.add(faceSoftener);
}

function setupBackgroundStars() {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colorA = new THREE.Color(0xcbb7ff);
  const colorB = new THREE.Color(0x7df6df);
  const colorC = new THREE.Color(0xffb8e6);

  for (let i = 0; i < count; i += 1) {
    const radius = 140 + seeded(i, 9) * 820;
    const theta = seeded(i, 3) * Math.PI * 2;
    const phi = Math.acos(2 * seeded(i, 5) - 1);
    positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const color = colorA.clone().lerp(seeded(i, 1) > 0.72 ? colorB : colorC, seeded(i, 2) * 0.45);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    sizes[i] = 1.6 + Math.pow(seeded(i, 8), 7) * 22;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uBrightness: { value: settings.starBrightness },
      uTime: { value: 0 }
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uBrightness;
      uniform float uTime;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.72 + 0.28 * sin(uTime * 0.7 + position.x * 0.013 + position.z * 0.017);
        gl_PointSize = size * uBrightness * twinkle * (280.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float core = smoothstep(0.5, 0.0, d);
        float cross = max(
          smoothstep(0.028, 0.0, abs(p.x)) * smoothstep(0.5, 0.0, abs(p.y)),
          smoothstep(0.028, 0.0, abs(p.y)) * smoothstep(0.5, 0.0, abs(p.x))
        );
        gl_FragColor = vec4(vColor * (core + cross * 1.8), core * 0.85 + cross * 0.5);
      }
    `
  });

  const stars = new THREE.Points(geometry, material);
  stars.name = 'background-stars';
  scene.add(stars);
}

async function createAvatar(source = avatarUrl) {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(source);
  } catch (error) {
    console.warn('Unable to load avatar, falling back to default.', error);
    gltf = await new GLTFLoader().loadAsync(avatarUrl);
    avatarSource = avatarUrl;
  }
  const avatarGroup = new THREE.Group();
  avatarGroup.name = 'avatar';

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.scale.setScalar(settings.avatarScale);
  model.rotation.y = settings.avatarYawOffset;
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.frustumCulled = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      material.metalness = 0.02;
      material.roughness = 0.88;
      material.emissive = new THREE.Color(0x10051f);
      material.emissiveIntensity = 0.08;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
      attachAvatarWind(material);
    }
  });
  avatarGroup.add(model);

  const faceGlow = new THREE.PointLight(0xd7b4ff, 0.42, 2.2);
  faceGlow.position.set(0, 0.62 * settings.avatarScale, 0.55);
  avatarGroup.add(faceGlow);

  const violetRim = new THREE.PointLight(0x8c52ff, 1.8, 7.5, 1.5);
  violetRim.position.set(-1.1, 0.15, -1.45);
  avatarGroup.add(violetRim);

  const softKey = new THREE.DirectionalLight(0xf0d9ff, 0.65);
  softKey.position.set(0.7, 1.4, 1.2);
  avatarGroup.add(softKey);

  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture,
    color: 0x7d4dff,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  aura.position.set(0, -0.08, -0.62);
  aura.scale.set(4.4, 5.8, 1);
  avatarGroup.add(aura);

  avatarGroup.position.copy(player.position);
  avatarGroup.userData.model = model;
  avatarGroup.userData.windMaterials = [];
  avatarGroup.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material?.userData?.avatarWindEnabled) avatarGroup.userData.windMaterials.push(material);
    }
  });
  return avatarGroup;
}

async function replaceAvatar(source = avatarUrl) {
  const previousAvatar = avatar;
  const nextAvatar = await createAvatar(source);
  nextAvatar.position.copy(player.position);
  nextAvatar.rotation.copy(previousAvatar?.rotation ?? new THREE.Euler());
  avatar = nextAvatar;
  scene.add(avatar);

  if (previousAvatar) {
    scene.remove(previousAvatar);
    previousAvatar.traverse((child) => {
      if (child.geometry) child.geometry.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }
}

function attachAvatarWind(material) {
  material.userData.avatarWindEnabled = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAvatarTime = { value: 0 };
    shader.uniforms.uAvatarMotion = { value: 0 };
    shader.uniforms.uHairWave = { value: settings.avatarHairWave };
    shader.uniforms.uSkirtWave = { value: settings.avatarSkirtWave };
    material.userData.avatarWind = shader.uniforms;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uAvatarTime;
      uniform float uAvatarMotion;
      uniform float uHairWave;
      uniform float uSkirtWave;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float lateral = abs(position.x);
      float hairMask = smoothstep(0.18, 0.36, position.y) * smoothstep(0.08, 0.28, lateral);
      float skirtMask = smoothstep(-0.72, -0.18, position.y) * smoothstep(0.10, 0.34, lateral);
      float travel = 0.45 + uAvatarMotion * 1.2;
      float hairWind = sin(uAvatarTime * 1.35 + position.y * 8.0 + position.z * 7.0);
      float skirtWind = cos(uAvatarTime * 1.05 + position.x * 8.5 + position.y * 5.0);
      transformed.x += hairWind * hairMask * uHairWave * travel;
      transformed.z += cos(uAvatarTime * 1.2 + position.x * 9.0) * hairMask * uHairWave * 0.55 * travel;
      transformed.x += skirtWind * skirtMask * uSkirtWave * travel;
      transformed.y += sin(uAvatarTime * 1.4 + position.x * 7.0) * skirtMask * uSkirtWave * 0.18 * travel;`
    );
  };
  material.needsUpdate = true;
}

function createGraph(graph) {
  const previousState = layoutResetPending ? null : graphState;
  layoutResetPending = false;
  const previousNodeState = new Map();
  if (previousState) {
    for (const node of previousState.graph.nodes) {
      previousNodeState.set(node.id, {
        position: previousState.positions[node.index]?.clone(),
        renderPosition: previousState.renderPositions[node.index]?.clone(),
        anchor: previousState.anchors[node.index]?.clone(),
        velocity: previousState.velocities[node.index]?.clone()
      });
    }
  }

  if (graphGroup) {
    scene.remove(graphGroup);
    graphGroup.traverse((child) => {
      if (
        child.geometry
        && child.geometry !== sharedNodeGeometry
        && child.geometry !== sharedHaloGeometry
      ) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }
  nodeMeshes.length = 0;
  nodeHalos.length = 0;

  graphGroup = new THREE.Group();
  graphGroup.name = 'obsidian-graph';
  scene.add(graphGroup);

  const positions = [];
  const renderPositions = [];
  const anchors = [];
  const velocities = [];
  const nodeById = new Map();
  const adjacency = new Map();
  const maxDegree = Math.max(1, ...graph.nodes.map((node) => node.degree));
  const hasPreviousLayout = previousNodeState.size > 0;

  graph.nodes.forEach((node, index) => {
    const previous = previousNodeState.get(node.id);
    const p = previous?.position?.clone() ?? (
      hasPreviousLayout ? getNearbyNodeSpawn(index) : getDefaultNodeSpawn(index, graph.nodes.length)
    );
    const anchor = previous?.anchor?.clone() ?? p.clone();
    positions.push(p);
    renderPositions.push(previous?.renderPosition?.clone() ?? p.clone());
    anchors.push(anchor);
    velocities.push(previous?.velocity?.clone() ?? new THREE.Vector3());
    node.index = index;
    node.radius = 0.16 + Math.pow(node.degree / maxDegree, 0.58) * 0.92;
    node.neighbors = new Set();
    node.focus = 0;
    node.chain = 0;
    node.letterProgress = 0;
    node.chainDepth = Infinity;
    node.colorMix = Math.pow(node.degree / maxDegree, 0.62);
    nodeById.set(node.id, node);
    adjacency.set(node.id, node.neighbors);

    const color = getNodeBaseColor(node, maxDegree);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(sharedNodeGeometry, material);
    mesh.position.copy(p);
    mesh.scale.setScalar(node.radius * settings.nodeSize);
    mesh.userData.node = node;
    graphGroup.add(mesh);
    nodeMeshes.push(mesh);

    const halo = new THREE.Mesh(sharedHaloGeometry, createStarFlareMaterial(index, color));
    halo.position.copy(p);
    halo.scale.setScalar(node.radius * 11 * settings.nodeSize);
    graphGroup.add(halo);
    nodeHalos.push(halo);
  });

  const edgePairs = [];
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    source.neighbors.add(target.id);
    target.neighbors.add(source.id);
    edgePairs.push([source.index, target.index]);
  }

  linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePairs.length * 6), 3));
  linkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edgePairs.length * 6), 3));
  const linkMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: settings.linkOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const links = new THREE.LineSegments(linkGeometry, linkMaterial);
  graphGroup.add(links);

  const chainDepths = new Map();
  graphState = { graph, positions, renderPositions, anchors, velocities, nodeById, edgePairs, links, linkMaterial, maxDegree, chainDepths };
  randomizeInitialPlayerSpawn();
}

function getDefaultNodeSpawn(index, count) {
  const p = fibonacciSphere(index, count, settings.galaxyScale);
  p.add(new THREE.Vector3(
    (seeded(index, 1) - 0.5) * 34,
    (seeded(index, 2) - 0.5) * 34,
    (seeded(index, 3) - 0.5) * 34
  ));
  return p;
}

function getNearbyNodeSpawn(index) {
  const angle = seeded(index, 211) * Math.PI * 2;
  const radius = 5.5 + seeded(index, 212) * 8.5;
  return player.position.clone().add(new THREE.Vector3(
    Math.cos(angle) * radius,
    (seeded(index, 213) - 0.5) * 5.5,
    Math.sin(angle) * radius
  ));
}

function randomizeInitialPlayerSpawn() {
  if (randomizedInitialSpawn || !graphState?.graph.nodes.length) return;
  const index = Math.floor(Math.random() * graphState.graph.nodes.length);
  const center = graphState.positions[index] ?? new THREE.Vector3();
  const angle = Math.random() * Math.PI * 2;
  const radius = 7 + Math.random() * 16;
  player.position.copy(center).add(new THREE.Vector3(
    Math.cos(angle) * radius,
    (Math.random() - 0.5) * 8,
    Math.sin(angle) * radius
  ));
  player.velocity.set(0, 0, 0);
  player.yaw = angle + Math.PI;
  cameraRig.viewYaw = player.yaw;
  randomizedInitialSpawn = true;
}

function createStarFlareMaterial(index, color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: 0.22 },
      uTime: { value: 0 },
      uSeed: { value: index * 19.31 },
      uLineThinness: { value: settings.starLineThinness },
      uSketchiness: { value: settings.starSketchiness },
      uMotion: { value: settings.starFlareMotion },
      uOrganicPull: { value: settings.starOrganicPull },
      uReach: { value: settings.starFlareReach }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uSeed;
      uniform float uLineThinness;
      uniform float uSketchiness;
      uniform float uMotion;
      uniform float uOrganicPull;
      uniform float uReach;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i + uSeed);
        float b = hash(i + vec2(1.0, 0.0) + uSeed);
        float c = hash(i + vec2(0.0, 1.0) + uSeed);
        float d = hash(i + vec2(1.0, 1.0) + uSeed);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float ray(vec2 p, float angle, float width, float reach) {
        vec2 axis = vec2(cos(angle), sin(angle));
        float along = dot(p, axis);
        float cross = dot(p, vec2(-axis.y, axis.x));
        float wobble = sin(along * 28.0 + uTime * uMotion * 2.3 + uSeed) * 0.018 * uOrganicPull;
        wobble += (noise(vec2(along * 9.0, angle * 3.0 + uTime * uMotion)) - 0.5) * 0.026 * uSketchiness;
        float line = exp(-abs(cross + wobble) / max(width, 0.001));
        float fade = smoothstep(reach, 0.04, abs(along));
        float broken = smoothstep(0.18, 1.0, noise(vec2(along * 26.0, angle * 9.0 + uTime * uMotion * 0.8)));
        return line * fade * mix(1.0, broken, uSketchiness * 0.45);
      }

      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float a = atan(p.y, p.x);
        float t = uTime * uMotion;
        float width = 0.0065 / max(uLineThinness, 0.25);
        float pull = sin(a * 3.0 + t * 0.9 + uSeed) * 0.035 * uOrganicPull;
        vec2 warped = p + normalize(p + 0.0001) * pull * smoothstep(0.04, 0.5, r);

        float core = smoothstep(0.078, 0.0, r);
        float soft = smoothstep(0.34, 0.0, r) * 0.08;
        float rays = 0.0;
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float base = fi * 2.399 + uSeed * 0.017;
          float angle = base + sin(t * (0.22 + fi * 0.03) + uSeed + fi) * 0.38 * uOrganicPull;
          float reach = (0.22 + 0.24 * hash(vec2(fi, uSeed))) * uReach;
          rays += ray(warped, angle, width * (0.65 + hash(vec2(fi, 2.0)) * 1.2), reach);
        }

        float orbit = abs(sin((a + noise(p * 6.0 + t)) * 9.0 + t * 1.7));
        float ring = smoothstep(0.028, 0.0, abs(r - (0.20 + 0.05 * noise(vec2(a * 3.0, t)))));
        float sketch = ring * orbit * uSketchiness * 0.22;
        float speck = step(0.986 - uSketchiness * 0.01, noise(vUv * 92.0 + t * 0.8)) * smoothstep(0.48, 0.06, r) * 0.32;
        float alpha = (core * 0.58 + soft + rays * 0.72 + sketch + speck) * uOpacity;
        vec3 color = uColor * (core * 1.25 + soft * 0.45 + rays * 1.7 + sketch * 1.6 + speck * 1.5);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function updateLetterCluster(node, index, position, color, baseScale, reveal, elapsed, dt) {
  const progress = (node.letterProgress ?? 0) * reveal;
  if (progress > 0.025 && !node.letterCluster) {
    node.letterCluster = createLetterCluster(node, index);
    graphGroup.add(node.letterCluster);
  }
  if (!node.letterCluster) return;

  const cluster = node.letterCluster;
  cluster.visible = progress > 0.015;
  cluster.position.copy(position);
  cluster.quaternion.copy(camera.quaternion);

  const swirl = elapsed * settings.letterClusterMotion;
  const radius = Math.max(0.8, baseScale * (0.8 + settings.letterClusterSize * 1.0));
  const labelColor = letterTemps.color.set(settings.labelColor).lerp(color, 0.22);

  for (const sprite of cluster.children) {
    const target = letterTemps.target.copy(sprite.userData.target);
    const seed = sprite.userData.seed;
    const turbulence = letterTemps.turbulence.set(
      Math.sin(swirl * (1.0 + seed * 0.4) + seed * 11.1),
      Math.cos(swirl * (0.92 + seed * 0.3) + seed * 13.7),
      Math.sin(swirl * (1.42 + seed * 0.2) + seed * 17.3)
    ).multiplyScalar(0.22 + seed * 0.32);
    const curl = letterTemps.curl.set(
      Math.cos(swirl + seed * Math.PI * 2),
      Math.sin(swirl * 0.7 + seed * 5.4) * 0.35,
      Math.sin(swirl + seed * Math.PI * 2)
    ).multiplyScalar(sprite.userData.orbit * 0.38);

    target.multiplyScalar(radius * sprite.userData.radius);
    target.add(turbulence).add(curl);
    sprite.position.lerp(target, 1 - Math.pow(0.0008, dt));
    const previewHandoff = previewState.node?.id === node.id ? previewState.progress : 0;
    const clusterProgress = progress * (1 - previewHandoff);
    sprite.material.opacity = clusterProgress * sprite.userData.opacity;
    sprite.material.color.copy(labelColor);
    const spriteScale = (0.13 + sprite.userData.size * 0.16) * settings.letterClusterSize * (0.25 + clusterProgress * 0.75);
    sprite.scale.setScalar(spriteScale);
  }
}

function createLetterCluster(node, index) {
  const group = new THREE.Group();
  group.name = `letters-${node.id}`;
  const source = `${node.title} ${node.relativePath ?? node.id} ${(node.tags ?? []).join(' ')}`.toLowerCase();
  const characters = source.replace(/[^a-z0-9._/ -]/g, '').replace(/\s+/g, '');
  const pool = characters.length > 0 ? characters : node.title.toLowerCase();
  const count = Math.min(92, Math.max(38, Math.floor(28 + node.degree * 3.2 + node.title.length * 1.8)));

  for (let i = 0; i < count; i += 1) {
    const useDot = seeded(index * 97 + i, 63) > 0.72;
    const charIndex = Math.floor(seeded(index * 101 + i, 64) * Math.max(pool.length, 1));
    const char = useDot ? '.' : pool.charAt(charIndex) || '.';
    const material = new THREE.SpriteMaterial({
      map: createLetterTexture(char),
      color: settings.labelColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(material);
    const shell = fibonacciSphere(i, count, 1);
    if (seeded(index * 113 + i, 67) > 0.58) {
      shell.multiplyScalar(0.16 + seeded(index * 127 + i, 68) * 0.55);
    }
    sprite.userData.target = shell;
    sprite.userData.seed = seeded(index * 131 + i, 69);
    sprite.userData.radius = 0.72 + seeded(index * 137 + i, 70) * 0.72;
    sprite.userData.orbit = seeded(index * 139 + i, 71);
    sprite.userData.opacity = useDot ? 0.42 + seeded(index * 149 + i, 72) * 0.24 : 0.68 + seeded(index * 151 + i, 73) * 0.28;
    sprite.userData.size = useDot ? 0.42 : 0.74 + seeded(index * 157 + i, 74) * 0.8;
    group.add(sprite);
  }

  group.visible = false;
  return group;
}

function createLetterTexture(char) {
  const key = char || '.';
  if (letterTextureCache.has(key)) return letterTextureCache.get(key);

  const size = 64;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  context.font = '500 42px Menlo, Monaco, Consolas, "DejaVu Sans Mono", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(255, 242, 255, 0.8)';
  context.shadowBlur = 8;
  context.fillStyle = 'rgba(255, 250, 255, 0.98)';
  context.fillText(key, size / 2, size / 2 + 1);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  letterTextureCache.set(key, texture);
  return texture;
}

function getNodeBaseColor(node, maxDegree = graphState?.maxDegree ?? 1) {
  const density = Math.max(0, Math.min(1, node.degree / Math.max(1, maxDegree)));
  return new THREE.Color(settings.nodeLowColor).lerp(new THREE.Color(settings.nodeHighColor), Math.pow(density, 0.62));
}

function updateChainDepths(active) {
  if (!graphState) return;
  graphState.chainDepths.clear();
  if (!active) return;

  const queue = [{ id: active.id, depth: 0 }];
  graphState.chainDepths.set(active.id, 0);

  while (queue.length) {
    const { id, depth } = queue.shift();
    if (depth >= 2) continue;
    const node = graphState.nodeById.get(id);
    if (!node) continue;
    for (const neighborId of node.neighbors) {
      if (graphState.chainDepths.has(neighborId)) continue;
      graphState.chainDepths.set(neighborId, depth + 1);
      queue.push({ id: neighborId, depth: depth + 1 });
    }
  }
}

function updateGraph(dt, elapsed) {
  if (!graphState) return;

  const { graph, positions, renderPositions, anchors, velocities, edgePairs, linkMaterial, maxDegree } = graphState;
  const avatarPosition = player.position;
  const intro = getIntroState(elapsed);
  const nearest = findNearestNode(avatarPosition, 20);
  const active = intro.active ? null : hoveredNode ?? nearest;
  const nextActiveNodeId = active?.id ?? null;
  if (nextActiveNodeId !== activeNodeId) {
    activeNodeId = nextActiveNodeId;
    activeStartedAt = elapsed;
    updateChainDepths(active);
  }
  activeNode = active;
  if (noteEdit) {
    noteEdit.disabled = !active;
    noteEdit.title = active ? `Edit ${active.title}` : 'Move near a node to edit it';
  }
  const activeNeighbors = active ? active.neighbors : null;
  if (interactionState.releasedNode && elapsed > interactionState.releaseUntil) {
    interactionState.releasedNode = null;
  }
  const pulledNode = interactionState.pullNode;
  interactionState.pullAmount = THREE.MathUtils.damp(
    interactionState.pullAmount,
    ((interactionState.pointerDown && interactionState.pullNode) ) ? 1 : 0,
    6,
    dt
  );

  const {
    anchor,
    avatarDelta,
    target,
    repulsionDelta,
    edgeDelta,
    scale: scaleTarget,
    nodeColor,
    linkColor,
    linkBaseColor,
    linkActiveColor,
    nodeLowColor,
    nodeHighColor,
    nodeActiveColor,
    nodeNeighborColor
  } = graphTemps;
  nodeLowColor.set(settings.nodeLowColor);
  nodeHighColor.set(settings.nodeHighColor);
  nodeActiveColor.set(settings.nodeActiveColor);
  nodeNeighborColor.set(settings.nodeNeighborColor);
  linkBaseColor.set(settings.linkColor);
  linkActiveColor.set(settings.linkActiveColor);

  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i];
    const v = velocities[i];
    const node = graph.nodes[i];

    anchor.copy(anchors[i]);
    anchor.x += Math.sin(elapsed * 0.17 + i * 2.31) * settings.ambientDrift;
    anchor.y += Math.cos(elapsed * 0.13 + i * 1.73) * settings.ambientDrift;
    anchor.z += Math.sin(elapsed * 0.11 + i * 1.19) * settings.ambientDrift;
    v.addScaledVector(anchor.sub(p), settings.graphAnchor * 0.18 * dt);

    avatarDelta.copy(p).sub(avatarPosition);
    const distance = Math.max(avatarDelta.length(), 0.001);
    const direction = avatarDelta.multiplyScalar(1 / distance);

    if (active && node.id === active.id) {
      target.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(10).add(avatarPosition);
      v.addScaledVector(target.sub(p), 0.32 * settings.avatarInfluence * dt);
    } else if (activeNeighbors?.has(node.id)) {
      target.copy(direction).multiplyScalar(9 + node.radius * 3).add(avatarPosition);
      v.addScaledVector(target.sub(p), 0.11 * settings.avatarInfluence * dt);
    } else if (distance < 18) {
      v.addScaledVector(direction, (18 - distance) * 0.46 * settings.avatarInfluence * dt);
    }

    if (
      pulledNode
      && pulledNode.neighbors?.has(node.id)
      && interactionState.pullAmount > 0.02
    ) {
      const orbitAngle = seeded(i, 83) * Math.PI * 2 + elapsed * 0.6;
      target.set(
        Math.cos(orbitAngle) * (3.6 + seeded(i, 84) * 2.6),
        (seeded(i, 85) - 0.5) * 4.4,
        Math.sin(orbitAngle) * (3.6 + seeded(i, 86) * 2.6)
      ).add(avatarPosition);
      v.addScaledVector(target.sub(p), 0.46 * settings.pullStrength * interactionState.pullAmount * dt);
    }

    if (interactionState.releasedNode?.neighbors?.has(node.id)) {
      target.copy(anchors[i]);
      v.addScaledVector(target.sub(p), 1.25 * settings.pullStrength * dt);
    }

    for (let j = i + 1; j < positions.length; j += 1) {
      const other = positions[j];
      repulsionDelta.copy(p).sub(other);
      const d2 = Math.max(repulsionDelta.lengthSq(), 0.12);
      if (d2 > 900) continue;
      const strength = settings.graphRepulsion * 0.36 / d2;
      repulsionDelta.multiplyScalar(1 / Math.sqrt(d2));
      v.addScaledVector(repulsionDelta, strength * dt);
      velocities[j].addScaledVector(repulsionDelta, -strength * dt);
    }
  }

  const chainAge = elapsed - activeStartedAt;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const node = graph.nodes[i];
    const distance = positions[i].distanceTo(avatarPosition);
    const proximityFocus = active?.id === node.id
      ? 1
      : Math.max(0, 1 - THREE.MathUtils.smoothstep(distance, 7, 20));
    const hoverFocus = hoveredNode?.id === node.id ? 1 : 0;
    const focusTarget = Math.max(proximityFocus, hoverFocus);
    const depth = graphState.chainDepths.get(node.id);
    const waveDelay = Number.isFinite(depth) ? depth * 0.34 : 999;
    const chainTarget = Number.isFinite(depth) && depth <= 2
      ? THREE.MathUtils.smoothstep(chainAge, waveDelay, waveDelay + 0.72) * Math.pow(0.48, depth)
      : 0;
    node.focus = THREE.MathUtils.damp(node.focus ?? 0, focusTarget, 3.2, dt);
    node.chain = THREE.MathUtils.damp(node.chain ?? 0, chainTarget, 2.4, dt);
    node.chainDepth = depth ?? Infinity;
    const letterTarget = !intro.active && (distance < settings.letterClusterDistance || focusTarget > 0.85) ? 1 : 0;
    node.letterProgress = THREE.MathUtils.damp(node.letterProgress ?? 0, letterTarget, 4.2, dt);
  }

  for (const [a, b] of edgePairs) {
    const pa = positions[a];
    const pb = positions[b];
    edgeDelta.copy(pb).sub(pa);
    const distance = Math.max(edgeDelta.length(), 0.001);
    const desired = 22 + (graph.nodes[a].radius + graph.nodes[b].radius) * 6.5;
    const force = (distance - desired) * 0.012 * settings.graphSpring;
    edgeDelta.multiplyScalar(1 / distance);
    velocities[a].addScaledVector(edgeDelta, force * dt);
    velocities[b].addScaledVector(edgeDelta, -force * dt);
  }

  for (let i = 0; i < positions.length; i += 1) {
    velocities[i].multiplyScalar(Math.pow(0.18, dt));
    positions[i].addScaledVector(velocities[i], dt * 10);
    const node = graph.nodes[i];
    const focus = node.focus ?? 0;
    const chain = node.chain ?? 0;
    const glow = Math.max(focus, chain * 0.72);
    const pulse = 1 + Math.sin(elapsed * 3.2 + i) * 0.045;
    const scale = node.radius * settings.nodeSize * pulse * (1 + focus * 0.58 + chain * 0.24);
    const color = nodeColor.copy(nodeLowColor)
      .lerp(nodeHighColor, node.colorMix ?? Math.pow(node.degree / maxDegree, 0.62))
      .lerp(nodeNeighborColor, chain * 0.68)
      .lerp(nodeActiveColor, focus * 0.85);
    const reveal = getIntroNodeReveal(i, elapsed);
    const startPosition = getIntroNodeStart(i, graph.nodes.length);
    renderPositions[i].copy(startPosition).lerp(positions[i], easeOutCubic(reveal));
    const visualScale = scale * (0.05 + reveal * 0.95);
    nodeMeshes[i].position.copy(renderPositions[i]);
    nodeMeshes[i].scale.lerp(scaleTarget.set(visualScale, visualScale, visualScale), 0.14);
    nodeMeshes[i].material.color.copy(color);
    nodeMeshes[i].material.opacity = (0.5 + glow * 0.34) * reveal * (1 - (node.letterProgress ?? 0) * 0.72);
    nodeHalos[i].position.copy(renderPositions[i]);
    if (!nodeHalos[i].isSprite) nodeHalos[i].quaternion.copy(camera.quaternion);
    nodeHalos[i].scale.setScalar(scale * (5.4 + focus * 3.2 + chain * 2.4) * (0.2 + reveal * 0.8));
    const haloUniforms = nodeHalos[i].material.uniforms;
    if (haloUniforms) {
      haloUniforms.uColor.value.copy(color);
      haloUniforms.uOpacity.value = (0.08 + focus * 0.2 + chain * 0.13) * reveal;
      haloUniforms.uTime.value = elapsed;
      haloUniforms.uLineThinness.value = settings.starLineThinness;
      haloUniforms.uSketchiness.value = settings.starSketchiness;
      haloUniforms.uMotion.value = settings.starFlareMotion;
      haloUniforms.uOrganicPull.value = settings.starOrganicPull;
      haloUniforms.uReach.value = settings.starFlareReach;
    } else {
      nodeHalos[i].material.color.copy(color);
      nodeHalos[i].material.opacity = (0.12 + focus * 0.32 + chain * 0.22) * reveal;
    }
    updateLetterCluster(node, i, renderPositions[i], color, visualScale, reveal, elapsed, dt);
  }

  const linkPositions = linkGeometry.attributes.position.array;
  const linkColors = linkGeometry.attributes.color.array;
  for (let i = 0; i < edgePairs.length; i += 1) {
    const [a, b] = edgePairs[i];
    const pa = renderPositions[a];
    const pb = renderPositions[b];
    const sourceNode = graph.nodes[a];
    const targetNode = graph.nodes[b];
    const edgeGlow = Math.max(sourceNode.chain ?? 0, targetNode.chain ?? 0, sourceNode.focus ?? 0, targetNode.focus ?? 0);
    const edgeReveal = Math.min(getIntroNodeReveal(a, elapsed), getIntroNodeReveal(b, elapsed));
    const edgeColor = linkColor.copy(linkBaseColor).lerp(linkActiveColor, edgeGlow).multiplyScalar(edgeReveal);
    const jitter = Math.sin(elapsed * 0.9 + i * 12.31) * 0.02;
    linkPositions[i * 6 + 0] = pa.x + jitter;
    linkPositions[i * 6 + 1] = pa.y;
    linkPositions[i * 6 + 2] = pa.z - jitter;
    linkPositions[i * 6 + 3] = pb.x - jitter;
    linkPositions[i * 6 + 4] = pb.y;
    linkPositions[i * 6 + 5] = pb.z + jitter;
    linkColors[i * 6 + 0] = edgeColor.r;
    linkColors[i * 6 + 1] = edgeColor.g;
    linkColors[i * 6 + 2] = edgeColor.b;
    linkColors[i * 6 + 3] = edgeColor.r;
    linkColors[i * 6 + 4] = edgeColor.g;
    linkColors[i * 6 + 5] = edgeColor.b;
  }
  linkGeometry.attributes.position.needsUpdate = true;
  linkGeometry.attributes.color.needsUpdate = true;
  linkMaterial.opacity = settings.linkOpacity * (1 + (active ? 0.18 : 0));

  updateNodeTitle(active, active ? renderPositions[active.index] : null);
  updatePreviewCluster(dt, elapsed);
}

function updateNodeTitle(node, position) {
  if (!node) {
    nodeTitle.classList.remove('is-visible');
    renderedNodeTitleKey = '';
    return;
  }
  const titleKey = `${node.id}:${node.title}`;
  if (renderedNodeTitleKey !== titleKey) {
    renderedNodeTitleKey = titleKey;
    nodeTitle.replaceChildren(...createFloatingTitleSpans(node));
  }
  nodeTitle.style.color = settings.labelColor;
  if (position) {
    const labelPosition = position.clone();
    const breathe = Math.sin(clock.elapsedTime * 0.85 + node.index * 0.73) * 0.22;
    labelPosition.y += node.radius * settings.nodeSize * (2.2 + breathe) + 0.78;
    labelPosition.x += Math.sin(clock.elapsedTime * 0.52 + node.index * 1.9) * 0.18;
    labelPosition.z += Math.cos(clock.elapsedTime * 0.47 + node.index * 1.4) * 0.18;
    labelPosition.project(camera);
    const x = (labelPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-labelPosition.y * 0.5 + 0.5) * window.innerHeight;
    nodeTitle.style.left = `${x}px`;
    nodeTitle.style.top = `${y}px`;
  }
  nodeTitle.classList.add('is-visible');
}

function createFloatingTitleSpans(node) {
  return [...node.title].map((character, index) => {
    const span = document.createElement('span');
    span.className = 'node-title-char';
    span.textContent = character === ' ' ? '\u00a0' : character;
    span.style.setProperty('--float-x', `${(seeded(node.index * 53 + index, 181) - 0.5) * 9}px`);
    span.style.setProperty('--float-y', `${(seeded(node.index * 1 + index, 182) - 0) * 1}px`);
    span.style.setProperty('--float-r', `${(seeded(node.index * 61 + index, 183) - 0.5) * 8}deg`);
    span.style.setProperty('--delay', `${seeded(node.index * 67 + index, 184) * -1.7}s`);
    span.style.setProperty('--duration', `${2.4 + seeded(node.index * 71 + index, 185) * 2.6}s`);
    return span;
  });
}

async function openActivePreview() {
  if (!activeNode) return;
  if (previewState.node?.id === activeNode.id && previewState.group && !previewState.closing) {
    closePreviewCluster();
    return;
  }

  const node = activeNode;
  closePreviewCluster(true);
  previewState.node = node;
  previewState.opening = true;
  previewState.closing = false;
  previewState.progress = 0;
  previewState.text = 'opening note...';
  previewState.requestedId = node.id;
  previewState.group = createPreviewCluster(node, previewState.text);
  previewScene.add(previewState.group);

  try {
    const note = await loadNote(node.id);
    if (previewState.requestedId !== node.id) return;
    previewState.text = formatPreviewNote(note, settings.previewWords);
  } catch {
    previewState.text = 'Unable to open this note from the local vault server.';
  }

  if (previewState.node?.id === node.id) rebuildPreviewCluster(previewState.node, previewState.text);
}

async function loadNote(id) {
  const response = await fetch(`/api/note?id=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Note unavailable');
  return response.json();
}

function renderReaderText(text) {
  renderReaderTextElement(noteReaderText, text);
}

function closePreviewCluster(immediate = false) {
  if (!previewState.group) return;
  previewState.closing = true;
  previewState.opening = false;
  previewState.requestedId = null;
  if (immediate) removePreviewCluster();
}

function removePreviewCluster() {
  if (previewState.group) {
    previewScene.remove(previewState.group);
    previewState.group.traverse((child) => {
      child.material?.dispose?.();
    });
  }
  previewState.node = null;
  previewState.group = null;
  previewState.text = '';
  previewState.opening = false;
  previewState.closing = false;
  previewState.progress = 0;
}

function rebuildPreviewCluster(node, text) {
  if (previewState.group) {
    previewScene.remove(previewState.group);
    previewState.group.traverse((child) => child.material?.dispose?.());
  }
  previewState.group = createPreviewCluster(node, text);
  previewScene.add(previewState.group);
  previewState.progress = 0;
  previewState.opening = true;
  previewState.closing = false;
}

function updatePreviewCluster(dt, elapsed) {
  const node = previewState.node;
  const group = previewState.group;
  if (!node || !group || !graphState) return;

  const position = graphState.renderPositions[node.index];
  const avatarDistance = graphState.positions[node.index].distanceTo(player.position);
  if (!previewState.closing && avatarDistance > settings.previewDistance) closePreviewCluster();

  const targetProgress = previewState.closing ? 0 : 1;
  previewState.progress = THREE.MathUtils.damp(previewState.progress, targetProgress, 4.8, dt);
  if (previewState.closing && previewState.progress < 0.02) {
    removePreviewCluster();
    return;
  }

  group.visible = previewState.progress > 0.01;
  const cameraRight = previewTemps.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const cameraUp = previewTemps.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  group.position.copy(position)
    .add(cameraRight.multiplyScalar(node.radius * settings.nodeSize * 1.3 + 4.65))
    .add(cameraUp.multiplyScalar(node.radius * settings.nodeSize * 0.95 - 1.5));
  group.quaternion.copy(camera.quaternion);

  for (const sprite of group.children) {
    const drift = previewTemps.drift.set(
      Math.sin(elapsed * 0.8 + sprite.userData.seed * 12.3),
      Math.cos(elapsed * 0.7 + sprite.userData.seed * 15.1),
      Math.sin(elapsed * 1.1 + sprite.userData.seed * 17.9)
    ).multiplyScalar(0.035);
    const scatter = previewTemps.scatter.copy(sprite.userData.scatter).multiplyScalar(1 - previewState.progress);
    const target = previewTemps.target.copy(sprite.userData.textPosition).multiplyScalar(previewState.progress).add(scatter).add(drift);
    sprite.position.lerp(target, 1 - Math.pow(0.0008, dt));
    sprite.material.opacity = previewState.progress * sprite.userData.opacity;
    const scale = sprite.userData.scale * (0.35 + previewState.progress * 0.65);
    sprite.scale.setScalar(scale);
  }
}

function createPreviewCluster(node, rawText) {
  const group = new THREE.Group();
  group.name = `preview-${node.id}`;
  const lines = wrapPreviewText(rawText, 46, 11);
  const charSpacing = 0.2;
  const lineHeight = 0.38;
  const totalHeight = lines.length * lineHeight;
  const maxLineWidth = Math.max(...lines.map((line) => Math.max(1, line.length - 1) * charSpacing));
  const color = new THREE.Color(settings.labelColor);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineWidth = Math.max(1, line.length - 1) * charSpacing;
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex];
      if (char === ' ') continue;
      const material = new THREE.SpriteMaterial({
        map: createLetterTexture(char),
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(material);
      const seedBase = node.index * 211 + lineIndex * 59 + charIndex;
      sprite.userData.seed = seeded(seedBase, 191);
      sprite.userData.textPosition = new THREE.Vector3(
        charIndex * charSpacing - maxLineWidth * 0.5,
        -lineIndex * lineHeight + totalHeight * 0.5,
        0
      );
      sprite.userData.scatter = fibonacciSphere(seedBase % 89, 89, 1.1 + seeded(seedBase, 192) * 2.6);
      sprite.userData.opacity = 0.62 + seeded(seedBase, 193) * 0.34;
      sprite.userData.scale = char === '.' ? 0.22 : 0.35;
      sprite.position.copy(sprite.userData.scatter);
      group.add(sprite);
    }
  }

  group.visible = false;
  return group;
}

async function openActiveNote() {
  if (readerState.open || !activeNode) return;
  readerState.open = true;
  readerState.closing = false;
  readerState.node = activeNode;
  readerState.startedAt = clock.elapsedTime;
  readerState.visibleCharacters = 0;
  app?.classList.add('reader-open');
  noteReader?.classList.add('is-open', 'is-typing');
  noteReader?.classList.remove('is-closing');
  noteReader?.setAttribute('aria-hidden', 'false');
  if (noteReaderText) noteReaderText.textContent = 'opening note...';

  try {
    const note = await loadNote(activeNode.id);
    readerState.text = `---\n${activeNode.title}\n${note.relativePath ?? activeNode.relativePath ?? activeNode.id}\n---\n\n${note.content}`;
  } catch {
    readerState.text = `---\n${activeNode.title}\n---\n\nUnable to open this markdown file from the local vault server.`;
  }
  readerState.startedAt = clock.elapsedTime;
  readerState.visibleCharacters = 0;
  if (noteReaderText) noteReaderText.textContent = '';
}

function updateNoteReader(elapsed) {
  if (!readerState.open || readerState.closing || !noteReaderText) return;
  const age = elapsed - readerState.startedAt;
  const targetCharacters = Math.min(readerState.text.length, Math.floor(age * 1850));
  if (targetCharacters === readerState.visibleCharacters) return;
  readerState.visibleCharacters = targetCharacters;
  if (targetCharacters >= readerState.text.length) {
    renderReaderText(readerState.text);
    noteReader?.classList.remove('is-typing');
  } else {
    noteReaderText.textContent = readerState.text.slice(0, targetCharacters);
  }
}

function closeNoteReader() {
  if (!readerState.open || readerState.closing || !noteReaderText) return;
  readerState.closing = true;
  noteReader?.classList.remove('is-typing');
  noteReader?.classList.add('is-closing');
  scatterReaderText(noteReaderText.textContent || readerState.text);
  clearTimeout(readerState.closeTimer);
  readerState.closeTimer = setTimeout(() => {
    readerState.open = false;
    readerState.closing = false;
    readerState.node = null;
    readerState.text = '';
    readerState.visibleCharacters = 0;
    noteReader?.classList.remove('is-open', 'is-closing');
    noteReader?.setAttribute('aria-hidden', 'true');
    app?.classList.remove('reader-open');
    if (noteReaderText) noteReaderText.textContent = '';
  }, 950);
}

function scatterReaderText(text) {
  if (!noteReaderText) return;
  const fragment = document.createDocumentFragment();
  const visibleText = text.slice(0, 5200);
  for (let i = 0; i < visibleText.length; i += 1) {
    const char = visibleText[i];
    if (char === '\n') {
      fragment.appendChild(document.createElement('br'));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'reader-char';
    span.textContent = char === ' ' ? '\u00a0' : char;
    const seed = seeded(i, 121);
    const angle = seed * Math.PI * 2;
    const distance = 80 + seeded(i, 122) * 760;
    span.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    span.style.setProperty('--dy', `${Math.sin(angle) * distance * 0.45 + 120 + seeded(i, 123) * 360}px`);
    span.style.setProperty('--rot', `${(seeded(i, 124) - 0.5) * 220}deg`);
    span.style.setProperty('--delay', `${seeded(i, 125) * 0.18}s`);
    fragment.appendChild(span);
  }
  noteReaderText.textContent = '';
  noteReaderText.appendChild(fragment);
}

function isMovementKey(code) {
  return code === 'KeyW'
    || code === 'KeyA'
    || code === 'KeyS'
    || code === 'KeyD'
    || code === 'Space'
    || code === 'ShiftLeft'
    || code === 'ShiftRight';
}

function isTextInputTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function findNearestNode(position, maxDistance) {
  if (!graphState) return null;
  let nearest = null;
  let nearestDistanceSq = maxDistance * maxDistance;
  graphState.graph.nodes.forEach((node, index) => {
    const distanceSq = graphState.positions[index].distanceToSquared(position);
    if (distanceSq < nearestDistanceSq) {
      nearest = node;
      nearestDistanceSq = distanceSq;
    }
  });
  return nearest;
}

function updateHover(elapsed = clock.elapsedTime, force = false) {
  if (!force && !hoverNeedsUpdate && elapsed < nextHoverRaycastAt) return;
  hoverNeedsUpdate = false;
  nextHoverRaycastAt = elapsed + hoverRaycastInterval;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(nodeMeshes, false);
  hoveredNode = hits[0]?.object?.userData?.node ?? null;
}

function updateAvatar(dt, elapsed) {
  const intro = getIntroState(elapsed);
  const movementLocked = intro.active;
  const moving = !movementLocked && hasMovementInput();
  cameraRig.wasMoving = moving;

  const forward = getForward(cameraRig.viewYaw);
  const right = getRight(cameraRig.viewYaw);
  const move = new THREE.Vector3();

  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (Math.abs(mobileMoveState.y) > 0.08) move.addScaledVector(forward, mobileMoveState.y);
  if (Math.abs(mobileMoveState.x) > 0.08) move.addScaledVector(right, mobileMoveState.x);
  if (keys.has('Space')) move.y += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) move.y -= 1;
  if (mobileLiftState.up) move.y += 1;
  if (mobileLiftState.down) move.y -= 1;


  if (movementLocked) {
    player.velocity.multiplyScalar(Math.pow(0.02, dt));
  } else if (move.lengthSq() > 0) {
    const moveAmount = THREE.MathUtils.clamp(move.length(), 0, 1);
    move.normalize().multiplyScalar(settings.movementSpeed * moveAmount);
    player.velocity.lerp(move, 0.22);
  } else {
    player.velocity.multiplyScalar(Math.pow(0.03, dt));
  }

  player.position.addScaledVector(player.velocity, dt);
  const normalizedSpeed = THREE.MathUtils.clamp(player.velocity.length() / settings.movementSpeed, 0, 1);
  avatar.userData.motion = THREE.MathUtils.damp(avatar.userData.motion ?? 0, normalizedSpeed, 5, dt);
  const horizontalVelocity = new THREE.Vector3(player.velocity.x, 0, player.velocity.z);
  const horizontalSpeed = horizontalVelocity.length();
  if (!intro.active && horizontalVelocity.lengthSq() > 0.02) {
    const targetYaw = Math.atan2(horizontalVelocity.x, horizontalVelocity.z);
    player.yaw = lerpAngle(player.yaw, targetYaw, 1 - Math.pow(0.001, dt));
  }
  avatar.position.copy(player.position);
  const leanStrength = intro.active
    ? 0
    : THREE.MathUtils.smoothstep(horizontalSpeed / settings.movementSpeed, 0.04, 0.9);
  avatar.rotation.y = player.yaw;
  avatar.rotation.z = Math.sin(elapsed * 2.3) * 0.018;
  avatar.position.y += Math.sin(elapsed * 1.6) * settings.avatarFloat;
  if (avatar.userData.model) {
    avatar.userData.model.scale.setScalar(settings.avatarScale);
    avatar.userData.model.rotation.y = settings.avatarYawOffset;
    avatar.userData.model.rotation.x = THREE.MathUtils.damp(
      avatar.userData.model.rotation.x,
      0.18 * leanStrength,
      5.5,
      dt
    );
  }

  const firstPerson = settings.cameraMode === 'first' && !intro.active;
  avatar.visible = !firstPerson;

  const lookTarget = player.position.clone().add(new THREE.Vector3(0, 0.55, 0));
  if (intro.active) {
    const orbitProgress = THREE.MathUtils.smoothstep(intro.progress, 0.52, 1.0);
    const introDistance = THREE.MathUtils.lerp(5.2, settings.cameraDistance, easeInOutCubic(intro.progress));
    const introCamera = lookTarget.clone().add(
      getForward(player.yaw + Math.PI * orbitProgress).multiplyScalar(introDistance)
    );
    introCamera.y += THREE.MathUtils.lerp(0.35, settings.cameraHeight, easeInOutCubic(intro.progress));
    camera.position.lerp(introCamera, 1 - Math.pow(0.0005, dt));
    camera.lookAt(lookTarget);
    return;
  }

  if (firstPerson) {
    const eye = player.position.clone().add(new THREE.Vector3(0, Math.max(0.8, settings.cameraHeight), 0));
    const lookDirection = getForward(cameraRig.viewYaw);
    lookDirection.y = Math.sin(player.pitch);
    lookDirection.normalize();
    camera.position.lerp(eye, 1 - Math.pow(0.0005, dt));
    camera.lookAt(eye.add(lookDirection.multiplyScalar(10)));
    return;
  }

  const cameraForward = getForward(cameraRig.viewYaw);
  const pitchLift = Math.sin(player.pitch) * settings.cameraDistance;
  const cameraOffset = cameraForward.clone().multiplyScalar(-settings.cameraDistance);
  cameraOffset.y += settings.cameraHeight + pitchLift;
  const desiredCamera = lookTarget.clone().add(cameraOffset);
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, dt));
  camera.lookAt(lookTarget);
}

function getForward(yaw = player.yaw) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

function getRight(yaw = player.yaw) {
  const forward = getForward(yaw);
  return new THREE.Vector3(-forward.z, 0, forward.x).normalize();
}

function hasMovementInput() {
  return keys.has('KeyW')
    || keys.has('KeyA')
    || keys.has('KeyS')
    || keys.has('KeyD')
    || keys.has('Space')
    || keys.has('ShiftLeft')
    || keys.has('ShiftRight')
    || Math.abs(mobileMoveState.x) > 0.08
    || Math.abs(mobileMoveState.y) > 0.08
    || mobileLiftState.up
    || mobileLiftState.down;
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(a, b, t) {
  return a + normalizeAngle(b - a) * t;
}

function getIntroState(elapsed) {
  if (!settings.introEnabled || introState.skipped) return { active: false, progress: 1, age: Infinity };
  if (introState.startedAt === null) introState.startedAt = elapsed;
  const age = elapsed - introState.startedAt;
  const progress = THREE.MathUtils.clamp(age / Math.max(0.1, settings.introDuration), 0, 1);
  return { active: progress < 1, progress, age };
}

function getIntroNodeReveal(index, elapsed) {
  if (!settings.introEnabled || introState.skipped || introState.startedAt === null) return 1;
  const age = elapsed - introState.startedAt;
  if (age >= settings.introDuration) return 1;
  const available = Math.max(0.4, settings.introDuration - settings.introAvatarHold - 1.2);
  const spread = Math.max(settings.introNodeSpread, available);
  const delay = settings.introAvatarHold + seeded(index, 92) * spread;
  return THREE.MathUtils.smoothstep(age, delay, delay + 1.55);
}

function getIntroNodeStart(index, count) {
  const start = fibonacciSphere(index, count, settings.introStartRadius);
  start.x += (seeded(index, 71) - 0.5) * 0.9;
  start.y += (seeded(index, 72) - 0.5) * 0.9;
  start.z += (seeded(index, 73) - 0.5) * 0.9;
  return player.position.clone().add(start);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);
}

function easeInOutCubic(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function replayIntro() {
  introState.startedAt = null;
  introState.skipped = false;
}

function setupGui() {
  const gui = new GUI({ title: 'Oblivion Dev Tools', width: 310 });
  gui.hide();

  const cameraFolder = gui.addFolder('Navigation');
  cameraFolder.add(settings, 'movementSpeed', 4, 44, 0.5);
  cameraFolder.add(settings, 'mouseSensitivity', 0.0005, 0.008, 0.0001);
  cameraDistanceController = cameraFolder.add(settings, 'cameraDistance', 3.5, 46, 0.1);
  cameraFolder.add(settings, 'cameraHeight', 0.5, 12, 0.1);

  const colorFolder = gui.addFolder('Colours');
  colorFolder.addColor(settings, 'backgroundColor').onChange(refreshSceneColors);
  colorFolder.addColor(settings, 'fogColor').onChange(refreshSceneColors);
  colorFolder.addColor(settings, 'nebulaColorA').onChange(refreshSceneColors);
  colorFolder.addColor(settings, 'nebulaColorB').onChange(refreshSceneColors);
  colorFolder.addColor(settings, 'nebulaColorC').onChange(refreshSceneColors);
  colorFolder.addColor(settings, 'nodeLowColor');
  colorFolder.addColor(settings, 'nodeHighColor');
  colorFolder.addColor(settings, 'nodeActiveColor');
  colorFolder.addColor(settings, 'nodeNeighborColor');
  colorFolder.addColor(settings, 'linkColor');
  colorFolder.addColor(settings, 'linkActiveColor');
  colorFolder.addColor(settings, 'labelColor');

  const avatarFolder = gui.addFolder('Avatar');
  avatarFolder.add(settings, 'avatarScale', 0.4, 3.5, 0.01);
  avatarFolder.add(settings, 'avatarYawOffset', -Math.PI, Math.PI, 0.01);
  avatarFolder.add(settings, 'avatarFloat', 0, 0.24, 0.001);

  toolbarToggle.addEventListener('click', () => toggleGui(gui));
  window.addEventListener('keydown', (event) => {
    if (isTextInputTarget(event.target)) return;
    if (event.code === 'KeyT' && !event.repeat) toggleGui(gui);
  });
}

function toggleGui(gui) {
  settings.showToolbar = !settings.showToolbar;
  if (settings.showToolbar) gui.show();
  else gui.hide();
}

function updateUniforms(elapsed) {
  scene.background.set(settings.backgroundColor);
  scene.fog.color.set(settings.fogColor);

  bloomPass.strength = settings.bloomStrength;
  bloomPass.radius = settings.bloomRadius;
  bloomPass.threshold = settings.bloomThreshold;
  painterlyPass.uniforms.uTime.value = elapsed;
  painterlyPass.uniforms.uNoise.value = settings.noise;
  painterlyPass.uniforms.uAberration.value = settings.chromaticAberration;
  painterlyPass.uniforms.uVignette.value = settings.vignette;
  painterlyPass.uniforms.uPainterly.value = settings.painterlyMix;

  const stars = scene.getObjectByName('background-stars');
  if (stars) {
    stars.material.uniforms.uBrightness.value = settings.starBrightness;
    stars.material.uniforms.uTime.value = elapsed;
  }

  if (avatar?.userData?.windMaterials) {
    for (const material of avatar.userData.windMaterials) {
      const uniforms = material.userData.avatarWind;
      if (!uniforms) continue;
      uniforms.uAvatarTime.value = elapsed;
      uniforms.uAvatarMotion.value = avatar.userData.motion ?? 0;
      uniforms.uHairWave.value = settings.avatarHairWave;
      uniforms.uSkirtWave.value = settings.avatarSkirtWave;
    }
  }
}

function refreshSceneColors() {
  scene.background.set(settings.backgroundColor);
  scene.fog.color.set(settings.fogColor);
  nebulaSystem?.refreshColors();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  updateNoteReader(elapsed);
  updateHover(elapsed);
  updateAvatar(dt, elapsed);
  updateGraph(dt, elapsed);
  updateUniforms(elapsed);
  nebulaSystem?.update(elapsed, dt);

  composer.render();
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(previewScene, camera);
  renderer.autoClear = previousAutoClear;
}

function fibonacciSphere(index, count, radius) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(1, count - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = golden * index;
  return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius);
}

function seeded(index, salt) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function createRadialTexture(size) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarFlareTexture(size) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  const center = size / 2;

  context.clearRect(0, 0, size, size);
  context.globalCompositeOperation = 'lighter';

  const glow = context.createRadialGradient(center, center, 0, center, center, center * 0.72);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.12, 'rgba(255,235,255,0.95)');
  glow.addColorStop(0.34, 'rgba(210,168,255,0.26)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  drawFlareStroke(context, center, center, -0.78, size * 0.78, 15, 'rgba(246,225,255,0.58)');
  drawFlareStroke(context, center, center, 0.78, size * 0.66, 12, 'rgba(104,75,255,0.48)');
  drawFlareStroke(context, center, center, 0.0, size * 0.4, 5, 'rgba(255,246,255,0.42)');
  drawFlareStroke(context, center, center, Math.PI / 2, size * 0.32, 5, 'rgba(255,246,255,0.34)');

  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (let i = 0; i < 18; i += 1) {
    const angle = seeded(i, 41) * Math.PI * 2;
    const radius = size * (0.09 + seeded(i, 42) * 0.27);
    const length = size * (0.08 + seeded(i, 43) * 0.22);
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    context.strokeStyle = i % 3 === 0 ? 'rgba(255,235,255,0.42)' : 'rgba(175,135,255,0.34)';
    context.lineWidth = 1 + seeded(i, 44) * 2.2;
    context.beginPath();
    for (let j = 0; j < 5; j += 1) {
      const t = j / 4 - 0.5;
      const wobble = (seeded(i * 11 + j, 45) - 0.5) * size * 0.045;
      const px = x + Math.cos(angle + Math.PI / 2) * length * t + Math.cos(angle) * wobble;
      const py = y + Math.sin(angle + Math.PI / 2) * length * t + Math.sin(angle) * wobble;
      if (j === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }

  for (let i = 0; i < 46; i += 1) {
    const angle = seeded(i, 51) * Math.PI * 2;
    const radius = size * (0.08 + seeded(i, 52) * 0.42);
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    context.fillStyle = `rgba(245,222,255,${0.12 + seeded(i, 53) * 0.38})`;
    context.fillRect(x, y, 1.1 + seeded(i, 54) * 2.4, 1.1 + seeded(i, 55) * 2.4);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawFlareStroke(context, x, y, angle, length, width, color) {
  const gradient = context.createLinearGradient(
    x - Math.cos(angle) * length,
    y - Math.sin(angle) * length,
    x + Math.cos(angle) * length,
    y + Math.sin(angle) * length
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.strokeStyle = gradient;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
  context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
  context.stroke();
}

function setPointerFromEvent(event) {
  const { width, height } = getViewportSize();
  pointer.x = (event.clientX / width) * 2 - 1;
  pointer.y = -(event.clientY / height) * 2 + 1;
  hoverNeedsUpdate = true;
}

function isMobileTapEvent(event) {
  return event.pointerType === 'touch'
    || event.pointerType === 'pen'
    || window.matchMedia('(hover: none), (pointer: coarse), (max-width: 820px)').matches;
}

function openNodeFromTap(event) {
  if (
    !isMobileTapEvent(event)
    || interactionState.pointerMoved
    || readerState.open
    || getIntroState(clock.elapsedTime).active
  ) {
    return false;
  }
  setPointerFromEvent(event);
  updateHover(clock.elapsedTime, true);
  const tappedNode = hoveredNode;
  if (!tappedNode) return false;

  activeNode = tappedNode;
  activeNodeId = tappedNode.id;
  activeStartedAt = clock.elapsedTime;
  updateChainDepths(tappedNode);
  openActivePreview();
  return true;
}

function setMobileJoystickFromEvent(event) {
  if (!moveJoystick || !moveStick) return;
  const rect = moveJoystick.getBoundingClientRect();
  const radius = Math.max(32, Math.min(rect.width, rect.height) * 0.34);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const rawX = event.clientX - centerX;
  const rawY = event.clientY - centerY;
  const length = Math.hypot(rawX, rawY);
  const scale = length > radius ? radius / length : 1;
  const x = rawX * scale;
  const y = rawY * scale;

  mobileMoveState.x = x / radius;
  mobileMoveState.y = -y / radius;
  moveStick.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}

function resetMobileJoystick() {
  mobileMoveState.active = false;
  mobileMoveState.pointerId = null;
  mobileMoveState.x = 0;
  mobileMoveState.y = 0;
  if (moveStick) moveStick.style.transform = 'translate(-50%, -50%)';
}

function beginMobileMovement() {
  if (readerState.open) closeNoteReader();
  if (previewState.group) closePreviewCluster();
}

function setMobileLift(button, pressed) {
  mobileLiftState.up = pressed && button.classList.contains('mobile-lift-up');
  mobileLiftState.down = pressed && button.classList.contains('mobile-lift-down');
  button.classList.toggle('is-active', pressed);
  if (pressed) beginMobileMovement();
}

window.addEventListener('keydown', (event) => {
  if (isTextInputTarget(event.target)) return;
  if (readerState.open && isMovementKey(event.code)) {
    event.preventDefault();
    closeNoteReader();
    return;
  }
  if (previewState.group && isMovementKey(event.code)) closePreviewCluster();
  if (event.code === 'KeyO' && !event.repeat) {
    event.preventDefault();
    openActivePreview();
    return;
  }
  if (event.code === 'KeyE' && !event.repeat) {
    event.preventDefault();
    openEditNodeForm(activeNode);
    return;
  }
  if (event.code === 'KeyV' && !event.repeat) {
    event.preventDefault();
    toggleCameraMode();
    return;
  }
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

moveJoystick?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginMobileMovement();
  mobileMoveState.active = true;
  mobileMoveState.pointerId = event.pointerId;
  moveJoystick.setPointerCapture(event.pointerId);
  setMobileJoystickFromEvent(event);
});

moveJoystick?.addEventListener('pointermove', (event) => {
  if (!mobileMoveState.active || mobileMoveState.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  setMobileJoystickFromEvent(event);
});

function releaseMobileJoystick(event) {
  if (mobileMoveState.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  if (moveJoystick?.hasPointerCapture(event.pointerId)) {
    moveJoystick.releasePointerCapture(event.pointerId);
  }
  resetMobileJoystick();
}

moveJoystick?.addEventListener('pointerup', releaseMobileJoystick);
moveJoystick?.addEventListener('pointercancel', releaseMobileJoystick);
moveJoystick?.addEventListener('lostpointercapture', resetMobileJoystick);

for (const button of mobileLiftButtons) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    setMobileLift(button, true);
  });
  button.addEventListener('pointerup', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    setMobileLift(button, false);
  });
  button.addEventListener('pointercancel', () => setMobileLift(button, false));
  button.addEventListener('lostpointercapture', () => setMobileLift(button, false));
}

mobileControls?.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('pointerdown', (event) => {
  setPointerFromEvent(event);
  updateHover(clock.elapsedTime, true);
  canvas.setPointerCapture(event.pointerId);
  canvas.dataset.dragging = 'true';
  interactionState.pointerDown = true;
  interactionState.pointerMoved = false;
  interactionState.pullNode = !readerState.open
    ? hoveredNode ?? activeNode ?? findNearestNode(player.position, 24)
    : null;
});

canvas.addEventListener('pointerup', (event) => {
  canvas.releasePointerCapture(event.pointerId);
  canvas.dataset.dragging = 'false';
  const didOpenNode = openNodeFromTap(event);
  interactionState.pointerDown = false;
  interactionState.releasedNode = interactionState.pullNode;
  interactionState.releaseUntil = clock.elapsedTime + 0.95;
  interactionState.pullNode = null;
  if (didOpenNode) {
    interactionState.releasedNode = null;
    interactionState.releaseUntil = 0;
  }
});

canvas.addEventListener('pointermove', (event) => {
  setPointerFromEvent(event);

  if (canvas.dataset.dragging !== 'true') return;
  if (Math.abs(event.movementX) + Math.abs(event.movementY) > 1) interactionState.pointerMoved = true;
  cameraRig.viewYaw = normalizeAngle(cameraRig.viewYaw - event.movementX * settings.mouseSensitivity);
  player.pitch = THREE.MathUtils.clamp(
    player.pitch - event.movementY * settings.mouseSensitivity,
    -0.52,
    0.76
  );
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const zoomFactor = Math.exp(event.deltaY * 0.0014);
  settings.cameraDistance = THREE.MathUtils.clamp(settings.cameraDistance * zoomFactor, 3.5, 46);
  cameraDistanceController?.updateDisplay();
}, { passive: false });

function resizeViewport() {
  const { width, height } = getViewportSize();
  setAppViewportHeight(height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
}

window.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('scroll', resizeViewport);
