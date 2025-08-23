import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createGrassMesh({
  floorGeometry,
  bladeCount,
  colorRange = [0x6dbb3c, 0x4c8a2f],
  heightRange = [0.8, 1.6],
  windStrength = 0.3,
  tileSize = 20,
  lodLevels
} = {}) {
  const levels = lodLevels || [{ bladeCount: bladeCount ?? 5000, windStrength, segments: 3 }];
  floorGeometry.computeBoundingBox();
  const bounds = floorGeometry.boundingBox;
  const sizeX = bounds.max.x - bounds.min.x;
  const sizeZ = bounds.max.z - bounds.min.z;
  const tilesX = Math.ceil(sizeX / tileSize);
  const tilesZ = Math.ceil(sizeZ / tileSize);

  const posArr = floorGeometry.attributes.position.array;
  const idxArr = floorGeometry.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  const tiles = Array.from({ length: tilesX * tilesZ }, () => ({ triangles: [], area: 0 }));
  let totalArea = 0;
  for (let i = 0; i < triCount; i++) {
    const ia = idxArr ? idxArr[i * 3] : i * 3;
    const ib = idxArr ? idxArr[i * 3 + 1] : i * 3 + 1;
    const ic = idxArr ? idxArr[i * 3 + 2] : i * 3 + 2;

    const ax = posArr[ia * 3], ay = posArr[ia * 3 + 1], az = posArr[ia * 3 + 2];
    const bx = posArr[ib * 3], by = posArr[ib * 3 + 1], bz = posArr[ib * 3 + 2];
    const cx = posArr[ic * 3], cy = posArr[ic * 3 + 1], cz = posArr[ic * 3 + 2];

    const centroidX = (ax + bx + cx) / 3;
    const centroidZ = (az + bz + cz) / 3;
    const tx = Math.floor((centroidX - bounds.min.x) / tileSize);
    const tz = Math.floor((centroidZ - bounds.min.z) / tileSize);
    if (tx < 0 || tx >= tilesX || tz < 0 || tz >= tilesZ) continue;
    const tile = tiles[tz * tilesX + tx];
    tile.triangles.push([ax, ay, az, bx, by, bz, cx, cy, cz]);
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crossx = aby * acz - abz * acy;
    const crossy = abz * acx - abx * acz;
    const crossz = abx * acy - aby * acx;
    const area = 0.5 * Math.sqrt(crossx * crossx + crossy * crossy + crossz * crossz);
    tile.area += area;
    totalArea += area;
  }

  const activeTiles = tiles.filter(t => t.area > 0);
  activeTiles.forEach(t => { t.counts = levels.map(() => 0); });
  levels.forEach((lvl, li) => {
    let remaining = lvl.bladeCount;
    let remainingArea = totalArea;
    const lastIdx = activeTiles.length - 1;
    activeTiles.forEach((t, i) => {
      if (i === lastIdx) {
        // Assign all leftover blades to the final tile.
        t.counts[li] = Math.max(1, remaining);
      } else {
        const share = Math.max(1, Math.floor(remaining * (t.area / remainingArea)));
        t.counts[li] = share;
        remaining -= share;
        remainingArea -= t.area;
      }
    });
    // Correct rounding errors by adjusting the last tile.
    const allocated = activeTiles.reduce((sum, t) => sum + t.counts[li], 0);
    const diff = lvl.bladeCount - allocated;
    if (diff !== 0) {
      activeTiles[lastIdx].counts[li] += diff;
    }
  });

  const baseGeos = levels.map(lvl => {
    const g = new THREE.PlaneGeometry(0.1, 1, 1, lvl.segments || 1);
    g.translate(0, 0.5, 0);
    return g;
  });

  const colorA = new THREE.Color(colorRange[0]);
  const colorB = new THREE.Color(colorRange[1]);
  const meshes = [];
  const groups = [];
  activeTiles.forEach((tile, idx) => {
    const triCountTile = tile.triangles.length;
    const triData = new Float32Array(triCountTile * 3 * 4);
    tile.triangles.forEach((t, i) => {
      triData.set([t[0], t[1], t[2], 0], (i * 3) * 4);
      triData.set([t[3], t[4], t[5], 0], (i * 3 + 1) * 4);
      triData.set([t[6], t[7], t[8], 0], (i * 3 + 2) * 4);
    });
    const triTexture = new THREE.DataTexture(
      triData,
      triCountTile * 3,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    triTexture.needsUpdate = true;
    triTexture.magFilter = THREE.NearestFilter;
    triTexture.minFilter = THREE.NearestFilter;

    const tileX = idx % tilesX;
    const tileZ = Math.floor(idx / tilesX);
    const minX = bounds.min.x + tileX * tileSize;
    const maxX = Math.min(minX + tileSize, bounds.max.x);
    const minZ = bounds.min.z + tileZ * tileSize;
    const maxZ = Math.min(minZ + tileSize, bounds.max.z);

    const group = { meshes: [], center: new THREE.Vector3((minX + maxX)/2, 0, (minZ + maxZ)/2) };

    levels.forEach((lvl, li) => {
      const count = tile.counts[li];
      if (!count) return;
      const maxDisp = heightRange[1] * (lvl.windStrength || 0);
      const box = new THREE.Box3(
        new THREE.Vector3(minX - maxDisp, 0, minZ - maxDisp),
        new THREE.Vector3(maxX + maxDisp, heightRange[1], maxZ + maxDisp)
      );
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          windStrength: { value: lvl.windStrength },
          windDirection: { value: new THREE.Vector2(1, 0) },
          heightFactor: { value: 1 },
          snowMix: { value: 0 },
          triData: { value: triTexture },
          triCount: { value: triCountTile },
          texWidth: { value: triCountTile * 3 },
          colorA: { value: colorA },
          colorB: { value: colorB },
          heightMin: { value: heightRange[0] },
          heightMax: { value: heightRange[1] },
          opacity: { value: 1 }
        },
        vertexShader: `
          uniform sampler2D triData;
          uniform float triCount;
          uniform float texWidth;
          uniform float time;
          uniform float windStrength;
          uniform vec2 windDirection;
          uniform float heightFactor;
          uniform vec3 colorA;
          uniform vec3 colorB;
          uniform float heightMin;
          uniform float heightMax;
          varying vec3 vColor;

          float hash(float n){ return fract(sin(n)*43758.5453123); }

          vec3 triVertex(float tri, float vert){
            float idx = tri * 3.0 + vert;
            float u = (idx + 0.5) / texWidth;
            return texture2D(triData, vec2(u, 0.5)).xyz;
          }

          void main(){
            float id = float(gl_InstanceID);

            float tri = floor(hash(id) * triCount);
            vec3 a = triVertex(tri, 0.0);
            vec3 b = triVertex(tri, 1.0);
            vec3 cVert = triVertex(tri, 2.0);

            float r1 = hash(id * 3.1 + 1.0);
            float r2 = hash(id * 3.7 + 2.0);
            float sqrtR1 = sqrt(r1);
            float u = 1.0 - sqrtR1;
            float v = r2 * sqrtR1;
            float w = 1.0 - u - v;
            vec3 offset = a * u + b * v + cVert * w;
            offset.y += 0.01;

            float angle = hash(id * 2.5 + 3.0) * 6.28318530718;
            float scale = mix(heightMin, heightMax, hash(id * 2.9 + 4.0));
            vColor = mix(colorA, colorB, hash(id * 4.1 + 5.0));

            vec3 pos = position;
            pos.y *= scale * heightFactor;
            if (windStrength > 0.0) {
              float sway = sin(time + offset.x + offset.z);
              float disp = (windStrength * 0.6 + max(0.0, sway) * windStrength +
                min(0.0, sway) * windStrength * 0.1) * position.y;
              pos.xz += windDirection * disp;
            }
            float ca = cos(angle);
            float sa = sin(angle);
            pos = vec3(
              pos.x * ca - pos.z * sa,
              pos.y,
              pos.x * sa + pos.z * ca
            );
            pos += offset;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          uniform float snowMix;
          uniform float opacity;
          void main(){
            vec3 c = mix(vColor, vec3(1.0), snowMix);
            gl_FragColor = vec4(c, opacity);
          }
        `,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false
      });
      material.userData.windBase = lvl.windStrength;

      const geo = new THREE.InstancedBufferGeometry();
      const blade = baseGeos[li];
      geo.index = blade.index;
      geo.attributes.position = blade.attributes.position;
      geo.attributes.uv = blade.attributes.uv;
      geo.instanceCount = count;
      geo.boundingBox = box.clone();
      geo.boundingSphere = sphere.clone();

      const mesh = new THREE.Mesh(geo, material);
      let last = performance.now() / 1000;
      mesh.onBeforeRender = (_, __, ___, ____, mat) => {
        const now = performance.now() / 1000;
        const dt = now - last;
        last = now;
        mat.uniforms.time.value += dt * (0.8 + mat.uniforms.windStrength.value);
      };
      mesh.userData.lod = li;
      meshes.push(mesh);
      group.meshes[li] = mesh;
    });
    groups.push(group);
  });

  return { meshes, lodGroups: groups };
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

