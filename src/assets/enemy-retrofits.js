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
    accent: createMaterial(THREE, accentColor, 0.8),
    pale: createMaterial(THREE, 0xdce6dc)
  };
}

function markRetrofit(built, variant) {
  built.root.userData.assetRevision = 'enemy-retrofit-mk2';
  built.root.userData.enemyVariant = variant;
  return built;
}

function correctRunnerKnife(refs) {
  if (!refs.knife) return;
  refs.knife.rotation.y += Math.PI;
  refs.knife.position.z = 0.10;
}

export function createEnhancedGruntBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.grunt, options.palette);
  const built = createGruntBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const torso = findPart(built.root, 'torso');
  const { dark, armor, accent } = materialsFor(THREE, palette.glow);

  const chestPanel = addPanel(
    THREE,
    torso,
    [[-0.36, 0.27], [0.36, 0.27], [0.43, 0.03], [0.22, -0.27], [-0.22, -0.27], [-0.43, 0.03]],
    0.09,
    [0, 0.01, 0.43],
    dark
  );
  addBox(THREE, chestPanel, [0.48, 0.10, 0.08], [0, 0.02, 0.08], accent);
  addBox(THREE, built.head, [0.64, 0.15, 0.16], [0, 0.10, 0.29], dark, [-0.05, 0, 0]);
  addBox(THREE, built.head, [0.48, 0.08, 0.08], [0, 0.08, 0.39], accent);
  addBox(THREE, built.head, [0.54, 0.14, 0.18], [0, -0.15, 0.27], armor, [0.10, 0, 0]);

  const shoulderPads = torso?.children.filter((child) => child.isMesh && Math.abs(child.position.x) > 0.5) || [];
  for (const shoulder of shoulderPads) {
    addBox(THREE, shoulder, [0.48, 0.07, 0.56], [0, 0.24, 0], dark);
    addBox(THREE, shoulder, [0.20, 0.055, 0.38], [0, 0.285, 0.07], armor);
  }
  addBox(THREE, refs.rightArm, [0.45, 0.34, 0.10], [0.02, -0.72, 0.26], dark);
  addBox(THREE, refs.leftArm, [0.45, 0.34, 0.10], [-0.02, -0.72, 0.26], dark);
  addBox(THREE, refs.rightArm, [0.08, 0.24, 0.06], [0.20, -0.72, 0.32], accent);
  addBox(THREE, refs.leftArm, [0.08, 0.24, 0.06], [-0.20, -0.72, 0.32], accent);
  return markRetrofit(built, 'grunt');
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
  return markRetrofit(built, 'gruntling');
}

export function createEnhancedShooterBot(options = {}) {
  const { THREE } = options;
  const palette = paletteFor(ENEMY_RETROFIT_PALETTES.shooter, options.palette);
  const built = createShooterBot({ ...options, palette });
  const refs = deriveRigRefs(THREE, built);
  const { dark, armor, accent } = materialsFor(THREE, palette.glow);

  built.root.rotation.y = 0;
  addBox(THREE, refs.gun, [0.35, 0.23, 0.62], [0, 0.06, -0.34], dark);
  addBox(THREE, refs.gun, [0.17, 0.32, 0.20], [0, -0.20, -0.30], armor, [-0.12, 0, 0]);
  addBox(THREE, refs.gun, [0.21, 0.17, 0.34], [0, 0.05, 0.24], armor);
  addCylinder(THREE, refs.gun, [0.085, 0.115], 0.22, [0, 0.06, -1.20], accent, [Math.PI / 2, 0, 0]);
  addBox(THREE, refs.rightArm, [0.48, 0.20, 0.58], [0.06, -0.17, 0.02], dark, [0, 0, -0.10]);
  addBox(THREE, refs.rightArm, [0.22, 0.09, 0.16], [0.20, -0.14, 0.31], accent);
  addBox(THREE, built.head, [0.19, 0.14, 0.08], [0.27, 0.15, 0.38], accent);
  return markRetrofit(built, 'shooter');
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
  return markRetrofit(built, 'runner');
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
  return markRetrofit(built, 'rusher_elite');
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
  return markRetrofit(built, 'rusher_explosive');
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
  return markRetrofit(built, 'bailiff');
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
  return markRetrofit(built, 'blocker');
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
  return markRetrofit(built, 'healer');
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
  return markRetrofit(built, 'sniper');
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
  return markRetrofit(built, 'flyer');
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
  return markRetrofit(built, 'warden');
}
