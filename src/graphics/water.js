import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

export function createWaterMesh({ floorGeometry, size = 5 } = {}) {
  const geo = new THREE.CircleGeometry(1, 32);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      wetness: { value: 0 },
      snowMix: { value: 0 },
      colorTop: { value: new THREE.Color(0x3ab0ff) },
      colorBottom: { value: new THREE.Color(0x14506b) }
    },
    transparent: true,
    vertexShader: `
      uniform float time;
      uniform float wetness;
      varying vec3 vPos;
      varying vec3 vNormal;
      void main(){
        vec3 pos = position;
        float amp = 0.05 + wetness * 0.1;
        float wx = sin((pos.x + time) * 2.0);
        float wz = sin((pos.z + time * 1.3) * 2.0);
        pos.y += wx * wz * amp;
        float dx = cos((pos.x + time) * 2.0) * 2.0 * amp * wz;
        float dz = cos((pos.z + time * 1.3) * 2.0) * 2.0 * amp * wx;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 colorTop;
      uniform vec3 colorBottom;
      uniform float wetness;
      uniform float snowMix;
      varying vec3 vPos;
      varying vec3 vNormal;
      void main(){
        vec3 viewDir = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
        vec3 col = mix(colorBottom, colorTop, fres);
        col = mix(col, vec3(1.0), snowMix);
        float alpha = 0.7 + 0.3 * wetness;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(size, 1, size);
  mesh.frustumCulled = false;

  let last = performance.now() / 1000;
  mesh.onBeforeRender = () => {
    const now = performance.now() / 1000;
    const dt = now - last;
    last = now;
    material.uniforms.time.value += dt;
  };

  return mesh;
}
