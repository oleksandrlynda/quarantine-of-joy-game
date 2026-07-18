import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementRenderProbe } from '../src/debug/movement-render-probe.js';

function makeHarness(options = {}) {
  const events = [];
  const weaponRoot = { visible: true };
  const player = { headBobEnabled: true };
  const grassMesh = { visible: true };
  const renderer = { shadowMap: { enabled: true } };
  const probe = new MovementRenderProbe({
    enabled: true,
    phaseDurationMs: 100,
    weaponRoot,
    player,
    grassMesh,
    renderer,
    onEvent: (name, data) => events.push({ name, data }),
    ...options
  });
  return { probe, events, weaponRoot, player, grassMesh, renderer };
}

test('disabled movement probe is inert and does not mutate render state', () => {
  const weaponRoot = { visible: true };
  const player = { headBobEnabled: true };
  const grassMesh = { visible: true };
  const renderer = { shadowMap: { enabled: true } };
  const events = [];
  const probe = new MovementRenderProbe({
    enabled: false, weaponRoot, player, grassMesh, renderer,
    onEvent: (...args) => events.push(args)
  });

  assert.equal(probe.beforeFrame({ nowMs: 0, moving: true }), null);
  probe.afterFrame({ renderMs: 50, drawCalls: 100, triangles: 50000 });
  assert.equal(weaponRoot.visible, true);
  assert.equal(player.headBobEnabled, true);
  assert.equal(grassMesh.visible, true);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.deepEqual(events, []);
});

test('movement probe isolates one render feature per phase and restores all state', () => {
  const { probe, events, weaponRoot, player, grassMesh, renderer } = makeHarness();

  assert.equal(probe.beforeFrame({ nowMs: 0, moving: true }), 'baseline');
  probe.afterFrame({ renderMs: 30, drawCalls: 20, triangles: 40000 });

  assert.equal(probe.beforeFrame({ nowMs: 100, moving: true }), 'weapon_hidden');
  assert.equal(weaponRoot.visible, false);
  assert.equal(player.headBobEnabled, true);
  probe.afterFrame({ renderMs: 25, drawCalls: 15, triangles: 39000 });

  assert.equal(probe.beforeFrame({ nowMs: 200, moving: true }), 'head_bob_disabled');
  assert.equal(weaponRoot.visible, true);
  assert.equal(player.headBobEnabled, false);
  assert.equal(grassMesh.visible, true);
  probe.afterFrame({ renderMs: 5, drawCalls: 20, triangles: 40000 });

  assert.equal(probe.beforeFrame({ nowMs: 300, moving: true }), 'grass_hidden');
  assert.equal(player.headBobEnabled, true);
  assert.equal(grassMesh.visible, false);
  assert.equal(renderer.shadowMap.enabled, true);
  probe.afterFrame({ renderMs: 3, drawCalls: 19, triangles: 300 });

  assert.equal(probe.beforeFrame({ nowMs: 400, moving: true }), 'shadows_disabled');
  assert.equal(grassMesh.visible, true);
  assert.equal(renderer.shadowMap.enabled, false);
  probe.afterFrame({ renderMs: 10, drawCalls: 12, triangles: 35000 });

  assert.equal(probe.beforeFrame({ nowMs: 500, moving: true }), null);
  assert.equal(weaponRoot.visible, true);
  assert.equal(player.headBobEnabled, true);
  assert.equal(grassMesh.visible, true);
  assert.equal(renderer.shadowMap.enabled, true);

  const results = events.filter(event => event.name === 'movement_probe_result');
  assert.deepEqual(results.map(event => event.data.phase), [
    'baseline', 'weapon_hidden', 'head_bob_disabled', 'grass_hidden', 'shadows_disabled'
  ]);
  assert.deepEqual(results.map(event => event.data.averageRenderMs), [30, 25, 5, 3, 10]);
  assert.equal(events.at(-1).name, 'movement_probe_complete');
});

test('stopping pauses probe progress and temporarily restores normal visuals', () => {
  const { probe, weaponRoot, player, grassMesh, renderer } = makeHarness();
  probe.beforeFrame({ nowMs: 0, moving: true });
  probe.afterFrame({ renderMs: 30, drawCalls: 20, triangles: 40000 });

  assert.equal(probe.beforeFrame({ nowMs: 50, moving: false }), 'baseline');
  assert.equal(weaponRoot.visible, true);
  assert.equal(player.headBobEnabled, true);
  assert.equal(grassMesh.visible, true);
  assert.equal(renderer.shadowMap.enabled, true);

  assert.equal(probe.beforeFrame({ nowMs: 1000, moving: true }), 'baseline');
  assert.equal(probe.beforeFrame({ nowMs: 1049, moving: true }), 'baseline');
  assert.equal(probe.beforeFrame({ nowMs: 1050, moving: true }), 'weapon_hidden');
});

test('weapon probe separates animation, material, and visibility costs', () => {
  const weaponRoot = { visible: true };
  const weaponView = {
    debugMotionFrozen: false,
    debugBasicMaterial: false,
    basicMaterialCalls: 0,
    setDebugMotionFrozen(enabled) { this.debugMotionFrozen = enabled; },
    setDebugBasicMaterial(enabled) {
      this.basicMaterialCalls++;
      this.debugBasicMaterial = enabled;
    }
  };
  const { probe, events } = makeHarness({ mode: 'weapon', weaponRoot, weaponView });

  assert.equal(probe.beforeFrame({ nowMs: 0, moving: true }), 'baseline');
  assert.equal(probe.beforeFrame({ nowMs: 100, moving: true }), 'weapon_motion_frozen');
  assert.equal(weaponView.debugMotionFrozen, true);
  assert.equal(weaponView.debugBasicMaterial, false);

  assert.equal(probe.beforeFrame({ nowMs: 200, moving: true }), 'weapon_basic_material');
  assert.equal(weaponView.debugMotionFrozen, false);
  assert.equal(weaponView.debugBasicMaterial, true);
  probe.beforeFrame({ nowMs: 250, moving: true });
  assert.equal(weaponView.basicMaterialCalls, 1, 'material override should not be rebuilt every frame');

  assert.equal(probe.beforeFrame({ nowMs: 300, moving: true }), 'weapon_hidden');
  assert.equal(weaponView.debugBasicMaterial, false);
  assert.equal(weaponRoot.visible, false);

  assert.equal(probe.beforeFrame({ nowMs: 400, moving: true }), null);
  assert.equal(weaponRoot.visible, true);
  assert.equal(weaponView.debugMotionFrozen, false);
  assert.equal(weaponView.debugBasicMaterial, false);
  assert.deepEqual(
    events.filter(event => event.name === 'movement_probe_result').map(event => event.data.phase),
    ['baseline', 'weapon_motion_frozen', 'weapon_basic_material', 'weapon_hidden']
  );
});
