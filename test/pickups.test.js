import test from 'node:test';
import assert from 'node:assert/strict';
import { Pickups } from '../src/pickups.js';

function sequenceRng(values) {
  let i = 0;
  return () => values[i++] ?? values.at(-1) ?? 0;
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
}
class Group {
  constructor() { this.position = new Vector3(); this.children = []; this.userData = {}; }
  add(child) { this.children.push(child); }
  traverse(visitor) { visitor(this); for (const child of this.children) visitor(child); }
}
class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { value: 1, setScalar(v) { this.value = v; } };
    this.material = material;
  }
}
const THREE = {
  Vector3,
  Group,
  Mesh,
  BoxGeometry: class {},
  TorusGeometry: class {},
  MeshLambertMaterial: class { constructor(opts) { Object.assign(this, opts); } dispose() { this.disposed = true; } },
  MeshBasicMaterial: class { constructor(opts) { Object.assign(this, opts); } dispose() { this.disposed = true; } }
};

function makeScene() {
  return {
    added: [],
    removed: [],
    add(obj) { this.added.push(obj); },
    remove(obj) { this.removed.push(obj); }
  };
}

test('onWave resets wave counts and pity misses', () => {
  const pickups = new Pickups(THREE, makeScene(), sequenceRng([0.99, 0.99]));
  pickups.waveCount.ammo = 2;
  pickups.waveCount.med = 1;
  pickups.pityMisses = 4;

  pickups.onWave(3);

  assert.deepEqual(pickups.waveCount, { ammo: 0, med: 0 });
  assert.equal(pickups.pityMisses, 0);
});

test('maybeDrop increments ammo and med counts for deterministic drops', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([
    0.05, 0.0, // ammo drop, amount 15
    0.14, 0.0  // med drop, amount 20
  ]));

  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added[0].userData.type, 'ammo');
  assert.equal(scene.added[0].userData.amount, 15);
  assert.deepEqual(pickups.waveCount, { ammo: 1, med: 0 });

  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added[1].userData.type, 'med');
  assert.equal(scene.added[1].userData.amount, 20);
  assert.deepEqual(pickups.waveCount, { ammo: 1, med: 1 });
});

test('maybeDrop prevents capped ammo and med from dropping through base probability', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([
    0.0, 0.0, // ammo 1
    0.0, 0.0, // ammo 2; ammo cap reached
    0.0, 0.0, // med 1 because ammo chance is capped to zero
    0.0       // no drop because both caps reached
  ]));

  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added.at(-1).userData.type, 'ammo');
  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added.at(-1).userData.type, 'ammo');
  assert.equal(pickups.waveCount.ammo, 2);

  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added.at(-1).userData.type, 'med');
  assert.equal(pickups.waveCount.med, 1);

  assert.equal(pickups.maybeDrop(new Vector3()), false);
  assert.equal(scene.added.length, 3);
});

test('repeated misses increase pity and a later drop resets it', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([
    0.99,
    0.99,
    0.14, 0.0 // pity lifts ammo chance to 0.15, then amount roll
  ]));

  assert.equal(pickups.maybeDrop(new Vector3()), false);
  assert.equal(pickups.pityMisses, 1);
  assert.equal(pickups.maybeDrop(new Vector3()), false);
  assert.equal(pickups.pityMisses, 2);

  assert.equal(pickups.maybeDrop(new Vector3()), true);
  assert.equal(scene.added.at(-1).userData.type, 'ammo');
  assert.equal(pickups.pityMisses, 0);
});

test("dropMultiple('random') ignores caps and creates the requested count", () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([
    0.1, 0.5, 0.5, 0.0, // random ammo, jitter, amount
    0.9, 0.5, 0.5, 0.0, // random med, jitter, amount
    0.1, 0.5, 0.5, 0.0  // random ammo, jitter, amount
  ]));
  pickups.waveCount = { ammo: pickups.cap.ammo, med: pickups.cap.med };

  pickups.dropMultiple('random', new Vector3(3, 0, 4), 3);

  assert.equal(scene.added.length, 3);
  assert.equal(pickups.active.size, 3);
  assert.deepEqual(scene.added.map(g => g.userData.type), ['ammo', 'med', 'ammo']);
  assert.deepEqual(pickups.waveCount, { ammo: 2, med: 1 });
  assert.equal(scene.added[0].children[0].geometry, scene.added[1].children[0].geometry);
  assert.equal(scene.added[0].children[1].geometry, scene.added[1].children[1].geometry);
});

test('enemy ammo expires after 30 seconds and warns during its final eight seconds', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([0.0, 0.0]));
  const playerPosition = new Vector3(100, 0, 100);

  pickups.maybeDrop(new Vector3(10, 0, 10));
  const ammo = scene.added[0];
  assert.equal(ammo.userData.source, 'enemy');
  assert.equal(ammo.userData.lifetimeSeconds, 30);

  pickups.update(21, playerPosition, () => {});
  assert.equal(ammo.children[0].material.opacity, 1);
  pickups.update(4, playerPosition, () => {});
  assert.ok(ammo.children[0].material.opacity < 1, 'the ammo visibly warns before expiring');
  pickups.update(5, playerPosition, () => {});

  assert.equal(pickups.active.has(ammo), false);
  assert.equal(pickups.retention.expired, 1);
});

test('boss and supply ammo retain the standard 75-second lifetime', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([0.0, 0.0]));
  const playerPosition = new Vector3(100, 0, 100);

  pickups.dropMultiple('ammo', new Vector3(10, 0, 10), 1, { source: 'boss' });
  pickups.spawn('ammo', new Vector3(12, 0, 12), { source: 'supply' });
  const [bossAmmo, supplyAmmo] = scene.added;
  assert.equal(bossAmmo.userData.lifetimeSeconds, 75);
  assert.equal(supplyAmmo.userData.lifetimeSeconds, 75);

  pickups.update(31, playerPosition, () => {});
  assert.equal(pickups.active.has(bossAmmo), true);
  assert.equal(pickups.active.has(supplyAmmo), true);
  pickups.update(44, playerPosition, () => {});
  assert.equal(pickups.active.size, 0);
});

test('update picks up items inside magnet radius and removes them from the scene', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([0.0]));
  const collected = [];

  pickups.spawn('ammo', new Vector3(0.5, 0, 0.5));
  const spawned = scene.added[0];
  pickups.update(0.016, new Vector3(0, 0, 0), (type, amount, position) => {
    collected.push({ type, amount, position });
  });

  assert.equal(collected.length, 1);
  assert.equal(collected[0].type, 'ammo');
  assert.equal(collected[0].amount, 15);
  assert.deepEqual(
    { x: collected[0].position.x, y: collected[0].position.y, z: collected[0].position.z },
    { x: 0.5, y: 0.6, z: 0.5 }
  );
  assert.deepEqual(scene.removed, [spawned]);
  assert.equal(pickups.active.size, 0);
  assert.equal(spawned.children[0].material.disposed, true);
  assert.equal(spawned.children[1].material.disposed, true);
});

test('resetAll removes every active pickup from the scene', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([0.0, 0.0]));
  pickups.spawn('ammo', new Vector3(0, 0, 0));
  pickups.spawn('med', new Vector3(2, 0, 2));

  const spawned = [...pickups.active];
  pickups.resetAll();

  assert.deepEqual(scene.removed, spawned);
  assert.equal(pickups.active.size, 0);
});

test('pickup retention expires old drops and caps active scene objects', () => {
  const scene = makeScene();
  const pickups = new Pickups(THREE, scene, sequenceRng([0.0]));
  pickups.maxActive = 2;
  pickups.maxLifetimeSeconds = 5;
  pickups.spawn('ammo', new Vector3(10, 0, 10));
  const oldest = [...pickups.active][0];
  pickups.spawn('med', new Vector3(12, 0, 12));
  pickups.spawn('ammo', new Vector3(14, 0, 14));

  assert.equal(pickups.active.size, 2);
  assert.equal(pickups.active.has(oldest), false);
  assert.equal(pickups.retention.evicted, 1);

  pickups.update(6, new Vector3(0, 0, 0), () => {});
  assert.equal(pickups.active.size, 0);
  assert.equal(pickups.retention.expired, 2);
});
