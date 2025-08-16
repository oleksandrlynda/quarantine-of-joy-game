// RunnerBot v2 — agile silhouette with orange accents + glowing knife
// Returns { root, head, refs: { leftArm,rightArm,leftLeg,rightLeg, knife, blade } }

export function createRunnerBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armor: 0x87929a,      // body plates
      accent: 0xf97316,     // orange trims/panels
      joints: 0x1f2326,     // dark rubber/mech
      visor: 0x111827,      // head base
      glow:  0xf97316       // emissive orange
    },
    palette || {}
  );

  const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
  const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
  const matJoint  = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead   = (mats?.head ? mats.head.clone()
                                : new THREE.MeshLambertMaterial({ color: colors.visor }));
  const matGlow   = new THREE.MeshLambertMaterial({
    color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.95
  });

  const add = (mesh, parent = group, pos = null, mat = null) => {
    if (mat) mesh.material = mat;
    if (pos) mesh.position.set(pos.x, pos.y, pos.z);
    parent.add(mesh);
    return mesh;
  };

  // Slight forward lean to feel “in motion”
  group.rotation.x = -0.06;

  // Torso (tall & slim) + chest light bar
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.08, 0.70), matArmor),
                    group, new THREE.Vector3(0, 1.55 * scale, 0));
  chest.userData.bodyPart = 'torso';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.10, 0.05), matGlow), chest,
      new THREE.Vector3(0, 0.05, 0.38));

  // Shoulders (orange caps)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.62), matAccent), chest,
      new THREE.Vector3( 0.80, 0.18, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.34, 0.62), matAccent), chest,
      new THREE.Vector3(-0.80, 0.18, 0));

  // Abdomen / hips
  const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.42, 0.62), matAccent),
                      group, new THREE.Vector3(0, 1.06 * scale, 0));
  const hips    = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.42, 0.68), matArmor),
                      group, new THREE.Vector3(0, 0.66 * scale, 0));

  // Head with visor slit (non-emissive material keeps your global head shader)
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.60, 0.66), matHead),
                   group, new THREE.Vector3(0, 2.18 * scale, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.09, 0.05),
      new THREE.MeshLambertMaterial({ color: colors.visor })), head,
      new THREE.Vector3(0, 0.04, 0.36));

  // Slim back fins for speed silhouette
  const fins = new THREE.Group(); chest.add(fins); fins.position.set(0, 0.12, -0.36);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.06), matAccent), fins, new THREE.Vector3( 0.28, 0, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.06), matAccent), fins, new THREE.Vector3(-0.28, 0, 0));

  // Refs for anim
  const refs = { leftArm:null, rightArm:null, leftLeg:null, rightLeg:null, knife:null, blade:null };

  // Arms (narrow upper, orange forearm bars)
  const mkArm = (side) => {
    const root = new THREE.Group(); root.position.set(0.78 * side, 1.52 * scale, 0); group.add(root);
    const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.60, 0.40), matJoint),
                      root, new THREE.Vector3(0, -0.46, 0)); upper.userData.bodyPart='arm';
    const fore  = add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.88, 0.42), matAccent),
                      upper, new THREE.Vector3(0, -0.82, 0)); fore.userData.bodyPart='arm';
    // Orange light stripe along forearm
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.05), matGlow), fore,
        new THREE.Vector3(0.20 * side, -0.12, 0.24));
    // Hand block
    const hand = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.44), matJoint),
                     fore, new THREE.Vector3(0, -0.62, 0));
    return { root, fore, hand };
  };
  const L = mkArm(-1); refs.leftArm  = L.root;
  const R = mkArm( 1); refs.rightArm = R.root;

  // Knife on right hand (forward = −Z for stab traces)
  const knife = new THREE.Group(); R.hand.add(knife); knife.position.set(0.08, -0.02, -0.12);
  const grip  = add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.24), matJoint), knife, new THREE.Vector3(0, 0, 0));
  const guard = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), matArmor), knife, new THREE.Vector3(0, 0.0, -0.14));
  const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.74), matGlow), knife, new THREE.Vector3(0, 0, -0.55));
  // nice: a tiny tip cube so you can raycast from it if you like
  const tip   = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), matGlow), knife, new THREE.Vector3(0, 0, -0.92));
  refs.knife = knife; refs.blade = blade;

  // Legs — long and lean
  const mkLeg = (side) => {
    const root  = new THREE.Group(); root.position.set(0.34 * side, -0.06, 0); hips.add(root);
    const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.02, 0.46), matArmor),
                      root, new THREE.Vector3(0, -0.76, 0)); thigh.userData.bodyPart='leg';
    const shin  = add(new THREE.Mesh(new THREE.BoxGeometry(0.40, 1.02, 0.42), matAccent),
                      thigh, new THREE.Vector3(0, -1.06, 0)); shin.userData.bodyPart='leg';
    // calf bar + ankle boot
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.04), matGlow), shin,
        new THREE.Vector3(0.18 * side, -0.22, 0.20));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.74), matJoint),
        shin, new THREE.Vector3(0, -0.70, 0));
    return root;
  };
  refs.rightLeg = mkLeg( 1);
  refs.leftLeg  = mkLeg(-1);

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs };
}
