import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AbilitySystem } from '../src/abilities/system.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { CAMPAIGN_DESTRUCTIBLES, destructiblesForLevel } from '../src/levels/destructibles.js';
import { FLOODGATE_CONTINUITY } from '../src/levels/floodgate-continuity.js';
import { FREIGHT_ANNEX } from '../src/levels/freight-annex.js';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { LevelRuntime } from '../src/levels/runtime.js';
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { Destructible } from '../src/obstacles/destructible.js';
import { ObstacleManager } from '../src/obstacles/manager.js';

const CAMPAIGN_LEVELS = [
  RELAY_DISTRICT,
  SANITIZER_SPIRE,
  AD_ZONE_ARENA,
  TREND_WASTES,
  FREIGHT_ANNEX,
  MIRROR_GARDEN,
  CONTENT_COURT,
  SERVER_CATHEDRAL,
  SANDSTORM_EXPANSE,
  FLOODGATE_CONTINUITY,
  BLACKOUT_CISTERN
];

function overlapsSolidCollider(placement, collider, radius = 0.66) {
  if (collider.blocksMovement === false) return false;
  const [cx, , cz] = collider.position;
  const [width, , depth] = collider.size;
  const yaw = collider.rotation?.[1] || 0;
  const dx = placement.x - cx;
  const dz = placement.z - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  return Math.abs(localX) < width / 2 + radius && Math.abs(localZ) < depth / 2 + radius;
}

test('every authored campaign arena receives a safe set of volatile barrels', () => {
  assert.deepEqual(Object.keys(CAMPAIGN_DESTRUCTIBLES).sort(), CAMPAIGN_LEVELS.map(level => level.id).sort());
  for (const level of CAMPAIGN_LEVELS) {
    const placements = destructiblesForLevel(level.id);
    assert.equal(placements.length, 6, `${level.id} should keep a restrained barrel budget`);
    assert.equal(new Set(placements.map(item => item.id)).size, placements.length, `${level.id} barrel IDs must be unique`);
    assert.ok(placements.every(item => item.type === 'barrel'));
    for (const placement of placements) {
      assert.equal(
        level.colliders.some(collider => overlapsSolidCollider(placement, collider)),
        false,
        `${placement.id} overlaps authored collision`
      );
      assert.ok(Math.hypot(placement.x - level.playerSpawn[0], placement.z - level.playerSpawn[2]) >= 3.5,
        `${placement.id} is too close to the player spawn`);
    }
  }
});

test('the barrel model is recognizable, damageable, and keeps a raycastable root', () => {
  const barrel = new Destructible({
    THREE,
    mats: {},
    type: 'barrel',
    position: new THREE.Vector3(0, 0.73, -4)
  });
  assert.equal(barrel.root.isMesh, true);
  assert.equal(barrel.root.name, 'explosive-barrel');
  assert.ok(barrel.root.getObjectByName('barrel-warning-label'));
  assert.equal(barrel.root.getObjectsByProperty('name', 'barrel-reinforcement-band').length, 3);

  const warning = barrel.root.getObjectByName('barrel-warning-label');
  const initialGlow = warning.material.emissiveIntensity;
  assert.equal(barrel.damage(20).destroyed, false);
  assert.ok(warning.material.emissiveIntensity > initialGlow, 'damage should intensify the warning glow');
  assert.equal(barrel.damage(30).destroyed, true);
});

test('barrel destruction damages actors, emits feedback, and chains to a nearby barrel', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const manager = new ObstacleManager(THREE, scene, {});
  const enemy = new THREE.Object3D();
  enemy.position.set(0, 0.8, 0);
  enemy.userData.hp = 100;
  const enemies = new Set([enemy]);
  manager.enemyManager = {
    enemies,
    applyHit(root, _head, damage) {
      root.userData.hp -= damage;
      return { enemy: root, killed: root.userData.hp <= 0 };
    },
    remove: root => enemies.delete(root)
  };
  const explosions = [];
  const groundRings = [];
  const shakes = [];
  let sounds = 0;
  const playerDamage = [];
  manager.effects = {
    spawnExplosion: (position, radius, color) => explosions.push({ position: position.clone(), radius, color }),
    spawnGroundRing: (position, radius, color) => groundRings.push({ position: position.clone(), radius, color }),
    shake: (strength, duration) => shakes.push({ strength, duration }),
    enemyDeath() {}
  };
  manager.sfx = { explosion: () => { sounds += 1; } };
  manager.getPlayer = () => ({ position: new THREE.Vector3(0, 1.7, 0) });
  manager.onPlayerDamage = amount => playerDamage.push(amount);

  assert.equal(manager.loadPlacements([
    { id: 'chain-a', type: 'barrel', x: 0, z: 0 },
    { id: 'chain-b', type: 'barrel', x: 1.5, z: 0 }
  ], objects), 2);
  assert.equal(objects.length, 2);
  const first = objects[0];
  assert.deepEqual(manager.handleHit(first, 50), { handled: true, destroyed: true, type: 'barrel' });
  assert.equal(objects.length, 0, 'the first blast should detonate the neighboring barrel');
  assert.equal(enemies.size, 0);
  assert.equal(explosions.length, 1, 'a chain should create only one full composite explosion');
  assert.equal(groundRings.length, 1, 'the chained barrel should retain lightweight visual feedback');
  assert.equal(shakes.length, 1);
  assert.equal(sounds, 1);
  assert.ok(playerDamage.length >= 1);
});

test('authored level load, reset, and unload own the destructible lifecycle', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const manager = new ObstacleManager(THREE, scene, {});
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: null,
    clonePrefab: () => new THREE.Group(),
    cullGrass: null,
    onLoadDestructibles: definition => manager.loadPlacements(destructiblesForLevel(definition.id), objects),
    onClearDestructibles: () => manager.clear()
  });

  runtime.load(RELAY_DISTRICT);
  assert.equal(manager.obstacles.size, 6);
  const firstGeneration = new Set(manager.obstacles);
  manager.handleHit([...manager.obstacles][0], 50);
  assert.ok(manager.obstacles.size < 6);

  runtime.reset();
  assert.equal(manager.obstacles.size, 6, 'reset should restore every destroyed barrel');
  assert.equal([...manager.obstacles].some(root => firstGeneration.has(root)), false);

  runtime.unload();
  assert.equal(manager.obstacles.size, 0);
  assert.equal(objects.some(object => object.userData?.destructible), false);
});

test('ordinary crates are destructible instead of silently absorbing damage', () => {
  const crate = new Destructible({ THREE, mats: {}, type: 'crate', position: new THREE.Vector3() });
  assert.equal(crate.damage(59).destroyed, false);
  assert.equal(crate.damage(1).destroyed, true);
});

test('level cleanup clears ability-owned world props without resetting charges', () => {
  const system = new AbilitySystem({
    getContext: () => ({}),
    getEquippedAbility: () => 'supply_drop'
  });
  const runtime = system.runtimes.get('supply_drop');
  runtime.charges = 0;
  let clears = 0;
  runtime.payload.clearWorld = () => { clears += 1; };

  system.clearWorldObjects();
  assert.equal(clears, 1);
  assert.equal(runtime.charges, 0);
});
