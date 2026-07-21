export const POST_CAMPAIGN_ASSET_COUNT = 15;

export function createPostCampaignLevelAssetRegistry({ THREE } = {}) {
  if (!THREE) throw new TypeError('createPostCampaignLevelAssetRegistry requires THREE.');

  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .86,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    flatShading: true
  });

  const m = {
    acid: material(0xa6c844, { emissive: 0x28350f, emissiveIntensity: .42, roughness: .58 }),
    black: material(0x101613),
    charcoal: material(0x202a26),
    concrete: material(0x747c75),
    cyan: material(0x4ea9a3, { emissive: 0x0d2f2d, emissiveIntensity: .38 }),
    cyanGlass: material(0x438f8b, { emissive: 0x0d2b29, emissiveIntensity: .28, transparent: true, opacity: .46, roughness: .3 }),
    dark: material(0x19231f),
    green: material(0x435a37),
    metal: material(0x56625c, { metalness: .18, roughness: .72 }),
    orange: material(0xb65c36, { emissive: 0x351308, emissiveIntensity: .16 }),
    pale: material(0xa5ada1),
    purple: material(0x644c82, { emissive: 0x1b1228, emissiveIntensity: .22 }),
    red: material(0xd24f48, { emissive: 0x450e0b, emissiveIntensity: .55 }),
    sand: material(0x907b58),
    sandDark: material(0x62543d),
    water: material(0x315e68, { transparent: true, opacity: .62, roughness: .36, metalness: .06 }),
    white: material(0xbfc6bc),
    yellow: material(0xba9333, { emissive: 0x362708, emissiveIntensity: .16 })
  };

  const finish = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const box = (group, size, position, mat, rotation = [0, 0, 0]) => {
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(...size), mat));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const cylinder = (group, radii, height, segments, position, mat, rotation = [0, 0, 0]) => {
    const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, segments), mat));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const sphere = (group, radius, position, mat, scale = [1, 1, 1]) => {
    const mesh = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };

  const torus = (group, radius, tube, position, mat, rotation = [Math.PI / 2, 0, 0], arc = Math.PI * 2) => {
    const mesh = finish(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 20, arc), mat));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const beam = (group, start, end, thickness, mat, depth = thickness) => {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const direction = endPoint.clone().sub(startPoint);
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(thickness, direction.length(), depth), mat));
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
    return mesh;
  };

  function buildSandbankKit() {
    const root = new THREE.Group();
    root.name = 'modular_sandbank_family';
    const modules = [
      { x: -5.2, z: 0, scale: [1.8, .48, 1], rotation: .08 },
      { x: 0, z: -.1, scale: [2.2, .72, .82], rotation: -.12 },
      { x: 5.1, z: .15, scale: [1.65, .58, 1.12], rotation: .16 }
    ];
    modules.forEach(({ x, z, scale, rotation }, moduleIndex) => {
      const bank = cylinder(root, [2.25, 3.05], 1.45, 7, [x, .48, z], moduleIndex === 1 ? m.sandDark : m.sand);
      bank.scale.set(...scale);
      bank.rotation.y = rotation;
      box(root, [4.8, .12, 3.25], [x, .03, z], m.sandDark, [0, rotation, 0]);
      for (let ridge = 0; ridge < 3; ridge += 1) {
        beam(root, [x - 1.65 + ridge * .75, .2 + ridge * .16, z - 1.0], [x + 1.35 + ridge * .45, .35 + ridge * .12, z + .9], .055, m.yellow, .035);
      }
      if (moduleIndex === 1) {
        box(root, [3.4, .52, .22], [x + .35, .47, z + .48], m.metal, [0, rotation, -.12]);
        for (const offset of [-1.25, 0, 1.25]) box(root, [.12, .78, .12], [x + offset, .48, z + .52], m.dark, [0, rotation, -.12]);
      }
    });
    return root;
  }

  function buildStormSiren() {
    const root = new THREE.Group();
    root.name = 'storm_siren_tower';
    cylinder(root, [1.55, 1.8], .34, 10, [0, .17, 0], m.sandDark);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const x = Math.cos(angle) * 1.15;
      const z = Math.sin(angle) * 1.15;
      beam(root, [x, .3, z], [0, 5.3, 0], .16, m.dark);
      box(root, [.55, .12, .55], [x, .08, z], m.yellow);
    }
    for (const y of [1.8, 3.4, 5]) torus(root, .54, .07, [0, y, 0], m.metal);
    cylinder(root, [.13, .17], 6.3, 8, [0, 3.5, 0], m.charcoal);
    box(root, [2.8, .24, .45], [0, 6.15, 0], m.metal);
    for (const side of [-1, 1]) {
      const horn = cylinder(root, [.58, .15], 1.05, 8, [side * .85, 6.15, 0], m.yellow, [0, 0, Math.PI / 2]);
      horn.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      sphere(root, .14, [side * 1.43, 6.15, 0], m.orange);
    }
    cylinder(root, [.28, .38], .55, 8, [0, 6.78, 0], m.orange);
    sphere(root, .21, [0, 7.12, 0], m.red);
    box(root, [.78, .95, .42], [.75, 1.05, .25], m.orange);
    box(root, [.42, .18, .04], [.75, 1.15, .48], m.cyan);
    return root;
  }

  function buildEnduranceMonument() {
    const root = new THREE.Group();
    root.name = 'endurance_relay_monument';
    cylinder(root, [2.5, 2.8], .24, 12, [0, .12, 0], m.sandDark);
    cylinder(root, [1.65, 2.05], .65, 10, [0, .5, 0], m.dark);
    cylinder(root, [.55, .8], 3.3, 8, [0, 2.45, 0], m.metal);
    for (const y of [1.35, 2.3, 3.25]) torus(root, .72, .1, [0, y, 0], y === 3.25 ? m.acid : m.cyan);
    sphere(root, .48, [0, 4.35, 0], m.acid);
    for (const angle of [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6]) {
      const x = Math.cos(angle) * 1.8;
      const z = Math.sin(angle) * 1.8;
      box(root, [.35, 1.7, .95], [x, 1.15, z], m.yellow, [0, -angle, -.18]);
      box(root, [.18, .58, .98], [x, 1.32, z], m.cyan, [0, -angle, -.18]);
      beam(root, [x * .5, .55, z * .5], [x, 1.75, z], .08, m.orange);
    }
    return root;
  }

  function buildSandstormBackdrop() {
    const root = new THREE.Group();
    root.name = 'sandstorm_expanse_horizon';
    box(root, [28, .35, 5], [0, .17, 0], m.sandDark);
    [-10.5, -4.2, 3.3, 10.2].forEach((x, index) => {
      const mesa = cylinder(root, [3.2 + index % 2, 4.3], 3.2 + index * .35, 7, [x, 1.5 + index * .15, -.2], index % 2 ? m.sand : m.sandDark);
      mesa.scale.z = .55;
    });
    for (const x of [-12.5, 12.2]) {
      cylinder(root, [.12, .18], 5.6, 7, [x, 3.4, 1.1], m.dark);
      for (let blade = 0; blade < 3; blade += 1) {
        const angle = blade * Math.PI * 2 / 3;
        beam(root, [x, 6.1, 1.1], [x + Math.cos(angle) * 1.55, 6.1 + Math.sin(angle) * 1.55, 1.1], .08, m.metal, .05);
      }
    }
    for (const x of [-6.8, 0, 6.8]) {
      cylinder(root, [.23, .42], 5.1, 8, [x, 2.8, 1], m.charcoal);
      box(root, [1.35, .28, .55], [x, 5.25, 1], m.yellow);
      sphere(root, .14, [x, 5.55, 1], x === 0 ? m.acid : m.red);
    }
    return root;
  }

  function buildFloodgateKit() {
    const root = new THREE.Group();
    root.name = 'modular_floodgate_states';
    [-6, -2, 2, 6].forEach((x, index) => {
      const state = new THREE.Group();
      state.name = ['state_closed', 'state_opening', 'state_locked', 'state_damaged'][index];
      state.position.x = x;
      root.add(state);
      for (const side of [-1, 1]) box(state, [.42, 4.7, 1.35], [side * 1.55, 2.35, 0], m.concrete);
      box(state, [3.55, .5, 1.5], [0, 4.55, 0], m.pale);
      const gateY = index === 1 ? 3.55 : 2.2;
      box(state, [2.65, index === 1 ? 1.45 : 3.85, .42], [0, gateY, .05], index === 3 ? m.charcoal : m.metal, [0, 0, index === 3 ? .15 : 0]);
      for (let rib = -2; rib <= 2; rib += 1) box(state, [.14, index === 1 ? 1.2 : 3.55, .08], [rib * .48, gateY, .3], m.dark);
      box(state, [1.6, .2, .08], [0, 4.62, .79], index === 2 ? m.red : m.cyan);
      box(state, [.48, .65, .3], [1.7, 2.65, .75], m.orange);
      sphere(state, .1, [1.7, 2.82, .92], index === 0 ? m.cyan : m.red);
      if (index === 2) {
        beam(state, [-1.05, 1.05, .38], [1.05, 3.25, .38], .16, m.yellow, .08);
        beam(state, [-1.05, 3.25, .38], [1.05, 1.05, .38], .16, m.yellow, .08);
      }
      if (index === 3) for (const p of [[-.9,.2,.5],[.2,.15,.8],[1.15,.18,.35]]) box(state, [.65, .28, .42], p, m.concrete, [p[0] * .08, p[2], p[0] * .2]);
    });
    return root;
  }

  function buildPumpTurbine() {
    const root = new THREE.Group();
    root.name = 'pump_and_turbine_family';
    box(root, [4.6, .32, 3.2], [-2.6, .16, 0], m.concrete);
    cylinder(root, [1.25, 1.4], 2.4, 10, [-2.6, 1.55, 0], m.orange);
    for (let rib = 0; rib < 8; rib += 1) {
      const angle = rib * Math.PI / 4;
      beam(root, [-2.6, 1.55, .98], [-2.6 + Math.cos(angle) * .95, 1.55 + Math.sin(angle) * .95, .98], .12, m.dark, .08);
    }
    torus(root, 1.1, .18, [-2.6, 1.55, 1.25], m.metal, [0, 0, 0]);
    cylinder(root, [.28, .28], 2.9, 8, [-2.6, 1.55, 1.1], m.cyan, [Math.PI / 2, 0, 0]);
    box(root, [4.8, .32, 3.2], [2.55, .16, 0], m.concrete);
    cylinder(root, [1.2, 1.55], .6, 10, [2.55, .55, 0], m.dark);
    box(root, [2.5, 2.2, 1.8], [2.55, 1.85, 0], m.metal);
    for (let vent = -2; vent <= 2; vent += 1) box(root, [.18, 1.45, .08], [2.55 + vent * .38, 1.85, .94], m.black);
    cylinder(root, [.42, .42], 3.2, 8, [2.55, 3.95, 0], m.pale);
    torus(root, .68, .12, [2.55, 5.55, 0], m.cyan, [0, 0, 0]);
    box(root, [.72, .9, .35], [3.75, 1.75, 1.03], m.orange);
    box(root, [.42, .18, .04], [3.75, 1.95, 1.22], m.acid);
    return root;
  }

  function buildSluiceConduits() {
    const root = new THREE.Group();
    root.name = 'sluice_pipe_and_overhead_conduits';
    for (const x of [-3.1, 3.1]) {
      box(root, [.42, 4.8, .42], [x, 2.4, 0], m.concrete);
      box(root, [.82, .22, .82], [x, .11, 0], m.pale);
    }
    box(root, [7.0, .35, .55], [0, 4.65, 0], m.metal);
    for (const z of [-.62, 0, .62]) {
      cylinder(root, [.18, .18], 6.2, 8, [0, 4.25, z], z === 0 ? m.cyan : m.dark, [0, 0, Math.PI / 2]);
      for (const x of [-2.2, 0, 2.2]) torus(root, .28, .06, [x, 4.25, z], m.yellow, [0, Math.PI / 2, 0]);
    }
    for (const x of [-2.35, 2.35]) {
      cylinder(root, [.72, .72], 2.7, 10, [x, 1.6, -.15], m.metal);
      torus(root, .74, .12, [x, 2.95, -.15], m.cyan, [0, 0, 0]);
    }
    box(root, [1.0, 1.1, .45], [0, 3.5, .75], m.orange);
    box(root, [.58, .22, .04], [0, 3.7, 1], m.acid);
    return root;
  }

  function buildArchiveSeed() {
    const root = new THREE.Group();
    root.name = 'continuity_archive_seed_states';
    [-3.5, 0, 3.5].forEach((x, index) => {
      const seed = new THREE.Group();
      seed.name = ['state_shielded', 'state_exposed', 'state_destroyed'][index];
      seed.position.x = x;
      seed.rotation.z = index === 2 ? -.18 : 0;
      root.add(seed);
      cylinder(seed, [.85, 1.1], .35, 9, [0, .18, 0], m.dark);
      cylinder(seed, [.42, .6], 2.4, 8, [0, 1.5, 0], index === 2 ? m.black : m.metal);
      sphere(seed, .52, [0, 2.9, 0], index === 2 ? m.charcoal : m.purple, [1, 1.35, 1]);
      for (const y of [1.0, 2.0, 3.0]) torus(seed, .65, .08, [0, y, 0], index === 0 ? m.cyan : index === 1 ? m.red : m.dark);
      if (index === 0) sphere(seed, 1.05, [0, 2.05, 0], m.cyanGlass, [1, 1.65, 1]);
      if (index === 1) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) beam(seed, [0, 2.9, 0], [Math.cos(angle) * .9, 2.9, Math.sin(angle) * .9], .08, m.red);
      if (index === 2) for (const p of [[-.7,.18,.4],[.55,.12,-.35],[.9,.1,.25]]) box(seed, [.48, .24, .35], p, m.purple, [p[2], p[0], p[0]]);
    });
    return root;
  }

  function buildGreywaterCore() {
    const root = new THREE.Group();
    root.name = 'greywater_master_core';
    cylinder(root, [2.5, 2.8], .3, 14, [0, .15, 0], m.black);
    cylinder(root, [1.25, 1.7], .55, 12, [0, .58, 0], m.metal);
    cylinder(root, [.6, .82], 3.25, 10, [0, 2.45, 0], m.charcoal);
    sphere(root, .72, [0, 4.35, 0], m.cyan, [1, 1.25, 1]);
    for (const radius of [1.15, 1.75]) torus(root, radius, .1, [0, 3.25, 0], radius < 1.5 ? m.cyan : m.purple, [0, 0, 0]);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = Math.cos(angle) * 1.8;
      const z = Math.sin(angle) * 1.8;
      box(root, [.52, 2.6, 1.05], [x, 2.0, z], m.dark, [0, -angle, .12]);
      box(root, [.22, 1.55, 1.08], [x, 2.0, z], angle % Math.PI === 0 ? m.cyan : m.purple, [0, -angle, .12]);
      beam(root, [x * .38, .6, z * .38], [x, 2.8, z], .1, m.yellow);
    }
    box(root, [1.25, .72, .52], [0, 1.15, 1.62], m.orange);
    box(root, [.72, .25, .04], [0, 1.3, 1.9], m.red);
    return root;
  }

  function buildWaterlineDebris() {
    const root = new THREE.Group();
    root.name = 'waterline_debris_kit';
    box(root, [4.3, .18, 2.7], [-3.6, .09, 0], m.concrete);
    for (let bar = 0; bar < 8; bar += 1) box(root, [.12, .12, 2.1], [-5.25 + bar * .47, .22, 0], m.dark, [0, 0, bar % 2 ? .05 : -.05]);
    for (const x of [-4.9, -3.6, -2.3]) box(root, [.38, .04, 2.5], [x, .21, 0], m.green);
    box(root, [4.4, .16, 1.0], [1.7, .18, -.45], m.orange, [0, -.12, 0]);
    for (const x of [.3, 1.7, 3.1]) box(root, [.22, .2, 1.05], [x, .3, -.45], m.yellow, [0, -.12, 0]);
    torus(root, .72, .16, [4.35, .22, .72], m.pale, [Math.PI / 2, .3, 0]);
    box(root, [1.6, .22, .7], [4.65, .22, -.65], m.metal, [0, .45, .08]);
    for (const p of [[.2,.15,1.2],[1.4,.1,1.45],[2.3,.12,1.2]]) sphere(root, .32, p, m.green, [1.7, .22, .8]);
    return root;
  }

  function buildFloodgateBackdrop() {
    const root = new THREE.Group();
    root.name = 'floodgate_continuity_horizon';
    box(root, [28, .35, 5.2], [0, .17, 0], m.dark);
    box(root, [27, 6.8, 1.0], [0, 3.55, -1.8], m.concrete);
    for (const x of [-9, 0, 9]) {
      cylinder(root, [2.3, 2.3], 1.25, 12, [x, 2.8, -1.2], m.black, [Math.PI / 2, 0, 0]);
      torus(root, 2.3, .25, [x, 2.8, -.52], m.pale, [0, 0, 0]);
      box(root, [5.4, .34, .4], [x, 6.35, -.9], m.yellow);
    }
    for (const x of [-13, -4.5, 4.5, 13]) {
      box(root, [.62, 8.5, 1.45], [x, 4.25, -1.2], m.charcoal);
      box(root, [1.35, .3, 1.65], [x, 8.4, -1.2], m.cyan);
    }
    cylinder(root, [.28, .28], 25, 10, [0, 7.2, 1.1], m.metal, [0, 0, Math.PI / 2]);
    return root;
  }

  function buildLastLightReactor() {
    const root = new THREE.Group();
    root.name = 'last_light_reactor';
    cylinder(root, [2.0, 2.3], .28, 14, [0, .14, 0], m.black);
    cylinder(root, [1.3, 1.65], .72, 12, [0, .62, 0], m.charcoal);
    cylinder(root, [.18, .28], 5.1, 8, [0, 3.35, 0], m.metal);
    cylinder(root, [.52, .78], .62, 8, [0, 6.12, 0], m.yellow);
    sphere(root, .34, [0, 6.15, 0], m.acid);
    for (const y of [1.45, 2.35]) torus(root, .68, .1, [0, y, 0], m.cyan);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = Math.cos(angle) * 1.55;
      const z = Math.sin(angle) * 1.55;
      beam(root, [x, .25, z], [0, 1.45, 0], .12, m.orange);
      box(root, [.52, .16, .52], [x, .08, z], m.pale);
    }
    box(root, [1.15, 1.05, .55], [1.15, .98, .55], m.orange);
    box(root, [.68, .3, .04], [1.15, 1.18, .85], m.cyan);
    for (const side of [-1, 1]) {
      cylinder(root, [.2, .3], .55, 8, [side * .55, 6.68, 0], m.red);
      sphere(root, .12, [side * .55, 7.02, 0], m.red);
    }
    return root;
  }

  function buildCisternFloorKit() {
    const root = new THREE.Group();
    root.name = 'radial_cistern_floor_kit';
    cylinder(root, [8.6, 8.6], .18, 32, [0, .09, 0], m.dark);
    cylinder(root, [5.2, 5.2], .06, 32, [0, .21, 0], m.charcoal);
    torus(root, 2.4, .06, [0, .26, 0], m.yellow);
    torus(root, 5.0, .07, [0, .26, 0], m.cyan);
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const angle = spoke * Math.PI / 6;
      beam(root, [Math.cos(angle) * .7, .24, Math.sin(angle) * .7], [Math.cos(angle) * 8.15, .24, Math.sin(angle) * 8.15], .045, spoke % 3 ? m.metal : m.yellow, .025);
    }
    for (let drain = 0; drain < 6; drain += 1) {
      const angle = drain * Math.PI / 3;
      const x = Math.cos(angle) * 6.7;
      const z = Math.sin(angle) * 6.7;
      box(root, [1.45, .08, .7], [x, .25, z], m.black, [0, -angle, 0]);
      for (let bar = -2; bar <= 2; bar += 1) box(root, [.08, .05, .58], [x + Math.cos(angle) * bar * .22, .3, z + Math.sin(angle) * bar * .22], m.pale, [0, -angle, 0]);
    }
    return root;
  }

  function buildBlackoutCues() {
    const root = new THREE.Group();
    root.name = 'blackout_enemy_emissive_cues';
    const cues = [m.cyan, m.purple, m.green, m.orange, m.cyan, m.red, m.acid];
    cues.forEach((cue, index) => {
      const angle = -Math.PI * .72 + index * Math.PI * .24;
      const x = Math.cos(angle) * 4.25;
      const z = Math.sin(angle) * 1.6;
      cylinder(root, [.42, .52], .24, 8, [x, .12, z], m.black);
      box(root, [.72, 1.45 + index % 3 * .25, .42], [x, .95 + index % 3 * .12, z], m.charcoal);
      const eyeCount = index === 4 ? 3 : 2;
      for (let eye = 0; eye < eyeCount; eye += 1) sphere(root, .09, [x + (eye - (eyeCount - 1) / 2) * .22, 1.35 + index % 3 * .22, z + .24], cue);
      box(root, [.5, .09, .05], [x, .72, z + .24], cue);
      if (index === 6) torus(root, .48, .055, [x, 1.85, z], cue, [0, 0, 0]);
    });
    return root;
  }

  function buildCisternBackdrop() {
    const root = new THREE.Group();
    root.name = 'blackout_cistern_shell';
    box(root, [27, .35, 5.4], [0, .17, 0], m.black);
    for (let segment = 0; segment < 9; segment += 1) {
      const angle = -Math.PI * .72 + segment * Math.PI * .18;
      const x = Math.sin(angle) * 12.4;
      const z = 1.2 + Math.cos(angle) * 4.0;
      box(root, [3.8, 6.2, 1.0], [x, 3.1, z], m.dark, [0, -angle * .45, 0]);
      box(root, [3.1, .18, 1.08], [x, 5.7, z], segment % 3 === 0 ? m.cyan : m.metal, [0, -angle * .45, 0]);
    }
    for (const x of [-9, 0, 9]) {
      box(root, [3.4, 3.8, .55], [x, 1.9, 4.55], m.black);
      torus(root, 1.2, .16, [x, 2.1, 4.2], x === 0 ? m.red : m.cyan, [0, 0, 0], Math.PI);
    }
    for (const y of [1.2, 4.8]) cylinder(root, [.17, .17], 25.5, 8, [0, y, 4.9], m.metal, [0, 0, Math.PI / 2]);
    return root;
  }

  const definitions = [
    ['sandbankkit', 'Modular sandbank family', 'ground', 'Three low, movement-safe dune and drift modules with wind ridges and one reinforced windbreak state.', 'Lane terrain', buildSandbankKit, .55],
    ['stormsiren', 'Storm siren tower', 'landmarks', 'A dominant triangulated warning tower with twin horns, storm beacon, ladder rings, and field controls.', 'Weather warning', buildStormSiren, 2.0],
    ['endurancemonument', 'Endurance relay monument', 'objectives', 'A three-route completion marker with energized relay rings and a persistent victory crown.', 'Completion objective', buildEnduranceMonument, 1.4],
    ['sandstormbackdrop', 'Sandstorm Expanse horizon', 'backdrops', 'Broad mesas, distant filter towers, and wind turbines for a low-cost post-campaign desert skyline.', 'Distant background', buildSandstormBackdrop, 2.5],
    ['floodgatekit', 'Modular floodgate family', 'architecture', 'Closed, opening, locked, and damaged gate states share one pier, control, and collision language.', 'Transforming landmark', buildFloodgateKit, 1.8],
    ['pumpturbine', 'Pump and turbine family', 'props', 'Large pump and exposed turbine modules communicate water routing through distinct circular machinery.', 'Water-state machine', buildPumpTurbine, 1.6],
    ['sluiceconduits', 'Sluice pipe and conduit kit', 'architecture', 'A reusable overhead service span combines large sluice risers, color-coded conduits, and controls.', 'Route connector', buildSluiceConduits, 1.7],
    ['archiveseed', 'Continuity Archive Seed', 'objectives', 'Shielded, exposed, and destroyed archive seed states make objective progress readable at combat distance.', 'Phase objective', buildArchiveSeed, 1.4],
    ['greywatercore', 'Greywater master core', 'objectives', 'A multi-ring environmental finale target with four shield pylons and a clear exposed control face.', 'Finale objective', buildGreywaterCore, 1.5],
    ['waterlinedebris', 'Waterline debris kit', 'dressing', 'Grates, algae strips, floating barriers, maintenance wreckage, and a life ring break up flood channels.', 'Flood dressing', buildWaterlineDebris, .5],
    ['floodgatebackdrop', 'Floodgate Continuity horizon', 'backdrops', 'Monumental culvert mouths, control towers, service pipe, and flood wall establish the underpass horizon.', 'Distant background', buildFloodgateBackdrop, 3.0],
    ['lastlightreactor', 'Last Light reactor', 'objectives', 'Central lamp, surge alarm, reactor rings, stabilizers, and controls form the Blackout Cistern hero prop.', 'Survival objective', buildLastLightReactor, 1.9],
    ['cisternfloorkit', 'Radial cistern floor kit', 'ground', 'Five- and ten-metre light rings, radial spokes, and six drain sectors teach the darkness envelope physically.', 'Light-boundary floor', buildCisternFloorKit, .3],
    ['blackoutcues', 'Blackout enemy cue set', 'dressing', 'Seven role-colored emissive insert studies preserve enemy identity without restoring general visibility.', 'Darkness readability', buildBlackoutCues, 1.0],
    ['cisternbackdrop', 'Blackout Cistern shell', 'backdrops', 'A low-cost curved wall, dark spawn portals, and utility pipes enclose the Wave 72 arena.', 'Distant background', buildCisternBackdrop, 2.7]
  ];

  const emissiveSignalCategories = new Set(['ground', 'landmarks', 'objectives']);

  const cloneMaterials = (root, { category = 'environment', preserveEmissive = false } = {}) => {
    const clones = new Map();
    root.traverse((object) => {
      if (!object.material) return;
      const clone = (source) => {
        if (!clones.has(source)) clones.set(source, source.clone());
        return clones.get(source);
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    const isBackdrop = category === 'backdrops';
    const preserveSignal = preserveEmissive || emissiveSignalCategories.has(category);
    clones.forEach((material) => {
      if (isBackdrop && material.color) {
        const hsl = {};
        material.color.getHSL(hsl);
        material.color.setHSL(hsl.h, hsl.s * .86, hsl.l * .88);
      }
      if (isBackdrop && material.emissive) {
        const hsl = {};
        material.emissive.getHSL(hsl);
        material.emissive.setHSL(hsl.h, hsl.s * .85, hsl.l * .86);
      }
      if (material.emissive && !preserveSignal) {
        material.emissiveIntensity = isBackdrop ? 0 : Math.min(material.emissiveIntensity, .08);
      }
    });
    return root;
  };

  const assets = definitions.map(([id, title, category, description, role, build, targetY]) => ({
    id,
    label: title,
    title,
    category,
    description,
    role,
    meshes: 'Procedural kit',
    lift: 0,
    scale: 1,
    targetY,
    source: 'level-plan',
    factoryName: build.name,
    build: () => cloneMaterials(build(), { category, preserveEmissive: id === 'blackoutcues' })
  }));

  if (assets.length !== POST_CAMPAIGN_ASSET_COUNT) {
    throw new Error(`Expected ${POST_CAMPAIGN_ASSET_COUNT} post-campaign assets, received ${assets.length}.`);
  }
  return assets;
}
