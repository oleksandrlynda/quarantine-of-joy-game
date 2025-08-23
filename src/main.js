import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';
import { WeatherSystem } from './weather.js';
import { createWorld } from './world.js?v=2';
import { makeSeededRng, makeNamespacedRng, generateSeedString } from './util/rng.js';
import { EnemyManager } from './enemies.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { ObstacleManager } from './obstacles/manager.js';
import { Music } from './music.js';
import { SFX } from './sfx.js';
import { SONGS } from './musicLibrary.js';
import { WeaponSystem } from './weapons/system.js';
import { WeaponView } from './weapons/view.js';
import { startEditor } from './editor.js';
import { Progression } from './progression.js';
import { loadAllModels, prewarmAllShaders } from '../loader.js?v=3';
import { StoryManager } from './story.js';
import { t } from './i18n/index.js';
import { cullGrassUnderObjects } from './graphics/grass.js';

// Prefer the flag set in index.html; fallback to media query
const isMobile = (typeof window !== 'undefined' && 'IS_MOBILE' in window && window.IS_MOBILE)
  ? !!window.IS_MOBILE
  : window.matchMedia?.('(pointer:coarse)').matches === true;

// --- Music selection ---
const MUSIC_KEY = 'bs3d_music';
const musicSelect = document.getElementById('musicSelect');
let musicChoice = 'library';
try {
  const saved = localStorage.getItem(MUSIC_KEY);
  if (saved) musicChoice = saved;
} catch (_) {}
let sunoAudio = null; // HTMLAudioElement for Suno playback
let sunoTrackIndex = 0; // rotate through SUNO_TRACKS
if (musicSelect) {
  musicSelect.value = musicChoice;
  musicSelect.addEventListener('change', e => {
    musicChoice = e.target.value;
    try { localStorage.setItem(MUSIC_KEY, musicChoice); } catch (_) {}
    if (musicChoice === 'suno') {
      playSuno();
    } else {
      stopSuno();
      music.start();
    }
  });
}

// ------ Seeded RNG + URL persistence ------
const url = new URL(window.location.href);
const params = url.searchParams;
const QUALITY_KEY = 'bs3d_quality';
let startQuality = null;
try {
  const savedQ = localStorage.getItem(QUALITY_KEY);
  if (savedQ && !['aa','shadows','tone','autoDPR'].some(k => params.has(k))) startQuality = savedQ;
} catch (_) {}
const shapeSelect = document.getElementById('arenaShape');
// TODO: Implement later different arena shapes
// let arenaShape = params.get('shape') || (shapeSelect ? shapeSelect.value : 'box');
const arenaShape = 'box';
if (shapeSelect) {
  shapeSelect.value = arenaShape;
  shapeSelect.addEventListener('change', e => {
    const u = new URL(window.location.href);
    u.searchParams.set('shape', e.target.value);
    window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
  });
}
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
    try {
      await navigator.clipboard.writeText(shareUrl);
      copySeedBtn.textContent = t('hud.copied');
      setTimeout(() => (copySeedBtn.textContent = t('hud.copy')), 900);
    } catch (e) {
      prompt(t('hud.copyPrompt'), shareUrl);
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

const startTipEl = document.getElementById('startTip');
if (isMobile && startTipEl) startTipEl.textContent = t('start.tipMobile');
const mobileControlsEl = document.getElementById('mobileControls');
if (mobileControlsEl) mobileControlsEl.style.display = isMobile ? '' : 'none';

// ------ World (renderer, scene, camera, lights, sky, materials, arena) ------
const { renderer, scene, camera, skyMat, hemi, dir, mats, objects, arenaRadius, grassMesh } = createWorld(THREE, rng, arenaShape);
const wantEditor = (new URL(window.location.href)).searchParams.get('editor') === '1';
const storyParam = (new URL(window.location.href)).searchParams.get('story');
const storyDisabled = storyParam === '0' || storyParam === 'false';

// Show loading overlay during asset + shader prewarm
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loadingBar');
const loadingText = document.getElementById('loadingText');
function setLoading(pct, label){
  if (!loadingEl) return;
  const v = Math.max(0, Math.min(1, pct||0));
  if (loadingBar) loadingBar.style.width = `${(v*100).toFixed(0)}%`;
  if (loadingText) loadingText.textContent = `${(v*100).toFixed(0)}%${label?` — ${label}`:''}`;
}

// Kick asset load + shader warmup before proceeding
try {
  setLoading(0.02, t('loading.models'));
  const progress = (done, total) => {
    setLoading(0.02 + 0.48 * (done / Math.max(1, total)), `${t('loading.models')} ${done}/${total}`);
  };
  const shaderWarm = params.get('warmup') === '1';
  const { registry } = await loadAllModels({ renderer, onProgress: progress, skipWarmup: !shaderWarm });
  if (shaderWarm) {
    setLoading(0.55, t('loading.compiling'));
    await prewarmAllShaders(renderer, { registry, includeShadows: renderer.shadowMap?.enabled, includeDepthVariants: true, extras: [] });
  }
  setLoading(1.0, t('loading.ready'));
  // Hide overlay
  if (loadingEl) loadingEl.style.display = 'none';
} catch(e) { console.warn('Warmup failed — continuing without precompiled shaders'); if (loadingEl) loadingEl.style.display = 'none'; }

// Obstacles / Level loading (deterministic per seed or explicit map)
const obstacleManager = new ObstacleManager(THREE, scene, mats);
let levelInfo = null;
const levelParam = params.get('level');
if (levelParam) {
  try {
    // Expect a JSON blob or a relative path under assets/levels
    if (levelParam.trim().startsWith('{')) {
      const map = JSON.parse(levelParam);
      levelInfo = obstacleManager.loadFromMap(map, objects);
    } else {
      // Synchronous fetch is not available; kick async and block wave start until loaded
      // Start a fetch but meanwhile place nothing yet; we will continue after load
      // For simplicity, attempt to fetch and then proceed. If it fails, fall back to procedural.
      // Note: this top-level await style via IIFE
      await (async ()=>{
        const res = await fetch(`assets/levels/${levelParam.replace(/[^a-zA-Z0-9-_\.]/g,'')}`);
        if (res.ok) {
          const map = await res.json();
          levelInfo = obstacleManager.loadFromMap(map, objects);
        } else {
          obstacleManager.generate(seed, objects);
        }
      })();
    }
  } catch(_e){
    // On any error, fall back to procedural
    obstacleManager.generate(seed, objects);
  }
} else {
  obstacleManager.generate(seed, objects);
}
cullGrassUnderObjects(grassMesh, objects);
// Update player collider list now that obstacles have been added
// (player constructed below will read from updated objects)

// Weather system
const weather = new WeatherSystem({ THREE, scene, skyMat, hemi, dir, mats });

// Adjust player forward direction for crosswind when windy
const _origGetDir = camera.getWorldDirection.bind(camera);
camera.getWorldDirection = function(target){
  _origGetDir(target);
  const windLevel = weather && Math.max(
    weather._mix?.wind || 0,
    weather._mix?.sand || 0,
    weather.mode && (weather.mode.includes('wind') || weather.mode.includes('sand')) ? 1 : 0
  );
  if (windLevel > 0.01){
    // Reduce crosswind impact on aiming by 90%
    const yaw = weather.wind.x * 0.003 * windLevel;
    target.applyAxisAngle(new THREE.Vector3(0,1,0), yaw).normalize();
  }
  return target;
};

// ------ Player ------
const player = new PlayerController(THREE, camera, document.body, objects, arenaRadius);
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
const captainVariant = params.get('captain') === 'v2' ? 'v2' : 'v1';
const captainV2Config = {};
// Override CaptainV2 tuning via URL params (capSpeed, capFire, capProj)
const cs = parseFloat(params.get('capSpeed'));
if (!Number.isNaN(cs)) captainV2Config.speed = cs;
const cf = parseFloat(params.get('capFire'));
if (!Number.isNaN(cf)) captainV2Config.fireRate = cf;
const cp = parseFloat(params.get('capProj'));
if (!Number.isNaN(cp)) captainV2Config.projectileSpeed = cp;
const enemyManager = new EnemyManager(
  THREE,
  scene,
  mats,
  objects,
  () => {
    const pos = controls.getObject().position.clone();
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    return { position: pos, forward: f };
  },
  arenaRadius,
  obstacleManager,
  { captainVariant, captainV2Config }
);
// Ensure enemy manager colliders include arena floor and obstacles
if (enemyManager.refreshColliders) enemyManager.refreshColliders(objects);
// If map provided explicit enemy spawns, feed them to manager
if (levelInfo && Array.isArray(levelInfo.enemySpawnPoints) && levelInfo.enemySpawnPoints.length) {
  enemyManager.customSpawnPoints = levelInfo.enemySpawnPoints;
}
const effects = new Effects(THREE, scene, camera);
// Enable muzzle flash overlay for player weapons
effects.muzzleEnabled = true;
// First-person simple weapon view (barrel meshes)
const weaponView = new WeaponView(THREE, camera);
const pickups = new Pickups(THREE, scene);
enemyManager.pickups = pickups;

// Wire obstacle manager hooks now that managers exist
obstacleManager.enemyManager = enemyManager;
obstacleManager.pickups = pickups;
obstacleManager.getPlayer = () => controls.getObject();
obstacleManager.onScore = (points) => { addScore(points); };
obstacleManager.onPlayerDamage = (amount) => {
  if (paused || gameOver) return;
  hp -= amount; if (hp <= 0) { hp = 0; gameOver = true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; stopSuno(); }
  // Apply universal hit VFX on any damage source
  if (effects && typeof effects.onPlayerHit === 'function') effects.onPlayerHit(amount);
  updateHUD();
};
// When obstacles change, refresh colliders for both player and enemies
obstacleManager.onCollidersChanged = (objs) => {
  try { if (player && typeof player.refreshColliders === 'function') player.refreshColliders(objs); } catch(_) {}
  try { if (enemyManager && typeof enemyManager.refreshColliders === 'function') enemyManager.refreshColliders(objs); } catch(_) {}
};

// ------ Gun / Shooting ------
let hp=100, score=0, best=0, paused=false;
let lastMeleeSfxAt = -1;
let lastMeleeVfxAt = -1;
const MELEE_SFX_COOLDOWN = 0.25; // seconds
const MELEE_VFX_COOLDOWN = 0.10; // seconds; allow gentle pulsing while holding contact
const EMERGENCY_AMMO_COOLDOWN = 22; // seconds of active gameplay between emergency ammo drops
const hpEl = document.getElementById('hp'), ammoEl = document.getElementById('ammo'), magEl = document.getElementById('mag'), scoreEl = document.getElementById('score'), bestEl = document.getElementById('best'), waveEl = document.getElementById('wave');
const staminaBarEl = document.getElementById('staminaBar');
const fpsEl = document.getElementById('fps');
// Perf HUD toggle via URL (?debug=0 to hide)
const debugPerf = params.get('debug') !== '0';
let dbgCallsEl = null;
if (debugPerf) {
  dbgCallsEl = document.createElement('div');
  dbgCallsEl.className = 'pill tiny';
  dbgCallsEl.style.position = 'fixed';
  dbgCallsEl.style.right = '8px';
  dbgCallsEl.style.bottom = '8px';
  dbgCallsEl.style.zIndex = '10';
  dbgCallsEl.style.pointerEvents = 'none';
  dbgCallsEl.id = 'drawCalls';
  dbgCallsEl.textContent = 'Calls: 0  Tris: 0  Tex: 0';
  try { document.body.appendChild(dbgCallsEl); } catch(_) {}
}
const weaponNameEl = document.getElementById('weapon');
const weaponIconEl = document.getElementById('weaponIcon');
const hpPillEl = document.getElementById('hpPill');
const ammoPillEl = document.getElementById('ammoPill');
const waveBarEl = document.getElementById('waveBar');
const wavePillEl = document.getElementById('wavePill');
const remainingEl = document.getElementById('remaining');
const hydraWrapEl = document.getElementById('hydraWrap');
const hydraCountEl = document.getElementById('hydraCount');
const hitmarkerEl = document.getElementById('hitmarker');
const bossHudEl = document.getElementById('bossHud');
const bossNameEl = document.getElementById('bossName');
const bossHpBarEl = document.getElementById('bossHpBar');
const toastsEl = document.getElementById('toasts');
const tickerEl = document.getElementById('newsTicker');
let tickerQueue = Promise.resolve();

function clearTicker(){
  tickerQueue = Promise.resolve();
  if (!tickerEl) return;
  try {
    while (tickerEl.firstChild) {
      tickerEl.removeChild(tickerEl.firstChild);
    }
  } catch(_){}
}

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
const crosshairEl = document.getElementById('crosshair');
const combo = { tier:0, multiplier:1.0, streakPoints:0, decayTimer:0 };

function updateComboLabel(){
  if (!comboEl) return;
  comboLabelEl.textContent = `${t('hud.combo')}: x${combo.multiplier.toFixed(1)}`;
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

let weaponSystem; // initialized later
let progression;  // armory offers + unlocks
let story;        // lightweight narrative beats
let offerActive = false; // suppress panel on pointer unlock during offers

function updateHUD(){
  const w = weaponSystem ? weaponSystem.current : null;
  const isBeamSaber = w?.name === 'BeamSaber';
  const ammoVal = weaponSystem ? (isBeamSaber ? '∞' : weaponSystem.getAmmo()) : 30;
  const reserveVal = weaponSystem ? (isBeamSaber ? '∞' : weaponSystem.getReserve()) : 60;
  if (weaponNameEl) weaponNameEl.textContent = w ? w.name : 'Rifle';
  if (weaponIconEl) {
    const iconMap = { Rifle:'assets/icons/weapon-rifle.svg', SMG:'assets/icons/weapon-smg.svg', Shotgun:'assets/icons/weapon-shotgun.svg', DMR:'assets/icons/weapon-dmr.svg', Minigun:'assets/icons/weapon-minigun.svg', Pistol:'assets/icons/weapon-pistol.svg', BeamSaber:'assets/icons/weapon-beamsaber.svg' };
    weaponIconEl.src = iconMap[w?.name] || iconMap.Rifle;
  }
  hpEl.textContent = Math.floor(hp); ammoEl.textContent=ammoVal; magEl.textContent=reserveVal; scoreEl.textContent=score; if (bestEl) bestEl.textContent = best; if(waveEl) waveEl.textContent = enemyManager.wave;
  updateHUDComboAndBoss();
}

function updateHUDComboAndBoss(){
  updateComboLabel();
  // Stamina HUD
  if (staminaBarEl && player && typeof player.getStamina01 === 'function') {
    const pct = Math.max(0, Math.min(1, player.getStamina01()));
    staminaBarEl.style.width = `${(pct*100).toFixed(1)}%`;
  }
  // Low state cues
  if (hpPillEl){ hpPillEl.classList.remove('low','crit'); if (hp <= 25) { hpPillEl.classList.add('crit'); } else if (hp <= 50) { hpPillEl.classList.add('low'); } }
  if (ammoPillEl){ const ammoValLocal = weaponSystem ? weaponSystem.getAmmo() : 30; ammoPillEl.classList.remove('need-reload'); if (ammoValLocal <= 0) ammoPillEl.classList.add('need-reload'); }
  // Hydra lineage aggregate
  let hydraAlive = 0, hydraDesc = 0;
  try {
    const bb = enemyManager?._ctx?.blackboard;
    if (bb && bb.hydraLineages) {
      for (const v of Object.values(bb.hydraLineages)) {
        hydraAlive += v.alive || 0;
        hydraDesc += v.descendants || 0;
      }
    }
  } catch(_) {}
  if (hydraWrapEl) {
    if (hydraAlive > 0) {
      hydraWrapEl.style.display = '';
      if (hydraCountEl) hydraCountEl.textContent = `${hydraAlive}/${hydraDesc}`;
    } else {
      hydraWrapEl.style.display = 'none';
    }
  }
  // Wave progress (account for hydra descendants)
  if (waveBarEl && typeof enemyManager.waveStartingAlive === 'number'){
    const total = Math.max(1, enemyManager.waveStartingAlive + hydraDesc);
    const remaining = Math.max(0, enemyManager.alive|0);
    const done01 = Math.max(0, Math.min(1, 1 - (remaining / total)));
    waveBarEl.style.width = `${(done01*100).toFixed(1)}%`;
    if (wavePillEl) wavePillEl.classList.toggle('hydra', hydraAlive > 0);
  }
  if (remainingEl) { remainingEl.textContent = Math.max(0, enemyManager.alive|0); }
  // Hide remaining when boss active
  try {
    const bossActive = !!(enemyManager && enemyManager.bossManager && enemyManager.bossManager.active && enemyManager.bossManager.boss);
    const wrap = document.getElementById('remainingWrap');
    if (wrap) wrap.style.display = bossActive ? 'none' : '';
    // Boss HUD
    if (bossHudEl) {
      if (bossActive) {
        bossHudEl.style.display = '';
        const boss = enemyManager.bossManager.boss;
        const name = (boss && boss.root && boss.root.userData && boss.root.userData.type) ? String(boss.root.userData.type).replace(/^boss_/, '').replace(/_/g,' ') : 'Boss';
        if (bossNameEl) bossNameEl.textContent = name;
        const maxHp = enemyManager.bossManager._musicBossMaxHp || boss?.root?.userData?.maxHp || boss?.root?.userData?.hp || 1;
        const curHp = Math.max(0, Math.min(maxHp, boss?.root?.userData?.hp || maxHp));
        if (bossHpBarEl) bossHpBarEl.style.width = `${((curHp/maxHp)*100).toFixed(1)}%`;
      } else {
        bossHudEl.style.display = 'none';
      }
    }
  } catch(_) {}
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
enemyManager.onWave = (_wave, startingAlive) => {
  // record startingAlive for progress bar
  enemyManager.waveStartingAlive = startingAlive || 0;
  updateHUD();
  pickups.onWave(enemyManager.wave);
  if (weather && typeof weather.onWave === 'function') weather.onWave();
  if (player.refreshColliders) player.refreshColliders(objects);
  if (progression) progression.onWave(enemyManager.wave);
  if (story) story.onWave(enemyManager.wave);
  // Toast
  showToast(`Wave ${_wave} start`);
};
enemyManager.onRemaining = () => updateHUD();

// Sounds: create music first, then SFX sharing its context and FX bus
const baseMusicVol = 0.35;
const baseSfxVol = 0.65;
const storedSound = parseFloat(localStorage.getItem('soundVolume') || '1');
const music = new Music({ bpm: 132, volume: baseMusicVol * storedSound });
const S = new SFX({
  audioContextProvider: () => music.getContext(),
  fxBusProvider: () => music.getFxBus(),
  volume: baseSfxVol * storedSound,
});
// Expose for ambient enemy vocals
try { window._SFX = S; } catch(_) {}
let currentSongIndex = 0;
let lastSongRotateBar = -1;
function loadCurrentSong(){
  const song = SONGS[currentSongIndex % SONGS.length];
  music.loadSong(song);
  // Mark switch point so rotation cadence is consistent even across boss transitions
  lastSongRotateBar = music.barCounter;
}
loadCurrentSong();

const soundSlider = document.getElementById('soundVolume');
if (soundSlider){
  soundSlider.value = String(storedSound);
  soundSlider.addEventListener('input', e=>{
    const v = parseFloat(e.target.value);
    music.setVolume(baseMusicVol * v);
    S.setVolume(baseSfxVol * v);
    localStorage.setItem('soundVolume', String(v));
  });
}

const SUNO_TRACKS = [
  'assets/music/suno-remix-1-non-commercial-use-only.mp3',
  'assets/music/suno-remix-2-non-commercial-use-only.mp3',
  'assets/music/suno-remix-3-non-commercial-use-only.mp3',
  'assets/music/suno-remix-4-non-commercial-use-only.mp3',
  'assets/music/suno-remix-5-non-commercial-use-only.mp3',
];
const SUNO_BOSS_TRACK = 'assets/music/boss-standoff 1 (Suno Remix) - non commerial use only.mp3';

function stopSuno(){
  if (sunoAudio) {
    try { sunoAudio.pause(); sunoAudio.currentTime = 0; } catch(_){}
    sunoAudio = null;
  }
}

function playSuno(){
  stopSuno();
  const track = SUNO_TRACKS[sunoTrackIndex % SUNO_TRACKS.length];
  sunoTrackIndex = (sunoTrackIndex + 1) % SUNO_TRACKS.length;
  sunoAudio = new Audio(track);
  sunoAudio.volume = 0.35;
  sunoAudio.muted = S.isMuted;
  sunoAudio.addEventListener('ended', playSuno);
  try { sunoAudio.play(); } catch(_){}
  try { music.stop?.(); } catch(_){}
}

function playSunoBoss(){
  stopSuno();
  sunoAudio = new Audio(SUNO_BOSS_TRACK);
  sunoAudio.volume = 0.35;
  sunoAudio.muted = S.isMuted;
  sunoAudio.loop = true;
  try { sunoAudio.play(); } catch(_){}
  try { music.stop?.(); } catch(_){}
}

document.getElementById('mute').onclick=()=>{
  const muted = !(S.isMuted);
  S.setMuted(muted);
  document.getElementById('mute').textContent = muted?'🔇':'🔊';
  music.setMuted(muted);
  if (sunoAudio) sunoAudio.muted = muted;
};

// Tracer + sparks
const tracers = [];
function addTracer(from, to){
  // New: use effects-driven sprite tracer for motion
  if (effects && typeof effects.spawnBulletTracer === 'function') {
    const muzzlePos = effects.getMuzzleWorldPos(new THREE.Vector3());
    effects.spawnBulletTracer(muzzlePos, to, { ttl: 0.12, width: 0.04, impact: true });
  } else {
    // Fallback to legacy line if effects unavailable
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(g, mats.tracer.clone());
    line.userData = { life: 0 };
    scene.add(line); tracers.push(line);
  }
}
function addSpark(at){
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mats.spark.clone());
  s.position.copy(at); s.userData={ life:0 };
  scene.add(s); tracers.push(s); // reuse same update list
}

// Hitscan raycaster
const raycaster = new THREE.Raycaster();

// Initialize weapon system and input
weaponSystem = new WeaponSystem({
  THREE,
  camera,
  raycaster,
  enemyManager,
  objects,
  effects,
  obstacleManager,
  pickups,
  S,
  updateHUD: () => updateHUD(),
  addScore: (p) => addScore(p),
  addComboAction: (p) => addComboAction(p),
  combo,
  addTracer: (from, to) => addTracer(from, to),
  applyRecoil: (r)=> player.applyRecoil?.(r),
  weaponView
});
// Set initial weapon view
try { weaponView.setWeapon(weaponSystem.getPrimaryName()); } catch(_) {}
progression = new Progression({ weaponSystem, documentRef: document, onPause: (lock)=>{ offerActive = !!lock; paused = !!lock; }, controls });
story = storyDisabled ? null : new StoryManager({ documentRef: document, onPause: (lock)=>{ paused = !!lock; }, controls, toastFn: (t)=> showToast(t), tickerFn: (t,r,i)=> showTicker(t,r,i) });



if (!isMobile) {
  // Desktop: support primary fire + right-click alt fire
  window.addEventListener('mousedown', e => {
    if (!controls.isLocked || paused) return;
    if (e.button === 2) weaponSystem.triggerAltDown();
    else weaponSystem.triggerDown();
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 2) weaponSystem.triggerAltUp();
    else weaponSystem.triggerUp();
  });

  // Disable context menu so right-click is usable for alt fire
  window.addEventListener('contextmenu', e => { e.preventDefault(); });

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyR') { weaponSystem.reload(); }
    if (e.code === 'KeyP') { paused = !paused; }
    if (e.code === 'Digit1') { weaponSystem.switchSlot(1); }
    if (e.code === 'Digit2') { weaponSystem.switchSlot(2); }
    if (e.code === 'Digit3') { weaponSystem.switchSlot(3); }
    if (e.code === 'Digit4') { weaponSystem.switchSlot(4); }
    if (e.code === 'Digit5') { weaponSystem.switchSlot(5); }
    // Update view on quick slot changes
    try { weaponView.setWeapon(weaponSystem.getPrimaryName()); } catch (_) {}
  });

} else {
  // Mobile: touch controls (fire, reload, jump)
  const fireBtn = document.getElementById('btnFire');
  const reloadBtn = document.getElementById('btnReload');
  const jumpBtn = document.getElementById('btnJump');

  if (fireBtn) {
    fireBtn.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      weaponSystem.triggerDown();
    }, { passive: false });
    const end = () => weaponSystem.triggerUp();
    fireBtn.addEventListener('touchend', end);
    fireBtn.addEventListener('touchcancel', end);
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    reloadBtn.addEventListener('touchend', () => { weaponSystem.reload(); });
  }

  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    jumpBtn.addEventListener('touchend', () => { player.jump(); });
  }

  // Optional: quick-slot keyboard shortcuts generally don't apply on mobile
}

updateHUD();

// ------ Game Loop ------
const clock = new THREE.Clock();
let gameOver=false;
let gameTime = 0; // advances only when not paused and controls are locked
let lastEmergencyAmmoAt = -1000; // so first eligible trigger is allowed
// FPS limit
const TARGET_FPS = 60;
const FRAME_MIN_MS = 1000 / TARGET_FPS;
let _lastFrameAt = performance.now();
// Adaptive pixel ratio (DPR) — opt-in via ?autoDPR=1
const autoDpr = params.get('autoDPR') === '1';
const DPR_MAX = Math.min(2, window.devicePixelRatio || 1);
const DPR_MIN = 0.8;
let _dpr = DPR_MAX;
let _frameEmaMs = 1000 / TARGET_FPS;
let _lastDprAdjustAt = 0;
function step(){
  const now = performance.now();
  const elapsedMs = now - _lastFrameAt;

  // --- FPS calc (EMA over ~0.5s) using RAF intervals ---
  const dtRaf = Math.min(0.1, Math.max(0, elapsedMs / 1000));
  if (!step._fps) { step._fps = { ema: null, accum: 0 }; }
  const instFps = elapsedMs > 0 ? 1000 / elapsedMs : 0;
  const alpha = 1 - Math.exp(-(dtRaf || 0.016) / 0.5);
  step._fps.ema = (step._fps.ema == null) ? instFps : (step._fps.ema * (1 - alpha) + instFps * alpha);
  step._fps.accum += dtRaf;
  if (fpsEl && step._fps.accum >= 0.2) { fpsEl.textContent = String(Math.round(step._fps.ema)); step._fps.accum = 0; }

  // Throttle to 60 FPS
  if (elapsedMs < FRAME_MIN_MS - 0.25) { requestAnimationFrame(step); return; }
  _lastFrameAt = now;

  const dt = Math.min(0.033, clock.getDelta());
  if((controls.isLocked || isMobile) && !paused && !gameOver){
    // advance game time only while active
    gameTime += dt;
    // player movement update
    player.update(dt);
    // weapon view update using player inputs (approx from key state and mouse movement are handled by PointerLock, so we feed movement intent only)
    try {
      const x = (player.keys.has('KeyD')?1:0) + (player.keys.has('KeyA')?-1:0);
      const y = (player.keys.has('KeyW')?1:0) + (player.keys.has('KeyS')?-1:0);
      weaponView.setMove(x, y);
      const sprinting = player.keys.has('ShiftLeft') || player.keys.has('ShiftRight');
      weaponView.setSprint(sprinting ? 1 : 0);
      // ADS: right mouse button not tracked here; leave default 0. We can add a listener later if needed.
      weaponView.update(dt);
    } catch(_) {}
    // Update stamina HUD every frame
    if (staminaBarEl && player && typeof player.getStamina01 === 'function') {
      const pct = Math.max(0, Math.min(1, player.getStamina01()));
      staminaBarEl.style.width = `${(pct*100).toFixed(1)}%`;
    }
    // Fatigue visuals + breath SFX when low stamina
    if (effects && typeof effects.setFatigue === 'function' && player && typeof player.getStamina01 === 'function'){
      const s01 = player.getStamina01();
      // Map low stamina to fatigue: start at <= 0.3, max at 0
      const fatigue = Math.max(0, Math.min(1, (0.3 - s01) / 0.3));
      effects.setFatigue(fatigue);
      // Breath SFX gating
      if (S && S.startBreath && S.stopBreath){
        if (fatigue > 0.05){
          S.startBreath();
          if (S._breath && typeof S._breath.setExhausted === 'function') S._breath.setExhausted(fatigue);
        } else {
          S.stopBreath();
        }
      }
    }

    // enemies AI
    const fo = controls.getObject();
    enemyManager.tickAI(fo, dt, (damage, source)=>{
      hp -= damage; if(hp<=0){ hp=0; gameOver=true; document.getElementById('retry').style.display=''; document.getElementById('center').style.display='grid'; S.hurt(); }
      // VFX for all hits; for melee, pulse at a small cooldown with a stronger bump for readability
      if (effects && typeof effects.onPlayerHit === 'function') {
        if (source === 'melee') {
          if (lastMeleeVfxAt < 0 || (gameTime - lastMeleeVfxAt) >= MELEE_VFX_COOLDOWN) {
            const boosted = Math.max(damage, 6);
            effects.onPlayerHit(boosted);
            lastMeleeVfxAt = gameTime;
          }
        } else {
          effects.onPlayerHit(damage);
        }
      }
      if (source === 'melee') {
        if (lastMeleeSfxAt < 0 || (gameTime - lastMeleeSfxAt) >= MELEE_SFX_COOLDOWN) {
          S.hit();
          lastMeleeSfxAt = gameTime;
        }
      }
      updateHUD();
      // Low HP trigger for story
      try { if (hp <= 25) story?.onLowHp?.(); } catch(_) {}
    });

    // legacy tracers removal (if any left around)
    for(let i=tracers.length-1;i>=0;i--){ const obj = tracers[i]; obj.userData.life += dt; if(obj.isLine){ obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.12); if(obj.userData.life>0.12){ scene.remove(obj); tracers.splice(i,1); } } else { obj.scale.multiplyScalar(1 + dt*10); if(obj.material.opacity===undefined){ obj.material.transparent=true; obj.material.opacity=1; } obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.25); if(obj.userData.life>0.25){ scene.remove(obj); tracers.splice(i,1); } } }
    // effects update
    effects.update(dt);

    // pickups update (magnet + animation)
    pickups.update(dt, controls.getObject().position, (type, amount, where) => {
      if (type === 'ammo') { if (weaponSystem) weaponSystem.onAmmoPickup(amount); showToast('+Ammo'); }
      else if (type === 'med') { hp = Math.min(100, hp + amount); if (S && S.ui) S.ui('pickup'); showToast('+HP'); try { story?.onFirstMedPickup?.(); } catch(_) {} }
      updateHUD();
    });

    // Emergency ammo assistance: if player has no ammo (mag + reserve) and there are
    // at most 1 ammo pickup on the map, drop 3 at center to prevent softlocks
    try {
      if (weaponSystem && pickups && pickups.active) {
        // Compute total ammo across all weapons (mag + reserve for each)
        let totalAmmo = 0;
        try {
          for (const w of (weaponSystem.inventory || [])) {
            if (w?.name === 'Pistol') continue;
            const mag = Math.max(0, (typeof w.getAmmo === 'function' ? w.getAmmo() : w.ammoInMag) | 0);
            const res = Math.max(0, (typeof w.getReserve === 'function' ? w.getReserve() : w.reserveAmmo) | 0);
            totalAmmo += mag + res;
          }
        } catch(_) {}
        if (totalAmmo <= 0 && (gameTime - lastEmergencyAmmoAt) >= EMERGENCY_AMMO_COOLDOWN) {
          let ammoOnMap = 0;
          for (const g of pickups.active) { if (g?.userData?.type === 'ammo') ammoOnMap++; }
          if (ammoOnMap <= 1) {
            const center = new THREE.Vector3(0, 0, 0);
            const offsets = [
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0.9, 0, 0),
              new THREE.Vector3(-0.9, 0, 0)
            ];
            for (const off of offsets) { pickups.spawn('ammo', center.clone().add(off)); }
            lastEmergencyAmmoAt = gameTime;
          }
        }
      }
    } catch(_) { /* ignore emergency drop errors */ }

    // Obstacles update (reserved for future moving obstacles)
    obstacleManager.update(dt);

    // weapon system update (auto fire pacing)
    if (weaponSystem) weaponSystem.update(dt);

    // Crosshair bloom visualization
    if (crosshairEl && weaponSystem) {
      const bloom = weaponSystem.getCurrentBloom01 ? weaponSystem.getCurrentBloom01() : 0;
      const prof = weaponSystem.getCrosshairProfile ? weaponSystem.getCrosshairProfile() : { baseScale:1, minAlpha:0.6, k:0.8, thickPx:2 };
      const scale = (prof.baseScale + bloom * prof.k).toFixed(3);
      const alpha = (prof.minAlpha + bloom * 0.25);
      crosshairEl.style.setProperty('--xh-scale', scale);
      crosshairEl.style.setProperty('--xh-alpha', alpha.toFixed(3));
      crosshairEl.style.setProperty('--xh-thick', `${prof.thickPx|0}px`);
      const gap = (prof.gapPx + bloom * (prof.gapPx * 0.9)).toFixed(2);
      const len = (prof.lenPx + bloom * (prof.lenPx * 0.6)).toFixed(2);
      crosshairEl.style.setProperty('--xh-gap', `${gap}px`);
      crosshairEl.style.setProperty('--xh-len', `${len}px`);
      if (typeof prof.rotDeg === 'number') {
        crosshairEl.style.setProperty('--xh-rot', `${prof.rotDeg}deg`);
      } else {
        crosshairEl.style.setProperty('--xh-rot', '0deg');
      }
      // Optional tint on perfect accuracy
      if (bloom < 0.05) {
        crosshairEl.style.setProperty('--xh', '#16a34a');
      } else {
        crosshairEl.style.setProperty('--xh', 'var(--ui)');
      }
    }

    // Weather update (uses gameTime so it freezes cleanly when paused)
    weather.update(gameTime, controls.getObject());

    // Update grass appearance based on precipitation and wind
    if (grassMesh && grassMesh.material && grassMesh.material.uniforms) {
      const rainMix = weather._mix?.rain || 0;
      const snowMix = weather._mix?.snow || 0;
      const heightFactor = Math.max(0.2, 1 - 0.3 * rainMix - 0.6 * snowMix);
      grassMesh.material.uniforms.heightFactor.value = heightFactor;
      grassMesh.material.uniforms.snowMix.value = snowMix;

      const windMix = Math.max(weather._mix?.wind || 0, weather._mix?.sand || 0);
      const wind = weather.wind || { x: 1, z: 0 };
      const len = Math.hypot(wind.x, wind.z) || 1;
      grassMesh.material.uniforms.windDirection.value.set(wind.x / len, wind.z / len);
      grassMesh.material.uniforms.windStrength.value = 0.2 + 3.0 * windMix;
    }

    // Feed music mood from weather for subtle DNA
    try {
      const mode = weather.mode || 'clear';
      const fogMix = (weather._mix?.fog) || (mode.includes('fog') ? 1 : 0);
      const rainMix = (weather._mix?.rain) || (mode.includes('rain') ? 1 : 0);
      const sandMix = (weather._mix?.sand) || (mode.includes('sand') ? 1 : 0);
      // Darker pads and softer hats in fog/rain/sand
      const hatCut = 6000 - 1800 * Math.min(1, (fogMix * 0.6 + rainMix * 0.4 + sandMix * 0.7));
      const padBright = 2000 - 600 * Math.min(1, fogMix + sandMix) + 300 * Math.min(1, rainMix);
      music.hatCutoffHz = Math.max(2200, hatCut|0);
      music.padBaseBrightnessHz = Math.max(1200, padBright|0);
      if (typeof music.setMood === 'function') music.setMood({ fog: fogMix, rain: rainMix, sand: sandMix });
    } catch (e) { /* ignore mood errors */ }
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

  // Music energy follows combo tier smoothly
  music.setEnergy(combo.tier);

  // If a boss is active, ramp boss intensity based on boss HP (lower HP = higher intensity)
  if (enemyManager && enemyManager.bossManager && enemyManager.bossManager.active && enemyManager.bossManager.boss && typeof music.setBossIntensity === 'function') {
    const bm = enemyManager.bossManager;
    const boss = bm.boss;
    const maxHp = bm._musicBossMaxHp || boss?.maxHp || boss?.root?.userData?.hp || 1;
    const hp = Math.max(0, Math.min(maxHp, boss?.root?.userData?.hp || maxHp));
    const intensity = Math.max(0, Math.min(1, 1 - (hp / maxHp)));
    music.setBossIntensity(intensity);
  }

  // Rotate track every N bars to keep variety (skip during boss theme)
  const isBossTrack = SONGS[currentSongIndex % SONGS.length]?.isBoss;
  if (!isBossTrack && music.barCounter > 0) {
    const barsSinceSwitch = lastSongRotateBar < 0 ? music.barCounter : (music.barCounter - lastSongRotateBar);
    if (barsSinceSwitch >= 32) {
      currentSongIndex = (currentSongIndex + 1) % SONGS.length;
      loadCurrentSong();
      lastSongRotateBar = music.barCounter;
    }
  }

  // (pickups and weather are updated only while active in the gated block above)

  // Adaptive DPR update (EMA over frame interval)
  if (autoDpr) {
    _frameEmaMs = _frameEmaMs * 0.9 + elapsedMs * 0.1;
    if ((now - _lastDprAdjustAt) > 900) {
      let changed = false;
      if (_frameEmaMs > (1000/55) && _dpr > DPR_MIN) {
        _dpr = Math.max(DPR_MIN, Math.round((_dpr - 0.1) * 20) / 20);
        changed = true;
      } else if (_frameEmaMs < (1000/62) && _dpr < DPR_MAX) {
        _dpr = Math.min(DPR_MAX, Math.round((_dpr + 0.1) * 20) / 20);
        changed = true;
      }
      if (changed) { renderer.setPixelRatio(_dpr); _lastDprAdjustAt = now; }
    }
  }

  renderer.render(scene,camera);

  // Debug counters ~5Hz
  if (debugPerf && (!step._dbg || !step._dbg.t || (now - step._dbg.t) > 200)) {
    step._dbg = step._dbg || {}; step._dbg.t = now;
    const info = renderer.info;
    if (info && dbgCallsEl) {
      const calls = (info.render && info.render.calls) || 0;
      const tris = (info.render && info.render.triangles) || 0;
      const tex = (info.memory && info.memory.textures) || 0;
      dbgCallsEl.textContent = `Calls: ${calls}  Tris: ${tris}  Tex: ${tex}`;
    }
  }
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// ------ UI / Flow ------
const panel = document.getElementById('panel');
const playBtn = document.getElementById('play');
const retryBtn = document.getElementById('retry');
const pauseMenu = document.getElementById('pauseMenu');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestart = document.getElementById('pauseRestart');
const openSettingsBtn = document.getElementById('openSettings');
const pauseSettingsBtn = document.getElementById('pauseSettings');
const settingsMenu = document.getElementById('settingsMenu');
const settingsBack = document.getElementById('settingsBack');
let settingsReturn = 'panel';

function openSettings(from){
  settingsReturn = from;
  panel.style.display='none';
  pauseMenu.style.display='none';
  settingsMenu.style.display='';
  panel.parentElement.style.display='grid';
}

function closeSettings(){
  settingsMenu.style.display='none';
  if (settingsReturn === 'pause'){
    pauseMenu.style.display='';
  } else {
    panel.style.display='';
  }
}

function reset(){ // clear enemies
  stopSuno();
  enemyManager.reset();
  pickups.resetAll(); pickups.onWave(enemyManager.wave);
  hp=100; score=0; paused=false; gameOver=false; resetCombo(); if (weaponSystem) weaponSystem.reset(); updateHUD();
  if (levelInfo && levelInfo.playerSpawn) {
    player.resetPosition(levelInfo.playerSpawn.x, levelInfo.playerSpawn.y, levelInfo.playerSpawn.z);
  } else {
    player.resetPosition(0,1.7,8);
  }
  // Refill stamina on reset
  try { player.stamina = player.staminaMax; } catch(_) {}
  try { effects.setFatigue(0); } catch(_) {}
  try { S.stopBreath(); } catch(_) {}
  try { story?.reset(); story?.startRun(); } catch(_) {}
}

function startGame(){
  if (isMobile) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try { if (req) req.call(el); } catch(_) {}
  } else {
    controls.lock();
  }
  panel.parentElement.style.display = 'none';
  reset();
  if (musicChoice === 'suno') { playSuno(); } else { music.start(); }
}

function resumeGame(){
  pauseMenu.style.display='none';
  panel.parentElement.style.display='none';
  paused=false;
  controls.lock();
}

function showPauseMenu(){
  if (paused || gameOver) return;
  panel.style.display='none';
  pauseMenu.style.display='';
  panel.parentElement.style.display='grid';
  paused=true;
}

playBtn.onclick = startGame;
retryBtn.onclick = startGame;
if (resumeBtn) resumeBtn.onclick = resumeGame;
if (pauseRestart) pauseRestart.onclick = startGame;
if (openSettingsBtn) openSettingsBtn.onclick = ()=>openSettings('panel');
if (pauseSettingsBtn) pauseSettingsBtn.onclick = ()=>openSettings('pause');
if (settingsBack) settingsBack.onclick = closeSettings;

// Quality preset buttons: update URL params and reload
const qLow = document.getElementById('qLow');
const qMed = document.getElementById('qMed');
const qHigh = document.getElementById('qHigh');
const qUltra = document.getElementById('qUltra');
const qualityPresets = {
  low: { aa: 0, shadows: 0, autoDPR: 1, tone: 0, debug: 1 },
  med: { aa: 0, shadows: 0, autoDPR: 1, tone: 1, debug: 1 },
  high: { aa: 1, shadows: 1, autoDPR: 0, tone: 1, debug: 1 },
  ultra: { aa: 1, shadows: 1, autoDPR: 0, tone: 1, debug: 1 },
};
function highlightQuality(which){
  qLow?.classList.toggle('selected', which === 'low');
  qMed?.classList.toggle('selected', which === 'med');
  qHigh?.classList.toggle('selected', which === 'high');
  qUltra?.classList.toggle('selected', which === 'ultra');
}
try { highlightQuality(localStorage.getItem(QUALITY_KEY)); } catch (_) {}
function setParams(obj){
  const u = new URL(window.location.href);
  Object.entries(obj).forEach(([k,v])=>{ if (v==null) u.searchParams.delete(k); else u.searchParams.set(k, String(v)); });
  window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
}
if (qLow) qLow.onclick = () => {
  try { localStorage.setItem(QUALITY_KEY, 'low'); } catch (_) {}
  highlightQuality('low');
  setParams(qualityPresets.low);
};
if (qMed) qMed.onclick = () => {
  try { localStorage.setItem(QUALITY_KEY, 'med'); } catch (_) {}
  highlightQuality('med');
  setParams(qualityPresets.med);
};
if (qHigh) qHigh.onclick = () => {
  try { localStorage.setItem(QUALITY_KEY, 'high'); } catch (_) {}
  highlightQuality('high');
  setParams(qualityPresets.high);
};
if (qUltra) qUltra.onclick = () => {
  try { localStorage.setItem(QUALITY_KEY, 'ultra'); } catch (_) {}
  highlightQuality('ultra');
  setParams(qualityPresets.ultra);
};
if (startQuality && qualityPresets[startQuality]) {
  highlightQuality(startQuality);
  setParams(qualityPresets[startQuality]);
}

controls.addEventListener('unlock', ()=>{
  if (gameOver) {
    pauseMenu.style.display='none';
    panel.style.display='';
    panel.parentElement.style.display='grid';
    retryBtn.style.display='';
  } else {
    showPauseMenu();
  }
});

window.addEventListener('blur', ()=>{
  if (!gameOver) showPauseMenu();
});

document.addEventListener('visibilitychange', ()=>{
  if (!gameOver) showPauseMenu();
});

// Start with a wave ready so there's action immediately after lock (skip in editor)
if (!wantEditor) enemyManager.startWave();

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});

// Optional: pre-warm enemy assets to avoid first-spawn hitches
try {
  const prewarm = (new URL(window.location.href)).searchParams.get('prewarm') !== '0';
  if (prewarm) {
    const kinds = ['grunt', 'rusher', 'shooter', 'sniper', 'tank'];
    const base = new THREE.Vector3(0, 0.8, -60);
    for (let i=0;i<kinds.length;i++) {
      const pos = base.clone().add(new THREE.Vector3(i*2, 0, 0));
      const root = enemyManager.spawnAt(kinds[i], pos, { countsTowardAlive: false });
      scene.remove(root);
      enemyManager.remove(root);
    }
  }
} catch(_) {}

// Pre-warm VFX pools
try { effects.prewarm({ tracers: 64, rings: 8 }); } catch(_) {}

// ---- Hitmarker helpers ----
function showHitmarker(){
  if (!hitmarkerEl) return;
  hitmarkerEl.classList.remove('hitmarker-show');
  // force reflow
  // eslint-disable-next-line no-unused-expressions
  hitmarkerEl.offsetHeight;
  hitmarkerEl.classList.add('hitmarker-show');
}
// Expose small API for weapons to indicate hit/kill/headshot if desired later
try { window._HUD = { showHitmarker }; } catch(_) {}

// Ticker system
function showTicker(text, repeat = 1, interval = 8000){
  if (!tickerEl) return;
  const cycles = Math.max(1, repeat | 0);
  for (let i = 0; i < cycles; i++){
    tickerQueue = tickerQueue.then(() => new Promise(resolve => {
      const track = document.createElement('div');
      track.className = 'ticker-track';

      const item = document.createElement('span');
      item.className = 'ticker-item';
      item.textContent = text;
      track.appendChild(item);
      tickerEl.appendChild(track);

      const containerWidth = tickerEl.offsetWidth || window.innerWidth;
      while (track.offsetWidth < containerWidth * 2){
        track.appendChild(item.cloneNode(true));
      }

      const distance = track.offsetWidth + containerWidth;
      const baseSpeed = containerWidth / (interval/1000) / 2.5;
      const duration = distance / baseSpeed;
      track.style.animation = `tickerScroll ${duration}s linear`;

      track.addEventListener('animationend', () => {
        try { tickerEl.removeChild(track); } catch(_){}
        resolve();
      }, { once: true });
    }));
  }
}

// Toast system
function showToast(text){
  if (!toastsEl) return;
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
  toastsEl.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>{ try{ toastsEl.removeChild(el);}catch(_){ } }, 240); }, 1200);
}

try {
  if (window && window._HUD) {
    window._HUD.toast = (t)=> showToast(t);
    window._HUD.ticker = (t,r,i)=> showTicker(t,r,i);
    window._HUD.clearTicker = ()=> clearTicker();
  }
} catch(_) {}

// Boss music transitions
if (enemyManager && enemyManager.bossManager) {
  const bm = enemyManager.bossManager;
  const originalStartBoss = bm.startBoss.bind(bm);
  bm.startBoss = (wave) => {
    if (musicChoice === 'suno') {
      playSunoBoss();
    } else {
      // Enter boss mode: duck base track and switch to boss song at bar boundary
      music.enterBossMode();
      // Apply per-boss profile
      let profile = { hatExtraDensity: 0.15, padBrightnessHz: 2200, toms: true, stingerTone: 1.0 };
      if (wave === 5) { // Broodmaker light
        profile = { ...profile, motifSemis: [0, -2, 0, -3], leadArpOverride: [0, 12, 7, 12], delayTimeOverride: 0.2 };
      } else if (wave === 10) { // Sanitizer
        profile = { ...profile, motifSemis: [2, 0, -2, 0], padBrightnessHz: 2600, delayTimeOverride: 0.17, stingerTone: 1.1 };
      } else if (wave === 15) { // Captain
        profile = { ...profile, motifSemis: [0, 5, 0, -5], leadArpOverride: [0, 7, 12, 19], delayTimeOverride: 0.19, stingerTone: 0.95 };
      } else if (wave === 20) { // Shard Avatar
        profile = { ...profile, motifSemis: [0, 3, 0, -2], padBrightnessHz: 2400, delayTimeOverride: 0.16, stingerTone: 1.2 };
      } else if (wave === 25) { // Broodmaker heavy
        profile = { ...profile, motifSemis: [0, -1, 0, -3], padBrightnessHz: 2300, delayTimeOverride: 0.18, stingerTone: 0.9 };
      }
      if (music.applyBossProfile) music.applyBossProfile(profile);
      music.playBossStinger({ tone: profile.stingerTone });
      currentSongIndex = SONGS.findIndex(s => s.id === 'boss-standoff');
      if (currentSongIndex < 0) currentSongIndex = 0;
      loadCurrentSong();
    }
    const res = originalStartBoss(wave);
    try { if (story) story.onBossStart(wave); } catch(_) {}
    // Record boss max HP for intensity mapping
    try { bm._musicBossMaxHp = bm?.boss?.root?.userData?.hp || bm?.boss?.maxHp || 1; } catch (_) { bm._musicBossMaxHp = 1; }
    return res;
  };
  const originalOnBossDeath = bm._onBossDeath.bind(bm);
  bm._onBossDeath = () => {
    // Capture boss position before original handler clears references
    let dropPos = null;
    try { dropPos = bm?.boss?.root?.position?.clone?.() || null; } catch(_) { dropPos = null; }
    originalOnBossDeath();
    if (musicChoice === 'suno') {
      stopSuno();
      playSuno();
    } else {
      // Leave boss mode: restore main playlist and volume
      music.exitBossMode();
      if (music.applyBossProfile) music.applyBossProfile({ hatExtraDensity: 0.0, toms: false, motifSemis: null });
      if (music.setBossIntensity) music.setBossIntensity(0);
      // Advance to next non-boss track
      currentSongIndex = (currentSongIndex + 1) % SONGS.length;
      loadCurrentSong();
    }

    // Guaranteed boss drops: 1 ammo and 1 medkit
    try {
      if (dropPos && pickups && typeof pickups.spawn === 'function') {
        const p1 = dropPos.clone();
        const p2 = dropPos.clone();
        // Small offset so they don't overlap perfectly
        p1.x += 0.8; p2.x -= 0.8;
        pickups.spawn('ammo', p1);
        pickups.spawn('med', p2);
      }
    } catch(_) { /* ignore drop errors */ }

    // Progression gating: unlock rifle after first boss, DMR after second
    try {
      if (progression) {
        progression.bossKills = (progression.bossKills || 0) + 1;
        if (progression.bossKills === 1) progression.unlocks.rifle = true;
        if (progression.bossKills === 2) progression.unlocks.dmr = true;
        progression._saveUnlocks?.();
      }
    } catch(_){ }
    try { if (story) story.onBossDeath(bm?.wave || 0); } catch(_) {}
  };
}

// --- Boot editor after world init ---
if ((new URL(window.location.href)).searchParams.get('editor') === '1') {
  try { document.getElementById('hud').style.display = 'none'; } catch(_){}
  try { document.getElementById('center').style.display = 'none'; } catch(_){}
  try { music.stop?.(); } catch(_){}
  // Lazy import already done at top; just start
  import('./editor.js').then(mod => {
    try { mod.startEditor({ THREE, scene, camera, renderer, mats, objects }); } catch(_) {}
  }).catch(_=>{});
}


