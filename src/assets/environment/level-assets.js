import { createPostCampaignLevelAssetRegistry, POST_CAMPAIGN_ASSET_COUNT } from './postcampaign-level-assets.js';

const CAMPAIGN_LEVEL_ASSET_COUNT = 42;
export const LEVEL_ASSET_COUNT = CAMPAIGN_LEVEL_ASSET_COUNT + POST_CAMPAIGN_ASSET_COUNT;

function createMaterials(THREE) {
  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .82,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    flatShading: true
  });

  return {
    acid: standard(0xd7ff3f, { emissive: 0x435d0d, emissiveIntensity: 1.1, roughness: .5 }),
    asphalt: standard(0x2c3531, { roughness: 1 }),
    black: standard(0x101613, { roughness: .95 }),
    blue: standard(0x376d79),
    bone: standard(0xd6d4bc, { roughness: 1 }),
    brown: standard(0x5c4734, { roughness: 1 }),
    cyan: standard(0x61ded2, { emissive: 0x164c47, emissiveIntensity: .8, roughness: .48 }),
    cyanGlass: standard(0x4bbeb7, { emissive: 0x123b38, emissiveIntensity: .5, transparent: true, opacity: .55, roughness: .25 }),
    dark: standard(0x26312c, { roughness: .92 }),
    glass: standard(0x9bb8ad, { transparent: true, opacity: .34, roughness: .22, metalness: .12 }),
    gold: standard(0xd4a936, { metalness: .14, roughness: .65 }),
    green: standard(0x54703e, { roughness: 1 }),
    lime: standard(0x8ebd42, { roughness: .9 }),
    metal: standard(0x647169, { metalness: .24, roughness: .68 }),
    orange: standard(0xe06a36, { emissive: 0x4e1708, emissiveIntensity: .35 }),
    pale: standard(0xaeb8ac, { roughness: .95 }),
    plaster: standard(0xb9bbad, { roughness: 1 }),
    purple: standard(0x7654a7, { emissive: 0x26163b, emissiveIntensity: .55 }),
    red: standard(0xff5c52, { emissive: 0x69130e, emissiveIntensity: 1 }),
    sand: standard(0xa38e68, { roughness: 1 }),
    white: standard(0xe4e8de, { roughness: .9 }),
    yellow: standard(0xe4b638, { roughness: .7 })
  };
}

export function createLevelAssetRegistry({ THREE } = {}) {
  if (!THREE) throw new TypeError('createLevelAssetRegistry requires THREE.');
  const m = createMaterials(THREE);

  const finish = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const box = (group, size, position, material, rotation = [0, 0, 0]) => {
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const cylinder = (group, radii, height, segments, position, material, rotation = [0, 0, 0]) => {
    const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, segments), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const sphere = (group, radius, position, material, scale = [1, 1, 1]) => {
    const mesh = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };

  const torus = (group, radius, tube, position, material, rotation = [Math.PI / 2, 0, 0], arc = Math.PI * 2) => {
    const mesh = finish(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 20, arc), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const beam = (group, start, end, thickness, material, depth = thickness) => {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const direction = endPoint.clone().sub(startPoint);
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(thickness, direction.length(), depth), material));
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
    return mesh;
  };

  const egg = (group, position, scale = 1) => {
    sphere(group, .34 * scale, position, m.bone, [.78, 1.25, .82]);
    torus(group, .22 * scale, .035 * scale, [position[0], position[1] - .08 * scale, position[2] + .25 * scale], m.orange, [0, 0, 0]);
  };

  function buildRelayMast() {
    const root = new THREE.Group();
    cylinder(root, [1.7, 1.9], .28, 10, [0, .14, 0], m.asphalt);
    cylinder(root, [.7, 1.15], .65, 8, [0, .6, 0], m.dark);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const x = Math.cos(angle) * 1.15;
      const z = Math.sin(angle) * 1.15;
      beam(root, [x, .26, z], [0, 5.4, 0], .15, m.metal);
      box(root, [.5, .12, .5], [x, .08, z], m.yellow);
    }
    for (const y of [1.7, 3.1, 4.5]) torus(root, .48, .08, [0, y, 0], m.yellow);
    cylinder(root, [.12, .16], 6.6, 8, [0, 3.5, 0], m.dark);
    const dish = sphere(root, .86, [.72, 4.7, 0], m.pale, [1, .22, 1]);
    dish.rotation.z = -.58;
    cylinder(root, [.08, .08], 1.35, 6, [.22, 5.65, 0], m.cyan);
    sphere(root, .22, [.22, 6.38, 0], m.acid);
    box(root, [.72, .82, .42], [-.72, .92, .55], m.orange);
    box(root, [.42, .22, .04], [-.72, 1.02, .78], m.cyan);
    cylinder(root, [.72, .78], .12, 10, [0, 3.15, 0], m.metal);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = Math.cos(angle) * .7;
      const z = Math.sin(angle) * .7;
      box(root, [.08, .52, .08], [x, 3.43, z], m.dark);
      beam(root, [x, 3.68, z], [Math.cos(angle + Math.PI / 2) * .7, 3.68, Math.sin(angle + Math.PI / 2) * .7], .06, m.yellow);
    }
    for (let rung = 0; rung < 10; rung += 1) box(root, [.46, .045, .06], [0, .82 + rung * .36, -.2], m.pale);
    beam(root, [-.24, .55, -.2], [-.24, 4.05, -.2], .055, m.dark);
    beam(root, [.24, .55, -.2], [.24, 4.05, -.2], .055, m.dark);
    const secondaryDish = sphere(root, .46, [-.52, 5.42, .06], m.metal, [1, .2, 1]);
    secondaryDish.rotation.z = .72;
    beam(root, [-.68, 6.08, 0], [.76, 6.08, 0], .07, m.cyan);
    for (const x of [-.68, 0, .76]) sphere(root, .1, [x, 6.08, 0], x === 0 ? m.acid : m.red);
    return root;
  }

  function buildFireEscape() {
    const root = new THREE.Group();
    box(root, [5.4, 4.8, .24], [0, 2.4, -1.05], m.plaster);
    for (const y of [1.35, 3.25]) {
      box(root, [3.8, .18, 1.25], [0, y, -.25], m.metal);
      for (const x of [-1.75, -.9, 0, .9, 1.75]) box(root, [.08, .72, .08], [x, y + .42, .3], m.dark);
      box(root, [3.6, .08, .08], [0, y + .78, .3], m.yellow);
    }
    for (let index = 0; index < 8; index += 1) {
      const t = index / 7;
      box(root, [.72, .08, .34], [-1.55 + t * 3.1, 1.55 + t * 1.45, .2], m.pale, [0, 0, -.44]);
    }
    beam(root, [-1.95, 1.35, .45], [1.55, 3.25, .45], .09, m.dark);
    beam(root, [-1.55, 1.35, -.02], [1.95, 3.25, -.02], .09, m.dark);
    box(root, [2.4, .18, 1.15], [3.75, 3.25, -.25], m.metal);
    beam(root, [1.9, 3.25, -.72], [3.75, 3.25, -.72], .12, m.yellow);
    beam(root, [1.9, 3.25, .22], [3.75, 3.25, .22], .12, m.yellow);
    for (const x of [-1.7, 1.7]) {
      beam(root, [x, .12, -.25], [x, 1.35, -.25], .11, m.dark);
      box(root, [.42, .14, .42], [x, .07, -.25], m.plaster);
    }
    box(root, [1.1, 2.05, .08], [-1.55, 2.28, .09], m.black);
    box(root, [1.28, .16, .18], [-1.55, 3.27, .08], m.yellow);
    beam(root, [3.0, .12, -.25], [3.0, 3.25, -.25], .1, m.dark);
    beam(root, [4.5, .12, -.25], [4.5, 3.25, -.25], .1, m.dark);
    for (let rung = 0; rung < 9; rung += 1) box(root, [.7, .055, .08], [3.75, .45 + rung * .31, .16], m.pale);
    beam(root, [3.38, .18, .16], [3.38, 3.25, .16], .06, m.dark);
    beam(root, [4.12, .18, .16], [4.12, 3.25, .16], .06, m.dark);
    for (const x of [2.15, 3.0, 3.85, 4.7, 5.0]) box(root, [.08, .7, .08], [x, 3.68, .25], m.dark);
    box(root, [3.0, .08, .08], [3.55, 4.02, .25], m.yellow);
    return root;
  }

  function buildBroodInfestation() {
    const root = new THREE.Group();
    root.name = 'brood_infestation_states';
    const active = new THREE.Group();
    active.name = 'state_active_nest';
    root.add(active);
    cylinder(active, [2.65, 2.8], .12, 14, [0, .06, 0], m.black);
    torus(active, 1.2, .3, [0, .2, 0], m.brown);
    cylinder(active, [.8, 1.05], .14, 12, [0, .13, 0], m.black);
    [[-1.55,.42,-.35],[-1.05,.34,1.2],[1.2,.38,.82],[1.55,.3,-.7],[.35,.3,-1.45]].forEach((position, index) => egg(active, position, index === 0 ? 1.2 : .9));
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      beam(active, [Math.cos(angle) * .85, .12, Math.sin(angle) * .85], [Math.cos(angle + .22) * 2.55, .05, Math.sin(angle + .22) * 2.55], .08, index % 2 ? m.orange : m.brown);
    }
    sphere(active, .28, [0, .56, 0], m.red, [1.4, .5, 1.4]);
    for (const position of [[-.72,.12,.6],[.68,.1,-.7],[1.2,.08,.12]]) sphere(active, .22, position, m.acid, [1.8, .2, 1.2]);

    const early = new THREE.Group();
    early.name = 'state_early_overlay';
    early.position.set(-3.8, 0, 0);
    root.add(early);
    cylinder(early, [1.08, 1.18], .06, 10, [0, .03, 0], m.brown);
    for (const angle of [-.65, .15, .85]) beam(early, [0, .07, 0], [Math.cos(angle) * 1.5, .035, Math.sin(angle) * 1.5], .055, m.orange);
    egg(early, [-.25, .3, .18], .62);
    sphere(early, .18, [.46, .12, -.18], m.acid, [1.7, .25, 1]);

    const destroyed = new THREE.Group();
    destroyed.name = 'state_destroyed_nest';
    destroyed.position.set(3.8, 0, 0);
    root.add(destroyed);
    torus(destroyed, .92, .18, [0, .12, 0], m.brown, [Math.PI / 2, 0, 0], Math.PI * 1.55);
    cylinder(destroyed, [.62, .82], .08, 10, [0, .06, 0], m.black);
    for (const position of [[-.75,.15,.34],[-.38,.12,-.76],[.6,.16,-.42],[.82,.1,.46]]) {
      sphere(destroyed, .22, position, m.bone, [1.25, .42, .75]);
      box(destroyed, [.28, .07, .1], [position[0] + .12, .08, position[2]], m.orange, [0, position[0], position[2]]);
    }
    return root;
  }

  function buildRelayStreetKit() {
    const root = new THREE.Group();
    root.name = 'relay_street_modules';

    const straight = new THREE.Group();
    straight.name = 'street_straight_6m';
    straight.position.x = -3.4;
    root.add(straight);
    box(straight, [5.8, .14, 4.6], [0, .07, 0], m.asphalt);
    for (const x of [-2.45, 2.45]) {
      box(straight, [.9, .24, 4.6], [x, .18, 0], m.plaster);
      box(straight, [.12, .34, 4.6], [x - Math.sign(x) * .5, .17, 0], m.pale);
    }
    for (const z of [-1.45, 0, 1.45]) box(straight, [.12, .025, .65], [0, .16, z], m.yellow);
    box(straight, [.62, .035, 1.15], [-1.72, .33, 1.1], m.dark);
    for (let bar = 0; bar < 5; bar += 1) box(straight, [.08, .045, 1.0], [-1.94 + bar * .11, .36, 1.1], m.metal);
    torus(straight, .34, .055, [.92, .18, -.82], m.metal);

    const corner = new THREE.Group();
    corner.name = 'street_corner_6m';
    corner.position.x = 3.4;
    root.add(corner);
    box(corner, [5.8, .14, 4.6], [0, .07, 0], m.asphalt);
    box(corner, [1.25, .25, 4.6], [-2.27, .18, 0], m.plaster);
    box(corner, [4.55, .25, 1.2], [.62, .18, -1.7], m.plaster);
    box(corner, [.12, .35, 4.6], [-1.6, .18, 0], m.pale);
    box(corner, [4.55, .35, .12], [.62, .18, -1.08], m.pale);
    for (let stripe = 0; stripe < 5; stripe += 1) box(corner, [.38, .025, 1.3], [-.9 + stripe * .48, .16, .45], m.pale);
    cylinder(corner, [.1, .12], .9, 7, [-2.25, .7, 1.35], m.orange);
    box(corner, [.32, .12, .32], [-2.25, .26, 1.35], m.yellow);
    box(corner, [.95, .07, .58], [1.7, .15, 1.45], m.dark, [0, .35, 0]);
    for (const offset of [-.32, 0, .32]) box(corner, [.2, .08, .18], [1.7 + offset, .22, 1.45 + offset * .15], m.pale, [0, .35, 0]);
    return root;
  }

  function buildSpireFacade() {
    const root = new THREE.Group();
    root.name = 'sanitizer_spire_press_facade';
    box(root, [7.8, 5.2, .85], [0, 2.6, 0], m.white);
    for (const x of [-3.45, -2.3, -1.15, 0, 1.15, 2.3, 3.45]) {
      box(root, [.24, 5.7, 1.16], [x, 2.82, .03], m.dark, [0, 0, x * .009]);
      box(root, [.09, 5.0, 1.22], [x + .18, 2.54, .06], m.cyan);
    }
    box(root, [3.15, 2.15, .16], [0, 3.45, .52], m.black);
    box(root, [2.72, 1.7, .08], [0, 3.45, .63], m.cyanGlass);
    box(root, [2.0, .16, .04], [0, 3.78, .69], m.cyan);
    for (const x of [-.82, 0, .82]) box(root, [.42, .48, .04], [x, 3.2, .69], x === 0 ? m.red : m.pale);

    const pressFloor = new THREE.Group();
    pressFloor.name = 'press_room_floor';
    root.add(pressFloor);
    box(pressFloor, [7.2, .22, 3.1], [0, .11, 1.42], m.plaster);
    box(pressFloor, [7.35, .12, .22], [0, .26, 2.9], m.gold);
    for (const x of [-2.55, 2.55]) {
      box(root, [1.18, 2.15, .18], [x, 1.28, .52], m.black);
      box(root, [1.42, .16, .3], [x, 2.34, .58], m.gold);
      box(root, [.65, .15, .04], [x, 1.35, .72], x < 0 ? m.cyan : m.red);
      box(pressFloor, [1.25, .92, .72], [x, .68, 1.78], m.dark, [-.08, 0, 0]);
      box(pressFloor, [.78, .22, .05], [x, .91, 2.15], x < 0 ? m.cyan : m.red);
    }
    box(pressFloor, [1.2, 1.15, .78], [0, .78, 2.05], m.dark, [-.12, 0, 0]);
    box(pressFloor, [.82, .2, .05], [0, 1.04, 2.46], m.acid);
    cylinder(pressFloor, [.08, .08], .85, 6, [0, 1.55, 2.12], m.metal);
    sphere(pressFloor, .16, [0, 2.03, 2.12], m.red);
    for (const x of [-3.15, 3.15]) cylinder(root, [.18, .24], .38, 8, [x, 5.55, .1], m.red);
    return root;
  }

  function buildCensorshipNodes() {
    const root = new THREE.Group();
    root.name = 'censorship_node_states';
    const states = [
      { x: -2.35, light: m.cyan, name: 'state_active', tilt: 0 },
      { x: 0, light: m.orange, name: 'state_vulnerable', tilt: 0 },
      { x: 2.35, light: m.red, name: 'state_destroyed', tilt: -.22 }
    ];
    states.forEach(({ x, light, name, tilt }, stateIndex) => {
      const node = new THREE.Group();
      node.name = name;
      node.position.x = x;
      node.rotation.z = tilt;
      root.add(node);
      cylinder(node, [.86, 1.02], .3, 8, [0, .15, 0], m.dark);
      cylinder(node, [.64, .74], .12, 8, [0, .34, 0], light);
      box(node, [.88, 1.45, .72], [0, 1.06, 0], stateIndex === 2 ? m.black : m.metal);
      torus(node, .5, .11, [0, 1.76, 0], light, [0, 0, 0], stateIndex === 2 ? Math.PI * 1.4 : Math.PI * 2);
      sphere(node, .25, [0, 1.76, 0], stateIndex === 2 ? m.black : light);
      box(node, [.56, .18, .05], [0, .94, .39], light);
      box(node, [.62, .08, .05], [0, .68, .39], stateIndex === 0 ? m.acid : m.black);
      for (const side of [-1, 1]) box(node, [.12, .92, .14], [side * .55, 1.23, 0], stateIndex === 0 ? m.cyan : m.dark, [0, 0, side * -.16]);
      if (stateIndex === 0) {
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) box(node, [.12, .5, .08], [Math.cos(angle) * .68, 1.76, Math.sin(angle) * .68], m.cyan, [0, -angle, Math.PI / 2]);
      }
      if (stateIndex === 1) {
        box(node, [.34, .76, .1], [-.58, 1.42, .24], m.gold, [0, 0, -.58]);
        box(node, [.34, .76, .1], [.58, 1.42, .24], m.gold, [0, 0, .58]);
        beam(node, [-.18, .42, .44], [.18, 1.55, .44], .06, m.orange);
      }
      if (stateIndex === 2) {
        box(node, [.48, .14, .16], [.68, .38, .3], m.pale, [0, 0, .5]);
        box(node, [.4, .12, .14], [-.56, .2, -.16], m.pale, [0, .4, -.3]);
        box(node, [.3, .1, .22], [.22, .12, -.72], m.orange, [0, -.5, 0]);
      }
    });
    return root;
  }

  function buildSuppressionTiles() {
    const root = new THREE.Group();
    root.name = 'suppression_floor_states';
    const states = [
      { x: -3.2, name: 'state_recovery', material: m.cyan },
      { x: 0, name: 'state_healing_blocked', material: m.orange },
      { x: 3.2, name: 'state_damage', material: m.red }
    ];
    states.forEach(({ x, name, material }, stateIndex) => {
      const tile = new THREE.Group();
      tile.name = name;
      tile.position.x = x;
      root.add(tile);
      box(tile, [2.85, .14, 2.85], [0, .07, 0], m.asphalt);
      box(tile, [2.5, .025, 2.5], [0, .155, 0], material);
      for (const edge of [-1.28, 1.28]) {
        box(tile, [.12, .035, 2.5], [edge, .18, 0], m.black);
        box(tile, [2.5, .035, .12], [0, .18, edge], m.black);
      }
      if (stateIndex === 0) {
        box(tile, [.38, .04, 1.45], [0, .19, 0], m.white);
        box(tile, [1.45, .04, .38], [0, .19, 0], m.white);
      } else if (stateIndex === 1) {
        beam(tile, [-.78, .2, -.78], [.78, .2, .78], .13, m.black, .04);
        beam(tile, [-.78, .2, .78], [.78, .2, -.78], .13, m.black, .04);
      } else {
        for (const z of [-.72, 0, .72]) box(tile, [1.6, .04, .24], [0, .19, z], m.black, [0, stateIndex * .18, 0]);
      }
      box(tile, [.44, .1, .44], [-1.05, .22, 1.05], m.dark);
      sphere(tile, .1, [-1.05, .31, 1.05], material);
    });
    return root;
  }

  function buildBillboardWall() {
    const root = new THREE.Group();
    root.name = 'rotating_billboard_cover';
    box(root, [6.2, .28, 1.5], [0, .14, 0], m.asphalt);
    for (const x of [-2.45, 2.45]) {
      cylinder(root, [.24, .34], 2.8, 8, [x, 1.65, 0], m.dark);
      box(root, [.72, .16, .92], [x, .12, 0], m.plaster);
      beam(root, [x, .3, -.42], [x * .82, 1.75, 0], .09, m.metal);
      beam(root, [x, .3, .42], [x * .82, 1.75, 0], .09, m.metal);
    }
    cylinder(root, [.32, .32], 2.1, 10, [0, 1.38, 0], m.metal);
    cylinder(root, [.58, .78], .34, 10, [0, .45, 0], m.orange);
    const panel = new THREE.Group();
    panel.name = 'billboard_rotation_pivot';
    panel.userData.rotationStops = [-1.0472, 0, 1.0472];
    panel.position.set(0, 2.65, 0);
    panel.rotation.y = .32;
    root.add(panel);
    box(panel, [4.75, 2.1, .28], [0, 0, 0], m.dark);
    box(panel, [4.34, 1.72, .08], [0, 0, .18], m.purple);
    box(panel, [4.34, 1.72, .08], [0, 0, -.18], m.blue);
    box(panel, [3.2, .26, .05], [0, .4, .24], m.acid);
    box(panel, [3.2, .26, .05], [0, .4, -.24], m.orange);
    for (const x of [-1.55, 1.55]) box(panel, [.62, .62, .06], [x, -.38, .24], x < 0 ? m.cyan : m.orange);
    beam(panel, [-2.0, -.85, -.24], [2.0, .85, -.24], .09, m.metal, .06);
    beam(panel, [-2.0, .85, -.24], [2.0, -.85, -.24], .09, m.metal, .06);
    box(root, [.7, .62, .4], [1.1, .55, .45], m.black);
    box(root, [.38, .18, .04], [1.1, .65, .67], m.cyan);
    for (const x of [-1.15, 1.15]) {
      box(root, [.48, .08, .72], [x, .32, -.48], m.yellow, [0, x * .28, 0]);
      sphere(root, .08, [x, .39, -.64], x < 0 ? m.cyan : m.red);
    }
    return root;
  }

  function buildSponsorProjector() {
    const root = new THREE.Group();
    root.name = 'sponsor_zone_projector';
    cylinder(root, [2.65, 2.65], .08, 24, [0, .04, 0], m.cyanGlass);
    for (const radius of [.8, 1.65, 2.45]) torus(root, radius, .045, [0, .1, 0], radius === 1.65 ? m.acid : m.cyan);
    cylinder(root, [.68, .9], .34, 10, [0, .22, 0], m.dark);
    cylinder(root, [.18, .22], 2.2, 8, [0, 1.4, 0], m.metal);
    const head = box(root, [1.15, .68, .82], [0, 2.48, 0], m.orange, [-.08, .28, 0]);
    box(head, [.64, .38, .05], [0, 0, .44], m.cyan);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      box(root, [.7, .12, .22], [Math.cos(angle) * .72, .18, Math.sin(angle) * .72], m.yellow, [0, -angle, 0]);
      cylinder(root, [.07, .1], .3, 6, [Math.cos(angle) * 1.05, .2, Math.sin(angle) * 1.05], m.dark);
    }
    torus(root, 1.9, .055, [0, .07, 0], m.black, [Math.PI / 2, 0, 0], Math.PI * 1.35);
    box(root, [.52, .18, .38], [-1.72, .2, -.72], m.dark, [0, .35, 0]);
    box(root, [.28, .08, .04], [-1.72, .24, -.51], m.acid, [0, .35, 0]);
    return root;
  }

  function buildAdTrapPylon() {
    const root = new THREE.Group();
    root.name = 'ad_trap_pylon_pair';
    for (const x of [-1.55, 1.55]) {
      cylinder(root, [.48, .72], .34, 8, [x, .17, 0], m.asphalt);
      box(root, [.55, 2.5, .55], [x, 1.55, 0], m.dark, [0, 0, x * -.025]);
      sphere(root, .3, [x, 2.95, 0], x < 0 ? m.orange : m.red);
      box(root, [.92, .32, .1], [x, 1.75, .34], m.purple);
    }
    beam(root, [-1.55, 2.45, 0], [1.55, .48, 0], .09, m.red);
    beam(root, [-1.55, .48, .08], [1.55, 2.45, .08], .09, m.orange);
    for (const z of [-.65, .65]) box(root, [3.7, .08, .14], [0, .08, z], m.yellow);
    box(root, [.85, .28, .5], [0, .32, 0], m.black);
    box(root, [.42, .12, .04], [0, .38, .27], m.acid);
    for (const x of [-1.55, 1.55]) {
      torus(root, .62, .055, [x, .08, 0], x < 0 ? m.orange : m.red, [Math.PI / 2, 0, 0], Math.PI * 1.35);
      box(root, [.28, .12, .38], [x * .62, .14, -.62], m.dark, [0, x * .18, 0]);
    }
    return root;
  }

  function buildAdPlazaKit() {
    const root = new THREE.Group();
    root.name = 'ad_zone_plaza_modules';
    const modules = [
      { x: -3.35, name: 'sponsor_lane_tile' },
      { x: 0, name: 'cable_crossing_tile' },
      { x: 3.35, name: 'vendor_frontage_tile' }
    ];
    modules.forEach(({ x, name }, moduleIndex) => {
      const module = new THREE.Group();
      module.name = name;
      module.position.x = x;
      root.add(module);
      box(module, [3.05, .16, 3.25], [0, .08, 0], moduleIndex === 1 ? m.asphalt : m.plaster);
      for (const edge of [-1.43, 1.43]) box(module, [.12, .06, 3.0], [edge, .18, 0], m.dark);
      if (moduleIndex === 0) {
        box(module, [2.5, .035, 2.55], [0, .18, 0], m.purple);
        box(module, [1.72, .04, .26], [0, .21, -.58], m.acid);
        for (const xOffset of [-.72, .72]) box(module, [.48, .04, .48], [xOffset, .21, .52], xOffset < 0 ? m.cyan : m.orange, [0, Math.PI / 4, 0]);
      } else if (moduleIndex === 1) {
        for (const xOffset of [-.72, 0, .72]) {
          box(module, [.28, .06, 3.0], [xOffset, .18, 0], m.black);
          box(module, [.08, .075, 2.7], [xOffset, .22, 0], xOffset < 0 ? m.cyan : xOffset > 0 ? m.red : m.orange);
        }
        box(module, [.72, .24, .5], [0, .28, .95], m.dark);
        box(module, [.4, .1, .04], [0, .34, 1.22], m.acid);
      } else {
        for (const xOffset of [-1.05, 1.05]) box(module, [.12, 2.15, .12], [xOffset, 1.2, -.95], m.dark);
        box(module, [2.35, .18, 1.05], [0, 2.28, -.95], m.yellow, [-.08, 0, 0]);
        for (const xOffset of [-.76, 0, .76]) box(module, [.68, .08, .92], [xOffset, 2.17, -.92], xOffset === 0 ? m.purple : m.orange, [-.08, 0, 0]);
        box(module, [2.45, .82, .58], [0, .61, -.72], m.dark);
        box(module, [1.85, .28, .08], [0, .78, -.39], m.cyan);
        box(module, [.72, .18, .04], [0, .8, -.34], m.acid);
      }
    });
    return root;
  }

  function buildStormBeacon() {
    const root = new THREE.Group();
    root.name = 'storm_eye_beacon';
    cylinder(root, [1.35, 1.55], .3, 10, [0, .15, 0], m.sand);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      const x = Math.cos(angle) * 1.05;
      const z = Math.sin(angle) * 1.05;
      beam(root, [x, .25, z], [0, 5.25, 0], .13, m.metal);
    }
    for (const y of [1.3, 2.6, 3.9]) torus(root, .42, .07, [0, y, 0], m.orange);
    sphere(root, .58, [0, 5.18, 0], m.cyan);
    torus(root, .88, .09, [0, 5.18, 0], m.acid, [Math.PI / 2, 0, 0]);
    torus(root, .72, .06, [0, 5.18, 0], m.orange, [0, 0, 0]);
    cylinder(root, [.07, .09], 1.05, 6, [0, 6.0, 0], m.dark);
    box(root, [.72, .8, .42], [.75, .78, .45], m.dark);
    box(root, [.4, .18, .04], [.75, .88, .68], m.cyan);
    return root;
  }

  function buildFilterRuin() {
    const root = new THREE.Group();
    root.name = 'filter_ruin_debris';
    box(root, [5.8, .2, 2.7], [0, .1, 0], m.sand);
    box(root, [.32, 2.8, .32], [-2.1, 1.5, -.2], m.dark, [0, 0, -.08]);
    box(root, [.32, 2.25, .32], [2.0, 1.2, -.2], m.dark, [0, 0, .16]);
    box(root, [4.35, .28, .36], [-.1, 2.65, -.2], m.metal, [0, 0, -.07]);
    const panel = box(root, [3.45, 1.55, .18], [-.05, 1.72, -.08], m.purple, [0, .05, -.06]);
    box(panel, [2.2, .16, .06], [0, .2, .13], m.acid);
    box(panel, [.7, .7, .06], [-1.05, -.28, .13], m.cyan);
    box(panel, [.7, .7, .06], [1.05, -.28, .13], m.orange);
    for (let index = 0; index < 9; index += 1) {
      box(root, [.38 + index % 3 * .16, .12 + index % 2 * .08, .35], [-2.2 + index * .55, .18, .95 + (index % 2) * .45], index % 3 ? m.pale : m.purple, [0, index * .19, index % 2 * .18]);
    }
    return root;
  }

  function buildWindbreaks() {
    const root = new THREE.Group();
    root.name = 'windbreak_state_modules';
    const states = [
      { x: -3.4, name: 'state_safe', material: m.cyan, drop: 0 },
      { x: 0, name: 'state_risky', material: m.orange, drop: .25 },
      { x: 3.4, name: 'state_collapsed', material: m.sand, drop: 1.35 }
    ];
    states.forEach(({ x, name, material, drop }, index) => {
      const state = new THREE.Group();
      state.name = name;
      state.position.x = x;
      root.add(state);
      for (const side of [-1, 1]) {
        box(state, [.16, 2.7 - drop, .16], [side * 1.25, (2.7 - drop) / 2, 0], m.dark, [0, 0, index === 2 ? side * .45 : 0]);
        beam(state, [side * 1.25, .18, 0], [side * 1.75, 1.45 - drop * .25, -.48], .07, m.metal);
        box(state, [.45, .14, .55], [side * 1.7, .07, -.5], m.asphalt);
      }
      if (index === 0) {
        box(state, [2.45, 1.8, .08], [0, 1.65, 0], material);
        box(state, [2.15, .52, .07], [0, 1.64, -.14], m.cyanGlass);
      } else if (index === 1) {
        box(state, [.92, 1.76, .08], [-.76, 1.52, 0], material, [0, 0, -.08]);
        box(state, [.92, 1.48, .08], [.78, 1.38, 0], material, [0, 0, .12]);
        beam(state, [-.18, .82, .04], [.2, 2.18, .04], .055, m.dark);
      } else {
        box(state, [1.35, 1.0, .08], [-.32, .68, 0], material, [0, 0, .34]);
        box(state, [.82, .72, .08], [.75, .48, .18], m.orange, [0, .15, -.42]);
      }
      for (const y of [.95, 1.65, 2.35]) box(state, [2.55, .055, .1], [0, y - drop * .4, .08], m.metal, [0, 0, index === 2 ? .28 : 0]);
      box(state, [2.9, .12, .48], [0, .08, 0], m.asphalt);
    });
    return root;
  }

  function buildWastesTerrainKit() {
    const root = new THREE.Group();
    root.name = 'trend_wastes_terrain_modules';

    const dune = new THREE.Group();
    dune.name = 'walkable_dune_slope';
    dune.position.x = -4.0;
    root.add(dune);
    box(dune, [3.6, .3, 3.8], [0, .2, 0], m.sand, [-.1, 0, 0]);
    box(dune, [3.2, .24, 2.6], [.12, .52, -.42], m.sand, [-.16, .04, 0]);
    cylinder(dune, [1.45, 1.8], .32, 8, [-.45, .32, 1.08], m.brown);
    for (const position of [[-1.25,.34,-1.15],[1.15,.3,-.75],[1.34,.28,1.08]]) sphere(dune, .28, position, m.pale, [1.3, .72, 1]);

    const road = new THREE.Group();
    road.name = 'eroded_road_transition';
    root.add(road);
    box(road, [3.6, .18, 3.8], [0, .09, 0], m.sand);
    box(road, [2.45, .14, 3.55], [-.3, .18, 0], m.asphalt, [0, 0, -.04]);
    for (const z of [-1.18, 0, 1.18]) box(road, [.12, .035, .58], [-.3, .28, z], m.yellow);
    for (const position of [[1.0,.3,-1.25],[1.28,.24,-.55],[.92,.28,.25],[1.2,.22,1.18]]) box(road, [.58, .24, .52], position, m.pale, [position[2] * .12, position[0] * .2, .08]);
    beam(road, [.35, .24, -1.55], [1.35, .3, -.75], .08, m.brown);

    const wash = new THREE.Group();
    wash.name = 'dry_wash_and_rocks';
    wash.position.x = 4.0;
    root.add(wash);
    box(wash, [3.6, .16, 3.8], [0, .08, 0], m.sand);
    box(wash, [1.0, .08, 3.45], [.15, .17, 0], m.dark, [0, 0, .04]);
    for (const side of [-1, 1]) box(wash, [1.15, .34, 3.5], [side * 1.18, .28, 0], m.brown, [side * .08, 0, side * -.08]);
    const rocks = [[-.82,.52,-1.2,.38],[1.05,.56,-.9,.44],[-1.18,.48,.3,.34],[.82,.5,.72,.36],[1.25,.42,1.35,.3]];
    rocks.forEach(([x, y, z, radius], index) => sphere(wash, radius, [x, y, z], index % 2 ? m.pale : m.metal, [1.25, .72, .9]));
    return root;
  }

  function buildIndustrialNest() {
    const root = new THREE.Group();
    root.name = 'industrial_brood_nest';
    box(root, [5.2, .22, 3.4], [0, .11, 0], m.asphalt);
    const machinery = new THREE.Group();
    machinery.name = 'infected_freight_machinery';
    root.add(machinery);
    box(machinery, [3.8, 1.55, 1.65], [0, 1.02, -.45], m.orange);
    for (const x of [-1.45, -1, -.55, -.1, .35, .8, 1.25]) box(machinery, [.12, 1.1, .05], [x, 1.02, .4], m.dark);
    for (const x of [-1.65, 1.65]) cylinder(machinery, [.32, .32], 2.4, 10, [x, 1.55, -.4], m.metal, [Math.PI / 2, 0, 0]);

    const mouth = new THREE.Group();
    mouth.name = 'relocation_burrow_mouth';
    root.add(mouth);
    torus(mouth, 1.05, .26, [0, .32, 1.02], m.brown);
    cylinder(mouth, [.68, .84], .15, 12, [0, .22, 1.02], m.black);
    for (const position of [[-1.7,.48,.8],[-1.25,.42,1.3],[1.25,.44,.78],[1.7,.4,1.28]]) egg(mouth, position, .82);

    const tendrils = new THREE.Group();
    tendrils.name = 'machinery_tendril_overlay';
    root.add(tendrils);
    for (const x of [-1.7, 1.7]) beam(tendrils, [x, .2, -.8], [x * .7, 1.55, .6], .1, m.brown);
    beam(tendrils, [-2.15, .18, .5], [1.85, .24, -.92], .07, m.orange);
    return root;
  }

  function buildInfectedProps() {
    const root = new THREE.Group();
    root.name = 'infected_prop_state_family';
    const states = [
      { name: 'state_clean', x: -3.0, amount: 0 },
      { name: 'state_infected', x: 0, amount: 1 },
      { name: 'state_breached', x: 3.0, amount: 2 }
    ];
    states.forEach(({ name, x, amount }) => {
      const state = new THREE.Group();
      state.name = name;
      state.position.x = x;
      root.add(state);
      box(state, [2.25, .14, 1.7], [0, .07, 0], m.asphalt);
      box(state, [1.45, 1.35, 1.12], [-.25, .78, -.08], amount === 2 ? m.dark : m.orange, [0, 0, amount === 2 ? -.08 : 0]);
      for (const y of [.42, .74, 1.06]) box(state, [1.02, .07, .04], [-.25, y, .5], m.dark, [0, 0, amount === 2 ? .08 : 0]);
      cylinder(state, [.25, .25], 1.35, 10, [.72, .52, -.2], m.metal, [0, 0, Math.PI / 2]);
      box(state, [.28, 1.72 - amount * .32, .2], [-.95, .92 - amount * .08, -.1], m.pale, [0, 0, amount * -.12]);
      if (amount > 0) {
        sphere(state, .28 + amount * .04, [-.58, .28, .54], m.brown, [1.65, .42, 1]);
        sphere(state, .22 + amount * .04, [.65, .24, .32], m.brown, [1.45, .45, 1]);
        egg(state, [.05, .36, .54], .66 + amount * .08);
        beam(state, [-.92, .2, .52], [.96, .26, -.38], .07 + amount * .018, amount === 2 ? m.orange : m.brown);
      }
      if (amount === 2) {
        box(state, [.62, .36, .72], [-.38, .48, .25], m.black, [0, .08, .2]);
        egg(state, [.8, .34, .42], .72);
      }
    });
    return root;
  }

  function buildBurrowBreach() {
    const root = new THREE.Group();
    root.name = 'state_open_burrow_breach';
    cylinder(root, [3.0, 3.15], .12, 16, [0, .06, 0], m.asphalt);
    cylinder(root, [1.45, 1.75], .1, 14, [0, .14, 0], m.black);
    for (let index = 0; index < 14; index += 1) {
      const angle = index / 14 * Math.PI * 2;
      const radius = 1.65 + (index % 3) * .18;
      const rock = box(root, [.62, .35 + index % 2 * .22, .7], [Math.cos(angle) * radius, .25, Math.sin(angle) * radius], index % 2 ? m.sand : m.pale, [index * .07, -angle, index % 3 * .12]);
      rock.scale.x = 1 + index % 3 * .12;
    }
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2;
      beam(root, [Math.cos(angle) * .65, .12, Math.sin(angle) * .65], [Math.cos(angle + .3) * 2.8, .18, Math.sin(angle + .3) * 2.8], .12, index % 2 ? m.orange : m.brown);
    }
    for (const position of [[-2.25,.42,-1.2],[2.15,.38,.9],[1.6,.34,-1.8]]) egg(root, position, .8);
    return root;
  }

  function buildFreightLaneKit() {
    const root = new THREE.Group();
    root.name = 'freight_lane_modules';

    const straight = new THREE.Group();
    straight.name = 'container_straight_module';
    straight.position.x = -4.5;
    root.add(straight);
    box(straight, [3.7, .16, 3.2], [0, .08, 0], m.asphalt);
    box(straight, [3.35, 1.72, 1.55], [0, .94, -.62], m.blue);
    for (const x of [-1.42, -1.0, -.58, -.16, .26, .68, 1.1, 1.42]) box(straight, [.08, 1.34, .05], [x, .94, .17], m.dark);
    box(straight, [3.55, .13, .22], [0, 1.76, -.62], m.yellow);
    for (const x of [-1.45, 1.45]) box(straight, [.16, 1.8, .16], [x, .96, .2], m.metal);
    box(straight, [2.7, .06, .42], [0, .2, 1.05], m.yellow);

    const corner = new THREE.Group();
    corner.name = 'container_inside_corner';
    root.add(corner);
    box(corner, [3.7, .16, 3.2], [0, .08, 0], m.asphalt);
    box(corner, [2.95, 1.72, 1.35], [-.3, .94, -.78], m.orange);
    box(corner, [1.35, 1.72, 2.4], [1.1, .94, .22], m.orange);
    for (const x of [-1.45, -.98, -.5, 0, .48]) box(corner, [.08, 1.32, .05], [x, .94, -.08], m.dark);
    for (const z of [-.55, -.08, .39, .86]) box(corner, [.05, 1.32, .08], [.4, .94, z], m.dark);
    box(corner, [3.15, .13, .2], [-.2, 1.76, -.78], m.yellow);
    box(corner, [.2, .13, 2.45], [1.1, 1.76, .18], m.yellow);

    const endcap = new THREE.Group();
    endcap.name = 'container_endcap_gate';
    endcap.position.x = 4.5;
    root.add(endcap);
    box(endcap, [3.7, .16, 3.2], [0, .08, 0], m.asphalt);
    box(endcap, [2.25, 1.72, 1.5], [-.62, .94, -.62], m.blue);
    box(endcap, [.1, 1.28, 1.18], [.53, .92, -.62], m.dark, [0, 0, -.08]);
    for (const z of [-.55, .55]) box(endcap, [.22, .95, .22], [1.15, .48, z], m.yellow);
    beam(endcap, [.62, .82, -.75], [1.72, .82, .75], .13, m.orange, .18);
    box(endcap, [1.15, .08, 1.65], [1.18, .18, .1], m.pale);
    box(endcap, [.72, .06, .12], [1.18, .24, .1], m.yellow, [0, Math.PI / 4, 0]);
    return root;
  }

  function buildMirrorPanels() {
    const root = new THREE.Group();
    root.name = 'mirror_panel_state_family';
    const states = [
      { name: 'state_intact', material: m.cyanGlass },
      { name: 'state_cracked', material: m.glass },
      { name: 'state_false_image', material: m.purple },
      { name: 'state_destroyed', material: m.black }
    ];
    states.forEach(({ name, material }, index) => {
      const x = -3.15 + index * 2.1;
      const state = new THREE.Group();
      state.name = name;
      state.position.x = x;
      root.add(state);
      box(state, [1.65, .18, .7], [0, .09, 0], m.asphalt);
      box(state, [.16, 2.9, .16], [-.72, 1.55, 0], m.dark);
      box(state, [.16, 2.9, .16], [.72, 1.55, 0], m.dark, [0, 0, index === 3 ? .18 : 0]);
      box(state, [1.55, .16, .18], [0, 2.92, 0], m.gold, [0, 0, index === 3 ? -.15 : 0]);
      if (index < 3) box(state, [1.28, 2.42, .08], [0, 1.62, .08], material);
      if (index === 1 || index === 2) {
        beam(state, [-.55, .7, .15], [.45, 2.4, .15], .045, index === 1 ? m.white : m.acid);
        beam(state, [.52, .45, .16], [-.2, 1.35, .16], .045, m.white);
      }
      if (index === 3) {
        box(state, [.72, .16, .5], [-.3, .24, .2], m.glass, [.2, .35, .12]);
        box(state, [.55, .12, .42], [.45, .18, -.1], m.glass, [-.1, -.28, -.08]);
      }
    });
    return root;
  }

  function buildGenerationMarkers() {
    const root = new THREE.Group();
    root.name = 'clone_generation_marker_family';
    const names = ['generation_single', 'generation_double', 'generation_overload'];
    for (let index = 0; index < 3; index += 1) {
      const x = -2.6 + index * 2.6;
      const marker = new THREE.Group();
      marker.name = names[index];
      marker.position.x = x;
      root.add(marker);
      cylinder(marker, [1.05, 1.05], .08, 20, [0, .04, 0], m.asphalt);
      torus(marker, .8, .06, [0, .1, 0], index === 0 ? m.cyan : index === 1 ? m.purple : m.red);
      for (let pip = 0; pip <= index; pip += 1) sphere(marker, .13, [(pip - index / 2) * .38, .18, 0], index === 2 ? m.red : m.acid);
      for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
        box(marker, [.45, .045, .12], [Math.cos(angle) * .58, .14, Math.sin(angle) * .58], m.white, [0, -angle, 0]);
      }
    }
    return root;
  }

  function buildSplitRing() {
    const root = new THREE.Group();
    root.name = 'split_ring_emitter';
    cylinder(root, [1.25, 1.45], .28, 12, [0, .14, 0], m.asphalt);
    cylinder(root, [.68, .9], .55, 10, [0, .48, 0], m.dark);
    sphere(root, .48, [0, 1.25, 0], m.purple);
    const horizontalPulse = new THREE.Group();
    horizontalPulse.name = 'horizontal_pulse_ring';
    root.add(horizontalPulse);
    torus(horizontalPulse, 1.05, .1, [0, 1.25, 0], m.cyan, [0, 0, 0]);
    const verticalPulse = new THREE.Group();
    verticalPulse.name = 'vertical_split_ring';
    root.add(verticalPulse);
    torus(verticalPulse, 1.52, .08, [0, 1.25, 0], m.acid, [Math.PI / 2, 0, 0]);
    const anchors = new THREE.Group();
    anchors.name = 'radial_spawn_anchors';
    root.add(anchors);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      beam(anchors, [Math.cos(angle) * .55, .38, Math.sin(angle) * .55], [Math.cos(angle) * 1.45, .12, Math.sin(angle) * 1.45], .11, m.metal);
      sphere(anchors, .18, [Math.cos(angle) * 1.5, .18, Math.sin(angle) * 1.5], m.cyan);
    }
    return root;
  }

  function buildGlitchTopiary() {
    const root = new THREE.Group();
    root.name = 'glitch_topiary_variants';
    const positions = [-2.2, 0, 2.2];
    const names = ['topiary_pixel_growth', 'topiary_clone_stack', 'topiary_fragmented'];
    positions.forEach((x, index) => {
      const variant = new THREE.Group();
      variant.name = names[index];
      variant.position.x = x;
      root.add(variant);
      cylinder(variant, [.65, .82], .48, 8, [0, .24, 0], m.plaster);
      cylinder(variant, [.18, .24], 1.65, 7, [0, 1.22, 0], m.brown);
      if (index === 0) {
        sphere(variant, .82, [0, 2.0, 0], m.green, [1, 1.25, 1]);
        box(variant, [.58, .58, .58], [.58, 2.42, .12], m.acid);
      } else if (index === 1) {
        for (const y of [1.55, 2.15, 2.75]) sphere(variant, .66 - (y - 1.55) * .14, [y === 2.15 ? .28 : 0, y, 0], y === 2.15 ? m.cyan : m.lime);
      } else {
        for (const offset of [[-.5,1.85,0],[.35,2.2,.18],[.15,2.75,-.12]]) box(variant, [.88, .72, .82], offset, offset[1] > 2.5 ? m.purple : m.green, [0, offset[1], .12]);
      }
      for (const dx of [-.5, .5]) box(variant, [.08, .7, .08], [dx, .62, .5], index === 2 ? m.purple : m.acid, [0, 0, dx * -.2]);
    });
    return root;
  }

  function buildMirrorGardenPaths() {
    const root = new THREE.Group();
    root.name = 'mirror_garden_path_modules';

    const outer = new THREE.Group();
    outer.name = 'outer_concentric_path';
    root.add(outer);
    for (let index = 0; index < 24; index += 1) {
      if (index % 6 === 0) continue;
      const angle = index / 24 * Math.PI * 2;
      box(outer, [1.1, .1, .72], [Math.cos(angle) * 4.35, .05, Math.sin(angle) * 4.35], index % 2 ? m.plaster : m.pale, [0, -angle, 0]);
    }

    const inner = new THREE.Group();
    inner.name = 'inner_clone_loop';
    root.add(inner);
    for (let index = 0; index < 18; index += 1) {
      if (index % 9 === 0) continue;
      const angle = index / 18 * Math.PI * 2;
      box(inner, [.95, .085, .55], [Math.cos(angle) * 2.75, .065, Math.sin(angle) * 2.75], index % 3 ? m.dark : m.purple, [0, -angle, 0]);
    }

    const shortcuts = new THREE.Group();
    shortcuts.name = 'destructible_shortcut_thresholds';
    root.add(shortcuts);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const radius of [1.15, 1.75, 3.5]) box(shortcuts, [.8, .11, .5], [Math.cos(angle) * radius, .085, Math.sin(angle) * radius], radius === 1.75 ? m.cyan : m.gold, [0, -angle, 0]);
    }

    const beds = new THREE.Group();
    beds.name = 'formal_planting_beds';
    root.add(beds);
    for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
      const x = Math.cos(angle) * 5.15;
      const z = Math.sin(angle) * 5.15;
      box(beds, [1.45, .32, 1.45], [x, .16, z], m.plaster, [0, -angle, 0]);
      box(beds, [1.08, .18, 1.08], [x, .4, z], m.green, [0, -angle, 0]);
      for (const side of [-1, 1]) box(beds, [.08, .5, .08], [x + Math.cos(angle + Math.PI / 2) * side * .34, .7, z + Math.sin(angle + Math.PI / 2) * side * .34], side > 0 ? m.cyan : m.purple, [0, 0, side * .16]);
    }
    return root;
  }

  function buildTribunalDais() {
    const root = new THREE.Group();
    root.name = 'tribunal_dais';
    const base = new THREE.Group();
    base.name = 'raised_verdict_platform';
    root.add(base);
    cylinder(base, [3.2, 3.45], .28, 18, [0, .14, 0], m.asphalt);
    cylinder(base, [2.25, 2.55], .45, 18, [0, .48, 0], m.plaster);
    cylinder(base, [1.2, 1.45], .55, 16, [0, .98, 0], m.dark);
    const sectorNames = ['sector_cyan', 'sector_orange', 'sector_purple'];
    for (let sector = 0; sector < 3; sector += 1) {
      const angle = sector * Math.PI * 2 / 3;
      const material = [m.cyan, m.orange, m.purple][sector];
      const sectorGroup = new THREE.Group();
      sectorGroup.name = sectorNames[sector];
      root.add(sectorGroup);
      box(sectorGroup, [2.4, .08, .22], [Math.cos(angle) * 2.15, .72, Math.sin(angle) * 2.15], material, [0, -angle, 0]);
      box(sectorGroup, [.85, .26, .9], [Math.cos(angle) * 3.05, .32, Math.sin(angle) * 3.05], m.pale, [0, -angle, 0]);
      sphere(sectorGroup, .2, [Math.cos(angle) * 1.1, 1.32, Math.sin(angle) * 1.1], material);
    }
    const lectern = new THREE.Group();
    lectern.name = 'verdict_control_lectern';
    root.add(lectern);
    box(lectern, [1.35, 1.05, .8], [0, 1.66, -.25], m.gold, [-.1, 0, 0]);
    box(lectern, [.85, .26, .04], [0, 1.86, .18], m.red);
    return root;
  }

  function buildPurgeNode() {
    const root = new THREE.Group();
    root.name = 'purge_and_strike_state_family';
    const devices = [
      { x: -2.6, name: 'state_purge_active', material: m.acid, tall: false, rings: 2 },
      { x: 0, name: 'state_purge_cleansed', material: m.cyan, tall: false, rings: 1 },
      { x: 2.6, name: 'state_strike_armed', material: m.red, tall: true, rings: 3 }
    ];
    devices.forEach(({ x, name, material, tall, rings }) => {
      const state = new THREE.Group();
      state.name = name;
      state.position.x = x;
      root.add(state);
      cylinder(state, [.78, 1.0], .3, 10, [0, .15, 0], m.asphalt);
      box(state, [.82, tall ? 2.8 : 1.85, .72], [0, tall ? 1.62 : 1.12, 0], m.dark);
      for (let index = 0; index < rings; index += 1) torus(state, .48, .08, [0, .68 + index * .68, 0], material, [0, 0, 0]);
      sphere(state, tall ? .3 : .4, [0, tall ? 3.12 : 2.12, 0], material);
      box(state, [.55, .22, .05], [0, .75, .39], material);
      if (name === 'state_purge_cleansed') box(state, [.34, .34, .05], [0, 1.42, .4], m.white, [0, 0, Math.PI / 4]);
    });
    beam(root, [-2.6, 1.55, 0], [2.6, 2.45, 0], .06, m.red);
    return root;
  }

  function buildCourtBench() {
    const root = new THREE.Group();
    root.name = 'court_cover_state_family';
    const states = [
      { x: -3.4, name: 'state_intact', damage: 0 },
      { x: 0, name: 'state_damaged', damage: 1 },
      { x: 3.4, name: 'state_destroyed', damage: 2 }
    ];
    states.forEach(({ x, name, damage }) => {
      const state = new THREE.Group();
      state.name = name;
      state.position.x = x;
      root.add(state);
      box(state, [3.0, .14, 1.8], [0, .07, 0], m.asphalt);
      box(state, [2.65 - damage * .5, .34, .78], [-damage * .2, .58 - damage * .08, -.3], m.brown, [0, 0, damage * -.1]);
      box(state, [2.65 - damage * .72, .95 - damage * .22, .2], [-damage * .2, 1.16 - damage * .14, -.62], m.brown, [-.08, 0, damage * .12]);
      for (const supportX of [-.95, .95]) box(state, [.18, .58 - damage * .12, .48], [supportX, .3, -.3], m.dark, [0, 0, damage === 2 ? supportX * .18 : 0]);
      box(state, [1.1, .08, .05], [-.55, 1.22 - damage * .18, -.5], damage === 0 ? m.cyan : m.orange, [0, 0, damage * .12]);
      if (damage < 2) {
        box(state, [.14, 1.22 - damage * .25, 1.45], [1.24, .68, .2], m.glass, [0, 0, damage * -.12]);
        for (const z of [-.42, .2, .82]) box(state, [.22, 1.32 - damage * .22, .22], [1.24, .68, z], m.metal, [0, 0, damage * -.12]);
      } else {
        box(state, [.72, .1, .5], [1.0, .18, .35], m.glass, [.2, .35, .08]);
        box(state, [.52, .08, .38], [1.35, .14, -.38], m.glass, [-.12, -.25, 0]);
      }
    });
    return root;
  }

  function buildCourtSectorAisles() {
    const root = new THREE.Group();
    root.name = 'court_sector_aisle_modules';
    const aisles = [
      { x: -4.25, name: 'left_purge_aisle', material: m.cyan },
      { x: 4.25, name: 'right_strike_aisle', material: m.orange }
    ];
    aisles.forEach(({ x, name, material }) => {
      const aisle = new THREE.Group();
      aisle.name = name;
      aisle.position.x = x;
      root.add(aisle);
      box(aisle, [2.5, .12, 8.0], [0, .06, 0], m.asphalt);
      box(aisle, [.18, .06, 7.2], [0, .14, 0], material);
      for (const z of [-3.35, -1.1, 1.1, 3.35]) {
        box(aisle, [1.8, .1, .34], [0, .16, z], z < 0 ? m.pale : m.dark);
        box(aisle, [.14, .72, .14], [x < 0 ? -1.02 : 1.02, .48, z], m.metal);
      }
      beam(aisle, [x < 0 ? -1.02 : 1.02, .82, -3.35], [x < 0 ? -1.02 : 1.02, .82, 3.35], .08, m.gold);
    });

    const threshold = new THREE.Group();
    threshold.name = 'rear_verdict_threshold';
    threshold.position.z = -4.65;
    root.add(threshold);
    box(threshold, [6.0, .16, 1.35], [0, .08, 0], m.plaster);
    for (let sector = 0; sector < 3; sector += 1) {
      const material = [m.cyan, m.orange, m.purple][sector];
      box(threshold, [1.55, .08, .65], [-1.9 + sector * 1.9, .2, 0], material);
      box(threshold, [.12, .7, .12], [-2.65 + sector * 2.65, .45, -.52], m.dark);
    }
    return root;
  }

  function buildCathedralKit() {
    const root = new THREE.Group();
    root.name = 'server_cathedral_modules';
    const floor = new THREE.Group();
    floor.name = 'data_nave_floor';
    root.add(floor);
    box(floor, [6.5, .2, 3.4], [0, .1, 0], m.asphalt);

    const arch = new THREE.Group();
    arch.name = 'nave_arch';
    root.add(arch);
    for (const x of [-2.65, 2.65]) {
      box(arch, [.65, 4.6, .65], [x, 2.4, 0], m.dark);
      cylinder(arch, [.52, .72], .42, 8, [x, .31, 0], m.plaster);
      cylinder(arch, [.58, .48], .42, 8, [x, 4.72, 0], m.gold);
    }
    torus(arch, 2.65, .34, [0, 4.6, 0], m.plaster, [0, 0, 0], Math.PI);
    box(arch, [5.3, .28, .48], [0, 4.62, -.15], m.dark);

    const ribs = new THREE.Group();
    ribs.name = 'ceiling_ribs';
    root.add(ribs);
    for (const z of [-1.35, -.68, 0, .68, 1.35]) {
      beam(ribs, [-2.65, 4.72, z], [0, 5.75, z], .13, m.gold);
      beam(ribs, [0, 5.75, z], [2.65, 4.72, z], .13, m.gold);
    }
    const routes = new THREE.Group();
    routes.name = 'route_channels';
    root.add(routes);
    for (const [index, x] of [-1.7, 0, 1.7].entries()) box(routes, [.12, .04, 2.85], [x, .23, 0], [m.cyan, m.purple, m.orange][index]);
    const balcony = new THREE.Group();
    balcony.name = 'balcony_edge';
    root.add(balcony);
    box(balcony, [5.6, .18, .18], [0, 2.65, -1.52], m.metal);
    return root;
  }

  function buildDashboardWindows() {
    const root = new THREE.Group();
    root.name = 'stained_dashboard_window_family';
    const colors = [m.cyan, m.purple, m.orange];
    const names = ['window_route_cyan', 'window_route_purple', 'window_route_orange'];
    for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
      const x = -2.35 + panelIndex * 2.35;
      const panel = new THREE.Group();
      panel.name = names[panelIndex];
      panel.position.x = x;
      root.add(panel);
      box(panel, [1.9, 3.55, .3], [0, 1.78, 0], m.dark);
      box(panel, [1.56, 3.16, .08], [0, 1.78, .2], m.cyanGlass);
      for (let row = 0; row < 5; row += 1) for (let column = 0; column < 3; column += 1) {
        if ((row + column + panelIndex) % 3 === 0) continue;
        const material = (row + column) % 2 ? colors[panelIndex] : m.acid;
        box(panel, [.36, .34, .04], [-.48 + column * .48, .68 + row * .52, .27], material, [0, 0, (column - 1) * .04]);
      }
      torus(panel, .52, .055, [0, 2.95, .29], colors[panelIndex], [0, 0, 0]);
    }
    return root;
  }

  function buildMirrorChoir() {
    const root = new THREE.Group();
    root.name = 'mirror_choir_modules';
    for (let index = 0; index < 5; index += 1) {
      const angle = -.8 + index * .4;
      const x = Math.sin(angle) * 3.5;
      const z = Math.cos(angle) * .9;
      const rank = new THREE.Group();
      rank.name = `choir_rank_${index + 1}`;
      root.add(rank);
      box(rank, [1.15, .18, .72], [x, .09, z], m.asphalt, [0, -angle, 0]);
      box(rank, [.94, 2.55, .12], [x, 1.48, z], index % 2 ? m.glass : m.cyanGlass, [0, -angle, 0]);
      box(rank, [1.12, .16, .22], [x, 2.78, z], index === 2 ? m.acid : m.gold, [0, -angle, 0]);
      const terminalZ = z + .7;
      box(rank, [.72, .92, .62], [x, .56, terminalZ], m.dark, [-.08, -angle, 0]);
      box(rank, [.44, .28, .04], [x, .75, terminalZ + .33], index % 2 ? m.purple : m.cyan, [0, -angle, 0]);
    }
    const emitter = new THREE.Group();
    emitter.name = 'false_image_emitter';
    root.add(emitter);
    sphere(emitter, .38, [0, 1.32, -.3], m.purple);
    torus(emitter, .82, .07, [0, 1.32, -.3], m.acid, [0, 0, 0]);
    return root;
  }

  function buildRootAltar() {
    const root = new THREE.Group();
    root.name = 'root_altar_logic_modules';
    const core = new THREE.Group();
    core.name = 'central_root_core';
    root.add(core);
    cylinder(core, [1.5, 1.75], .42, 12, [0, .21, 0], m.asphalt);
    cylinder(core, [.82, 1.1], 1.15, 10, [0, .88, 0], m.dark);
    sphere(core, .58, [0, 1.75, 0], m.acid);
    torus(core, 1.05, .1, [0, 1.75, 0], m.cyan, [0, 0, 0]);
    torus(core, .82, .08, [0, 1.75, 0], m.purple, [Math.PI / 2, 0, 0]);
    const bridgeNames = ['logic_bridge_cyan', 'logic_bridge_purple', 'logic_bridge_orange', 'logic_bridge_neutral'];
    const bridgeMaterials = [m.cyan, m.purple, m.orange, m.white];
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const index = Math.round(angle / (Math.PI / 2));
      const bridge = new THREE.Group();
      bridge.name = bridgeNames[index];
      root.add(bridge);
      const x = Math.cos(angle) * 2.8;
      const z = Math.sin(angle) * 2.8;
      box(bridge, [2.2, .18, .78], [Math.cos(angle) * 1.9, .32, Math.sin(angle) * 1.9], m.metal, [0, -angle, 0]);
      box(bridge, [.72, 2.3, 1.2], [x, 1.15, z], angle % Math.PI === 0 ? m.plaster : m.dark, [0, -angle, 0]);
      box(bridge, [.42, .18, .05], [x + Math.cos(angle) * -.62, 1.25, z + Math.sin(angle) * -.62], bridgeMaterials[index], [0, -angle, 0]);
      beam(bridge, [Math.cos(angle) * .65, .58, Math.sin(angle) * .65], [x, 1.78, z], .06, m.acid);
    }
    return root;
  }

  function buildEndChoice() {
    const root = new THREE.Group();
    root.name = 'campaign_end_choice';
    box(root, [4.4, .22, 2.6], [0, .11, 0], m.asphalt);
    const choices = [
      { x: -1.15, name: 'choice_free', material: m.cyan, secondary: m.acid, tilt: .08 },
      { x: 1.15, name: 'choice_reset', material: m.red, secondary: m.orange, tilt: -.08 }
    ];
    choices.forEach(({ x, name, material, secondary, tilt }) => {
      const choice = new THREE.Group();
      choice.name = name;
      root.add(choice);
      box(choice, [1.55, 1.7, 1.3], [x, 1.02, 0], m.dark, [-.12, tilt, 0]);
      box(choice, [1.08, .62, .06], [x, 1.42, .7], material);
      box(choice, [.58, .18, .05], [x, .82, .7], secondary);
      cylinder(choice, [.22, .3], .18, 8, [x, 1.92, .15], material);
      beam(choice, [x, .2, -.65], [0, .12, -1.12], .07, material);
    });
    const beacon = new THREE.Group();
    beacon.name = 'decision_world_feedback_beacon';
    root.add(beacon);
    box(beacon, [.18, 2.45, .18], [0, 1.42, -1.0], m.metal);
    sphere(beacon, .34, [0, 2.78, -1.0], m.acid);
    torus(beacon, .62, .07, [0, 2.78, -1.0], m.purple, [0, 0, 0]);
    return root;
  }

  function buildCathedralRouteKit() {
    const root = new THREE.Group();
    root.name = 'cathedral_route_modules';
    const routes = [
      { x: -3.0, name: 'route_cyan_nave', material: m.cyan },
      { x: 0, name: 'route_purple_nave', material: m.purple },
      { x: 3.0, name: 'route_orange_nave', material: m.orange }
    ];
    routes.forEach(({ x, name, material }, routeIndex) => {
      const route = new THREE.Group();
      route.name = name;
      route.position.x = x;
      root.add(route);
      box(route, [2.25, .12, 9.2], [0, .06, 0], m.asphalt);
      box(route, [.18, .06, 8.55], [0, .15, 0], material);
      for (const z of [-3.6, -1.2, 1.2, 3.6]) {
        box(route, [1.65, .08, .42], [0, .16, z], routeIndex === 1 ? m.dark : m.pale);
        for (const side of [-1, 1]) box(route, [.12, .48, .12], [side * .9, .38, z], m.metal, [0, 0, side * .08]);
      }
    });

    const crossing = new THREE.Group();
    crossing.name = 'logic_route_switch_crossing';
    crossing.position.z = 1.35;
    root.add(crossing);
    box(crossing, [8.2, .11, 1.3], [0, .055, 0], m.dark);
    for (const [index, x] of [-3, 0, 3].entries()) {
      box(crossing, [1.6, .08, .72], [x, .15, 0], [m.cyan, m.purple, m.orange][index]);
      box(crossing, [.18, .8, .18], [x + (index - 1) * .32, .5, -.48], m.gold, [0, 0, (index - 1) * .08]);
    }
    return root;
  }

  function buildRelayBackdrop() {
    const root = new THREE.Group();
    box(root, [13.5, .3, 2.2], [0, .15, 0], m.asphalt);
    const buildings = [
      [-5.25, 2.6, 2.15, m.plaster],
      [-2.75, 4.2, 2.45, m.dark],
      [0, 3.2, 2.7, m.pale],
      [2.9, 5.25, 2.3, m.dark],
      [5.35, 3.55, 2.4, m.plaster]
    ];
    buildings.forEach(([x, height, width, material], buildingIndex) => {
      box(root, [width, height, 1.65], [x, height / 2 + .3, 0], material);
      box(root, [width + .18, .18, 1.82], [x, height + .37, 0], buildingIndex % 2 ? m.yellow : m.metal);
      for (let row = 0; row < Math.floor(height / .9); row += 1) for (const offset of [-.45, .45]) {
        box(root, [.34, .38, .04], [x + offset, .95 + row * .78, .85], (row + buildingIndex) % 3 ? m.cyan : m.black);
      }
    });
    cylinder(root, [.72, .72], 1.05, 10, [-5.2, 3.75, 0], m.blue);
    for (const x of [-5.55, -4.85]) box(root, [.1, 1.0, .1], [x, 3.0, 0], m.metal);
    cylinder(root, [.06, .08], 2.0, 6, [2.9, 6.35, 0], m.metal);
    sphere(root, .18, [2.9, 7.38, 0], m.acid);
    beam(root, [-6.5, 1.8, .8], [6.5, 2.25, .8], .12, m.yellow);
    return root;
  }

  function buildSpireBackdrop() {
    const root = new THREE.Group();
    box(root, [12.5, .28, 2.4], [0, .14, 0], m.asphalt);
    for (const x of [-5.15, 5.15]) {
      box(root, [2.0, 3.15, 1.7], [x, 1.72, 0], m.white);
      for (const ribX of [-.7, 0, .7]) box(root, [.12, 3.5, 1.86], [x + ribX, 1.85, 0], m.dark);
      box(root, [2.15, .16, 1.9], [x, 3.38, 0], m.cyan);
    }
    cylinder(root, [1.2, 2.25], 7.2, 6, [0, 3.75, 0], m.white);
    cylinder(root, [.62, 1.15], 3.0, 6, [0, 8.78, 0], m.dark);
    for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
      box(root, [.16, 7.4, .24], [Math.cos(angle) * 1.25, 4.05, Math.sin(angle) * .72], m.cyan, [0, -angle, Math.cos(angle) * -.035]);
    }
    torus(root, 1.45, .11, [0, 6.65, 0], m.gold);
    sphere(root, .48, [0, 10.55, 0], m.red);
    box(root, [4.2, 1.5, .14], [0, 3.85, 1.18], m.black);
    box(root, [3.45, .22, .04], [0, 4.15, 1.28], m.cyan);
    return root;
  }

  function buildAdZoneBackdrop() {
    const root = new THREE.Group();
    box(root, [14, .26, 2.2], [0, .13, 0], m.asphalt);
    const blocks = [[-4.8,4.2,2.5],[0,5.6,3.1],[4.65,3.7,2.7]];
    blocks.forEach(([x, height, width], index) => {
      box(root, [width, height, 1.6], [x, height / 2 + .25, 0], index === 1 ? m.dark : m.pale);
      box(root, [width * .88, height * .52, .08], [x, height * .61, .84], index === 0 ? m.purple : index === 1 ? m.cyan : m.orange);
      box(root, [width * .66, .22, .04], [x, height * .72, .91], m.acid);
      for (let row = 0; row < 3; row += 1) box(root, [width * .17, .38, .04], [x - width * .25 + row * width * .25, height * .42, .91], row === index ? m.red : m.black);
      for (const side of [-1, 1]) box(root, [.1, height + .5, .1], [x + side * width * .48, height / 2 + .25, .92], m.metal);
    });
    for (const x of [-6.4, -3.2, 3.1, 6.2]) cylinder(root, [.06, .08], 2.2, 6, [x, 1.35, .65], m.dark);
    beam(root, [-6.4, 2.42, .65], [6.2, 2.42, .65], .08, m.yellow);
    sphere(root, .34, [0, 6.25, 0], m.acid, [1.8, .55, .8]);
    return root;
  }

  function buildWastesBackdrop() {
    const root = new THREE.Group();
    box(root, [14, .22, 3.6], [0, .11, 0], m.sand);
    const mesas = [[-5.4,2.2,2.5],[-2.8,1.45,1.8],[3.75,2.65,2.8],[6.0,1.5,1.5]];
    mesas.forEach(([x, height, radius], index) => {
      const mesa = cylinder(root, [radius * .72, radius], height, 7, [x, height / 2 + .2, -.45], index % 2 ? m.brown : m.sand);
      mesa.scale.z = .62;
      const cap = cylinder(root, [radius * .76, radius * .76], .18, 7, [x, height + .27, -.45], m.pale);
      cap.scale.z = .62;
    });
    for (const x of [-1.0, 1.1]) {
      cylinder(root, [.42, .58], 3.5, 8, [x, 1.95, .4], m.dark);
      box(root, [1.35, .3, .65], [x, 3.6, .4], m.metal);
      box(root, [.9, .14, .04], [x, 3.62, .75], m.orange);
    }
    for (const x of [-6.5, 6.45]) {
      cylinder(root, [.08, .11], 3.1, 6, [x, 1.65, .4], m.metal);
      for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) beam(root, [x, 3.18, .4], [x + Math.cos(angle) * 1.05, 3.18 + Math.sin(angle) * 1.05, .4], .06, m.pale);
    }
    return root;
  }

  function buildFreightBackdrop() {
    const root = new THREE.Group();
    box(root, [14.5, .28, 3.4], [0, .14, 0], m.asphalt);
    for (const x of [-4.85, -3.35]) {
      cylinder(root, [1.0, 1.08], 4.5, 12, [x, 2.53, -.35], m.metal);
      cylinder(root, [.25, 1.0], 1.0, 12, [x, 5.28, -.35], m.pale);
      box(root, [2.25, .16, 2.25], [x, .34, -.35], m.dark);
    }
    for (const x of [-.9, .7, 2.3, 3.9, 5.5]) for (let level = 0; level < (x > 2 ? 3 : 2); level += 1) {
      box(root, [1.42, .72, 1.05], [x, .72 + level * .76, .35], (level + Math.round(x)) % 2 ? m.orange : m.blue);
      box(root, [1.18, .05, .03], [x, .72 + level * .76, .89], m.yellow);
    }
    for (const x of [-1.25, 6.4]) box(root, [.26, 6.2, .26], [x, 3.25, -.2], m.dark, [0, 0, x < 0 ? -.06 : .06]);
    beam(root, [-1.25, 6.1, -.2], [6.4, 6.1, -.2], .28, m.yellow, .42);
    box(root, [2.2, .55, .7], [2.6, 5.72, -.2], m.orange);
    beam(root, [2.6, 5.6, -.2], [2.6, 2.4, .15], .08, m.dark);
    return root;
  }

  function buildMirrorGardenBackdrop() {
    const root = new THREE.Group();
    box(root, [13.5, .24, 3.5], [0, .12, 0], m.green);
    box(root, [6.8, .22, 2.5], [0, .34, -.3], m.plaster);
    for (const x of [-3.25, 3.25]) box(root, [.45, 3.65, .45], [x, 2.12, -.3], m.white);
    torus(root, 3.25, .24, [0, 3.92, -.3], m.white, [0, 0, 0], Math.PI);
    for (const x of [-2.55, -1.25, 0, 1.25, 2.55]) {
      box(root, [1.0, 2.75, .08], [x, 1.78, -.05], x === 0 ? m.cyanGlass : m.glass, [0, x * .025, 0]);
      box(root, [1.12, .14, .2], [x, 3.18, -.05], x % 2 ? m.purple : m.gold);
    }
    for (const x of [-5.45, -4.3, 4.3, 5.45]) {
      cylinder(root, [.42, .58], .48, 8, [x, .4, .4], m.plaster);
      cylinder(root, [.12, .16], 1.0, 7, [x, 1.05, .4], m.brown);
      sphere(root, .72, [x, 2.0, .4], x < 0 ? m.green : m.purple, [1, 1.25, 1]);
    }
    box(root, [12.5, .08, .12], [0, .3, 1.35], m.cyan);
    return root;
  }

  function buildContentCourtBackdrop() {
    const root = new THREE.Group();
    box(root, [13.5, .28, 3.1], [0, .14, 0], m.asphalt);
    box(root, [9.0, 4.0, 1.9], [0, 2.28, 0], m.plaster);
    box(root, [10.5, .48, 2.3], [0, .5, 0], m.dark);
    for (const x of [-3.7, -2.45, -1.2, 0, 1.2, 2.45, 3.7]) {
      cylinder(root, [.23, .3], 3.2, 8, [x, 2.35, 1.05], m.white);
      cylinder(root, [.34, .42], .26, 8, [x, .78, 1.05], m.gold);
    }
    box(root, [9.65, .44, 2.22], [0, 4.48, 0], m.dark);
    cylinder(root, [1.5, 2.2], 1.15, 10, [0, 5.25, 0], m.metal);
    cylinder(root, [.32, 1.5], 1.0, 10, [0, 6.32, 0], m.gold);
    sphere(root, .35, [0, 7.15, 0], m.red);
    for (const x of [-5.2, 5.2]) {
      box(root, [1.65, 5.2, 1.6], [x, 2.88, -.1], m.dark);
      box(root, [1.2, 2.5, .08], [x, 3.25, .75], x < 0 ? m.cyan : m.red);
      for (const y of [1.2, 2.0, 4.6]) box(root, [1.2, .12, .05], [x, y, .82], m.gold);
    }
    return root;
  }

  function buildServerCathedralBackdrop() {
    const root = new THREE.Group();
    box(root, [14, .28, 3.5], [0, .14, 0], m.black);
    const spires = [[-4.8,6.2,1.55],[-2.4,8.0,1.7],[0,10.2,2.0],[2.4,8.0,1.7],[4.8,6.2,1.55]];
    spires.forEach(([x, height, width], index) => {
      box(root, [width, height, 1.7], [x, height / 2 + .25, 0], index === 2 ? m.dark : m.metal);
      cylinder(root, [.18, width * .52], 1.4, 6, [x, height + .95, 0], index % 2 ? m.cyan : m.purple);
      for (let y = 1.0; y < height; y += .82) {
        box(root, [width * .7, .07, .04], [x, y, .88], (Math.round(y * 10) + index) % 3 ? m.cyan : m.acid);
      }
    });
    for (const x of [-3.6, -1.2, 1.2, 3.6]) {
      torus(root, 1.2, .13, [x, 4.1 + Math.abs(x) * .18, .65], m.gold, [0, 0, 0], Math.PI);
      box(root, [.16, 4.0, .18], [x - 1.2, 2.1 + Math.abs(x) * .18, .65], m.dark);
      box(root, [.16, 4.0, .18], [x + 1.2, 2.1 + Math.abs(x) * .18, .65], m.dark);
    }
    beam(root, [-6.6, 2.2, 1.0], [6.6, 2.2, 1.0], .12, m.purple);
    sphere(root, .44, [0, 11.8, 0], m.acid);
    return root;
  }

  const definitions = [
    ['relaymast', 'Broadcast relay mast', 'landmarks', 'Dominant Relay District objective and boss-phase signal anchor.', 'Landmark objective', buildRelayMast, 1.6],
    ['fireescape', 'Fire escape connector kit', 'traversal', 'Facade-mounted platforms, stair flight, rails, and roof bridge for one elevated flank.', 'Elevated flank', buildFireEscape, 1.45],
    ['broodinfestation', 'Brood infestation set', 'infestation', 'Nest mouth, eggs, tendrils, and goo footprint for visible Broodmaker transformations.', 'Phase dressing', buildBroodInfestation, .75],
    ['relaystreetkit', 'Relay modular street kit', 'ground', 'Six-metre straight and corner street modules with sidewalks, curb returns, crossings, drainage, access ramps, and grounded dressing.', 'Street construction', buildRelayStreetKit, .35],
    ['spirefacade', 'Sanitizer Spire facade', 'architecture', 'Sterile vertical Bureau frontage with press screen, podium, ribs, and warning lamps.', 'Signature shell', buildSpireFacade, 1.75],
    ['censorshipnodes', 'Censorship node family', 'objectives', 'Active, vulnerable, and destroyed suppression-node states in one readable family.', 'Phase objective', buildCensorshipNodes, 1.0],
    ['suppressiontiles', 'Suppression floor tile kit', 'ground', 'Color-coded damaging, healing-blocked, and recovery floor-zone modules.', 'Hazard telegraph', buildSuppressionTiles, .25],
    ['billboardwall', 'Rotating billboard wall', 'boundaries', 'Motorized double-sided screen that can mechanically rotate and reconfigure a lane.', 'Moving cover', buildBillboardWall, 1.45],
    ['sponsorprojector', 'Sponsor-zone projector', 'objectives', 'Portable projector and concentric floor rings for beneficial or hostile sponsor zones.', 'Zone objective', buildSponsorProjector, 1.0],
    ['adtrappylon', 'Ad-trap pylon', 'hazards', 'Paired hazard pylons, crossed energy lines, and floor rails linked to Zeppelin attacks.', 'Boss hazard', buildAdTrapPylon, 1.15],
    ['adplazakit', 'Ad-Zone plaza module kit', 'ground', 'Sponsor-lane, cable-crossing, and vendor-frontage modules add authored ground graphics, service routing, and market identity.', 'Plaza construction', buildAdPlazaKit, .75],
    ['stormbeacon', 'Storm-eye beacon', 'landmarks', 'Tall multi-axis signal visible through sand and long exterior sightlines.', 'Weather landmark', buildStormBeacon, 1.7],
    ['filterruin', 'Filter ruin and icon debris', 'dressing', 'Collapsed memetic display with recognizable colored icon fragments and sand damage.', 'Wastes identity', buildFilterRuin, 1.0],
    ['windbreaks', 'Windbreak cloth states', 'boundaries', 'Safe, risky, and collapsed windbreak variants using one collision language.', 'Lane state', buildWindbreaks, 1.0],
    ['wastesterrainkit', 'Trend Wastes terrain kit', 'ground', 'Walkable dune slope, eroded road transition, and dry-wash rock modules replace the flat-board exterior language.', 'Terrain construction', buildWastesTerrainKit, .7],
    ['industrialnest', 'Industrial brood nest', 'infestation', 'Freight machinery fused with a burrow mouth, eggs, pipes, and infestation tendrils.', 'Spawn landmark', buildIndustrialNest, 1.0],
    ['infectedprops', 'Infected prop variants', 'infestation', 'Generator, pipe, and door samples carrying reusable goo, egg, and tendril overlays.', 'Phase dressing', buildInfectedProps, .9],
    ['burrowbreach', 'Large burrow breach', 'access', 'Heavy Broodmaker entrance with a deep opening, displaced slabs, eggs, and radial cracks.', 'Boss entrance', buildBurrowBreach, .6],
    ['freightlanekit', 'Freight lane modular kit', 'boundaries', 'Straight container edge, inside corner, and gated endcap modules create readable freight lanes without one-off wall blocks.', 'Yard construction', buildFreightLaneKit, .7],
    ['mirrorpanels', 'Mirror panel states', 'boundaries', 'Intact, cracked, false-image, and destroyed mirror gameplay states.', 'Destructible route', buildMirrorPanels, 1.15],
    ['generationmarkers', 'Clone generation markers', 'ground', 'Three floor markers communicate clone generation and split escalation at a glance.', 'Spawn telegraph', buildGenerationMarkers, .25],
    ['splitring', 'Split-ring emitter', 'objectives', 'Radial emitter with orthogonal rings and anchors for clone spawns and pulse attacks.', 'Radial hazard', buildSplitRing, .85],
    ['glitchtopiary', 'Glitch topiary set', 'vegetation', 'Formal garden silhouettes interrupted by readable geometric corruption.', 'Garden identity', buildGlitchTopiary, 1.2],
    ['mirrorgardenpaths', 'Mirror Garden path kit', 'ground', 'Concentric walkways, clone loop, shortcut thresholds, and planting beds establish the formal radial arena language.', 'Garden construction', buildMirrorGardenPaths, .35],
    ['tribunaldais', 'Tribunal dais and radial floor', 'architecture', 'Raised court center with three colored sectors, control lectern, and radial route cues.', 'Boss arena center', buildTribunalDais, .9],
    ['purgenode', 'Purge Node and Strike pylon', 'objectives', 'Two related devices distinguish cleanse objectives from incoming Strike hazards.', 'Boss mechanic', buildPurgeNode, 1.15],
    ['courtbench', 'Court bench and evidence barrier', 'cover', 'Thematic waist cover with evidence glass, district strips, and reusable bench rows.', 'Thematic cover', buildCourtBench, .8],
    ['courtsectoraisles', 'Court sector aisle kit', 'ground', 'Paired strike-clearance aisles, evidence rails, and a three-color verdict threshold preserve safe radial routes.', 'Court construction', buildCourtSectorAisles, .35],
    ['cathedralkit', 'Server Cathedral modular kit', 'architecture', 'Columns, arch, nave floor, ceiling ribs, and balcony edge in one modular language.', 'Signature shell', buildCathedralKit, 1.6],
    ['dashboardwindows', 'Stained-dashboard windows', 'interiors', 'Three luminous data windows built from dashboard-like icon and status fragments.', 'Story lighting', buildDashboardWindows, 1.35],
    ['mirrorchoir', 'Mirror Choir kit', 'interiors', 'Curved mirror ranks, choir terminals, and a central false-image emitter.', 'Phase room', buildMirrorChoir, 1.1],
    ['rootaltar', 'Root Altar and logic modules', 'objectives', 'Central core, four bridges, shifting wall blocks, locks, and energy connections.', 'Final objective', buildRootAltar, 1.1],
    ['endchoice', 'Free or reset choice console', 'objectives', 'A bifurcated final console with persistent cyan free and red reset states.', 'Campaign choice', buildEndChoice, 1.15],
    ['cathedralroutes', 'Server Cathedral route kit', 'ground', 'Three persistent nave lanes and a logic-room switch crossing preserve route color through every finale phase.', 'Finale construction', buildCathedralRouteKit, .3],
    ['relaybackdrop', 'Relay District skyline', 'backdrops', 'Low-cost civic skyline strip with relay roofs, water tower, windows, and an elevated service line.', 'Distant background', buildRelayBackdrop, 2.6],
    ['spirebackdrop', 'Sanitizer Spire horizon', 'backdrops', 'Monumental sterile Bureau spire and flanking press blocks for the Sanitizer skyline.', 'Distant background', buildSpireBackdrop, 3.3],
    ['adzonebackdrop', 'Ad-Zone media skyline', 'backdrops', 'Large commercial masses, luminous sponsor screens, and a gantry line readable behind the plaza.', 'Distant background', buildAdZoneBackdrop, 2.7],
    ['wastesbackdrop', 'Trend Wastes horizon', 'backdrops', 'Broad mesas, filter towers, and wind silhouettes designed for sand-obscured distance.', 'Distant background', buildWastesBackdrop, 2.0],
    ['freightbackdrop', 'Freight Annex skyline', 'backdrops', 'Industrial horizon kit with silos, container massing, and one dominant gantry crane.', 'Distant background', buildFreightBackdrop, 2.7],
    ['mirrorbackdrop', 'Mirror Garden pavilion', 'backdrops', 'Formal glass pavilion, mirrored bays, and symmetrical topiary masses for the garden horizon.', 'Distant background', buildMirrorGardenBackdrop, 2.2],
    ['courtbackdrop', 'Content Court facade', 'backdrops', 'Monumental civic court frontage with columns, side towers, and an authority crown.', 'Distant background', buildContentCourtBackdrop, 2.8],
    ['cathedralbackdrop', 'Server Cathedral megastructure', 'backdrops', 'Five server spires, nested data arches, and luminous stack bands for the final horizon.', 'Distant background', buildServerCathedralBackdrop, 3.8]
  ];

  const cloneMaterials = (root) => {
    const clones = new Map();
    root.traverse((object) => {
      if (!object.material) return;
      const clone = (material) => {
        if (!clones.has(material)) clones.set(material, material.clone());
        return clones.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
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
    build: () => cloneMaterials(build())
  }));

  if (assets.length !== CAMPAIGN_LEVEL_ASSET_COUNT) {
    throw new Error(`Expected ${CAMPAIGN_LEVEL_ASSET_COUNT} campaign level assets, received ${assets.length}.`);
  }
  return [...assets, ...createPostCampaignLevelAssetRegistry({ THREE })];
}
