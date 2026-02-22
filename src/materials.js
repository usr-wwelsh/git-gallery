import * as THREE from 'three';

// Material cache — keyed by string descriptor
const _cache = new Map();

// Cached marble textures
let _marbleFloorTex = null;
let _marbleCeilingTex = null;

function makeMarbleTileCanvas(baseColor, groutColor) {
  const S = 512, T = 128; // canvas size, tile size in px
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  // Subtle vein strokes
  for (let i = 0; i < 14; i++) {
    const x0 = Math.random() * S, x1 = Math.random() * S;
    const cp = Math.random() * S;
    const alpha = (0.04 + Math.random() * 0.07).toFixed(3);
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(cp, S * 0.5, x1, S);
    ctx.strokeStyle = `rgba(160,148,136,${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.8;
    ctx.stroke();
  }

  // Tile grout lines
  ctx.strokeStyle = groutColor;
  ctx.lineWidth = 1.5;
  for (let i = T; i < S; i += T) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }

  return canvas;
}

function getMarbleFloorTex() {
  if (_marbleFloorTex) return _marbleFloorTex;
  const canvas = makeMarbleTileCanvas('#eee8de', 'rgba(180,168,155,0.55)');
  _marbleFloorTex = new THREE.CanvasTexture(canvas);
  _marbleFloorTex.wrapS = _marbleFloorTex.wrapT = THREE.RepeatWrapping;
  return _marbleFloorTex;
}

function getMarbleCeilingTex() {
  if (_marbleCeilingTex) return _marbleCeilingTex;
  const canvas = makeMarbleTileCanvas('#f5f1ec', 'rgba(195,185,172,0.4)');
  _marbleCeilingTex = new THREE.CanvasTexture(canvas);
  _marbleCeilingTex.wrapS = _marbleCeilingTex.wrapT = THREE.RepeatWrapping;
  return _marbleCeilingTex;
}

function cached(key, factory) {
  if (!_cache.has(key)) _cache.set(key, factory());
  return _cache.get(key);
}

// GitHub linguist language colors (subset)
export const LANG_COLORS = {
  JavaScript:  '#f1e05a',
  TypeScript:  '#3178c6',
  Python:      '#3572A5',
  Rust:        '#dea584',
  Go:          '#00ADD8',
  C:           '#555555',
  'C++':       '#f34b7d',
  'C#':        '#178600',
  Java:        '#b07219',
  Ruby:        '#701516',
  PHP:         '#4F5D95',
  Swift:       '#F05138',
  Kotlin:      '#A97BFF',
  Dart:        '#00B4AB',
  Scala:       '#c22d40',
  Haskell:     '#5e5086',
  Elixir:      '#6e4a7e',
  Lua:         '#000080',
  Shell:       '#89e051',
  HTML:        '#e34c26',
  CSS:         '#563d7c',
  Vue:         '#41b883',
  Svelte:      '#ff3e00',
  'Jupyter Notebook': '#DA5B0B',
  Zig:         '#ec915c',
  Nix:         '#7e7eff',
  default:     '#8b949e',
};

// GitHub contribution level colors (dark theme)
export const LEVEL_COLORS = [
  new THREE.Color('#161b22'), // 0 — no contributions
  new THREE.Color('#0e4429'), // 1 — light
  new THREE.Color('#006d32'), // 2 — moderate
  new THREE.Color('#26a641'), // 3 — active
  new THREE.Color('#39d353'), // 4 — very active
];

export function getLangColor(lang) {
  return LANG_COLORS[lang] || LANG_COLORS.default;
}

// Darken a hex color by a ratio (0-1)
export function darkenHex(hex, ratio) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - ratio);
  return c;
}

// ---------- Factory functions ----------

export function makeWallMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.85,
    metalness: 0.05,
  });
}

export function makeFloorMaterial(colorHex = '#1a2030') {
  return cached(`floor_${colorHex}`, () =>
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.9,
      metalness: 0.0,
    })
  );
}

export function makeCeilingMaterial(colorHex = '#0d1117') {
  return cached(`ceiling_${colorHex}`, () =>
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 1.0,
      metalness: 0.0,
    })
  );
}

// repeatX/Y: how many tiles to show across the surface
export function makeMarbleFloorMaterial(repeatX = 5, repeatY = 5) {
  const tex = getMarbleFloorTex().clone();
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.0,
  });
}

export function makeMarbleCeilingMaterial(repeatX = 4, repeatY = 4) {
  const tex = getMarbleCeilingTex().clone();
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.0,
    emissive: 0xf5f1ec,
    emissiveIntensity: 0.08,
  });
}

export function makePortalMaterial(colorHex) {
  return new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
  });
}

export function makePlaqueMaterial(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.FrontSide,
  });
}

export function makeContribMaterial() {
  return cached('contrib', () =>
    new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1,
      vertexColors: false,
    })
  );
}

export function makeArtifactMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.4,
    roughness: 0.3,
    metalness: 0.7,
  });
}
