// Echo Hydraclone (Fractal Replicator) — asset only
// Usage: createHydracloneAsset({ THREE, mats, generation: 0|1|2|3 })
// Returns { root, head, refs }  (refs: { leftArm,rightArm,leftLeg,rightLeg, core, shards[] })
//
// Notes

import { logError } from '../util/log.js';
// - Forward is +Z (like most of your melee rigs). Change if you prefer -Z.
// - root.userData.bounds.radius is set from a post-build bounding sphere (helpful for split pulses).
// - Glow intensifies slightly by generation to sell “glitchy swarm.”

export function createHydracloneAsset({
    THREE,
    mats,
    generation = 0,     // 0..3
    scale,              // optional override; if omitted uses preset per gen
    palette
  } = {}) {
    const group = new THREE.Group();
  
    // Preset per generation (visual scale only)
    const genScale = [1.0, 0.55, 0.35, 0.22][Math.max(0, Math.min(3, generation))];
    const S = (typeof scale === 'number' ? scale : genScale);
  
    // Colors (cool cyber + teal/magenta glitch)
    const colors = Object.assign(
      {
        armor: 0x8a93a0,     // cool gray plates
        accent: 0x5b6572,    // darker panels
        joints: 0x202428,    // rubber/mech
        visor: 0x10141a,     // head slab
        glowA: 0x22e3ef,     // cyan (lines/halo)
        glowB: 0xec59ff      // magenta (core)
      },
      palette || {}
    );
  
    // Slight glow boost as the generation goes up (more “noisy”)
    const glowBoost = 0.9 + generation * 0.08;
  
    const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
    const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
    const matJoint  = new THREE.MeshLambertMaterial({ color: colors.joints });
  
    const matHead = (mats?.head ? mats.head.clone()
                                : new THREE.MeshLambertMaterial({ color: colors.visor }));
  
    const matGlowA = new THREE.MeshLambertMaterial({
      color: colors.glowA, emissive: colors.glowA, emissiveIntensity: 0.85 * glowBoost
    });
    const matGlowB = new THREE.MeshLambertMaterial({
      color: colors.glowB, emissive: colors.glowB, emissiveIntensity: 0.95 * glowBoost
    });
  
    const add = (mesh, parent = group, pos = null, mat = null) => {
      if (mat) mesh.material = mat;
      if (pos) mesh.position.set(pos.x, pos.y, pos.z);
      parent.add(mesh);
      return mesh;
    };
  
    // ============= Body layout (tall, faceted, “algorithmic”) =============
    // Central chassis (slightly hex-like via stacked segments)
    const chest = add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.25, 1.0), matArmor),
                      group, new THREE.Vector3(0, 1.45 * S, 0));
    chest.userData.bodyPart = 'torso';
  
    // Facet plates
    add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.96), matAccent), chest, new THREE.Vector3(0,  0.42, 0));
    add(new THREE.Mesh(new THREE.BoxGeometry(1.16,0.14, 0.98), matAccent), chest, new THREE.Vector3(0, -0.44, 0));
  
    // Chest “fracture lines”
    add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.70, 0.04), matGlowA), chest, new THREE.Vector3(-0.36, 0.02, 0.52));
    add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.70, 0.04), matGlowA), chest, new THREE.Vector3( 0.36, 0.02, 0.52));
  
    // Head slab with visor slit (non-emissive base; your game may tint)
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.62, 0.72), matHead),
                     group, new THREE.Vector3(0, 2.25 * S, 0.02));
    head.userData.bodyPart = 'head';
    add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.10, 0.05),
        new THREE.MeshLambertMaterial({ color: colors.visor })), head, new THREE.Vector3(0, 0.05, 0.40));
  
    // Abdomen / hips
    const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.90), matAccent),
                        group, new THREE.Vector3(0, 1.0 * S, 0));
    const hips = add(new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.46, 0.96), matArmor),
                     group, new THREE.Vector3(0, 0.62 * S, 0));
  
    // ============= Arms (segmented, with glow rails) =============
    const refs = { leftArm:null, rightArm:null, leftLeg:null, rightLeg:null, core:null, shards:[] };
  
    const mkArm = (side) => {
      const root = new THREE.Group(); root.position.set(0.98 * side, 1.52 * S, 0); group.add(root);
      const shoulder = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.56), matArmor), root, new THREE.Vector3(0, 0, 0));
      const upper = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.46), matJoint), shoulder, new THREE.Vector3(0, -0.52, 0));
      const fore  = add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.48), matAccent), upper, new THREE.Vector3(0, -0.70, 0));
      // glow rail
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.05), matGlowA), fore,
          new THREE.Vector3(0.20 * side, -0.05, 0.26));
      // fist
      add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), matJoint), fore,
          new THREE.Vector3(0, -0.48, 0));
      return root;
    };
    refs.rightArm = mkArm( 1);
    refs.leftArm  = mkArm(-1);
  
    // ============= Legs (digitigrade-ish, fast silhouette) =============
    const mkLeg = (side) => {
      const root = new THREE.Group(); root.position.set(0.46 * side, -0.08, 0); hips.add(root);
      const thigh = add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.56), matArmor),
                        root, new THREE.Vector3(0, -0.58, 0));
      const shin  = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.52), matAccent),
                        thigh, new THREE.Vector3(0, -0.84, 0));
      add(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.28, 0.88), matJoint),
          shin, new THREE.Vector3(0, -0.58, 0));
      // shin line
      add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.05), matGlowA), shin,
          new THREE.Vector3(0.22 * side, -0.18, 0.22));
      return root;
    };
    refs.rightLeg = mkLeg( 1);
    refs.leftLeg  = mkLeg(-1);
  
    // ============= Core + shard halo =============
    // Core crystal (octahedron) sits inside chest
    const core = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), matGlowB), chest, new THREE.Vector3(0, 0.02, 0));
    refs.core = core;
  
    // Shards: small tetra “glitch” pieces in a ring behind shoulders
    const halo = new THREE.Group(); chest.add(halo); halo.position.set(0, 0.10, -0.54);
    const shardCount = 8;
    for (let i = 0; i < shardCount; i++) {
      const a = (i / shardCount) * Math.PI * 2;
      const x = Math.cos(a) * 0.65;
      const y = -0.10 + Math.sin(a * 2) * 0.20;
      const z = Math.sin(a) * 0.10;
      const shard = add(new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), matGlowA),
                        halo, new THREE.Vector3(x, y, z));
      shard.rotation.set(Math.sin(a)*0.6, a, Math.cos(a)*0.6);
      refs.shards.push(shard);
    }
  
    // Subtle forward menace
    group.rotation.x = -0.03;
  
    // Final scale
    group.scale.set(S, S, S);
  
    // Stamp a bounds radius for gameplay (split knockback, spawn spacing, etc.)
    try {
      const box = new THREE.Box3().setFromObject(group);
      const sph = new THREE.Sphere();
      box.getBoundingSphere(sph);
      group.userData.bounds = { radius: sph.radius, box };
    } catch (e) { logError(e); }
  
    return { root: group, head, refs };
  }
  