import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJSON from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { LEVEL_COLORS, makeWallMaterial, makeMarbleFloorMaterial, makeMarbleCeilingMaterial } from './materials.js';

const WEEKS = 52;
const DAYS  = 7;
const TOTAL = WEEKS * DAYS; // 364

/**
 * Build the lobby room with a 3D GitHub contribution graph.
 * @param {object[]} contributions  — array from jogruber.de API
 * @param {object}   config
 * @param {THREE.Scene} scene
 * @returns {THREE.Group}
 */
export function buildLobby(contributions, config, scene) {
  const group = new THREE.Group();
  group.name = 'lobby';

  const { cubeSize = 0.3, cubeGap = 0.08, maxHeight = 4, lobbyCenterZ = 8 } = config.lobby;

  // Pad / trim to exactly 364 entries
  const flat = flattenContributions(contributions);

  // ---- Instanced contribution cubes ----
  const size    = cubeSize;
  const spacing = size + cubeGap;
  const geom    = new THREE.BoxGeometry(size, 1, size); // Y scaled per instance
  const mat     = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });

  const mesh = new THREE.InstancedMesh(geom, mat, TOTAL);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
  mesh.name          = 'contrib-graph';

  const dummy  = new THREE.Object3D();
  const maxVal = Math.max(1, ...flat.map(d => d.count));

  // Layout: weeks along X, days along Z (within lobby space)
  // Grid starts at negative X / positive Z, centered
  const gridW = WEEKS * spacing;
  const gridD = DAYS * spacing;
  const startX = -gridW / 2 + spacing / 2;
  const startZ = lobbyCenterZ - gridD / 2 + spacing / 2;

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const idx  = w * DAYS + d;
      const data = flat[idx];

      const normalizedH = data.count > 0
        ? Math.max(0.05, (data.count / maxVal))
        : 0.02;
      const height = normalizedH * maxHeight;

      dummy.scale.set(1, height, 1);
      dummy.position.set(
        startX + w * spacing,
        height / 2,            // sit on y=0 floor
        startZ + d * spacing
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);

      const color = LEVEL_COLORS[data.level] || LEVEL_COLORS[0];
      mesh.setColorAt(idx, color);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate  = true;
  group.add(mesh);

  // ---- Floor ----
  // Extend forward all the way to Z=0 so it connects with the museum hallway
  const floorW    = Math.max(gridW, 14) + 4;
  const floorFront = 0;                             // must reach Z=0
  const floorBack  = lobbyCenterZ + gridD / 2 + 4; // past the back of the cube grid
  const floorD     = floorBack - floorFront;
  const floorCenterZ = (floorFront + floorBack) / 2;
  const floorGeo = new THREE.BoxGeometry(floorW, 0.2, floorD);
  const floor = new THREE.Mesh(floorGeo, makeMarbleFloorMaterial(Math.ceil(floorW / 1.5), Math.ceil(floorD / 1.5)));
  floor.position.set(0, -0.1, floorCenterZ);
  group.add(floor);

  // ---- Ceiling ----
  const wallH = config.roomHeight || 5;
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(floorW, 0.2, floorD),
    makeMarbleCeilingMaterial(Math.ceil(floorW / 1.5), Math.ceil(floorD / 1.5))
  );
  ceiling.position.set(0, wallH, floorCenterZ);
  group.add(ceiling);

  // ---- Walls (warm white to match museum) ----
  const lobbyWallMat = makeWallMaterial('#e8e2d8');

  // Back wall
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(floorW, wallH, 0.2),
    lobbyWallMat
  );
  backWall.position.set(0, wallH / 2, floorBack + 0.1);
  backWall.userData.isWall = true;
  group.add(backWall);

  // Side walls
  [-1, 1].forEach(side => {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, wallH, floorD),
      lobbyWallMat
    );
    wall.position.set(side * (floorW / 2 + 0.1), wallH / 2, floorCenterZ);
    wall.userData.isWall = true;
    group.add(wall);
  });

  // Front wall with hallway opening (z ≈ 0, museum transition)
  const hallWidth = config.museum?.hallWidth || 4;
  const frontPanelW = (floorW / 2) - hallWidth;
  if (frontPanelW > 0.2) {
    [-1, 1].forEach(side => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(frontPanelW, wallH, 0.2),
        lobbyWallMat
      );
      panel.position.set(side * (hallWidth + frontPanelW / 2), wallH / 2, floorFront);
      panel.userData.isWall = true;
      group.add(panel);
    });
    // Lintel above hallway opening
    const lintelH = wallH - 3.4;
    if (lintelH > 0) {
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(hallWidth * 2, lintelH, 0.2),
        lobbyWallMat
      );
      lintel.position.set(0, 3.4 + lintelH / 2, floorFront);
      // Not tagged as wall — it's above player height and the 2D XZ collision
      // code would project it down as an invisible barrier across the doorway.
      group.add(lintel);
    }
  }

  // ---- Columns (4 decorative) ----
  const colH   = wallH;
  const colGeo = new THREE.CylinderGeometry(0.15, 0.18, colH, 8);
  const colMat = makeWallMaterial('#d5cfc5');
  const colPositions = [
    [-floorW / 2 + 0.8, lobbyCenterZ - floorD / 2 + 0.8],
    [ floorW / 2 - 0.8, lobbyCenterZ - floorD / 2 + 0.8],
    [-floorW / 2 + 0.8, lobbyCenterZ + floorD / 2 - 0.8],
    [ floorW / 2 - 0.8, lobbyCenterZ + floorD / 2 - 0.8],
  ];
  colPositions.forEach(([x, z]) => {
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, colH / 2, z);
    col.userData.isWall = true;
    group.add(col);
  });

  // ---- Lobby sign (back wall) ----
  const signCanvas  = makeSignCanvas('Git Gallery', '#39d353');
  const signTex     = new THREE.CanvasTexture(signCanvas);
  const signMat     = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.FrontSide });
  const sign        = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), signMat);
  sign.position.set(0, wallH - 1, lobbyCenterZ + floorD / 2 - 0.3);
  sign.rotation.y = Math.PI;
  group.add(sign);

  // ---- 3D username text (floating above contribution graph) ----
  const username = config.username || 'github-user';
  const font     = new FontLoader().parse(fontJSON);
  const textGeo  = new TextGeometry(username, {
    font,
    size:     1.2,
    depth:    0.35,
    curveSegments: 5,
    bevelEnabled:   true,
    bevelThickness: 0.06,
    bevelSize:      0.04,
    bevelSegments:  3,
  });
  textGeo.computeBoundingBox();
  const textW = textGeo.boundingBox.max.x - textGeo.boundingBox.min.x;
  const textH = textGeo.boundingBox.max.y - textGeo.boundingBox.min.y;
  // Center horizontally and vertically
  textGeo.translate(-textW / 2, -textH / 2, 0);

  const textMat = new THREE.MeshStandardMaterial({
    color:     '#39d353',
    emissive:  '#39d353',
    emissiveIntensity: 1.0,
    metalness: 0.2,
    roughness: 0.1,
  });
  const textMesh = new THREE.Mesh(textGeo, textMat);
  textMesh.position.set(0, textH / 2 + 0.05, 1.5); // upright, bottom edge on floor
  textMesh.userData.isFloatingText = true;
  textMesh.userData.baseY          = 0.05;
  group.add(textMesh);

  // Glow light above the text
  const textGlow = new THREE.PointLight(0x39d353, 2.5, 5);
  textGlow.position.set(0, 1.0, 1.5);
  group.add(textGlow);

  // ---- Lights ----
  const ambientLight = new THREE.AmbientLight(0x1a2030, 1.5);
  group.add(ambientLight);

  const pointPositions = [
    [0, wallH - 0.5, lobbyCenterZ],
    [-gridW * 0.35, wallH - 0.5, lobbyCenterZ - gridD * 0.3],
    [ gridW * 0.35, wallH - 0.5, lobbyCenterZ - gridD * 0.3],
    [-gridW * 0.35, wallH - 0.5, lobbyCenterZ + gridD * 0.3],
    [ gridW * 0.35, wallH - 0.5, lobbyCenterZ + gridD * 0.3],
  ];
  pointPositions.forEach(([x, y, z]) => {
    const light = new THREE.PointLight(0x39d353, 0.8, 12);
    light.position.set(x, y, z);
    group.add(light);
  });

  scene.add(group);
  return group;
}

// ---- Helpers ----

function flattenContributions(contributions) {
  // jogruber.de returns an array of { date, count, level }
  const result = [];

  if (!contributions || contributions.length === 0) {
    return Array.from({ length: TOTAL }, () => ({ count: 0, level: 0 }));
  }

  // Take last TOTAL entries, pad with zeros at front if needed
  const src = contributions.slice(-TOTAL);
  const pad = TOTAL - src.length;
  for (let i = 0; i < pad; i++) result.push({ count: 0, level: 0 });
  src.forEach(d => result.push({ count: d.count ?? 0, level: d.level ?? 0 }));

  return result;
}

function makeSignCanvas(text, color) {
  const w = 512, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);

  ctx.font      = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);

  return canvas;
}
