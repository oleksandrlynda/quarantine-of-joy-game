import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { StrikeAdjudicator } from '../src/bosses/adjudicator.js';
import { AlgorithmBoss } from '../src/bosses/algorithm.js';
import { Broodmaker } from '../src/bosses/broodmaker.js';
import { Captain } from '../src/bosses/captain.js';
import { Sanitizer } from '../src/bosses/sanitizer.js';
import { ShardAvatar } from '../src/bosses/shard.js';
import { GooPuddle } from '../src/hazards/goo.js';

const mats = { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) };

function eventSink(events) {
  return (root, type, data = {}) => events.push({ root, type, ...data });
}

function makeAlgorithmManager() {
  const scene = new THREE.Scene();
  const enemies = new Set();
  const instances = new Set();
  const instanceByRoot = new Map();
  return {
    scene, enemies, instances, instanceByRoot,
    registerExternalEnemy(instance) {
      scene.add(instance.root);
      enemies.add(instance.root);
      instances.add(instance);
      instanceByRoot.set(instance.root, instance);
    },
    remove(root) {
      const instance = instanceByRoot.get(root);
      enemies.delete(root);
      instances.delete(instance);
      instanceByRoot.delete(root);
      scene.remove(root);
      instance?.onRemoved?.(scene);
    }
  };
}

test('Adjudicator bailiff scheduler summons on cadence without a frame-probability lottery', () => {
  const scene = new THREE.Scene();
  const instances = new Set();
  const instanceByRoot = new Map();
  const spawned = [];
  const enemyManager = {
    scene, instances, instanceByRoot,
    spawnAt(type, position) {
      const root = new THREE.Group();
      root.position.copy(position);
      root.userData = { type };
      const instance = { root };
      instances.add(instance);
      instanceByRoot.set(root, instance);
      spawned.push(root);
      return root;
    }
  };
  const boss = new StrikeAdjudicator({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0), enemyManager, rng: () => 0.5
  });
  boss._addCooldown = 0;
  boss._strikeTimer = 999;
  boss._verdictTimer = 999;
  const events = [];
  boss.update(0.016, {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, 4) },
    objects: [],
    blackboard: {},
    moveWithCollisions(root, step) { root.position.add(step); },
    emitAIEvent: eventSink(events)
  });

  assert.equal(spawned.length, 1);
  assert.equal(instanceByRoot.get(spawned[0]).summoner, boss);
  assert.ok(events.some(event => event.type === 'boss_add_spawned' && event.ability === 'citation_bailiff'));
});

test('Sanitizer jump wave travels toward its target before resolving the landing arc', () => {
  const boss = Object.assign(Object.create(Sanitizer.prototype), {
    THREE,
    root: new THREE.Group(),
    rng: () => 0.5,
    _jumpCd: 0,
    _jumpState: 'idle',
    _jumpTimer: 0,
    _jumpDir: new THREE.Vector3(0, 0, 1),
    _jumpVel: 0,
    _jumpHorizontalSpeed: 12,
    _jumpTravelRemaining: 0,
    _pulseState: 'idle',
    _beamState: 'idle'
  });
  boss.root.position.set(0, 0.8, 0);
  const events = [];
  let damage = 0;
  const ctx = {
    player: { position: new THREE.Vector3(0, 1.7, 20) },
    moveWithCollisions(root, step) { root.position.add(step); },
    onPlayerDamage(amount) { damage += amount; },
    emitAIEvent: eventSink(events)
  };

  boss._maybeJumpWave(0.01, ctx);
  boss._maybeJumpWave(0.35, ctx);
  ctx.player.position.x = 6;
  for (let i = 0; i < 12 && boss._jumpState === 'air'; i++) boss._maybeJumpWave(0.1, ctx);

  assert.ok(boss.root.position.z >= 6, 'jump must include horizontal travel');
  assert.ok(boss.root.position.distanceTo(ctx.player.position) >= 13, 'jump must preserve the ranged band');
  assert.equal(damage, 18);
  assert.ok(events.some(event => event.type === 'ability_started' && event.ability === 'sanitizer_jump_wave'));
  assert.ok(events.some(event => event.type === 'ability_released' && event.hitPlayer === true));
});

test('Sanitizer does not start a beam during a jump and retreats beyond its range hysteresis', () => {
  const boss = Object.assign(Object.create(Sanitizer.prototype), {
    THREE,
    root: new THREE.Group(),
    phase: 1,
    speed: 1.8,
    _yaw: 0,
    _moveDelta: new THREE.Vector3(),
    _emergencyRetreatActive: true,
    _jumpState: 'air',
    _pulseState: 'idle',
    _beamState: 'idle',
    _beamCd: 0,
    _raycaster: new THREE.Raycaster()
  });
  boss.root.position.set(0, 0.8, 0);
  const ctx = {
    player: { position: new THREE.Vector3(0, 1.7, 13.5) },
    objects: [],
    moveWithCollisions(root, step) { root.position.add(step); }
  };

  boss._updateBeam(0.1, ctx);
  assert.equal(boss._beamState, 'idle');

  boss._jumpState = 'idle';
  const before = boss.root.position.distanceTo(ctx.player.position);
  boss._updateMovement(0.5, ctx);
  assert.ok(boss.root.position.distanceTo(ctx.player.position) > before);
  assert.equal(boss._emergencyRetreatActive, true, 'retreat should remain active until 14.5 units');
});

test('Sanitizer beam damage and visible length stop at solid world cover', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const tip = new THREE.Object3D();
  tip.position.set(0, 1.7, 0);
  root.add(tip);
  scene.add(root);
  root.updateMatrixWorld(true);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.5), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.7, 4);
  scene.add(wall);
  wall.updateMatrixWorld(true);
  const boss = Object.assign(Object.create(Sanitizer.prototype), {
    THREE, root, refs: { tip }, _raycaster: new THREE.Raycaster(),
    _beamDir: new THREE.Vector3(0, 0, 1), _beamLen: 18,
    _beamHalfAngle: Math.PI / 12, _beamMesh: null
  });
  let damage = 0;
  const events = [];
  const ctx = {
    scene, objects: [wall], player: { position: new THREE.Vector3(0, 1.7, 8) },
    onPlayerDamage(amount) { damage += amount; }, emitAIEvent: eventSink(events)
  };

  boss._ensureBeamMesh(ctx);
  boss._updateBeamMeshTransform(ctx);
  boss._applyBeamDamage(0.5, ctx, 15);
  assert.equal(damage, 0);
  assert.ok(boss._beamMesh.scale.y < 0.3, 'the rendered beam should end at the wall instead of continuing through it');
  assert.ok(events.some(event => event.type === 'beam_blocked_by_world'));
  boss._beamMesh.material.dispose();
  wall.geometry.dispose();
  wall.material.dispose();
});

test('Sanitizer beam stops at production collision boxes without raycastable wall faces', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const tip = new THREE.Object3D();
  tip.position.set(0, 1.7, 0);
  root.add(tip);
  scene.add(root);
  root.updateMatrixWorld(true);
  const boss = Object.assign(Object.create(Sanitizer.prototype), {
    THREE, root, refs: { tip }, _raycaster: new THREE.Raycaster(),
    _beamDir: new THREE.Vector3(0, 0, 1), _beamLen: 18,
    _beamHalfAngle: Math.PI / 12, _beamMesh: null
  });
  const wallBox = new THREE.Box3(
    new THREE.Vector3(-2, 0, 3.75),
    new THREE.Vector3(2, 4, 4.25)
  );
  let damage = 0;
  const ctx = {
    scene, objects: [],
    enemyManager: { shotBlockers: [], shotObjectBBs: [wallBox] },
    player: { position: new THREE.Vector3(0, 1.7, 8) },
    onPlayerDamage(amount) { damage += amount; }
  };

  boss._ensureBeamMesh(ctx);
  boss._updateBeamMeshTransform(ctx);
  boss._applyBeamDamage(0.5, ctx, 15);
  assert.equal(damage, 0);
  assert.ok(boss._beamMesh.scale.y < 0.25);
  boss._beamMesh.material.dispose();
});

test('Sanitizer Mine Fountain leaves escape lanes and limits a stationary player to one mine hit', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(0, 0.8, 0);
  scene.add(root);
  const boss = Object.assign(Object.create(Sanitizer.prototype), {
    THREE, root, refs: {}, rng: () => 0, phase: 1,
    _mineFountainState: 'windup', _mineFountainTimer: 0,
    _mineFountainCd: 0, _mineProjectiles: [], _mineZones: []
  });
  const events = [];
  const damage = [];
  const ctx = {
    scene, player: { position: new THREE.Vector3(0, 1.7, 10) },
    damagePlayer: (amount, attribution) => damage.push({ amount, attribution }),
    emitAIEvent: eventSink(events)
  };

  boss._releaseMineFountain(ctx);
  assert.equal(boss._mineProjectiles.length, 5);
  boss._updateMineProjectiles(1, ctx);
  assert.equal(boss._mineZones.length, 5);
  const centerMine = boss._mineZones.find(mine => mine.index === 0);
  const outerDistances = boss._mineZones.filter(mine => mine.index !== 0)
    .map(mine => mine.position.distanceTo(centerMine.position));
  assert.ok(outerDistances.every(distance => Math.abs(distance - 4.4) < 0.001));
  boss._updateMineZones(1, ctx);
  assert.equal(damage.length, 1);
  assert.equal(damage[0].amount, 14);
  assert.equal(damage[0].attribution.sourceKind, 'sanitizer_mine_fountain');
  assert.equal(events.filter(event => event.type === 'ability_resolved'
    && event.ability === 'sanitizer_mine_fountain').length, 5);
  boss._clearMineFountain(scene);
});

test('Algorithm Logic Pulse telegraphs, releases, damages, and clears its transient visual', () => {
  const manager = makeAlgorithmManager();
  const boss = new AlgorithmBoss({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0), enemyManager: manager, rng: () => 0.5
  });
  manager.registerExternalEnemy(boss);
  boss._logicPulseCooldown = 0;
  boss._attackCooldown = 99;
  const events = [];
  const damage = [];
  const ctx = {
    player: { position: new THREE.Vector3(0, 1.6, 12) },
    scene: manager.scene,
    objects: [],
    blackboard: { time: 1 },
    damagePlayer(amount, metadata) { damage.push({ amount, metadata }); },
    emitAIEvent: eventSink(events)
  };

  boss.update(0.01, ctx);
  assert.equal(boss._logicPulse?.variant, 'control_lanes');
  ctx.blackboard.time += 1;
  boss.update(1, ctx);

  assert.equal(boss._logicPulse, null);
  assert.equal(damage.length, 1);
  assert.match(damage[0].metadata.sourceKind, /^algorithm_logic_pulse_/);
  assert.ok(events.some(event => event.type === 'ability_started' && event.ability === 'algorithm_logic_pulse'));
  assert.ok(events.some(event => event.type === 'ability_released' && event.hitPlayer === true));

  boss.phase = 2;
  boss.echoes = new Set([{
    correct: true,
    root: { position: new THREE.Vector3(5, 0.4, 5) }
  }]);
  boss._beginLogicPulse(ctx);
  assert.equal(boss._logicPulse.variant, 'offbeat_echo');
  boss._clearLogicPulse(manager.scene);

  boss.phase = 3;
  ctx.player.position.set(0, 1.6, 24);
  boss._beginLogicPulse(ctx);
  assert.equal(boss._logicPulse.variant, 'collapse_ring');
  assert.equal(boss._logicPulse.radius, 24, 'Phase 3 should reach the cathedral processional cover');
  assert.equal(typeof boss._logicPulse.inward, 'boolean');
  assert.ok(events.some(event => event.type === 'ability_started' && event.ability === 'algorithm_collapse_ring'));
  boss._clearLogicPulse(manager.scene);
  boss.echoes.clear();
  boss.onRemoved(manager.scene);
});

test('Heavy Broodmaker toxic goo slows and deals attributable Phase 2 damage', () => {
  const scene = new THREE.Scene();
  const owner = new THREE.Group();
  owner.userData.type = 'boss_broodmaker_heavy';
  const puddle = new GooPuddle({
    THREE, mats, position: new THREE.Vector3(0, 0, 0),
    radius: 3.2, playerSlowMultiplier: 0.58,
    damagePerSecond: 6, damageTickSeconds: 0.75,
    sourceRoot: owner, sourceKind: 'broodmaker_toxic_goo', toxic: true
  });
  scene.add(puddle.root);
  const player = { position: new THREE.Vector3(1, 1.7, 0) };
  const previous = new THREE.Vector3(0, 1.7, 0);
  const damage = [];
  const events = [];
  const ctx = {
    scene, player,
    damagePlayer(amount, attribution) { damage.push({ amount, attribution }); },
    emitAIEvent: eventSink(events)
  };

  puddle.update(0.4, ctx, previous, 1);
  player.position.set(2, 1.7, 0);
  puddle.update(0.75, ctx, previous, 2);

  assert.ok(player.position.x < 2, 'toxic goo should apply the stronger heavy-boss slow');
  assert.equal(damage.length, 1);
  assert.equal(damage[0].amount, 4.5);
  assert.equal(damage[0].attribution.sourceKind, 'broodmaker_toxic_goo');
  assert.ok(events.some(event => event.type === 'ability_resolved' && event.hitPlayer === true));
  puddle.dispose(scene);
});

test('Shard Mirage Flank withholds its precision shard when cover still blocks the new angle', () => {
  const scene = new THREE.Scene();
  const boss = new ShardAvatar({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0), enemyManager: null, rng: () => 0.5
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.5), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, 5);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  boss._flankState = 'windup';
  boss._flankTimer = 0.59;
  boss._flankTarget.set(0, 1.7, 10);
  const events = [];

  boss._updateMirageFlank(0.02, {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, 10) },
    objects: [wall],
    emitAIEvent: eventSink(events)
  });

  assert.equal(boss.projectiles.length, 0);
  assert.ok(events.some(event => event.type === 'shot_withheld' && event.ability === 'shard_mirage_flank'));
  assert.ok(events.some(event => event.type === 'ability_released' && event.worldBlocked === true));
  boss.onRemoved(scene);
});

test('Shard Mirage Flank searches far enough around a wide wall to obtain a clear firing ray', () => {
  const scene = new THREE.Scene();
  const boss = new ShardAvatar({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 16), enemyManager: null, rng: () => 0.5
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 1.2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 3, 4);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  const events = [];
  const ctx = {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, -8) },
    objects: [wall],
    positionClear: () => true,
    moveWithCollisions(root, step) { root.position.add(step); },
    emitAIEvent: eventSink(events)
  };

  boss._beginMirageFlank(ctx);
  assert.ok(Math.abs(boss._flankDestination.x) >= 18);
  for (let i = 0; i < 30 && boss._flankState !== 'idle'; i++) boss._updateMirageFlank(0.05, ctx);

  assert.equal(boss.projectiles.length, 1);
  assert.ok(events.some(event => event.type === 'ability_released'
    && event.ability === 'shard_mirage_flank' && event.worldBlocked === false));
  boss.onRemoved(scene);
});

test('light Broodmaker Resin Spit creates direct boss pressure and a temporary slow puddle', () => {
  const scene = new THREE.Scene();
  const boss = new Broodmaker({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0), enemyManager: null, rng: () => 0.5
  });
  boss._resinCooldown = 0;
  const events = [];
  let damage = 0;
  const ctx = {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, 15) },
    objects: [],
    blackboard: {},
    onPlayerDamage(amount) { damage += amount; },
    emitAIEvent: eventSink(events)
  };

  boss._updateResinSpit(0.1, ctx);
  assert.ok(boss._resinSpit);
  boss._updateResinSpit(0.75, ctx);

  assert.equal(damage, 12);
  assert.equal(boss._resinPuddles.length, 1);
  assert.ok(events.some(event => event.type === 'ability_started' && event.ability === 'broodmaker_resin_spit'));
  assert.ok(events.some(event => event.type === 'ability_released' && event.hitPlayer === true));
  boss.onRemoved(scene);
});

test('Broodmaker converts sustained world collision rejection into a burrow escape', () => {
  const scene = new THREE.Scene();
  const boss = new Broodmaker({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0), enemyManager: null, rng: () => 0.5
  });
  boss._burrowCooldown = 999;
  boss._resinCooldown = 999;
  const events = [];
  const ctx = {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, 20) },
    objects: [],
    moveWithCollisions(_root, step) {
      return { blockedBy: 'world', requestedDistance: step.length(), appliedDistance: 0 };
    },
    emitAIEvent: eventSink(events)
  };

  for (let i = 0; i < 20 && !boss._burrowPhase; i++) boss.update(0.1, ctx);

  assert.equal(boss._burrowPhase, 'sink');
  assert.ok(events.some(event => event.type === 'broodmaker_stuck_escape_armed'));
  assert.ok(events.some(event => event.type === 'ability_started'
    && event.ability === 'broodmaker_burrow' && event.reason === 'world_blocked'));
  boss.onRemoved(scene);
});

test('Captain Callout Reposition moves laterally and fires one precision bolt', () => {
  const scene = new THREE.Scene();
  const boss = new Captain({
    THREE, mats, spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: { _isSpawnAreaClear: () => true }, rng: () => 0.5
  });
  boss._calloutCooldown = 0;
  const events = [];
  const ctx = {
    scene,
    player: { position: new THREE.Vector3(0, 1.7, 5) },
    objects: [],
    moveWithCollisions(root, step) { root.position.add(step); },
    tacticalLineClear: () => ({ clear: true, worldClear: true }),
    emitAIEvent: eventSink(events)
  };

  boss._updateCalloutReposition(0.01, ctx);
  boss._updateCalloutReposition(0.4, ctx);
  boss._updateCalloutReposition(0.55, ctx);

  assert.ok(Math.abs(boss.root.position.x) > 2, 'callout should visibly change the firing angle');
  assert.equal(boss._volleyProjectiles.length, 1);
  assert.equal(boss._volleyProjectiles[0].kind, 'captain_callout_reposition');
  assert.ok(events.some(event => event.type === 'ability_released' && event.projectileCount === 1));

  boss._burstActive = true;
  boss._burstTotalShots = 1;
  boss._burstShotsLeft = 1;
  boss._burstTimer = 0;
  boss._burstFiredCount = 0;
  boss._burstWithheldCount = 0;
  boss._burstBaseDir.set(0, 0, 1);
  boss._tickVolley(0.1, ctx);
  assert.ok(events.some(event => event.type === 'ability_released'
    && event.ability === 'captain_volley' && event.projectileCount === 1));
  boss.onRemoved(scene);
});
