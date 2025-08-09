import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';
import { WeatherSystem } from './weather.js';
import { createWorld } from './world.js';
import { makeSeededRng, makeNamespacedRng, generateSeedString } from './util/rng.js';
import { EnemyManager } from './enemies.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { ObstacleManager } from './obstacles/manager.js';

// ------ Seeded RNG + URL persistence ------
const url = new URL(window.location.href);
const params = url.searchParams;
let seed = params.get('seed');
if (!seed) {
  seed = generateSeedString(6);
  params.set('seed', seed);
  history.replaceState(null, '', `${url.pathname}?${params.toString()}`);
}
const rng = makeSeededRng(seed);

// Seed HUD
const seedEl = document.getElementById('seed');
const copySeedBtn = document.getElementById('copySeed');
const newSeedBtn = document.getElementById('newSeed');
if (seedEl) seedEl.textContent = seed;
if (copySeedBtn) {
  copySeedBtn.onclick = async () => {
    const shareUrl = window.location.href;
    try { await navigator.clipboard.writeText(shareUrl); copySeedBtn.textContent = 'Copied!'; setTimeout(()=>copySeedBtn.textContent='Copy', 900); }
    catch(e){
      prompt('Copy URL', shareUrl);
    }
  };
}
if (newSeedBtn) {
  newSeedBtn.onclick = () => {
    const fresh = generateSeedString(6);
    const u = new URL(window.location.href);
    u.searchParams.set('seed', fresh);
    window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
  };
}

// ------ World (renderer, scene, camera, lights, sky, materials, arena) ------
const { renderer, scene, camera, skyMat, hemi, dir, mats, objects } = createWorld(THREE, rng);

// Obstacles (deterministic per seed)
const obstacleManager = new ObstacleManager(THREE, scene, mats);
obstacleManager.generate(seed, objects);
// Update player collider list now that obstacles have been added
// (player constructed below will read from updated objects)

// Weather system
const weather = new WeatherSystem({ THREE, scene, skyMat, hemi, dir });

// ------ Player ------
const player = new PlayerController(THREE, camera, document.body, objects);
const controls = player.controls;
scene.add(controls.getObject());
// Ensure player colliders include maze/destructibles
if (player.refreshColliders) player.refreshColliders(objects);

// Resize
window.addEventListener('resize', ()=>{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
});

// ------ Enemies ------
const enemyManager = new EnemyManager(
  THREE,
  scene,
  mats,
  objects,
  () => {
    const pos = controls.getObject().position.clone();
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    return { position: pos, forward: f };
  }
);
const effects = new Effects(THREE, scene, camera);
const pickups = new Pickups(THREE, scene);

// Wire obstacle manager hooks now that managers exist
obstacleManager.enemyManager = enemyManager;
obstacleManager.pickups = pickups;
obstacleManager.getPlayer = () => controls.getObject();
obstacleManager.onScore = (points) => { addScore(points); };
obstacleManager.onPlayerDamage = (amount) => {
  if (paused || gameOver) return;
  hp -= amount; if (hp <= 0) { hp = 0; gameOver = true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; }
  updateHUD();
};

// ------ Gun / Shooting ------
let ammo=30, mag=60, hp=100, score=0, best=0, paused=false, canShoot=true;
const hpEl = document.getElementById('hp'), ammoEl = document.getElementById('ammo'), magEl = document.getElementById('mag'), scoreEl = document.getElementById('score'), bestEl = document.getElementById('best'), waveEl = document.getElementById('wave');

// Best score persistence
const BEST_KEY = 'bs3d_best_score';
try {
  const savedBest = localStorage.getItem(BEST_KEY);
  if (savedBest != null) best = Number(savedBest) || 0;
} catch (e) { /* ignore */ }

// Combo state
const comboCfg = {
  decayTime: 3.5,
  thresholds: [2, 5, 9], // actions required to reach tiers 1,2,3
  multipliers: [1.0, 1.2, 1.5, 2.0], // must be thresholds.length+1
  maxTier: 3
};
const comboEl = document.getElementById('combo');
const comboLabelEl = document.getElementById('comboLabel');
const comboBarEl = document.getElementById('comboBar');
const combo = { tier:0, multiplier:1.0, streakPoints:0, decayTimer:0 };

function updateComboLabel(){
  if (!comboEl) return;
  comboLabelEl.textContent = `Combo: x${combo.multiplier.toFixed(1)}`;
  comboEl.classList.remove('tier1','tier2','tier3','tier4');
  if (combo.tier>0) comboEl.classList.add(`tier${combo.tier}`);
}
function refreshComboTimer(){ combo.decayTimer = comboCfg.decayTime; if(comboBarEl){ comboBarEl.style.width = '100%'; } }
function setComboTier(newTier){
  const clamped = Math.max(0, Math.min(comboCfg.maxTier, newTier|0));
  const prev = combo.tier;
  if (clamped === prev) return;
  combo.tier = clamped;
  combo.multiplier = comboCfg.multipliers[combo.tier] || 1.0;
  updateComboLabel();
  if (combo.tier > prev) { effects.promotionPulse(); effects.setTracerTint(combo.tier / comboCfg.maxTier); }
  else { effects.setTracerTint(combo.tier / comboCfg.maxTier); }
}
function addComboAction(points){
  combo.streakPoints += points;
  refreshComboTimer();
  let t = 0;
  for(let i=0;i<comboCfg.thresholds.length;i++){ if(combo.streakPoints >= comboCfg.thresholds[i]) t = i+1; }
  setComboTier(t);
}
function resetCombo(){ combo.streakPoints=0; setComboTier(0); combo.decayTimer=0; if(comboBarEl){ comboBarEl.style.width = '0%'; } }

function updateHUD(){
  hpEl.textContent=hp; ammoEl.textContent=ammo; magEl.textContent=mag; scoreEl.textContent=score; if (bestEl) bestEl.textContent = best; if(waveEl) waveEl.textContent = enemyManager.wave;
  updateComboLabel();
}

function addScore(points){
  score += points;
  if (score > best) {
    best = score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch(e) { /* ignore */ }
  }
  updateHUD();
}
updateHUD();

// update HUD when a new wave starts and when remaining enemies changes
enemyManager.onWave = () => {
  updateHUD();
  pickups.onWave(enemyManager.wave);
  if (player.refreshColliders) player.refreshColliders(objects);
};
enemyManager.onRemaining = () => updateHUD();

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
      effects.spawnBulletImpact(hit.point, hit.face?.normal);
      if(obj.userData.hp<=0){
        effects.enemyDeath(obj.position.clone());
        // Try a pickup drop at the death location
        pickups.maybeDrop(obj.position.clone());
        enemyManager.remove(obj);
        const base = isHead?150:100;
        const finalScore = Math.round(base * combo.multiplier);
        addScore(finalScore);
        addComboAction(1);
        S.kill(); updateHUD();
      }
      else {
        // Optional: small streak progress on hit
        addComboAction(0.25);
      }
    } else {
      // If not enemy, try destructible
      const handled = obstacleManager.handleHit(hits[0].object, 40);
      effects.spawnBulletImpact(hit.point, hit.face?.normal);
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
let gameTime = 0; // advances only when not paused and controls are locked
function step(){
  const dt = Math.min(0.033, clock.getDelta());
  if(controls.isLocked && !paused && !gameOver){
    // advance game time only while active
    gameTime += dt;
    // player movement update
    player.update(dt);

    // enemies AI
    const fo = controls.getObject();
    enemyManager.tickAI(fo, dt, (damage)=>{
      hp -= damage; if(hp<=0){ hp=0; gameOver=true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; S.hurt(); }
      updateHUD();
    });

    // legacy tracers removal (if any left around)
    for(let i=tracers.length-1;i>=0;i--){ const obj = tracers[i]; obj.userData.life += dt; if(obj.isLine){ obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.12); if(obj.userData.life>0.12){ scene.remove(obj); tracers.splice(i,1); } } else { obj.scale.multiplyScalar(1 + dt*10); if(obj.material.opacity===undefined){ obj.material.transparent=true; obj.material.opacity=1; } obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.25); if(obj.userData.life>0.25){ scene.remove(obj); tracers.splice(i,1); } } }
    // effects update
    effects.update(dt);

    // pickups update (magnet + animation)
    pickups.update(dt, controls.getObject().position, (type, amount) => {
      if (type === 'ammo') { mag += amount; S.reload(); }
      else if (type === 'med') { hp = Math.min(100, hp + amount); S.b(880, 0.08, 0.2, 'sine'); }
      updateHUD();
    });

    // Obstacles update (reserved for future moving obstacles)
    obstacleManager.update(dt);

    // Weather update (uses gameTime so it freezes cleanly when paused)
    weather.update(gameTime, controls.getObject());
  }

  // Drive subtle cloud motion (frozen while paused because gameTime doesn't advance)
  skyMat.uniforms.time.value = gameTime;

  // combo decay + HUD bar update
  if (combo.decayTimer > 0) {
    combo.decayTimer = Math.max(0, combo.decayTimer - dt);
    if (comboBarEl) {
      const pct = Math.max(0, Math.min(1, combo.decayTimer / comboCfg.decayTime));
      comboBarEl.style.width = `${(pct*100).toFixed(1)}%`;
    }
    if (combo.decayTimer <= 0) { resetCombo(); }
  }

  // (pickups and weather are updated only while active in the gated block above)

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
  pickups.resetAll(); pickups.onWave(enemyManager.wave);
  hp=100; ammo=30; mag=60; score=0; paused=false; gameOver=false; resetCombo(); updateHUD();
  player.resetPosition(0,1.7,8);
}

playBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };
retryBtn.onclick = ()=>{ panel.parentElement.style.display='none'; controls.lock(); reset(); };

controls.addEventListener('unlock', ()=>{ panel.parentElement.style.display='grid'; retryBtn.style.display=''; });

// Start with a wave ready so there's action immediately after lock
enemyManager.startWave();

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});


