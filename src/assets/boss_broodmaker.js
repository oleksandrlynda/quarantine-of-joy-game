// Broodmaker boss asset: hulking torso with abdomen sacs, dorsal weakpoint, back spines
// Returns { root, head, refs }:
// refs = {
//   eggs: Mesh[],                 // pulsing sacs (phase visuals)
//   weakpoint: Mesh,              // dorsal glowing core (phase 2 expose)
//   dorsalCover: Object3D,        // armor plates covering the weakpoint
//   spawnSockets: Object3D[],     // ground-level broodling spawn points around base
//   flyerPorts: Object3D[],       // upper ports for flyer spawns
//   gooPorts: Object3D[],         // underside nozzles for goo puddles
//   burrowAnchor: Object3D,       // transform to sink/raise when burrowing
//   outlineGroup: Object3D|null   // optional white outline shell (for that look)
// }
export function createBroodmakerAsset({ THREE, mats, scale = 1.0, palette, outline = true } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor: 0x6b5ca7,    // purple chitin
        flesh: 0x7a4aa8,    // darker purple
        sacs:  0xff78a8,    // pink glow
        spine: 0x3d355d,
        visor: 0x111827,
        goo:   0x86efac     // soft green cue for goo nozzles
      },
      palette || {}
    );
  
    // Materials
    const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matFlesh = new THREE.MeshLambertMaterial({ color: colors.flesh });
    const matSpine = new THREE.MeshLambertMaterial({ color: colors.spine });
    const matHead  = (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor }));
    const matGlow  = (mats?.glow ? mats.glow.clone() : new THREE.MeshLambertMaterial({
      color: colors.sacs, emissive: colors.sacs, emissiveIntensity: 0.9
    }));
    const matGoo   = new THREE.MeshLambertMaterial({ color: colors.goo, emissive: colors.goo, emissiveIntensity: 0.5 });
  
    // Helpers
    const add = (mesh, parent = group, pos = null, mat = null) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
    const addEmpty = (parent = group, pos = null) => {
      const o = new THREE.Object3D();
      if (pos) o.position.set(pos.x, pos.y, pos.z);
      parent.add(o);
      return o;
    };
    const makeOutline = (root) => {
      const basicWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
      const out = new THREE.Group();
      out.renderOrder = 1e4;
      root.traverse((n) => {
        if (n.isMesh && n.geometry) {
          const shell = new THREE.Mesh(n.geometry.clone(), basicWhite);
          shell.position.copy(n.getWorldPosition(new THREE.Vector3()));
          shell.quaternion.copy(n.getWorldQuaternion(new THREE.Quaternion()));
          shell.scale.copy(n.getWorldScale(new THREE.Vector3())).multiplyScalar(1.04);
          out.add(shell);
        }
      });
      return out;
    };
  
    // === Base / Burrow disc (visual hint + spawn ring) ===
    const base = new THREE.Group();
    group.add(base);
    base.position.set(0, 0.6 * scale, 0); // lifts whole body a bit off the ground
  
    const basePlate = add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.4, 16), matFlesh), base);
    basePlate.rotation.x = 0;
  
    // Burrow anchor (sink this down/up for Phase 1 relocations)
    const burrowAnchor = addEmpty(group, new THREE.Vector3(0, 0, 0));
    burrowAnchor.add(base);
  
    // === Torso / Carapace ===
    const torso = add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.3, 1.9), matArmor), base, new THREE.Vector3(0, 1.3 * scale, 0));
    torso.userData.bodyPart = 'torso';
  
    // Rib plates (layered flesh under armor)
    for (let i = -2; i <= 2; i++) {
      const plate = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 1.6), matFlesh), torso, new THREE.Vector3(0, -0.9 + i * 0.45, 0));
      plate.rotation.z = i * 0.05;
    }
  
    // Head (faces +Z like your other bots)
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.25), matHead), base, new THREE.Vector3(0, 2.45 * scale, 0.2));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.08), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.08, 0.66));
  
    // === Abdomen + egg sacs (front/low) ===
    const abdomen = new THREE.Group();
    base.add(abdomen);
    abdomen.position.set(0, 0.55 * scale, 0.45);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.5), matFlesh), abdomen);
  
    const eggs = [];
    const mkSac = (x, y, z, s, jitter = Math.random() * Math.PI * 2) => {
      const sac = add(new THREE.Mesh(new THREE.SphereGeometry(s, 14, 12), matGlow), abdomen, new THREE.Vector3(x, y, z));
      sac.userData.pulse = jitter; // phase seed for simple shaderless pulsing
      eggs.push(sac);
    };
    mkSac( 0.58,  0.12,  0.30, 0.38);
    mkSac(-0.58,  0.06,  0.24, 0.34);
    mkSac( 0.12, -0.18,  0.44, 0.30);
    mkSac(-0.10,  0.22,  0.48, 0.28);
    mkSac( 0.00, -0.32,  0.12, 0.26);
  
    // === Dorsal weakpoint (covered in Phase 1, exposed in Phase 2) ===
    const dorsalBase = addEmpty(base, new THREE.Vector3(0, 2.0 * scale, -0.45));
    const weakpoint = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), matGlow), dorsalBase, new THREE.Vector3(0, 0.25, 0));
    weakpoint.visible = false; // hidden by cover until expose window
  
    // Hinged chitin cover (rotate this up to expose weakpoint)
    const dorsalCover = new THREE.Group();
    dorsalBase.add(dorsalCover);
    for (let i = -1; i <= 1; i++) {
      const flap = add(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 0.9), matArmor), dorsalCover, new THREE.Vector3(i * 0.5, 0.0, 0.0));
      flap.rotation.x = -0.25 - Math.abs(i) * 0.08; // slightly parted look
    }
  
    // === Back spines (silhouette + menace) ===
    const spineBase = addEmpty(base, new THREE.Vector3(0, 2.2 * scale, -0.9));
    for (let i = 0; i < 5; i++) {
      const h = 0.65 + i * 0.2;
      const spine = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), matSpine), spineBase, new THREE.Vector3((i - 2) * 0.42, h * 0.5 - 0.2, -i * 0.12));
      spine.rotation.x = -0.32 - i * 0.05;
    }
  
    // === Heavy arms / claws (non-animated here, just presence) ===
    const jointMat = new THREE.MeshLambertMaterial({ color: 0x3b335a });
    const mkArm = (side) => {
      const root = addEmpty(base, new THREE.Vector3(1.55 * side, 1.7 * scale, 0.1));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), jointMat), root, new THREE.Vector3(0, -0.2, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.8), matArmor), root, new THREE.Vector3(0, -0.95, 0));
      // claw tip
      add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), matSpine), root, new THREE.Vector3(0, -1.5, 0.45));
      return root;
    };
    mkArm(1); mkArm(-1);
  
    // === Spawn / hazard sockets ===
    // Ground-level broodling ring (around base plate)
    const spawnSockets = [];
    const ringR = 1.9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = addEmpty(base, new THREE.Vector3(Math.cos(a) * ringR, -0.2, Math.sin(a) * ringR));
      spawnSockets.push(s);
    }
  
    // Flyer ports (upper sides/back)
    const flyerPorts = [
      addEmpty(base, new THREE.Vector3( 0.9, 2.2 * scale, -0.3)),
      addEmpty(base, new THREE.Vector3(-0.9, 2.2 * scale, -0.3)),
      addEmpty(base, new THREE.Vector3( 0.0, 2.5 * scale, -0.7)),
    ];
  
    // Goo nozzles (under abdomen)
    const gooPorts = [
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), matGoo), abdomen, new THREE.Vector3( 0.42, -0.55,  0.16)),
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), matGoo), abdomen, new THREE.Vector3(-0.42, -0.55,  0.16)),
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), matGoo), abdomen, new THREE.Vector3( 0.00, -0.55, -0.10)),
    ];
    gooPorts.forEach(p => { p.rotation.x = Math.PI / 2; });
  
    // Slight forward lean
    group.rotation.x = -0.035;
  
    // Optional white outline shell (clone backfaces, slightly scaled)
    let outlineGroup = null;
    if (outline) {
      outlineGroup = makeOutline(group);
      group.add(outlineGroup);
    }
  
    // Final scale
    group.scale.set(scale, scale, scale);
  
    return {
      root: group,
      head,
      refs: {
        eggs,
        weakpoint,
        dorsalCover,
        spawnSockets,
        flyerPorts,
        gooPorts,
        burrowAnchor,
        outlineGroup
      }
    };
  }
  