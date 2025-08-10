// RunnerBot asset: slimmer, agile silhouette with long legs and narrow arms
// Exposes refs for simple limb animation

export function createRunnerBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armor: 0x8f989f,
      accent: 0xf97316,
      joints: 0x2a2d31,
      visor: 0x111827,
      glow: 0xf97316, // orange identity for rushers (overridable)
    },
    palette || {}
  );

  const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
  const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
  const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
  const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.8 });

  const add = (mesh, parent = group, position = null, material = null) => {
    if (material) mesh.material = material;
    if (position) mesh.position.set(position.x, position.y, position.z);
    parent.add(mesh);
    return mesh;
  };

  // Torso: slimmer and taller
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.65), matArmor), group, new THREE.Vector3(0, 1.55 * scale, 0));
  chest.userData.bodyPart = 'torso';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.05), matGlow), chest, new THREE.Vector3(0, 0.06, 0.36));
  // Shoulders
  add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), matAccent), chest, new THREE.Vector3(0.78, 0.2, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), matAccent), chest, new THREE.Vector3(-0.78, 0.2, 0));

  // Abdomen/hips
  const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.6), matAccent), group, new THREE.Vector3(0, 1.0 * scale, 0));
  const hips = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.65), matArmor), group, new THREE.Vector3(0, 0.62 * scale, 0));

  // Head with visor
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.65), matHead), group, new THREE.Vector3(0, 2.15 * scale, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.05), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.04, 0.34));
  // Back fins for silhouette
  const fins = new THREE.Group(); chest.add(fins); fins.position.set(0, 0.1, -0.35);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.06), matAccent), fins, new THREE.Vector3(0.3, 0, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.06), matAccent), fins, new THREE.Vector3(-0.3, 0, 0));

  // Arms: slimmer, longer forearms
  const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
  const mkArm = (side) => {
    const root = new THREE.Group(); root.position.set(0.78 * side, 1.5 * scale, 0); group.add(root);
    const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.7, 0.4), matJoint), root, new THREE.Vector3(0, -0.5, 0)); upper.userData.bodyPart='arm';
    const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), matAccent), upper, new THREE.Vector3(0, -0.85, 0)); fore.userData.bodyPart='arm';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.05), matGlow), fore, new THREE.Vector3(0.2 * side, -0.15, 0.22));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.45), matJoint), fore, new THREE.Vector3(0, -0.65, 0)).userData.bodyPart='arm';
    return root;
  };
  refs.rightArm = mkArm(1);
  refs.leftArm = mkArm(-1);

  // Legs: longer, slimmer for a runner
  const mkLeg = (side) => {
    const root = new THREE.Group(); root.position.set(0.32 * side, -0.05, 0); hips.add(root);
    const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.0, 0.45), matArmor), root, new THREE.Vector3(0, -0.75, 0)); thigh.userData.bodyPart='leg';
    const shin = add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.0, 0.4), matAccent), thigh, new THREE.Vector3(0, -1.05, 0)); shin.userData.bodyPart='leg';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.25, 0.75), matJoint), shin, new THREE.Vector3(0, -0.7, 0));
    // leg glow stripe
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.04), matGlow), shin, new THREE.Vector3(0.18 * side, -0.2, 0.2));
    return root;
  };
  refs.rightLeg = mkLeg(1); refs.leftLeg = mkLeg(-1);

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs };
}


