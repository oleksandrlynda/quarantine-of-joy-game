// Strike Adjudicator asset (Content Court)
// Returns { root, head, refs } with refs for gameplay telegraphs:
//  - gavel, gavelHead, gavelImpact
//  - leftArm, rightArm
//  - sectorDial (thin ground disc to rotate/flash for slice slams)
//  - nodeAnchors: [anchorL, anchorR] suggested Purge Node spawn points
//  - strikePips: THREE.Mesh[] (3 small emissive spheres to pulse per Strike)
//  - halo: back ring behind head
export function createStrikeAdjudicatorAsset({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor: 0x334155,   // slate armor
        trim:  0x475569,   // shoulder/edge
        robe:  0x0f172a,   // dark panels
        visor: 0x111827,   // head slit
        glow:  0x60a5fa,   // court glow (telegraphs)
        strike:0xf43f5e,   // strike pips (red/rose)
        dial:  0x93c5fd    // sector dial tint
      },
      palette || {}
    );
  
    const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matTrim  = new THREE.MeshLambertMaterial({ color: colors.trim });
    const matRobe  = new THREE.MeshLambertMaterial({ color: colors.robe });
    const matHead  = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
    const matGlow  = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });
    const matStrike= new THREE.MeshLambertMaterial({ color: colors.strike, emissive: colors.strike, emissiveIntensity: 0.95 });
    const matDial  = new THREE.MeshBasicMaterial({ color: colors.dial, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  
    const add = (mesh, parent = group, pos = null, mat = null) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // Pedestal / base mass (helps read as boss)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.45, 8, 1, false), matRobe);
    add(base, group, new THREE.Vector3(0, 0.225 * scale, 0));
  
    // Torso block
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 1.4), matArmor), group, new THREE.Vector3(0, 1.65 * scale, 0));
    chest.userData.bodyPart = 'torso';
    // Trim shoulders
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), matTrim), chest, new THREE.Vector3(1.15, 0.55, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), matTrim), chest, new THREE.Vector3(-1.15, 0.55, 0));
    // Chest badge (glow)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.08), matGlow), chest, new THREE.Vector3(0, 0.2, 0.74));
  
    // Head with visor slit
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), matHead), group, new THREE.Vector3(0, 2.9 * scale, 0.08));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.06), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.06, 0.54));
  
    // Back halo ring (court motif)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 12, 36), matGlow);
    halo.rotation.x = Math.PI / 2;
    add(halo, group, new THREE.Vector3(0, 2.95 * scale, -0.35));
  
    // Robe panels (front/back) for silhouette
    const robeFront = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.12), matRobe), chest, new THREE.Vector3(0, -0.9, 0.76));
    robeFront.rotation.x = 0.06;
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.12), matRobe), chest, new THREE.Vector3(0, -0.75, -0.76));
  
    // Arms
    const refs = { leftArm: null, rightArm: null, gavel: null, gavelHead: null, gavelImpact: null, halo, strikePips: [], sectorDial: null, nodeAnchors: [] };
  
    const mkArm = (side) => {
      const root = new THREE.Group();
      root.position.set(1.15 * side, 2.15 * scale, 0);
      group.add(root);
      const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.6), matTrim), root, new THREE.Vector3(0, -0.45, 0));
      const fore  = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), matArmor), upper, new THREE.Vector3(0, -0.9, 0));
      const fist  = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), matTrim), fore, new THREE.Vector3(0, -0.7, 0));
      return { root, upper, fore, fist };
    };
  
    // Left arm (open hand / bailiff shove vibe)
    const L = mkArm(-1);
    refs.leftArm = L.root;
  
    // Right arm with Gavel
    const R = mkArm(1);
    refs.rightArm = R.root;
  
    // Gavel: handle + head, forward “impact” anchor
    const gavel = new THREE.Group();
    R.fist.add(gavel);
    gavel.position.set(0.35, -0.05, -0.15); // offset outwards/forward
    // handle
    add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.2), matTrim), gavel, new THREE.Vector3(0, 0, -0.45));
    // head
    const gavelHead = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.35), matGlow), gavel, new THREE.Vector3(0, 0, -0.95));
    // tiny “impact” anchor at the front
    const gavelImpact = new THREE.Object3D();
    gavelHead.add(gavelImpact);
    gavelImpact.position.set(0, 0, -0.22);
    refs.gavel = gavel; refs.gavelHead = gavelHead; refs.gavelImpact = gavelImpact;
  
    // Strike pips (3 spheres above left chest)
    for (let i = 0; i < 3; i++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), matStrike);
      chest.add(pip);
      pip.position.set(-0.55 + i * 0.28, 0.55, 0.8);
      pip.scale.setScalar(0.95);
      refs.strikePips.push(pip);
    }
  
    // Sector dial (thin ground disc, used for rotating pie-slice decals in logic)
    const dial = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.45, 40), matDial);
    dial.rotation.x = -Math.PI / 2;
    add(dial, group, new THREE.Vector3(0, 0.02, 0));
    refs.sectorDial = dial;
  
    // Suggested Purge Node / Bailiff anchors (front-left / front-right)
    const mkAnchor = (x, z) => {
      const a = new THREE.Object3D();
      group.add(a);
      a.position.set(x, 0.0, z);
      return a;
    };
    refs.nodeAnchors.push(mkAnchor(-2.2,  1.6));
    refs.nodeAnchors.push(mkAnchor( 2.2,  1.6));
  
    // Minor forward lean for menace
    group.rotation.x = -0.03;
  
    group.scale.set(scale, scale, scale);
    return { root: group, head, refs };
  }
  