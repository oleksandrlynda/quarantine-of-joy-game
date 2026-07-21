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
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { FLOODGATE_CONTINUITY } from '../src/levels/floodgate-continuity.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';
import { TUTORIAL_YARD } from '../src/levels/tutorial-yard.js';

const LEVELS = Object.freeze([
  RELAY_DISTRICT,
  SANITIZER_SPIRE,
  AD_ZONE_ARENA,
  TREND_WASTES,
  FREIGHT_ANNEX,
  MIRROR_GARDEN,
  CONTENT_COURT,
  SERVER_CATHEDRAL,
  SANDSTORM_EXPANSE,
  FLOODGATE_CONTINUITY,
  BLACKOUT_CISTERN,
  TUTORIAL_YARD
]);

function overlapsCollider([x, z], collider, margin = 1.05) {
  const [cx, cy, cz] = collider?.position || [];
  const [width, height, depth] = collider?.size || [];
  if (![cx, cy, cz, width, height, depth].every(Number.isFinite)) return false;
  const colliderMinY = cy - height / 2;
  const colliderMaxY = cy + height / 2;
  if (colliderMinY >= 0.8 || colliderMaxY <= 0) return false;
  const yaw = collider?.rotation?.[1] || 0;
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) < width / 2 + margin && Math.abs(localZ) < depth / 2 + margin;
}

test('every playable level authors a clear, reachable emergency ammo point', () => {
  for (const level of LEVELS) {
    const position = level.emergencyAmmoSpawn;
    assert.equal(Object.isFrozen(position), true, `${level.id} emergency point must be immutable`);
    assert.equal(position.length, 2, `${level.id} emergency point uses [x,z]`);
    assert.equal(position.every(Number.isFinite), true, `${level.id} emergency point must be finite`);

    const [x, z] = position;
    const [width, depth] = level.size;
    assert.ok(Math.abs(x) <= width / 2 - 1, `${level.id} emergency point must remain inside the level width`);
    assert.ok(Math.abs(z) <= depth / 2 - 1, `${level.id} emergency point must remain inside the level depth`);
    assert.equal(level.colliders.some(collider => overlapsCollider(position, collider)), false, `${level.id} emergency point must clear authored collision`);
    assert.equal(level.entrances.some(entrance => Math.hypot(x - entrance.position[0], z - entrance.position[2]) < 3), false, `${level.id} emergency point must clear enemy entrances`);
  }
});
