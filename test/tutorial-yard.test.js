import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import { TUTORIAL_YARD } from '../src/levels/tutorial-yard.js';
import { TutorialManager } from '../src/tutorial-manager.js';

test('tutorial room is sealed, compact, and gives the Shooter a production firing lane', () => {
  assert.deepEqual(TUTORIAL_YARD.size, [18, 18]);
  assert.equal(TUTORIAL_YARD.ceilingHeight, 4);
  assert.equal(TUTORIAL_YARD.colliders.filter(collider => collider.id.endsWith('wall')).length, 4);
  const ceiling = TUTORIAL_YARD.colliders.find(collider => collider.id === 'ceiling');
  assert.deepEqual(ceiling?.size, [18, .3, 18]);
  assert.equal(ceiling?.blocksGrounding, false, 'solid ceiling must not become AI ground');
  assert.equal(TUTORIAL_YARD.colliders.find(collider => collider.id === 'shooting-target')?.blocksMovement, false);
  assert.deepEqual(validateLevelSpawnNetwork(TUTORIAL_YARD).filter(result => !result.valid), []);

  const shooter = TUTORIAL_YARD.tutorial.shooterSpawn;
  const cover = TUTORIAL_YARD.tutorial.coverZone.center;
  const firingDistance = Math.hypot(shooter[0] - cover[0], shooter[2] - cover[1]);
  assert.ok(firingDistance >= 12 && firingDistance <= 18, `Shooter lesson distance ${firingDistance}m must remain in its 12-18m firing band`);
  assert.ok(TUTORIAL_YARD.tutorial.coverZone.seconds <= 1.5, 'cover lesson must remain a brief tutorial check');
});

test('tutorial runs the intended eight-beat lesson and grants Rifle only for the finale', () => {
  const listeners = new Map();
  const documentRef = {
    addEventListener(type, listener) { listeners.set(`${type}:${listener.name}`, listener); },
    removeEventListener() {}
  };
  const player = { position: new THREE.Vector3(0, 1.7, 7) };
  const instances = new Map();
  const spawned = [];
  let shooterHasSightline = true;
  const enemyManager = {
    THREE,
    suspendWaves: true,
    instanceByRoot: instances,
    spawnAt(type, position) {
      const root = {
        position: position.clone(),
        rotation: { y: 0 },
        userData: { type, hp: 100, maxHp: 100 }
      };
      const instance = {
        projectiles: [1],
        cleanupRan: false,
        onRemoved() {
          this.projectiles.length = 0;
          this.cleanupRan = true;
        }
      };
      instances.set(root, instance);
      spawned.push(root);
      return root;
    },
    remove(root) { instances.get(root)?.onRemoved?.(); instances.delete(root); },
    hasWorldLineOfSight(root) {
      return root?.userData?.type === 'shooter' ? shooterHasSightline : true;
    }
  };
  let rifleGranted = false;
  const pistol = { name: 'Pistol' };
  const weaponSystem = {
    inventory: [pistol], currentIndex: 0,
    notifyInventoryChange() {},
    swapPrimary(makeWeapon) {
      rifleGranted = makeWeapon().name === 'Rifle';
      this.inventory = [{ name: 'Rifle' }, pistol];
      this.currentIndex = 0;
    }
  };
  let crateSpawned = false;
  let ended = false;
  const states = [];
  const markers = [];
  const tutorial = new TutorialManager({
    documentRef,
    enemyManager,
    weaponSystem,
    getPlayer: () => player,
    spawnCrate: () => { crateSpawned = true; },
    onStep: state => states.push(state),
    onMarker: state => markers.push(state),
    onEnd: () => { ended = true; }
  });

  tutorial.start(TUTORIAL_YARD.tutorial);
  assert.deepEqual(markers.at(-1), { visible: true, position: [0, 5.2], color: 'cyan' });
  player.position.set(0, 1.7, 5.2);
  tutorial.update(.016); // walk
  tutorial._onKey({ code: 'Space' }); // jump
  tutorial.onTargetDestroyed(); // shoot and destroy the authored red plate
  player.position.set(-5.8, 1.7, 1.2);
  tutorial.update(.016); // obstacle route
  assert.equal(crateSpawned, true);
  tutorial.onPickup('ammo'); // right-click crate opened and collected

  const firstGrunt = spawned.find(root => root.userData.type === 'grunt');
  assert.deepEqual(firstGrunt.position.toArray(), [-5.5, .8, 3], 'the first enemy must spawn in the open crate-side lane');
  assert.equal(firstGrunt.rotation.y, Math.PI / 2, 'the first Grunt must face across the reveal lane');
  assert.equal(firstGrunt.userData.stunnedUntil, 1.25, 'the first Grunt must hold long enough to be identified');
  assert.equal(markers.at(-1).target, firstGrunt, 'the active objective marker must follow the first Grunt');
  assert.equal(markers.at(-1).color, 'red');
  enemyManager.remove(firstGrunt);
  const shooter = spawned.find(root => root.userData.type === 'shooter');
  assert.ok(shooter);
  assert.equal(shooter.userData.movementLocked, true, 'training Shooter must hold its authored firing lane');
  assert.equal(rifleGranted, false);

  // The west cover lane is deliberately outside the old fixed trigger circle.
  player.position.set(-5.6, 1.7, 1);
  tutorial.update(1);
  assert.equal(tutorial._coverSeconds, 0, 'a coordinate alone must not count while the Shooter has LOS');
  shooterHasSightline = false;
  tutorial.update(.8); // any genuine cover counts
  assert.ok(Math.abs(tutorial._coverSeconds - .8) < 1e-9);
  shooterHasSightline = true;
  tutorial.update(.5); // exposure pauses rather than erasing learned progress
  assert.ok(Math.abs(tutorial._coverSeconds - .8) < 1e-9);
  const [coverX, coverZ] = TUTORIAL_YARD.tutorial.coverZone.center;
  player.position.set(coverX, 1.7, coverZ);
  const shooterInstance = instances.get(shooter);
  tutorial.update(.8); // the marked safe pocket is authoritative despite a grazing ray
  assert.equal(shooterInstance.cleanupRan, true, 'tutorial removal must preserve the enemy cleanup receiver');
  assert.equal(shooterInstance.projectiles.length, 0, 'Shooter cleanup must clear its projectile pool');
  assert.equal(rifleGranted, true);
  const finale = spawned.filter(root => root.userData.type === 'grunt' && instances.has(root));
  assert.equal(finale.length, 3);
  for (const root of finale) enemyManager.remove(root);

  assert.equal(ended, true);
  assert.equal(tutorial.active, false);
  assert.deepEqual(weaponSystem.inventory, [pistol], 'tutorial loadout must not leak into campaign progression');
  assert.equal(states.at(-1).visible, false);
  assert.equal(markers.at(-1).visible, false);
});

test('tutorial runtime exposes one pulsing diamond marker instead of static floor rings', () => {
  const scene = new THREE.Scene();
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects: [],
    grassMesh: null,
    weather: null,
    clonePrefab: () => null,
    cullGrass() {}
  });
  runtime.group = new THREE.Group();
  runtime._buildTutorialGroundLanguage();

  const marker = runtime.group.getObjectByName('tutorial-objective-marker');
  assert.ok(marker);
  assert.ok(runtime.group.getObjectByName('tutorial-combat-key'), 'the first Grunt lane must have a dedicated visibility light');
  assert.equal(marker.visible, false);
  assert.equal(runtime.group.getObjectByName('tutorial-enemy-spawn-pad'), undefined);

  runtime.setTutorialObjectiveMarker({ visible: true, position: [2, -3], color: 'red' });
  assert.equal(marker.visible, true);
  assert.deepEqual([marker.position.x, marker.position.z], [2, -3]);
  assert.equal(marker.material.color.getHex(), 0xff665c);
});

test('tutorial runtime keeps the ceiling solid without exposing it to AI grounding', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: null,
    clonePrefab: () => null,
    cullGrass() {}
  });

  runtime.load(TUTORIAL_YARD);
  const ceiling = objects.find(object => object.userData?.colliderId === 'ceiling');

  assert.ok(ceiling);
  assert.equal(ceiling.userData.blocksMovement, true);
  assert.equal(ceiling.userData.blocksGrounding, false);
});
