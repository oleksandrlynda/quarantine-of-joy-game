// SniperBot v2: lean silhouette, scoped rifle, pads & backpack
// Returns { root, head, refs: { rifle, muzzle } }
export function createSniperBot({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor:  0x8f979d,
        accent: 0x6b7280,
        joints: 0x2a2d31,
        visor:  0x111827,
        gun:    0x202326,
        glow:   0x39d2ff     // cool visor/glass
      },
      palette || {}
    );
  
    // materials (still light-weight)
    const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
    const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
    const matHead  = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
    const matGun   = new THREE.MeshLambertMaterial({ color: colors.gun });
    const matGlow  = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });
  
    const add = (mesh, parent = group, position = null, material = null) => {
      if (material) mesh.material = material;
      if (position) mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };
  
    // ------- Torso / core -------
    // chest slimmer, taller; abdomen & backpack for silhouette
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.72), matArmor),
                      group, new THREE.Vector3(0, 1.55, 0));
    const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.45, 0.60), matAccent),
                        group, new THREE.Vector3(0, 1.05, 0.02));
    const backpack = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.30), matJoint),
                         group, new THREE.Vector3(0, 1.55, 0.45));
  
    // shoulder pads
    add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.62), matArmor), group, new THREE.Vector3( 0.72, 1.95, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.62), matArmor), group, new THREE.Vector3(-0.72, 1.95, 0));
  
    // Head + visor strip
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.64, 0.72), matHead),
                     group, new THREE.Vector3(0, 2.15, 0));
    head.userData.bodyPart = 'head';
    // visor bar (emissive)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.10, 0.05), matGlow), head, new THREE.Vector3(0, -0.05, 0.36));
  
    // ------- Arms -------
    // LEFT (support under barrel)
    const lRoot = new THREE.Group(); lRoot.position.set(-0.72, 1.85, 0); group.add(lRoot);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.42), matJoint), lRoot, new THREE.Vector3(0, -0.28, 0));
    const lFore = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.42), matArmor), lRoot, new THREE.Vector3(0, -0.85, -0.05));
    // slim hand block as support
    add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.34), matAccent), lFore, new THREE.Vector3(0.02, -0.38, -0.28));
  
    // RIGHT (trigger arm + rifle)
    const rRoot = new THREE.Group(); rRoot.position.set(0.72, 1.92, 0); group.add(rRoot);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.42), matJoint), rRoot, new THREE.Vector3(0, -0.28, 0));
    const rFore = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.42), matArmor), rRoot, new THREE.Vector3(0, -0.85, -0.03));
  
    // ------- Rifle (long, scoped, -Z forward) -------
    const rifle = new THREE.Group();
    rFore.add(rifle);
    rifle.position.set(0.28, -0.12, -0.52); // sits across both hands
  
    // receiver + handguard
    add(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.70), matGun), rifle, new THREE.Vector3(0, 0.10, -0.35));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.38), matGun), rifle, new THREE.Vector3(0, -0.02, -0.18));
  
    // barrel (long)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.10), matGun), rifle, new THREE.Vector3(0, 0.02, -1.40));
    // muzzle brake (visual pop)
    const muzzle = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), matGlow), rifle, new THREE.Vector3(0, 0.02, -2.45));
  
    // scope (boxy cylinder + glass front/back)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.70), matGun), rifle, new THREE.Vector3(0, 0.26, -0.55));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), matGlow), rifle, new THREE.Vector3(0, 0.26, -0.20)); // rear glass
    add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), matGlow), rifle, new THREE.Vector3(0, 0.26, -0.90)); // front glass
    // folded bipod under front
    add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.34), matJoint), rifle, new THREE.Vector3( 0.06, -0.16, -0.98));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.34), matJoint), rifle, new THREE.Vector3(-0.06, -0.16, -0.98));
  
    // tiny trigger/hand blocks (helps silhouette)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), matAccent), rifle, new THREE.Vector3(0.12, -0.12, -0.05));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), matAccent), rifle, new THREE.Vector3(-0.12, -0.12, -0.22));
  
    // ------- Legs (longer, with knee/boot) -------
    const mkLeg = (side) => {
      const root = new THREE.Group(); root.position.set(0.40 * side, 0.50, 0); group.add(root);
      // upper
      add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.48), matArmor), root, new THREE.Vector3(0, -0.31, 0));
      // lower
      add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.46), matAccent), root, new THREE.Vector3(0, -0.95, 0.02));
      // knee pad
      add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.50), matJoint), root, new THREE.Vector3(0, -0.64, 0.01));
      // boot
      add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.72), matJoint), root, new THREE.Vector3(0, -1.34, 0.08));
    };
    mkLeg(1); mkLeg(-1);
  
    // subtle forward lean
    group.rotation.x = -0.06;
  
    group.scale.set(scale, scale, scale);
    return { root: group, head, refs: { rifle, muzzle } };
}
  