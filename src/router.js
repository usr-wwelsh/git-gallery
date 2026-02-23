import { Euler as ThreeEuler } from 'three';

/**
 * URL hash routing — deep-link to rooms or lobby.
 * Hash format: #lobby or #room/repo-name
 */

/**
 * Parse current URL hash.
 * @returns {{ type: 'lobby'|'room', repoName?: string }}
 */
export function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === 'lobby') return { type: 'lobby' };
  if (hash.startsWith('room/')) {
    const repoName = decodeURIComponent(hash.slice(5));
    if (repoName) return { type: 'room', repoName };
  }
  return { type: 'lobby' };
}

/**
 * Update the URL hash without triggering hashchange.
 * @param {'lobby'|'room'} type
 * @param {string} [repoName]
 */
export function setHash(type, repoName) {
  const hash = type === 'room' && repoName
    ? `#room/${encodeURIComponent(repoName)}`
    : '#lobby';
  history.replaceState(null, '', hash);
}

/**
 * Teleport the camera to a room's center.
 * @param {THREE.Camera} camera
 * @param {object} controls - PointerLockControls or mobile controls
 * @param {object} room - roomMeta entry
 * @param {object} config - CONFIG object
 */
export function teleportToRoom(camera, controls, room, config) {
  const rd = config.museum.roomDepth || 10;
  const pos = controls.getObject ? controls.getObject().position : camera.position;
  // Land just inside the doorway (inner wall side), offset toward hallway
  const side = room.position.x > 0 ? 1 : -1;
  pos.x = room.position.x - side * (room.rw / 2 - 1.5);
  pos.y = config.player.height;
  pos.z = room.position.z;

  // Face toward the README panels (outer side wall, opposite the doorway)
  // PointerLockControls reads/writes camera.quaternion directly via YXZ euler
  const facingY = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  camera.quaternion.setFromEuler(new ThreeEuler(0, facingY, 0, 'YXZ'));
}

/**
 * Teleport the camera to lobby start position.
 * @param {THREE.Camera} camera
 * @param {object} controls
 * @param {object} config
 */
export function teleportToLobby(camera, controls, config) {
  const pos = controls.getObject ? controls.getObject().position : camera.position;
  pos.x = 0;
  pos.y = config.player.height;
  pos.z = config.lobby.lobbyCenterZ + 2;
}
