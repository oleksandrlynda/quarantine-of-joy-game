import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { FREIGHT_ANNEX } from '../src/levels/freight-annex.js';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';

const CASES = Object.freeze([
  [RELAY_DISTRICT, 5, 2],
  [SANITIZER_SPIRE, 10, 2],
  [AD_ZONE_ARENA, 15, 2],
  [TREND_WASTES, 20, 4],
  [FREIGHT_ANNEX, 25, 3],
  [MIRROR_GARDEN, 30, 8],
  [CONTENT_COURT, 35, 8],
  [SERVER_CATHEDRAL, 40, 7],
  [BLACKOUT_CISTERN, 73, 7]
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

test('boss and finale waves author the approved ammo package counts in clear arena positions', () => {
  for (const [level, wave, expectedCount] of CASES) {
    const positions = level.waves[wave].ammoPackages;
    assert.equal(positions.length, expectedCount, `${level.id} Wave ${wave} package count`);
    assert.equal(Object.isFrozen(positions), true);

    positions.forEach((position, index) => {
      assert.equal(position.length, 2, `${level.id} package ${index + 1} uses [x,z]`);
      assert.equal(position.every(Number.isFinite), true, `${level.id} package ${index + 1} has finite coordinates`);
      assert.equal(level.colliders.some(collider => overlapsCollider(position, collider)), false, `${level.id} package ${index + 1} must clear authored collision`);
      assert.equal(level.entrances.some(entrance => Math.hypot(position[0] - entrance.position[0], position[1] - entrance.position[2]) < 3), false, `${level.id} package ${index + 1} must clear spawn entrances`);
      if (level.bossClearZone) {
        const distance = Math.hypot(position[0] - level.bossClearZone.center[0], position[1] - level.bossClearZone.center[1]);
        assert.ok(distance > level.bossClearZone.radius + 1, `${level.id} package ${index + 1} must stay outside the boss clear zone`);
      }
    });

    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        assert.ok(Math.hypot(positions[first][0] - positions[second][0], positions[first][1] - positions[second][1]) >= 3, `${level.id} packages must not overlap each other`);
      }
    }
  }
});
