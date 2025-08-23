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
  const chunkSize = 10;
  const chunks = new Map();

  // Prepare triangle data for random sampling on the floor geometry
  const posArr = floorGeometry.attributes.position.array;
  const idxArr = floorGeometry.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  const colorA = new THREE.Color(colorRange[0]);
  const colorB = new THREE.Color(colorRange[1]);
  const noise2D = (x, z) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

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

    const n = noise2D(x * 0.1, z * 0.1);
    offsets.set([x, y, z], i * 3);
    angles[i] = Math.random() * Math.PI * 2;
    if (n < 0.25) {
      scales[i] = 0;
      colors.set([0, 0, 0], i * 3);
      continue;
    }
    scales[i] = THREE.MathUtils.randFloat(heightRange[0], heightRange[1]) * (0.7 + n * 0.6);

    const c = colorA.clone().lerp(colorB, Math.random());
    colors.set([c.r, c.g, c.b], i * 3);

    const cellX = Math.floor(x / chunkSize);
    const cellZ = Math.floor(z / chunkSize);
    const key = `${cellX},${cellZ}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = {
        indices: [],
        center: new THREE.Vector2((cellX + 0.5) * chunkSize, (cellZ + 0.5) * chunkSize)
      };
      chunks.set(key, chunk);
    }
    chunk.indices.push(i);
  }

  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1));
  geo.setAttribute('scale', new THREE.InstancedBufferAttribute(scales, 1));
  geo.setAttribute('color', new THREE.InstancedBufferAttribute(colors, 3));
  geo.instanceCount = bladeCount;
  const baseOffsets = offsets.slice();
  const baseAngles = angles.slice();
  const baseColors = colors.slice();
  const baseScales = scales.slice();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      windStrength: { value: windStrength },
      windDirection: { value: new THREE.Vector2(1, 0) },
      heightFactor: { value: 1 },
      snowMix: { value: 0 },
      actorPos: { value: new THREE.Vector3() },
      actorRadius: { value: 1.5 }
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
      uniform vec3 actorPos;
      uniform float actorRadius;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec3 pos = position;
        pos.y *= scale * heightFactor;
        float sway = sin(time + offset.x + offset.z);
        float disp = (windStrength * 0.6 + max(0.0, sway) * windStrength +
          min(0.0, sway) * windStrength * 0.1) * position.y;
        pos.xz += windDirection * disp;
        vec2 actorVec = offset.xz - actorPos.xz;
        float dist = length(actorVec);
        float influence = max(0.0, 1.0 - dist / actorRadius);
        if (dist > 0.0001) actorVec /= dist; else actorVec = vec2(0.0);
        pos.xz += actorVec * influence * 0.2 * position.y;
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
  mesh.userData.actor = null;
  mesh.userData.lod = {
    chunks,
    baseOffsets,
    baseAngles,
    baseColors,
    baseScales,
    near: 15,
    far: 30
  };
  const camVec2 = new THREE.Vector2();
  let last = performance.now() / 1000;
  mesh.onBeforeRender = (_, __, camera, geometry, mat) => {
    const now = performance.now() / 1000;
    const dt = now - last;
    last = now;
    mat.uniforms.time.value += dt * (0.8 + mat.uniforms.windStrength.value);
    const actor = mesh.userData.actor;
    if (actor && actor.position) {
      mat.uniforms.actorPos.value.copy(actor.position);
    }
    const lod = mesh.userData.lod;
    if (lod) {
      camVec2.set(camera.position.x, camera.position.z);
      const offsetsAttr = geometry.getAttribute('offset');
      const anglesAttr = geometry.getAttribute('angle');
      const colorsAttr = geometry.getAttribute('color');
      const scalesAttr = geometry.getAttribute('scale');
      let write = 0;
      for (const chunk of lod.chunks.values()) {
        const dist = camVec2.distanceTo(chunk.center);
        let factor = 0;
        if (dist < lod.near) factor = 1;
        else if (dist < lod.far) factor = 0.5;
        if (factor <= 0) continue;
        for (const idx of chunk.indices) {
          const baseScale = lod.baseScales[idx];
          if (baseScale <= 0) continue;
          const i3 = idx * 3;
          offsetsAttr.setXYZ(write, lod.baseOffsets[i3], lod.baseOffsets[i3 + 1], lod.baseOffsets[i3 + 2]);
          anglesAttr.setX(write, lod.baseAngles[idx]);
          colorsAttr.setXYZ(write, lod.baseColors[i3], lod.baseColors[i3 + 1], lod.baseColors[i3 + 2]);
          scalesAttr.setX(write, baseScale * factor);
          write++;
        }
      }
      geometry.instanceCount = write;
      offsetsAttr.needsUpdate = true;
      anglesAttr.needsUpdate = true;
      colorsAttr.needsUpdate = true;
      scalesAttr.needsUpdate = true;
    }
  };
  return mesh;
}

// Remove blades that fall within any obstacle's bounding box.
// `obstacles` should be an array of THREE.Object3D already added to the scene.
export function cullGrassUnderObjects(grassMesh, obstacles = []) {
  if (!grassMesh || !obstacles.length) return;
  const lod = grassMesh.userData.lod;
  if (!lod) return;
  const offsets = lod.baseOffsets;
  const scales = grassMesh.geometry.getAttribute('scale');
  const baseScales = lod.baseScales;
  if (!offsets || !scales || !baseScales) return;

  // Precompute bounding boxes to avoid repeated allocations in the loop
  const boxes = [];
  for (const obj of obstacles) {
    try {
      boxes.push(new THREE.Box3().setFromObject(obj));
    } catch (_) {}
  }

  for (let i = 0; i < baseScales.length; i++) {
    const x = offsets[i * 3];
    const y = offsets[i * 3 + 1];
    const z = offsets[i * 3 + 2];
    for (const b of boxes) {
      if (
        x >= b.min.x && x <= b.max.x &&
        z >= b.min.z && z <= b.max.z &&
        y >= b.min.y && y <= b.max.y
      ) {
        if (i < scales.count) scales.setX(i, 0);
        baseScales[i] = 0;
        break;
      }
    }
  }
  scales.needsUpdate = true;
}

