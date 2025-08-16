// ============================================================================
// Algorithm Shard Avatar (Glitch Proxy) — boss asset
// Returns { root, head, refs }
// Refs include: core, halo, beamAnchors[], mirageAnchors[], timeRingAnchor,
// plateOrbiters[], plates[], emissives[] (for pulsing), orbitBeads[]
// ============================================================================

export function createShardAvatarAsset({ THREE, mats, scale = 1.0, palette } = {}) {
    const group = new THREE.Group();
  
    const colors = Object.assign(
      {
        shell: 0x1f2430,     // dark body
        plate: 0x2b3242,     // mirror plates
        visor: 0xf8fafc,     // white slit
        neonA: 0x7c3aed,     // purple
        neonB: 0x22d3ee,     // cyan
        neonC: 0xf472b6,     // pink
      },
      palette || {}
    );
  
    const M = {
      shell:  new THREE.MeshLambertMaterial({ color: colors.shell }),
      plate:  new THREE.MeshLambertMaterial({ color: colors.plate }),
      visor:  new THREE.MeshLambertMaterial({ color: colors.visor }),
      glowA:  new THREE.MeshLambertMaterial({ color: colors.neonA, emissive: colors.neonA, emissiveIntensity: 0.9 }),
      glowB:  new THREE.MeshLambertMaterial({ color: colors.neonB, emissive: colors.neonB, emissiveIntensity: 0.9 }),
      glowC:  new THREE.MeshLambertMaterial({ color: colors.neonC, emissive: colors.neonC, emissiveIntensity: 0.9 }),
    };
  
    const add = (mesh, parent = group, pos, mat) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // --- Torso “shard” (hex column) ------------------------------------------------
    const torso = new THREE.Group(); group.add(torso); torso.position.set(0, 1.6 * scale, 0);
    const hex = add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 2.0, 6), M.shell), torso);
    // glowing seams
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.02, 6, 1, true), M.glowA), torso);
  
    // Core crystal (weakpoint you can pulse/highlight)
    const core = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), M.glowB), torso, new THREE.Vector3(0, 0.25, 0));
  
    // Head block with visor slit (brighter emissive when "real" among mirages)
    const headMat = mats?.head ? mats.head.clone() : new THREE.MeshLambertMaterial({ color: colors.shell });
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.9), headMat), torso, new THREE.Vector3(0, 1.5, 0));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.06), M.visor), head, new THREE.Vector3(0, 0.05, 0.48));
  
    // Shoulder shards (small angled blocks)
    const shard = (x) => {
      const g = new THREE.Group(); torso.add(g); g.position.set(x, 0.95, 0.0);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 1.1), M.plate), g);
      m.rotation.y = (x > 0 ? -1 : 1) * 0.25;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 1.1), x > 0 ? M.glowC : M.glowB), g, new THREE.Vector3((x > 0 ? 0.34 : -0.34), 0, 0));
    };
    shard( 0.95); shard(-0.95);
  
    // Hips + simple legs (kept abstract; this boss floats/steps minimally)
    const hips = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.0), M.shell), group, new THREE.Vector3(0, 0.8 * scale, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.8), M.plate), group, new THREE.Vector3(0, 0.55 * scale, 0));
  
    // --- Halo ring (rotating emitters for radial barrages) -------------------------
    const halo = new THREE.Group(); group.add(halo); halo.position.set(0, 2.45 * scale, 0);
    const torus = add(new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.06, 8, 48), M.glowB), halo);
    torus.rotation.x = Math.PI / 2;
    const beamAnchors = [];
    const EMITTERS = 8;
    for (let i = 0; i < EMITTERS; i++) {
      const a = (i / EMITTERS) * Math.PI * 2;
      const hp = new THREE.Object3D();
      halo.add(hp);
      hp.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8);
      hp.lookAt(halo.position.x, halo.position.y, halo.position.z);
      // tiny bead for visual debugging (disable/opacity=0 if you don't want to see them)
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), M.glowC);
      bead.position.z = 0.05;
      hp.add(bead);
      beamAnchors.push(hp);
    }
  
    // --- Orbiting “glitch beams” beads (logic can stretch cylinders between them) --
    const orbitBeads = [];
    const beadRing = new THREE.Group(); group.add(beadRing); beadRing.position.set(0, 2.0 * scale, 0);
    const BEADS = 12;
    for (let i = 0; i < BEADS; i++) {
      const a = (i / BEADS) * Math.PI * 2;
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), i % 2 ? M.glowA : M.glowC), beadRing,
        new THREE.Vector3(Math.cos(a) * 1.2, 0.0, Math.sin(a) * 1.2));
      orbitBeads.push(b);
    }
  
    // --- Floating mirror plates (can rotate/phase; also used as safe-lane hints) ---
    const plateOrbiters = [];
    const plates = [];
    const PLATES = 6;
    for (let i = 0; i < PLATES; i++) {
      const a = (i / PLATES) * Math.PI * 2;
      const orb = new THREE.Group(); group.add(orb);
      orb.position.set(Math.cos(a) * 2.6, 1.6 * scale, Math.sin(a) * 2.6);
      const p = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 1.8), M.plate), orb);
      p.rotation.y = a + Math.PI / 2;
      // edge glow
      add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.8), i % 2 ? M.glowB : M.glowA), orb, new THREE.Vector3(0.12, 0, 0));
      plateOrbiters.push(orb);
      plates.push(p);
    }
  
    // --- Mirage clone sockets (spawn fake avatars; one will be the real) ----------
    const mirageAnchors = [];
    const MIRAGES = 5;
    const r = 3.2;
    for (let i = 0; i < MIRAGES; i++) {
      const a = (i / MIRAGES) * Math.PI * 2 + (Math.PI / MIRAGES);
      const s = new THREE.Object3D();
      group.add(s);
      s.position.set(Math.cos(a) * r, 1.6 * scale, Math.sin(a) * r);
      s.lookAt(group.position);
      mirageAnchors.push(s);
    }
  
    // --- Time-dilation ring spawn anchor ------------------------------------------
    const timeRingAnchor = new THREE.Object3D();
    group.add(timeRingAnchor);
    timeRingAnchor.position.set(0, 0.04, 0);
  
    // Collect emissive materials for easy pulsing in logic
    const emissives = [M.glowA, M.glowB, M.glowC];
  
    // Slight menacing tilt
    group.rotation.x = -0.03;
    group.scale.set(scale, scale, scale);
  
    return {
      root: group,
      head,
      refs: {
        core,
        halo,
        beamAnchors,
        mirageAnchors,
        timeRingAnchor,
        plateOrbiters,
        plates,
        orbitBeads,
        emissives,
      }
    };
  }
  
  // -----------------------------------------------------------------------------
  // Optional helper props you’ll likely want with this boss
  // -----------------------------------------------------------------------------
  
  // Visual-only time-dilation ring (spawn at timeRingAnchor and animate scale/opacity)
  export function createBeatTimeRingAsset({ THREE, radius = 1.6, palette } = {}) {
    const colors = Object.assign({ ring: 0x22d3ee, rim: 0x7c3aed }, palette || {});
    const matRing = new THREE.MeshBasicMaterial({ color: colors.ring, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const matRim  = new THREE.MeshBasicMaterial({ color: colors.rim,  transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const group = new THREE.Group();
  
    const disk = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 48), matRing);
    disk.rotation.x = -Math.PI / 2; disk.position.y = 0.02; group.add(disk);
  
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 64), matRim);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; group.add(ring);
  
    return { root: group, refs: { disk, ring } };
  }
  
  // Tiny glitch beam segment (you can scale in Z or stretch between two anchors)
  export function createGlitchBeamSegment({ THREE, length = 2.0, palette } = {}) {
    const color = (palette && palette.color) || 0xf8fafc;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 8, 1, true), mat);
    // orient so Y is the length axis; logic can rotate/scale as needed
    return { root: mesh, refs: {} };
  }
  