// World setup: renderer, scene, camera, sky, lights, arena, materials
// Export a factory to build and return references used by the game

import { createGrassMesh, cullGrassUnderObjects } from './graphics/grass.js';
import { createVegetationMesh } from './graphics/vegetation.js';
import { createAmbientParticles } from './graphics/ambientParticles.js';
import { createWaterMesh } from './graphics/water.js';
import { BiomeManager } from './biome.js';
import { createFauna } from './fauna.js';

export function createWorld(THREE, rng = Math.random, arenaShape = 'box', biome = 'grass', dayLength = 24 * 60){
  // Renderer
  const params = (new URL(window.location.href)).searchParams;
  const renderer = new THREE.WebGLRenderer({ antialias: params.get('aa') === '1', powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(2, (window.devicePixelRatio||1)));
  // Color management & tone mapping
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch(_) {}
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const tone = params.get('tone');
    if (tone === '0') renderer.toneMapping = THREE.NoToneMapping;
  } catch(_) {}
  // Feature toggles from URL
  const enableShadows = params.get('shadows') === '1'; // default off for perf
  // Shadows (single directional) — disabled by default
  renderer.shadowMap.enabled = !!enableShadows;
  if (enableShadows) renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info && (renderer.info.autoReset = true);

  // Scene & fog
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe8ff, 20, 160);

  // Camera
  const camera = (()=>{
    let c = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);
    c.rotation.order = 'YXZ';
    return c;
  })();

  // Sky dome with shader
  const skyGeo = new THREE.SphereGeometry(300, 16, 8);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms:{
      top:{value:new THREE.Color('#aee9ff')}, bottom:{value:new THREE.Color('#f1e3ff')},
      offset:{value:0}, exponent:{value:1.2},
      time:{value:0},
      sunDir:{value:new THREE.Vector3(0.0,1.0,0.0)},
      sunColor:{value:new THREE.Color('#ffe9a8')},
      sunAngularSize:{value:0.02},
      cloudScale:{value:0.004},
      cloudAmount:{value:0.25},
      cloudSharpness:{value:3.0},
      cloudSpeed:{value:0.01},
      cloudTint:{value:new THREE.Color('#ffffff')},
      flashIntensity:{value:0.0},
      flashDir:{value:new THREE.Vector3(0.0,1.0,0.0)}
    },
    vertexShader:`varying vec3 vWorldPosition; void main(){ vec4 p=modelMatrix*vec4(position,1.0); vWorldPosition=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader:`
      precision highp float; varying vec3 vWorldPosition;
      uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent;
      uniform float time; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunAngularSize;
      uniform float cloudScale; uniform float cloudAmount; uniform float cloudSharpness; uniform float cloudSpeed; uniform vec3 cloudTint;
      uniform float flashIntensity; uniform vec3 flashDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x)+ (c-a)*u.y*(1.0-u.x)+ (d-b)*u.x*u.y; }
      float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }
      void main(){
        vec3 n = normalize(vWorldPosition);
        float h = clamp(n.y * 0.5 + 0.5 + offset, 0.0, 1.0);
        float a = pow(h, exponent);
        vec3 col = mix(bottom, top, a);
        vec2 uv = n.xz * 0.5 + 0.5;
        uv *= 1.0 / max(0.2, 0.7 + n.y);
        uv += vec2(time * cloudSpeed, 0.0);
        float c = fbm(uv / max(0.0001, 1.0/cloudScale));
        c = pow(smoothstep(1.0-cloudAmount-0.15, 1.0-cloudAmount, c), cloudSharpness);
        col = mix(col, mix(col, cloudTint, 0.25), c*0.35);
        float sd = clamp(dot(n, normalize(sunDir)), -1.0, 1.0);
        float ang = acos(sd);
        float disc = smoothstep(sunAngularSize, sunAngularSize*0.6, ang);
        float halo = smoothstep(sunAngularSize*6.0, sunAngularSize*2.0, ang);
        col += sunColor * (disc*1.2 + halo*0.25);
        if (flashIntensity > 0.0001) {
          float fd = clamp(dot(n, normalize(flashDir)), -1.0, 1.0);
          float fang = acos(fd);
          float lobe = smoothstep(0.6, 0.0, fang);
          col += vec3(1.0) * (flashIntensity * (0.6 + 0.8*lobe));
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4488aa, 0.9); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(20,30,10); scene.add(dir);
  // Configure single shadow-casting directional light tightly if enabled
  try {
    dir.castShadow = !!enableShadows;
    if (enableShadows) {
      dir.shadow.mapSize.set(1024, 1024);
      const sc = dir.shadow.camera;
      sc.near = 0.5; sc.far = 80;
      sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
    }
  } catch(_) {}
  skyMat.uniforms.sunDir.value.copy(dir.position).normalize();

  // Materials used across the game
  const weatherUniforms = { wetness:{ value:0 }, snow:{ value:0 } };
  const applyWeatherUniforms = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWetness = weatherUniforms.wetness;
      shader.uniforms.uSnow = weatherUniforms.snow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWetness;\nuniform float uSnow;')
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( diffuse, opacity );\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4, uWetness);\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uSnow);'
        );
    };
    mat.needsUpdate = true;
  };
  const mats = {
    floor: new THREE.MeshLambertMaterial({ color:0xd7fbe8 }),
    wall:  new THREE.MeshLambertMaterial({ color:0x8ecae6 }),
    crate: new THREE.MeshLambertMaterial({ color:0xf6bd60 }),
    enemy: new THREE.MeshLambertMaterial({ color:0xef4444 }),
    head:  new THREE.MeshLambertMaterial({ color:0x111827 }),
    tracer: new THREE.LineBasicMaterial({ color:0x111111, transparent:true, opacity:1 }),
    spark: new THREE.MeshBasicMaterial({ color:0xffaa00 })
  };
  applyWeatherUniforms(mats.floor);
  applyWeatherUniforms(mats.wall);
  mats.weather = weatherUniforms;

  // Collidable objects and arena state
  const objects = [];
  let arenaRadius = Infinity;
  let grassMesh = null;
  let floorGeo = null;

  BiomeManager.init({ scene, skyMat, mats });
  const fauna = createFauna({ scene, THREE });
  BiomeManager.attachFauna(fauna);
  const water = { meshes: [], setConfig(list){
    for (const m of this.meshes) {
      scene.remove(m);
      const i = objects.indexOf(m);
      if (i >= 0) objects.splice(i,1);
    }
    this.meshes.length = 0;
    if (!floorGeo) return;
    for (const cfg of list){
      const mesh = createWaterMesh({ floorGeometry: floorGeo, size: cfg.radius });
      mesh.position.set(cfg.position[0], 0.02, cfg.position[1]);
      scene.add(mesh);
      objects.push(mesh);
      this.meshes.push(mesh);
    }
  }};
  BiomeManager.attachWater(water);
  const vegetation = { meshes: [], setConfig(list){
    for (const m of this.meshes) scene.remove(m);
    this.meshes.length = 0;
    if (!floorGeo) return;
    for (const cfg of list){
      const mesh = createVegetationMesh({ floorGeometry: floorGeo, type: cfg.type, count: cfg.count });
      scene.add(mesh);
      cullGrassUnderObjects(mesh, objects);
      this.meshes.push(mesh);
    }
  }};
  BiomeManager.attachVegetation(vegetation);
  const ambient = { systems: [], setConfig(list){
    for (const s of this.systems) scene.remove(s.mesh);
    this.systems.length = 0;
    if (!floorGeo) return;
    for (const cfg of list){
      const sys = createAmbientParticles({ floorGeometry: floorGeo, type: cfg.type, count: cfg.count });
      scene.add(sys.mesh);
      cullGrassUnderObjects(sys.mesh, objects);
      this.systems.push(sys);
    }
  }, update(dt){
    for (const s of this.systems) s.update(dt);
  }};
  BiomeManager.attachParticles(ambient);
  BiomeManager.setBiome(biome);

  // Day-night cycle
  const dayLengthSec = dayLength; // 24-minute loop by default
  let timeOfDay = 0; // 0..1
  const sunDayColor = new THREE.Color('#ffe9a8');
  const sunNightColor = new THREE.Color('#223355');

  function applyTime(){
    const ang = timeOfDay * Math.PI * 2;
    const sx = Math.sin(ang);
    const sy = Math.cos(ang);
    dir.position.set(sx * 40, sy * 40, 0);
    skyMat.uniforms.sunDir.value.set(sx, sy, 0).normalize();
    const nightMix = Math.max(0, -sy);
    skyMat.uniforms.sunColor.value.copy(sunDayColor).lerp(sunNightColor, nightMix);
    const cfg = BiomeManager._biomes[BiomeManager.getCurrentBiome()] || {};
    const dayTop = new THREE.Color(cfg.skyTop || '#aee9ff');
    const dayBottom = new THREE.Color(cfg.skyBottom || '#f1e3ff');
    const nightTop = new THREE.Color((cfg.night && cfg.night.skyTop) || cfg.skyTop || '#aee9ff');
    const nightBottom = new THREE.Color((cfg.night && cfg.night.skyBottom) || cfg.skyBottom || '#f1e3ff');
    skyMat.uniforms.top.value.copy(dayTop).lerp(nightTop, nightMix);
    skyMat.uniforms.bottom.value.copy(dayBottom).lerp(nightBottom, nightMix);
    return sy < 0;
  }

  function updateDayNight(dt){
    timeOfDay = (timeOfDay + dt / dayLengthSec) % 1;
    return applyTime();
  }

  function setTimeOfDay(t){
    timeOfDay = ((t % 1) + 1) % 1;
    return applyTime();
  }

  function makeArena(shape){
    const wallH = 6, wallT = 1;

    const addGrass = (floor) => {
      const g = floor.geometry.clone();
      floor.updateMatrixWorld();
      g.applyMatrix4(floor.matrixWorld);
      const grass = createGrassMesh({
        floorGeometry: g,
        bladeCount: 20000,
        colorRange: [0x6dbb3c, 0x4c8a2f],
        heightRange: [0.8, 1.6],
        windStrength: 0.3
      });
      scene.add(grass);
      grassMesh = grass;
      floorGeo = g;
      vegetation.setConfig(BiomeManager._biomes[BiomeManager.getCurrentBiome()]?.vegetation || []);
      ambient.setConfig(BiomeManager._biomes[BiomeManager.getCurrentBiome()]?.particles || []);
      water.setConfig(BiomeManager._biomes[BiomeManager.getCurrentBiome()]?.waterBodies || []);
    };

    const buildPoly = (pts, skipFn) => {
      const shape2 = new THREE.Shape();
      pts.forEach(([x,z], i) => { if (i === 0) shape2.moveTo(x, z); else shape2.lineTo(x, z); });
      const geom = new THREE.ExtrudeGeometry(shape2, { depth:1, bevelEnabled:false });
      const floor = new THREE.Mesh(geom, mats.floor);
      floor.rotation.x = -Math.PI/2; floor.position.y = -1; floor.receiveShadow = !!enableShadows; scene.add(floor);
      addGrass(floor);
      for (let i=0;i<pts.length;i++) {
        const a = pts[i], b = pts[(i+1)%pts.length];
        if (skipFn && skipFn(a,b)) continue;
        const [x1,z1] = a, [x2,z2] = b;
        const cx=(x1+x2)/2, cz=(z1+z2)/2;
        const len=Math.hypot(x2-x1, z2-z1);
        const ang=Math.atan2(z2-z1, x2-x1);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, wallT), mats.wall);
        wall.position.set(cx, wallH/2, cz); wall.rotation.y = ang;
        wall.castShadow=wall.receiveShadow=!!enableShadows; scene.add(wall); objects.push(wall);
      }
    };

    switch(shape){
      case 'circle': {
        arenaRadius = 40;
        const floor = new THREE.Mesh(new THREE.CircleGeometry(arenaRadius, 32), mats.floor);
        floor.rotation.x = -Math.PI/2; floor.position.y = -0.01; floor.receiveShadow = !!enableShadows; scene.add(floor);
        addGrass(floor);
        // The floor should not be part of the collider list; including it
        // prevents enemy spawn locations from being considered valid in the
        // circular arena because its bounding box covers the entire play area.
        // Unlike box/other arenas (which already omit the floor), we skip
        // pushing the circular floor into `objects` so that only actual
        // obstacles contribute to collision checks.
        const wallShape = new THREE.Shape();
        wallShape.absarc(0, 0, arenaRadius + wallT/2, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, arenaRadius - wallT/2, 0, Math.PI * 2, true);
        wallShape.holes.push(holePath);
        const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: wallH, bevelEnabled: false, curveSegments: 32 });
        const wall = new THREE.Mesh(wallGeo, mats.wall);
        wall.rotation.x = -Math.PI/2;
        wall.castShadow = wall.receiveShadow = !!enableShadows;
        scene.add(wall); objects.push(wall);
        break;
      }
      case 'diamond':
        buildPoly([[0,-40],[40,0],[0,40],[-40,0]]);
        break;
      case 'triangle':
        buildPoly([[0,40],[40,-40],[-40,-40]]);
        break;
      case 'pi':
        buildPoly([
          [-40,40],[40,40],[40,-40],[20,-40],[20,20],[-20,20],[-20,-40],[-40,-40]
        ], (a,b)=> a[1]===-40 && b[1]===-40);
        break;
      default:
        buildPoly([[-40,-40],[40,-40],[40,40],[-40,40]]);
    }
  }

  makeArena(arenaShape);

  return { renderer, scene, camera, skyMat, hemi, dir, mats, objects, arenaRadius, grassMesh, vegetation: vegetation.meshes, fauna, ambient, water: water.meshes, updateDayNight, setTimeOfDay };
}


