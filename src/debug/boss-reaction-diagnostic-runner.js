import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { EnemyManager } from '../enemies.js';
import { APP_VERSION } from '../version.js';
import {
  BOSS_REACTION_ARCHETYPES,
  BOSS_REACTION_SCENARIOS,
  BossReactionMetrics,
  buildBossReactionMatrix,
  buildBossReactionReport,
  isBossScenarioApplicable
} from './boss-reaction-diagnostic.js';

const elements = {
  boss: document.getElementById('bossFilter'),
  scenario: document.getElementById('scenarioFilter'),
  run: document.getElementById('run'),
  stop: document.getElementById('stop'),
  copy: document.getElementById('copyReport'),
  download: document.getElementById('downloadReport'),
  status: document.getElementById('status'),
  elapsed: document.getElementById('elapsed'),
  progress: document.getElementById('progress'),
  rows: document.getElementById('rows'),
  output: document.getElementById('output'),
  pass: document.getElementById('passCount'),
  warn: document.getElementById('warnCount'),
  fail: document.getElementById('failCount'),
  inconclusive: document.getElementById('inconclusiveCount'),
  notApplicable: document.getElementById('notApplicableCount')
};

for (const item of BOSS_REACTION_ARCHETYPES) elements.boss.add(new Option(item.label, item.id));
for (const item of BOSS_REACTION_SCENARIOS) elements.scenario.add(new Option(item.label, item.id));

const params = new URL(location.href).searchParams;
if (params.has('boss')) elements.boss.value = params.get('boss');
if (params.has('scenario')) elements.scenario.value = params.get('scenario');
const speed = THREE.MathUtils.clamp(Number(params.get('speed')) || 8, 0.25, 12);
const autoRun = params.get('autorun') === '1';
const deterministicFrameDriver = params.get('frameDriver') === 'deterministic';
const storedReportView = params.get('storedReport');
const errors = [];
const interruptions = [];
let report = null;
let running = false;
let stopRequested = false;
let runStartedAt = 0;
let hiddenAt = null;

const seededRandom = (seed = 0xb055c0de) => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
};

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

function recordError(error, source = 'runtime') {
  const value = error instanceof Error ? error : new Error(String(error));
  errors.push({
    atMs: round(performance.now() - runStartedAt, 1),
    source,
    name: value.name,
    message: value.message,
    stack: String(value.stack || '').slice(0, 1600)
  });
}

window.addEventListener('error', event => recordError(event.error || event.message, 'window.error'));
window.addEventListener('unhandledrejection', event => recordError(event.reason, 'unhandledrejection'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt != null) {
    interruptions.push({ type: 'tab_hidden', durationMs: round(performance.now() - hiddenAt, 1) });
    hiddenAt = null;
  }
});

const renderer = new THREE.WebGLRenderer({ antialias: params.get('aa') !== '0', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x160f18);
scene.fog = new THREE.Fog(0x160f18, 75, 190);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 240);
camera.position.set(24, 22, 30);
camera.lookAt(0, 1, 3);
scene.add(new THREE.HemisphereLight(0xffe2c2, 0x1b2438, 1.75));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
keyLight.position.set(10, 20, 14);
scene.add(keyLight);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2734, roughness: 0.92, metalness: 0.04 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(180, 90, 0xa46f50, 0x4d3c45);
grid.position.y = 0.01;
scene.add(grid);

const player = new THREE.Group();
player.position.set(0, 1.7, -8);
const playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.45, 0.9, 5, 10),
  new THREE.MeshStandardMaterial({ color: 0x56d9ff, emissive: 0x08364c })
);
player.add(playerMesh);
scene.add(player);

const mats = {
  floor: floorMaterial,
  wall: new THREE.MeshLambertMaterial({ color: 0xc27b52 }),
  crate: new THREE.MeshLambertMaterial({ color: 0x8c563d }),
  enemy: new THREE.MeshLambertMaterial({ color: 0xef4444 }),
  head: new THREE.MeshLambertMaterial({ color: 0x111827 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffc15c }),
  tracer: new THREE.LineBasicMaterial({ color: 0xffffff }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffaa00 })
};

const objects = [];
let activeObstacle = null;
let currentDefinition = null;
let targetRoot = null;
let bossInstance = null;
let metrics = null;
let scenarioElapsed = 0;
let resultRows = new Map();
let bossUpdatesThisTick = 0;
let bossMovementBlockedThisTick = false;
let bossBlockedBySelfOwnedAuxiliaryThisTick = false;
let bossMovementBlockerTypeThisTick = null;
let phaseTriggerApplied = false;
let gateProbe = null;
let gateSolved = false;
let closePressureApplied = false;

const playerForward = new THREE.Vector3(1, 0, 0);
const getPlayer = () => ({ position: player.position.clone(), forward: playerForward.clone() });
const manager = new EnemyManager(THREE, scene, mats, objects, getPlayer, 40, null, seededRandom());
manager.suspendWaves = true;

manager.onAIEvent = event => {
  if (!metrics || !targetRoot) return;
  const sourceRoot = event.root || null;
  const sourcePosition = event.origin || sourceRoot?.position || targetRoot.position;
  const blockerRoot = event.blockerRoot || null;
  const blockerOwnedByBoss = !!blockerRoot && (
    blockerRoot.userData?.bossOwnerRoot === targetRoot
    || blockerRoot.userData?.summonerRoot === targetRoot
  );
  if (sourceRoot === targetRoot && event.type === 'movement_blocked') {
    bossMovementBlockedThisTick = true;
    bossBlockedBySelfOwnedAuxiliaryThisTick ||= blockerOwnedByBoss;
    bossMovementBlockerTypeThisTick = blockerRoot?.userData?.type || event.blockedBy || 'unknown';
  }
  metrics.recordAIEvent(scenarioElapsed * 1000, {
    ...event,
    sourceType: sourceRoot?.userData?.type || event.enemyId || 'unknown',
    sourceRole: sourceRoot === targetRoot ? 'boss' : 'auxiliary',
    worldVisible: hasLineOfSight(sourcePosition, player.position),
    blockerType: blockerRoot?.userData?.type || null,
    blockerOwnership: blockerOwnedByBoss ? 'self_owned_auxiliary' : (blockerRoot ? 'other_actor' : null)
  });
};

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function hasLineOfSight(from, to) {
  if (!objects.length) return true;
  const origin = from.clone().add(new THREE.Vector3(0, 0.9, 0));
  const direction = to.clone().sub(origin);
  const distance = direction.length();
  if (distance <= 0.001) return true;
  const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, Math.max(0, distance - 0.05));
  return raycaster.intersectObjects(objects, false).length === 0;
}

function addBossWall() {
  if (activeObstacle || !targetRoot) return;
  const midpoint = player.position.clone().add(targetRoot.position).multiplyScalar(0.5);
  activeObstacle = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 1.2), mats.wall);
  activeObstacle.position.set(midpoint.x, 3, midpoint.z);
  activeObstacle.userData.diagnosticObstacleKind = 'boss_wall';
  scene.add(activeObstacle);
  objects.push(activeObstacle);
  manager.refreshColliders(objects);
}

function removeBossWall() {
  if (!activeObstacle) return;
  scene.remove(activeObstacle);
  const index = objects.indexOf(activeObstacle);
  if (index >= 0) objects.splice(index, 1);
  activeObstacle.geometry?.dispose?.();
  activeObstacle = null;
  manager.refreshColliders(objects);
}

function clearBossScenario() {
  removeBossWall();
  try { manager.bossManager?.boss?.onRemoved?.(scene); } catch (error) { recordError(error, 'boss-cleanup'); }
  manager.reset();
  manager.suspendWaves = true;
  manager.customSpawnPoints = null;
  manager._enemyRootsArr.length = 0;
  manager._rootIndex = new WeakMap();
  manager.instanceByRoot = new WeakMap();
  manager._ctx = null;
  currentDefinition = null;
  targetRoot = null;
  bossInstance = null;
  metrics = null;
  gateProbe = null;
  closePressureApplied = false;
}

function bossState(instance) {
  if (!instance) return 'missing';
  if (instance._attackState && instance._attackState !== 'idle') return `attack_${instance._attackState}`;
  if (instance._beamState && instance._beamState !== 'idle') return `beam_${instance._beamState}`;
  if (instance._jumpState && instance._jumpState !== 'idle') return `jump_${instance._jumpState}`;
  if (instance._meleeState && instance._meleeState !== 'idle') return `melee_${instance._meleeState}`;
  if (instance._burrowPhase) return `burrow_${instance._burrowPhase}`;
  if (instance._cloneCast) return `cast_${instance._cloneCast.kind || 'clone'}`;
  if (instance._burstActive) return 'volley_burst';
  if ((instance.telegraphTime || 0) > 0 || (instance._telegraphTime || 0) > 0
    || ((instance._teleTime || 0) > 0 && !!instance._teleData)) return 'telegraph';
  if ((instance._phaseTelegraph || 0) > 0) return 'phase_telegraph';
  return 'idle';
}

function bossCombatSnapshot(instance) {
  const state = bossState(instance);
  const telegraphActive = state.includes('windup')
    || state === 'telegraph'
    || state === 'phase_telegraph'
    || state === 'burrow_sink'
    || state.startsWith('cast_')
    || !!instance?._telegraph
    || (manager.bossManager.telegraphTime || 0) > 0;
  const attackActive = ['attack_sweep', 'attack_active', 'beam_sweep', 'beam_burst', 'melee_active', 'volley_burst'].includes(state)
    || state.startsWith('jump_active')
    || !!instance?._burstActive;
  return { state, telegraphActive, attackActive };
}

function scenarioAuxiliaries() {
  if (!targetRoot) return [];
  return Array.from(manager.enemies).filter(root => root !== targetRoot);
}

function removeObjectiveRoot(root) {
  if (root && manager.enemies.has(root)) manager.remove(root);
}

function solveBossObjectives(instance) {
  if (currentDefinition.archetype.id === 'sanitizer') {
    for (const root of [...(instance.nodes?.roots || [])]) removeObjectiveRoot(root);
    return true;
  }
  if (currentDefinition.archetype.id === 'algorithm') {
    for (const node of [...(instance.nodes || [])]) removeObjectiveRoot(node.root);
    return true;
  }
  return false;
}

function setBossHpRatio(instance, ratio) {
  const root = instance.root;
  const maximum = Number(instance.maxHp || root.userData.maxHp || root.userData.hp) || 1;
  const current = Number(root.userData.hp) || maximum;
  const desired = maximum * ratio;
  const multiplier = Math.max(1, Number(root.userData.damageMul) || 1);
  root.userData.hp = current - Math.max(0, current - desired) / multiplier;
}

function applyPhaseTrigger() {
  if (phaseTriggerApplied || !bossInstance || !metrics) return;
  const kind = currentDefinition.archetype.phaseTrigger;
  phaseTriggerApplied = true;
  metrics.phaseTriggerApplied = true;
  if (currentDefinition.scenario.id === 'summon_coordination') metrics.summonOpportunityApplied = true;
  if (kind === 'remove_suppression_nodes') {
    solveBossObjectives(bossInstance);
  } else if (kind === 'solve_control') {
    solveBossObjectives(bossInstance);
    setBossHpRatio(bossInstance, 0.62);
  } else if (kind === 'hp_55') {
    setBossHpRatio(bossInstance, 0.55);
  } else if (kind === 'hp_65') {
    setBossHpRatio(bossInstance, 0.65);
  }
  metrics.addEvent(scenarioElapsed * 1000, 'phase_trigger_applied', { kind });
}

function beginDamageProbe(kind) {
  const before = Number(targetRoot?.userData?.hp);
  if (!Number.isFinite(before)) return;
  targetRoot.userData.hp = before - 100;
  gateProbe = { kind, before };
}

function finishDamageProbe() {
  if (!gateProbe || !metrics || !targetRoot) return;
  const accepted = Math.max(0, gateProbe.before - Number(targetRoot.userData.hp));
  if (gateProbe.kind === 'locked') {
    metrics.objectiveGateTested = true;
    metrics.lockedDamageAccepted = accepted;
  } else {
    metrics.objectiveUnlockTested = true;
    metrics.unlockedDamageAccepted = accepted;
  }
  metrics.addEvent(scenarioElapsed * 1000, 'objective_damage_probe', { kind: gateProbe.kind, accepted: round(accepted) });
  gateProbe = null;
}

function setupBossScenario(definition) {
  clearBossScenario();
  currentDefinition = definition;
  scenarioElapsed = 0;
  phaseTriggerApplied = false;
  gateSolved = false;
  closePressureApplied = false;
  player.position.set(0, 1.7, -8);
  playerForward.set(1, 0, 0);
  manager.customSpawnPoints = [new THREE.Vector3(0, 0.8, player.position.z + definition.archetype.spawnDistance)];
  if (!manager.bossManager.startBoss(definition.archetype.wave)) throw new Error(`Boss wave ${definition.archetype.wave} did not start`);
  bossInstance = manager.bossManager.boss;
  targetRoot = bossInstance?.root;
  if (!targetRoot) throw new Error(`Boss ${definition.archetype.id} has no root`);
  targetRoot.userData.diagnosticActorId = 'boss_primary';

  const originalUpdate = bossInstance.update.bind(bossInstance);
  bossInstance.update = (dt, ctx) => {
    bossUpdatesThisTick++;
    return originalUpdate(dt, ctx);
  };

  if (definition.scenario.obstacleKind === 'boss_wall') addBossWall();
  const initialAuxiliaries = scenarioAuxiliaries().length;
  metrics = new BossReactionMetrics({
    bossId: definition.archetype.id,
    scenarioId: definition.scenario.id,
    startPosition: targetRoot.position,
    initialPlayerDistance: horizontalDistance(targetRoot.position, player.position),
    initialAuxiliaries,
    preferredMinimumDistance: manager._profileForRoot(targetRoot).preferredRange?.[0] || 0
  });
  metrics.addEvent(0, 'scenario_started', {
    boss: definition.archetype.id,
    wave: definition.archetype.wave,
    scenario: definition.scenario.id,
    initialAuxiliaries
  });
}

function updateBossScenario(dt) {
  scenarioElapsed += dt;
  const scenario = currentDefinition.scenario;
  if (scenario.movingPlayer) player.position.x = Math.sin(scenarioElapsed * 1.05) * 7;
  if (scenario.closeAtSeconds && scenarioElapsed >= scenario.closeAtSeconds && !closePressureApplied) {
    const profile = manager._profileForRoot(targetRoot);
    const closeDistance = profile.collisionRadius + 0.75;
    const closeDirection = new THREE.Vector3(1, 0, -0.3).normalize().multiplyScalar(closeDistance);
    player.position.set(targetRoot.position.x + closeDirection.x, 1.7, targetRoot.position.z + closeDirection.z);
    closePressureApplied = true;
    metrics.addEvent(scenarioElapsed * 1000, 'player_closed_range');
  }
  playerForward.copy(targetRoot.position).sub(player.position).setY(0).normalize();

  if (scenario.id === 'phase_transition' && scenarioElapsed >= scenario.triggerAtSeconds) applyPhaseTrigger();
  if (scenario.id === 'summon_coordination' && currentDefinition.archetype.phaseTrigger && scenarioElapsed >= 2.5) {
    applyPhaseTrigger();
    metrics.summonOpportunityApplied = true;
  }
  if (scenario.id === 'objective_gating') {
    if (!metrics.objectiveGateTested && !gateProbe && scenarioElapsed >= 1) beginDamageProbe('locked');
    if (!gateSolved && scenarioElapsed >= 3) {
      gateSolved = solveBossObjectives(bossInstance);
      metrics.addEvent(scenarioElapsed * 1000, 'objective_solved', { solved: gateSolved });
    }
    if (gateSolved && !metrics.objectiveUnlockTested && !gateProbe && scenarioElapsed >= 4) beginDamageProbe('unlocked');
  }

  bossUpdatesThisTick = 0;
  bossMovementBlockedThisTick = false;
  bossBlockedBySelfOwnedAuxiliaryThisTick = false;
  bossMovementBlockerTypeThisTick = null;
  manager.tickAI(player, dt, (damage, source, attribution = {}) => {
    const sourceRoot = attribution.sourceRoot || attribution.ownerRoot || targetRoot;
    const sourcePosition = attribution.sourceOrigin || sourceRoot?.position || targetRoot.position;
    const sourceKind = attribution.sourceKind || source || 'enemy';
    const directLine = /projectile|beam|volley|shot|barrage|cross_burst/i.test(sourceKind);
    const sourceRole = sourceRoot === targetRoot ? 'boss' : 'auxiliary';
    const requiresTelegraph = sourceRole === 'boss'
      && !/tile|mine|ad_zone|damage_zone|environment/i.test(sourceKind);
    metrics.recordDamage(scenarioElapsed * 1000, damage, {
      worldVisible: hasLineOfSight(sourcePosition, player.position),
      sourceType: sourceRoot?.userData?.type || source || 'boss',
      sourceRole,
      sourceKind,
      directLine,
      requiresTelegraph
    });
  });
  finishDamageProbe();

  const distance = horizontalDistance(targetRoot.position, player.position);
  const toPlayer = player.position.clone().sub(targetRoot.position).setY(0);
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(targetRoot.quaternion).setY(0);
  const tracking = toPlayer.lengthSq() > 1e-5 && facing.lengthSq() > 1e-5
    && facing.normalize().dot(toPlayer.normalize()) > 0.35;
  const combat = bossCombatSnapshot(bossInstance);
  const collisionProfile = manager._profileForRoot(targetRoot);
  const solidContactDistance = collisionProfile.collisionRadius + 0.6;
  const preferredMinimumDistance = collisionProfile.preferredRange?.[0] || 0;
  metrics.observeTick({
    atMs: scenarioElapsed * 1000,
    dt,
    position: targetRoot.position,
    playerDistance: distance,
    tracking,
    overlappingPlayer: distance < solidContactDistance,
    penetratingPlayer: distance < solidContactDistance - 0.04,
    insidePreferredMinimum: preferredMinimumDistance > 0 && distance < preferredMinimumDistance,
    worldVisible: hasLineOfSight(targetRoot.position, player.position),
    updatesThisTick: bossUpdatesThisTick,
    telegraphActive: combat.telegraphActive,
    attackActive: combat.attackActive,
    state: combat.state,
    phase: bossInstance.phase ?? null,
    phaseLabel: targetRoot.userData.phaseLabel || null,
    movementBlocked: bossMovementBlockedThisTick,
    blockedBySelfOwnedAuxiliary: bossBlockedBySelfOwnedAuxiliaryThisTick,
    movementBlockerType: bossMovementBlockerTypeThisTick,
    auxiliaries: scenarioAuxiliaries()
  });
}

function renderRows(matrix) {
  elements.rows.innerHTML = '';
  resultRows = new Map();
  for (const item of matrix) {
    const row = document.createElement('tr');
    row.dataset.state = 'pending';
    row.innerHTML = `<td>${item.archetype.label}</td><td>${item.scenario.label}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>Pending</td>`;
    elements.rows.appendChild(row);
    resultRows.set(item.id, row);
  }
}

function updateResultRow(definition, result) {
  const row = resultRows.get(definition.id);
  if (!row) return;
  row.dataset.state = result.assessment.status;
  row.children[2].textContent = String(result.metrics.attackStarts + result.metrics.bossActionEvents);
  row.children[3].textContent = round(result.metrics.damageTotal).toString();
  row.children[4].textContent = String(result.metrics.telegraphStarts);
  row.children[5].textContent = String(Math.max(result.metrics.phaseTransitions, result.metrics.phaseLabelTransitions));
  row.children[6].textContent = result.assessment.summary;
  row.title = result.assessment.findings.map(item => `${item.severity.toUpperCase()}: ${item.message}`).join('\n') || 'No findings';
}

function updateSummary(results) {
  const counts = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 };
  for (const result of results) counts[result.assessment.status]++;
  elements.pass.textContent = `Pass ${counts.pass}`;
  elements.warn.textContent = `Warn ${counts.warn}`;
  elements.fail.textContent = `Fail ${counts.fail}`;
  elements.inconclusive.textContent = `Inconclusive ${counts.inconclusive}`;
  elements.notApplicable.textContent = `N/A ${counts.not_applicable}`;
}

let syntheticFrameAt = performance.now();
function nextFrame() {
  if (deterministicFrameDriver) {
    return new Promise(resolve => setTimeout(() => {
      syntheticFrameAt += 50;
      resolve(syntheticFrameAt);
    }, 0));
  }
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function runDiagnostic() {
  if (running) return;
  running = true;
  stopRequested = false;
  report = null;
  errors.length = 0;
  interruptions.length = 0;
  runStartedAt = performance.now();
  const startedAt = new Date().toISOString();
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.boss.disabled = true;
  elements.scenario.disabled = true;
  elements.copy.disabled = true;
  elements.download.disabled = true;
  elements.output.classList.remove('ready');
  const matrix = buildBossReactionMatrix({ boss: elements.boss.value || null, scenario: elements.scenario.value || null });
  renderRows(matrix);
  const results = [];

  try {
    for (let index = 0; index < matrix.length; index++) {
      if (stopRequested) break;
      const definition = matrix[index];
      setupBossScenario(definition);
      const row = resultRows.get(definition.id);
      row.dataset.state = 'running';
      row.scrollIntoView({ block: 'nearest' });
      elements.status.textContent = `${definition.archetype.label}: ${definition.scenario.label}`;
      let accumulator = 0;
      let lastAt = await nextFrame();
      while (scenarioElapsed < definition.scenario.durationSeconds && !stopRequested) {
        const now = await nextFrame();
        if (document.hidden) { lastAt = now; continue; }
        const realDt = Math.min(0.05, Math.max(0.001, (now - lastAt) / 1000));
        lastAt = now;
        accumulator += realDt * speed;
        while (accumulator >= 1 / 60) {
          updateBossScenario(1 / 60);
          accumulator -= 1 / 60;
        }
        renderer.render(scene, camera);
        elements.elapsed.textContent = `${((now - runStartedAt) / 1000).toFixed(1)}s`;
        elements.progress.style.width = `${((index + scenarioElapsed / definition.scenario.durationSeconds) / matrix.length) * 100}%`;
      }
      if (stopRequested) {
        interruptions.push({
          type: 'user_stopped',
          atMs: round(performance.now() - runStartedAt, 1),
          bossId: definition.archetype.id,
          scenarioId: definition.scenario.id
        });
        break;
      }
      metrics.addEvent(scenarioElapsed * 1000, 'scenario_completed');
      const result = metrics.finish();
      results.push(result);
      updateResultRow(definition, result);
      updateSummary(results);
    }
  } catch (error) {
    recordError(error, currentDefinition?.id || 'boss-diagnostic');
  } finally {
    clearBossScenario();
    report = buildBossReactionReport({
      environment: {
        appVersion: APP_VERSION,
        page: 'test-boss-reactions.html',
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio: window.devicePixelRatio || 1,
        renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
        simulationHz: 60,
        timeScale: speed,
        frameDriver: deterministicFrameDriver ? 'deterministic-ci' : 'requestAnimationFrame',
        bossFilter: elements.boss.value || null,
        scenarioFilter: elements.scenario.value || null,
        deterministicSeed: '0xb055c0de'
      },
      startedAt,
      completedAt: new Date().toISOString(),
      results,
      errors,
      interruptions
    });
    elements.output.value = JSON.stringify(report);
    elements.output.classList.add('ready');
    elements.copy.disabled = false;
    elements.download.disabled = false;
    elements.run.disabled = false;
    elements.stop.disabled = true;
    elements.boss.disabled = false;
    elements.scenario.disabled = false;
    if (!stopRequested) elements.progress.style.width = '100%';
    elements.status.textContent = stopRequested
      ? 'Stopped — partial boss report ready'
      : (errors.length ? 'Partial boss report ready — runtime errors captured' : 'Boss report ready — review findings or copy JSON');
    window.__bossReactionDiagnosticReport = report;
    window.__bossReactionDiagnosticDone = true;
    try { localStorage.setItem('qoj.bossReaction.lastReport', elements.output.value); } catch (error) { recordError(error, 'report-persistence'); }
    console.info('Boss reaction diagnostic report', report);
    running = false;
  }
}

elements.run.addEventListener('click', runDiagnostic);
elements.stop.addEventListener('click', () => {
  if (!running) return;
  stopRequested = true;
  elements.stop.disabled = true;
  elements.status.textContent = 'Stopping…';
});
elements.boss.addEventListener('change', () => {
  const bossId = elements.boss.value;
  for (const option of elements.scenario.options) {
    if (!option.value) continue;
    option.disabled = !!bossId && !isBossScenarioApplicable(bossId, option.value);
  }
  if (elements.scenario.selectedOptions[0]?.disabled) elements.scenario.value = '';
});
elements.boss.dispatchEvent(new Event('change'));
elements.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(elements.output.value); }
  catch { elements.output.focus(); elements.output.select(); document.execCommand('copy'); }
  elements.copy.textContent = 'Copied';
  setTimeout(() => { elements.copy.textContent = 'Copy JSON'; }, 1200);
});
elements.download.addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([elements.output.value], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `qoj-boss-reactions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (storedReportView) {
  const pre = document.createElement('pre');
  pre.id = 'storedBossReactionReport';
  const stored = localStorage.getItem('qoj.bossReaction.lastReport') || '{}';
  if (storedReportView === 'summary') {
    try {
      const parsed = JSON.parse(stored);
      pre.textContent = JSON.stringify({ environment: parsed.environment, summary: parsed.summary, errors: parsed.errors }, null, 2);
    } catch {
      pre.textContent = '{}';
    }
  } else {
    pre.textContent = stored;
  }
  document.body.replaceChildren(pre);
} else {
  renderer.render(scene, camera);
  if (autoRun) runDiagnostic();
}
