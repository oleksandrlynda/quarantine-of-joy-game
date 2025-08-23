import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createAmbientParticles({
  floorGeometry,
  type = 'firefly',
  count = 50
} = {}) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  geo.attributes.uv = quad.attributes.uv;

  const offsets = new Float32Array(count * 3);
  const posArr = floorGeometry?.attributes.position.array || [];
  const idxArr = floorGeometry?.index ? floorGeometry.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : posArr.length / 9;

  for (let i = 0; i < count; i++) {
    if (triCount > 0) {
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
      const y = u * ay + v * by + w * cy + 0.5 + Math.random();
      const z = u * az + v * bz + w * cz;
      offsets.set([x, y, z], i * 3);
    } else {
      offsets.set([0, 0, 0], i * 3);
    }
  }

  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));

  const color = new THREE.Color();
  let size = 0.2;
  switch (type) {
    case 'dust':
      color.set(0xc9b79c); size = 0.1; break;
    case 'firefly':
      color.set(0xffee88); size = 0.2; break;
    default:
      color.set(0xffffff); size = 0.15;
  }

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      windDirection: { value: new THREE.Vector2(1, 0) },
      windStrength: { value: 0 },
      snowMix: { value: 0 },
      size: { value: size },
      color: { value: color }
    },
    vertexShader: `
      attribute vec3 offset;
      uniform float time;
      uniform vec2 windDirection;
      uniform float windStrength;
      uniform float size;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
      void main(){
        vec3 pos = offset;
        float n1 = noise(offset.xz * 0.1 + time * 0.05);
        float n2 = noise(offset.xz * 0.1 + time * 0.07 + 13.0);
        pos.x += (n1 - 0.5) * 0.6 + windDirection.x * windStrength * 0.3;
        pos.z += (n2 - 0.5) * 0.6 + windDirection.y * windStrength * 0.3;
        pos.y += noise(offset.xz * 0.1 + time * 0.09 + 7.3) * 0.6;
        vec3 right = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
        vec3 up = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
        vec3 mv = pos + right * position.x * size + up * position.y * size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(mv, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float snowMix;
      void main(){
        vec3 c = mix(color, vec3(1.0), snowMix);
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  function update(dt){
    material.uniforms.time.value += dt;
  }

  return { mesh, update };
}
