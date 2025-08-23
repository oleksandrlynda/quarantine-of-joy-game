import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createVegetationMesh({
  floorGeometry,
  type = 'pine',
  count = 200,
  scaleRange = [0.8, 1.4],
  windStrength = 0.15
} = {}) {
  let base; const color = new THREE.Color();
  switch (type) {
    case 'cactus':
      base = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 6);
      base.translate(0, 0.75, 0);
      color.set(0x4a9f50);
      break;
    case 'bush':
      base = new THREE.SphereGeometry(0.6, 6, 6);
      base.translate(0, 0.6, 0);
      color.set(0x437a30);
      break;
    default:
      base = new THREE.ConeGeometry(0.5, 2, 6);
      base.translate(0, 1, 0);
      color.set(0x2d5a27);
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;

  const offsets = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  const posArr = floorGeometry.attributes.position.array;
  const idxArr = floorGeometry.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  for (let i = 0; i < count; i++) {
    const tri = Math.floor(Math.random() * triCount);
    const ia = idxArr ? idxArr[tri * 3] : tri * 3;
    const ib = idxArr ? idxArr[tri * 3 + 1] : tri * 3 + 1;
    const ic = idxArr ? idxArr[tri * 3 + 2] : tri * 3 + 2;

    const ax = posArr[ia * 3], ay = posArr[ia * 3 + 1], az = posArr[ia * 3 + 2];
    const bx = posArr[ib * 3], by = posArr[ib * 3 + 1], bz = posArr[ib * 3 + 2];
    const cx = posArr[ic * 3], cy = posArr[ic * 3 + 1], cz = posArr[ic * 3 + 2];

    const r1 = Math.random();
    const r2 = Math.random();
    const sqrtR1 = Math.sqrt(r1);
    const u = 1 - sqrtR1;
    const v = r2 * sqrtR1;
    const w = 1 - u - v;

    const x = u * ax + v * bx + w * cx;
    const y = u * ay + v * by + w * cy + 0.01;
    const z = u * az + v * bz + w * cz;

    offsets.set([x, y, z], i * 3);
    scales[i] = THREE.MathUtils.randFloat(scaleRange[0], scaleRange[1]);
  }

  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('scale', new THREE.InstancedBufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      windStrength: { value: windStrength },
      windDirection: { value: new THREE.Vector2(1, 0) },
      heightFactor: { value: 1 },
      snowMix: { value: 0 },
      color: { value: color }
    },
    vertexShader: `
      attribute vec3 offset;
      attribute float scale;
      uniform float time;
      uniform float windStrength;
      uniform vec2 windDirection;
      uniform float heightFactor;
      void main(){
        vec3 pos = position;
        pos *= scale * heightFactor;
        float sway = sin(time + offset.x + offset.z) * windStrength;
        pos.xz += windDirection * sway * pos.y;
        pos += offset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float snowMix;
      void main(){
        vec3 c = mix(color, vec3(1.0), snowMix);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  let last = performance.now() / 1000;
  mesh.onBeforeRender = (_, __, ___, ____, mat) => {
    const now = performance.now() / 1000;
    const dt = now - last;
    last = now;
    mat.uniforms.time.value += dt;
  };
  return mesh;
}
