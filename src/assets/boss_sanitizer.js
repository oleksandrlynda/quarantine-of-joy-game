// Commissioner Sanitizer boss asset (humanoid with baton + coat panels)
// Returns { root, head, refs: { baton, tip, vents, leftArm, rightArm, coatFrontL, coatFrontR } }

export function createSanitizerAsset({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor: 0x2b3138,     // dark steel
        armor2: 0x3a424b,    // mid steel for layering
        cloth: 0x1c2126,     // coat / under-suit
        joints: 0x0f1216,
        trim:  0xb38d3a,     // chevrons
        glow:  0x93c5fd,     // cyan glow
        visor: 0xffffff
      },
      palette || {}
    );
  
    const matArmor  = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matArmor2 = new THREE.MeshLambertMaterial({ color: colors.armor2 });
    const matCloth  = new THREE.MeshLambertMaterial({ color: colors.cloth });
    const matJoint  = new THREE.MeshLambertMaterial({ color: colors.joints });
    const matHead   = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.armor }));
    const matGlow   = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });
    const matTrim   = new THREE.MeshLambertMaterial({ color: colors.trim });
  
    const add = (mesh, parent = group, pos = null, mat = null) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // ----- Core torso
    const torso = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.1), matArmor), group, new THREE.Vector3(0, 1.8 * scale, 0));
    torso.userData.bodyPart = 'torso';
    // chest overlay and vents (weakpoint visuals hook)
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.4), matArmor2), torso, new THREE.Vector3(0, 0.15, 0.55));
    const vents = [];
    for (let i = -1; i <= 1; i++) {
      const v = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.05), matGlow), chest, new THREE.Vector3(i * 0.38, -0.18, 0.23));
      v.material.emissiveIntensity = 0.6;
      vents.push(v);
    }
  
    // Belt + waist block
    add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.24, 1.05), matArmor2), group, new THREE.Vector3(0, 1.18 * scale, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), matArmor), group, new THREE.Vector3(0, 0.95 * scale, 0));
  
    // ----- Head (visor slit)
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), matHead), group, new THREE.Vector3(0, 2.65 * scale, 0.05));
    head.userData.bodyPart = 'head';
    const visor = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.05), matGlow), head, new THREE.Vector3(0, 0.10, 0.48));
    visor.material.emissiveIntensity = 1.0;
  
    // ----- Shoulders
    const mkShoulder = (side) => {
      const s = new THREE.Group(); torso.add(s); s.position.set(0.95 * side, 0.45, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), matArmor2), s, new THREE.Vector3(0, 0, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), matArmor), s, new THREE.Vector3(0, 0.28, 0));
      return s;
    };
    mkShoulder(1); mkShoulder(-1);
  
    // ----- Arms (right with baton)
    const refs = { leftArm: null, rightArm: null, coatFrontL: null, coatFrontR: null, baton: null, tip: null, vents };
  
    const mkArm = (side, withBaton = false) => {
      const root = new THREE.Group(); group.add(root); root.position.set(0.95 * side, 1.9 * scale, 0);
      const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.6), matArmor2), root, new THREE.Vector3(0, -0.45, 0));
      const elbow = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), matJoint), upper, new THREE.Vector3(0, -0.55, 0));
      const fore  = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.6), matArmor), elbow, new THREE.Vector3(0, -0.5, 0));
      // gauntlet ring
      add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.63), matArmor2), fore, new THREE.Vector3(0, -0.2, 0));
  
      if (withBaton) {
        const baton = new THREE.Group(); fore.add(baton);
        baton.position.set(0.18 * side, -0.5, -0.12);
        baton.rotation.y = side > 0 ? 0 : Math.PI; // handle mirrored
        // handle + shaft (axis along -Z)
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8), matArmor2), baton, new THREE.Vector3(0, -0.05, 0));
        add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.475), matArmor), baton, new THREE.Vector3(0, 0.0, -0.26));
        const tip = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), matGlow), baton, new THREE.Vector3(0, 0.0, -0.5));
        tip.material.emissiveIntensity = 1.1;
        refs.baton = baton; refs.tip = tip;
      } else {
        // closed fist
        add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), matJoint), fore, new THREE.Vector3(0, -0.55, 0));
      }
      return root;
    };
    refs.rightArm = mkArm(1, true);
    refs.leftArm  = mkArm(-1, false);
  
    // ----- Long coat (split front panels + back skirt)
    const coatRoot = new THREE.Group(); group.add(coatRoot); coatRoot.position.set(0, 1.15 * scale, 0.15);
    const panelW = 0.55, panelH = 1.2, panelT = 0.08;
    const frontL = add(new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelT), matCloth), coatRoot, new THREE.Vector3(-0.38, -0.8, 0.35));
    const frontR = add(new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelT), matCloth), coatRoot, new THREE.Vector3( 0.38, -0.8, 0.35));
    const back   = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, panelH, panelT), matCloth), coatRoot, new THREE.Vector3(0, -0.8, -0.25));
    // chevrons on front panels
    const chevron = (parent, y, w) => add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.02), matTrim), parent, new THREE.Vector3(0, y, 0.06));
    chevron(frontL, -0.25, 0.4); chevron(frontL, -0.5, 0.5); chevron(frontL, -0.75, 0.6);
    chevron(frontR, -0.25, 0.4); chevron(frontR, -0.5, 0.5); chevron(frontR, -0.75, 0.6);
    refs.coatFrontL = frontL; refs.coatFrontR = frontR;
  
    // ----- Legs / boots
    const mkLeg = (side) => {
      const root = new THREE.Group(); group.add(root); root.position.set(0.45 * side, 0.9 * scale, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.6), matArmor2), root, new THREE.Vector3(0, -0.5, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.55), matArmor), root, new THREE.Vector3(0, -1.1, 0));
      // boot
      add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.85), matJoint), root, new THREE.Vector3(0, -1.45, 0.05));
    };
    mkLeg(1); mkLeg(-1);
  
    // subtle forward lean
    group.rotation.x = -0.02;
    group.scale.set(scale, scale, scale);
  
    return { root: group, head, refs };
  }
  
  
  // Suppression Node pillar in the same style as the concept.
  // Returns { root, ring } so you can pulse ring emissive/opacity.
  export function createSanitizerNodeAsset({ THREE, palette } = {}) {
    const group = new THREE.Group();
    const colors = Object.assign(
      { body: 0x262b31, glow: 0xffffff, stripe: 0x93c5fd },
      palette || {}
    );
    const matBody = new THREE.MeshLambertMaterial({ color: colors.body });
    const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });
    const matStripe = new THREE.MeshLambertMaterial({ color: colors.stripe });
  
    const add = (m, p = group, pos = null, mat = null) => { if (mat) m.material = mat; if (pos) m.position.set(pos.x, pos.y, pos.z); p.add(m); return m; };
  
    // Base + pillar
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.15, 24), matBody), group, new THREE.Vector3(0, 0.05, 0));
    const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.4, 24), matBody), group, new THREE.Vector3(0, 0.85, 0));
    // top cap
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 24), matBody), group, new THREE.Vector3(0, 1.56, 0));
    // glowing ring
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 28), matGlow), group, new THREE.Vector3(0, 1.08, 0));
    ring.rotation.x = Math.PI / 2;
    // front emblem / stripe
    add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.04), matStripe), body, new THREE.Vector3(0, 0.15, 0.56));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.04), matStripe), body, new THREE.Vector3(0, -0.0, 0.56));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.04), matStripe), body, new THREE.Vector3(0, -0.15, 0.56));
  
    return { root: group, ring };
  }
  