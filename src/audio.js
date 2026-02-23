/**
 * Procedural audio manager — ambient hum + footstep sounds.
 * All sounds generated via Web Audio API (no external files).
 */
export function createAudioManager() {
  let ctx = null;
  let ambientGain = null;
  let started = false;
  let stepTimer = 0;

  function ensureContext() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }

    // Ambient hum: filtered noise at ~100Hz, very quiet
    const bufSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 100;
    bandpass.Q.value = 0.8;

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.02;

    noiseSource.connect(bandpass);
    bandpass.connect(ambientGain);
    ambientGain.connect(ctx.destination);
    noiseSource.start();
    started = true;

    return true;
  }

  function playStep() {
    if (!ctx) return;

    // Soft marble footstep: low thud + gentle high tap
    const duration = 0.12;
    const bufSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      // Smooth envelope — fast attack, gentle decay
      const env = Math.exp(-t / 0.025) * 0.6 + Math.exp(-t / 0.06) * 0.4;
      // Mix low thump sine with soft noise
      const thump = Math.sin(2 * Math.PI * 80 * t) * 0.7;
      const noise = (Math.random() * 2 - 1) * 0.3;
      data[i] = (thump + noise) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Low-pass to keep it warm but audible
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1200;
    lowpass.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.35;

    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  return {
    /**
     * Resume/init the audio context (call on user gesture like pointer lock).
     */
    resume() {
      if (!ensureContext()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },

    /**
     * Update each frame.
     * @param {boolean} isMoving
     * @param {boolean} isRunning
     * @param {number} delta - seconds since last frame
     */
    update(isMoving, isRunning, delta) {
      if (!started) return;

      if (isMoving) {
        const interval = isRunning ? 0.3 : 0.45;
        stepTimer += delta;
        if (stepTimer >= interval) {
          stepTimer -= interval;
          playStep();
        }
      } else {
        stepTimer = 0;
      }
    },
  };
}
