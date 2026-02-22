import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export function createControls(camera, domElement, config) {
  const controls = new PointerLockControls(camera, domElement);

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const keys = {};

  // Key state tracking
  const onKeyDown = (e) => { keys[e.code] = true; };
  const onKeyUp   = (e) => { keys[e.code] = false; };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);

  // Lock on click anywhere (document so overlay clicks work too)
  const onClick = () => {
    if (!controls.isLocked) controls.lock();
  };
  document.addEventListener('click', onClick);

  const { speed, runMultiplier, height, damping } = config;

  /**
   * Call each frame with the elapsed delta time (seconds).
   */
  controls.updateMovement = function (delta) {
    if (!controls.isLocked) return;

    const moveSpeed = speed * (keys['ShiftLeft'] || keys['ShiftRight'] ? runMultiplier : 1);

    const inputX = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    const inputZ = (keys['KeyS'] || keys['ArrowDown']  ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp']   ? 1 : 0);

    // Target velocity in units/sec, normalized so diagonals aren't faster
    const len = Math.hypot(inputX, inputZ) || 1;
    const targetX = inputX / len * moveSpeed * (inputX !== 0 || inputZ !== 0 ? 1 : 0);
    const targetZ = inputZ / len * moveSpeed * (inputX !== 0 || inputZ !== 0 ? 1 : 0);

    // Smooth toward target (high damping = snappy, low = floaty)
    const t = Math.min(1, damping * delta);
    velocity.x += (targetX - velocity.x) * t;
    velocity.z += (targetZ - velocity.z) * t;

    // moveRight/moveForward take a distance (units), so multiply by delta
    controls.moveRight(velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    // Lock Y (no gravity / no jumping)
    controls.getObject().position.y = height;
  };

  controls.dispose = (function (originalDispose) {
    return function () {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      document.removeEventListener('click', onClick);
      originalDispose.call(this);
    };
  })(controls.dispose);

  return controls;
}
