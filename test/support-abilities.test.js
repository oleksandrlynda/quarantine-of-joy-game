import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EngagementBaitAbility } from '../src/abilities/engagement-bait.js';
import { OvertimeAbility } from '../src/abilities/overtime.js';
import { SupplyDropAbility } from '../src/abilities/supply-drop.js';
import { GameSession } from '../src/game/session.js';
import { ObstacleManager } from '../src/obstacles/manager.js';

function makeCamera() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 0, -8);
  camera.updateWorldMatrix(true, true);
  return camera;
}

test('Supply Drop lands after seven seconds and its crate releases two ammo and one med pickup', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  obstacleManager.objects = objects;
  const spawned = [];
  const achievementEvents = [];
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    camera: makeCamera(),
    objects,
    obstacleManager,
    session: { hp: 25 },
    achievements: { check: event => achievementEvents.push(event) },
    pickups: { spawn: (type, position) => spawned.push({ type, position }) },
    effects: {}
  };

  assert.equal(ability.onFire(ctx), true);
  ability.update(6.99, ctx);
  assert.equal(ability.crates.length, 0);
  ability.update(0.01, ctx);
  assert.equal(ability.crates.length, 1);
  const crate = ability.crates[0];
  assert.equal(objects.includes(crate.root), true);
  assert.equal(obstacleManager.obstacles.has(crate.root), true);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(crate.root);
  assert.ok(Math.abs((bounds.max.y - bounds.min.y) - 0.75) < 0.0001, 'crate height is reduced by 40%');
  assert.ok(Math.abs(bounds.min.y - 0.025) < 0.0001, 'shorter crate remains grounded');
  assert.ok(bounds.max.x - bounds.min.x > 1.5, 'crate footprint remains full size');

  const result = obstacleManager.handleHit(crate.root.children[0], 20);
  assert.equal(result.destroyed, true);
  assert.deepEqual(spawned.map(drop => drop.type).sort(), ['ammo', 'ammo', 'med']);
  assert.deepEqual(achievementEvents, [{ type: 'supplyDropOpened', hp: 25 }]);
  assert.equal(ability.crates.length, 0);
  assert.equal(objects.includes(crate.root), false);
});

test('Supply Drop joins an authored level collider list and can be shot', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  const spawned = [];
  const camera = makeCamera();
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    camera,
    objects,
    obstacleManager,
    pickups: { spawn: type => spawned.push(type) },
    effects: {}
  };

  assert.equal(obstacleManager.objects, null, 'authored-level path starts without obstacle-manager ownership');
  assert.equal(ability.onFire(ctx), true);
  ability.update(7, ctx);

  const crate = ability.crates[0];
  assert.equal(obstacleManager.objects, objects);
  assert.equal(objects.includes(crate.root), true);

  scene.updateMatrixWorld(true);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = crate.root.position.clone().sub(origin).normalize();
  const raycaster = new THREE.Raycaster(origin, direction, 0, 70);
  const hit = raycaster.intersectObjects(objects, true)[0];
  assert.ok(hit, 'the shared weapon raycast should hit the crate');
  assert.equal(obstacleManager.handleHit(hit.object, 20).destroyed, true);
  assert.deepEqual(spawned.sort(), ['ammo', 'ammo', 'med']);
  assert.equal(objects.includes(crate.root), false);
});

test('emergency ammo crate releases three ammo pickups and no health', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  obstacleManager.objects = objects;
  const spawned = [];
  const achievementEvents = [];
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    camera: makeCamera(),
    objects,
    obstacleManager,
    achievements: { check: event => achievementEvents.push(event) },
    pickups: { spawn: type => spawned.push(type) },
    effects: {}
  };

  assert.equal(ability.spawnEmergencyAmmoCrate(new THREE.Vector3(6, 0, -3), ctx), true);
  assert.equal(ability.spawnEmergencyAmmoCrate(new THREE.Vector3(0, 0, 0), ctx), false, 'only one emergency crate may be active');
  assert.equal(ability.hasEmergencyAmmoCrate(), true);

  const crate = ability.crates[0];
  assert.equal(crate.root.position.x, 6);
  assert.equal(crate.root.position.z, -3);
  assert.equal(obstacleManager.handleHit(crate.root.children[0], 20).destroyed, true);
  assert.deepEqual(spawned, ['ammo', 'ammo', 'ammo']);
  assert.deepEqual(achievementEvents, []);
  assert.equal(ability.hasEmergencyAmmoCrate(), false);
});

test('authored and emergency ammo crates persist until destroyed or cleared', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  obstacleManager.objects = objects;
  const spawned = [];
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    objects,
    obstacleManager,
    pickups: { spawn: type => spawned.push(type) },
    effects: {}
  };

  assert.equal(ability.spawnBossAmmoCrate(new THREE.Vector3(-3, 0, 0), ctx), true);
  assert.equal(ability.spawnBossAmmoCrate(new THREE.Vector3(3, 0, 0), ctx), true);
  ability.update(300, ctx);
  assert.equal(ability.crates.filter(crate => crate.kind === 'bossAmmo').length, 2, 'authored packages must not expire during long encounters');
  assert.equal(ability.clearBossAmmoCrates(ctx), 2);
  assert.equal(objects.length, 0);
  assert.deepEqual(spawned, [], 'wave cleanup must not release package loot');

  assert.equal(ability.spawnEmergencyAmmoCrate(new THREE.Vector3(0, 0, 0), ctx), true);
  ability.update(300, ctx);
  assert.equal(ability.hasEmergencyAmmoCrate(), true);
  assert.equal(objects.length, 1, 'emergency box must remain until the player destroys it');
  assert.equal(spawned.length, 0, 'an unopened persistent box must not release loose ammo');
});

test('authored boss health crates are persistent green cross boxes that release one med pickup', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  obstacleManager.objects = objects;
  const spawned = [];
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    objects,
    obstacleManager,
    pickups: { spawn: type => spawned.push(type) },
    effects: {}
  };

  assert.equal(ability.spawnBossHealthCrate(new THREE.Vector3(-3, 0, 0), ctx), true);
  assert.equal(ability.spawnBossHealthCrate(new THREE.Vector3(3, 0, 0), ctx), true);
  ability.update(300, ctx);
  assert.equal(ability.crates.filter(crate => crate.kind === 'bossHealth').length, 2);

  const crate = ability.crates.find(item => item.kind === 'bossHealth');
  assert.equal(crate.root.name, 'authored-health-crate');
  assert.equal(crate.root.children.length, 5, 'health box includes a two-piece cross marker');
  assert.equal(crate.root.children[0].material.color.getHex(), 0x2f855a);
  assert.equal(obstacleManager.handleHit(crate.root.children[0], 20).destroyed, true);
  assert.deepEqual(spawned, ['med']);

  assert.equal(ability.clearBossHealthCrates(ctx), 1);
  assert.equal(objects.length, 0);
  assert.deepEqual(spawned, ['med'], 'wave cleanup must not release unopened health loot');
});

test('an unopened Supply Drop crate persists until destroyed or world cleanup', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const obstacleManager = new ObstacleManager(THREE, scene, {});
  obstacleManager.objects = objects;
  const spawned = [];
  const ability = new SupplyDropAbility();
  const ctx = {
    THREE,
    camera: makeCamera(),
    objects,
    obstacleManager,
    pickups: { spawn: type => spawned.push(type) },
    effects: {}
  };

  ability.onFire(ctx);
  ability.update(7, ctx);
  const root = ability.crates[0].root;
  ability.update(300, ctx);
  assert.equal(ability.crates.length, 1);
  assert.equal(objects.includes(root), true);
  assert.deepEqual(spawned, []);

  ability.clearWorld(ctx);
  assert.equal(ability.crates.length, 0);
  assert.equal(objects.includes(root), false);
  assert.deepEqual(spawned, []);
});

test('Overtime spends 15 HP, restores 70 stamina, and rejects unsafe or wasteful casts', () => {
  const session = new GameSession();
  session.hp = 80;
  const player = {
    stamina: 20,
    staminaMax: 100,
    getStamina() { return this.stamina; },
    restoreStamina(amount) {
      const before = this.stamina;
      this.stamina = Math.min(this.staminaMax, this.stamina + amount);
      return this.stamina - before;
    }
  };
  const ability = new OvertimeAbility();
  const ctx = {
    THREE,
    session,
    playerController: player,
    effects: {},
    getPlayerPosition: target => target.set(0, 1.7, 0)
  };

  assert.equal(ability.onFire(ctx), true);
  assert.equal(session.hp, 65);
  assert.equal(player.stamina, 90);
  player.stamina = 100;
  assert.equal(ability.onFire(ctx), false);
  player.stamina = 0;
  session.hp = 24;
  assert.equal(ability.onFire(ctx), false);
});

test('Engagement Bait registers a temporary target and staggers nearby enemies on exit', () => {
  const scene = new THREE.Scene();
  let registered = null;
  let cleared = 0;
  let stagger = null;
  const achievementEvents = [];
  const enemyManager = {
    setEngagementBait(config) { registered = config; return true; },
    clearEngagementBait() { cleared += 1; return true; },
    applyRushImpact(_position, _direction, options) { stagger = options; return []; }
  };
  const ability = new EngagementBaitAbility();
  const ctx = {
    THREE,
    camera: makeCamera(),
    enemyManager,
    obstacleManager: { scene },
    attackId: 'Ability:engagement_bait:1',
    achievements: { check: event => achievementEvents.push(event) },
    effects: {}
  };

  assert.equal(ability.onFire(ctx), true);
  assert.equal(registered.radius, 10);
  assert.equal(registered.hp, 50);
  registered.onAffected(8);
  assert.deepEqual(achievementEvents, [{
    type: 'engagementBaitAffected',
    count: 8,
    attackId: 'Ability:engagement_bait:1'
  }]);
  ability.update(7);
  assert.equal(ability.baits.length, 0);
  assert.equal(cleared > 0, true);
  assert.equal(stagger.radius, 3.5);
  assert.equal(stagger.stunSeconds, 1);
});
