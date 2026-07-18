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
    'bailiff', 'shooter', 'sniper', 'flyer', 'healer', 'warden'
  ]);
  assert.deepEqual(ENEMY_BEHAVIOR_PROFILES.shooter.preferredRange, [12, 18]);
  assert.deepEqual(ENEMY_BEHAVIOR_PROFILES.sniper.preferredRange, [22, 30]);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.shooter.actions.includes('ally_cover'), true);
  assert.equal(isScenarioApplicable('shooter', 'ally_cover_usage'), true);
  assert.equal(isScenarioApplicable('sniper', 'ally_cover_usage'), false);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('heal'), true);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('last_survivor_bomb'), true);
  assert.equal(isScenarioApplicable('healer', 'last_survivor_bomb'), true);
  assert.equal(isScenarioApplicable('healer', 'ally_blocking'), false);
  assert.equal(isScenarioApplicable('healer', 'alone_retreat'), false);
  assert.equal(ENEMY_BEHAVIOR_PROFILES.healer.actions.includes('fire'), false);
  assert.equal(isScenarioApplicable('flyer', 'barrel_navigation'), false);
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
