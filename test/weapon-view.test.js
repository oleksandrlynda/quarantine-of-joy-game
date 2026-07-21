import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { WeaponView } from '../src/weapons/view.js';

globalThis.window = globalThis.window || {};
const { Effects } = await import('../src/effects.js');

const source = fs.readFileSync(new URL('../src/weapons/view.js', import.meta.url), 'utf8');
const modelSource = fs.readFileSync(new URL('../src/weapons/models.js', import.meta.url), 'utf8');
const showcaseSource = fs.readFileSync(new URL('../weapons-model-enhancement-showcase.html', import.meta.url), 'utf8');
const effectsSource = fs.readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const demoSource = fs.readFileSync(new URL('../demo-level.html', import.meta.url), 'utf8');
const diagnosticSource = fs.readFileSync(new URL('../src/debug/weapon-performance-diagnostic-runner.js', import.meta.url), 'utf8');
const rifleBody = modelSource.slice(modelSource.indexOf("  } else if (id === 'rifle')"), modelSource.indexOf("  } else if (id === 'smg')"));
const paletteBody = source.slice(source.indexOf('      // Camera-attached viewmodels'), source.indexOf('      this._matBlade'));
const minigunBody = modelSource.slice(modelSource.indexOf("  } else if (id === 'minigun')"), modelSource.indexOf("  } else if (id === 'grenade')"));
const updateBody = source.slice(source.indexOf('    update(dt){'), source.indexOf('    // ---------- building ----------'));

test('the showcase and live view instantiate the same approved model factory', () => {
  assert.match(showcaseSource, /import \{ buildWeaponModel \} from '.\/src\/weapons\/models\.js'/);
  assert.match(source, /import \{ buildWeaponModel, createWeaponGeometryPool, WEAPON_MUZZLE_AXES \} from '.\/models\.js'/);
  assert.doesNotMatch(showcaseSource, /function enhancedModel\(/);
  assert.doesNotMatch(source, /const make(?:Pistol|Rifle|SMG|Shotgun|DMR|Minigun|Grenade|BeamSaber)/);
});

test('rifle does not add a translucent duplicate receiver over the weapon', () => {
  assert.doesNotMatch(rifleBody, /highlightBox/);
  assert.doesNotMatch(rifleBody, /\.transparent\s*=\s*true/);
  assert.doesNotMatch(rifleBody, /\.opacity\s*=/);
});

test('live weapons add a restrained gray boundary and a flat surface-detail plate', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  view.setWeapon('Rifle');
  const detail = view._current.meshes.find((mesh) => mesh.userData.part === 'surfaceDetail');
  const outlines = view._current.renderables.filter((object) => object.isLineSegments);

  assert.ok(detail, 'rifle should carry one authored 2D surface detail');
  assert.equal(detail.geometry, view._surfaceDetailGeometry, 'surface details should reuse one flat geometry');
  assert.ok(detail.material.map?.isDataTexture, 'surface detail should use the procedural technical marking');
  assert.ok(Math.abs(detail.rotation.x) <= Number.EPSILON, 'rifle detail should face outward from the receiver side');
  assert.equal(detail.position.z, .192, 'rifle detail should sit just beyond the visible receiver face');
  assert.ok(Math.abs(detail.scale.x - .528) <= Number.EPSILON, 'rifle detail should be 20% wider');
  assert.ok(Math.abs(detail.scale.y - .168) <= Number.EPSILON, 'rifle detail should be 20% taller');
  assert.equal(detail.material, view._matRifleDetail, 'rifle should use its high-contrast graphite detail material');
  const pixels = view._rifleDetailTexture.image.data;
  const bluePixel = Array.from({ length: pixels.length / 4 }, (_, index) => index * 4)
    .some((offset) => pixels[offset] === 69 && pixels[offset + 1] === 166 && pixels[offset + 2] === 255);
  assert.equal(bluePixel, true, 'rifle detail should contain a compact rifle-blue accent');
  assert.equal(view._matRifleWhite.color.getHex(), 0xaebbc0);
  assert.ok(view._current.meshes.some((mesh) => mesh.material === view._matRifleWhite), 'rifle body should use its cool-gray material');
  assert.ok(view._current.meshes.every((mesh) => mesh.material !== view._matWhite), 'rifle should not retain the shared near-white material');
  assert.ok(outlines.length >= 12, 'major weapon pieces should receive readable boundary edges');
  assert.equal(view._matOutline.color.getHex(), 0x69746f);
  view.clear();
});

test('weapon viewmodels share a color-preserving unlit material palette', () => {
  assert.match(paletteBody, /this\._matWhite = new THREE\.MeshBasicMaterial\(/);
  assert.match(paletteBody, /this\._weaponAccents = new Map\(/);
  assert.match(rifleBody, /m\.white/);
  assert.match(rifleBody, /\ba\b/);
  assert.doesNotMatch(paletteBody, /MeshStandardMaterial/);
  assert.doesNotMatch(paletteBody, /\b(?:roughness|metalness|emissive)\s*:/);
});

test('minigun has a dedicated connected and animated viewmodel', () => {
  assert.match(minigunBody, /spinner = new THREE\.Group\(\)/);
  assert.match(minigunBody, /cylX\(root, \.76, \.18/);
  assert.match(source, /this\._current\.spinner\.rotation\.x/);
});

test('muzzle flashes and tracers are anchored to the equipped model socket', () => {
  assert.match(effectsSource, /setMuzzleAnchor\(anchor\)/);
  assert.match(effectsSource, /this\._muzzleAnchor\.getWorldPosition\(v\)/);
  for (const entrypoint of [mainSource, demoSource, diagnosticSource]) {
    assert.match(entrypoint, /effects\.setMuzzleAnchor\(weaponView\.sockets\.muzzle\)/);
  }

  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  view.setWeapon('Shotgun');
  camera.updateWorldMatrix(true, true);
  const effects = Object.assign(Object.create(Effects.prototype), {
    THREE,
    camera,
    _muzzleAnchor: null,
    _muzzleGroup: new THREE.Group(),
    _muzzleFallback: new THREE.Vector3(.12, -.07, -.25)
  });
  camera.add(effects._muzzleGroup);
  effects.setMuzzleAnchor(view.sockets.muzzle);

  assert.equal(effects._muzzleGroup.parent, view.sockets.muzzle);
  assert.deepEqual(effects._muzzleGroup.position.toArray(), [0, 0, 0]);
  assert.ok(effects.getMuzzleWorldPos().distanceTo(view.getMuzzleWorldPos()) <= Number.EPSILON);
});

test('accepted fire animates the action-tagged lab parts and returns them to rest', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  view.setWeapon('Pistol');
  const [action] = view._current.actionParts;
  const restX = action.userData.basePosition.x;

  view.onFire();
  view.update(.045);
  assert.ok(action.position.x < restX, 'pistol action moves rearward during its cycle');

  view.update(.3);
  assert.ok(Math.abs(action.position.x - restX) <= Number.EPSILON, 'pistol action returns exactly to its authored position');
});

test('pistol uses the reduced first-person presentation scale', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  view.setWeapon('Pistol');
  const size = new THREE.Box3().setFromObject(view._model).getSize(new THREE.Vector3());

  assert.ok(Math.abs(size.z - .225) <= .001, 'pistol presentation length preserves more of the combat view');
});

test('beam saber rests in a diagonal sword stance instead of pointing like a spear', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  view.setWeapon('BeamSaber');
  camera.updateWorldMatrix(true, true);
  const blade = view._current.meshes.find(mesh => mesh.userData.part === 'blade');
  const heel = new THREE.Vector3(0, -.5, 0).applyMatrix4(blade.matrixWorld);
  const tip = new THREE.Vector3(0, .5, 0).applyMatrix4(blade.matrixWorld);
  const direction = tip.sub(heel).normalize();

  assert.ok(direction.x < -.5, 'blade crosses toward the left side of the screen');
  assert.ok(direction.y > .4, 'blade rises from the low-right hilt');
  assert.ok(direction.z > -.8, 'blade retains depth without pointing straight forward');
});

test('all playable viewmodels stay inside pooled geometry and role-thickness budgets', () => {
  const camera = new THREE.PerspectiveCamera();
  const view = new WeaponView(THREE, camera);
  const profiles = [
    ['Pistol', .16, .22],
    ['Rifle', .10, .15],
    ['SMG', .16, .22],
    ['Shotgun', .14, .20],
    ['DMR', .10, .14],
    ['Minigun', .28, .36],
    ['Grenade', .26, .32],
    ['Dynamite', .28, .5],
    ['Satellite', .75, 1.35],
    ['GravityWell', .28, .48],
    ['BeamSaber', .10, .15]
  ];

  for (const [name, minThickness, maxThickness] of profiles) {
    view.setWeapon(name);
    const bounds = new THREE.Box3().setFromObject(view._model);
    const size = bounds.getSize(new THREE.Vector3());
    const thickness = size.x / size.z;

    assert.ok(view._current.meshes.length <= 18, `${name} exceeds its mesh budget`);
    assert.equal(view._current.geometries.length, 4, `${name} must reuse the primitive pool`);
    if (name !== 'BeamSaber') {
      assert.ok(thickness >= minThickness && thickness <= maxThickness, `${name} thickness is out of role range`);
      assert.ok(Math.abs(bounds.min.z - view._muzzleLocal.z) <= .001, `${name} muzzle socket must stay at the front face`);
    }
    assert.ok(bounds.max.z <= -(camera.near + .05), `${name} rear face must stay beyond the near clip plane`);
    for (const mesh of view._current.meshes) {
      if (mesh.material !== view._matBlade) assert.equal(mesh.material.isMeshBasicMaterial, true);
    }
  }
});

test('weapon view keeps its established hip, ADS, and sprint composition', () => {
  assert.match(source, /this\._hipOffset = new THREE\.Vector3\(0\.135, -0\.105, 0\.0\)/);
  assert.match(updateBody, /this\._adsOffset\.set\(0\.02, -0\.03, -0\.02\)/);
  assert.match(updateBody, /this\._sprintOffset\.set\(0\.18, -0\.16, 0\.05\)/);
});

test('weapon movement update reuses offset vectors instead of allocating per frame', () => {
  assert.doesNotMatch(updateBody, /new (?:this\.)?THREE\.Vector3/);
});

test('debug basic material mode restores every original weapon material', () => {
  class BasicMaterial {
    constructor(options) { this.options = options; }
  }
  const originalA = { name: 'a' };
  const originalB = { name: 'b' };
  const meshA = { material: originalA };
  const meshB = { material: originalB };
  const view = Object.create(WeaponView.prototype);
  Object.assign(view, {
    THREE: { MeshBasicMaterial: BasicMaterial, LineBasicMaterial: BasicMaterial },
    _current: { meshes: [meshA, meshB] },
    _debugBasicMaterial: null,
    _debugOriginalMaterials: new Map(),
    debugBasicMaterial: false
  });

  view.setDebugBasicMaterial(true);
  assert.equal(meshA.material, meshB.material);
  assert.equal(view.debugBasicMaterial, true);

  view.setDebugBasicMaterial(false);
  assert.equal(meshA.material, originalA);
  assert.equal(meshB.material, originalB);
  assert.equal(view.debugBasicMaterial, false);
});
