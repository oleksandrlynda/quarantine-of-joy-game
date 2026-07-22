import test from 'node:test';
import assert from 'node:assert/strict';

import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { FLOODGATE_CONTINUITY } from '../src/levels/floodgate-continuity.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';

const levelForWave = wave => wave >= 73
  ? BLACKOUT_CISTERN
  : wave >= 52
    ? FLOODGATE_CONTINUITY
    : SANDSTORM_EXPANSE;

function overlapsCollider([x, z], collider, margin = 1.05) {
  const [cx, , cz] = collider?.position || [];
  const [width, , depth] = collider?.size || [];
  if (![cx, cz, width, depth].every(Number.isFinite)) return false;
  const yaw = collider?.rotation?.[1] || 0;
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) < width / 2 + margin && Math.abs(localZ) < depth / 2 + margin;
}

test('every Wave 42-73 authors four separated and reachable ammo crates', () => {
  for (let wave = 42; wave <= 73; wave += 1) {
    const level = levelForWave(wave);
    const encounter = level.waves[wave];
    assert.ok(encounter, `${level.id} must define Wave ${wave}`);
    assert.equal(encounter.ammoPackages.length, 4, `${level.id} Wave ${wave} ammo crate count`);

    encounter.ammoPackages.forEach((position, index) => {
      assert.equal(Object.isFrozen(position), true);
      assert.equal(position.length, 2);
      assert.equal(position.every(Number.isFinite), true);
      assert.equal(
        level.colliders.some(collider => overlapsCollider(position, collider)),
        false,
        `${level.id} Wave ${wave} ammo crate ${index + 1} must clear authored collision`
      );
      assert.equal(
        level.entrances.some(entrance => Math.hypot(
          position[0] - entrance.position[0],
          position[1] - entrance.position[2]
        ) < 3),
        false,
        `${level.id} Wave ${wave} ammo crate ${index + 1} must clear enemy entrances`
      );
      for (const health of encounter.healthPackages) {
        assert.ok(
          Math.hypot(position[0] - health[0], position[1] - health[1]) >= 3,
          `${level.id} Wave ${wave} ammo and health crates must not overlap`
        );
      }
    });

    for (let first = 0; first < encounter.ammoPackages.length; first += 1) {
      for (let second = first + 1; second < encounter.ammoPackages.length; second += 1) {
        const a = encounter.ammoPackages[first];
        const b = encounter.ammoPackages[second];
        assert.ok(
          Math.hypot(a[0] - b[0], a[1] - b[1]) >= 3,
          `${level.id} Wave ${wave} ammo crates must not overlap each other`
        );
      }
    }
  }
});
