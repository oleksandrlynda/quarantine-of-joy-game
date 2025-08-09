import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';
import { WeatherSystem } from './weather.js';
import { createWorld } from './world.js';
import { EnemyManager } from './enemies.js';
import { PlayerController } from './player.js';

// ------ World (renderer, scene, camera, lights, sky, materials, arena) ------
const { renderer, scene, camera, skyMat, hemi, dir, mats, objects } = createWorld(THREE);

// Weather system
const weather = new WeatherSystem({ THREE, scene, skyMat, hemi, dir });

// ------ Player ------
const player = new PlayerController(THREE, camera, document.body, objects);
const controls = player.controls;
scene.add(controls.getObject());

// Resize
window.addEventListener('resize', ()=>{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
});

// ------ Enemies ------
const enemyManager = new EnemyManager(THREE, scene, mats);

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
  const candidates = [...enemyManager.enemies, ...objects];
  const hits = raycaster.intersectObjects(candidates, true);
  let end = origin.clone().add(dir.clone().multiplyScalar(80)); // default long shot
  if(hits.length){
    const hit = hits[0]; end.copy(hit.point);
    // find root enemy mesh via manager
    let obj = hit.object; while(obj && !enemyManager.enemies.has(obj)){ obj = obj.parent; }
    if(obj){
      const isHead = hit.object === obj.userData.head;
      const dmg = isHead ? 100 : 40;
      obj.userData.hp -= dmg;
      obj.position.add(dir.clone().multiplyScalar(0.2));
      addSpark(hit.point);
      if(obj.userData.hp<=0){ enemyManager.remove(obj); score += isHead?150:100; S.kill(); updateHUD(); }
    } else { addSpark(hit.point); }
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
    // player movement update
    player.update(dt);

    // enemies AI
    const fo = controls.getObject();
    enemyManager.tickAI(fo, dt, (damage)=>{
      hp -= damage; if(hp<=0){ hp=0; gameOver=true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; S.hurt(); }
      updateHUD();
    });
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
  enemyManager.reset();
  hp=100; ammo=30; mag=60; score=0; paused=false; gameOver=false; updateHUD();
  player.resetPosition(0,1.7,8);
}

playBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };
retryBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };

controls.addEventListener('unlock', ()=>{ panel.parentElement.style.display='grid'; retryBtn.style.display=''; });

// Start with a wave ready so there's action immediately after lock
enemyManager.startWave();

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});


