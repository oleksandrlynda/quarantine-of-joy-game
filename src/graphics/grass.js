import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createGrassMesh({
  floorGeometry,
  bladeCount = 5000,
  colorRange = [0x6dbb3c, 0x4c8a2f],
  heightRange = [0.8, 1.6],
  windStrength = 0.3
} = {}) {
  // Base geometry for a single blade
  const blade = new THREE.PlaneGeometry(0.1, 1, 1, 3);
  blade.translate(0, 0.5, 0); // Pivot at bottom

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.attributes.position = blade.attributes.position;
  geo.attributes.uv = blade.attributes.uv;

  const offsets = new Float32Array(bladeCount * 3);
  const angles = new Float32Array(bladeCount);
  const scales = new Float32Array(bladeCount);
  const colors = new Float32Array(bladeCount * 3);

  // Prepare triangle data for random sampling on the floor geometry
  const posArr = floorGeometry.attributes.position.array;
  const idxArr = floorGeometry.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  const colorA = new THREE.Color(colorRange[0]);
  const colorB = new THREE.Color(colorRange[1]);

  for (let i = 0; i < bladeCount; i++) {
    // Pick a random triangle on the floor
    const tri = Math.floor(Math.random() * triCount);
    const ia = idxArr ? idxArr[tri * 3] : tri * 3;
    const ib = idxArr ? idxArr[tri * 3 + 1] : tri * 3 + 1;
    const ic = idxArr ? idxArr[tri * 3 + 2] : tri * 3 + 2;

    const ax = posArr[ia * 3], ay = posArr[ia * 3 + 1], az = posArr[ia * 3 + 2];
    const bx = posArr[ib * 3], by = posArr[ib * 3 + 1], bz = posArr[ib * 3 + 2];
    const cx = posArr[ic * 3], cy = posArr[ic * 3 + 1], cz = posArr[ic * 3 + 2];

    // Barycentric coordinates for uniform sampling inside triangle
    const r1 = Math.random();
    const r2 = Math.random();
    const sqrtR1 = Math.sqrt(r1);
    const u = 1 - sqrtR1;
    const v = r2 * sqrtR1;
    const w = 1 - u - v;

    const x = u * ax + v * bx + w * cx;
    const y = u * ay + v * by + w * cy + 0.01; // Offset slightly above floor
    const z = u * az + v * bz + w * cz;

    offsets.set([x, y, z], i * 3);
    angles[i] = Math.random() * Math.PI * 2;
    scales[i] = THREE.MathUtils.randFloat(heightRange[0], heightRange[1]);

    const c = colorA.clone().lerp(colorB, Math.random());
    colors.set([c.r, c.g, c.b], i * 3);
  }

  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1));
  geo.setAttribute('scale', new THREE.InstancedBufferAttribute(scales, 1));
  geo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      windStrength: { value: windStrength },
      windDirection: { value: new THREE.Vector2(1, 0) },
      heightFactor: { value: 1 },
      snowMix: { value: 0 }
    },
    vertexShader: `
      attribute vec3 offset;
      attribute float angle;
      attribute float scale;
      attribute vec3 color;
      uniform float time;
      uniform float windStrength;
      uniform vec2 windDirection;
      uniform float heightFactor;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec3 pos = position;
        pos.y *= scale * heightFactor;
        float sway = sin(time + offset.x + offset.z) * windStrength;
        pos.xz += windDirection * (sway * position.y);
        float c = cos(angle);
        float s = sin(angle);
        pos = vec3(
          pos.x * c - pos.z * s,
          pos.y,
          pos.x * s + pos.z * c
        );
        pos += offset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float snowMix;
      void main(){
        vec3 c = mix(vColor, vec3(1.0), snowMix);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (_, __, ___, ____, mat) => {
    mat.uniforms.time.value = performance.now() / 1000;
  };
  return mesh;
}

// Remove blades that fall within any obstacle's bounding box.
// `obstacles` should be an array of THREE.Object3D already added to the scene.
export function cullGrassUnderObjects(grassMesh, obstacles = []) {
  if (!grassMesh || !obstacles.length) return;
  const offsets = grassMesh.geometry.getAttribute('offset');
  const scales = grassMesh.geometry.getAttribute('scale');
  if (!offsets || !scales) return;

  // Precompute bounding boxes to avoid repeated allocations in the loop
  const boxes = [];
  for (const obj of obstacles) {
    try {
      boxes.push(new THREE.Box3().setFromObject(obj));
    } catch (_) {}
  }

  for (let i = 0; i < offsets.count; i++) {
    const x = offsets.getX(i);
    const y = offsets.getY(i);
    const z = offsets.getZ(i);
    for (const b of boxes) {
      if (
        x >= b.min.x && x <= b.max.x &&
        z >= b.min.z && z <= b.max.z &&
        y >= b.min.y && y <= b.max.y
      ) {
        scales.setX(i, 0);
        break;
      }
    }
  }
  scales.needsUpdate = true;
}

