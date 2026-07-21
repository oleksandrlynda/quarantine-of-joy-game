import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BeamSaber } from '../src/weapons/beamsaber.js';

test('Beam Saber slash damages a nearby supply box without consuming ammo', () => {
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

  let slashDamage = 0;
  const saber = new BeamSaber();
  const fired = saber.tryFire({
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
        slashDamage += damage;
        return { handled: true, destroyed: slashDamage >= 20 };
      }
    },
    weaponView: { startSlash() {}, onFire() {} },
    updateHUD() {}
  });

  assert.equal(fired, true);
  assert.equal(slashDamage, 40);
  assert.equal(saber.getAmmo(), 1, 'the saber remains an infinite-ammo melee weapon');

  shell.geometry.dispose();
  shell.material.dispose();
});
