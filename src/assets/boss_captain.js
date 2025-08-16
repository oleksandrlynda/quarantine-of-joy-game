// ============================================================================
// Influencer Militia Captain + Ad Zeppelin Support — asset pack
// - All meshes are simple Boxes/Cylinders so they’re cheap to draw.
// - Returns refs you can use for logic: muzzle, shieldAnchor, adMarkEmitter,
//   volleyHardpoints, zepp pods/rails, etc.
// ============================================================================

export function createInfluencerCaptainAsset({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        armor: 0x8a9097,         // urban armor
        accent: 0x111827,        // dark undersuit
        brand1: 0xff2ea6,        // neon magenta
        brand2: 0x22e3ef,        // neon cyan
        visor: 0xf1f5f9,         // white visor slit
        gun: 0x18181b
      },
      palette || {}
    );
  
    const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
    const matArmor = lambert(colors.armor);
    const matUnder = lambert(colors.accent);
    const matGun   = lambert(colors.gun);
    const matVisor = new THREE.MeshLambertMaterial({ color: colors.visor });
    const matGlowM = new THREE.MeshLambertMaterial({ color: colors.brand1, emissive: colors.brand1, emissiveIntensity: 0.9 });
    const matGlowC = new THREE.MeshLambertMaterial({ color: colors.brand2, emissive: colors.brand2, emissiveIntensity: 0.9 });
  
    const add = (mesh, parent = group, pos, mat) => { if (mat) mesh.material = mat; if (pos) mesh.position.set(pos.x, pos.y, pos.z); parent.add(mesh); return mesh; };
  
    // Torso + coat skirt panels
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.2), matArmor), group, new THREE.Vector3(0, 1.6 * scale, 0));
    chest.userData.bodyPart = 'torso';
    // Chest screen (ad mark emitter)
    const screen = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.06), matGlowC), chest, new THREE.Vector3(0, 0.15, 0.63));
    // Belt + coat
    add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.0), matUnder), group, new THREE.Vector3(0, 1.0 * scale, 0));
    const coat = new THREE.Group(); group.add(coat); coat.position.set(0, 0.95 * scale, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.1), matUnder), coat, new THREE.Vector3(-0.45, -0.55, 0.52));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.1), matUnder), coat, new THREE.Vector3( 0.45, -0.55, 0.52));
    // Brand chevrons
    add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.02), matGlowM), coat, new THREE.Vector3(-0.45, -0.25, 0.58));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.02), matGlowM), coat, new THREE.Vector3( 0.45, -0.25, 0.58));
  
    // Head (rect visor)
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mats?.head ? mats.head.clone() : lambert(0x262b31)), group, new THREE.Vector3(0, 2.45 * scale, 0));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.06), matVisor), head, new THREE.Vector3(0, 0.05, 0.48));
  
    // Shoulders
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), matArmor), chest, new THREE.Vector3( 0.95, 0.4, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), matArmor), chest, new THREE.Vector3(-0.95, 0.4, 0));
  
    // Arms
    const refs = { volleyHardpoints: [], shieldAnchor: null, muzzle: null, gun: null, adMarkEmitter: screen, head };
    const mkArm = (side) => {
      const root = new THREE.Group(); root.position.set(0.95 * side, 1.8 * scale, 0); group.add(root);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), matUnder), root, new THREE.Vector3(0, -0.5, 0));
      const fore = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), matArmor), root, new THREE.Vector3(0, -1.1, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.06), side > 0 ? matGlowM : matGlowC), fore, new THREE.Vector3(0.28 * side, -0.1, 0.28));
      // volley cone hardpoint at wrist top
      const hp = new THREE.Object3D(); fore.add(hp); hp.position.set(0, -0.35, 0.3);
      refs.volleyHardpoints.push(hp);
      return fore;
    };
    const leftFore  = mkArm(-1);
    const rightFore = mkArm( 1);
  
    // Compact SMG-like gun on right hand
    const gun = new THREE.Group(); rightFore.add(gun); gun.position.set(0.25, -0.28, -0.35);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.95), matGun), gun, new THREE.Vector3(0, 0, -0.35));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), matGlowC), gun, new THREE.Vector3(0, 0.02, 0.10));
    const muzzle = add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), matGlowC), gun, new THREE.Vector3(0, 0, -0.80));
  
    // Legs
    const hips = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.9), matArmor), group, new THREE.Vector3(0, 0.8 * scale, 0));
    const mkLeg = (side) => {
      const root = new THREE.Group(); hips.add(root); root.position.set(0.45 * side, 0.2, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.55), matArmor), root, new THREE.Vector3(0, -0.55, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), matUnder), root, new THREE.Vector3(0, -1.2, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.9), lambert(0x1f2937)), root, new THREE.Vector3(0, -1.55, 0));
    };
    mkLeg(1); mkLeg(-1);
  
    // Backpack antenna + shield anchor
    const pack = new THREE.Group(); group.add(pack); pack.position.set(0, 2.0 * scale, -0.7);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), matUnder), pack);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), matGlowM), pack, new THREE.Vector3(0.22, 0.85, 0));
    const shieldAnchor = new THREE.Object3D(); group.add(shieldAnchor); shieldAnchor.position.set(0, 1.15 * scale, 0);
  
    group.scale.set(scale, scale, scale);
    // Refs
    refs.gun = gun; refs.muzzle = muzzle; refs.shieldAnchor = shieldAnchor;
    return { root: group, head, refs };
  }
  
  // --- Ad Zeppelin (pods you can shoot, bomb rails underneath) -----------------
  export function createAdZeppelinAsset({ THREE, mats, scale = 1.0, podCount = 3, palette } = {}) {
    const group = new THREE.Group();
    const colors = Object.assign(
      {
        hull: 0x3b4150,
        stripe: 0xff2ea6,
        glow: 0x22e3ef,
        gondola: 0x1f2530,
        pod: 0x111827
      },
      palette || {}
    );
    const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
    const matHull = lambert(colors.hull);
    const matStripe = new THREE.MeshLambertMaterial({ color: colors.stripe, emissive: colors.stripe, emissiveIntensity: 0.7 });
    const matGlow = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.8 });
    const matGond = lambert(colors.gondola);
    const matPod  = lambert(colors.pod);
  
    const add = (mesh, parent = group, pos, mat) => { if (mat) mesh.material = mat; if (pos) mesh.position.set(pos.x, pos.y, pos.z); parent.add(mesh); return mesh; };
  
    // Blimp body: cylinder + hemispherical caps
    const body = new THREE.Group(); group.add(body); body.position.set(0, 4.0 * scale, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6.4, 18, 1, true), matHull), body);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), matHull), body, new THREE.Vector3(0, 3.2, 0));
    add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), matHull), body, new THREE.Vector3(0,-3.2, 0));
    // Stripes
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.0, 10, 1, true), matStripe), body, new THREE.Vector3(0.9, 0, 0));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.0, 10, 1, true), matStripe), body, new THREE.Vector3(-0.9, 0, 0));
  
    // Gondola
    const gondola = new THREE.Group(); group.add(gondola); gondola.position.set(0, 1.9 * scale, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.9), matGond), gondola);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.7), matGlow), gondola, new THREE.Vector3(0, 0.45, 0));
  
    // Bomb rails (spawn points along belly)
    const bombRails = [];
    for (let i = -2; i <= 2; i++) {
      const hp = new THREE.Object3D();
      body.add(hp);
      hp.position.set(0, -1.25, i * 1.15);
      bombRails.push(hp);
    }
  
    // Engine pods you can shoot off (also act as shield generators)
    const pods = [];
    for (let i = 0; i < podCount; i++) {
      const side = (i % 2 === 0) ? 1 : -1;
      const z = -2.2 + (i * (4.4 / Math.max(1, podCount - 1)));
      const podRoot = new THREE.Group(); body.add(podRoot);
      podRoot.position.set(1.6 * side, -0.2, z);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 10), matPod), podRoot, new THREE.Vector3(0, 0, 0)).rotation.z = Math.PI / 2;
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), matGlow), podRoot, new THREE.Vector3(0.55, 0, 0));
      ring.rotation.y = Math.PI / 2;
      // small hitbox child for logic convenience
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.38), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001 }));
      podRoot.add(hit);
      hit.position.set(0.3, 0, 0);
      pods.push({ root: podRoot, hit });
    }
  
    // Optional moving billboard “tail fin”
    const fin = new THREE.Group(); body.add(fin); fin.position.set(0, 0.6, 3.1);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.6), matHull), fin);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.4), matGlow), fin);
  
    group.scale.set(scale, scale, scale);
    return { root: group, head: null, refs: { body, gondola, bombRails, pods } };
  }
  
  // --- Billboard wall prop (moving cover) -------------------------------------
  export function createBillboardWallAsset({ THREE, width = 4, height = 2.2, palette } = {}) {
    const colors = Object.assign({ frame: 0x111827, panel: 0x334155, glow: 0xff2ea6 }, palette || {});
    const matFrame = new THREE.MeshLambertMaterial({ color: colors.frame });
    const matPanel = new THREE.MeshLambertMaterial({ color: colors.panel });
    const matGlow  = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.75 });
  
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.2), matFrame);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), matPanel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.1, 0.04), matGlow);
  
    group.add(frame);
    panel.position.z = 0.08; group.add(panel);
    stripe.position.set(0, -height * 0.25, 0.09); group.add(stripe);
  
    // anchor used by logic to tween along path
    const anchor = new THREE.Object3D(); group.add(anchor);
    return { root: group, refs: { anchor } };
  }
  
  // --- Ground ad-zone marker (slow > pop) -------------------------------------
  export function createAdZoneMarkerAsset({ THREE, radius = 1.5, palette } = {}) {
    const colors = Object.assign({ ring: 0x22e3ef, fill: 0x0ea5e9 }, palette || {});
    const matRing = new THREE.MeshBasicMaterial({ color: colors.ring, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const matFill = new THREE.MeshBasicMaterial({ color: colors.fill, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), matRing);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; group.add(ring);
  
    const disk = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.78, 24), matFill);
    disk.rotation.x = -Math.PI / 2; disk.position.y = 0.02; group.add(disk);
  
    // central pylon that can pulse during “pop”
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), matRing);
    pylon.position.y = 0.25; group.add(pylon);
  
    return { root: group, refs: { ring, disk, pylon } };
  }
  