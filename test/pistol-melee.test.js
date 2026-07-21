import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponSystem } from '../src/weapons/system.js';

test('empty pistol right-click opens a nearby supply box in two melee strikes without consuming ammo', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);

  const crate = new THREE.Group();
  crate.position.set(0, 0, -2);
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.25, 1.5),
    new THREE.MeshBasicMaterial()
  );
  crate.add(shell);
  crate.updateMatrixWorld(true);

  let meleeDamage = 0;
  let swingCount = 0;
  let now = 1000;
  const originalNow = performance.now;
  performance.now = () => now;
  const weaponSystem = new WeaponSystem({
    THREE,
    camera,
    raycaster: new THREE.Raycaster(),
    enemyManager: {
      enemies: new Set(),
      getEnemyRaycastTargets: () => []
    },
    objects: [crate],
    obstacleManager: {
      handleHit(hitObject, damage) {
        assert.equal(hitObject, shell);
        meleeDamage += damage;
        return { handled: true, destroyed: meleeDamage >= 20 };
      }
    },
    weaponView: {
      startSlash: () => { swingCount += 1; }
    },
    updateHUD: () => {}
  });
  weaponSystem.current.ammoInMag = 0;
  weaponSystem.current.reserveAmmo = 0;

  try {
    assert.equal(weaponSystem.triggerAltDown(), true);
    assert.equal(meleeDamage, 10);
    assert.equal(swingCount, 1);
    assert.equal(weaponSystem.triggerAltDown(), false, 'the pistol whip respects its short cooldown');

    now += 450;
    assert.equal(weaponSystem.triggerAltDown(), true);
    assert.equal(meleeDamage, 20, 'the second strike opens the 20 HP supply box');
    assert.equal(swingCount, 2);
    assert.equal(weaponSystem.getAmmo(), 0);
    assert.equal(weaponSystem.getReserve(), 0);
  } finally {
    performance.now = originalNow;
    shell.geometry.dispose();
    shell.material.dispose();
  }
});
