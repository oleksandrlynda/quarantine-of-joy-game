import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BLACKOUT_CISTERN, BLACKOUT_CISTERN_ASSET_IDS } from '../src/levels/blackout-cistern.js';
import { validateLevelSpawnNetwork } from '../src/levels/runtime.js';

test('Blackout Cistern authors the Wave 73 Last Light finale', () => {
  assert.equal(BLACKOUT_CISTERN.firstWave, 73);
  assert.equal(BLACKOUT_CISTERN.finalWave, 73);
  assert.deepEqual(BLACKOUT_CISTERN.size, [58, 58]);
  assert.equal(BLACKOUT_CISTERN.waves[73].specialEncounter, 'last_light');
  assert.equal(BLACKOUT_CISTERN.waves[73].activeCap, 60);
  assert.equal(BLACKOUT_CISTERN.entrances.filter(entrance => !entrance.air).length, 6);
  assert.equal(BLACKOUT_CISTERN.entrances.filter(entrance => entrance.air).length, 6);
  assert.equal(BLACKOUT_CISTERN.entrances.some(entrance => entrance.allow.includes('shooter')), false);
  assert.equal(BLACKOUT_CISTERN.entrances.some(entrance => entrance.allow.includes('sniper')), false);
  assert.ok(BLACKOUT_CISTERN_ASSET_IDS.includes('lastlightreactor'));
  assert.ok(BLACKOUT_CISTERN_ASSET_IDS.includes('cisternbackdrop'));
});

test('all twelve Blackout Cistern spawn entrances survive authored collision validation', () => {
  const validation = validateLevelSpawnNetwork(BLACKOUT_CISTERN);
  assert.equal(validation.length, 12);
  assert.deepEqual(validation.filter(result => !result.valid).map(result => ({
    id: result.entrance.id,
    errors: result.errors
  })), []);
});

test('Blackout Cistern tank pads also clear production runtime AABBs', () => {
  const tankPads = BLACKOUT_CISTERN.entrances.filter(entrance => !entrance.air && entrance.allow.includes('tank'));
  const failures = [];
  for (const entrance of tankPads) {
    const radius = entrance.clearance.tank;
    const [x, , z] = entrance.position;
    for (const collider of BLACKOUT_CISTERN.colliders) {
      if (collider.blocksMovement === false || collider.blocksSpawn === false) continue;
      const [cx, , cz] = collider.position;
      const [width, , depth] = collider.size;
      const yaw = collider.rotation?.[1] || 0;
      const halfX = Math.abs(Math.cos(yaw)) * width / 2 + Math.abs(Math.sin(yaw)) * depth / 2;
      const halfZ = Math.abs(Math.sin(yaw)) * width / 2 + Math.abs(Math.cos(yaw)) * depth / 2;
      if (Math.abs(x - cx) <= radius + halfX && Math.abs(z - cz) <= radius + halfZ) {
        failures.push({ entrance: entrance.id, collider: collider.id });
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('campaign routing loads Blackout Cistern after Greywater and restarts after the finale', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const checkpoints = fs.readFileSync(new URL('../src/game/campaign-checkpoint.js', import.meta.url), 'utf8');
  assert.match(main, /if \(wave >= 73\) return BLACKOUT_CISTERN/);
  assert.match(checkpoints, /greywaterComplete[^\n]+return 73/);
  assert.match(checkpoints, /lastLightComplete[^\n]+return 1/);
  assert.match(main, /relayLevel\.load\(BLACKOUT_CISTERN\)/);
  assert.match(main, /setString\('bs3d_lastlight_complete', '1'\)/);
  assert.match(main, /wave72Visuals\.setFinalSearchlight\(true\)/);
  assert.match(main, /story\?\.onSpecialWave\?\.\(event/);
  assert.match(main, /if \(!epilogueQueued\) finishLastLight\(\)/);
});
