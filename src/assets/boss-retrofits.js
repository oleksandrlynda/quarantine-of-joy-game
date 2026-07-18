import { createBroodmakerAsset } from './boss_broodmaker.js';
import { createSanitizerAsset } from './boss_sanitizer.js';
import { createAdZeppelinAsset, createInfluencerCaptainAsset } from './boss_captain.js';
import { createShardAvatarAsset } from './boss_shard_avatar.js';
import { createHydracloneAsset } from './boss_hydraclone.js';
import { createStrikeAdjudicatorAsset } from './boss_adjudicator.js';

function material(THREE, color, emissiveIntensity = 0) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: emissiveIntensity ? color : 0x000000,
    emissiveIntensity
  });
}

function addBox(THREE, parent, size, position, mat, rotation = null) {
  if (!parent) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addCylinder(THREE, parent, radius, height, position, mat, rotation = null, segments = 8) {
  if (!parent) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
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

export function createEnhancedBroodmakerAsset({ THREE, mats, scale = 1, palette, rng = Math.random } = {}) {
  const built = createBroodmakerAsset({ THREE, mats, scale, palette, outline: true, rng });
  const { root, head, refs } = built;
  const torso = findPart(root, 'torso');
  const base = refs.burrowAnchor?.children?.[0];
  const armor = material(THREE, 0x51467f);
  const dark = material(THREE, 0x28233e);
  const flesh = material(THREE, 0x8e52af);
  const glow = material(THREE, 0xff78a8, 0.82);

  // A lower brow and jaw keep the face readable inside the large carapace.
  addBox(THREE, head, [1.35, .16, .18], [0, .30, .61], armor, [-.08, 0, 0]);
  addBox(THREE, head, [.76, .18, .16], [0, -.32, .61], dark, [.10, 0, 0]);

  // Side carapace breaks the rectangular torso without hiding the egg cluster.
  [-1, 1].forEach((side) => {
    addBox(THREE, torso, [.26, 1.38, 1.52], [1.16 * side, .12, -.04], armor, [0, 0, -.12 * side]);
    addBox(THREE, torso, [.12, .72, 1.30], [1.33 * side, .36, .04], dark, [0, 0, -.18 * side]);
    addBox(THREE, base, [.16, .70, .18], [.92 * side, .70, 1.18], flesh, [0, 0, .20 * side]);
  });
  addBox(THREE, base, [1.25, .14, .18], [0, 1.02, 1.18], armor, [-.08, 0, 0]);

  // Existing claw roots become explicit rig refs; hooked tips stay on those roots.
  const arms = (base?.children || []).filter((node) => !node.isMesh && Math.abs(node.position.x) > 1.35 && node.position.y > 1.2);
  refs.leftArm = arms.find((arm) => arm.position.x < 0) || null;
  refs.rightArm = arms.find((arm) => arm.position.x > 0) || null;
  [refs.leftArm, refs.rightArm].forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    addBox(THREE, arm, [.34, .22, .90], [.10 * side, -1.48, .72], dark, [-.32, 0, -.10 * side]);
    addBox(THREE, arm, [.16, .16, .52], [.26 * side, -1.55, 1.17], glow, [-.48, 0, -.16 * side]);
  });

  // A restrained hatch frame makes the phase-two weak point legible from profile.
  addBox(THREE, refs.dorsalCover, [1.75, .10, .18], [0, .18, -.38], dark);
  addBox(THREE, refs.dorsalCover, [.16, .42, .66], [-.92, .12, 0], armor, [0, 0, .18]);
  addBox(THREE, refs.dorsalCover, [.16, .42, .66], [.92, .12, 0], armor, [0, 0, -.18]);

  root.userData.forwardAxis = '+Z';
  root.userData.retrofit = 'broodmaker-mk2';
  return built;
}

export function createEnhancedSanitizerAsset({ THREE, mats, scale = 1, palette } = {}) {
  const built = createSanitizerAsset({ THREE, mats, scale, palette });
  const { root, head, refs } = built;
  const torso = findPart(root, 'torso');
  const armor = material(THREE, 0x4b5662);
  const dark = material(THREE, 0x151a1f);
  const trim = material(THREE, 0xc69d42);
  const glow = material(THREE, 0x93c5fd, .9);

  // Correct the factory's -Z baton while keeping the tip under the hand chain.
  refs.baton.rotation.y += Math.PI;
  refs.baton.position.z = .16;
  addBox(THREE, refs.baton, [.26, .20, .30], [0, 0, .42], dark);
  addBox(THREE, refs.baton, [.08, .08, .46], [0, 0, -.02], glow);

  // Suppression hardware is concentrated around the existing chest vents.
  addBox(THREE, torso, [1.62, .14, .18], [0, .67, .61], armor);
  [-1, 1].forEach((side) => {
    addBox(THREE, torso, [.20, .72, .18], [.72 * side, .16, .62], armor);
    addBox(THREE, torso, [.09, .48, .08], [.72 * side, .16, .76], glow);
  });
  addBox(THREE, head, [1.02, .13, .16], [0, .42, .42], armor, [-.08, 0, 0]);

  // A compact rear pressure tank supports the beam role without widening the arms.
  const tank = new THREE.Group();
  tank.position.set(0, 1.82 * scale, -.72);
  root.add(tank);
  addBox(THREE, tank, [.92, .86, .34], [0, 0, 0], dark);
  addBox(THREE, tank, [.72, .10, .38], [0, .28, 0], trim);
  addCylinder(THREE, tank, .08, .58, [-.30, 0, -.22], glow, [Math.PI / 2, 0, 0]);
  addCylinder(THREE, tank, .08, .58, [.30, 0, -.22], glow, [Math.PI / 2, 0, 0]);

  root.userData.forwardAxis = '+Z';
  root.userData.axisFix = 'baton-tip -Z to +Z';
  root.userData.retrofit = 'sanitizer-mk2';
  return built;
}

export function createEnhancedCaptainAsset({ THREE, mats, scale = 1.2, palette } = {}) {
  const built = createInfluencerCaptainAsset({ THREE, mats, scale, palette });
  const { root, head, refs } = built;
  const torso = findPart(root, 'torso');
  const armor = material(THREE, 0x69737d);
  const dark = material(THREE, 0x141820);
  const magenta = material(THREE, 0xff2ea6, .88);
  const cyan = material(THREE, 0x22e3ef, .88);

  // Correct the SMG and muzzle to the same +Z front as visor and chest screen.
  refs.gun.rotation.y += Math.PI;
  refs.gun.position.z = .34;
  addBox(THREE, refs.gun, [.28, .32, .34], [0, -.23, -.18], armor, [-.20, 0, 0]);
  addBox(THREE, refs.gun, [.16, .16, .34], [0, .12, .24], dark);
  addBox(THREE, refs.gun, [.08, .22, .16], [.16, .14, .18], cyan);

  // Frame the broadcast screen as the primary role landmark.
  addBox(THREE, torso, [1.16, .10, .12], [0, .42, .66], dark);
  addBox(THREE, torso, [1.16, .10, .12], [0, -.12, .66], dark);
  addBox(THREE, torso, [.10, .54, .12], [-.58, .15, .66], magenta);
  addBox(THREE, torso, [.10, .54, .12], [.58, .15, .66], cyan);

  // Left-arm projector and split antenna establish command asymmetry.
  const leftFore = refs.volleyHardpoints?.[0]?.parent;
  addBox(THREE, leftFore, [.66, .54, .18], [-.02, -.10, .34], dark, [-.08, 0, 0]);
  addBox(THREE, leftFore, [.42, .30, .10], [-.02, -.10, .48], cyan);
  addCylinder(THREE, head, .025, .62, [-.28, .70, -.05], dark, [0, 0, -.16]);
  addCylinder(THREE, head, .025, .72, [.28, .74, -.05], dark, [0, 0, .16]);
  addBox(THREE, head, [.13, .13, .13], [-.33, 1.00, -.05], magenta);
  addBox(THREE, head, [.13, .13, .13], [.33, 1.08, -.05], cyan);

  // The Zeppelin phase grants immunity, so the protection must be visible on
  // the Captain rather than existing only as a health-system rule.
  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.85, 1),
    new THREE.MeshBasicMaterial({
      color: 0x22e3ef,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      wireframe: true
    })
  );
  shield.visible = false;
  refs.shieldAnchor.add(shield);
  refs.shield = shield;

  root.userData.forwardAxis = '+Z';
  root.userData.axisFix = 'gun/muzzle -Z to +Z';
  root.userData.retrofit = 'captain-mk2';
  return built;
}

export function createEnhancedZeppelinAsset({ THREE, mats, scale = 2, podCount = 3, palette } = {}) {
  const built = createAdZeppelinAsset({ THREE, mats, scale, podCount, palette });
  const { root, refs } = built;
  const body = refs.body;
  const gondola = refs.gondola;
  const children = [...body.children];
  const hullParts = children.slice(0, 5);
  const fin = children.at(-1);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

  // The authored envelope points down local Z. Rotate its complete skin onto the
  // +X flight axis before laying out the gameplay anchors around that silhouette.
  hullParts.forEach((node) => {
    node.position.applyQuaternion(rotation);
    node.quaternion.premultiply(rotation);
  });
  body.position.set(0, 4, 0);
  gondola.position.set(0, 2.55, 0);

  const railCount = Math.max(1, refs.bombRails.length - 1);
  refs.bombRails.forEach((rail, index) => {
    rail.position.set(-2.3 + index * (4.6 / railCount), -1.32, 0);
  });
  refs.pods.forEach((pod, index) => {
    const lane = refs.pods.length === 1 ? 0 : -2.1 + index * (4.2 / (refs.pods.length - 1));
    const side = index % 2 === 0 ? 1 : -1;
    pod.root.position.set(lane, -1.04, .72 * side);
    pod.root.rotation.y = side > 0 ? 0 : Math.PI;
  });
  if (fin) fin.position.set(-3.22, .58, 0);

  const hull = hullParts[0]?.material || material(THREE, 0x3b4150);
  const dark = gondola.children?.[0]?.material || material(THREE, 0x1f2530);
  const glow = material(THREE, 0x22e3ef, .82);
  const brand = material(THREE, 0xff2ea6, .72);

  // Every secondary mass visibly intersects the envelope or a structural mount.
  // This avoids the old collection-of-floating-parts read at gameplay distance.
  const tailPlanes = [
    addBox(THREE, body, [.62, .12, 2.5], [-3.22, .05, 0], hull, [0, 0, .04]),
    addBox(THREE, body, [.62, 1.45, .12], [-3.22, .62, 0], hull, [0, 0, .05])
  ];
  addBox(THREE, body, [.10, .82, .10], [2.92, .62, 0], glow);

  const hullStruts = [-.52, .52].map((x, index) => (
    addBox(THREE, body, [.22, .92, .22], [x, -1.34, 0], index ? brand : glow, [0, 0, index ? -.08 : .08])
  ));
  const bombBay = [
    addBox(THREE, body, [4.95, .13, .16], [0, -1.27, -.42], dark),
    addBox(THREE, body, [4.95, .13, .16], [0, -1.27, .42], dark)
  ];
  refs.bombRails.forEach((rail) => {
    bombBay.push(addBox(THREE, body, [.10, .16, 1.02], [rail.position.x, -1.27, 0], glow));
  });

  addBox(THREE, gondola, [.92, .22, .96], [0, -.16, 0], dark);
  addBox(THREE, gondola, [1.38, .18, .58], [0, .43, 0], dark);
  addBox(THREE, gondola, [.18, .18, .94], [.44, .12, 0], glow);
  addBox(THREE, gondola, [.18, .18, .94], [-.44, .12, 0], brand);

  const podStruts = refs.pods.map((pod, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    pod.root.name = 'shield_generator_pod';
    const strut = addBox(
      THREE,
      body,
      [.52, .38, .48],
      [pod.root.position.x, -.92, .72 * side],
      hull,
      [0, 0, side * .08]
    );
    // A compact generator housing replaces the loose barrel silhouette while
    // retaining the cyan engine ring as the shootable-objective landmark.
    addBox(THREE, pod.root, [.86, .38, .48], [-.04, .02, 0], dark);
    addBox(THREE, pod.root, [.82, .09, .54], [0, .28, 0], hull);
    addBox(THREE, pod.root, [.58, .08, .52], [0, -.22, 0], glow);
    return strut;
  });

  refs.tailPlanes = tailPlanes;
  refs.hullStruts = hullStruts;
  refs.bombBay = bombBay;
  refs.podStruts = podStruts;

  root.userData.forwardAxis = '+X';
  root.userData.axisFix = 'longitudinal Z hull to runtime +X flight axis';
  root.userData.retrofit = 'zeppelin-mk4';
  return built;
}

export function createEnhancedShardAvatarAsset({ THREE, mats, scale = 1.2, palette } = {}) {
  const built = createShardAvatarAsset({ THREE, mats, scale, palette });
  const { root, head, refs } = built;
  const torso = head.parent;
  const dark = material(THREE, 0x171b27);
  const purple = material(THREE, 0x7c3aed, .88);
  const cyan = material(THREE, 0x22d3ee, .88);
  const pink = material(THREE, 0xf472b6, .82);

  // Bring the real core to the shell face and cage it without hiding the weakpoint.
  refs.core.position.z = 1.03;
  addBox(THREE, torso, [.12, .90, .12], [-.58, .24, 1.02], purple, [0, 0, .12]);
  addBox(THREE, torso, [.12, .90, .12], [.58, .24, 1.02], cyan, [0, 0, -.12]);
  addBox(THREE, torso, [1.06, .10, .12], [0, .78, 1.02], dark);
  addBox(THREE, torso, [1.06, .10, .12], [0, -.30, 1.02], dark);

  // Crown fragments distinguish the real avatar from its simplified mirages.
  addBox(THREE, head, [.16, .55, .16], [-.30, .64, -.04], purple, [0, 0, -.16]);
  addBox(THREE, head, [.16, .72, .16], [0, .73, -.06], cyan);
  addBox(THREE, head, [.16, .50, .16], [.30, .61, -.04], pink, [0, 0, .16]);

  // Segmented edge lights keep the orbiting plates readable during rotation.
  refs.plates.forEach((plate, index) => {
    const plateGlow = index % 2 ? cyan : purple;
    [-.46, 0, .46].forEach((z) => addBox(THREE, plate, [.24, .09, .26], [.13, 0, z], plateGlow));
  });

  root.userData.forwardAxis = 'radial';
  root.userData.retrofit = 'shard-avatar-mk2';
  return built;
}

export function createEnhancedHydracloneAsset({ THREE, mats, generation = 0, scale, palette } = {}) {
  const built = createHydracloneAsset({ THREE, mats, generation, scale, palette });
  const { root, head, refs } = built;
  const chest = refs.core.parent;
  const dark = material(THREE, 0x202428);
  const cyan = material(THREE, 0x22e3ef, .88);
  const magenta = material(THREE, 0xec59ff, .90);
  const armor = material(THREE, 0x66717e);

  // The original core is inside an opaque chest; move the actual gameplay ref
  // forward into a protected aperture so the replication identity is visible.
  refs.core.position.z = .55;
  addBox(THREE, chest, [.12, .76, .10], [-.48, .02, .54], cyan, [0, 0, .10]);
  addBox(THREE, chest, [.12, .76, .10], [.48, .02, .54], magenta, [0, 0, -.10]);
  addBox(THREE, chest, [.92, .10, .10], [0, .43, .54], dark);
  addBox(THREE, chest, [.92, .10, .10], [0, -.43, .54], dark);

  // Offset echo plates create a stable split silhouette across generations.
  addBox(THREE, refs.leftArm, [.18, .62, .76], [-.38, -.02, -.10], armor, [0, .18, .12]);
  addBox(THREE, refs.rightArm, [.18, .62, .76], [.38, -.02, -.10], armor, [0, -.18, -.12]);
  addBox(THREE, refs.leftArm, [.08, .48, .56], [-.49, -.02, .06], cyan);
  addBox(THREE, refs.rightArm, [.08, .48, .56], [.49, -.02, .06], magenta);
  addBox(THREE, head, [.84, .12, .14], [0, .24, .34], dark, [-.08, 0, 0]);
  addBox(THREE, head, [.26, .08, .08], [-.20, .42, .33], cyan);
  addBox(THREE, head, [.26, .08, .08], [.20, .42, .33], magenta);

  root.userData.forwardAxis = '+Z';
  root.userData.retrofit = 'hydraclone-mk2';
  return built;
}

export function createEnhancedAdjudicatorAsset({ THREE, mats, scale = 1, palette } = {}) {
  const built = createStrikeAdjudicatorAsset({ THREE, mats, scale, palette });
  const { root, head, refs } = built;
  const torso = findPart(root, 'torso');
  const dark = material(THREE, 0x172033);
  const trim = material(THREE, 0x526783);
  const glow = material(THREE, 0x60a5fa, .90);
  const strike = material(THREE, 0xf43f5e, .92);

  // Correct the gavel and its gameplay impact ref to the boss's +Z attack cone.
  refs.gavel.rotation.y += Math.PI;
  refs.gavel.position.z = .18;
  addBox(THREE, refs.gavelHead, [.72, .48, .46], [0, 0, 0], dark);
  addBox(THREE, refs.gavelHead, [.86, .22, .32], [0, 0, .08], glow);
  addBox(THREE, refs.gavel, [.28, .28, .22], [0, 0, -.04], trim);

  // Court crown, robe lapels and framed strike counter establish hierarchy.
  addBox(THREE, head, [1.16, .14, .18], [0, .47, .36], trim, [-.08, 0, 0]);
  addBox(THREE, head, [.14, .50, .14], [-.38, .72, -.04], glow, [0, 0, -.18]);
  addBox(THREE, head, [.14, .64, .14], [0, .78, -.06], glow);
  addBox(THREE, head, [.14, .50, .14], [.38, .72, -.04], glow, [0, 0, .18]);
  addBox(THREE, torso, [.22, 1.35, .12], [-.48, -.34, .75], trim, [0, 0, -.16]);
  addBox(THREE, torso, [.22, 1.35, .12], [.48, -.34, .75], trim, [0, 0, .16]);
  addBox(THREE, torso, [1.10, .16, .12], [0, .60, .76], dark);
  refs.strikePips.forEach((pip, index) => {
    addBox(THREE, torso, [.20, .20, .08], [-.55 + index * .28, .55, .75], strike, [0, 0, Math.PI / 4]);
  });

  // Dial ticks remain visual children of the boss root; sectorDial stays untouched.
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    addBox(THREE, root, [.10, .04, .34], [Math.sin(angle) * 1.18, .05, Math.cos(angle) * 1.18], glow, [0, angle, 0]);
  }

  root.userData.forwardAxis = '+Z';
  root.userData.axisFix = 'gavel/impact -Z to +Z';
  root.userData.retrofit = 'adjudicator-mk2';
  return built;
}
