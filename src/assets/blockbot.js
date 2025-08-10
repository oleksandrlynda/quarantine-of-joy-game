// BlockBot asset: builds a chunky robot from box pieces
// Returns { root, head } where head is a child mesh used for headshot logic

export function createBlockBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  // Palette defaults (subtle grays + dark joints)
  const colors = Object.assign(
    {
      armorLight: 0xbfc6cc,
      armorDark: 0x8f979d,
      joints: 0x2a2d31,
      visor: 0x111827,
      glow: 0xdff3ff,
    },
    palette || {}
  );

  // Materials
  const matArmorLight = new THREE.MeshLambertMaterial({ color: colors.armorLight });
  const matArmorDark = new THREE.MeshLambertMaterial({ color: colors.armorDark });
  const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
  const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.8 });

  const add = (mesh, parent = group, position = null, material = null) => {
    if (material) mesh.material = material;
    if (position) mesh.position.set(position.x, position.y, position.z);
    parent.add(mesh);
    return mesh;
  };

  // Torso
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.0), matArmorLight), group, new THREE.Vector3(0, 1.45 * scale, 0));
  chest.userData.bodyPart = 'torso';
  add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.1), matGlow), chest, new THREE.Vector3(0, 0.2, 0.55)); // chest strip
  // Shoulder caps
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), matArmorDark), chest, new THREE.Vector3(0.95, 0.3, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), matArmorDark), chest, new THREE.Vector3(-0.95, 0.3, 0));

  // Mid and pelvis
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.9), matArmorDark), group, new THREE.Vector3(0, 0.9 * scale, 0));
  const hips = add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.9), matArmorLight), group, new THREE.Vector3(0, 0.55 * scale, 0));

  // Head with visor slit
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), matHead), group, new THREE.Vector3(0, 2.05 * scale, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.06), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.05, 0.48));

  // Arms (upper + forearm blocks with glow stripe)
  const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
  const mkArm = (side) => {
    const root = new THREE.Group();
    root.position.set(0.95 * side, 1.45 * scale, 0);
    group.add(root);
    const shoulder = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.6), matArmorLight), root); shoulder.userData.bodyPart='arm';
    const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), matJoint), shoulder, new THREE.Vector3(0, -0.7, 0)); upper.userData.bodyPart='arm';
    const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.65), matArmorDark), upper, new THREE.Vector3(0, -0.85, 0)); fore.userData.bodyPart='arm';
    // glow stripe on forearm
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.05), matGlow), fore, new THREE.Vector3(0.28 * side, -0.05, 0.32));
    // fist
    const fist = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), matJoint), fore, new THREE.Vector3(0, -0.7, 0)); fist.userData.bodyPart='arm';
    return root;
  };
  refs.rightArm = mkArm(1);
  refs.leftArm = mkArm(-1);

  // Legs (thigh, shin, boot)
  const mkLeg = (side) => {
    const root = new THREE.Group();
    root.position.set(0.45 * side, -0.25, 0); // attach relative to hips
    hips.add(root);
    const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.65), matArmorDark), root, new THREE.Vector3(0, -0.55, 0)); thigh.userData.bodyPart='leg';
    const shin = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.6), matArmorLight), thigh, new THREE.Vector3(0, -0.9, 0)); shin.userData.bodyPart='leg';
    const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), matJoint), shin, new THREE.Vector3(0, -0.6, 0)); boot.userData.bodyPart='leg';
    return root;
  };
  refs.rightLeg = mkLeg(1);
  refs.leftLeg = mkLeg(-1);

  // Back vents for silhouette detail
  const vents = new THREE.Group();
  chest.add(vents);
  vents.position.set(0, 0.0, -0.45);
  for (let i = 0; i < 3; i++) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), matArmorDark), vents, new THREE.Vector3(0, 0.18 - i * 0.18, 0));
  }

  // Scaling
  group.scale.set(scale, scale, scale);

  return { root: group, head, refs };
}


