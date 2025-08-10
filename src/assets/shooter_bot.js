// ShooterBot: simple biped with a right-hand gun
// Returns { root, head, refs: { gun, muzzle } }

export function createShooterBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armor: 0x9aa3aa,
      accent: 0x7b8187,
      joints: 0x2a2d31,
      gun: 0x222222,
      glow: 0x10b981,
    },
    palette || {}
  );

  const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
  const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
  const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: 0x111827 }));
  const matGun = new THREE.MeshLambertMaterial({ color: colors.gun });
  const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });

  const add = (mesh, parent = group, position = null, material = null) => {
    if (material) mesh.material = material;
    if (position) mesh.position.set(position.x, position.y, position.z);
    parent.add(mesh);
    return mesh;
  };

  // Torso
  const body = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 1.0), matArmor), group, new THREE.Vector3(0, 1.0 * scale + 0.6, 0));
  body.userData.bodyPart = 'torso';
  // Head
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), matHead), body, new THREE.Vector3(0, 1.0, 0));
  head.userData.bodyPart = 'head';

  // Arms: left simple; right with gun
  const left = new THREE.Group(); left.position.set(-0.75, 1.4, 0); group.add(left);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.5), matJoint), left, new THREE.Vector3(0, -0.5, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), matArmor), left, new THREE.Vector3(0, -1.1, 0));

  const right = new THREE.Group(); right.position.set(0.75, 1.85, 0); group.add(right);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.5), matJoint), right, new THREE.Vector3(0, -0.5, 0));
  const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), matArmor), right, new THREE.Vector3(0, -1.05, 0));
  // Gun attached at forearm end (higher and forward)
  const gun = new THREE.Group(); fore.add(gun); gun.position.set(0.25, -0.05, -0.38);
  // Construct with forward along -Z so lookAt works directly
  const gunBody = add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 1.35), matGun), gun, new THREE.Vector3(0, 0, -0.55));
  const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.95), matAccent), gun, new THREE.Vector3(0, 0.2, -0.28));
  const muzzle = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), matGlow), gun, new THREE.Vector3(0, 0, -0.78));

  // Legs (simple blocks)
  const mkLeg = (side) => {
    const root = new THREE.Group(); root.position.set(0.4 * side, 0.4, 0); group.add(root);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.55), matArmor), root, new THREE.Vector3(0, -0.35, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.55), matAccent), root, new THREE.Vector3(0, -0.95, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.8), matJoint), root, new THREE.Vector3(0, -1.3, 0));
  };
  mkLeg(1); mkLeg(-1);

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs: { gun, muzzle } };
}


