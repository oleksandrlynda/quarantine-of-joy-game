// Deterministic low platforms with ramps and rails
// Export: generatePlatforms({ THREE, rng, objects, existingAABBs, max=6 })
// Returns { meshes: THREE.Object3D[], aabbs: Box3[] }

export function generatePlatforms({ THREE, rng, objects, existingAABBs = [], max = 6 }){
  const meshes = [];
  const aabbs = [];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const walls = {
    min: -38, // inner edge safe region similar to enemy spawn rings
    max: 38
  };

  // Helper: AABB utilities
  const makeAABBFromObject = (obj) => new THREE.Box3().setFromObject(obj);
  const intersectsAny = (bb, list) => list.some(b => bb.intersectsBox(b));
  const expandXZ = (bb, m) => {
    const e = bb.clone();
    e.min.x -= m; e.max.x += m; e.min.z -= m; e.max.z += m;
    return e;
  };

  // Collect crate AABBs from existing objects (guess by size/material is unreliable; use AABB list)
  const existing = existingAABBs.slice();

  // Candidate anchors along walls every ~6 units, inset by 2.5
  const candidates = [];
  const step = 6;
  const inset = 2.5;
  for (let x = walls.min + step; x <= walls.max - step; x += step) {
    candidates.push({ x, z: walls.min + inset }); // south
    candidates.push({ x, z: walls.max - inset }); // north
  }
  for (let z = walls.min + step; z <= walls.max - step; z += step) {
    candidates.push({ x: walls.min + inset, z }); // west
    candidates.push({ x: walls.max - inset, z }); // east
  }

  // Candidates near crates/destructibles: use existing AABBs that are not the walls (thin long)
  for (const bb of existing) {
    const size = new THREE.Vector3(); bb.getSize(size);
    if (size.x > 60 || size.z > 60) continue; // skip arena walls
    const cx = (bb.min.x + bb.max.x) * 0.5;
    const cz = (bb.min.z + bb.max.z) * 0.5;
    const offs = 1.6 + rng() * 0.6; // 1.6–2.2 outward
    candidates.push({ x: cx + offs, z: cz });
    candidates.push({ x: cx - offs, z: cz });
    candidates.push({ x: cx, z: cz + offs });
    candidates.push({ x: cx, z: cz - offs });
  }

  // Deterministic shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0; [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const placed = [];

  // Build a large base with simple access
  function buildPlatform(center){
    const w = 4 + rng() * 4; // 4–8
    const d = 3.5 + rng() * 4; // 3.5–7.5
    const height = 1.2 + rng() * 0.6; // 1.2–1.8 (taller)

    // Reject near center radius 3
    if ((center.x*center.x + center.z*center.z) < 9) return null;

    const group = new THREE.Group();

    // Solid base from floor up to height
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), new THREE.MeshLambertMaterial({ color: 0x9ca3af }));
    base.position.set(center.x, height/2, center.z);
    group.add(base);

    // Access ramp: simple single prism ramp rotated to meet top, guaranteeing climbable access
    const rampAABBs = [];
    const theta = Math.PI/8; // ~22.5°
    const t = 0.3;           // thickness
    const rampWidth = 2.0;   // wider ramp
    const L = Math.max(2.4, (height - (t * 0.5) * Math.cos(theta)) / Math.sin(theta));
    const halfProj = 0.5 * L * Math.cos(theta);
    const centerY = 0.5 * (L * Math.sin(theta)) + 0.5 * t * Math.cos(theta);

    const makeRamp = (dir) => {
      const mat = new THREE.MeshLambertMaterial({ color: 0x8f9aa8 });
      let ramp;
      if (dir === 'N' || dir === 'S') ramp = new THREE.Mesh(new THREE.BoxGeometry(rampWidth, t, L), mat);
      else ramp = new THREE.Mesh(new THREE.BoxGeometry(L, t, rampWidth), mat);
      if (dir === 'N') { ramp.rotation.set(-theta, 0, 0); ramp.position.set(center.x, centerY, center.z + d/2 + halfProj); }
      else if (dir === 'S') { ramp.rotation.set(theta, 0, 0); ramp.position.set(center.x, centerY, center.z - d/2 - halfProj); }
      else if (dir === 'E') { ramp.rotation.set(0, Math.PI/2, -theta); ramp.position.set(center.x + w/2 + halfProj, centerY, center.z); }
      else { ramp.rotation.set(0, Math.PI/2, theta); ramp.position.set(center.x - w/2 - halfProj, centerY, center.z); }
      group.add(ramp); rampAABBs.push(makeAABBFromObject(ramp));
    };

    const toEdges = [
      {dir:'N', d: walls.max - (center.z + d/2)},
      {dir:'S', d: (center.z - d/2) - walls.min},
      {dir:'E', d: walls.max - (center.x + w/2)},
      {dir:'W', d: (center.x - w/2) - walls.min}
    ].sort((a,b)=>b.d-a.d);
    makeRamp(toEdges[0].dir);

    // No rails on the simple variant

    // Compute AABB for full group
    const baseBB = makeAABBFromObject(base);
    let groupBB = baseBB.clone();
    for (const rb of rampAABBs) groupBB = groupBB.union(rb);

    return { group, bb: groupBB };
  }

  const clearance = 1.5; // corridors >=1.5

  for (const c of candidates){
    if (meshes.length >= max) break;
    // Sample slight jitter so they don't look too grid-aligned
    const pos = { x: c.x + (rng()*0.6-0.3), z: c.z + (rng()*0.6-0.3) };
    // Clamp to inner arena margins
    pos.x = clamp(pos.x, walls.min+2.0, walls.max-2.0);
    pos.z = clamp(pos.z, walls.min+2.0, walls.max-2.0);

    const built = buildPlatform(pos);
    if (!built) continue;
    const bb = expandXZ(built.bb, clearance*0.5);
    // Reject if overlaps any existing or already placed
    if (intersectsAny(bb, existing)) continue;
    if (intersectsAny(bb, aabbs)) continue;

    meshes.push(built.group);
    aabbs.push(built.bb);
  }

  return { meshes, aabbs };
}


