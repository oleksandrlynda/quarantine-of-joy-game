// Winged drone asset for flyers
// Returns { root, head, refs } where refs contains leftWing/rightWing/thruster to drive animation

export function createWingedDrone({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      body: 0x9aa3aa,
      wing: 0xbfc6cc,
      joint: 0x2a2d31,
      glow: 0xa855f7
    },
    palette || {}
  );

  const matBody = new THREE.MeshLambertMaterial({ color: colors.body });
  const matWing = new THREE.MeshLambertMaterial({ color: colors.wing });
  const matJoint = new THREE.MeshLambertMaterial({ color: colors.joint });
  const matHead = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: 0x111827 }));
  const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.8 });

  const add = (mesh, parent = group, position = null, material = null) => {
    if (material) mesh.material = material;
    if (position) mesh.position.set(position.x, position.y, position.z);
    parent.add(mesh);
    return mesh;
  };

  // Body pod
  const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), matBody), group, new THREE.Vector3(0, 1.6 * scale, 0));
  body.userData.bodyPart = 'torso';

  // Head/eye
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), matHead), body, new THREE.Vector3(0, 0.5, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), new THREE.MeshLambertMaterial({ color: 0x111827 })), head, new THREE.Vector3(0, 0.05, 0.28));

  // Wings
  const refs = { leftWing: null, rightWing: null, thruster: null };
  const mkWing = (side) => {
    const root = new THREE.Group(); root.position.set(0.6 * side, 1.6 * scale, 0); group.add(root);
    // shoulder joint
    const joint = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), matJoint), root);
    // wing panel
    const wing = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), matWing), root, new THREE.Vector3(0.6 * side, 0, 0));
    // slight initial cant so flapping is visible even when bank=0
    root.rotation.z = side > 0 ? -0.15 : 0.15;
    // small glow strip
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.04), matGlow), wing, new THREE.Vector3(-0.05 * side, 0.02, 0.18));
    return root;
  };
  refs.leftWing = mkWing(1);
  refs.rightWing = mkWing(-1);

  // Rear thruster/fin
  const tail = new THREE.Group(); body.add(tail); tail.position.set(0, -0.2, -0.45);
  refs.thruster = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), matGlow), tail);

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs };
}


