import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createGrassMesh({
  floorGeometry,
  bladeCount = 5000,
  colorRange = [0x6dbb3c, 0x4c8a2f],
  heightRange = [0.8, 1.6],
  windStrength = 0.3,
  noiseFreq = 0.2,
  proxyTexture = null
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
  const heights = new Float32Array(bladeCount);
  const seeds = new Float32Array(bladeCount);
  const tilts = new Float32Array(bladeCount);
  const swayPhases = new Float32Array(bladeCount);
  const swayAmps = new Float32Array(bladeCount);
  const chunkSize = 10;
  const chunks = new Map();

  // Prepare triangle data for random sampling on the floor geometry
  const posArr = floorGeometry.attributes.position.array;
  const idxArr = floorGeometry.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  const colorA = new THREE.Color(colorRange[0]);
  const colorB = new THREE.Color(colorRange[1]);
  const proxyColor = colorA.clone().lerp(colorB, 0.5);
  const proxyMat = new THREE.MeshBasicMaterial({
    color: proxyColor,
    map: proxyTexture,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
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

    const n = noise2D(x * noiseFreq, z * noiseFreq);
    offsets.set([x, y, z], i * 3);
    angles[i] = Math.random() * Math.PI * 2;
    seeds[i] = Math.random();
    tilts[i] = Math.random();
    swayPhases[i] = Math.random() * Math.PI * 2;
    swayAmps[i] = 0.5 + Math.random() * 0.5;
    const minScale = heightRange[0];
    const maxScale = heightRange[1];
    heights[i] = Math.max(minScale, n * maxScale);

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

  const offsetAttr = new THREE.InstancedBufferAttribute(offsets, 3);
  const angleAttr = new THREE.InstancedBufferAttribute(angles, 1);
  const heightAttr = new THREE.InstancedBufferAttribute(heights, 1);
  const seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
  const tiltAttr = new THREE.InstancedBufferAttribute(tilts, 1);
  const swayPhaseAttr = new THREE.InstancedBufferAttribute(swayPhases, 1);
  const swayAmpAttr = new THREE.InstancedBufferAttribute(swayAmps, 1);
  offsetAttr.setUsage(THREE.DynamicDrawUsage);
  angleAttr.setUsage(THREE.DynamicDrawUsage);
  heightAttr.setUsage(THREE.DynamicDrawUsage);
  seedAttr.setUsage(THREE.DynamicDrawUsage);
  tiltAttr.setUsage(THREE.DynamicDrawUsage);
  swayPhaseAttr.setUsage(THREE.DynamicDrawUsage);
  swayAmpAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('offset', offsetAttr);
  geo.setAttribute('angle', angleAttr);
  geo.setAttribute('aHeight', heightAttr);
  geo.setAttribute('aSeed', seedAttr);
  geo.setAttribute('aTilt', tiltAttr);
  geo.setAttribute('swayPhase', swayPhaseAttr);
  geo.setAttribute('swayAmp', swayAmpAttr);
  geo.instanceCount = bladeCount;
  const baseOffsets = offsets.slice();
  const baseAngles = angles.slice();
  const baseHeights = heights.slice();
  const baseSeeds = seeds.slice();
  const baseTilts = tilts.slice();
  const baseSwayPhases = swayPhases.slice();
  const baseSwayAmps = swayAmps.slice();

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
      attribute float aHeight;
      attribute float aSeed;
      attribute float aTilt;
      attribute float swayPhase;
      attribute float swayAmp;
      uniform float time;
      uniform float windStrength;
      uniform vec2 windDirection;
      uniform float heightFactor;
      uniform vec3 actorPos;
      uniform float actorRadius;
      varying float vT;
      varying float vHue;
      void main(){
        vec3 pos = position;
        float t = clamp(pos.y, 0.0, 1.0);
        vT = t;
        vHue = fract(aSeed * 13.37);
        float tx = (aTilt - 0.5) * 0.25;
        float tz = (fract(aTilt * 1.7) - 0.5) * 0.25;
        mat3 RX = mat3(1.0,0.0,0.0, 0.0,cos(tx),-sin(tx), 0.0,sin(tx),cos(tx));
        mat3 RZ = mat3(cos(tz),-sin(tz),0.0, sin(tz),cos(tz),0.0, 0.0,0.0,1.0);
        pos = RZ * RX * pos;
        pos.y *= aHeight * heightFactor;
        float sway = sin(time + swayPhase) * swayAmp;
        pos.xz += windDirection * (windStrength * sway * t * t);
        vec2 actorVec = offset.xz - actorPos.xz;
        float dist = length(actorVec);
        float influence = max(0.0, 1.0 - dist / actorRadius);
        if (dist > 0.0001) actorVec /= dist; else actorVec = vec2(0.0);
        pos.xz += actorVec * influence * 0.2 * t;
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
      precision mediump float;
      varying float vT;
      varying float vHue;
      uniform float snowMix;
      vec3 h2rgb(float h){
        vec3 k=vec3(1.0,2.0/3.0,1.0/3.0);
        vec3 p=abs(fract(vec3(h)+k)*6.0-3.0);
        return clamp(p-1.0,0.0,1.0);
      }
      void main(){
        float h=mix(0.28,0.33,vHue);
        vec3 base=h2rgb(h);
        vec3 col=mix(base*0.35,base*0.85,smoothstep(0.0,1.0,vT));
        col=mix(col, vec3(1.0), snowMix);
        gl_FragColor=vec4(col,1.0);
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
    baseHeights,
    baseSeeds,
    baseTilts,
    baseSwayPhases,
    baseSwayAmps,
    near: 15,
    far: 30
  };
  for (const chunk of chunks.values()) {
    const proxy = new THREE.Mesh(new THREE.PlaneGeometry(chunkSize, chunkSize), proxyMat.clone());
    proxy.rotation.x = -Math.PI / 2;
    proxy.position.set(chunk.center.x, 0.01, chunk.center.y);
    mesh.add(proxy);
    chunk.proxy = proxy;
  }
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
      const seedAttr = geometry.getAttribute('aSeed');
      const heightAttr = geometry.getAttribute('aHeight');
      const tiltAttr = geometry.getAttribute('aTilt');
      const swayPhaseAttr = geometry.getAttribute('swayPhase');
      const swayAmpAttr = geometry.getAttribute('swayAmp');
      let write = 0;
      // Fade chunk density smoothly based on camera distance and crossfade to proxies
      for (const chunk of lod.chunks.values()) {
        const dist = camVec2.distanceTo(chunk.center);
        let factor = 0;
        if (dist < lod.near) {
          factor = 1;
        } else if (dist < lod.far) {
          factor = (lod.far - dist) / (lod.far - lod.near);
        }
        const proxyOpacity = 1 - factor;
        if (chunk.proxy) {
          chunk.proxy.material.opacity = proxyOpacity;
          chunk.proxy.visible = proxyOpacity > 0.001;
        }
        if (factor <= 0.001) continue;
        for (const idx of chunk.indices) {
          const baseHeight = lod.baseHeights[idx];
          if (baseHeight <= 0) continue;
          const i3 = idx * 3;
          offsetsAttr.setXYZ(write, lod.baseOffsets[i3], lod.baseOffsets[i3 + 1], lod.baseOffsets[i3 + 2]);
          anglesAttr.setX(write, lod.baseAngles[idx]);
          seedAttr.setX(write, lod.baseSeeds[idx]);
          heightAttr.setX(write, baseHeight * factor);
          tiltAttr.setX(write, lod.baseTilts[idx]);
          swayPhaseAttr.setX(write, lod.baseSwayPhases[idx]);
          swayAmpAttr.setX(write, lod.baseSwayAmps[idx]);
          write++;
        }
      }
      geometry.instanceCount = write;
      offsetsAttr.needsUpdate = true;
      anglesAttr.needsUpdate = true;
      seedAttr.needsUpdate = true;
      heightAttr.needsUpdate = true;
      tiltAttr.needsUpdate = true;
      swayPhaseAttr.needsUpdate = true;
      swayAmpAttr.needsUpdate = true;
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
  const heights = grassMesh.geometry.getAttribute('aHeight');
  const baseHeights = lod.baseHeights;
  if (!offsets || !heights || !baseHeights) return;

  // Precompute bounding boxes to avoid repeated allocations in the loop
  const boxes = [];
  for (const obj of obstacles) {
    try {
      boxes.push(new THREE.Box3().setFromObject(obj));
    } catch (_) {}
  }

  for (let i = 0; i < baseHeights.length; i++) {
    const x = offsets[i * 3];
    const y = offsets[i * 3 + 1];
    const z = offsets[i * 3 + 2];
    for (const b of boxes) {
      if (
        x >= b.min.x && x <= b.max.x &&
        z >= b.min.z && z <= b.max.z &&
        y >= b.min.y && y <= b.max.y
      ) {
        if (i < heights.count) heights.setX(i, 0);
        baseHeights[i] = 0;
        break;
      }
    }
  }
  heights.needsUpdate = true;
}

