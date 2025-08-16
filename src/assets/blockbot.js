// BlockBot v2 (Tank): chunky silhouette + white-outline panels + back reactor
// Faces +Z. Returns { root, head, refs }.
export function createBlockBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armorLight: 0xbfc6cc,
      armorDark:  0x8f979d,
      joints:     0x2a2d31,
      visor:      0x111827,
      glow:       0xdff3ff, // soft white-cyan
      edge:       0xffffff  // white outline strips
    },
    palette || {}
  );

  // materials
  const matArmorLight = new THREE.MeshLambertMaterial({ color: colors.armorLight });
  const matArmorDark  = new THREE.MeshLambertMaterial({ color: colors.armorDark });
  const matJoint      = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead       = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
  const matGlow       = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });
  const matEdge       = new THREE.MeshLambertMaterial({ color: colors.edge, emissive: colors.edge, emissiveIntensity: 0.22 });

  const add = (mesh, parent = group, pos = null, mat = null) => {
    if (mat) mesh.material = mat;
    if (pos) mesh.position.set(pos.x, pos.y, pos.z);
    parent.add(mesh);
    return mesh;
  };

  // ---------- CHEST / CORE ----------
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.12, 1.02), matArmorLight),
                    group, new THREE.Vector3(0, 1.46 * scale, 0));
  chest.userData.bodyPart = 'torso';

  // front reactor strip
  add(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.28, 0.10), matGlow), chest, new THREE.Vector3(0, 0.22, 0.56));

  // white outline frame (thin bars)
  const edge = (sx, sy, sz, px, py, pz) => add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), matEdge), chest, new THREE.Vector3(px, py, pz));
  edge(1.58, 0.05, 0.06, 0,  0.56,  0.52); // top
  edge(1.58, 0.05, 0.06, 0, -0.56,  0.52); // bottom
  edge(0.05, 1.10, 0.06, 0.79, 0.00, 0.52); // right
  edge(0.05, 1.10, 0.06,-0.79, 0.00, 0.52); // left

  // layered shoulder caps
  const shoulder = (side) => {
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.52, 0.92), matArmorDark), chest, new THREE.Vector3(0.98 * side, 0.30, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 0.96), matEdge), cap, new THREE.Vector3(0, 0.28, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, 0.84), matEdge), cap, new THREE.Vector3(0, -0.28, 0));
  };
  shoulder( 1); shoulder(-1);

  // mid + pelvis blocks
  add(new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.36, 0.90), matArmorDark), group, new THREE.Vector3(0, 0.94 * scale, 0));
  const hips = add(new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.52, 0.92), matArmorLight), group, new THREE.Vector3(0, 0.58 * scale, 0));
  // hip edge
  add(new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.96), matEdge), hips, new THREE.Vector3(0, 0.28, 0));

  // ---------- HEAD ----------
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.82, 0.92), matHead),
                   group, new THREE.Vector3(0, 2.08 * scale, 0));
  head.userData.bodyPart = 'head';
  // visor slit
  add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.06), new THREE.MeshLambertMaterial({ color: colors.visor })),
      head, new THREE.Vector3(0, 0.06, 0.50));
  // head rim
  add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.96), matEdge), head, new THREE.Vector3(0, 0.44, 0));

  // ---------- ARMS ----------
  const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };

  const mkArm = (side) => {
    const root = new THREE.Group();
    root.position.set(0.98 * side, 1.46 * scale, 0);
    group.add(root);

    const shoulderBlock = add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.56, 0.64), matArmorLight), root);
    const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.58), matJoint), shoulderBlock, new THREE.Vector3(0, -0.70, 0));
    const fore  = add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.84, 0.68), matArmorDark), upper, new THREE.Vector3(0, -0.88, 0));

    // forearm white outline + glow stripe
    add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.72), matEdge), fore, new THREE.Vector3(0, 0.46, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.52, 0.06), matGlow), fore, new THREE.Vector3(0.30 * side, -0.06, 0.34));

    // fist + knuckle edge
    const fist = add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.44, 0.58), matJoint), fore, new THREE.Vector3(0, -0.74, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.62), matEdge), fist, new THREE.Vector3(0, -0.22, 0));
    return root;
  };
  refs.rightArm = mkArm( 1);
  refs.leftArm  = mkArm(-1);

  // ---------- LEGS ----------
  const mkLeg = (side) => {
    const root = new THREE.Group(); hips.add(root);
    root.position.set(0.46 * side, -0.26, 0);

    const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.66), matArmorDark), root, new THREE.Vector3(0, -0.56, 0));
    const shin  = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.80, 0.62), matArmorLight), thigh, new THREE.Vector3(0, -0.92, 0));
    // knee pad w/ edge
    const knee  = add(new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.20, 0.70), matJoint), shin, new THREE.Vector3(0, 0.16, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 0.74), matEdge), knee, new THREE.Vector3(0, 0.08, 0));
    // boot + toe cap edge
    const boot  = add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.36, 0.94), matJoint), shin, new THREE.Vector3(0, -0.64, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.06, 1.00), matEdge), boot, new THREE.Vector3(0, -0.18, 0));
    return root;
  };
  refs.rightLeg = mkLeg( 1);
  refs.leftLeg  = mkLeg(-1);

  // ---------- BACK REACTOR / VENTS ----------
  const back = new THREE.Group(); chest.add(back); back.position.set(0, 0.00, -0.50);
  // central reactor can + glow ring
  add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.64, 0.34), matArmorDark), back);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 28), matGlow);
  ring.rotation.x = Math.PI / 2; ring.position.set(0, 0, -0.22); back.add(ring);
  // vents
  for (let i = 0; i < 3; i++) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.06), matArmorDark), back, new THREE.Vector3(0, 0.18 - i * 0.18, 0.02));
  }
  // top handle edge
  add(new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.06, 0.40), matEdge), back, new THREE.Vector3(0, 0.36, 0));

  // scale
  group.scale.set(scale, scale, scale);
  return { root: group, head, refs };
}
