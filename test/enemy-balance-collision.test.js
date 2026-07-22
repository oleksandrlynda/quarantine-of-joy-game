import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { resolveBossBehaviorProfile } from '../src/bosses/behavior-profiles.js';
import { HYDRACLONE_ACTIVE_CAP, Hydraclone } from '../src/bosses/hydraclone.js';
import { FlyerEnemy } from '../src/enemies/flyer.js';
import { HealerEnemy } from '../src/enemies/healer.js';
import { clampToNavigationBounds, resolveNavigationBounds } from '../src/enemies/navigation-bounds.js';
import { ShooterEnemy } from '../src/enemies/shooter.js';

const mats = () => ({ head: new THREE.MeshLambertMaterial({ color: 0x111827 }) });
const cfg = type => ({ type, hp: 80, speedMin: 3, speedMax: 3 });

test('Shooter uses singles between a readable ten-second burst special', () => {
  const shooter = new ShooterEnemy({
    THREE, mats: mats(), cfg: cfg('shooter'), spawnPos: new THREE.Vector3(), rng: () => 0.5
  });
  const shots = [];
  const ctx = {
    tacticalLineClear: () => ({ clear: true, worldClear: true }),
    _spawnBullet: (kind, origin, velocity, life, damage) => {
      shots.push({ kind, origin, velocity, life, damage });
      return true;
    }
  };

  assert.equal(shooter.burstRechargeSeconds, 10);
  assert.equal(shooter.singleCadence, 1.4);
  shooter._fireProjectile(new THREE.Vector3(0, 1.5, 10), ctx, 'single');
  assert.equal(shooter.shotsThisBurst, 0, 'ordinary shots must not advance the special burst');
  shooter._fireProjectile(new THREE.Vector3(0, 1.5, 10), ctx, 'burst');
  assert.equal(shooter.shotsThisBurst, 1);
  assert.deepEqual(shots.map(shot => shot.damage), [20, 20]);
});

test('Flyer dive damage, warning, and recharge are reduced', () => {
  const flyer = new FlyerEnemy({
    THREE, mats: mats(), cfg: cfg('flyer'), spawnPos: new THREE.Vector3(), rng: () => 0.5
  });
  assert.equal(flyer.telegraphRequired, 0.55);
  assert.equal(flyer.cooldownBase, 1.8);
  assert.deepEqual([flyer.impactDamageMin, flyer.impactDamageMax], [9, 14]);
});

test('authored rectangular navigation bounds clamp healer and flyer targets before walls', () => {
  const ctx = {
    enemyManager: {
      encounterHooks: {
        getNavigationBounds: () => ({ minX: -36, maxX: 36, minZ: -30, maxZ: 30 })
      }
    }
  };
  const bounds = resolveNavigationBounds(ctx, 1.5);
  assert.deepEqual(bounds, { minX: -34.5, maxX: 34.5, minZ: -28.5, maxZ: 28.5 });
  const point = clampToNavigationBounds(new THREE.Vector3(50, 0.8, -50), bounds);
  assert.deepEqual(point.toArray(), [34.5, 0.8, -28.5]);

  const healer = Object.create(HealerEnemy.prototype);
  healer.THREE = THREE;
  healer.root = { position: new THREE.Vector3(0, 0.8, 29) };
  healer._retreatSign = 1;
  const target = healer._chooseRetreatTarget(new THREE.Vector3(0, 0.8, 0), {
    ...ctx,
    nearbyAllies: () => []
  });
  assert.ok(target.z <= 28.4 + 1e-9, 'healer retreat target should honor its 1.6m inset');
});

test('Hydraclone collision bodies shrink by generation and cap concurrent bodies', () => {
  const radii = [1, 2, 3].map(generation =>
    resolveBossBehaviorProfile(`hydraclone_gen${generation}`).collisionRadius
  );
  assert.deepEqual(radii, [0.64, 0.46, 0.32]);
  assert.equal(HYDRACLONE_ACTIVE_CAP, 24);

  const clone = new Hydraclone({
    THREE,
    mats: mats(),
    spawnPos: new THREE.Vector3(),
    generation: 3,
    bossId: 'collision-profile-check',
    rng: () => 0.5
  });
  assert.equal(clone.behaviorId, 'hydraclone_gen3');
  assert.equal(clone.root.userData.behaviorId, 'hydraclone_gen3');
  Hydraclone.resetLineage('collision-profile-check');
});
