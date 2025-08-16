// World setup: renderer, scene, camera, sky, lights, arena, materials
// Export a factory to build and return references used by the game

export function createWorld(THREE, rng = Math.random){
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
  const mats = {
    floor: new THREE.MeshLambertMaterial({ color:0xd7fbe8 }),
    wall:  new THREE.MeshLambertMaterial({ color:0x8ecae6 }),
    crate: new THREE.MeshLambertMaterial({ color:0xf6bd60 }),
    enemy: new THREE.MeshLambertMaterial({ color:0xef4444 }),
    head:  new THREE.MeshLambertMaterial({ color:0x111827 }),
    tracer: new THREE.LineBasicMaterial({ color:0x111111, transparent:true, opacity:1 }),
    spark: new THREE.MeshBasicMaterial({ color:0xffaa00 })
  };

  // Collidable objects
  const objects = [];

  function makeArena(){
    const floor = new THREE.Mesh(new THREE.BoxGeometry(80,1,80), mats.floor);
    floor.position.y = -0.5; floor.receiveShadow = !!enableShadows; scene.add(floor);

    const wallH=6, wallT=1;
    const mkWall = (w,h,d,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mats.wall); m.position.set(x,y,z); m.castShadow=!!enableShadows; m.receiveShadow=!!enableShadows; scene.add(m); objects.push(m); };
    mkWall(80, wallH, wallT, 0, wallH/2, -40);
    mkWall(80, wallH, wallT, 0, wallH/2,  40);
    mkWall(wallT, wallH, 80, -40, wallH/2, 0);
    mkWall(wallT, wallH, 80,  40, wallH/2, 0);

    // Crates and other procedural obstacles are now managed by ObstacleManager
  }

  makeArena();

  return { renderer, scene, camera, skyMat, hemi, dir, mats, objects };
}


