// GruntBot asset: compact, simple blocky enemy used for baseline melee units
// Returns { root, head, refs } for basic animation support

export function createGruntBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armor: 0xa8afb5,   // cool gray
      joints: 0x2a2d31,  // dark joints
      accent: 0x6b7280,  // darker panels
      visor: 0x111827,
      glow: 0xef4444,    // red identity for grunts (can be overridden)
    },
    palette || {}
  );

  const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
  const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
  const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
  const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.7 });

  const add = (mesh, parent = group, position = null, material = null) => {
    if (material) mesh.material = material;
    if (position) mesh.position.set(position.x, position.y, position.z);
    parent.add(mesh);
    return mesh;
  };

  // Torso: broad and flat for a heavy, basic look
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.85, 0.72), matArmor), group, new THREE.Vector3(0, 1.18 * scale, 0));
  chest.userData.bodyPart = 'torso';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.08), matGlow), chest, new THREE.Vector3(0, 0.06, 0.48));
  // Backpack brick for silhouette
  const backpack = add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.26), matAccent), chest, new THREE.Vector3(0, 0.0, -0.5));
  backpack.userData.bodyPart = 'torso';
  // Shoulders: big blocks
  const lShoulder = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.62), matAccent), chest, new THREE.Vector3(0.65, 0.16, 0));
  const rShoulder = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.62), matAccent), chest, new THREE.Vector3(-0.65, 0.16, 0));
  lShoulder.userData.bodyPart = 'torso'; rShoulder.userData.bodyPart = 'torso';

  // Mid and hips
  const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 0.64), matAccent), group, new THREE.Vector3(0, 0.78 * scale, 0)); abdomen.userData.bodyPart='torso';
  const hips = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.38, 0.68), matArmor), group, new THREE.Vector3(0, 0.45 * scale, 0)); hips.userData.bodyPart='torso';

  // Head cube with visor slit
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.56), matHead), group, new THREE.Vector3(0, 1.75 * scale, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.04, 0.1));

  const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };

  // Arms
  const mkArm = (side) => {
    const root = new THREE.Group(); root.position.set(0.72 * side, 1.55 * scale, 0); group.add(root);
    const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.44), matJoint), root, new THREE.Vector3(0, -0.46, 0)); upper.userData.bodyPart='arm';
    const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.48), matArmor), upper, new THREE.Vector3(0, -0.52, 0)); fore.userData.bodyPart='arm';
    const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.28, 0.05), matGlow), fore, new THREE.Vector3(0.23 * side, -0.04, 0.28)); stripe.userData.bodyPart='arm';
    const fist = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.23, 0.5), matJoint), fore, new THREE.Vector3(0, -0.42, 0)); fist.userData.bodyPart='arm';
    return root;
  };
  refs.rightArm = mkArm(1); refs.leftArm = mkArm(-1);

  // Legs
  const mkLeg = (side) => {
    const root = new THREE.Group(); root.position.set(0.30 * side, -0.2, 0); hips.add(root);
    const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.52), matArmor), root, new THREE.Vector3(0, -0.38, 0)); thigh.userData.bodyPart='leg';
    const shin = add(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.46, 0.48), matAccent), thigh, new THREE.Vector3(0, -0.54, 0)); shin.userData.bodyPart='leg';
    const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.26, 0.78), matJoint), shin, new THREE.Vector3(0, -0.36, 0)); boot.userData.bodyPart='leg';
    return root;
  };
  refs.rightLeg = mkLeg(1); refs.leftLeg = mkLeg(-1);

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs };
}


