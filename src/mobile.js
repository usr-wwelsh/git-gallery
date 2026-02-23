import * as THREE from 'three';

/**
 * Detect touch-capable device.
 */
export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Create mobile-friendly touch controls that match the PointerLockControls interface.
 * Left half: movement joystick. Right half: camera look (touch drag).
 */
export function createMobileControls(camera, config) {
  const { speed, runMultiplier, height, damping } = config;

  // Yaw wrapper (like PointerLockControls)
  const yawObject = new THREE.Object3D();
  yawObject.position.copy(camera.position);
  yawObject.add(camera);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);

  const pitchObject = new THREE.Object3D();
  yawObject.add(pitchObject);

  let _isLocked = false;
  let _isMoving = false;
  let _isRunning = false;

  // Joystick state
  let joystickTouchId = null;
  let joystickStartX = 0;
  let joystickStartY = 0;
  let joystickDX = 0;
  let joystickDY = 0;

  // Look state
  let lookTouchId = null;
  let lookLastX = 0;
  let lookLastY = 0;

  const velocity = new THREE.Vector3();
  const listeners = {};

  // Sensitivity
  const lookSensitivity = 0.003;
  const joystickDeadzone = 10;
  const joystickMaxRadius = 60;

  // Create overlay UI
  const overlay = document.createElement('div');
  overlay.id = 'mobile-controls';
  overlay.innerHTML = `
    <div id="mobile-joystick-zone">
      <div id="mobile-joystick-base">
        <div id="mobile-joystick-thumb"></div>
      </div>
    </div>
    <div id="mobile-look-zone"></div>
    <div id="mobile-tap-start">Tap to Start</div>
  `;
  document.body.appendChild(overlay);

  const joystickZone = document.getElementById('mobile-joystick-zone');
  const joystickBase = document.getElementById('mobile-joystick-base');
  const joystickThumb = document.getElementById('mobile-joystick-thumb');
  const lookZone = document.getElementById('mobile-look-zone');
  const tapStart = document.getElementById('mobile-tap-start');

  // Initially hide controls until "locked"
  joystickZone.style.display = 'none';
  lookZone.style.display = 'none';

  // Tap to start
  tapStart.addEventListener('touchstart', (e) => {
    e.preventDefault();
    controls.lock();
  });

  // Joystick touch handling
  joystickZone.addEventListener('touchstart', (e) => {
    if (joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickStartX = touch.clientX;
    joystickStartY = touch.clientY;

    // Position the base at touch point
    joystickBase.style.left = `${touch.clientX - 50}px`;
    joystickBase.style.top = `${touch.clientY - 50}px`;
    joystickBase.style.display = 'block';
    joystickThumb.style.transform = 'translate(0, 0)';
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== joystickTouchId) continue;
      let dx = touch.clientX - joystickStartX;
      let dy = touch.clientY - joystickStartY;

      // Clamp to max radius
      const dist = Math.hypot(dx, dy);
      if (dist > joystickMaxRadius) {
        dx = (dx / dist) * joystickMaxRadius;
        dy = (dy / dist) * joystickMaxRadius;
      }

      joystickDX = dx;
      joystickDY = dy;
      joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    e.preventDefault();
  }, { passive: false });

  const endJoystick = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== joystickTouchId) continue;
      joystickTouchId = null;
      joystickDX = 0;
      joystickDY = 0;
      joystickBase.style.display = 'none';
    }
  };
  joystickZone.addEventListener('touchend', endJoystick);
  joystickZone.addEventListener('touchcancel', endJoystick);

  // Look touch handling
  lookZone.addEventListener('touchstart', (e) => {
    if (lookTouchId !== null) return;
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lookLastX = touch.clientX;
    lookLastY = touch.clientY;
    e.preventDefault();
  }, { passive: false });

  lookZone.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== lookTouchId) continue;
      const dx = touch.clientX - lookLastX;
      const dy = touch.clientY - lookLastY;
      lookLastX = touch.clientX;
      lookLastY = touch.clientY;

      // Rotate yaw and pitch
      yawObject.rotation.y -= dx * lookSensitivity;
      camera.rotation.x -= dy * lookSensitivity;
      camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
    e.preventDefault();
  }, { passive: false });

  const endLook = (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== lookTouchId) continue;
      lookTouchId = null;
    }
  };
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', endLook);

  const controls = {
    get isLocked() { return _isLocked; },
    get isMoving() { return _isMoving; },
    get isRunning() { return _isRunning; },

    getObject() { return yawObject; },

    lock() {
      _isLocked = true;
      tapStart.style.display = 'none';
      joystickZone.style.display = 'block';
      lookZone.style.display = 'block';
      emit('lock');
    },

    unlock() {
      _isLocked = false;
      tapStart.style.display = 'flex';
      joystickZone.style.display = 'none';
      lookZone.style.display = 'none';
      emit('unlock');
    },

    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },

    moveRight(dist) {
      const v = new THREE.Vector3();
      v.setFromMatrixColumn(yawObject.matrix, 0);
      yawObject.position.addScaledVector(v, dist);
    },

    moveForward(dist) {
      const v = new THREE.Vector3();
      v.setFromMatrixColumn(yawObject.matrix, 0);
      v.crossVectors(yawObject.up, v);
      yawObject.position.addScaledVector(v, dist);
    },

    updateMovement(delta) {
      if (!_isLocked) return;

      const dist = Math.hypot(joystickDX, joystickDY);
      _isMoving = dist > joystickDeadzone;
      _isRunning = dist > joystickMaxRadius * 0.75;

      if (_isMoving) {
        const normX = joystickDX / joystickMaxRadius;
        const normY = joystickDY / joystickMaxRadius;
        const moveSpeed = speed * (_isRunning ? runMultiplier : 1);

        const targetX = normX * moveSpeed;
        const targetZ = normY * moveSpeed;

        const t = Math.min(1, damping * delta);
        velocity.x += (targetX - velocity.x) * t;
        velocity.z += (targetZ - velocity.z) * t;

        controls.moveRight(velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
      } else {
        const t = Math.min(1, damping * delta);
        velocity.x *= (1 - t);
        velocity.z *= (1 - t);
      }

      yawObject.position.y = height;
    },

    dispose() {
      overlay.remove();
    },
  };

  function emit(event) {
    if (listeners[event]) listeners[event].forEach(fn => fn());
  }

  return controls;
}
