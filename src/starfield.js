import * as THREE from 'three';

/**
 * Add a starfield skybox to the scene.
 * 2500 points on a sphere (radius 80), single draw call, no per-frame updates.
 */
export function createStarfield(scene) {
  const count = 2500;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Random point on sphere, but only above Y=10 (well above ceiling)
    // so no stars appear inside the building at eye level
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 80;

    let x = r * Math.sin(phi) * Math.cos(theta);
    let y = r * Math.sin(phi) * Math.sin(theta);
    let z = r * Math.cos(phi);

    // Push any stars below Y=10 to the upper hemisphere
    if (y < 10) y = 10 + Math.abs(y);

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
    depthWrite: false,
    fog: false,  // stars must ignore scene fog or they're invisible at radius 80
  });

  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false; // always visible (surrounds camera)
  scene.add(stars);

  return stars;
}
