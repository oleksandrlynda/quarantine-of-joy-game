import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAssetRegistry, getAssetDefinition } from '../src/assets/registry.js';
import { createEnvironmentAssetRegistry, ENVIRONMENT_ASSET_COUNT } from '../src/assets/environment/index.js';
import { LEVEL_ASSET_COUNT } from '../src/assets/environment/level-assets.js';
import { allLevelAssetIds, LEVEL_ASSET_PLAN } from '../src/assets/levels/catalog.js';
import { createLevelSceneLayout } from '../src/assets/levels/scene-layout.js';
import { createRuntimeAssetManifest, RUNTIME_ASSET_FILES } from '../src/assets/runtime-manifest.js';
import { disposeObject3D, prepareAssetForExport } from '../tools/exporter/core.js';

test('asset registry exposes unique, buildable IDs', () => {
  const registry = createAssetRegistry({ THREE });
  const ids = registry.map((asset) => asset.id);

  assert.equal(registry.length, 17 + ENVIRONMENT_ASSET_COUNT);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(registry.every((asset) => typeof asset.build === 'function'));
  assert.equal(getAssetDefinition('warehouse', { THREE })?.id, 'warehouse');
});

test('runtime model paths target registered generated assets', () => {
  const registry = createAssetRegistry({ THREE });
  const generatedFiles = new Set(registry.map((asset) => `${asset.category}/${asset.id}.glb`));
  const runtimeManifest = createRuntimeAssetManifest();

  assert.ok(Object.values(runtimeManifest).every((file) => file.startsWith('assets/generated/')));
  assert.ok(Object.values(RUNTIME_ASSET_FILES).every((file) => generatedFiles.has(file)));
});

test('Broodmaker export omits the unsupported backface outline shell', () => {
  const broodmaker = createAssetRegistry({ THREE }).find((asset) => asset.id === 'boss_broodmaker').build();
  try {
    assert.equal(broodmaker.refs.outlineGroup, null);
  } finally {
    disposeObject3D(broodmaker.root);
  }
});

test('Ad Zeppelin exports with a horizontal flight silhouette', () => {
  const zeppelin = createAssetRegistry({ THREE }).find((asset) => asset.id === 'boss_zeppelin_pod').build();
  try {
    const size = new THREE.Box3().setFromObject(zeppelin.root).getSize(new THREE.Vector3());
    assert.ok(size.x > size.y * 1.5, `expected Zeppelin length on runtime +X, received ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
  } finally {
    disposeObject3D(zeppelin.root);
  }
});

test('environment registry is the proposal showcase source of truth', () => {
  const environmentAssets = createEnvironmentAssetRegistry({ THREE });
  const html = readFileSync(new URL('../low-poly-environment-proposal.html', import.meta.url), 'utf8');
  const selectorIds = [...html.matchAll(/data-model="([^"]+)"/g)].map((match) => match[1]);
  const registryIds = environmentAssets.filter((asset) => asset.source === 'environment').map((asset) => asset.id);

  assert.equal(environmentAssets.length, ENVIRONMENT_ASSET_COUNT);
  assert.deepEqual(selectorIds, registryIds);
  assert.match(html, /createEnvironmentAssetRegistry/);
  assert.doesNotMatch(html, /function buildCheckpoint/);
  assert.ok(environmentAssets.every((asset) => asset.description && asset.role && asset.meshes));
  assert.ok(environmentAssets.every((asset) => asset.category !== 'environment'));
});

test('level asset plan maps every requested model to the generated registry', () => {
  const registry = createAssetRegistry({ THREE });
  const registryIds = new Set(registry.map((asset) => asset.id));
  const requestedIds = new Set(LEVEL_ASSET_PLAN.flatMap((level) => [...level.requested, ...level.background]));

  assert.equal(LEVEL_ASSET_PLAN.length, 11);
  assert.equal(requestedIds.size, LEVEL_ASSET_COUNT);
  for (const level of LEVEL_ASSET_PLAN) {
    assert.equal(level.background.length, 1, `${level.title} should have one distant background kit`);
    assert.equal(new Set(allLevelAssetIds(level)).size, allLevelAssetIds(level).length, `${level.title} contains duplicate asset IDs`);
    assert.ok(allLevelAssetIds(level).every((id) => registryIds.has(id)), `${level.title} references an unregistered asset`);
  }
});

test('distant background kits preserve horizon-scale low-poly budgets', () => {
  const backgrounds = createAssetRegistry({ THREE }).filter((asset) => asset.category === 'backdrops');
  assert.equal(backgrounds.length, 11);

  for (const asset of backgrounds) {
    const prepared = prepareAssetForExport({ THREE, definition: asset, built: asset.build() });
    try {
      assert.ok(prepared.report.bounds.size.x >= 10, `${asset.id} should span at least ten metres`);
      assert.ok(prepared.report.metrics.triangles <= 2500, `${asset.id} exceeds the distant triangle budget`);
      assert.ok(prepared.report.metrics.materials <= 12, `${asset.id} exceeds the distant material budget`);
    } finally {
      disposeObject3D(prepared.root);
    }
  }
});

test('each compact level scene places every assigned asset exactly once', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));

  for (const level of LEVEL_ASSET_PLAN) {
    const expectedIds = allLevelAssetIds(level);
    const layout = createLevelSceneLayout(level, metadataById);
    const placedIds = layout.map((placement) => placement.id);
    assert.equal(layout.length, expectedIds.length, `${level.title} has incomplete scene coverage`);
    assert.deepEqual(new Set(placedIds), new Set(expectedIds), `${level.title} scene IDs differ from its catalog`);
    assert.equal(new Set(placedIds).size, placedIds.length, `${level.title} places an asset more than once`);
    assert.equal(layout.filter((placement) => placement.kind === 'background').length, 1, `${level.title} should place one backdrop`);
    assert.ok(layout.every((placement) => placement.position.every(Number.isFinite)), `${level.title} contains an invalid position`);
    assert.ok(layout.every((placement) => Number.isFinite(placement.rotationY) && placement.desiredSpan > 0), `${level.title} contains invalid placement data`);
  }
});

test('post-campaign scenes preserve their authored mechanic landmarks', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const layoutFor = (id) => createLevelSceneLayout(LEVEL_ASSET_PLAN.find((level) => level.id === id), metadataById);

  const sandstorm = new Map(layoutFor('sandstorm-expanse').map((placement) => [placement.id, placement]));
  assert.equal(sandstorm.get('sandbankkit')?.kind, 'ground');
  assert.ok(sandstorm.get('stormsiren')?.position[2] < sandstorm.get('endurancemonument')?.position[2]);
  assert.equal([...sandstorm.values()].filter((placement) => placement.kind === 'character').length, 7);

  const floodgate = new Map(layoutFor('floodgate-continuity').map((placement) => [placement.id, placement]));
  assert.equal(floodgate.get('floodgatekit')?.kind, 'structure');
  assert.ok(floodgate.get('greywatercore')?.position[2] < floodgate.get('waterlinedebris')?.position[2]);
  assert.ok(floodgate.get('sluiceconduits')?.desiredSpan >= 7);

  const blackout = new Map(layoutFor('blackout-cistern').map((placement) => [placement.id, placement]));
  assert.equal(blackout.get('cisternfloorkit')?.kind, 'ground');
  assert.ok(blackout.get('cisternfloorkit')?.desiredSpan >= 17);
  assert.deepEqual(blackout.get('lastlightreactor')?.position.slice(0, 2), [0, 0]);
  assert.equal([...blackout.values()].filter((placement) => placement.kind === 'character').length, 7);
});

test('Relay District composition separates construction, objective, and phase landmarks', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const relay = LEVEL_ASSET_PLAN.find((level) => level.id === 'relay-district');
  const layout = createLevelSceneLayout(relay, metadataById);
  const byId = new Map(layout.map((placement) => [placement.id, placement]));

  assert.equal(byId.get('relaystreetkit')?.kind, 'ground');
  assert.ok(byId.get('relaystreetkit')?.position[2] > 6, 'street kit should establish the player-side route');
  assert.ok(byId.get('relaymast')?.position[0] < 0, 'relay landmark should sit left of the phase transformation');
  assert.ok(byId.get('broodinfestation')?.position[0] > 0, 'infestation should read as a separate phase landmark');
  assert.ok(byId.get('apartment')?.position[2] < -8, 'urban structures should form the rear perimeter');
  assert.ok(byId.get('boss_broodmaker')?.position[2] < byId.get('powerrelay')?.position[2], 'boss should stage behind the objective line');
});

test('Sanitizer Spire composition preserves a clear boss lane and connected high route', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const spire = LEVEL_ASSET_PLAN.find((level) => level.id === 'sanitizer-spire');
  const byId = new Map(createLevelSceneLayout(spire, metadataById).map((placement) => [placement.id, placement]));

  assert.ok(byId.get('suppressiontiles')?.position[2] > 6, 'floor states should occupy the player-side teaching area');
  assert.ok(byId.get('boss_sanitizer')?.position[2] < byId.get('censorshipnodes')?.position[2], 'boss should remain visible behind the support targets');
  assert.ok(Math.abs(byId.get('censorshipnodes')?.position[0]) > 3 && Math.abs(byId.get('powerrelay')?.position[0]) > 3, 'support devices should leave the central firing lane open');
  assert.ok(['cargolift', 'catwalk', 'stairs'].every((id) => byId.get(id)?.position[0] < -6), 'high-route modules should share the same arena flank');
  assert.ok(byId.get('spirefacade')?.position[2] < -9, 'press facade should close the rear arena edge');
  assert.ok(byId.get('terminal')?.position[0] < 0 && byId.get('ammostation')?.position[0] > 0, 'recovery controls should flank the central lane');
});

test('Ad-Zone Arena separates moving cover, floor identity, and airborne support', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const adZone = LEVEL_ASSET_PLAN.find((level) => level.id === 'ad-zone-arena');
  const byId = new Map(createLevelSceneLayout(adZone, metadataById).map((placement) => [placement.id, placement]));
  const billboard = registry.find((asset) => asset.id === 'billboardwall').build();
  const plaza = registry.find((asset) => asset.id === 'adplazakit').build();

  try {
    assert.deepEqual(billboard.getObjectByName('billboard_rotation_pivot')?.userData.rotationStops, [-1.0472, 0, 1.0472]);
    assert.ok(['sponsor_lane_tile', 'cable_crossing_tile', 'vendor_frontage_tile'].every((name) => plaza.getObjectByName(name)), 'plaza kit should expose reusable named modules');
  } finally {
    disposeObject3D(billboard);
    disposeObject3D(plaza);
  }

  assert.ok(byId.get('adplazakit')?.position[2] > 6, 'plaza modules should establish the player-side ground language');
  assert.ok(byId.get('billboardwall')?.position[0] > 6, 'moving billboard should reshape a side lane without masking the boss');
  assert.ok(byId.get('boss_zeppelin_pod')?.position[1] >= 5, 'Zeppelin support should occupy an elevated combat layer');
  assert.equal(byId.get('boss_captain')?.position[0], 0, 'Captain should retain the central confrontation lane');
});

test('Trend Wastes provides terrain modules and preserves a long central sightline', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const wastes = LEVEL_ASSET_PLAN.find((level) => level.id === 'trend-wastes');
  const byId = new Map(createLevelSceneLayout(wastes, metadataById).map((placement) => [placement.id, placement]));
  const terrain = registry.find((asset) => asset.id === 'wastesterrainkit').build();
  const windbreaks = registry.find((asset) => asset.id === 'windbreaks').build();

  try {
    assert.ok(['walkable_dune_slope', 'eroded_road_transition', 'dry_wash_and_rocks'].every((name) => terrain.getObjectByName(name)), 'terrain kit should expose three reusable construction modules');
    assert.ok(['state_safe', 'state_risky', 'state_collapsed'].every((name) => windbreaks.getObjectByName(name)), 'windbreak kit should expose three gameplay states');
  } finally {
    disposeObject3D(terrain);
    disposeObject3D(windbreaks);
  }

  assert.ok(byId.get('wastesterrainkit')?.position[2] > 6, 'terrain teaching modules should occupy the player-side exterior');
  assert.equal(byId.get('boss_shard_avatar')?.position[0], 0, 'Shard Avatar should retain the long central sightline');
  assert.ok(byId.get('stormbeacon')?.position[2] < byId.get('boss_shard_avatar')?.position[2], 'storm beacon should remain visible behind the encounter');
  assert.ok(Math.abs(byId.get('windbreaks')?.position[0]) > 5, 'windbreak states should shape a side route rather than close the center');
});

test('Freight Annex exposes modular yard construction and staged infection states', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const freight = LEVEL_ASSET_PLAN.find((level) => level.id === 'freight-annex');
  const byId = new Map(createLevelSceneLayout(freight, metadataById).map((placement) => [placement.id, placement]));
  const laneKit = registry.find((asset) => asset.id === 'freightlanekit').build();
  const infectedProps = registry.find((asset) => asset.id === 'infectedprops').build();
  const nest = registry.find((asset) => asset.id === 'industrialnest').build();

  try {
    assert.ok(['container_straight_module', 'container_inside_corner', 'container_endcap_gate'].every((name) => laneKit.getObjectByName(name)), 'freight lane kit should expose straight, corner, and endcap modules');
    assert.ok(['state_clean', 'state_infected', 'state_breached'].every((name) => infectedProps.getObjectByName(name)), 'infected props should expose three readable progression states');
    assert.ok(['infected_freight_machinery', 'relocation_burrow_mouth', 'machinery_tendril_overlay'].every((name) => nest.getObjectByName(name)), 'industrial nest should preserve separable gameplay components');
  } finally {
    disposeObject3D(laneKit);
    disposeObject3D(infectedProps);
    disposeObject3D(nest);
  }

  assert.ok(byId.get('freightlanekit')?.position[2] < -6, 'container modules should build the rear loading-yard edge');
  assert.ok(['loadingramp', 'catwalk', 'stairs', 'ladderplatform'].every((id) => byId.get(id)?.position[0] < -8), 'traversal modules should form one connected review loop on the same flank');
  assert.equal(byId.get('boss_broodmaker')?.position[0], 0, 'heavy Broodmaker should retain the central confrontation lane');
  assert.ok(byId.get('industrialnest')?.position[0] > 4 && byId.get('burrowbreach')?.position[0] < -4, 'primary infestation entrances should pressure opposite sides of the arena');
  assert.ok(byId.get('breachvent')?.position[0] > 7 && byId.get('burrowbreach')?.position[0] < -4, 'spawn entrances should telegraph attacks from distinct directions');
});

test('Mirror Garden provides radial construction modules and readable clone states', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const mirrorGarden = LEVEL_ASSET_PLAN.find((level) => level.id === 'mirror-garden');
  const byId = new Map(createLevelSceneLayout(mirrorGarden, metadataById).map((placement) => [placement.id, placement]));
  const paths = registry.find((asset) => asset.id === 'mirrorgardenpaths').build();
  const panels = registry.find((asset) => asset.id === 'mirrorpanels').build();
  const markers = registry.find((asset) => asset.id === 'generationmarkers').build();
  const emitter = registry.find((asset) => asset.id === 'splitring').build();

  try {
    assert.ok(['outer_concentric_path', 'inner_clone_loop', 'destructible_shortcut_thresholds', 'formal_planting_beds'].every((name) => paths.getObjectByName(name)), 'garden path kit should expose reusable radial construction modules');
    assert.ok(['state_intact', 'state_cracked', 'state_false_image', 'state_destroyed'].every((name) => panels.getObjectByName(name)), 'mirror panel family should expose all four gameplay states');
    assert.ok(['generation_single', 'generation_double', 'generation_overload'].every((name) => markers.getObjectByName(name)), 'floor markers should expose clone escalation states');
    assert.ok(['horizontal_pulse_ring', 'vertical_split_ring', 'radial_spawn_anchors'].every((name) => emitter.getObjectByName(name)), 'split-ring emitter should expose independent telegraph components');
  } finally {
    disposeObject3D(paths);
    disposeObject3D(panels);
    disposeObject3D(markers);
    disposeObject3D(emitter);
  }

  assert.ok(byId.get('mirrorgardenpaths')?.desiredSpan >= 14, 'concentric paths should establish the arena floor instead of reading as a small prop');
  assert.ok(byId.get('mirrorpanels')?.position[2] < -6, 'destructible mirrors should define the rear shortcut line');
  assert.equal(byId.get('boss_hydraclone')?.position[0], 0, 'Hydraclone should retain the central identification lane');
  assert.ok(['splitring', 'terminal', 'capturebeacon', 'powerrelay'].every((id) => Math.abs(byId.get(id)?.position[0]) > 4), 'clone devices should leave the center clear for split identification');
  assert.ok(['coverheights', 'peekcover', 'cornercover'].every((id) => Math.abs(byId.get(id)?.position[0]) > 7), 'cover should follow the outer garden ring');
});

test('Content Court exposes court sectors, mechanic states, and clear strike aisles', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const contentCourt = LEVEL_ASSET_PLAN.find((level) => level.id === 'content-court');
  const byId = new Map(createLevelSceneLayout(contentCourt, metadataById).map((placement) => [placement.id, placement]));
  const dais = registry.find((asset) => asset.id === 'tribunaldais').build();
  const mechanics = registry.find((asset) => asset.id === 'purgenode').build();
  const cover = registry.find((asset) => asset.id === 'courtbench').build();
  const aisles = registry.find((asset) => asset.id === 'courtsectoraisles').build();

  try {
    assert.ok(['raised_verdict_platform', 'sector_cyan', 'sector_orange', 'sector_purple', 'verdict_control_lectern'].every((name) => dais.getObjectByName(name)), 'tribunal dais should expose the center and three court sectors');
    assert.ok(['state_purge_active', 'state_purge_cleansed', 'state_strike_armed'].every((name) => mechanics.getObjectByName(name)), 'court mechanics should expose purge and strike states');
    assert.ok(['state_intact', 'state_damaged', 'state_destroyed'].every((name) => cover.getObjectByName(name)), 'court cover should expose its damage progression');
    assert.ok(['left_purge_aisle', 'right_strike_aisle', 'rear_verdict_threshold'].every((name) => aisles.getObjectByName(name)), 'court construction kit should expose both safe aisles and the verdict threshold');
  } finally {
    disposeObject3D(dais);
    disposeObject3D(mechanics);
    disposeObject3D(cover);
    disposeObject3D(aisles);
  }

  assert.ok(byId.get('courtsectoraisles')?.desiredSpan >= 14, 'strike-clearance aisles should establish the arena floor');
  assert.equal(byId.get('boss_adjudicator')?.position[0], 0, 'Adjudicator should retain the central firing line');
  assert.ok(byId.get('boss_adjudicator')?.position[1] > 1, 'Adjudicator should stand visibly on the tribunal dais');
  assert.deepEqual(byId.get('boss_adjudicator')?.position.slice(0, 1).concat(byId.get('boss_adjudicator')?.position[2]), [byId.get('tribunaldais')?.position[0], byId.get('tribunaldais')?.position[2]], 'boss and dais should share the same horizontal anchor');
  assert.ok(byId.get('purgenode')?.position[0] > 5 && byId.get('courtbench')?.position[0] < -6, 'mechanic and cover families should frame opposite court sectors');
  assert.ok(['cornercover', 'peekcover', 'breakablecover'].every((id) => Math.abs(byId.get(id)?.position[0]) >= 8), 'generic cover should remain on the outer aisles');
});

test('Server Cathedral preserves three route colors through the finale sequence', () => {
  const registry = createAssetRegistry({ THREE });
  const metadataById = new Map(registry.map((asset) => [asset.id, asset]));
  const cathedral = LEVEL_ASSET_PLAN.find((level) => level.id === 'server-cathedral');
  const byId = new Map(createLevelSceneLayout(cathedral, metadataById).map((placement) => [placement.id, placement]));
  const shell = registry.find((asset) => asset.id === 'cathedralkit').build();
  const windows = registry.find((asset) => asset.id === 'dashboardwindows').build();
  const choir = registry.find((asset) => asset.id === 'mirrorchoir').build();
  const altar = registry.find((asset) => asset.id === 'rootaltar').build();
  const choice = registry.find((asset) => asset.id === 'endchoice').build();
  const routes = registry.find((asset) => asset.id === 'cathedralroutes').build();

  try {
    assert.ok(['data_nave_floor', 'nave_arch', 'ceiling_ribs', 'route_channels', 'balcony_edge'].every((name) => shell.getObjectByName(name)), 'cathedral shell should expose its reusable architecture modules');
    assert.ok(['window_route_cyan', 'window_route_purple', 'window_route_orange'].every((name) => windows.getObjectByName(name)), 'dashboard windows should preserve the three route colors');
    assert.ok(['choir_rank_1', 'choir_rank_3', 'choir_rank_5', 'false_image_emitter'].every((name) => choir.getObjectByName(name)), 'Mirror Choir should expose ranks and false-image emitter independently');
    assert.ok(['central_root_core', 'logic_bridge_cyan', 'logic_bridge_purple', 'logic_bridge_orange', 'logic_bridge_neutral'].every((name) => altar.getObjectByName(name)), 'Root Altar should expose its core and logic bridges');
    assert.ok(['choice_free', 'choice_reset', 'decision_world_feedback_beacon'].every((name) => choice.getObjectByName(name)), 'ending console should expose both decisions and persistent feedback');
    assert.ok(['route_cyan_nave', 'route_purple_nave', 'route_orange_nave', 'logic_route_switch_crossing'].every((name) => routes.getObjectByName(name)), 'route kit should expose the three nave lanes and switch crossing');
  } finally {
    disposeObject3D(shell);
    disposeObject3D(windows);
    disposeObject3D(choir);
    disposeObject3D(altar);
    disposeObject3D(choice);
    disposeObject3D(routes);
  }

  assert.ok(byId.get('cathedralroutes')?.desiredSpan >= 14, 'route kit should establish the playable nave floor');
  assert.ok(byId.get('cathedralbackdrop')?.desiredSpan <= 25, 'distant megastructure should remain monumental without dwarfing the play space');
  assert.equal(byId.get('rootaltar')?.position[0], 0, 'Root Altar should anchor the central finale lane');
  assert.ok(byId.get('endchoice')?.position[0] > 6, 'ending choice should remain a distinct post-combat destination');
  assert.ok(['cargolift', 'catwalk', 'ladderplatform', 'stairs'].every((id) => byId.get(id)?.position[0] < -8), 'nave traversal modules should form one connected review route');
  assert.ok(['reinforcementdoor', 'shutter', 'breachvent'].every((id) => byId.get(id)?.position[0] > 9), 'phase-controlled enemy entries should occupy the opposite flank');
  assert.deepEqual(cathedral.characters, ['boss_algorithm'], 'Server Cathedral should include the implemented Algorithm boss');
  assert.deepEqual(byId.get('boss_algorithm')?.position.slice(0, 1).concat(byId.get('boss_algorithm')?.position[2]), [0, -3.3], 'Algorithm should occupy the Root Altar center');
});

test('environment builds own disposable material instances', () => {
  const assets = createEnvironmentAssetRegistry({ THREE });
  const first = assets.find((asset) => asset.id === 'warehouse').build();
  const second = assets.find((asset) => asset.id === 'warehouse').build();
  const firstMaterial = [];
  const secondMaterial = [];
  first.traverse((object) => { if (object.isMesh) firstMaterial.push(object.material); });
  second.traverse((object) => { if (object.isMesh) secondMaterial.push(object.material); });

  try {
    assert.ok(firstMaterial.length > 0);
    assert.notEqual(firstMaterial[0], secondMaterial[0]);
  } finally {
    disposeObject3D(first);
    disposeObject3D(second);
  }
});

test('environment lighting budget separates distant, decorative, and gameplay accents', () => {
  const assets = createEnvironmentAssetRegistry({ THREE });
  const inspect = (id) => {
    const root = assets.find((asset) => asset.id === id).build();
    const materials = new Set();
    root.traverse((object) => {
      if (!object.material) return;
      const sources = Array.isArray(object.material) ? object.material : [object.material];
      sources.forEach((material) => materials.add(material));
    });
    return { root, materials: [...materials] };
  };
  const samples = {
    backdrop: inspect('adzonebackdrop'),
    decorative: inspect('billboardwall'),
    ground: inspect('adplazakit'),
    objective: inspect('sponsorprojector'),
    enemy: inspect('enforcer')
  };
  const maxEmissive = ({ materials }) => Math.max(...materials.map((material) => material.emissiveIntensity || 0));

  try {
    assert.equal(maxEmissive(samples.backdrop), 0, 'distant backdrops should not compete through emission');
    assert.ok(maxEmissive(samples.decorative) <= .08, 'decorative screens should use painted color, not gameplay-strength glow');
    assert.ok(maxEmissive(samples.ground) > .08, 'level-specific ground route colors should remain luminous');
    assert.ok(maxEmissive(samples.objective) > .08, 'objective signals should retain the strongest environmental emission');
    assert.ok(maxEmissive(samples.enemy) >= 1.25, 'the embedded enemy preview must retain its original palette');
    const groundColors = new Set(samples.ground.materials.map((material) => material.color?.getHexString()));
    assert.ok(['4ea9a3', '644c82', 'b65c36'].every((color) => groundColors.has(color)), 'Ad-Zone ground keeps its cyan, purple, and orange identity');
  } finally {
    Object.values(samples).forEach(({ root }) => disposeObject3D(root));
  }
});

test('registered assets normalize to valid grounded export roots', () => {
  const registry = createAssetRegistry({ THREE });

  for (const asset of registry) {
    const prepared = prepareAssetForExport({ THREE, definition: asset, built: asset.build() });
    try {
      assert.equal(prepared.report.valid, true, `${asset.id}: ${prepared.report.issues.join(' ')}`);
      assert.ok(prepared.report.metrics.meshes > 0, `${asset.id} should contain meshes`);
      assert.ok(Math.abs(prepared.report.bounds.min.y) <= 0.001, `${asset.id} should be grounded`);
      assert.ok(Math.abs((prepared.report.bounds.min.x + prepared.report.bounds.max.x) / 2) <= 0.001, `${asset.id} should be centered on X`);
      assert.ok(Math.abs((prepared.report.bounds.min.z + prepared.report.bounds.max.z) / 2) <= 0.001, `${asset.id} should be centered on Z`);
      prepared.root.traverse((object) => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        assert.ok(materials.every((material) => material.isMeshStandardMaterial || material.isMeshBasicMaterial), `${asset.id} should use glTF-compatible mesh materials`);
      });
    } finally {
      disposeObject3D(prepared.root);
    }
  }
});
