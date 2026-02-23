import * as THREE from 'three';
import {
  getLangColor, darkenHex,
  makeWallMaterial, makePortalMaterial, makeArtifactMaterial,
  makeMarbleFloorMaterial, makeMarbleCeilingMaterial,
} from './materials.js';

const ARTIFACT_GEOS = [
  () => new THREE.OctahedronGeometry(0.45),
  () => new THREE.IcosahedronGeometry(0.45),
  () => new THREE.TorusGeometry(0.32, 0.14, 8, 24),
  () => new THREE.DodecahedronGeometry(0.4),
  () => new THREE.TetrahedronGeometry(0.5),
];

const README_W  = 512;
const README_H  = 740;
const FILETREE_W = 400;
const FILETREE_H = 680;
const LANGPANEL_W = 400;
const LANGPANEL_H = 680;
const COMMIT_W = 400;
const COMMIT_H = 680;

// Inner-wall doorway dimensions (shared between build + portal)
const INNER_DOOR_W = 2.6;
const INNER_DOOR_H = 3.2;

// ─────────────────────────────────────────────────────────────
//  Main build function
// ─────────────────────────────────────────────────────────────
export function buildMuseum(repos, languages, config, scene) {
  const group = new THREE.Group();
  group.name = 'museum';

  const {
    hallWidth    = 4,
    hallLength   = 10,
    roomDepth    = 10,
    roomHeight   = 5,
    baseRoomWidth = 8,
  } = config.museum;

  const rd      = roomDepth;
  const wallH   = config.roomHeight || roomHeight;
  const totalSlots = repos.length;
  const hallLen = (totalSlots + 2) * hallLength;

  // ── Hallway floor & ceiling (marble) ──────────────────────
  const hallFloor = new THREE.Mesh(
    new THREE.BoxGeometry(hallWidth * 2, 0.2, hallLen),
    makeMarbleFloorMaterial(Math.ceil(hallWidth * 2 / 1.5), Math.ceil(hallLen / 1.5))
  );
  hallFloor.position.set(0, -0.1, -(hallLen / 2));
  group.add(hallFloor);

  const hallCeiling = new THREE.Mesh(
    new THREE.BoxGeometry(hallWidth * 2, 0.2, hallLen),
    makeMarbleCeilingMaterial(Math.ceil(hallWidth * 2 / 1.5), Math.ceil(hallLen / 1.5))
  );
  hallCeiling.position.set(0, wallH, -(hallLen / 2));
  group.add(hallCeiling);

  // ── Hallway corridor lights (every 3 slots) ─────────────────
  for (let i = 0; i <= totalSlots + 1; i += 3) {
    const light = new THREE.PointLight(0xfff5e0, 1.2, 25);
    light.position.set(0, wallH - 0.4, -(i * hallLength));
    group.add(light);
  }

  // ── End-cap wall ──────────────────────────────────────────
  const endWall = new THREE.Mesh(
    new THREE.BoxGeometry(hallWidth * 2 + 0.4, wallH, 0.2),
    makeWallMaterial('#e8e2d8')
  );
  endWall.position.set(0, wallH / 2, -(hallLen + 0.1));
  endWall.userData.isWall = true;
  group.add(endWall);

  // ── Hallway side walls (white, with room-opening gaps) ────
  buildHallwaySideWalls(group, repos, hallWidth, hallLength, rd, wallH, hallLen);

  // ── Per-repo rooms ─────────────────────────────────────────
  const roomMeta = [];

  repos.forEach((repo, i) => {
    const side      = i % 2 === 0 ? 1 : -1;
    const slotZ     = -((i + 1) * hallLength);
    const lang      = repo.language || 'default';
    const langColor = getLangColor(lang);
    const wallColor = darkenHex(langColor, 0.5);
    const langHex   = '#' + wallColor.getHexString();

    const stars     = repo.stargazers_count || 0;
    const widthMult = Math.min(2.5, 1 + Math.log1p(stars) * 0.15);
    const rw        = baseRoomWidth * widthMult;
    const rh        = wallH;

    const roomGroup = new THREE.Group();
    roomGroup.name  = `room_${repo.name}`;

    const roomCenterX = side * (hallWidth + rw / 2);
    const wallMat     = makeWallMaterial(langHex);

    // Back wall (lang colored)
    addBox(roomGroup, rw, rh, 0.2, wallMat, 0, rh / 2, -rd / 2 - 0.1);

    // Outer side wall (lang colored, full depth)
    addBox(roomGroup, 0.2, rh, rd, wallMat, side * rw / 2, rh / 2, 0);

    // Front wall — SOLID (no doorway on this face)
    addBox(roomGroup, rw, rh, 0.2, wallMat, 0, rh / 2, rd / 2);

    // Inner side wall with doorway opening (centered at z=0)
    buildInnerSideWall(roomGroup, wallMat, rw, rh, rd, side);

    // Room floor (marble)
    const roomFloor = new THREE.Mesh(
      new THREE.BoxGeometry(rw, 0.2, rd),
      makeMarbleFloorMaterial(Math.ceil(rw / 1.5), Math.ceil(rd / 1.5))
    );
    roomFloor.position.set(0, -0.1, 0);
    roomGroup.add(roomFloor);

    // Room ceiling (marble)
    const roomCeiling = new THREE.Mesh(
      new THREE.BoxGeometry(rw, 0.2, rd),
      makeMarbleCeilingMaterial(Math.ceil(rw / 1.5), Math.ceil(rd / 1.5))
    );
    roomCeiling.position.set(0, rh, 0);
    roomGroup.add(roomCeiling);

    // ── Portal plane at inner wall doorway (tooltip detection) ──
    const portalMat  = makePortalMaterial(langColor);
    const portalMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(INNER_DOOR_W, INNER_DOOR_H),
      portalMat
    );
    portalMesh.position.set(-side * rw / 2, INNER_DOOR_H / 2, 0);
    portalMesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    portalMesh.userData.tooltip  = `${repo.name} — ${stars} ⭐`;
    portalMesh.userData.isPortal = true;
    roomGroup.add(portalMesh);

    // ── Info panel: inner side wall ──
    const infoCanvas = makeInfoCanvas(repo, lang, langColor);
    const infoTex    = new THREE.CanvasTexture(infoCanvas);
    const infoMat    = new THREE.MeshBasicMaterial({ map: infoTex, side: THREE.FrontSide });
    const infoPanelW = Math.min(rw - 1, 3.5);
    const infoPanel  = new THREE.Mesh(new THREE.PlaneGeometry(infoPanelW, 2.5), infoMat);
    const infoX      = -side * (rw / 2 - 0.15);
    infoPanel.position.set(infoX, rh / 2, -rd * 0.6);
    infoPanel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    roomGroup.add(infoPanel);

    // ── Languages panel: front wall ──
    const langData = languages[repo.name] || {};
    createLangPanel(roomGroup, langData, rw, rh, rd, langColor);

    // ── File tree panel: back wall (first thing you see) ──
    const { mesh: ftMesh, canvas: ftCanvas, texture: ftTex } =
      createFileTreePanel(roomGroup, rw, rh, rd, langColor);

    // ── README panels: outer side wall (lazy loaded) ──
    const { meshes: readmeMeshes, canvases: readmeCanvases, textures: readmeTextures } =
      createReadmePanels(roomGroup, rw, rh, rd, side);

    // ── Commit timeline panel: inner side wall (forward half) ──
    const { mesh: commitMesh, canvas: commitCanvas, texture: commitTex } =
      createCommitPanel(roomGroup, rw, rh, rd, side, langColor);

    // ── Neon blade sign: juts from inner wall into hallway ──
    createNeonSign(roomGroup, repo.name, lang, langColor, rw, rh, rd, side, hallWidth);

    // ── Floating artifact ──
    const geoIdx   = langHashIndex(lang, ARTIFACT_GEOS.length);
    const artGeo   = ARTIFACT_GEOS[geoIdx]();
    const artColor = new THREE.Color(langColor);
    const artifact = new THREE.Mesh(artGeo, makeArtifactMaterial('#' + artColor.getHexString()));
    const baseY    = rh * 0.52;
    artifact.position.set(0, baseY, -rd / 2 + rd * 0.45);
    artifact.userData.isArtifact = true;
    artifact.userData.baseY      = baseY;
    roomGroup.add(artifact);

    // Room light
    const roomLight = new THREE.PointLight(new THREE.Color(langColor), 1.2, rd * 1.5);
    roomLight.position.set(0, rh * 0.7, -rd * 0.25);
    roomGroup.add(roomLight);

    roomGroup.position.set(roomCenterX, 0, slotZ);
    group.add(roomGroup);

    roomMeta.push({
      roomGroup,
      doorMesh:           portalMesh,
      position:           new THREE.Vector3(roomCenterX, 0, slotZ),
      repoName:           repo.name,
      repoFullName:       repo.full_name || `${config.username}/${repo.name}`,
      repoDesc:           repo.description || '',
      stars,
      lang,
      langColor,
      rw,
      readmePanelMeshes:   readmeMeshes,
      readmePanelCanvases: readmeCanvases,
      readmePanelTextures: readmeTextures,
      readmeLoaded: false,
      fileTreeMesh:    ftMesh,
      fileTreeCanvas:  ftCanvas,
      fileTreeTexture: ftTex,
      fileTreeLoaded: false,
      commitMesh:    commitMesh,
      commitCanvas:  commitCanvas,
      commitTexture: commitTex,
      commitsLoaded: false,
    });
  });

  scene.add(group);
  return { museumGroup: group, roomMeta };
}

// ─────────────────────────────────────────────────────────────
//  Hallway side walls with room-opening gaps
// ─────────────────────────────────────────────────────────────
function buildHallwaySideWalls(group, repos, hallWidth, hallLength, rd, wallH, hallLen) {
  const wallMat = makeWallMaterial('#e8e2d8');

  for (const side of [1, -1]) {
    const wx = side * hallWidth;

    const openings = repos
      .map((repo, i) => {
        const roomSide = i % 2 === 0 ? 1 : -1;
        if (roomSide !== side) return null;
        const slotZ = -((i + 1) * hallLength);
        return { zStart: slotZ + rd / 2, zEnd: slotZ - rd / 2 };
      })
      .filter(Boolean)
      .sort((a, b) => b.zStart - a.zStart);

    let zCursor = 0;
    for (const opening of openings) {
      const segLen = Math.abs(zCursor - opening.zStart);
      if (segLen > 0.05) {
        addHallWallSeg(group, wallMat, wx, wallH, segLen, (zCursor + opening.zStart) / 2);
      }
      zCursor = opening.zEnd;
    }
    const finalLen = Math.abs(zCursor - (-hallLen));
    if (finalLen > 0.05) {
      addHallWallSeg(group, wallMat, wx, wallH, finalLen, (zCursor + (-hallLen)) / 2);
    }
  }
}

function addHallWallSeg(group, mat, x, h, len, centerZ) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, len), mat);
  mesh.position.set(x, h / 2, centerZ);
  mesh.userData.isWall = true;
  group.add(mesh);
}

// ─────────────────────────────────────────────────────────────
//  Inner side wall with centred doorway opening
// ─────────────────────────────────────────────────────────────
function buildInnerSideWall(roomGroup, wallMat, rw, rh, rd, side) {
  const segLen  = (rd - INNER_DOOR_W) / 2;
  const lintelH = rh - INNER_DOOR_H;
  const wx      = -side * rw / 2;

  // Rear solid segment
  addBox(roomGroup, 0.2, rh, segLen, wallMat, wx, rh / 2, -(rd / 2 - segLen / 2));
  // Front solid segment
  addBox(roomGroup, 0.2, rh, segLen, wallMat, wx, rh / 2, rd / 2 - segLen / 2);
  // Lintel above the opening (NOT tagged as wall — the 2D XZ collision
  // code would project it down as an invisible barrier across the doorway)
  if (lintelH > 0) {
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, lintelH, INNER_DOOR_W),
      wallMat
    );
    lintel.position.set(wx, INNER_DOOR_H + lintelH / 2, 0);
    roomGroup.add(lintel);
  }
}

// ─────────────────────────────────────────────────────────────
//  Neon blade sign — juts from inner wall into hallway
// ─────────────────────────────────────────────────────────────
function createNeonSign(roomGroup, repoName, lang, langColor, rw, rh, rd, side, hallWidth) {
  const signW = 2.0, signH = 0.58;
  const canvas = makeNeonSignCanvas(repoName, langColor);
  const tex    = new THREE.CanvasTexture(canvas);
  const mat    = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const mesh   = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), mat);

  const localX = -side * (signW / 2 + rw / 2);
  const localY = rh * 0.70;
  const localZ = rd / 2 + 0.08;

  mesh.position.set(localX, localY, localZ);
  roomGroup.add(mesh);

}

function makeNeonSignCanvas(name, langColor) {
  const W = 600, H = 174;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#06090e';
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = langColor; ctx.shadowBlur = 10;
  ctx.strokeStyle = langColor; ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  const display = name.length > 20 ? name.slice(0, 19) + '…' : name;
  ctx.shadowBlur = 22; ctx.shadowColor = langColor;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(display, W / 2, H / 2 - 4);

  ctx.shadowBlur = 8; ctx.font = '18px monospace'; ctx.fillStyle = langColor;
  ctx.fillText(name.length > 20 ? name : '', W / 2, H / 2 + 32);

  return canvas;
}

// ─────────────────────────────────────────────────────────────
//  File tree panel (outer side wall)
// ─────────────────────────────────────────────────────────────
function createFileTreePanel(roomGroup, rw, rh, rd, langColor) {
  const panelW = Math.min(rw - 1, 3.0);
  const panelH = rh * 0.6;

  const canvas = document.createElement('canvas');
  canvas.width  = FILETREE_W;
  canvas.height = FILETREE_H;
  drawPlaceholderCanvas(canvas, 'Loading files…');

  const tex  = new THREE.CanvasTexture(canvas);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), mat);

  // Back wall (right half) — side by side with languages panel
  const gap = 0.2;
  mesh.position.set(panelW / 2 + gap / 2, rh * 0.55, -rd / 2 + 0.15);
  mesh.visible = true;
  roomGroup.add(mesh);

  return { mesh, canvas, texture: tex };
}

export function renderFileTree(treeEntries, room) {
  if (!room.fileTreeCanvas) return;
  drawFileTree(room.fileTreeCanvas, treeEntries, room.langColor);
  room.fileTreeTexture.needsUpdate = true;
  room.fileTreeMesh.visible        = true;
  room.fileTreeLoaded              = true;
}

function drawFileTree(canvas, entries, langColor) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PX = 14;

  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.font = 'bold 15px monospace'; ctx.fillStyle = langColor;
  ctx.fillText('/ file tree', PX, 26);
  ctx.fillStyle = '#21262d'; ctx.fillRect(PX, 34, W - PX * 2, 1);

  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  let y = 52;
  ctx.font = '12px monospace';
  for (const entry of sorted) {
    if (y > H - 12) break;
    const isDir = entry.type === 'tree';
    ctx.fillStyle = isDir ? '#58a6ff' : '#c9d1d9';
    ctx.fillText((isDir ? '▸ ' : '  ') + (entry.path + (isDir ? '/' : '')).slice(0, 42), PX, y);
    y += 18;
  }
}

// ─────────────────────────────────────────────────────────────
//  Languages panel (front wall)
// ─────────────────────────────────────────────────────────────
function createLangPanel(roomGroup, langData, rw, rh, rd, langColor) {
  const panelW = Math.min(rw - 1, 3.0);
  const panelH = rh * 0.6;

  const canvas = document.createElement('canvas');
  canvas.width  = LANGPANEL_W;
  canvas.height = LANGPANEL_H;
  drawLangPanel(canvas, langData, langColor);

  const tex  = new THREE.CanvasTexture(canvas);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), mat);

  // Back wall (left half) — side by side with file tree panel
  const gap = 0.2;
  mesh.position.set(-(panelW / 2 + gap / 2), rh * 0.55, -rd / 2 + 0.15);
  roomGroup.add(mesh);
}

function drawLangPanel(canvas, langData, langColor) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PX = 14;

  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Title
  ctx.font = 'bold 15px monospace'; ctx.fillStyle = langColor;
  ctx.fillText('Languages', PX, 26);
  ctx.fillStyle = '#21262d'; ctx.fillRect(PX, 34, W - PX * 2, 1);

  const entries = Object.entries(langData);
  if (!entries.length) {
    ctx.font = '13px monospace'; ctx.fillStyle = '#484f58';
    ctx.fillText('No language data', PX, 60);
    return;
  }

  const total = entries.reduce((s, [, v]) => s + v, 0);
  const sorted = entries.sort((a, b) => b[1] - a[1]);

  // Stacked bar at top
  const barY = 44, barH = 10;
  let bx = PX;
  const barW = W - PX * 2;
  for (const [lang, bytes] of sorted) {
    const w = Math.max(1, (bytes / total) * barW);
    ctx.fillStyle = getLangColor(lang);
    ctx.fillRect(bx, barY, w, barH);
    bx += w;
  }

  // Language entries
  let y = barY + barH + 20;
  const entryBarW = W - PX * 2 - 160;

  for (const [lang, bytes] of sorted) {
    if (y > H - 16) break;
    const pct = (bytes / total) * 100;
    const color = getLangColor(lang);

    // Colored dot
    ctx.beginPath();
    ctx.arc(PX + 6, y - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Language name
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#e6edf3';
    const displayName = lang.length > 18 ? lang.slice(0, 17) + '…' : lang;
    ctx.fillText(displayName, PX + 18, y);

    // Percentage bar
    const barStartX = PX + 150;
    const pctBarW = (pct / 100) * entryBarW;
    ctx.fillStyle = '#21262d';
    ctx.fillRect(barStartX, y - 9, entryBarW, 12);
    ctx.fillStyle = color;
    ctx.fillRect(barStartX, y - 9, pctBarW, 12);

    // Percentage text
    ctx.fillStyle = '#8b949e'; ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(pct.toFixed(1) + '%', W - PX, y);
    ctx.textAlign = 'left';

    y += 24;
  }
}

// ─────────────────────────────────────────────────────────────
//  README panels (back wall, lazy loaded)
// ─────────────────────────────────────────────────────────────
function createReadmePanels(roomGroup, rw, rh, rd, side) {
  const gap     = 0.3;                              // gap between panels and from walls
  const usableZ = rd - gap * 2;                     // Z space inside front/back walls
  const panelW  = Math.min((usableZ - gap * 2) / 3, 2.5); // fit 3 panels with gaps between
  const panelH  = rh * 0.68;
  const meshes  = [], canvases = [], textures = [];

  // Evenly distribute 3 panels along usable Z range
  const totalSpan = panelW * 3 + gap * 2;           // 3 panels + 2 gaps between them
  const startZ    = -totalSpan / 2 + panelW / 2;    // center of first panel (centered in room)

  for (let p = 0; p < 3; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = README_W; canvas.height = README_H;
    drawPlaceholderCanvas(canvas, '');

    const tex  = new THREE.CanvasTexture(canvas);
    const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), mat);
    // Outer side wall — facing inward toward the room
    // Flip Z order for left-side rooms so panels read 1→3 left-to-right
    const idx = side < 0 ? (2 - p) : p;
    const z = startZ + idx * (panelW + gap);
    mesh.position.set(side * (rw / 2 - 0.15), rh / 2, z);
    mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.visible = false;
    roomGroup.add(mesh);

    meshes.push(mesh); canvases.push(canvas); textures.push(tex);
  }
  return { meshes, canvases, textures };
}

export async function renderReadmeToRoom(markdownText, room) {
  const { readmePanelCanvases, readmePanelTextures, readmePanelMeshes } = room;
  const baseUrl = `https://raw.githubusercontent.com/${room.repoFullName}/HEAD`;
  const styled    = parseMarkdown(markdownText.slice(0, 9000), baseUrl);
  const imageMap  = await loadAllImages(styled);
  const pages     = paginateStyledLines(styled, 670, imageMap);
  const numPanels = Math.min(pages.length, 3);

  for (let p = 0; p < 3; p++) {
    if (p < numPanels) {
      drawReadmePage(readmePanelCanvases[p], pages[p], p, numPanels, imageMap);
      readmePanelTextures[p].needsUpdate = true;
      readmePanelMeshes[p].visible       = true;
    } else {
      readmePanelMeshes[p].visible = false;
    }
  }
  room.readmeLoaded = true;
}

export function showReadmePlaceholder(room) {
  drawPlaceholderCanvas(room.readmePanelCanvases[0], 'Loading README…');
  room.readmePanelTextures[0].needsUpdate = true;
  room.readmePanelMeshes[0].visible       = true;
  room.readmePanelMeshes[1].visible       = false;
  room.readmePanelMeshes[2].visible       = false;
}

// ─────────────────────────────────────────────────────────────
//  Markdown parser
// ─────────────────────────────────────────────────────────────
function parseMarkdown(text, baseUrl) {
  const lines  = text.split('\n');
  const result = [];
  let inCode   = false;

  for (const rawLine of lines) {
    // Extract images from raw line (before stripping HTML) — catches <img> tags and ![alt](url)
    if (!inCode) {
      const images = extractImages(rawLine, baseUrl);
      if (images.length > 0) {
        result.push({ type: 'img', images, text: '' });
        // If line is ONLY images, skip further text parsing
        const textOnly = rawLine
          .replace(/<img[^>]*\/?>/gi, '')
          .replace(/\[?\s*!\[[^\]]*\]\([^)]+\)\s*\]?(\([^)]+\))?/g, '')
          .replace(/<[^>]+>/g, '').replace(/&\w+;/g, '').trim();
        if (!textOnly) continue;
      }
    }

    const stripped = rawLine
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, '').trimEnd();

    if (stripped.startsWith('```') || stripped.startsWith('~~~')) {
      if (inCode) { result.push({ type: 'code-end', text: '' }); inCode = false; }
      else        { inCode = true; }
      continue;
    }
    if (inCode) { result.push({ type: 'code', text: stripped }); continue; }
    if (stripped === '') { result.push({ type: 'empty', text: '' }); continue; }
    if (/^-{3,}$/.test(stripped) || /^\*{3,}$/.test(stripped)) {
      result.push({ type: 'hr', text: '' }); continue;
    }

    const h1 = stripped.match(/^#\s+(.*)/);
    if (h1) { result.push({ type: 'h1', text: h1[1] }); continue; }
    const h2 = stripped.match(/^##\s+(.*)/);
    if (h2) { result.push({ type: 'h2', text: h2[1] }); continue; }
    const h3 = stripped.match(/^###\s+(.*)/);
    if (h3) { result.push({ type: 'h3', text: h3[1] }); continue; }
    const li = stripped.match(/^[\-\*\+]\s+(.*)/);
    if (li) { result.push({ type: 'li', text: li[1] }); continue; }
    const oli = stripped.match(/^\d+\.\s+(.*)/);
    if (oli) { result.push({ type: 'li', text: oli[1] }); continue; }

    result.push({ type: 'p', text: stripped });
  }
  return result;
}

// ── Image extraction & loading ─────────────────────────────
function extractImages(rawLine, baseUrl) {
  const images = [];
  const seen = new Set();
  // Markdown images: ![alt](url)
  const mdRegex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = mdRegex.exec(rawLine)) !== null) {
    const url = resolveImageUrl(m[2], baseUrl);
    if (!seen.has(url)) { seen.add(url); images.push({ alt: m[1], url }); }
  }
  // HTML img tags: <img src="url">
  const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = htmlRegex.exec(rawLine)) !== null) {
    const url = resolveImageUrl(m[1], baseUrl);
    if (!seen.has(url)) { seen.add(url); images.push({ alt: '', url }); }
  }
  return images;
}

function resolveImageUrl(url, baseUrl) {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const clean = url.startsWith('./') ? url.slice(2) : url;
  return `${baseUrl}/${clean}`;
}

function loadImage(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.src = url;
  });
}

async function loadAllImages(styledLines) {
  const imageMap = new Map();
  const toLoad = [];
  for (const item of styledLines) {
    if (item.type === 'img') {
      for (const img of item.images) {
        if (!imageMap.has(img.url)) {
          imageMap.set(img.url, null);
          toLoad.push(img.url);
        }
      }
    }
  }
  const results = await Promise.all(toLoad.map(url => loadImage(url)));
  toLoad.forEach((url, i) => { imageMap.set(url, results[i]); });
  return imageMap;
}

function paginateStyledLines(styledLines, budget = 670, imageMap = null) {
  const COST  = { h1: 42, h2: 34, h3: 24, p: 21, li: 21, code: 18, 'code-end': 6, hr: 14, empty: 10 };
  const CHARS = { h1: 36, h2: 46, h3: 62, p: 60, li: 58, code: 76 };
  const pages = [[]]; let rem = budget;

  for (const item of styledLines) {
    let cost;
    if (item.type === 'img' && imageMap) {
      cost = 0;
      const loaded = item.images.filter(i => imageMap.get(i.url));
      const badges = loaded.filter(i => { const img = imageMap.get(i.url); return img && img.naturalHeight <= 40; });
      const regular = loaded.filter(i => { const img = imageMap.get(i.url); return img && img.naturalHeight > 40; });
      if (badges.length > 0) cost += 30;
      cost += regular.length * 80;
      if (cost === 0) cost = 10;
    } else {
      const base  = COST[item.type] || 21;
      const cpl   = CHARS[item.type] || 60;
      const wraps = item.text ? Math.max(1, Math.ceil(item.text.length / cpl)) : 1;
      cost  = base * wraps;
    }
    if (rem - cost < 0 && pages[pages.length - 1].length > 0) { pages.push([]); rem = budget; }
    pages[pages.length - 1].push(item);
    rem -= cost;
  }
  return pages;
}

function drawReadmePage(canvas, lines, pageNum, totalPages, imageMap) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, PX = 22, IW = W - PX * 2;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  let y = 26;
  for (const item of lines) {
    if (y > H - 20) break;
    switch (item.type) {
      case 'empty': y += 9; break;
      case 'hr':
        y += 6; ctx.fillStyle = '#30363d'; ctx.fillRect(PX, y, IW, 1); y += 8; break;
      case 'h1': {
        y += 10; ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#e6edf3';
        const n = wrapCanvasText(ctx, stripInline(item.text), PX, y, IW, 26);
        y += n * 26 + 4; ctx.fillStyle = '#30363d'; ctx.fillRect(PX, y, IW, 1); y += 7; break;
      }
      case 'h2': {
        y += 7; ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#58a6ff';
        y += wrapCanvasText(ctx, stripInline(item.text), PX, y, IW, 23) * 23 + 4; break;
      }
      case 'h3': {
        y += 4; ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#a5d6ff';
        y += wrapCanvasText(ctx, stripInline(item.text), PX, y, IW, 20) * 20 + 2; break;
      }
      case 'li': {
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#c9d1d9';
        y += wrapCanvasText(ctx, '• ' + stripInline(item.text), PX + 8, y, IW - 8, 19) * 19 + 2; break;
      }
      case 'code': {
        ctx.font = '11px monospace'; ctx.fillStyle = '#8b949e';
        ctx.fillText(item.text.slice(0, 80), PX + 6, y); y += 16; break;
      }
      case 'code-end': y += 4; break;
      case 'img': {
        if (!imageMap) break;
        const loadedImgs = item.images
          .map(i => ({ ...i, loaded: imageMap.get(i.url) }))
          .filter(i => i.loaded);
        const badges = loadedImgs.filter(i => i.loaded.naturalHeight <= 40);
        const regular = loadedImgs.filter(i => i.loaded.naturalHeight > 40);
        // Draw badges side by side
        if (badges.length > 0) {
          let bx = PX;
          for (const badge of badges) {
            const img = badge.loaded;
            const scale = Math.min(1, 22 / img.naturalHeight, (IW - (bx - PX)) / img.naturalWidth);
            if (scale <= 0) break;
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            if (bx + dw > PX + IW) { bx = PX; y += dh + 4; }
            ctx.drawImage(img, bx, y, dw, dh);
            bx += dw + 6;
          }
          y += 26;
        }
        // Draw regular images scaled to fit
        for (const imgInfo of regular) {
          const img = imgInfo.loaded;
          const maxH = 80;
          const scale = Math.min(IW / img.naturalWidth, maxH / img.naturalHeight, 1);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          if (y + dh > H - 20) break;
          ctx.drawImage(img, PX, y, dw, dh);
          y += dh + 6;
        }
        break;
      }
      default: {
        const cleaned = stripInline(item.text).trim();
        if (!cleaned) break;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#c9d1d9';
        y += wrapCanvasText(ctx, cleaned, PX, y, IW, 19) * 19 + 2; break;
      }
    }
  }
  if (totalPages > 1) {
    ctx.font = '11px monospace'; ctx.fillStyle = '#484f58'; ctx.textAlign = 'right';
    ctx.fillText(`${pageNum + 1} / ${totalPages}`, W - PX, H - 8); ctx.textAlign = 'left';
  }
}

// ─────────────────────────────────────────────────────────────
//  Commit timeline panel (back wall, right half)
// ─────────────────────────────────────────────────────────────
function createCommitPanel(roomGroup, rw, rh, rd, side, langColor) {
  const panelW = Math.min(rw - 1, 3.0);
  const panelH = rh * 0.6;

  const canvas = document.createElement('canvas');
  canvas.width  = COMMIT_W;
  canvas.height = COMMIT_H;
  drawPlaceholderCanvas(canvas, '');

  const tex  = new THREE.CanvasTexture(canvas);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), mat);

  // Front wall — facing inward (-Z)
  mesh.position.set(0, rh * 0.5, rd / 2 - 0.15);
  mesh.rotation.y = Math.PI;
  mesh.visible = false;
  roomGroup.add(mesh);

  return { mesh, canvas, texture: tex };
}

export function renderCommitTimeline(commits, room) {
  if (!room.commitCanvas || !commits || commits.length === 0) {
    room.commitsLoaded = true;
    return;
  }
  const canvas = room.commitCanvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PX = 14;

  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.font = 'bold 15px monospace'; ctx.fillStyle = room.langColor;
  ctx.fillText('Recent Commits', PX, 26);
  ctx.fillStyle = '#21262d'; ctx.fillRect(PX, 34, W - PX * 2, 1);

  let y = 52;
  for (const commit of commits) {
    if (y > H - 30) break;

    // SHA badge
    ctx.font = '11px monospace'; ctx.fillStyle = '#58a6ff';
    ctx.fillText(commit.sha, PX, y);

    // Date
    if (commit.date) {
      const dateStr = new Date(commit.date).toLocaleDateString();
      ctx.fillStyle = '#6e7681';
      ctx.textAlign = 'right';
      ctx.fillText(dateStr, W - PX, y);
      ctx.textAlign = 'left';
    }
    y += 16;

    // Message (wrapped)
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#c9d1d9';
    const msg = commit.message || 'No message';
    const lines = wrapTextLines(ctx, msg, W - PX * 2);
    for (const line of lines) {
      if (y > H - 16) break;
      ctx.fillText(line, PX, y);
      y += 16;
    }

    // Author
    if (commit.author) {
      ctx.font = '10px monospace'; ctx.fillStyle = '#8b949e';
      ctx.fillText(`by ${commit.author}`, PX, y);
      y += 14;
    }

    // Separator
    y += 6;
    ctx.fillStyle = '#21262d'; ctx.fillRect(PX, y, W - PX * 2, 1);
    y += 10;
  }

  room.commitTexture.needsUpdate = true;
  room.commitMesh.visible        = true;
  room.commitsLoaded             = true;
}

function wrapTextLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = word;
      if (lines.length >= 2) { lines[lines.length - 1] += '...'; break; }
    } else { line = test; }
  }
  if (line && lines.length < 2) lines.push(line);
  return lines;
}

// ─────────────────────────────────────────────────────────────
//  Shared canvas helpers
// ─────────────────────────────────────────────────────────────
function drawPlaceholderCanvas(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (msg) {
    ctx.strokeStyle = '#21262d'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.font = '16px monospace'; ctx.fillStyle = '#484f58'; ctx.textAlign = 'center';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2); ctx.textAlign = 'left';
  }
}

function stripInline(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function wrapCanvasText(ctx, text, x, y, maxW, lh) {
  if (!text) return 0;
  const words = text.split(' ');
  let line = '', count = 0, cy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy); line = word; cy += lh; count++;
    } else { line = test; }
  }
  if (line) { ctx.fillText(line, x, cy); count++; }
  return count;
}

// ─────────────────────────────────────────────────────────────
//  Info + LangBar canvases
// ─────────────────────────────────────────────────────────────
function makeInfoCanvas(repo, lang, langColor) {
  const w = 512, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#161b22'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = langColor; ctx.fillRect(0, 0, 6, h);
  ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#e6edf3'; ctx.textAlign = 'left';
  ctx.fillText((repo.name.length > 20 ? repo.name.slice(0, 20) + '…' : repo.name), 20, 52);
  ctx.font = '21px monospace'; ctx.fillStyle = langColor;
  ctx.fillText(lang || 'Unknown', 20, 88);
  ctx.font = '18px monospace'; ctx.fillStyle = '#8b949e';
  ctx.fillText(`⭐ ${repo.stargazers_count || 0}   🍴 ${repo.forks_count || 0}`, 20, 122);
  ctx.font = '17px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#c9d1d9';
  wrapText(ctx, repo.description || 'No description', 20, 165, w - 40, 24);
  const updated = repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : '';
  ctx.font = '14px monospace'; ctx.fillStyle = '#6e7681';
  ctx.fillText(`Updated: ${updated}`, 20, h - 20);
  return canvas;
}

function makeLangBarCanvas(langData, w = 800, h = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#161b22'; ctx.fillRect(0, 0, w, h);
  const entries = Object.entries(langData);
  if (!entries.length) { ctx.fillStyle = '#21262d'; ctx.fillRect(4, 20, w - 8, 30); return canvas; }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let x = 4;
  entries.forEach(([lang, bytes]) => {
    const bw = Math.max(1, (bytes / total) * (w - 8));
    ctx.fillStyle = getLangColor(lang); ctx.fillRect(x, 20, bw, 30); x += bw;
  });
  x = 4; ctx.font = '12px monospace';
  entries.slice(0, 4).forEach(([lang, bytes]) => {
    const bw = Math.max(1, (bytes / total) * (w - 8));
    ctx.fillStyle = '#e6edf3';
    if (bw > 36) { ctx.textAlign = 'left'; ctx.fillText(`${lang} ${((bytes / total) * 100).toFixed(1)}%`, x + 3, 64); }
    x += bw;
  });
  return canvas;
}

// ─────────────────────────────────────────────────────────────
//  Generic helpers
// ─────────────────────────────────────────────────────────────

/** Add a box and tag it as a wall for collision detection. */
function addBox(parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.userData.isWall = true;
  parent.add(mesh);
  return mesh;
}

function wrapText(ctx, text, x, y, maxW, lh) {
  if (!text) return;
  const words = text.split(' ');
  let line = '', lineY = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, lineY); line = word; lineY += lh;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, lineY);
}

function langHashIndex(lang, mod) {
  let h = 0; for (let i = 0; i < lang.length; i++) h += lang.charCodeAt(i); return h % mod;
}

export { getLangColor };
