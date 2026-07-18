// The Algorithm — Wave 40 campaign boss asset.
// The gameplay contract deliberately exposes the eye/head pivots so visual aim,
// telegraph direction and damage collision can share one source of truth.

function materialSet(THREE, mats, palette = {}) {
  const colors = {
    shell: 0x20352e,
    dark: 0x070b09,
    cyan: 0x43e8df,
    pink: 0xff4fd8,
    acid: 0xd7ff3f,
    amber: 0xffb84d,
    ...palette
  };
  const lambert = (color, emissive = null, intensity = 0) => new THREE.MeshLambertMaterial({
    color,
    ...(emissive == null ? {} : { emissive, emissiveIntensity: intensity })
  });
  return {
    colors,
    shell: lambert(colors.shell, 0x07110d, 0.55),
    dark: lambert(colors.dark),
    cyan: lambert(colors.cyan, colors.cyan, 1.25),
    pink: lambert(colors.pink, colors.pink, 1.1),
    acid: lambert(colors.acid, colors.acid, 1.45),
    amber: lambert(colors.amber, colors.amber, 1.15),
    head: mats?.head?.clone?.() || lambert(colors.dark)
  };
}

export function createAlgorithmAsset({ THREE, mats, scale = 1, palette } = {}) {
  const M = materialSet(THREE, mats, palette);
  const root = new THREE.Group();
  root.name = 'algorithm_boss_root';

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.05, 0.48, 12), M.dark);
  pedestal.position.y = 0.24;
  root.add(pedestal);
  const pedestalRing = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.055, 7, 56), M.cyan);
  pedestalRing.rotation.x = Math.PI / 2;
  pedestalRing.position.y = 0.51;
  root.add(pedestalRing);

  const body = new THREE.Group();
  body.position.y = 3.35;
  root.add(body);

  const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(1.18, 0), M.shell);
  shell.scale.set(0.88, 1.28, 0.88);
  shell.userData.bodyPart = 'torso';
  body.add(shell);

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.64, 0), M.cyan);
  core.rotation.set(0.3, 0.25, 0.2);
  core.userData.bodyPart = 'torso';
  body.add(core);

  const rings = [];
  [[1.55, 0.05], [1.92, 0.042], [2.28, 0.034]].forEach(([radius, tube], index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 64), index === 1 ? M.pink : M.cyan);
    ring.rotation.set(index * 0.54, index * 0.35, index * 0.22);
    body.add(ring);
    rings.push(ring);
  });

  const crown = new THREE.Group();
  body.add(crown);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.92, 4), i % 2 ? M.cyan : M.shell);
    shard.position.set(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3, 0);
    shard.rotation.z = angle - Math.PI / 2;
    crown.add(shard);
  }

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.x = side * 1.08;
    body.add(wing);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.28 - i * 0.13, 0.12), i === 0 ? M.cyan : M.shell);
      blade.position.set(side * (0.35 + i * 0.3), 0.15 - i * 0.18, -0.06 * i);
      blade.rotation.z = side * (-0.35 - i * 0.13);
      wing.add(blade);
    }
    wings.push(wing);
  }

  const headPivot = new THREE.Group();
  headPivot.name = 'algorithm_head_yaw';
  body.add(headPivot);
  const headPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 0.28, 8), M.head);
  headPlate.rotation.x = Math.PI / 2;
  headPlate.position.set(0, 0.08, 0.9);
  headPlate.userData.bodyPart = 'head';
  headPivot.add(headPlate);
  const faceRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 7, 36), M.cyan);
  faceRing.position.set(0, 0.08, 1.07);
  headPivot.add(faceRing);
  const faceLens = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), M.acid);
  faceLens.position.set(0, 0.08, 1.12);
  faceLens.scale.set(1, 0.68, 0.35);
  faceLens.userData.bodyPart = 'head';
  headPivot.add(faceLens);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.09, 0.09), M.shell);
  brow.position.set(0, 0.43, 1.06);
  brow.rotation.z = -0.08;
  headPivot.add(brow);

  // +Z is visual forward. Cone apex remains at the eye after the -PI/2 rotation.
  const beamPivot = new THREE.Group();
  beamPivot.name = 'algorithm_eye_pitch';
  beamPivot.position.set(0, 0.08, 1.13);
  headPivot.add(beamPivot);
  const beamLength = 28;
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: M.colors.pink,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beamCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb9ef,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, beamLength, 3, 1, true), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.z = beamLength / 2;
  beam.visible = false;
  beam.userData.nonTargetVisual = true;
  beam.raycast = () => {};
  beamPivot.add(beam);
  const beamCore = new THREE.Mesh(new THREE.ConeGeometry(0.5, beamLength + 0.1, 3, 1, true), beamCoreMaterial);
  beamCore.rotation.x = -Math.PI / 2;
  beamCore.position.z = (beamLength + 0.1) / 2;
  beamCore.visible = false;
  beamCore.userData.nonTargetVisual = true;
  beamCore.raycast = () => {};
  beamPivot.add(beamCore);
  const eyeLight = new THREE.PointLight(M.colors.pink, 0, 7);
  eyeLight.position.z = 0.1;
  beamPivot.add(eyeLight);

  const weakRoot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), M.acid);
  // Mount the punish core on the front of the lower shell. At z=0 the torso
  // intercepted hits even though the glowing core remained partially visible.
  weakRoot.position.set(0, -1.25, 1.15);
  weakRoot.userData.bodyPart = 'weakpoint';
  weakRoot.visible = false;
  body.add(weakRoot);
  const weakHalo = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.06, 7, 40), M.acid);
  weakHalo.rotation.x = Math.PI / 2;
  weakHalo.position.set(0, -1.25, 1.15);
  weakHalo.visible = false;
  weakHalo.userData.nonTargetVisual = true;
  weakHalo.raycast = () => {};
  body.add(weakHalo);

  root.scale.setScalar(scale);
  return {
    root,
    head: faceLens,
    refs: {
      body, shell, core, rings, crown, wings, pedestalRing,
      headPivot, headPlate, faceRing, faceLens, beamPivot,
      beam, beamCore, beamMaterial, beamCoreMaterial, eyeLight,
      weakRoot, weakHalo, beamLength
    }
  };
}

export function createAlgorithmNodeAsset({ THREE, mats, color = 0x43e8df } = {}) {
  const root = new THREE.Group();
  const shell = mats?.enemy?.clone?.() || new THREE.MeshLambertMaterial({ color: 0x20352e });
  shell.color?.setHex?.(0x20352e);
  const glow = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 1.2 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 1.25, 6), shell);
  base.position.y = 0.63;
  root.add(base);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), glow);
  core.position.y = 1.52;
  core.userData.bodyPart = 'head';
  root.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 32), glow.clone());
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.52;
  root.add(halo);
  return { root, head: core, refs: { core, halo } };
}

export function createAlgorithmEchoAsset({ THREE, mats, color = 0xff4fd8 } = {}) {
  const root = new THREE.Group();
  const ghost = new THREE.MeshLambertMaterial({ color: 0x31132b, emissive: color, emissiveIntensity: 0.75, transparent: true, opacity: 0.78 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), ghost);
  core.position.y = 1.6;
  core.userData.bodyPart = 'head';
  root.add(core);
  const ringMaterial = ghost.clone();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 6, 36), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.6;
  root.add(ring);
  const spine = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.45, 4), ghost.clone());
  spine.position.y = 0.63;
  root.add(spine);
  return { root, head: core, refs: { core, ring, spine, emissives: [core, ring, spine] } };
}
