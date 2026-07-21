import test from 'node:test';
import assert from 'node:assert/strict';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { FREIGHT_ANNEX } from '../src/levels/freight-annex.js';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';

const CASES = Object.freeze([
  [SANITIZER_SPIRE, 6],
  [AD_ZONE_ARENA, 11],
  [TREND_WASTES, 16],
  [FREIGHT_ANNEX, 21],
  [MIRROR_GARDEN, 26],
  [CONTENT_COURT, 31],
  [SERVER_CATHEDRAL, 36],
  [SANDSTORM_EXPANSE, 42]
]);

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

test('each seamless campaign level entry offers one clear ammo and health crate', () => {
  for (const [level, wave] of CASES) {
    const encounter = level.waves[wave];
    assert.equal(encounter.ammoPackages.length, 1, `${level.id} Wave ${wave} ammo crate count`);
    assert.equal(encounter.healthPackages.length, 1, `${level.id} Wave ${wave} health crate count`);
    assert.equal(Object.isFrozen(encounter.ammoPackages), true);
    assert.equal(Object.isFrozen(encounter.healthPackages), true);

    const supplies = [...encounter.ammoPackages, ...encounter.healthPackages];
    for (const position of supplies) {
      assert.equal(Object.isFrozen(position), true);
      assert.equal(position.length, 2);
      assert.equal(position.every(Number.isFinite), true);
      assert.equal(level.colliders.some(collider => overlapsCollider(position, collider)), false, `${level.id} supply must clear authored collision`);
      assert.equal(level.entrances.some(entrance => Math.hypot(position[0] - entrance.position[0], position[1] - entrance.position[2]) < 3), false, `${level.id} supply must clear enemy entrances`);
      assert.ok(Math.hypot(position[0] - level.playerSpawn[0], position[1] - level.playerSpawn[2]) >= 8, `${level.id} supply should require leaving the spawn point`);
    }

    const [ammo] = encounter.ammoPackages;
    const [health] = encounter.healthPackages;
    assert.ok(Math.hypot(ammo[0] - health[0], ammo[1] - health[1]) >= 6, `${level.id} supplies should offer distinct routes`);
  }
});
