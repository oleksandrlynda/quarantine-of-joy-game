import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';
import { WeatherSystem } from './weather.js';

// ------ Renderer & Scene ------
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe8ff, 20, 160);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);

// Gradient sky dome with subtle clouds and sun disc
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
    // lightning flash (driven by weather)
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
    // Hash & noise helpers
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x)+ (c-a)*u.y*(1.0-u.x)+ (d-b)*u.x*u.y; }
    float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }
    void main(){
      vec3 n = normalize(vWorldPosition);
      float h = clamp(n.y * 0.5 + 0.5 + offset, 0.0, 1.0);
      float a = pow(h, exponent);
      vec3 col = mix(bottom, top, a);
      // Clouds (very subtle)
      vec2 uv = n.xz * 0.5 + 0.5; // simple mapping
      uv *= 1.0 / max(0.2, 0.7 + n.y); // reduce stretching near horizon
      uv += vec2(time * cloudSpeed, 0.0);
      float c = fbm(uv / max(0.0001, 1.0/cloudScale));
      c = pow(smoothstep(1.0-cloudAmount-0.15, 1.0-cloudAmount, c), cloudSharpness);
      col = mix(col, mix(col, cloudTint, 0.25), c*0.35);
      // Sun disc + soft halo
      float sd = clamp(dot(n, normalize(sunDir)), -1.0, 1.0);
      float ang = acos(sd);
      float disc = smoothstep(sunAngularSize, sunAngularSize*0.6, ang);
      float halo = smoothstep(sunAngularSize*6.0, sunAngularSize*2.0, ang);
      col += sunColor * (disc*1.2 + halo*0.25);

      // Lightning flash: brightens sky globally and adds a lobe around flashDir
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
skyMat.uniforms.sunDir.value.copy(dir.position).normalize();

// Weather now imported from external module
const weather = new WeatherSystem({
  THREE,
  scene,
  skyMat,
  hemi,
  dir
});

// ------ Controls ------
const controls = new PointerLockControls(camera, document.body);
controls.getObject().position.set(0, 1.7, 8);
scene.add(controls.getObject());

// Movement
const keys = new Set();
let moveSpeed = 6, sprintMult = 1.6; let canJump = false, velocityY = 0; const gravity = 20;
window.addEventListener('keydown', e=>{ keys.add(e.code); if(e.code==='Space' && canJump){ velocityY = 7; canJump = false; }
});
window.addEventListener('keyup', e=> keys.delete(e.code));

// ── Smooth movement state
let vel = new THREE.Vector3();          // horizontal velocity (XZ)
const accel = 50;                       // acceleration strength
const damping = 10;                     // friction/drag when no input
let crouching = false;                  // crouch hold
const baseFov = 75, sprintFov = 82;     // FOV boost when sprinting

// crouch keys
window.addEventListener('keydown', e=>{ if(e.code==='ControlLeft'||e.code==='ControlRight') crouching=true; });
window.addEventListener('keyup', e=>{ if(e.code==='ControlLeft'||e.code==='ControlRight') crouching=false; });

// Resize
window.addEventListener('resize', ()=>{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
});

// ------ Arena ------
const objects = []; // collidable
const mats = {
  floor: new THREE.MeshLambertMaterial({ color:0xd7fbe8 }),
  wall:  new THREE.MeshLambertMaterial({ color:0x8ecae6 }),
  crate: new THREE.MeshLambertMaterial({ color:0xf6bd60 }),
  enemy: new THREE.MeshLambertMaterial({ color:0xef4444 }),
  head:  new THREE.MeshLambertMaterial({ color:0x111827 }),
  tracer: new THREE.LineBasicMaterial({ color:0x111111, transparent:true, opacity:1 }),
  spark: new THREE.MeshBasicMaterial({ color:0xffaa00 })
};

function makeArena(){
  // floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80,1,80), mats.floor);
  floor.position.y = -0.5; floor.receiveShadow = true; scene.add(floor); // floor is NOT a blocker
  // outer walls (simple boxes)
  const wallH=6, wallT=1;
  const mkWall = (w,h,d,x,y,z)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mats.wall); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; scene.add(m); objects.push(m); };
  mkWall(80, wallH, wallT, 0, wallH/2, -40);
  mkWall(80, wallH, wallT, 0, wallH/2,  40);
  mkWall(wallT, wallH, 80, -40, wallH/2, 0);
  mkWall(wallT, wallH, 80,  40, wallH/2, 0);
  // crates
  for(let i=0;i<18;i++){
    const b = new THREE.Mesh(new THREE.BoxGeometry(2+Math.random()*2, 2+Math.random()*2, 2+Math.random()*2), mats.crate);
    b.position.set((Math.random()*70-35)|0, b.geometry.parameters.height/2, (Math.random()*70-35)|0);
    scene.add(b); objects.push(b);
  }
}
makeArena();

// ------ Enemies ------
const enemies = new Set();
function spawnEnemy(){
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,1.2), mats.enemy);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9), mats.head); head.position.y = 1.4; body.add(head);
  body.position.set((Math.random()*60-30)|0, 0.8, (Math.random()*60-30)|0);
  body.userData = { hp: 100, head, speed: 2.4 + Math.random()*0.8 };
  scene.add(body); enemies.add(body);
}

let wave=1, alive=0; function startWave(){ for(let i=0;i<3+wave;i++){ spawnEnemy(); } alive = enemies.size; }

// ------ Gun / Shooting ------
let ammo=30, mag=60, hp=100, score=0, paused=false, canShoot=true;
const hpEl = document.getElementById('hp'), ammoEl = document.getElementById('ammo'), magEl = document.getElementById('mag'), scoreEl = document.getElementById('score');
function updateHUD(){ hpEl.textContent=hp; ammoEl.textContent=ammo; magEl.textContent=mag; scoreEl.textContent=score; }
updateHUD();

// Sounds
const S = { ctx:null, muted:false, ensure(){ if(!this.ctx){ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); } },
  b(f=440,t=0.07,g=0.18,type='square',slide=0){ if(this.muted) return; this.ensure(); const a=this.ctx; const o=a.createOscillator(); const G=a.createGain(); const n=a.currentTime; o.type=type; o.frequency.setValueAtTime(f,n); if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(60,f+slide), n+t*0.9); G.gain.setValueAtTime(0.0001,n); G.gain.linearRampToValueAtTime(g,n+0.01); G.gain.exponentialRampToValueAtTime(0.0001,n+t); o.connect(G).connect(a.destination); o.start(n); o.stop(n+t); },
  shot(){ this.b(320,0.08,0.25,'sawtooth',-100); }, reload(){ this.b(660,0.15,0.2,'triangle'); }, hurt(){ this.b(200,0.2,0.22,'square'); }, kill(){ this.b(520,0.12,0.2,'triangle',60);} };
document.getElementById('mute').onclick=()=>{ S.muted=!S.muted; document.getElementById('mute').textContent=S.muted?'🔇':'🔊'; };

// Tracer + sparks
const tracers = [];
function addTracer(from, to){
  const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(g, mats.tracer.clone());
  line.userData = { life: 0 };
  scene.add(line); tracers.push(line);
}
function addSpark(at){
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mats.spark.clone());
  s.position.copy(at); s.userData={ life:0 };
  scene.add(s); tracers.push(s); // reuse same update list
}

// Hitscan raycaster
const raycaster = new THREE.Raycaster();
function shoot(){ if(!canShoot || paused) return; if(ammo<=0){ S.reload(); return; } ammo--; S.shot(); updateHUD(); canShoot=false; setTimeout(()=>canShoot=true, 120);
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir);
  const candidates = [...enemies, ...objects];
  const hits = raycaster.intersectObjects(candidates, true);
  let end = origin.clone().add(dir.clone().multiplyScalar(80)); // default long shot
  if(hits.length){
    const hit = hits[0]; end.copy(hit.point);
    // find root enemy mesh
    let obj = hit.object; while(obj && !enemies.has(obj)){ obj = obj.parent; }
    if(obj){
      const isHead = hit.object === obj.userData.head;
      const dmg = isHead? 100 : 40; // headshot insta-kill
      obj.userData.hp -= dmg;
      // Knockback
      obj.position.add(dir.clone().multiplyScalar(0.2));
      addSpark(hit.point);
      if(obj.userData.hp<=0){ enemies.delete(obj); scene.remove(obj); alive--; score += isHead? 150:100; S.kill(); if(alive<=0){ wave++; startWave(); } updateHUD(); }
    } else {
      addSpark(hit.point);
    }
  }
  addTracer(origin, end);
}

window.addEventListener('mousedown', e=>{ if(!controls.isLocked) return; shoot(); });
window.addEventListener('keydown', e=>{
  if(e.code==='KeyR'){ if(ammo<30 && mag>0){ const need = Math.min(30-ammo, mag); ammo+=need; mag-=need; S.reload(); updateHUD(); } }
  if(e.code==='KeyP'){ paused=!paused; }
});

// ------ Game Loop ------
const clock = new THREE.Clock();
let gameOver=false;
function step(){
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;
  // Drive subtle cloud motion
  skyMat.uniforms.time.value = t;
  if(controls.isLocked && !paused && !gameOver){
    // smooth move (accel + damping + sprint FOV)
    const fo = controls.getObject();
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    const wish = new THREE.Vector3();
    if (keys.has('KeyW')) wish.add(forward);
    if (keys.has('KeyS')) wish.add(forward.clone().multiplyScalar(-1));
    if (keys.has('KeyA')) wish.add(right.clone().multiplyScalar(-1));
    if (keys.has('KeyD')) wish.add(right);

    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const targetSpeed = moveSpeed * (sprinting ? 1.6 : 1.0) * (crouching ? 0.55 : 1.0);

    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(targetSpeed);
      const toAdd = wish.clone().sub(vel).clampLength(0, accel * dt);
      vel.add(toAdd);
    } else {
      const damp = Math.max(0, 1 - damping * dt);
      vel.multiplyScalar(damp);
    }

    const desiredFov = sprinting ? sprintFov : baseFov;
    camera.fov += (desiredFov - camera.fov) * 0.12; camera.updateProjectionMatrix();

    const next = fo.position.clone().add(vel.clone().multiplyScalar(dt));
    const blocked = objects.some(o=>{
      const bb = new THREE.Box3().setFromObject(o).expandByScalar(0.2);
      return bb.containsPoint(new THREE.Vector3(next.x, fo.position.y, next.z));
    });

    if(!blocked) fo.position.copy(next);

    // gravity + ground height (crouch-aware) + subtle head-bob
    const baseHeight = crouching ? 1.25 : 1.7;
    velocityY -= gravity * dt; fo.position.y += velocityY * dt;
    if (fo.position.y <= baseHeight) { fo.position.y = baseHeight; velocityY = 0; canJump = true; }
    const speed2D = vel.length();
    if (canJump && speed2D > 0.2) { fo.position.y += Math.sin(performance.now()*0.02) * 0.03; }

    // enemies AI
    for(const e of enemies){
      const toPlayer = fo.position.clone().sub(e.position); const dist = toPlayer.length();
      if(dist<2.1){ // melee
        hp -= 15*dt; if(hp<=0){ hp=0; gameOver=true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; S.hurt(); }
        updateHUD();
      }
      if(dist<40){ toPlayer.y=0; toPlayer.normalize(); e.position.add(toPlayer.multiplyScalar(e.userData.speed*dt)); }
    }
  }

  // update tracers & sparks fade
  for(let i=tracers.length-1;i>=0;i--){
    const obj = tracers[i]; obj.userData.life += dt;
    if(obj.isLine){ obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.12); if(obj.userData.life>0.12){ scene.remove(obj); tracers.splice(i,1); } }
    else { // spark sphere expands & fades
      obj.scale.multiplyScalar(1 + dt*10);
      if(obj.material.opacity===undefined){ obj.material.transparent=true; obj.material.opacity=1; }
      obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.25);
      if(obj.userData.life>0.25){ scene.remove(obj); tracers.splice(i,1); }
    }
  }

  // Weather update
  weather.update(t, controls.getObject());

  renderer.render(scene,camera);
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// ------ UI / Flow ------
const panel = document.getElementById('panel');
const playBtn = document.getElementById('play');
const retryBtn = document.getElementById('retry');

function reset(){ // clear enemies
  for(const e of enemies){ scene.remove(e); } enemies.clear(); wave=1; alive=0; startWave();
  hp=100; ammo=30; mag=60; score=0; paused=false; gameOver=false; updateHUD();
  controls.getObject().position.set(0,1.7,8);
}

playBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };
retryBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };

controls.addEventListener('unlock', ()=>{ panel.parentElement.style.display='grid'; retryBtn.style.display=''; });

// Start with a wave ready so there's action immediately after lock
startWave();

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});


