// HealerBot v2: clean medic silhouette with glowing backpack halo
// Returns { root, head, refs } ; refs.auraEmitter → attach your VFX
export function createHealerBot({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor: 0x9aa3aa,     // light plates
        accent: 0x7f8b92,    // soft cloth/pads
        joints: 0x2a2d31,
        visor: 0x111827,
        glow:  0x84cc16      // healer green
      },
      palette || {}
    );
  
    // materials
    const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
    const matJoint = new THREE.MeshLambertMaterial({ color: colors.joints });
    const matHead  = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
    const matGlow  = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.95 });
  
    const add = (mesh, parent = group, pos = null, mat = null) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // --------- Core body (slimmer chest + abdomen + hips) ----------
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.06, 0.70), matArmor),
                      group, new THREE.Vector3(0, 1.50 * scale, 0));
    chest.userData.bodyPart = 'torso';
  
    // small raised chest plate with glowing cross
    const plate = add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 0.10), matAccent),
                      chest, new THREE.Vector3(0, 0.10, 0.40));
    // “med cross” from two glowing bars
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.04), matGlow), plate, new THREE.Vector3(0, 0.00, 0.06));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), matGlow), plate, new THREE.Vector3(0, 0.00, 0.06));
  
    const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.40, 0.62), matAccent),
                        group, new THREE.Vector3(0, 1.05 * scale, 0.02));
    const hips = add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.42, 0.76), matArmor),
                     group, new THREE.Vector3(0, 0.66 * scale, 0));
  
    // shoulder pads
    add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.56), matArmor), group, new THREE.Vector3( 0.74, 1.92 * scale, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.56), matArmor), group, new THREE.Vector3(-0.74, 1.92 * scale, 0));
  
    // --------- Head with visor stripe ----------
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.66, 0.74), matHead),
                     group, new THREE.Vector3(0, 2.15 * scale, 0));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.10, 0.05), matGlow), head, new THREE.Vector3(0, -0.02, 0.36));
  
    // --------- Arms (with glow strips) ----------
    const refs = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null, auraEmitter: null };
  
    const mkArm = (side) => {
      const root = new THREE.Group(); root.position.set(0.84 * side, 1.72 * scale, 0); group.add(root);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.46, 0.44), matJoint), root, new THREE.Vector3(0, -0.30, 0));
      const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.62, 0.44), matArmor), root, new THREE.Vector3(0, -0.90, -0.02));
      // twin glow strips on forearm
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), matGlow), fore, new THREE.Vector3( 0.18 * side, -0.10, 0.22));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), matGlow), fore, new THREE.Vector3( 0.18 * side, -0.10,-0.22));
      return root;
    };
    refs.rightArm = mkArm(1);
    refs.leftArm  = mkArm(-1);
  
    // --------- Legs (knee pad + boot) ----------
    const mkLeg = (side) => {
      const root = new THREE.Group(); root.position.set(0.40 * side, 0.42, 0); group.add(root);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.50), matArmor), root, new THREE.Vector3(0, -0.31, 0));          // thigh
      add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.68, 0.48), matAccent), root, new THREE.Vector3(0, -0.95, 0.02));      // calf
      add(new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.54), matJoint), root, new THREE.Vector3(0, -0.64, 0.02));       // knee
      add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.26, 0.78), matJoint), root, new THREE.Vector3(0, -1.34, 0.06));       // boot
      return root;
    };
    refs.rightLeg = mkLeg(1);
    refs.leftLeg  = mkLeg(-1);
  
    // --------- Backpack with halo emitter ----------
    const pack = new THREE.Group(); chest.add(pack); pack.position.set(0, 0.02, -0.48);
  
    // core canister block
    add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.70, 0.30), matAccent), pack);
  
    // side canisters (simple cylinders)
    const canMat = new THREE.MeshLambertMaterial({ color: colors.accent });
    const canGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.58, 10);
    const leftCan  = new THREE.Mesh(canGeo, canMat);  leftCan.rotation.z = Math.PI/2; leftCan.position.set( 0.40, 0.00, -0.08); pack.add(leftCan);
    const rightCan = new THREE.Mesh(canGeo, canMat); rightCan.rotation.z = Math.PI/2; rightCan.position.set(-0.40, 0.00, -0.08); pack.add(rightCan);
    // glowing caps
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.06,10), matGlow), leftCan,  new THREE.Vector3(0,  0.32, 0));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.06,10), matGlow), leftCan,  new THREE.Vector3(0, -0.32, 0));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.06,10), matGlow), rightCan, new THREE.Vector3(0,  0.32, 0));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,0.06,10), matGlow), rightCan, new THREE.Vector3(0, -0.32, 0));
  
    // halo ring (your VFX anchor)
    const ringGeo = new THREE.TorusGeometry(0.42, 0.06, 8, 28);
    const halo = new THREE.Mesh(ringGeo, matGlow);
    halo.rotation.x = Math.PI/2;  // face backward/forward
    halo.position.set(0, 0.00, -0.24);
    pack.add(halo);
  
    // small rear badge (extra glow)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22,0.22,0.04), matGlow), pack, new THREE.Vector3(0, -0.20, -0.18));
  
    // final
    group.scale.set(scale, scale, scale);
    return { root: group, head, refs: { ...refs, auraEmitter: halo } };
  }
  