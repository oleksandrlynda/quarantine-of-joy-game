import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENEMY_BEHAVIOR_PROFILES,
  isScenarioApplicable,
  resolveBehaviorProfile
} from '../src/enemies/behavior-profiles.js';
import {
  EnemySpatialIndex,
  segmentIntersectsBody,
  verticalSpansOverlap
} from '../src/enemies/spatial-index.js';
import { EnemyPerceptionMemory } from '../src/enemies/perception.js';
import { ShooterEnemy, isShooterMobileCover } from '../src/enemies/shooter.js';
import { findPath } from '../src/path.js';
import * as THREE from 'three';

const point = (x, y, z) => ({ x, y, z });
const root = (id, x, y, z) => ({ position: point(x, y, z), userData: { behaviorId: id, type: id } });

test('shared profiles cover every EnemyManager archetype and preserve role ranges', () => {
  assert.deepEqual(Object.keys(ENEMY_BEHAVIOR_PROFILES), [
    'grunt', 'gruntling', 'tank', 'rusher', 'rusher_elite', 'rusher_explosive',
    'bailiff', 'shooter', 'sniper', 'flyer', 'pelican', 'healer', 'warden'
  ]);
  assert.deepEqual(ENEMY_BEHAVIOR_PROFILES.shooter.preferredRange, [12, 18]);
  assert.deepEqual(ENEMY_BEHAVIOR_PROFILES.sniper.preferredRange, [22, 30]);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.shooter.actions.includes('ally_cover'), true);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.shooter.actions.includes('counter_aim_evade'), true);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.shooter.actions.includes('gun_butt'), true);
  assert.equal(isScenarioApplicable('shooter', 'ally_cover_usage'), true);
  assert.equal(isScenarioApplicable('sniper', 'ally_cover_usage'), false);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('heal'), true);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('last_survivor_bomb'), true);
  assert.equal(isScenarioApplicable('healer', 'last_survivor_bomb'), true);
  assert.equal(isScenarioApplicable('healer', 'ally_blocking'), false);
  assert.equal(isScenarioApplicable('healer', 'alone_retreat'), false);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('fire'), false);
  assert.equal(isScenarioApplicable('flyer', 'barrel_navigation'), false);
  assert.deepEqual(ENEMY_BEHAVIOR_PROFILES.pelican.preferredRange, [5, 18]);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.pelican.actions.includes('drop_grenade'), true);
  assert.equal(isScenarioApplicable('pelican', 'pelican_bombing_cycle'), true);
  assert.equal(isScenarioApplicable('pelican', 'dive_corridor'), false);
  assert.equal(isScenarioApplicable('warden', 'outer_ring_retreat'), true);
});

test('Shooter range hysteresis has no non-firing gap outside 12-18m', () => {
  const shooter = Object.create(ShooterEnemy.prototype);
  shooter.preferredRange = { min: 12, max: 18 };
  shooter._rangeMovementMode = 'hold';

  assert.equal(shooter._updateRangeMovementMode(18.1), 'close');
  assert.equal(shooter._updateRangeMovementMode(17.8), 'close');
  assert.equal(shooter._updateRangeMovementMode(17.5), 'hold');
  assert.equal(shooter._updateRangeMovementMode(11.9), 'retreat');
  assert.equal(shooter._updateRangeMovementMode(12.5), 'hold');
});

test('Shooter prioritizes a ready clear shot and uses hiding during cooldown', () => {
  const shooter = Object.create(ShooterEnemy.prototype);
  shooter.preferredRange = { min: 12, max: 18 };
  shooter.inBurst = false;
  shooter.windupTime = 0;
  shooter.cooldown = 0;
  shooter.evasiveTimer = 0;

  assert.equal(shooter._shouldPrioritizeShot(15, true, true), true);
  assert.equal(shooter._shouldPrioritizeShot(15, false, true), false, 'world cover must still force repositioning');
  assert.equal(shooter._shouldPrioritizeShot(15, true, false), false, 'an allied blocker must still force a peek');
  assert.equal(shooter._shouldPrioritizeShot(19, true, true), false, 'Shooter must first close into its authored firing band');

  shooter.cooldown = 0.8;
  assert.equal(shooter._shouldPrioritizeShot(15, true, true), false, 'post-burst cooldown is the hiding window');
  shooter.inBurst = true;
  assert.equal(shooter._shouldPrioritizeShot(15, true, true), true, 'an active burst must finish before hiding');
});

test('Shooter detects the full camera ray crossing its body instead of broad facing', () => {
  const shooter = new ShooterEnemy({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    cfg: { type: 'shooter', hp: 80, speedMin: 3, speedMax: 3 },
    spawnPos: new THREE.Vector3(0, 0.8, 15),
    rng: () => 0.5
  });
  const aimOrigin = new THREE.Vector3(0, 1.7, 0);
  const directAim = shooter.root.position.clone().sub(aimOrigin).normalize();
  const ctx = { blackboard: { playerAimOrigin: aimOrigin, playerAimDirection: directAim } };

  assert.equal(shooter._isUnderPlayerAim(ctx, true), true);
  ctx.blackboard.playerAimDirection = new THREE.Vector3(0.2, 0, 1).normalize();
  assert.equal(shooter._isUnderPlayerAim(ctx, true), false, 'general facing must not count as crosshair pressure');
  ctx.blackboard.playerAimDirection = directAim;
  assert.equal(shooter._isUnderPlayerAim(ctx, false), false, 'cover must prevent psychic counter-aim reactions');
});

test('Shooter evades after sustained crosshair pressure, then keeps a reaction cooldown', () => {
  const shooter = new ShooterEnemy({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    cfg: { type: 'shooter', hp: 80, speedMin: 3, speedMax: 3 },
    spawnPos: new THREE.Vector3(0, 0.8, 15),
    rng: () => 0.5
  });
  const aimOrigin = new THREE.Vector3(0, 1.7, 0);
  const events = [];
  const ctx = {
    scene: new THREE.Scene(),
    blackboard: {
      playerAimOrigin: aimOrigin,
      playerAimDirection: shooter.root.position.clone().sub(aimOrigin).normalize()
    },
    positionClear: () => true,
    emitAIEvent: (_root, type, data) => events.push({ type, ...data })
  };
  shooter.inBurst = true;
  shooter.shotsThisBurst = 2;
  shooter.windupTime = 0.2;

  assert.equal(shooter._updateCounterAimThreat(0.1, ctx, true, aimOrigin), false);
  assert.equal(shooter._updateCounterAimThreat(0.1, ctx, true, aimOrigin), false);
  assert.equal(shooter._updateCounterAimThreat(0.1, ctx, true, aimOrigin), true);

  assert.equal(shooter._counterAimActive, true);
  assert.equal(shooter.inBurst, false);
  assert.equal(shooter.shotsThisBurst, 0);
  assert.equal(shooter.windupTime, 0);
  assert.equal(shooter.relocating, true);
  assert.ok(Math.abs(shooter._counterAimDir.x) > 0.9, 'evasion should primarily break the aim laterally');
  assert.ok(events.some(event => event.type === 'counter_aim_evade_started'));

  shooter._counterAimActive = false;
  shooter.evasiveTimer = 0;
  assert.equal(shooter._updateCounterAimThreat(0.5, ctx, true, aimOrigin), false);
  assert.equal(shooter._aimThreatTime, 0, 'cooldown must prevent immediate dodge chaining');
});

test('Shooter performs a final tactical obstruction check before every projectile', () => {
  const shooter = Object.create(ShooterEnemy.prototype);
  shooter.THREE = THREE;
  shooter.root = { position: new THREE.Vector3(0, 0.8, 0), userData: { behaviorId: 'shooter', type: 'shooter' } };
  shooter._refs = {};
  shooter.spreadBase = 0;
  shooter.currentSpread = 0;
  shooter.spreadMax = 0;
  shooter.spreadBloomPerShot = 0;
  shooter.rng = () => 0.5;
  shooter.shotsThisBurst = 0;
  shooter.projectiles = [];

  const blocker = root('tank', 0, 1.1, 5);
  const events = [];
  let spawned = 0;
  const fired = shooter._fireProjectile(new THREE.Vector3(0, 1.7, 10), {
    tacticalLineClear: () => ({ clear: false, worldClear: true, blockerRoot: blocker }),
    emitAIEvent: (_owner, type, data) => events.push({ type, ...data }),
    _spawnBullet: () => { spawned++; return true; }
  });

  assert.equal(fired, false);
  assert.equal(spawned, 0);
  assert.equal(shooter.shotsThisBurst, 0);
  assert.deepEqual(events.map(event => [event.type, event.reason, event.blockerRoot]), [
    ['shot_withheld', 'ally_blocked', blocker]
  ]);
});

test('Shooter firing preserves the authored showcase gun pose and front muzzle', () => {
  const shooter = new ShooterEnemy({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    cfg: { type: 'shooter', hp: 80, speedMin: 3, speedMax: 3 },
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    rng: () => 0.5
  });
  const target = new THREE.Vector3(0, 1.7, 15);
  const origins = [];
  const ctx = {
    tacticalLineClear: () => ({ clear: true, worldClear: true, blockerRoot: null }),
    _spawnBullet: (_kind, origin) => { origins.push(origin.clone()); return true; }
  };

  shooter.root.updateMatrixWorld(true);
  const authoredGunRotation = shooter._refs.gun.quaternion.clone();
  shooter._fireProjectile(target, ctx);
  shooter.root.updateMatrixWorld(true);
  shooter._fireProjectile(target, ctx);
  shooter.root.updateMatrixWorld(true);

  const gunOrigin = shooter._refs.gun.getWorldPosition(new THREE.Vector3());
  const barrelPoint = shooter._refs.gun.localToWorld(new THREE.Vector3(0, 0, -1));
  const barrelDirection = barrelPoint.sub(gunOrigin).normalize();
  const targetDirection = target.clone().sub(origins[1]).normalize();
  assert.ok(shooter._refs.gun.quaternion.angleTo(authoredGunRotation) < 1e-8, 'firing must not overwrite the showcased hold');
  assert.ok(barrelDirection.dot(targetDirection) > 0.995, 'authored barrel must remain in the target-facing hemisphere');
  assert.ok(origins[0].z > shooter.root.position.z, 'first shot must originate in front of the body');
  assert.ok(origins[1].z > shooter.root.position.z, 'repeated shots must remain in front of the body');
  assert.ok(origins[1].distanceTo(shooter._refs.muzzle.getWorldPosition(new THREE.Vector3())) < 1e-6);
});

test('Shooter uses a telegraphed gun-butt after blocked escape and creates retreat space', () => {
  const shooter = new ShooterEnemy({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    cfg: { type: 'shooter', hp: 80, speedMin: 3, speedMax: 3 },
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    rng: () => 0.5
  });
  shooter.evasiveTimer = 0.5;
  assert.equal(shooter._shouldStartGunButt(0.016, 1.6, true, {
    requestedDistance: 0.08, appliedDistance: 0, blockedBy: 'world'
  }), true);

  const events = [];
  const damage = [];
  const pushes = [];
  const states = [];
  const ctx = {
    scene: new THREE.Scene(),
    damagePlayer: (amount, metadata) => damage.push({ amount, metadata }),
    applyPlayerKnockback: vector => pushes.push(vector.clone()),
    emitAIEvent: (_root, type, data) => events.push({ type, ...data }),
    setAIState: (_root, state) => states.push(state)
  };
  const playerPos = new THREE.Vector3(0, 1.7, 1.6);
  const sense = { rawWorldLOS: true, locomotionClear: true };
  const authoredGunRotation = shooter._refs.gun.quaternion.clone();

  shooter._startGunButt(ctx);
  assert.equal(damage.length, 0, 'windup must not deal immediate damage');
  shooter._updateGunButt(0.38, ctx, playerPos, sense);

  assert.equal(damage.length, 1);
  assert.equal(damage[0].amount, 16);
  assert.equal(damage[0].metadata.sourceKind, 'shooter_gun_butt');
  assert.equal(pushes.length, 1);
  assert.ok(Math.abs(pushes[0].length() - 1.35) < 1e-8);
  assert.ok(events.some(event => event.type === 'melee_started'));
  assert.ok(events.some(event => event.type === 'melee_hit'));
  assert.ok(states.includes('gun_butt_active'));
  assert.ok(shooter._refs.gun.quaternion.angleTo(authoredGunRotation) < 1e-8, 'melee swing must keep the gun correctly mounted');

  shooter._updateGunButt(0.12, ctx, playerPos, sense);
  shooter._updateGunButt(0.48, ctx, playerPos, sense);
  assert.equal(shooter._meleePhase, 'idle');
  assert.equal(shooter.evasiveTimer, 0.75);
  assert.equal(shooter.relocating, true);
  assert.ok(Math.abs(shooter._refs.rightArm.rotation.x - shooter._rightArmRestRotation.x) < 1e-8);
  assert.ok(Math.abs(shooter._refs.rightArm.rotation.y - shooter._rightArmRestRotation.y) < 1e-8);
  assert.ok(Math.abs(shooter._refs.rightArm.rotation.z - shooter._rightArmRestRotation.z) < 1e-8);
});

test('Shooter requires sustained point-blank pressure when its escape remains clear', () => {
  const shooter = Object.create(ShooterEnemy.prototype);
  shooter.meleeRange = 2.2;
  shooter._closePressureTime = 0;
  shooter._meleeCooldown = 0;
  shooter.evasiveTimer = 0.6;
  const clearEscape = { requestedDistance: 0.08, appliedDistance: 0.08, blockedBy: null };

  assert.equal(shooter._shouldStartGunButt(0.2, 1.8, true, clearEscape), false);
  assert.equal(shooter._shouldStartGunButt(0.16, 1.8, true, clearEscape), true);
  assert.equal(shooter._shouldStartGunButt(0.1, 3, true, clearEscape), false);
  assert.equal(shooter._closePressureTime, 0);
});

test('Shooter uses only frontline Grunts and Tanks as mobile cover and calculates a safe side-peek', () => {
  assert.equal(isShooterMobileCover(root('grunt', 0, 0.8, 7)), true);
  assert.equal(isShooterMobileCover(root('tank', 0, 1.1, 7)), true);
  assert.equal(isShooterMobileCover(root('healer', 0, 0.8, 7)), false);

  const shooter = Object.create(ShooterEnemy.prototype);
  shooter.THREE = THREE;
  shooter.root = { position: new THREE.Vector3(0, 0.8, 15), userData: { behaviorId: 'shooter', type: 'shooter' } };
  shooter.preferredRange = { min: 12, max: 18 };
  shooter._coverPeekSign = 1;
  shooter._hasLineOfSightFrom = () => true;
  const cover = { position: new THREE.Vector3(0, 1.1, 7), userData: { behaviorId: 'tank', type: 'tank' } };
  const player = new THREE.Vector3(0, 1.7, 0);
  const plan = shooter._buildAllyCoverPlan(cover, player, {
    objects: [],
    enemyManager: {
      _profileForRoot: candidate => resolveBehaviorProfile(candidate.userData.behaviorId)
    },
    positionClear: () => true,
    tacticalLineClear: () => ({ clear: true, worldClear: true, blockerRoot: null })
  });

  assert.ok(plan);
  assert.equal(plan.coverRoot, cover);
  assert.ok(plan.hideAnchor.z > cover.position.z);
  assert.ok(Math.abs(plan.peekAnchor.x - plan.hideAnchor.x) >= 1.25);

  const unusableFrontline = { position: new THREE.Vector3(0, 1.1, 17), userData: { behaviorId: 'tank', type: 'tank' } };
  assert.equal(shooter._buildAllyCoverPlan(unusableFrontline, player, {
    objects: [],
    enemyManager: { _profileForRoot: candidate => resolveBehaviorProfile(candidate.userData.behaviorId) },
    positionClear: () => true,
    tacticalLineClear: () => ({ clear: true, worldClear: true, blockerRoot: null })
  }), null);
});

test('spatial index filters by layer and vertical span and finds the first tactical blocker', () => {
  const shooter = root('shooter', 0, 0.8, 0);
  const grunt = root('grunt', 0, 0.8, 4);
  const highFlyer = root('flyer', 0, 7, 2);
  const index = new EnemySpatialIndex({ cellSize: 2, verticalCellSize: 2 });
  index.rebuild([shooter, grunt, highFlyer], item => resolveBehaviorProfile(item.userData.behaviorId));

  assert.deepEqual(index.queryRadius(point(0, 0.8, 0), 5, { layer: 'ground' }).map(entry => entry.root), [shooter, grunt]);
  assert.deepEqual(index.queryRadius(point(0, 7, 0), 4, { layer: 'air', verticalRadius: 1 }).map(entry => entry.root), [highFlyer]);

  const hit = index.firstBodyOnSegment(point(0, 0.9, 0), point(0, 1.2, 10), { excludeRoot: shooter, padding: 0.05 });
  assert.equal(hit.entry.root, grunt);
  assert.equal(segmentIntersectsBody(point(0, 7, 0), point(0, 7, 5), index.entry(grunt)), null);
  assert.equal(verticalSpansOverlap(grunt, resolveBehaviorProfile('grunt'), highFlyer, resolveBehaviorProfile('flyer')), false);
});

test('perception applies acquisition/loss hysteresis and expires memory after search', () => {
  const memory = new EnemyPerceptionMemory();
  const enemy = root('grunt', 0, 0.8, 0);
  const player = point(2, 1.7, 0);

  let state = memory.observe(enemy, { dt: 0.1, time: 0.1, rawWorldLOS: true, targetPosition: player });
  assert.equal(state.stableWorldLOS, false);
  state = memory.observe(enemy, { dt: 0.05, time: 0.15, rawWorldLOS: true, targetPosition: player });
  assert.equal(state.stableWorldLOS, true);
  state = memory.observe(enemy, { dt: 0.2, time: 0.35, rawWorldLOS: false, targetPosition: point(9, 1.7, 0) });
  assert.equal(state.stableWorldLOS, true);
  assert.deepEqual(state.lastKnownPosition, player);
  state = memory.observe(enemy, { dt: 0.05, time: 0.4, rawWorldLOS: false, targetPosition: point(9, 1.7, 0) });
  assert.equal(state.stableWorldLOS, false);
  assert.equal(memory.get(enemy, 5.1).memoryActive, true);
  assert.equal(memory.get(enemy, 5.2).searchActive, true);
  assert.equal(memory.get(enemy, 8.2).searchActive, false);
});

test('pathfinding expands obstacles by the requesting body radius', () => {
  const obstacle = { min: { x: 2, z: -0.2 }, max: { x: 3, z: 0.2 } };
  const start = { x: 0, z: 0 };
  const goal = { x: 5, z: 0 };
  const smallPath = findPath(start, goal, [obstacle], { gridSize: 0.25, agentRadius: 0.2 });
  const tankPath = findPath(start, goal, [obstacle], { gridSize: 0.25, agentRadius: 0.95 });
  const maxDetour = path => Math.max(...path.map(node => Math.abs(node.z)));
  assert.ok(maxDetour(tankPath) > maxDetour(smallPath));
});
