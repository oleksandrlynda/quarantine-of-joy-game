import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DMR } from '../src/weapons/dmr.js';
import { Minigun } from '../src/weapons/minigun.js';
import { Pistol } from '../src/weapons/pistol.js';
import { Rifle } from '../src/weapons/rifle.js';
import { Shotgun } from '../src/weapons/shotgun.js';
import { SMG } from '../src/weapons/smg.js';

globalThis.window = globalThis.window || {};

function makeShotContext(events) {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.updateMatrixWorld(true);
  const enemyRoot = new THREE.Group();
  enemyRoot.position.z = -5;
  enemyRoot.userData = { type: 'grunt', hp: 10000 };
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 1),
    new THREE.MeshBasicMaterial()
  );
  torso.userData.bodyPart = 'torso';
  enemyRoot.add(torso);
  enemyRoot.updateMatrixWorld(true);
  const enemyManager = {
    enemies: new Set([enemyRoot]),
    alive: 1,
    getEnemyRaycastTargets: () => [enemyRoot],
    remove: () => { events.push('remove'); }
  };
  return {
    enemyRoot,
    torso,
    ctx: {
      THREE,
      camera,
      raycaster: new THREE.Raycaster(),
      enemyManager,
      objects: [],
      effects: {
        spawnMuzzleFlash() {},
        spawnBulletImpact() { events.push('impact'); },
        spawnBulletDecal(_position, _normal, options) {
          events.push('decal');
          assert.equal(options.object, torso);
          assert.equal(options.attachTo, torso, 'enemy decal must attach to the exact hit mesh');
          assert.equal(options.owner, enemyRoot);
        }
      },
      mutations: {
        getWeaponDamageMultiplier: () => 1,
        getMinigunProfile: () => ({ damageMultiplier: 1, spreadMultiplier: 1 })
      },
      combo: { multiplier: 1 },
      applyKnockback() { events.push('knockback'); },
      applyRecoil() {},
      addScore() {},
      addComboAction() {},
      updateHUD() {}
    }
  };
}

for (const [name, createWeapon] of [
  ['Rifle', () => {
    const weapon = new Rifle();
    weapon._baseSpread = 0;
    weapon._sprayPattern = [[0, 0]];
    weapon._sprayIndex = 0;
    return weapon;
  }],
  ['SMG', () => {
    const weapon = new SMG();
    weapon._baseSpread = 0;
    return weapon;
  }],
  ['Minigun', () => {
    const weapon = new Minigun();
    weapon._baseSpread = 0;
    return weapon;
  }],
  ['DMR', () => new DMR()]
]) {
  test(`${name} anchors its enemy decal before applying knockback`, () => {
    const events = [];
    const { ctx } = makeShotContext(events);

    createWeapon().onFire(ctx);

    assert.ok(events.includes('decal'));
    assert.ok(events.includes('knockback'));
    assert.ok(events.indexOf('decal') < events.indexOf('knockback'));
  });
}

for (const [name, createWeapon] of [
  ['Pistol', () => {
    const weapon = new Pistol();
    weapon._baseSpread = 0;
    return weapon;
  }],
  ['Shotgun', () => {
    const weapon = new Shotgun();
    weapon.pellets = 2;
    weapon.spreadRad = 0;
    return weapon;
  }]
]) {
  test(`${name} attaches enemy decals to the exact hit mesh`, () => {
    const events = [];
    const { ctx } = makeShotContext(events);

    createWeapon().onFire(ctx);

    assert.ok(events.includes('decal'));
  });
}
