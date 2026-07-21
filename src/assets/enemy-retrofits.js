// Production enemy retrofit factories.
//
// The original procedural factories remain unchanged so design reviews can
// compare the shipped baseline with these assets. Every addition is attached
// to an existing animated root (head, torso, arm, leg, wing, or emitter).

import { createGruntBot } from './gruntbot.js';
import { createGruntlingBot } from './gruntlingbot.js';
import { createShooterBot } from './shooter_bot.js';
import { createRunnerBot } from './runnerbot.js';
import { createBlockBot } from './blockbot.js';
import { createHealerBot } from './healer_bot.js';
import { createSniperBot } from './sniper_bot.js';
import { createWingedDrone } from './winged_drone.js';
import { createSwarmWarden } from './swarm_warden.js';
import { batchRigidAsset } from './rigid-batching.js';

export const ENEMY_RETROFIT_PALETTES = Object.freeze({
  grunt: { armor: 0x8f999d, accent: 0x4e5857, joints: 0x171c1b, visor: 0x111827, glow: 0xff4f46 },
  gruntling: { armor: 0x8589ad, accent: 0x46496b, joints: 0x171827, visor: 0x111827, glow: 0xa78bfa },
  shooter: { armor: 0x899497, accent: 0x44534e, joints: 0x171c1a, gun: 0x161b19, glow: 0x34d399 },
  runner: { armor: 0x758288, accent: 0xf97316, joints: 0x171b1d, visor: 0x111827, glow: 0xff8a28 },
  rusherElite: { armor: 0x717b86, accent: 0x6366f1, joints: 0x171827, visor: 0x0f172a, glow: 0x818cf8 },
  rusherExplosive: { armor: 0x777b72, accent: 0xd6a900, joints: 0x1d1c16, visor: 0x15140f, glow: 0xffdf38 },
  bailiff: { armor: 0x3d4c62, accent: 0x526783, joints: 0x111927, visor: 0x0b1220, glow: 0x7db7ff },
  blocker: { armorLight: 0xb5c0c5, armorDark: 0x6f7a7e, joints: 0x181d20, visor: 0x111827, glow: 0xdff8ff, edge: 0xffffff },
  healer: { armor: 0x9da8a6, accent: 0x64766c, joints: 0x18201b, visor: 0x111827, glow: 0xa3e635 },
  sniper: { armor: 0x798589, accent: 0x47555a, joints: 0x161b1e, visor: 0x111827, gun: 0x111719, glow: 0x4ee8ff },
  flyer: { body: 0x879398, wing: 0xb2bdc0, joint: 0x171a1d, glow: 0xc05cff },
  warden: { hull: 0x59646b, accent: 0x909da0, joint: 0x171b1d, glowA: 0xc05cff, glowB: 0x3ce6ed, visor: 0x111827 }
});

function paletteFor(defaults, palette, extra = null) {
  return { ...defaults, ...(palette || {}), ...(extra || {}) };
}

function createMaterial(THREE, color, emissiveIntensity = 0) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: emissiveIntensity ? color : 0x000000,
    emissiveIntensity,
    flatShading: true
  });
}

function addBox(THREE, parent, size, position, material, rotation) {
  if (!parent) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.userData.performanceDetail = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(THREE, parent, radii, height, position, material, rotation) {
  if (!parent) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, 8), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.userData.performanceDetail = true;
  parent.add(mesh);
  return mesh;
}

function addPanel(THREE, parent, points, depth, position, material, scale) {
  if (!parent) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geometry.center();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2] || 1);
  parent.add(mesh);
  return mesh;
}

function findPart(root, bodyPart) {
  let result = null;
  root.traverse((node) => {
    if (!result && node.userData?.bodyPart === bodyPart) result = node;
  });
  return result;
}

function deriveRigRefs(THREE, built) {
  const refs = built.refs || (built.refs = {});
  const directGroups = built.root.children.filter((child) => child.isGroup);
  if (!refs.leftArm || !refs.rightArm) {
    const arms = directGroups.filter((group) => group.position.y > 1.3 && Math.abs(group.position.x) > 0.35);
    refs.leftArm ||= arms.find((group) => group.position.x < 0) || null;
    refs.rightArm ||= arms.find((group) => group.position.x > 0) || null;
  }
  if (!refs.leftLeg || !refs.rightLeg) {
    const legs = directGroups.filter((group) => group.position.y < 0.85 && Math.abs(group.position.x) > 0.18);
    refs.leftLeg ||= legs.find((group) => group.position.x < 0) || null;
    refs.rightLeg ||= legs.find((group) => group.position.x > 0) || null;
  }
  return refs;
}

function materialsFor(THREE, accentColor) {
  return {
    dark: createMaterial(THREE, 0x151b18),
    armor: createMaterial(THREE, 0x77837d),
    accent: createMaterial(THREE, accentColor, 1.25),
    pale: createMaterial(THREE, 0xdce6dc)
  };
}

function markRetrofit(THREE, built, variant) {
  built.root.userData.assetRevision = 'enemy-retrofit-mk2';
  built.root.userData.enemyVariant = variant;
  batchRigidAsset({ THREE, built });
  return built;
}

function correctRunnerKnife(refs) {
  if (!refs.knife) return;
  refs.knife.rotation.y += Math.PI;
  refs.knife.position.z = 0.10;
}

function createMergedBoxGeometry(THREE, parts) {
  const source = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const sourcePositions = source.getAttribute('position');
  const sourceNormals = source.getAttribute('normal');
  const positions = [];
  const normals = [];
  const colors = [];
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const translation = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const color = new THREE.Color();

  for (const part of parts) {
    translation.fromArray(part.position || [0, 0, 0]);
    scale.fromArray(part.size || [1, 1, 1]);
    rotation.fromArray(part.rotation || [0, 0, 0]);
    quaternion.setFromEuler(rotation);
    matrix.compose(translation, quaternion, scale);
    normalMatrix.getNormalMatrix(matrix);
    color.set(part.color ?? 0xffffff);
    for (let index = 0; index < sourcePositions.count; index += 1) {
      position.fromBufferAttribute(sourcePositions, index).applyMatrix4(matrix);
      normal.fromBufferAttribute(sourceNormals, index).applyNormalMatrix(normalMatrix);
      positions.push(position.x, position.y, position.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  source.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.mergedPrimitiveCount = parts.length;
  return geometry;
}

function addMergedBoxes(THREE, parent, parts, material, {
  bodyPart = null,
  name = '',
  performanceDetail = false
} = {}) {
  const mesh = new THREE.Mesh(createMergedBoxGeometry(THREE, parts), material);
  mesh.name = name;
  if (bodyPart) mesh.userData.bodyPart = bodyPart;
  if (performanceDetail) mesh.userData.performanceDetail = true;
  parent.add(mesh);
  return mesh;
}

export function createEnhancedGruntBot(options = {}) {
  const { THREE, scale = 1 } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.grunt, options.palette);
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true
  });
  const glowMaterial = new THREE.MeshLambertMaterial({
    color: palette.glow,
    emissive: palette.glow,
    emissiveIntensity: .8,
    flatShading: true
  });
  const bodyPart = (size, position, color, rotation = [0, 0, 0]) => ({ size, position, color, rotation });

  const torso = addMergedBoxes(THREE, root, [
    bodyPart([.9, .86, .72], [0, 1.18, 0], palette.armor),
    bodyPart([.58, .3, .28], [0, 1.18, -.49], palette.accent),
    bodyPart([.54, .44, .64], [-.66, 1.34, 0], palette.accent),
    bodyPart([.54, .44, .64], [.66, 1.34, 0], palette.accent),
    bodyPart([.68, .3, .64], [0, .78, 0], palette.accent),
    bodyPart([.8, .38, .68], [0, .45, 0], palette.armor),
    bodyPart([.5, .18, .46], [0, 1.66, -.02], palette.joints)
  ], bodyMaterial, { bodyPart: 'torso', name: 'grunt-merged-torso' });
  const torsoDetail = addMergedBoxes(THREE, root, [
    bodyPart([.72, .42, .09], [0, 1.23, .405], 0x151b18),
    bodyPart([.22, .07, .42], [-.66, 1.57, .05], palette.armor),
    bodyPart([.22, .07, .42], [.66, 1.57, .05], palette.armor)
  ], bodyMaterial, {
    bodyPart: 'torso',
    name: 'grunt-merged-detail',
    performanceDetail: true
  });
  addMergedBoxes(THREE, root, [
    bodyPart([.5, .1, .07], [0, 1.28, .47], palette.glow)
  ], glowMaterial, { bodyPart: 'torso', name: 'grunt-chest-signal' });

  const head = new THREE.Group();
  head.name = 'grunt-head-rig';
  head.position.set(0, 1.82, 0);
  head.userData.bodyPart = 'head';
  root.add(head);
  addMergedBoxes(THREE, head, [
    bodyPart([.62, .46, .58], [0, 0, 0], 0x111827),
    bodyPart([.66, .15, .18], [0, .11, .29], 0x151b18, [-.05, 0, 0]),
    bodyPart([.56, .15, .2], [0, -.16, .27], palette.armor, [.1, 0, 0])
  ], bodyMaterial, { bodyPart: 'head', name: 'grunt-merged-head' });
  addMergedBoxes(THREE, head, [
    bodyPart([.5, .1, .07], [0, .07, .39], palette.glow)
  ], glowMaterial, { bodyPart: 'head', name: 'grunt-visor' });

  const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
  const buildArm = side => {
    const arm = new THREE.Group();
    arm.position.set(.72 * side, 1.55, 0);
    arm.userData.bodyPart = 'arm';
    root.add(arm);
    // Add glow first: the melee animation contract locates the first emissive
    // child to pulse during its windup/recover beats.
    addMergedBoxes(THREE, arm, [
      bodyPart([.08, .3, .06], [.22 * side, -.84, .3], palette.glow)
    ], glowMaterial, { bodyPart: 'arm', name: `grunt-${side < 0 ? 'left' : 'right'}-arm-signal` });
    addMergedBoxes(THREE, arm, [
      bodyPart([.54, .18, .62], [0, -.03, 0], 0x151b18),
      bodyPart([.42, .5, .44], [0, -.46, 0], palette.joints),
      bodyPart([.48, .58, .5], [0, -.96, .02], palette.armor),
      bodyPart([.52, .3, .52], [0, -1.35, .05], palette.joints)
    ], bodyMaterial, { bodyPart: 'arm', name: `grunt-${side < 0 ? 'left' : 'right'}-merged-arm` });
    return arm;
  };
  refs.leftArm = buildArm(-1);
  refs.rightArm = buildArm(1);

  const buildLeg = side => {
    const leg = new THREE.Group();
    leg.position.set(.3 * side, .25, 0);
    leg.userData.bodyPart = 'leg';
    root.add(leg);
    addMergedBoxes(THREE, leg, [
      bodyPart([.46, .52, .54], [0, -.38, 0], palette.armor),
      bodyPart([.42, .5, .5], [0, -.92, 0], palette.accent),
      bodyPart([.7, .28, .8], [0, -1.3, .1], palette.joints)
    ], bodyMaterial, { bodyPart: 'leg', name: `grunt-${side < 0 ? 'left' : 'right'}-merged-leg` });
    return leg;
  };
  refs.leftLeg = buildLeg(-1);
  refs.rightLeg = buildLeg(1);

  const built = { root, head, refs, torso, torsoDetail };
  return markRetrofit(THREE, built, 'grunt');
}

export function createEnhancedGruntlingBot(options = {}) {
  const { THREE } = options;
  const cfgGlow = options.cfg?.color != null ? { glow: options.cfg.color } : null;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.gruntling, options.palette, cfgGlow);
  const built = createGruntlingBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, accent } = materialsFor(THREE, palette.glow);

  addBox(THREE, built.head, [0.52, 0.12, 0.16], [0, -0.12, 0.27], dark, [0.10, 0, 0]);
  addCylinder(THREE, built.head, [0.025, 0.025], 0.46, [0.22, 0.32, -0.08], dark, [0, 0, -0.25]);
  addBox(THREE, built.head, [0.11, 0.11, 0.11], [0.12, 0.54, -0.08], accent, [0, 0.20, 0.20]);
  addBox(THREE, torso, [0.48, 0.34, 0.22], [0, 0.02, -0.46], dark);
  addBox(THREE, torso, [0.30, 0.08, 0.06], [0, -0.05, 0.43], accent);
  addBox(THREE, refs.rightArm, [0.25, 0.12, 0.36], [0.02, -1.10, 0.17], accent, [0.14, 0, 0]);
  addBox(THREE, refs.leftArm, [0.25, 0.12, 0.36], [-0.02, -1.10, 0.17], accent, [0.14, 0, 0]);
  return markRetrofit(THREE, built, 'gruntling');
}

export function createEnhancedShooterBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.shooter, options.palette);
  const built = createShooterBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, armor, accent, pale } = materialsFor(THREE, palette.glow);

  built.root.rotation.y = 0;
  const chestPlate = addPanel(
    THREE,
    torso,
    [[-0.34, 0.25], [0.34, 0.25], [0.42, 0.02], [0.24, -0.27], [-0.24, -0.27], [-0.42, 0.02]],
    0.08,
    [0, 0.01, 0.42],
    dark
  );
  refs.chestTargetBar = addBox(THREE, chestPlate, [0.44, 0.09, 0.07], [0, 0.05, 0.08], accent);
  addBox(THREE, chestPlate, [0.12, 0.20, 0.055], [-0.25, -0.02, 0.07], armor, [0, 0, -0.18]);
  addBox(THREE, chestPlate, [0.12, 0.20, 0.055], [0.25, -0.02, 0.07], armor, [0, 0, 0.18]);

  addBox(THREE, built.head, [0.66, 0.13, 0.18], [0, 0.15, 0.29], dark, [-0.05, 0, 0]);
  addBox(THREE, built.head, [0.18, 0.28, 0.12], [-0.33, -0.03, 0.25], armor, [0, 0, -0.08]);
  addBox(THREE, built.head, [0.18, 0.28, 0.12], [0.33, -0.03, 0.25], armor, [0, 0, 0.08]);
  refs.visorFocus = addBox(THREE, built.head, [0.22, 0.07, 0.07], [0.19, -0.02, 0.405], pale);

  addBox(THREE, refs.gun, [0.35, 0.23, 0.62], [0, 0.06, -0.34], dark);
  addBox(THREE, refs.gun, [0.17, 0.32, 0.20], [0, -0.20, -0.30], armor, [-0.12, 0, 0]);
  addBox(THREE, refs.gun, [0.21, 0.17, 0.34], [0, 0.05, 0.24], armor);
  addBox(THREE, refs.gun, [0.09, 0.09, 0.66], [-0.16, 0.06, -0.82], armor);
  addBox(THREE, refs.gun, [0.09, 0.09, 0.66], [0.16, 0.06, -0.82], armor);
  refs.muzzleBrake = addCylinder(THREE, refs.gun, [0.10, 0.13], 0.24, [0, 0.06, -1.20], accent, [Math.PI / 2, 0, 0]);
  addBox(THREE, refs.gun, [0.36, 0.055, 0.20], [0, 0.205, -0.43], pale);
  addBox(THREE, refs.rightArm, [0.48, 0.20, 0.58], [0.06, -0.17, 0.02], dark, [0, 0, -0.10]);
  addBox(THREE, refs.rightArm, [0.22, 0.09, 0.16], [0.20, -0.14, 0.31], accent);
  addBox(THREE, refs.leftArm, [0.42, 0.18, 0.42], [-0.02, -0.17, 0.05], dark, [0, 0, 0.10]);
  addBox(THREE, built.head, [0.19, 0.14, 0.08], [0.27, 0.15, 0.38], accent);
  return markRetrofit(THREE, built, 'shooter');
}

function addRunnerCoreDetails(THREE, built, palette) {
  const refs = deriveRigRefs(THREE, built);
  const { dark, accent } = materialsFor(THREE, palette.glow);
  correctRunnerKnife(refs);
  addBox(THREE, refs.rightArm, [0.52, 0.55, 0.54], [0.05, -0.72, 0.06], dark, [0, 0, -0.12]);
  addBox(THREE, refs.rightArm, [0.10, 0.56, 0.08], [0.29, -0.72, 0.31], accent);
  addBox(THREE, refs.leftLeg, [0.14, 0.18, 0.45], [-0.15, -1.78, -0.33], accent, [-0.35, 0, 0]);
  addBox(THREE, refs.rightLeg, [0.14, 0.18, 0.45], [0.15, -1.78, -0.33], accent, [-0.35, 0, 0]);
  addBox(THREE, built.head, [0.64, 0.12, 0.12], [0, 0.18, 0.31], accent, [-0.08, 0, 0]);
  return refs;
}

export function createEnhancedRunnerBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.runner, options.palette);
  const built = createRunnerBot({ ...options, palette });
  addRunnerCoreDetails(THREE, built, palette);
  return markRetrofit(THREE, built, 'runner');
}

export function createEnhancedEliteRusherBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.rusherElite, options.palette);
  const built = createRunnerBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, accent } = materialsFor(THREE, palette.glow);

  correctRunnerKnife(refs);
  const shoulderPads = torso?.children.filter((child) => child.isMesh && Math.abs(child.position.x) > 0.55) || [];
  for (const shoulder of shoulderPads) {
    addBox(THREE, shoulder, [0.58, 0.07, 0.56], [0, 0.22, 0], dark);
    addBox(THREE, shoulder, [0.34, 0.05, 0.38], [0, 0.27, 0.08], accent);
  }
  addBox(THREE, torso, [0.14, 0.62, 0.10], [0.27, 0.72, -0.38], accent, [0, 0, -0.16]);
  addBox(THREE, torso, [0.14, 0.62, 0.10], [-0.27, 0.72, -0.38], accent, [0, 0, 0.16]);
  addBox(THREE, torso, [0.54, 0.16, 0.08], [0, 0.08, 0.39], dark);
  addBox(THREE, refs.rightArm, [0.48, 0.54, 0.50], [0.04, -0.72, 0.04], dark, [0, 0, -0.10]);
  addBox(THREE, refs.rightArm, [0.08, 0.38, 0.06], [0.27, -0.72, 0.29], accent);
  addBox(THREE, built.head, [0.62, 0.11, 0.10], [0, 0.19, 0.32], accent, [-0.06, 0, 0]);
  return markRetrofit(THREE, built, 'rusher_elite');
}

export function createEnhancedExplosiveRusherBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.rusherExplosive, options.palette);
  const built = createRunnerBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, armor, accent } = materialsFor(THREE, palette.glow);

  correctRunnerKnife(refs);
  const coreFrame = addPanel(
    THREE,
    torso,
    [[-0.30, 0.25], [0.30, 0.25], [0.38, 0], [0.24, -0.25], [-0.24, -0.25], [-0.38, 0]],
    0.10,
    [0, 0.02, 0.42],
    dark
  );
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), accent);
  core.position.set(0, 0, 0.10);
  coreFrame.add(core);
  refs.payloadCore = core;
  for (const side of [-1, 1]) {
    const canister = addCylinder(THREE, torso, [0.11, 0.14], 0.55, [0.58 * side, -0.04, 0.04], armor);
    addCylinder(THREE, canister, [0.115, 0.115], 0.06, [0, 0.30, 0], accent);
    addCylinder(THREE, canister, [0.115, 0.115], 0.06, [0, -0.30, 0], accent);
  }
  addBox(THREE, built.head, [0.54, 0.09, 0.11], [0, 0.34, 0.26], accent, [-0.08, 0, 0]);
  addBox(THREE, refs.leftLeg, [0.08, 0.46, 0.06], [-0.20, -1.15, 0.23], accent);
  addBox(THREE, refs.rightLeg, [0.08, 0.46, 0.06], [0.20, -1.15, 0.23], accent);
  return markRetrofit(THREE, built, 'rusher_explosive');
}

export function createEnhancedBailiffBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.bailiff, options.palette);
  const built = createRunnerBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, armor, accent, pale } = materialsFor(THREE, palette.glow);

  if (refs.knife) refs.knife.visible = false;
  const gavel = new THREE.Group();
  gavel.position.set(0, -1.60, 0.20);
  refs.rightArm?.add(gavel);
  addBox(THREE, gavel, [0.12, 0.62, 0.12], [0, -0.42, 0.28], dark);
  addBox(THREE, gavel, [0.54, 0.24, 0.28], [0, -0.72, 0.28], accent);
  addBox(THREE, gavel, [0.40, 0.12, 0.30], [0, -0.72, 0.28], pale);
  refs.gavel = gavel;

  const crest = addPanel(
    THREE,
    torso,
    [[-0.25, 0.22], [0.25, 0.22], [0.32, 0], [0.18, -0.22], [-0.18, -0.22], [-0.32, 0]],
    0.08,
    [0, 0.04, 0.42],
    dark
  );
  addBox(THREE, crest, [0.28, 0.08, 0.06], [0, 0.01, 0.08], accent);
  addBox(THREE, refs.rightArm, [0.54, 0.48, 0.50], [0.06, -0.68, 0.04], armor, [0, 0, -0.10]);
  addBox(THREE, refs.rightArm, [0.09, 0.34, 0.06], [0.29, -0.68, 0.29], accent);
  addBox(THREE, built.head, [0.60, 0.12, 0.11], [0, 0.18, 0.31], accent, [-0.05, 0, 0]);
  return markRetrofit(THREE, built, 'bailiff');
}

export function createEnhancedBlockBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.blocker, options.palette);
  const built = createBlockBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, armor, accent, pale } = materialsFor(THREE, palette.glow);
  const shieldShape = [[-0.37, 0.55], [0.27, 0.55], [0.43, 0.34], [0.43, -0.39], [0.24, -0.55], [-0.37, -0.49], [-0.46, -0.24], [-0.46, 0.35]];

  addBox(THREE, refs.leftArm, [0.38, 0.14, 0.22], [-0.28, -0.83, 0.02], dark);
  const shield = addPanel(THREE, refs.leftArm, shieldShape, 0.13, [-0.54, -0.83, 0.02], dark);
  shield.rotation.y = -Math.PI / 2;
  const shieldFace = addPanel(THREE, shield, shieldShape, 0.06, [0, 0, 0.10], armor, [0.78, 0.78, 1]);
  addBox(THREE, shieldFace, [0.50, 0.08, 0.055], [-0.01, 0.13, 0.08], accent);
  addBox(THREE, shieldFace, [0.07, 0.58, 0.055], [0.22, -0.06, 0.08], pale);
  addBox(THREE, refs.rightArm, [0.66, 0.20, 0.68], [0.04, -0.40, 0.02], dark);
  addBox(THREE, built.head, [1.00, 0.15, 0.20], [0, 0.32, 0.34], pale, [-0.08, 0, 0]);
  refs.shield = shield;
  return markRetrofit(THREE, built, 'blocker');
}

export function createEnhancedHealerBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.healer, options.palette);
  const built = createHealerBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, accent, pale } = materialsFor(THREE, palette.glow);

  if (refs.auraEmitter) {
    const orbitA = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 5, 28), accent);
    orbitA.userData.performanceDetail = true;
    orbitA.rotation.y = Math.PI / 2;
    refs.auraEmitter.add(orbitA);
    refs.signalMeshes?.push(orbitA);
    const orbitB = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.02, 5, 28), pale);
    orbitB.userData.performanceDetail = true;
    orbitB.rotation.x = Math.PI / 2;
    refs.auraEmitter.add(orbitB);
  }
  addCylinder(THREE, built.head, [0.025, 0.025], 0.48, [0, 0.48, 0], dark);
  addBox(THREE, built.head, [0.17, 0.12, 0.17], [0, 0.74, 0], accent, [0, 0.25, 0]);
  return markRetrofit(THREE, built, 'healer');
}

export function createEnhancedSniperBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.sniper, options.palette);
  const built = createSniperBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, armor, accent } = materialsFor(THREE, palette.glow);

  built.head.scale.set(0.88, 0.84, 0.88);
  built.head.position.y += 0.14;
  refs.rifle.rotation.y += Math.PI;
  refs.rifle.position.z = 0.28;
  addBox(THREE, refs.rifle, [0.34, 0.29, 0.82], [0, 0.26, -0.55], dark);
  addCylinder(THREE, refs.rifle, [0.11, 0.15], 0.28, [0, 0.02, -2.48], accent, [Math.PI / 2, 0, 0]);
  addBox(THREE, refs.rifle, [0.05, 0.31, 0.40], [0.13, -0.23, -1.10], armor, [0, 0, -0.12]);
  addBox(THREE, refs.rifle, [0.05, 0.31, 0.40], [-0.13, -0.23, -1.10], armor, [0, 0, 0.12]);
  addBox(THREE, built.head, [0.48, 0.18, 0.28], [0.22, 0.28, 0.15], armor, [0, 0, -0.12]);
  addCylinder(THREE, built.head, [0.08, 0.08], 0.18, [0.34, 0.28, 0.34], accent, [Math.PI / 2, 0, 0]);
  addBox(THREE, refs.rightArm, [0.50, 0.25, 0.64], [0.04, -0.12, 0.02], armor, [0, 0, -0.12]);
  return markRetrofit(THREE, built, 'sniper');
}

export function createEnhancedWingedDrone(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.flyer, options.palette);
  const built = createWingedDrone({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, accent } = materialsFor(THREE, palette.glow);
  const eye = built.head?.children.find((child) => child.isMesh);

  built.root.userData.isFlyer = true;
  if (eye) eye.material = accent;
  addBox(THREE, refs.leftWing, [0.16, 0.15, 0.34], [0.02, 0.02, 0], dark, [0, 0, -0.12]);
  addBox(THREE, refs.rightWing, [0.16, 0.15, 0.34], [-0.02, 0.02, 0], dark, [0, 0, 0.12]);
  addBox(THREE, refs.leftWing, [0.08, 0.05, 0.20], [0.12, 0.10, 0.17], accent);
  addBox(THREE, refs.rightWing, [0.08, 0.05, 0.20], [-0.12, 0.10, 0.17], accent);
  addBox(THREE, refs.thruster, [0.08, 0.28, 0.18], [0, 0.16, -0.06], accent);
  return markRetrofit(THREE, built, 'flyer');
}

export function createEnhancedSwarmWarden(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.warden, options.palette);
  const built = createSwarmWarden({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, armor, accent, pale } = materialsFor(THREE, palette.glowA);

  built.root.userData.isFlyer = true;
  addCylinder(THREE, built.head, [0.025, 0.025], 0.50, [0.30, 0.52, 0.02], dark, [0, 0, -0.22]);
  addCylinder(THREE, built.head, [0.025, 0.025], 0.50, [-0.30, 0.52, 0.02], dark, [0, 0, 0.22]);
  addBox(THREE, built.head, [0.12, 0.12, 0.12], [0.20, 0.75, 0.02], accent, [0, 0.20, 0]);
  addBox(THREE, built.head, [0.12, 0.12, 0.12], [-0.20, 0.75, 0.02], accent, [0, -0.20, 0]);
  addBox(THREE, refs.leftWing, [0.72, 0.06, 0.42], [1.45, -0.02, 0.02], armor, [0, 0.18, -0.08]);
  addBox(THREE, refs.rightWing, [0.72, 0.06, 0.42], [-1.45, -0.02, 0.02], armor, [0, -0.18, 0.08]);
  for (const [index, bay] of (refs.bays || []).entries()) {
    addBox(THREE, bay, [0.18, 0.035, 0.035], [0, -0.10, -0.26], index % 2 ? accent : pale);
  }
  if (refs.recallEmitter) {
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      addBox(THREE, refs.recallEmitter, [0.10, 0.10, 0.10], [Math.cos(angle) * 1.1, 0, Math.sin(angle) * 1.1], accent, [0, angle, 0]);
    }
  }
  refs.recallRing = refs.recallEmitter?.children?.[0] || null;
  refs.thrusterGlows = (refs.thrusters || []).map(thruster => thruster.children?.[1]).filter(Boolean);
  return markRetrofit(THREE, built, 'warden');
}
