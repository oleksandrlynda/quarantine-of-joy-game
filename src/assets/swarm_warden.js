// Swarm Warden (Heavy Flyer) — asset
// Theme: carrier/recaller for 10–15 micro-fliers (not a boss)
// Returns { root, head, refs } with:
// - refs.leftWing / rightWing (animate flaps/roll)
// - refs.thrusters[] (pulse with movement)
// - refs.bays[] (belly launch bays)
// - refs.bayMuzzles[] (spawn anchors from bays)
// - refs.swarmAnchors[] (radial ring anchors for orbit/swarm slots)
// - refs.recallEmitter (glow ring to "re-knit" slain flies)
// - refs.core (weak-ish core glow you can pulse on recall)

export function createSwarmWarden({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        hull:  0x6b7280, // gunmetal
        accent:0x9aa3aa, // light panel
        joint: 0x2a2d31, // dark joints
        glowA: 0xa855f7, // magenta recall
        glowB: 0x22d3ee, // cyan trims
        visor: 0x111827,
      },
      palette || {}
    );
  
    // Materials
    const M = {
      hull:   new THREE.MeshLambertMaterial({ color: colors.hull }),
      accent: new THREE.MeshLambertMaterial({ color: colors.accent }),
      joint:  new THREE.MeshLambertMaterial({ color: colors.joint }),
      head:   (mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.visor })),
      glowA:  new THREE.MeshLambertMaterial({ color: colors.glowA, emissive: colors.glowA, emissiveIntensity: 0.9 }),
      glowB:  new THREE.MeshLambertMaterial({ color: colors.glowB, emissive: colors.glowB, emissiveIntensity: 0.8 }),
    };
  
    const add = (mesh, parent = group, pos, mat) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // ---------------------------------------------------------------------------
    // Core fuselage
    // ---------------------------------------------------------------------------
    const fuselage = new THREE.Group(); group.add(fuselage);
    fuselage.position.set(0, 1.6 * scale, 0);
  
    // Central hull (beveled-ish by stacking)
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.4), M.hull), fuselage);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.0), M.accent), fuselage, new THREE.Vector3(0, 0.55, 0));
    // Nose cap (forward along -Z for consistency with muzzles)
    const nose = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), M.hull), fuselage, new THREE.Vector3(0, 0.1, -0.9));
    nose.rotation.x = -0.05;
  
    // Head/eye block (weak-ish core sits just behind)
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), M.head), fuselage, new THREE.Vector3(0, 0.55, -0.25));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.06), new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.03, 0.36));
    const core = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), M.glowB), fuselage, new THREE.Vector3(0, 0.1, -0.15));
  
    // Dorsal recall ring (visual when re-summoning flies)
    const recallEmitter = new THREE.Group(); group.add(recallEmitter);
    recallEmitter.position.set(0, 2.25 * scale, 0);
    const recallRing = add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 36), M.glowA), recallEmitter);
    recallRing.rotation.x = Math.PI / 2;
  
    // ---------------------------------------------------------------------------
    // Wings (multi-segment for nice banking animation)
    // ---------------------------------------------------------------------------
    const refs = {
      leftWing: null, rightWing: null,
      thrusters: [], bays: [], bayMuzzles: [],
      swarmAnchors: [], recallEmitter, core
    };
  
    const mkWing = (side) => {
      const root = new THREE.Group(); group.add(root);
      root.position.set(1.15 * side, 1.62 * scale, -0.1);
      // shoulder
      const shoulder = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), M.joint), root);
      // inner panel
      const inner = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.6), M.accent), root, new THREE.Vector3(0.55 * side, 0, 0));
      // outer panel
      const outer = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.5), M.hull), inner, new THREE.Vector3(0.6 * side, 0, 0));
      // glow trim
      add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.05), M.glowB), inner, new THREE.Vector3(0.1 * side, 0.02, 0.25));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.05), M.glowA), outer, new THREE.Vector3(0.1 * side, 0.02, 0.22));
      // slight default cant
      root.rotation.z = side > 0 ? -0.18 : 0.18;
      return root;
    };
    refs.leftWing  = mkWing( 1);
    refs.rightWing = mkWing(-1);
  
    // ---------------------------------------------------------------------------
    // Thrusters (rear & belly — pulse with speed)
    // ---------------------------------------------------------------------------
    const mkThruster = (x, y, z, s = 1) => {
      const g = new THREE.Group(); group.add(g);
      g.position.set(x, y, z);
      const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09*s, 0.18*s, 0.26*s, 10, 1, true), M.hull), g);
      t.rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07*s, 0.07*s, 0.05*s, 10), M.glowB), g, new THREE.Vector3(0.13*s, 0, 0));
      refs.thrusters.push(g);
      return g;
    };
    mkThruster( 0.65, 1.45*scale,  0.70, 1.0);
    mkThruster(-0.65, 1.45*scale,  0.70, 1.0);
    mkThruster( 0.00, 1.30*scale, -0.85, 1.1);
  
    // ---------------------------------------------------------------------------
    // Belly launch bays (3 per side) + bay muzzles (spawn anchors, forward -Z)
    // ---------------------------------------------------------------------------
    const bayRoot = new THREE.Group(); group.add(bayRoot);
    bayRoot.position.set(0, 1.30 * scale, 0.15);
  
    const mkBay = (x, z) => {
      const b = new THREE.Group(); bayRoot.add(b); b.position.set(x, 0, z);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.48), M.hull), b);                 // frame
      add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.42), M.joint), b, new THREE.Vector3(0, -0.01, 0)); // dark cavity
      // muzzle anchor: small glowing strip at the front (forward -Z)
      const muzzle = new THREE.Object3D(); b.add(muzzle); muzzle.position.set(0, -0.01, -0.28);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.03), M.glowA);
      muzzle.add(strip);
      refs.bays.push(b);
      refs.bayMuzzles.push(muzzle);
    };
  
    // Left side bays (z-ordered front→back)
    mkBay( 0.55, -0.15); mkBay( 0.55, 0.15); mkBay( 0.55, 0.45);
    // Right side bays
    mkBay(-0.55, -0.15); mkBay(-0.55, 0.15); mkBay(-0.55, 0.45);
  
    // ---------------------------------------------------------------------------
    // Swarm orbit anchors: ring of 16 sockets around the Warden
    // Use these to assign stable slots to 10–15 flies; fill clockwise.
    // ---------------------------------------------------------------------------
    const swarmRing = new THREE.Group(); group.add(swarmRing);
    swarmRing.position.set(0, 1.6 * scale, 0);
    const R = 2.2; const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const s = new THREE.Object3D();
      s.position.set(Math.cos(a) * R, (i % 2 ? 0.25 : -0.1), Math.sin(a) * R);
      s.lookAt(group.position);
      swarmRing.add(s);
      refs.swarmAnchors.push(s);
      // tiny bead (can hide) so you can see slots during tuning
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), M.glowB);
      bead.material.opacity = 0.6; bead.material.transparent = true;
      s.add(bead);
    }
  
    // Subtle forward lean for menace
    group.rotation.x = -0.04;
    group.scale.set(scale, scale, scale);
  
    return { root: group, head, refs };
  }
  