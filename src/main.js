import * as THREE from 'three';
import { fetchAllData, fetchReadme, fetchFileTree } from './github.js';
import { buildLobby }   from './lobby.js';
import { buildMuseum, renderReadmeToRoom, showReadmePlaceholder, renderFileTree } from './museum.js';
import { createControls } from './controls.js';
import { initUI, setLoading, hideLoading, showInstructions, hideInstructions, showTooltip, hideTooltip, updateMinimap } from './ui.js';

// ============================================================
//  CONFIG — change `username` to explore any GitHub user
// ============================================================
export const CONFIG = {
  username: 'usr-wwelsh',

  player: {
    height:        1.7,
    speed:         6,     // units/sec walking speed
    runMultiplier: 2.2,
    damping:       12,    // higher = snappier response
  },

  roomHeight: 5,

  lobby: {
    cubeSize:     0.3,
    cubeGap:      0.07,
    maxHeight:    3.5,
    lobbyCenterZ: 9,
  },

  museum: {
    hallWidth:     4,
    hallLength:    10,
    roomDepth:     10,
    roomHeight:    5,
    baseRoomWidth: 8,
  },
};

// ============================================================
//  Scene setup
// ============================================================
const canvas   = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#020408');
scene.fog = new THREE.Fog('#020408', 20, 45);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, CONFIG.player.height, CONFIG.lobby.lobbyCenterZ + 2);
camera.lookAt(0, CONFIG.player.height, 0);

// Global ambient — bright enough to see walls/floors clearly
scene.add(new THREE.AmbientLight(0xffffff, 1.8));

// ============================================================
//  Raycaster for tooltips
// ============================================================
const raycaster  = new THREE.Raycaster();
const center     = new THREE.Vector2(0, 0);
let portalMeshes = [];

// ============================================================
//  Resize handler
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  Bootstrap
// ============================================================
initUI();
setLoading('Connecting to GitHub…', 0);

let controls;
let artifacts    = [];
let floatingText = null;
let roomMeta     = [];
let wallBoxes    = [];  // collision AABBs
let clock       = new THREE.Clock();
let currentRoom = null; // room the player is currently inside

const PLAYER_RADIUS = 0.35;

async function init() {
  // Fetch data
  const { repos, languages, contributions } = await fetchAllData(
    CONFIG.username,
    (status, pct) => setLoading(status, pct)
  );

  setLoading('Building lobby…', 92);

  // Build lobby
  buildLobby(contributions, CONFIG, scene);

  setLoading('Building museum…', 95);

  // Build museum
  const result = buildMuseum(repos, languages, CONFIG, scene);
  roomMeta = result.roomMeta;

  // Collect portal meshes for raycasting
  portalMeshes = roomMeta.map(rm => rm.doorMesh).filter(Boolean);

  // Collect animated meshes
  scene.traverse(obj => {
    if (obj.isMesh && obj.userData.isArtifact) artifacts.push(obj);
    if (obj.isMesh && obj.userData.isFloatingText) floatingText = obj;
  });

  // Build collision boxes from all tagged walls
  scene.updateMatrixWorld(true);
  scene.traverse(obj => {
    if (obj.isMesh && obj.userData.isWall) {
      const box = new THREE.Box3();
      box.setFromObject(obj);
      wallBoxes.push(box);
    }
  });

  setLoading('Entering gallery…', 100);

  // Create controls
  controls = createControls(camera, renderer.domElement, CONFIG.player);
  scene.add(controls.getObject());

  controls.addEventListener('lock', () => {
    hideInstructions();
  });
  controls.addEventListener('unlock', () => {
    showInstructions();
  });

  // Small delay so the 100% bar is visible
  await new Promise(r => setTimeout(r, 400));

  hideLoading();
  showInstructions();

  // Start loop
  loop();
}

// ============================================================
//  Game loop
// ============================================================
function loop() {
  requestAnimationFrame(loop);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Controls movement + collision
  if (controls) {
    controls.updateMovement(delta);
    if (controls.isLocked) resolveCollisions(camera.position, wallBoxes, PLAYER_RADIUS);
  }

  // Artifact animation (spin + bob)
  artifacts.forEach((art, i) => {
    art.rotation.x += delta * 0.5;
    art.rotation.y += delta * 0.8;
    art.position.y  = art.userData.baseY + Math.sin(elapsed * 1.2 + i * 0.7) * 0.18;
  });

  // Username text on floor — no animation needed (static floor text)

  // Tooltip raycasting
  if (controls && controls.isLocked) {
    raycaster.setFromCamera(center, camera);
    const hits = raycaster.intersectObjects(portalMeshes, false);
    if (hits.length > 0 && hits[0].distance < 8) {
      const tip = hits[0].object.userData.tooltip;
      if (tip) showTooltip(tip); else hideTooltip();
    } else {
      hideTooltip();
    }
  }

  // Room entry detection → lazy README + file tree load
  const detectedRoom = getPlayerRoom(camera, roomMeta, CONFIG.museum);
  if (detectedRoom !== currentRoom) {
    currentRoom = detectedRoom;
    if (currentRoom && !currentRoom.readmeLoaded) {
      showReadmePlaceholder(currentRoom);
      loadRoomContent(currentRoom);
    }
  }

  // Minimap
  updateMinimap(camera, roomMeta, CONFIG.museum);

  renderer.render(scene, camera);
}

// ============================================================
//  Room helpers
// ============================================================

/**
 * Push the player out of any overlapping wall AABBs (circle-vs-AABB in XZ).
 * Runs multiple iterations to handle corners cleanly.
 */
function resolveCollisions(pos, boxes, radius) {
  for (let iter = 0; iter < 3; iter++) {
    for (const box of boxes) {
      // Nearest point on AABB to player (XZ plane only)
      const nearX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const nearZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));

      const dx = pos.x - nearX;
      const dz = pos.z - nearZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 0.0001) {
          // Player circle overlaps the box edge — push outward
          const dist    = Math.sqrt(distSq);
          const overlap = radius - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        } else {
          // Player center is inside the box — push out along shortest axis
          const cx = (box.min.x + box.max.x) / 2;
          const cz = (box.min.z + box.max.z) / 2;
          const hw = (box.max.x - box.min.x) / 2;
          const hd = (box.max.z - box.min.z) / 2;

          const ox = hw + radius - Math.abs(pos.x - cx);
          const oz = hd + radius - Math.abs(pos.z - cz);

          if (ox < oz) {
            pos.x += pos.x > cx ? ox : -ox;
          } else {
            pos.z += pos.z > cz ? oz : -oz;
          }
        }
      }
    }
  }
}

/** Returns the room the camera is currently inside, or null. */
function getPlayerRoom(camera, rooms, museumCfg) {
  const rd = museumCfg.roomDepth  || 10;
  const px = camera.position.x;
  const pz = camera.position.z;

  for (const rm of rooms) {
    const cx = rm.position.x;
    const cz = rm.position.z; // slotZ (world)
    const hw = rm.rw / 2;
    // Room spans: X ∈ [cx-hw, cx+hw], Z ∈ [cz-rd/2, cz+rd/2]
    if (
      px > cx - hw && px < cx + hw &&
      pz > cz - rd / 2 && pz < cz + rd / 2
    ) {
      return rm;
    }
  }
  return null;
}

/** Fetch README and file tree for a room, render both onto walls. */
async function loadRoomContent(room) {
  // Guard: mark in-flight to prevent double-fetch
  room.readmeLoaded  = true;
  room.fileTreeLoaded = true;

  const [owner, repo] = room.repoFullName.includes('/')
    ? room.repoFullName.split('/')
    : [CONFIG.username, room.repoName];

  // Fetch README and file tree in parallel
  const [markdown, tree] = await Promise.all([
    fetchReadme(owner, repo),
    fetchFileTree(owner, repo),
  ]);

  // Render README panels
  if (markdown) {
    renderReadmeToRoom(markdown, room);
  } else {
    const canvas = room.readmePanelCanvases[0];
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.font = '16px monospace'; ctx.fillStyle = '#484f58';
    ctx.textAlign = 'center';
    ctx.fillText('No README found', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    room.readmePanelTextures[0].needsUpdate = true;
    room.readmePanelMeshes[0].visible       = true;
    room.readmePanelMeshes[1].visible       = false;
    room.readmePanelMeshes[2].visible       = false;
  }

  // Render file tree panel
  if (tree && tree.length > 0) {
    renderFileTree(tree, room);
  } else {
    // Show "no files" instead of hiding the panel
    const ftCtx = room.fileTreeCanvas.getContext('2d');
    ftCtx.fillStyle = '#0d1117';
    ftCtx.fillRect(0, 0, room.fileTreeCanvas.width, room.fileTreeCanvas.height);
    ftCtx.strokeStyle = '#21262d'; ftCtx.lineWidth = 2;
    ftCtx.strokeRect(1, 1, room.fileTreeCanvas.width - 2, room.fileTreeCanvas.height - 2);
    ftCtx.font = '16px monospace'; ftCtx.fillStyle = '#484f58';
    ftCtx.textAlign = 'center';
    ftCtx.fillText('No files found', room.fileTreeCanvas.width / 2, room.fileTreeCanvas.height / 2);
    ftCtx.textAlign = 'left';
    room.fileTreeTexture.needsUpdate = true;
  }
}

// ============================================================
//  Start
// ============================================================
init().catch(err => {
  console.error('Init failed:', err);
  setLoading('Error loading data — check console', 0);
});
