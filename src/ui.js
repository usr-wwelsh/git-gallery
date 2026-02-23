let $loading, $status, $bar, $instructions, $crosshair, $tooltip, $minimap, minimapCtx, $directory, $teleportBadge;

export function initUI() {
  $loading      = document.getElementById('loading-screen');
  $status       = document.getElementById('loading-status');
  $bar          = document.getElementById('loading-bar');
  $instructions = document.getElementById('instructions');
  $crosshair    = document.getElementById('crosshair');
  $tooltip      = document.getElementById('tooltip');
  $minimap      = document.getElementById('minimap');

  $minimap.width  = 160;
  $minimap.height = 160;
  minimapCtx = $minimap.getContext('2d');
  $teleportBadge = document.getElementById('teleport-badge');
}

export function setLoading(statusText, pct) {
  if ($status) $status.textContent = statusText;
  if ($bar)    $bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

export function hideLoading() {
  if ($loading) {
    $loading.classList.add('hidden');
    setTimeout(() => { $loading.style.display = 'none'; }, 500);
  }
}

export function showInstructions() {
  if ($instructions) $instructions.classList.remove('hidden');
  if ($crosshair)    $crosshair.classList.remove('visible');
  if ($teleportBadge) $teleportBadge.classList.remove('visible');
}

export function hideInstructions() {
  if ($instructions) $instructions.classList.add('hidden');
  if ($crosshair)    $crosshair.classList.add('visible');
  if ($minimap)      $minimap.classList.add('visible');
  if ($teleportBadge) $teleportBadge.classList.add('visible');
}

export function showTooltip(text) {
  if (!$tooltip) return;
  $tooltip.textContent = text;
  $tooltip.classList.add('visible');
}

export function hideTooltip() {
  if ($tooltip) $tooltip.classList.remove('visible');
}

/**
 * Draw a top-down minimap.
 * @param {THREE.Vector3} playerPos — player world position
 * @param {{ position: THREE.Vector3, repoName: string }[]} roomMeta
 * @param {object} config  — { hallLength, roomDepth }
 */
export function updateMinimap(playerPos, roomMeta, config) {
  if (!minimapCtx || !$minimap.classList.contains('visible')) return;

  const W = $minimap.width;
  const H = $minimap.height;
  const ctx = minimapCtx;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#161b22';
  ctx.fillRect(0, 0, W, H);

  // World-space extent for mapping (roughly)
  const totalLen = (roomMeta.length + 2) * (config.hallLength || 8);
  const scale    = Math.min(W, H) / (totalLen * 2 + 10);
  const cx       = W / 2;
  const cy       = H * 0.85; // player starts near bottom

  function worldToMap(wx, wz) {
    return {
      x: cx + wx * scale,
      y: cy + wz * scale,
    };
  }

  // Hallway line
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 6;
  ctx.beginPath();
  const hStart = worldToMap(0, 0);
  const hEnd   = worldToMap(0, -totalLen);
  ctx.moveTo(hStart.x, hStart.y);
  ctx.lineTo(hEnd.x, hEnd.y);
  ctx.stroke();

  // Lobby marker
  ctx.fillStyle = '#0e4429';
  ctx.fillRect(cx - 12, cy - 12, 24, 24);

  // Room dots
  roomMeta.forEach((rm, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const z = -((i + 1) * (config.hallLength || 8));
    const x = side * ((config.hallWidth || 4) + (config.roomDepth || 6) * 0.5);
    const p = worldToMap(x, z);
    ctx.fillStyle = '#1f6feb';
    ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
  });

  // Player dot
  const p = worldToMap(playerPos.x, playerPos.z);

  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = '#58a6ff';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Border
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

// ── Room directory overlay ──────────────────────────────────

export function showDirectory(roomMeta, onSelect) {
  if ($directory) $directory.remove();

  $directory = document.createElement('div');
  $directory.id = 'directory';

  let html = '<div id="directory-inner">';
  html += '<h2>Room Directory</h2>';
  html += '<button class="dir-card dir-lobby" data-type="lobby">Lobby</button>';
  html += '<div class="dir-grid">';

  for (let i = 0; i < roomMeta.length; i++) {
    const rm = roomMeta[i];
    const langDot = `<span class="dir-lang-dot" style="background:${rm.langColor}"></span>`;
    html += `<button class="dir-card" data-idx="${i}">
      <span class="dir-card-name">${langDot}${escHtml(rm.repoName)}</span>
      <span class="dir-card-meta">${rm.stars} stars &middot; ${rm.lang}</span>
    </button>`;
  }

  html += '</div></div>';
  $directory.innerHTML = html;
  document.body.appendChild($directory);

  $directory.addEventListener('click', (e) => {
    const card = e.target.closest('.dir-card');
    if (!card) return;
    const type = card.dataset.type;
    if (type === 'lobby') {
      onSelect(null);
    } else {
      const idx = parseInt(card.dataset.idx, 10);
      onSelect(roomMeta[idx]);
    }
  });
}

export function hideDirectory() {
  if ($directory) { $directory.remove(); $directory = null; }
}

export function isDirectoryVisible() {
  return !!$directory;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
