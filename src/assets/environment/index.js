import { createLevelAssetRegistry, LEVEL_ASSET_COUNT } from './level-assets.js';

const CATEGORY_GROUPS = Object.freeze({
  props: ['checkpoint', 'gabion', 'generator', 'pipes', 'decon', 'tower', 'kiosk', 'reel', 'barriers', 'lightmast', 'medcache', 'trolley'],
  enemies: ['enforcer'],
  boundaries: ['facade', 'tarpfence', 'hesco', 'screenwall', 'cargogate', 'roadblock'],
  walls: ['concretewall', 'servicewall', 'civicwall', 'retainingwall', 'clinicwall', 'fortwall'],
  buildings: ['clinic', 'warehouse', 'apartment', 'guardbooth', 'cornershop'],
  vegetation: ['broadleaf', 'pine', 'deadtree', 'benttree', 'streettree'],
  ground: ['roadcurb', 'sidewalk', 'drainage', 'roaddamage'],
  traversal: ['stairs', 'loadingramp', 'catwalk', 'footbridge', 'ladderplatform'],
  access: ['reinforcementdoor', 'shutter', 'floorhatch', 'breachvent', 'cargolift'],
  cover: ['coverheights', 'cornercover', 'peekcover', 'breakablecover'],
  objectives: ['terminal', 'powerrelay', 'capturebeacon', 'ammostation'],
  interiors: ['corridor', 'archives', 'emergencysign']
});

const CORE_ENVIRONMENT_ASSET_COUNT = 60;
export const ENVIRONMENT_ASSET_COUNT = CORE_ENVIRONMENT_ASSET_COUNT + LEVEL_ASSET_COUNT;

export function environmentCategoryFor(id) {
  for (const [category, ids] of Object.entries(CATEGORY_GROUPS)) {
    if (ids.includes(id)) return category;
  }
  return 'environment';
}

export function createEnvironmentAssetRegistry({ THREE } = {}) {
  if (!THREE) throw new TypeError('createEnvironmentAssetRegistry requires THREE.');

  const materials = {
    charcoal: new THREE.MeshStandardMaterial({ color: 0x303a34, roughness: .9, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x18211c, roughness: .88, flatShading: true }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x7d877d, roughness: 1, flatShading: true }),
    concreteLight: new THREE.MeshStandardMaterial({ color: 0x9aa198, roughness: 1, flatShading: true }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe0aa2e, roughness: .72, flatShading: true }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd86437, roughness: .7, flatShading: true }),
    acid: new THREE.MeshStandardMaterial({ color: 0xd5ff3f, emissive: 0x425513, emissiveIntensity: .9, roughness: .55, flatShading: true }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x65d9d0, emissive: 0x174d49, emissiveIntensity: .65, roughness: .5, flatShading: true }),
    red: new THREE.MeshStandardMaterial({ color: 0xff554c, emissive: 0x75130f, emissiveIntensity: 1.25, roughness: .45, flatShading: true }),
    blue: new THREE.MeshStandardMaterial({ color: 0x3d7482, roughness: .86, flatShading: true }),
    sand: new THREE.MeshStandardMaterial({ color: 0xa4936b, roughness: 1, flatShading: true }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xb8b9aa, roughness: 1, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: 0x574a36, roughness: 1, flatShading: true }),
    leafA: new THREE.MeshStandardMaterial({ color: 0x516f35, roughness: 1, flatShading: true }),
    leafB: new THREE.MeshStandardMaterial({ color: 0x738d3e, roughness: 1, flatShading: true }),
    leafDry: new THREE.MeshStandardMaterial({ color: 0x887341, roughness: 1, flatShading: true }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x353c3a, roughness: 1, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x59655f, roughness: .72, metalness: .18, flatShading: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xd9ddd2, roughness: .88, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x263d39, roughness: .32, metalness: .08, transparent: true, opacity: .82, flatShading: true }),
    grass: new THREE.MeshStandardMaterial({ color: 0x617b32, roughness: 1, flatShading: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151b18, roughness: 1, flatShading: true }),
    rockA: new THREE.MeshStandardMaterial({ color: 0x747d74, roughness: 1, flatShading: true }),
    rockB: new THREE.MeshStandardMaterial({ color: 0x8e958b, roughness: 1, flatShading: true })
  };
  
  function finish(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  
  function box(group, size, position, material, rotation = [0, 0, 0]) {
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }
  
  function cylinder(group, radii, height, segments, position, material, rotation = [0, 0, 0]) {
    const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radii[0], radii[1], height, segments), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }
  
  function beamBetween(group, start, end, thickness, material, depth = thickness) {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const direction = endPoint.clone().sub(startPoint);
    const length = direction.length();
    const mesh = finish(new THREE.Mesh(new THREE.BoxGeometry(thickness, length, depth), material));
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
    return mesh;
  }
  
  function outlinedBox(group, size, position, material) {
    const mesh = box(group, size, position, material);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x354039, transparent: true, opacity: .9 }));
    mesh.add(edges);
    return mesh;
  }
  
  function buildCheckpoint() {
    const group = new THREE.Group();
    box(group, [.28, 3.05, .28], [-2.45, 1.5, 0], materials.charcoal, [0, 0, -.035]);
    box(group, [.28, 3.05, .28], [2.45, 1.5, 0], materials.charcoal, [0, 0, .035]);
    box(group, [5.65, .68, .68], [0, 3.12, 0], materials.yellow, [0, 0, -.025]);
    box(group, [1.55, .10, .70], [-1.42, 3.13, .36], materials.dark);
    box(group, [1.55, .10, .70], [1.43, 3.13, .36], materials.dark);
    const leftGate = new THREE.Group();
    leftGate.position.set(-2.32, 0, 0);
    leftGate.rotation.y = .18;
    group.add(leftGate);
    const rightGate = new THREE.Group();
    rightGate.position.set(2.32, 0, 0);
    rightGate.rotation.y = -.18;
    group.add(rightGate);
    for (const gate of [leftGate, rightGate]) {
      const direction = gate === leftGate ? 1 : -1;
      box(gate, [.09, 2.16, .09], [0, 1.32, 0], materials.concrete);
      box(gate, [.09, 2.16, .09], [direction * 1.82, 1.32, 0], materials.concrete);
      beamBetween(gate, [0, .25, 0], [direction * 1.82, .25, 0], .09, materials.concrete);
      beamBetween(gate, [0, 2.39, 0], [direction * 1.82, 2.39, 0], .09, materials.concrete);
      for (let i = 0; i < 4; i += 1) {
        const x0 = direction * (.18 + i * .4);
        const x1 = direction * (.58 + i * .4);
        beamBetween(gate, [x0, .35, 0], [x1, 2.29, 0], .045, materials.concrete);
      }
      cylinder(gate, [.1, .1], .22, 8, [0, .65, 0], materials.orange);
      cylinder(gate, [.1, .1], .22, 8, [0, 1.95, 0], materials.orange);
    }
    cylinder(group, [.18, .22], .28, 6, [-2.1, 3.67, 0], materials.orange);
    cylinder(group, [.18, .22], .28, 6, [2.1, 3.67, 0], materials.orange);
    box(group, [.85, .48, .12], [0, 2.67, .42], materials.acid);
    box(group, [.18, .9, .18], [-2.28, .52, .28], materials.charcoal);
    box(group, [.34, .42, .24], [-2.28, .92, .28], materials.orange);
    box(group, [.55, .12, .6], [0, .08, .2], materials.concrete);
    return group;
  }
  
  function addGabion(group, position, scale = [1, 1, 1]) {
    const cage = new THREE.Group();
    cage.position.set(...position);
    cage.scale.set(...scale);
    group.add(cage);
    const core = outlinedBox(cage, [2.15, 1.05, 1.15], [0, .53, 0], materials.rockA);
    core.material = materials.concrete;
    for (let x = -1; x <= 1; x += 1) for (let z = -1; z <= 1; z += 1) {
      const rock = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(.31 + ((x + z + 4) % 2) * .06, 0), (x + z) % 2 ? materials.rockA : materials.rockB));
      rock.position.set(x * .62, .45 + ((x * z + 2) % 2) * .23, z * .30);
      rock.rotation.set(x * .5, z * .7, x - z);
      cage.add(rock);
    }
    return cage;
  }
  
  function buildGabion() {
    const group = new THREE.Group();
    addGabion(group, [-1.28, 0, .15], [1, 1, 1]);
    addGabion(group, [1.0, 0, -.25], [.9, .82, 1]);
    addGabion(group, [-.05, 1.02, -.1], [.92, .9, .92]);
    for (let i = 0; i < 7; i += 1) {
      const blade = box(group, [.08, .58 + i % 3 * .12, .06], [-.6 + i * .19, 1.64, -.15 + (i % 2) * .18], materials.grass, [0, 0, -.25 + i * .08]);
      blade.scale.y = .8;
    }
    group.rotation.y = -.18;
    return group;
  }
  
  function buildGenerator() {
    const group = new THREE.Group();
    box(group, [3.3, 1.72, 1.8], [0, 1.18, 0], materials.orange, [0, 0, -.035]);
    box(group, [3.5, .16, 2.02], [0, .34, 0], materials.charcoal);
    for (const x of [-1.45, 1.45]) for (const z of [-.75, .75]) box(group, [.12, 2.45, .12], [x, 1.45, z], materials.charcoal);
    box(group, [3.02, .13, .13], [0, 2.67, -.75], materials.charcoal);
    box(group, [3.02, .13, .13], [0, 2.67, .75], materials.charcoal);
    box(group, [.13, .13, 1.5], [-1.45, 2.67, 0], materials.charcoal);
    box(group, [.13, .13, 1.5], [1.45, 2.67, 0], materials.charcoal);
    for (let i = 0; i < 7; i += 1) box(group, [1.52, .055, .07], [-.45, .78 + i * .14, .925], materials.dark);
    box(group, [.72, .62, .08], [.95, 1.25, .93], materials.dark);
    box(group, [.20, .20, .10], [.78, 1.35, 1], materials.acid);
    cylinder(group, [.48, .48], .24, 10, [-1.35, .44, 0], materials.rubber, [Math.PI / 2, 0, 0]);
    cylinder(group, [.48, .48], .24, 10, [1.35, .44, 0], materials.rubber, [Math.PI / 2, 0, 0]);
    cylinder(group, [.18, .18], .3, 8, [-1.35, .44, 0], materials.concrete, [Math.PI / 2, 0, 0]);
    cylinder(group, [.18, .18], .3, 8, [1.35, .44, 0], materials.concrete, [Math.PI / 2, 0, 0]);
    const cable = finish(new THREE.Mesh(new THREE.TorusGeometry(1.15, .07, 6, 28, Math.PI * 1.45), materials.dark));
    cable.position.set(1.75, .18, 1.15);
    cable.rotation.set(Math.PI / 2, .2, -.2);
    group.add(cable);
    group.rotation.y = -.28;
    return group;
  }
  
  function pipe(group, position, radius, length, material) {
    cylinder(group, [radius, radius], length, 12, position, material, [0, 0, Math.PI / 2]);
    const front = finish(new THREE.Mesh(new THREE.TorusGeometry(radius * .76, radius * .22, 5, 12), materials.concreteLight));
    front.position.set(position[0] + length / 2 + .015, position[1], position[2]);
    front.rotation.y = Math.PI / 2;
    group.add(front);
    const darkHole = cylinder(group, [radius * .54, radius * .54], .035, 12, [position[0] + length / 2 + .03, position[1], position[2]], materials.dark, [0, 0, Math.PI / 2]);
    return darkHole;
  }
  
  function buildPipes() {
    const group = new THREE.Group();
    pipe(group, [-.3, .82, .8], .82, 2.9, materials.concrete);
    pipe(group, [-.3, .82, -.9], .82, 2.9, materials.concrete);
    pipe(group, [-.3, 2.15, -.05], .82, 2.9, materials.concreteLight);
    for (let i = 0; i < 8; i += 1) box(group, [.08, .55 + (i % 3) * .15, .07], [-1.4 + i * .25, .27, -1.7 + (i % 2) * .18], materials.grass, [0, 0, -.28 + i * .08]);
    group.rotation.y = -.28;
    return group;
  }
  
  function buildDeconArch() {
    const group = new THREE.Group();
    box(group, [.58, 3.25, .82], [-2.08, 1.62, 0], materials.charcoal, [0, 0, -.025]);
    box(group, [.58, 3.25, .82], [2.08, 1.62, 0], materials.charcoal, [0, 0, .025]);
    const arch = finish(new THREE.Mesh(new THREE.TorusGeometry(2.08, .29, 6, 16, Math.PI), materials.yellow));
    arch.position.set(0, 3.18, 0);
    group.add(arch);
    box(group, [.74, .20, 1.05], [-2.08, .12, 0], materials.concrete);
    box(group, [.74, .20, 1.05], [2.08, .12, 0], materials.concrete);
    for (const x of [-1.45, -.72, 0, .72, 1.45]) {
      cylinder(group, [.075, .075], .35, 6, [x, 4.15 - Math.abs(x) * .25, .1], materials.cyan, [Math.PI / 2, 0, 0]);
      const mist = finish(new THREE.Mesh(new THREE.OctahedronGeometry(.14, 0), materials.cyan));
      mist.position.set(x, 3.62 - Math.abs(x) * .18, .1);
      group.add(mist);
    }
    box(group, [1.1, .5, .13], [0, 4.55, .48], materials.dark);
    for (let i = 0; i < 3; i += 1) box(group, [.24, .12, .16], [-.34 + i * .34, 4.55, .58], i === 1 ? materials.orange : materials.acid);
    box(group, [.18, 2.5, .18], [-2.55, 1.28, -.15], materials.orange, [0, 0, -.13]);
    box(group, [.18, 2.5, .18], [2.55, 1.28, -.15], materials.orange, [0, 0, .13]);
    return group;
  }
  
  function buildTower() {
    const group = new THREE.Group();
    const legPositions = [[-1.45, -.8], [1.45, -.8], [-1.45, .8], [1.45, .8]];
    legPositions.forEach(([x, z]) => box(group, [.18, 3.6, .18], [x, 1.75, z], materials.charcoal, [z * .035, 0, -x * .035]));
    box(group, [3.45, .24, 2.15], [0, 3.25, 0], materials.concrete);
    box(group, [3.05, 1.35, 1.82], [0, 3.92, 0], materials.glass);
    for (const x of [-1.48, 1.48]) for (const z of [-.83, .83]) box(group, [.12, 1.48, .12], [x, 3.92, z], materials.charcoal);
    box(group, [3.75, .28, 2.45], [0, 4.72, 0], materials.yellow, [0, 0, -.03]);
    box(group, [1.35, .16, .2], [0, 3.62, 1.0], materials.orange);
    for (let i = 0; i < 6; i += 1) box(group, [.68, .08, .12], [1.58, .42 + i * .45, .92], materials.concrete);
    box(group, [.12, 3.0, .12], [1.25, 1.52, .92], materials.charcoal);
    box(group, [.12, 3.0, .12], [1.92, 1.52, .92], materials.charcoal);
    cylinder(group, [.17, .22], .3, 6, [-1.05, 5.02, 0], materials.orange);
    cylinder(group, [.17, .22], .3, 6, [1.05, 5.02, 0], materials.orange);
    group.rotation.y = -.18;
    return group;
  }
  
  function buildKiosk() {
    const group = new THREE.Group();
    box(group, [4.1, 2.7, 2.5], [0, 1.38, 0], materials.charcoal);
    box(group, [4.35, .26, 2.75], [0, 2.82, 0], materials.yellow, [0, 0, -.03]);
    box(group, [2.15, 1.18, .12], [-.72, 1.72, 1.28], materials.glass);
    box(group, [1.2, 2.12, .13], [1.32, 1.3, 1.29], materials.dark);
    box(group, [.82, .42, .15], [1.32, 1.58, 1.38], materials.cyan);
    box(group, [2.48, .20, .72], [-.55, .88, 1.55], materials.concreteLight, [-.08, 0, 0]);
    for (let i = 0; i < 5; i += 1) box(group, [.12, .65, .09], [-1.48 + i * .39, 1.72, 1.38], materials.charcoal, [0, 0, -.12]);
    box(group, [.8, .18, .48], [-1.55, .22, 1.45], materials.orange, [0, .25, 0]);
    box(group, [.58, .14, .38], [-.78, .18, 1.62], materials.concreteLight, [0, -.18, .08]);
    box(group, [.46, .12, .32], [-.1, .15, 1.5], materials.concreteLight, [0, .32, -.06]);
    box(group, [.9, .18, .08], [1.32, .34, 1.38], materials.yellow);
    for (const x of [-1.7, 1.7]) box(group, [.28, .18, .35], [x, .12, -.9], materials.concrete);
    group.rotation.y = -.24;
    return group;
  }
  
  function buildReel() {
    const group = new THREE.Group();
    cylinder(group, [1.35, 1.35], .22, 12, [0, 1.38, -.72], materials.concrete, [Math.PI / 2, 0, 0]);
    cylinder(group, [1.35, 1.35], .22, 12, [0, 1.38, .72], materials.concrete, [Math.PI / 2, 0, 0]);
    cylinder(group, [.78, .78], 1.45, 12, [0, 1.38, 0], materials.orange, [Math.PI / 2, 0, 0]);
    cylinder(group, [.30, .30], 1.68, 8, [0, 1.38, 0], materials.dark, [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i += 1) {
      const angle = i / 8 * Math.PI * 2;
      box(group, [.16, 1.85, .12], [Math.cos(angle) * .45, 1.38 + Math.sin(angle) * .45, .84], materials.charcoal, [0, 0, -angle]);
    }
    const looseCable = finish(new THREE.Mesh(new THREE.TorusGeometry(1.55, .085, 6, 32, Math.PI * 1.55), materials.dark));
    looseCable.position.set(1.45, .12, .2);
    looseCable.rotation.set(-Math.PI / 2, .18, .08);
    group.add(looseCable);
    box(group, [2.8, .22, .48], [0, .12, 0], materials.concrete);
    box(group, [.34, .22, 2.0], [-1.15, .12, 0], materials.concrete);
    box(group, [.34, .22, 2.0], [1.15, .12, 0], materials.concrete);
    for (const z of [-.9, .9]) {
      beamBetween(group, [-1.15, .24, z], [-.34, 1.38, z], .16, materials.concreteLight, .18);
      beamBetween(group, [1.15, .24, z], [.34, 1.38, z], .16, materials.concreteLight, .18);
      cylinder(group, [.2, .2], .16, 8, [0, 1.38, z], materials.charcoal, [Math.PI / 2, 0, 0]);
    }
    group.rotation.y = -.28;
    return group;
  }
  
  function barrierModule(group, x, z, angle, paintOffset = 0) {
    const module = new THREE.Group();
    module.position.set(x, 0, z);
    module.rotation.y = angle;
    group.add(module);
    box(module, [2.15, .55, .82], [0, .28, 0], materials.concrete);
    box(module, [1.68, .72, .55], [0, .88, 0], materials.concreteLight);
    box(module, [2.38, .15, 1.02], [0, .08, 0], materials.charcoal);
    for (let i = 0; i < 4; i += 1) box(module, [.26, .48, .06], [-.62 + i * .42 + paintOffset, .88, .31], i % 2 ? materials.dark : materials.yellow, [0, 0, -.14]);
    return module;
  }
  
  function buildBarriers() {
    const group = new THREE.Group();
    barrierModule(group, -2.0, .25, -.18);
    barrierModule(group, 0, 0, .03, .06);
    barrierModule(group, 2.05, .32, .2, -.05);
    box(group, [.65, .12, .5], [-2.7, .12, -.45], materials.orange, [0, .28, .15]);
    box(group, [.48, .14, .42], [2.8, .1, -.25], materials.concreteLight, [0, -.34, -.08]);
    return group;
  }
  
  function buildLightMast() {
    const group = new THREE.Group();
    box(group, [2.35, .42, 1.65], [0, .24, 0], materials.orange);
    box(group, [1.75, .68, 1.25], [0, .68, 0], materials.charcoal);
    for (const x of [-.85, .85]) cylinder(group, [.28, .28], .24, 10, [x, .22, .82], materials.rubber, [Math.PI / 2, 0, 0]);
    box(group, [.24, 4.4, .24], [0, 2.88, 0], materials.charcoal);
    box(group, [3.15, .18, .22], [0, 5.02, 0], materials.concrete);
    for (const x of [-1.18, -.4, .4, 1.18]) {
      box(group, [.58, .42, .24], [x, 4.78, .14], materials.yellow, [-.18, 0, 0]);
      box(group, [.42, .27, .05], [x, 4.73, .285], materials.acid, [-.18, 0, 0]);
    }
    beamBetween(group, [-.93, .72, 0], [-.14, 3.35, 0], .1, materials.orange, .1);
    beamBetween(group, [.93, .72, 0], [.14, 3.35, 0], .1, materials.orange, .1);
    box(group, [.32, .22, .32], [-.93, .66, 0], materials.charcoal);
    box(group, [.32, .22, .32], [.93, .66, 0], materials.charcoal);
    box(group, [.72, .42, .08], [0, .73, .66], materials.dark);
    box(group, [.14, .14, .10], [.18, .73, .72], materials.cyan);
    group.rotation.y = -.18;
    return group;
  }
  
  function buildMedCache() {
    const group = new THREE.Group();
    box(group, [3.6, .24, 2.35], [0, .12, 0], materials.concrete);
    for (let i = 0; i < 5; i += 1) box(group, [3.45, .12, .28], [0, .29, -1 + i * .5], materials.charcoal);
    outlinedBox(group, [3.45, 2.35, 2.25], [0, 1.48, 0], materials.glass);
    box(group, [1.62, 1.02, 1.18], [-.78, .84, .18], materials.cyan, [0, -.08, 0]);
    box(group, [1.18, .78, 1.0], [.82, .72, -.36], materials.concreteLight, [0, .1, 0]);
    box(group, [1.26, .72, .92], [.58, 1.5, .22], materials.orange, [0, -.1, 0]);
    box(group, [.18, .72, .08], [-.78, .84, .79], materials.concreteLight);
    box(group, [.72, .18, .08], [-.78, .84, .80], materials.concreteLight);
    box(group, [1.48, .18, .10], [-.78, 1.57, .72], materials.acid);
    for (const x of [-1.6, 1.6]) for (const z of [-1.02, 1.02]) box(group, [.14, 2.55, .14], [x, 1.45, z], materials.charcoal);
    box(group, [3.4, .14, .14], [0, 2.72, 1.02], materials.charcoal);
    box(group, [3.4, .14, .14], [0, 2.72, -1.02], materials.charcoal);
    group.rotation.y = -.22;
    return group;
  }
  
  function buildTrolley() {
    const group = new THREE.Group();
    box(group, [3.0, .16, 1.65], [0, .72, 0], materials.charcoal, [0, 0, -.05]);
    box(group, [2.75, .82, .12], [0, 1.1, .78], materials.concrete, [0, 0, -.05]);
    box(group, [2.75, .82, .12], [0, 1.1, -.78], materials.concrete, [0, 0, -.05]);
    for (const x of [-1.35, 1.35]) box(group, [.12, .82, 1.52], [x, 1.1, 0], materials.concrete, [0, 0, -.05]);
    for (let i = 0; i < 6; i += 1) box(group, [.055, .65, 1.48], [-1.18 + i * .47, 1.1, 0], materials.charcoal, [0, 0, -.05]);
    box(group, [.12, 1.5, .12], [1.65, 1.72, .73], materials.charcoal, [0, 0, -.08]);
    box(group, [.12, 1.5, .12], [1.65, 1.72, -.73], materials.charcoal, [0, 0, -.08]);
    box(group, [.12, .12, 1.55], [1.58, 2.42, 0], materials.charcoal, [0, 0, -.08]);
    for (const x of [-1.1, 1.1]) for (const z of [-.82, .82]) {
      box(group, [.13, .45, .13], [x, .49, z], materials.charcoal);
      cylinder(group, [.25, .25], .15, 8, [x, .26, z], materials.rubber, [Math.PI / 2, 0, 0]);
      cylinder(group, [.1, .1], .18, 8, [x, .26, z], materials.concreteLight, [Math.PI / 2, 0, 0]);
    }
    box(group, [1.15, .72, 1.08], [-.62, 1.12, -.05], materials.yellow, [0, .2, -.08]);
    box(group, [.82, .52, .76], [.65, 1.04, .18], materials.orange, [0, -.18, .05]);
    box(group, [.62, .12, .5], [-1.45, .16, .24], materials.concreteLight, [0, .28, .12]);
    group.rotation.y = -.35;
    return group;
  }
  
  function buildEnforcer() {
    const group = new THREE.Group();
    box(group, [.7, 1.55, .72], [-.54, .92, 0], materials.charcoal, [0, 0, -.08]);
    box(group, [.7, 1.55, .72], [.54, .92, 0], materials.charcoal, [0, 0, .08]);
    box(group, [.88, .38, 1.02], [-.56, .2, .12], materials.rubber);
    box(group, [.88, .38, 1.02], [.56, .2, .12], materials.rubber);
    box(group, [1.55, .58, .85], [0, 1.78, 0], materials.dark);
    box(group, [2.05, 1.42, 1.0], [0, 2.65, 0], materials.concrete, [0, 0, -.02]);
    box(group, [1.62, .83, .18], [0, 2.72, .58], materials.charcoal);
    box(group, [1.12, .22, .10], [0, 2.82, .72], materials.orange);
    const head = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(.67, 1), materials.charcoal));
    head.name = 'enemyHead';
    head.position.set(0, 3.72, 0);
    head.scale.set(1, .92, .9);
    group.add(head);
    box(group, [1.02, .21, .16], [0, 3.78, .57], materials.red);
    box(group, [1.2, .18, .7], [0, 4.27, -.03], materials.dark, [0, 0, -.04]);
    for (const side of [-1, 1]) {
      box(group, [.65, .58, 1.0], [side * 1.18, 2.98, 0], materials.concreteLight, [0, 0, side * .16]);
      box(group, [.5, 1.18, .55], [side * 1.3, 2.2, .08], materials.charcoal, [0, 0, side * .22]);
      box(group, [.56, .55, .62], [side * 1.4, 1.56, .12], materials.rubber);
      box(group, [.20, .34, .18], [side * 1.2, 3.18, .58], side < 0 ? materials.red : materials.acid);
    }
    box(group, [2.58, .42, .5], [.18, 2.0, .84], materials.dark, [0, -.05, -.08]);
    box(group, [1.55, .24, .28], [1.92, 1.98, .84], materials.charcoal, [0, -.05, -.08]);
    cylinder(group, [.2, .26], .48, 8, [-1.1, 2.02, .84], materials.orange, [0, 0, Math.PI / 2]);
    box(group, [1.52, 1.72, .55], [0, 2.62, -.72], materials.dark);
    box(group, [.45, .68, .18], [0, 2.65, -1.02], materials.orange);
    group.rotation.y = -.12;
    return group;
  }
  
  function buildFacade() {
    const group = new THREE.Group();
    box(group, [5.8, .58, .72], [0, .29, 0], materials.concrete);
    box(group, [.72, 3.15, .72], [-2.55, 1.82, 0], materials.concreteLight, [0, 0, -.025]);
    box(group, [.72, 2.7, .72], [0, 1.58, 0], materials.concrete, [0, 0, .018]);
    box(group, [.72, 3.45, .72], [2.55, 1.98, 0], materials.concreteLight, [0, 0, .035]);
    box(group, [2.02, .55, .72], [-1.32, 3.0, 0], materials.concrete);
    box(group, [2.02, .55, .72], [1.32, 3.22, 0], materials.concreteLight, [0, 0, .03]);
    box(group, [1.85, .22, .18], [-1.3, .98, .42], materials.charcoal);
    box(group, [1.85, .22, .18], [1.3, 1.08, .42], materials.charcoal);
    for (const x of [-2.68, -1.9, -.34, .34, 1.9, 2.68]) box(group, [.12, .8, .12], [x, 3.62 - Math.abs(x) * .08, 0], materials.orange, [0, 0, (x % 1) * .18]);
    const rubblePieces = [[-2.75,.22,.75,.7],[-2.1,.16,.58,.5],[-.2,.18,.65,.55],[2.12,.17,.72,.55],[2.75,.2,.55,.62]];
    rubblePieces.forEach(([x, y, w, d], index) => box(group, [w, y * 2, d], [x, y, .45 + (index % 2) * .22], index % 2 ? materials.concrete : materials.concreteLight, [0, index * .13, index % 2 ? .12 : -.08]));
    box(group, [.9, .16, .09], [0, 2.25, .42], materials.yellow, [0, 0, -.06]);
    return group;
  }
  
  function buildTarpFence() {
    const group = new THREE.Group();
    for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) {
      box(group, [.14, 3.15, .14], [x, 1.55, 0], materials.charcoal, [0, 0, x * .008]);
      box(group, [.52, .16, .52], [x, .08, 0], materials.concrete);
    }
    box(group, [5.7, .1, .1], [0, .62, 0], materials.concrete);
    box(group, [5.7, .1, .1], [0, 2.85, 0], materials.concrete);
    for (let i = 0; i < 11; i += 1) {
      const x = -2.55 + i * .51;
      box(group, [.045, 2.35, .045], [x, 1.72, 0], materials.concrete, [0, 0, i % 2 ? .58 : -.58]);
    }
    box(group, [2.48, 1.45, .08], [-1.42, 1.86, .12], materials.blue, [0, 0, -.035]);
    box(group, [1.72, 1.08, .08], [1.82, 1.42, .12], materials.yellow, [0, 0, .055]);
    box(group, [.62, .82, .07], [.2, 2.18, .13], materials.orange, [0, 0, -.12]);
    for (const x of [-2.25, -.75, .75, 2.25]) box(group, [.18, .2, .18], [x, 3.2, 0], materials.red);
    group.rotation.y = -.08;
    return group;
  }
  
  function hescoCell(group, x, y, z, scale = 1) {
    const cell = outlinedBox(group, [1.42 * scale, 1.25 * scale, 1.05], [x, y, z], materials.sand);
    for (let i = -1; i <= 1; i += 1) box(cell, [.05, 1.08, .06], [i * .38, 0, .54], materials.charcoal, [0, 0, .04 * i]);
    return cell;
  }
  
  function buildHesco() {
    const group = new THREE.Group();
    for (let i = 0; i < 5; i += 1) hescoCell(group, -2.7 + i * 1.35, .63, 0, .96 + (i % 2) * .04);
    for (let i = 0; i < 3; i += 1) hescoCell(group, -1.35 + i * 1.35, 1.82, -.04, .96);
    box(group, [1.2, .14, 1.12], [2.4, 1.32, .05], materials.yellow, [0, .08, -.16]);
    for (let i = 0; i < 8; i += 1) box(group, [.07, .45 + (i % 3) * .12, .06], [-1.9 + i * .3, 2.55, -.12], materials.grass, [0, 0, -.25 + i * .07]);
    group.rotation.y = -.1;
    return group;
  }
  
  function buildScreenWall() {
    const group = new THREE.Group();
    for (const x of [-2.7, -1.35, 0, 1.35, 2.7]) box(group, [.15, 3.45, .15], [x, 1.7, 0], materials.charcoal);
    for (const y of [.45, 1.72, 3.05]) box(group, [5.55, .12, .12], [0, y, 0], materials.charcoal);
    for (let i = 0; i < 4; i += 1) box(group, [.09, 3.25, .09], [-2.05 + i * 1.36, 1.7, -.03], materials.concrete, [0, 0, i % 2 ? .42 : -.42]);
    box(group, [2.55, 2.34, .07], [-1.38, 1.73, .1], materials.blue, [0, 0, -.025]);
    box(group, [2.53, 2.34, .07], [1.37, 1.73, .1], materials.sand, [0, 0, .03]);
    box(group, [1.22, .26, .10], [1.38, 2.35, .19], materials.yellow, [0, 0, -.05]);
    for (const x of [-2.7, 2.7]) {
      box(group, [1.3, .12, .12], [x + (x < 0 ? .52 : -.52), .58, -.55], materials.charcoal, [0, 0, x < 0 ? -.74 : .74]);
      box(group, [.62, .12, .62], [x, .08, 0], materials.concrete);
    }
    return group;
  }
  
  function containerHalf(group, x, colorMaterial) {
    box(group, [2.28, 2.45, 2.15], [x, 1.23, 0], colorMaterial);
    for (let i = 0; i < 5; i += 1) box(group, [.09, 2.15, .10], [x - .82 + i * .41, 1.22, 1.11], materials.charcoal);
    box(group, [2.34, .15, 2.25], [x, 2.48, 0], materials.charcoal);
    box(group, [2.34, .15, 2.25], [x, .08, 0], materials.charcoal);
  }
  
  function buildCargoGate() {
    const group = new THREE.Group();
    containerHalf(group, -2.15, materials.orange);
    containerHalf(group, 2.15, materials.blue);
    box(group, [2.0, .18, 1.05], [0, 2.72, 0], materials.concrete);
    box(group, [5.1, .22, .28], [0, 3.12, 0], materials.yellow, [0, 0, -.02]);
    box(group, [.18, 1.0, .18], [-.9, 2.68, 0], materials.charcoal);
    box(group, [.18, 1.0, .18], [.9, 2.68, 0], materials.charcoal);
    for (const x of [-.52, 0, .52]) box(group, [.16, .42, .10], [x, 3.13, .2], x === 0 ? materials.red : materials.dark);
    box(group, [.58, .14, .72], [-.95, .12, .4], materials.concreteLight, [0, .22, .08]);
    box(group, [.82, .16, .55], [.9, .12, -.2], materials.concrete, [0, -.28, -.1]);
    group.rotation.y = -.08;
    return group;
  }
  
  function buildRoadblock() {
    const group = new THREE.Group();
    box(group, [4.3, 1.62, 2.05], [0, 1.1, 0], materials.concreteLight, [0, 0, -.02]);
    box(group, [1.5, 1.35, 2.02], [2.48, 1.04, 0], materials.concrete, [0, 0, -.08]);
    box(group, [1.16, .66, 2.06], [2.88, 1.78, 0], materials.glass, [0, 0, -.18]);
    box(group, [4.18, .22, 2.2], [-.03, 2.02, 0], materials.yellow, [0, 0, -.02]);
    for (const x of [-1.45, 1.2, 2.65]) for (const z of [-1.06, 1.06]) {
      cylinder(group, [.48, .48], .25, 10, [x, .45, z], materials.rubber, [Math.PI / 2, 0, 0]);
      cylinder(group, [.18, .18], .28, 10, [x, .45, z], materials.concrete, [Math.PI / 2, 0, 0]);
    }
    box(group, [1.55, .12, .10], [2.62, 1.42, 1.08], materials.red, [0, 0, -.08]);
    box(group, [1.4, .22, .42], [-.4, 2.31, 0], materials.charcoal);
    cylinder(group, [.18, .22], .26, 6, [-.78, 2.49, 0], materials.red);
    cylinder(group, [.18, .22], .26, 6, [-.02, 2.49, 0], materials.cyan);
    barrierModule(group, -2.8, 1.25, -.28);
    barrierModule(group, 2.5, -1.4, .2, .06);
    box(group, [1.5, .18, .08], [-.55, 1.12, 1.08], materials.orange, [0, 0, -.02]);
    group.rotation.y = -.2;
    return group;
  }
  
  function wallPillar(group, x, height, material = materials.concreteLight) {
    box(group, [.48, height, .94], [x, height / 2, 0], material);
    box(group, [.66, .18, 1.06], [x, height + .05, 0], materials.charcoal);
  }
  
  function buildConcreteWall() {
    const group = new THREE.Group();
    box(group, [6.2, 2.75, .7], [0, 1.38, 0], materials.concrete);
    box(group, [6.45, .28, .92], [0, .14, 0], materials.charcoal);
    box(group, [6.35, .22, .9], [0, 2.82, 0], materials.yellow);
    for (const x of [-3.05, 0, 3.05]) wallPillar(group, x, 3.12);
    for (const x of [-1.52, 1.52]) {
      box(group, [2.18, 1.55, .12], [x, 1.52, .42], materials.concreteLight);
      box(group, [1.62, .16, .08], [x, 2.1, .5], materials.dark);
      for (let i = 0; i < 4; i += 1) box(group, [.28, .14, .09], [x - .54 + i * .36, .62, .5], i % 2 ? materials.dark : materials.yellow, [0, 0, -.1]);
    }
    for (const x of [-2.45, 2.45]) {
      box(group, [.34, .42, .18], [x, 2.55, .5], materials.charcoal);
      box(group, [.22, .25, .08], [x, 2.51, .62], materials.red);
    }
    box(group, [1.18, .44, .12], [0, 2.28, .5], materials.yellow);
    box(group, [.82, .11, .08], [0, 2.28, .58], materials.dark);
    return group;
  }
  
  function buildServiceWall() {
    const group = new THREE.Group();
    box(group, [6.3, 3.0, .78], [0, 1.5, 0], materials.charcoal);
    box(group, [6.0, 2.55, .12], [0, 1.47, .45], materials.blue);
    for (let i = 0; i < 13; i += 1) box(group, [.09, 2.48, .1], [-2.76 + i * .46, 1.48, .55], i % 4 === 0 ? materials.concrete : materials.charcoal);
    wallPillar(group, -3.08, 3.2, materials.charcoal);
    wallPillar(group, 3.08, 3.2, materials.charcoal);
    cylinder(group, [.13, .13], 2.45, 8, [-2.12, 1.38, .72], materials.orange);
    cylinder(group, [.13, .13], 2.45, 8, [-1.72, 1.38, .72], materials.concreteLight);
    cylinder(group, [.11, .11], 2.25, 8, [1.78, 2.34, .7], materials.yellow, [0, 0, Math.PI / 2]);
    box(group, [1.28, .86, .28], [.95, 1.55, .62], materials.dark);
    for (let i = 0; i < 5; i += 1) box(group, [.92, .055, .08], [.95, 1.3 + i * .13, .79], materials.concreteLight);
    box(group, [.54, .72, .24], [2.35, .72, .62], materials.orange);
    box(group, [.22, .22, .08], [2.35, .82, .79], materials.acid);
    box(group, [2.2, .14, .16], [-.55, 2.86, .64], materials.concrete);
    return group;
  }
  
  function buildCivicWall() {
    const group = new THREE.Group();
    box(group, [6.35, 2.85, .74], [0, 1.43, 0], materials.concreteLight);
    box(group, [6.5, .32, .98], [0, .16, 0], materials.concrete);
    for (const x of [-3.08, -1.03, 1.03, 3.08]) wallPillar(group, x, 3.05, materials.concrete);
    box(group, [1.62, 1.05, .1], [-2.02, 1.62, .43], materials.blue, [0, 0, -.025]);
    box(group, [1.64, 1.05, .1], [0, 1.62, .43], materials.yellow, [0, 0, .018]);
    box(group, [1.62, 1.05, .1], [2.03, 1.62, .43], materials.orange, [0, 0, -.018]);
    box(group, [.95, .14, .08], [-2.02, 1.62, .51], materials.concreteLight, [0, 0, .23]);
    box(group, [.95, .14, .08], [0, 1.62, .51], materials.dark, [0, 0, -.18]);
    box(group, [.95, .14, .08], [2.03, 1.62, .51], materials.yellow, [0, 0, .2]);
    box(group, [.72, .92, .08], [-.52, .82, .45], materials.sand, [0, 0, -.06]);
    box(group, [.58, .74, .08], [.37, .9, .45], materials.concreteLight, [0, 0, .08]);
    for (const [x, y, angle] of [[-2.72,2.45,.55],[-1.15,.62,-.42],[1.22,2.38,-.62],[2.7,.78,.48]]) box(group, [.06, .78, .07], [x, y, .48], materials.dark, [0, 0, angle]);
    box(group, [6.42, .18, .92], [0, 2.93, 0], materials.charcoal);
    return group;
  }
  
  function buildRetainingWall() {
    const group = new THREE.Group();
    box(group, [6.45, 1.25, 1.34], [0, .63, -.05], materials.concrete);
    box(group, [6.25, 1.05, 1.08], [0, 1.75, -.12], materials.concreteLight);
    box(group, [6.0, .82, .86], [0, 2.68, -.2], materials.concrete);
    box(group, [6.62, .24, 1.55], [0, .12, 0], materials.charcoal);
    for (const x of [-2.72, -1.36, 0, 1.36, 2.72]) {
      box(group, [.36, 2.55, 1.0], [x, 1.28, .18], materials.concreteLight, [-.1, 0, 0]);
      cylinder(group, [.13, .13], .34, 8, [x + .48, .62, .78], materials.dark, [Math.PI / 2, 0, 0]);
    }
    for (let i = 0; i < 13; i += 1) box(group, [.08, .62 + (i % 4) * .13, .07], [-2.78 + i * .46, 3.42, -.18 + (i % 2) * .18], materials.grass, [0, 0, -.28 + i * .04]);
    box(group, [1.25, .22, .08], [1.62, 2.42, .48], materials.yellow, [0, 0, -.05]);
    return group;
  }
  
  function buildClinicWall() {
    const group = new THREE.Group();
    box(group, [6.4, 2.9, .72], [0, 1.45, 0], materials.concreteLight);
    box(group, [6.5, .34, .96], [0, .17, 0], materials.blue);
    for (const x of [-3.1, -1.03, 1.03, 3.1]) wallPillar(group, x, 3.14, materials.concreteLight);
    for (const x of [-2.05, 0, 2.05]) {
      box(group, [1.42, .82, .14], [x, 1.78, .44], materials.glass);
      box(group, [1.55, .12, .1], [x, 1.31, .48], materials.cyan);
      box(group, [1.55, .12, .1], [x, 2.25, .48], materials.cyan);
    }
    box(group, [1.26, .82, .14], [0, .74, .44], materials.blue);
    box(group, [.18, .58, .09], [0, .74, .54], materials.concreteLight);
    box(group, [.58, .18, .09], [0, .74, .55], materials.concreteLight);
    for (const x of [-2.58, 2.58]) {
      box(group, [.52, .24, .18], [x, 2.72, .5], materials.charcoal);
      box(group, [.38, .12, .08], [x, 2.64, .64], materials.acid);
    }
    box(group, [6.42, .16, .88], [0, 2.98, 0], materials.cyan);
    return group;
  }
  
  function buildFortWall() {
    const group = new THREE.Group();
    box(group, [6.35, 3.15, .9], [0, 1.58, -.08], materials.concrete);
    box(group, [6.62, .32, 1.28], [0, .16, .05], materials.charcoal);
    for (const x of [-3.0, -1.5, 0, 1.5, 3.0]) {
      box(group, [.52, 2.65, 1.28], [x, 1.28, .3], materials.concreteLight, [-.13, 0, 0]);
      box(group, [.68, .26, 1.42], [x, .2, .42], materials.charcoal);
    }
    for (const x of [-2.22, -.74, .74, 2.22]) box(group, [.82, .24, .12], [x, 2.35, .51], materials.dark);
    box(group, [6.42, .24, 1.05], [0, 3.22, 0], materials.yellow);
    for (const x of [-2.55, -1.25, 0, 1.25, 2.55]) {
      box(group, [.62, .62, .82], [x, 3.52, 0], materials.concrete, [0, 0, x % 1 ? .04 : -.04]);
      box(group, [.5, .14, .1], [x, 3.55, .47], materials.orange);
    }
    box(group, [1.45, .42, .12], [0, 1.58, .54], materials.yellow);
    for (let i = 0; i < 4; i += 1) box(group, [.25, .31, .08], [-.46 + i * .31, 1.58, .62], i % 2 ? materials.dark : materials.yellow, [0, 0, -.12]);
    return group;
  }
  
  function buildingWindow(group, x, y, z, width = .9, height = .72, accent = materials.cyan) {
    box(group, [width + .14, height + .14, .12], [x, y, z], materials.charcoal);
    box(group, [width, height, .08], [x, y, z + .08], materials.glass);
    box(group, [width, .08, .06], [x, y - height / 2 - .1, z + .12], accent);
  }
  
  function sideWindow(group, x, y, z, width = .9, height = .72, accent = materials.cyan, facing = 1) {
    box(group, [.12, height + .14, width + .14], [x, y, z], materials.charcoal);
    box(group, [.08, height, width], [x + .08 * facing, y, z], materials.glass);
    box(group, [.06, .08, width], [x + .12 * facing, y - height / 2 - .1, z], accent);
  }
  
  function buildClinic() {
    const group = new THREE.Group();
    box(group, [5.8, 3.15, 3.7], [0, 1.58, 0], materials.plaster);
    box(group, [6.05, .26, 3.95], [0, .13, 0], materials.blue);
    box(group, [6.15, .28, 4.08], [0, 3.22, 0], materials.cyan);
    buildingWindow(group, -1.8, 1.9, 1.91, 1.2, .8);
    buildingWindow(group, 1.8, 1.9, 1.91, 1.2, .8);
    box(group, [1.25, 2.05, .18], [0, 1.18, 1.94], materials.blue);
    box(group, [.72, .34, .12], [0, 1.45, 2.07], materials.glass);
    box(group, [2.05, .22, 1.05], [0, 2.48, 2.22], materials.yellow, [-.1, 0, 0]);
    box(group, [1.35, .92, .16], [0, 3.05, 2.03], materials.blue);
    box(group, [.19, .66, .08], [0, 3.05, 2.14], materials.plaster);
    box(group, [.66, .19, .08], [0, 3.05, 2.15], materials.plaster);
    box(group, [1.52, .68, .82], [-1.82, 3.67, -.65], materials.charcoal);
    for (let i = 0; i < 5; i += 1) box(group, [1.12, .06, .08], [-1.82, 3.48 + i * .1, -.22], materials.concreteLight);
    cylinder(group, [.16, .16], 1.05, 8, [2.22, 3.78, -.65], materials.charcoal);
    cylinder(group, [.36, .36], .22, 10, [2.22, 4.28, -.65], materials.orange);
    group.rotation.y = -.2;
    return group;
  }
  
  function buildWarehouse() {
    const group = new THREE.Group();
    box(group, [6.3, 3.25, 4.0], [0, 1.63, 0], materials.charcoal);
    box(group, [5.82, 2.88, .12], [0, 1.58, 2.05], materials.blue);
    for (let i = 0; i < 12; i += 1) box(group, [.08, 2.7, .08], [-2.53 + i * .46, 1.57, 2.13], i % 4 ? materials.charcoal : materials.concrete);
    box(group, [.26, 2.98, .24], [-2.87, 1.58, 2.08], materials.concrete);
    box(group, [.26, 2.98, .24], [2.87, 1.58, 2.08], materials.concrete);
    box(group, [5.86, .2, .22], [0, 3.02, 2.08], materials.charcoal);
    box(group, [3.35, 2.42, .16], [-.82, 1.28, 2.14], materials.dark);
    for (let i = 0; i < 7; i += 1) box(group, [3.05, .07, .06], [-.82, .32 + i * .34, 2.25], materials.concreteLight);
    box(group, [1.15, 2.0, .14], [2.15, 1.1, 2.14], materials.orange);
    box(group, [.55, .25, .08], [2.15, 1.35, 2.25], materials.acid);
    box(group, [.28, 3.5, .35], [0, 1.72, 2.0], materials.concrete);
    box(group, [6.7, .3, 4.35], [0, 3.35, 0], materials.yellow, [0, 0, -.025]);
    for (const x of [-1.9, 0, 1.9]) {
      box(group, [1.22, .28, .78], [x, 3.68, -.4], materials.concreteLight);
      cylinder(group, [.16, .2], .42, 8, [x, 4.0, -.4], materials.charcoal);
    }
    group.rotation.y = -.18;
    return group;
  }
  
  function buildApartment() {
    const group = new THREE.Group();
    box(group, [5.2, 4.8, 1.0], [0, 2.4, -.8], materials.concreteLight);
    box(group, [1.0, 4.25, 4.2], [-2.1, 2.13, .75], materials.concrete);
    box(group, [5.45, .28, 1.3], [0, .14, -.75], materials.charcoal);
    for (const y of [1.28, 3.18]) for (const x of [-1.25, .25, 1.75]) buildingWindow(group, x, y, -.26, .78, .82, y > 2 ? materials.orange : materials.yellow);
    for (const y of [1.2, 3.05]) for (const z of [.15, 1.72]) sideWindow(group, -1.55, y, z, .72, .78, materials.orange, 1);
    box(group, [1.45, .18, 1.1], [1.35, 2.42, -.05], materials.concrete, [-.08, 0, 0]);
    box(group, [.13, .95, .13], [.75, 2.78, .38], materials.charcoal);
    box(group, [.13, .95, .13], [1.95, 2.78, .38], materials.charcoal);
    box(group, [1.34, .12, .12], [1.35, 3.2, .38], materials.charcoal);
    for (const x of [-2.48, -1.1, .1, 1.2, 2.25]) box(group, [.32, .75 + (Math.abs(x) % 2) * .45, .72], [x, 5.05, -.8], materials.concrete, [0, 0, x * .04]);
    box(group, [.72, .18, .65], [2.05, .14, .35], materials.orange, [0, .25, -.08]);
    box(group, [.55, .15, .5], [1.35, .12, .65], materials.concreteLight, [0, -.3, .12]);
    group.rotation.y = -.35;
    return group;
  }
  
  function buildGuardBooth() {
    const group = new THREE.Group();
    box(group, [3.25, 2.65, 2.75], [0, 1.34, 0], materials.charcoal);
    box(group, [3.0, 1.25, .12], [0, 1.82, 1.44], materials.glass);
    sideWindow(group, -1.69, 1.82, .25, 1.0, 1.02, materials.yellow, -1);
    sideWindow(group, 1.69, 1.82, .25, 1.0, 1.02, materials.yellow, 1);
    box(group, [1.0, 2.02, .15], [0, 1.08, 1.45], materials.orange);
    box(group, [.52, .28, .08], [0, 1.4, 1.56], materials.dark);
    box(group, [3.75, .3, 3.22], [0, 2.78, 0], materials.yellow, [0, 0, -.035]);
    box(group, [1.35, .4, .16], [0, 3.02, 1.48], materials.dark);
    cylinder(group, [.2, .25], .28, 6, [-1.25, 3.13, 0], materials.red);
    cylinder(group, [.2, .25], .28, 6, [1.25, 3.13, 0], materials.acid);
    box(group, [3.65, .26, 3.05], [0, .13, 0], materials.concrete);
    box(group, [3.75, .16, .16], [3.08, .95, 1.18], materials.yellow, [0, 0, -.12]);
    box(group, [.18, 1.65, .18], [1.25, .82, 1.18], materials.charcoal);
    group.rotation.y = -.24;
    return group;
  }
  
  function buildCornerShop() {
    const group = new THREE.Group();
    box(group, [5.45, 3.25, 3.55], [0, 1.63, 0], materials.sand);
    box(group, [5.68, .28, 3.8], [0, .14, 0], materials.charcoal);
    box(group, [5.72, .32, 3.85], [0, 3.35, 0], materials.orange);
    box(group, [3.05, 2.05, .14], [-.85, 1.25, 1.84], materials.dark);
    for (let i = 0; i < 8; i += 1) box(group, [2.8, .07, .06], [-.85, .38 + i * .23, 1.95], materials.concreteLight);
    box(group, [1.15, 2.08, .14], [1.85, 1.12, 1.84], materials.blue);
    buildingWindow(group, 2.73, 2.0, .25, .8, 1.0, materials.yellow);
    box(group, [4.7, .22, 1.28], [-.1, 2.56, 2.15], materials.yellow, [-.12, 0, 0]);
    for (let i = 0; i < 6; i += 1) box(group, [.36, .16, 1.3], [-2.0 + i * .75, 2.56, 2.2], i % 2 ? materials.yellow : materials.orange, [-.12, 0, 0]);
    box(group, [2.75, .66, .16], [-.5, 3.05, 1.86], materials.blue);
    box(group, [1.95, .1, .08], [-.5, 3.05, 1.96], materials.acid);
    box(group, [.58, .72, .56], [-2.2, .45, 2.05], materials.orange, [0, .2, 0]);
    group.rotation.y = -.28;
    return group;
  }
  
  function branch(group, start, end, radius, material = materials.bark) {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const direction = endPoint.clone().sub(startPoint);
    const length = direction.length();
    const mesh = finish(new THREE.Mesh(new THREE.CylinderGeometry(radius * .72, radius, length, 6), material));
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(mesh);
    return mesh;
  }
  
  function foliage(group, position, scale, material = materials.leafA) {
    const blob = finish(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material));
    blob.position.set(...position);
    blob.scale.set(...scale);
    blob.rotation.set(position[1] * .12, position[0] * .18, position[2] * .14);
    group.add(blob);
    return blob;
  }
  
  function buildBroadleaf() {
    const group = new THREE.Group();
    cylinder(group, [.36, .55], 3.45, 7, [0, 1.72, 0], materials.bark);
    branch(group, [-.04, 2.85, 0], [-1.2, 4.18, .02], .24);
    branch(group, [.04, 2.92, .05], [1.22, 4.08, .15], .22);
    branch(group, [0, 3.28, -.04], [.12, 4.48, -.58], .18);
    foliage(group, [-1.2, 4.25, 0], [1.45, 1.12, 1.2], materials.leafA);
    foliage(group, [.18, 4.72, -.28], [1.55, 1.28, 1.3], materials.leafB);
    foliage(group, [1.24, 4.14, .14], [1.35, 1.08, 1.2], materials.leafA);
    foliage(group, [.18, 3.9, .68], [1.35, .95, 1.0], materials.leafB);
    box(group, [1.15, .2, .82], [-.25, .1, .18], materials.concrete, [0, .3, .08]);
    return group;
  }
  
  function pineTree(group, x, z, scale = 1) {
    cylinder(group, [.18 * scale, .28 * scale], 3.8 * scale, 6, [x, 1.9 * scale, z], materials.bark);
    for (let i = 0; i < 4; i += 1) {
      const cone = finish(new THREE.Mesh(new THREE.ConeGeometry((1.45 - i * .19) * scale, 2.05 * scale, 7), i % 2 ? materials.leafA : materials.leafB));
      cone.position.set(x, (2.55 + i * .72) * scale, z);
      cone.rotation.y = i * .48;
      group.add(cone);
    }
  }
  
  function buildPine() {
    const group = new THREE.Group();
    pineTree(group, -.95, .2, 1);
    pineTree(group, 1.15, -.4, .78);
    pineTree(group, .35, 1.15, .58);
    box(group, [1.0, .18, .7], [-1.35, .1, -.55], materials.concrete, [0, .3, .08]);
    box(group, [.72, .15, .52], [.85, .08, .85], materials.concreteLight, [0, -.2, -.05]);
    return group;
  }
  
  function buildDeadTree() {
    const group = new THREE.Group();
    cylinder(group, [.32, .58], 4.25, 6, [0, 2.1, 0], materials.bark, [0, 0, -.08]);
    branch(group, [-.04, 2.72, 0], [-1.42, 4.02, .08], .24);
    branch(group, [.03, 2.58, .02], [1.42, 3.78, -.05], .22);
    branch(group, [-1.05, 3.68, .06], [-1.92, 4.7, .12], .15);
    branch(group, [1.05, 3.46, -.03], [1.92, 4.25, -.1], .14);
    branch(group, [.02, 3.58, -.03], [.18, 4.72, -.62], .16);
    foliage(group, [-1.92, 4.7, .12], [.5, .38, .42], materials.leafDry);
    foliage(group, [1.92, 4.25, -.1], [.45, .32, .38], materials.leafDry);
    for (const x of [-.62, .55, 1.1]) box(group, [.48, .18, .4], [x, .1, x * .3], materials.concrete, [0, x, .08]);
    return group;
  }
  
  function buildBentTree() {
    const group = new THREE.Group();
    branch(group, [0, 0, 0], [-.58, 2.45, 0], .46);
    branch(group, [-.58, 2.45, 0], [-1.75, 4.18, .02], .35);
    branch(group, [-1.28, 3.48, .02], [-2.72, 4.48, .2], .21);
    branch(group, [-1.1, 3.22, -.04], [-1.82, 4.42, -.66], .18);
    foliage(group, [-2.72, 4.5, .2], [1.35, .92, 1.05], materials.leafA);
    foliage(group, [-1.75, 4.55, -.35], [1.2, .85, .95], materials.leafB);
    foliage(group, [-3.38, 4.22, -.12], [.9, .7, .8], materials.leafB);
    box(group, [1.42, .24, 1.05], [.15, .12, 0], materials.concrete, [0, -.22, 0]);
    return group;
  }
  
  function buildStreetTree() {
    const group = new THREE.Group();
    box(group, [3.3, .85, 2.65], [0, .43, 0], materials.concreteLight);
    box(group, [2.65, .22, 2.0], [0, .88, 0], materials.sand);
    cylinder(group, [.3, .46], 3.1, 7, [0, 2.35, 0], materials.bark);
    branch(group, [-.02, 3.18, .02], [-.94, 4.26, .06], .2);
    branch(group, [.02, 3.18, -.02], [.94, 4.26, -.06], .2);
    foliage(group, [-.94, 4.28, .06], [1.0, .85, .9], materials.leafA);
    foliage(group, [.94, 4.28, -.06], [1.0, .85, .9], materials.leafB);
    foliage(group, [0, 4.72, 0], [1.2, .92, 1.0], materials.leafA);
    for (const x of [-1.1, -.72, .68, 1.08]) box(group, [.08, .48 + Math.abs(x) * .12, .06], [x, 1.08, .45 - Math.abs(x) * .12], materials.grass, [0, 0, x * .18]);
    box(group, [1.0, .34, .12], [0, .48, 1.38], materials.yellow);
    box(group, [.65, .08, .08], [0, .48, 1.46], materials.dark);
    return group;
  }
  
  function buildRoadCurb() {
    const group = new THREE.Group();
    box(group, [6.4, .18, 4.3], [0, .09, 0], materials.asphalt);
    box(group, [6.4, .34, .72], [0, .17, -1.78], materials.concreteLight);
    box(group, [6.4, .18, .18], [0, .28, -1.38], materials.white);
    for (const x of [-2.1, 0, 2.1]) box(group, [1.15, .035, .16], [x, .19, .4], materials.yellow);
    box(group, [1.08, .05, .5], [1.72, .2, -1.38], materials.dark);
    for (let i = 0; i < 6; i += 1) box(group, [.08, .06, .42], [1.28 + i * .17, .24, -1.38], materials.metal);
    cylinder(group, [.46, .46], .05, 12, [-1.75, .2, .65], materials.metal);
    cylinder(group, [.3, .3], .06, 12, [-1.75, .23, .65], materials.dark);
    return group;
  }
  
  function buildSidewalk() {
    const group = new THREE.Group();
    box(group, [5.8, .34, 1.55], [0, .17, -1.75], materials.concreteLight);
    box(group, [1.55, .34, 4.6], [-2.12, .17, .55], materials.concreteLight);
    box(group, [5.9, .22, .18], [0, .18, -.94], materials.white);
    box(group, [.18, .22, 4.7], [-1.3, .18, .55], materials.white);
    for (let i = 0; i < 5; i += 1) box(group, [.04, .05, 1.42], [-2.8 + i * 1.15, .36, -1.75], materials.concrete);
    for (let i = 0; i < 4; i += 1) box(group, [1.42, .05, .04], [-2.12, .36, -.9 + i * 1.12], materials.concrete);
    cylinder(group, [.15, .2], 1.08, 8, [1.75, .55, -1.72], materials.orange);
    box(group, [.58, .12, .42], [2.35, .08, -.55], materials.concrete, [0, .28, .08]);
    return group;
  }
  
  function buildDrainage() {
    const group = new THREE.Group();
    box(group, [6.2, .28, 1.0], [0, .14, 0], materials.concrete);
    box(group, [5.7, .18, .46], [0, .22, 0], materials.dark);
    box(group, [6.2, .22, .18], [0, .25, -.55], materials.concreteLight);
    box(group, [6.2, .22, .18], [0, .25, .55], materials.concreteLight);
    for (let i = 0; i < 14; i += 1) box(group, [.07, .08, .72], [-2.7 + i * .42, .36, 0], materials.metal);
    cylinder(group, [.34, .34], .22, 10, [-2.65, .18, 0], materials.dark, [0, 0, Math.PI / 2]);
    cylinder(group, [.34, .34], .22, 10, [2.65, .18, 0], materials.dark, [0, 0, Math.PI / 2]);
    box(group, [.7, .12, .46], [1.45, .41, 0], materials.yellow);
    return group;
  }
  
  function buildRoadDamage() {
    const group = new THREE.Group();
    box(group, [6.1, .16, 4.1], [0, .08, 0], materials.asphalt);
    const crater = finish(new THREE.Mesh(new THREE.TorusGeometry(1.15, .28, 5, 12), materials.concrete));
    crater.rotation.x = Math.PI / 2;
    crater.position.set(-.65, .2, .2);
    crater.scale.set(1.25, .82, 1);
    group.add(crater);
    cylinder(group, [.78, .98], .12, 10, [-.65, .08, .2], materials.dark);
    const debris = [[-2.1,.36,.48,-.2],[-1.6,.48,.34,.3],[.65,.58,.42,-.3],[1.42,.42,.62,.22],[2.15,.7,.38,-.18]];
    debris.forEach(([x, w, d, r], index) => box(group, [w, .18 + index % 2 * .1, d], [x, .22, .15 + index % 3 * .52], index % 2 ? materials.concreteLight : materials.concrete, [0, r, index % 2 ? .12 : -.08]));
    box(group, [2.2, .04, .16], [1.62, .18, -1.0], materials.yellow, [0, .08, 0]);
    return group;
  }
  
  function buildStairs() {
    const group = new THREE.Group();
    const steps = 8;
    for (let i = 0; i < steps; i += 1) box(group, [2.65, .28, .55], [0, .14 + i * .27, 1.85 - i * .48], i % 2 ? materials.concrete : materials.concreteLight);
    box(group, [3.05, .28, 1.35], [0, 2.16, -1.9], materials.concreteLight);
    for (const x of [-1.42, 1.42]) {
      beamBetween(group, [x, .2, 2.08], [x, 2.48, -1.35], .11, materials.charcoal);
      box(group, [.13, 2.05, .13], [x, 1.2, -1.72], materials.charcoal);
      box(group, [.42, .14, .42], [x, .07, 2.08], materials.concrete);
    }
    box(group, [2.9, .14, .14], [0, 2.48, -1.35], materials.charcoal);
    return group;
  }
  
  function buildLoadingRamp() {
    const group = new THREE.Group();
    const rampAngle = .42;
    const rampCenterY = 1.15;
    const rampCenterZ = .2;
    const rampSurfaceY = (z) => rampCenterY - Math.sin(rampAngle) * (z - rampCenterZ) + .15;
  
    box(group, [3.6, .2, 1.25], [0, .1, 2.72], materials.charcoal);
    box(group, [3.1, .28, 4.8], [0, rampCenterY, rampCenterZ], materials.concreteLight, [rampAngle, 0, 0]);
    box(group, [3.6, .32, 1.65], [0, 2.08, -2.45], materials.concrete);
    for (const x of [-1.48, 1.48]) {
      for (const z of [-2.82, -2.08]) box(group, [.16, 1.92, .16], [x, .96, z], materials.charcoal);
      beamBetween(group, [x, 1.15, 2.35], [x, 3.08, -1.9], .1, materials.yellow);
      for (const z of [2.2, .25, -1.7]) {
        const bottom = rampSurfaceY(z);
        const top = bottom + .82;
        box(group, [.11, top - bottom, .11], [x, (bottom + top) / 2, z], materials.charcoal);
      }
    }
    for (let i = 0; i < 7; i += 1) {
      const z = 1.85 - i * .54;
      box(group, [2.65, .045, .09], [0, rampSurfaceY(z) + .04, z], materials.charcoal, [rampAngle, 0, 0]);
    }
    box(group, [3.18, .12, .2], [0, 2.24, -1.72], materials.yellow);
    return group;
  }
  
  function buildCatwalk() {
    const group = new THREE.Group();
    box(group, [5.8, .22, 1.5], [0, 2.25, 0], materials.metal);
    for (let i = 0; i < 12; i += 1) box(group, [.08, .05, 1.32], [-2.55 + i * .47, 2.39, 0], materials.charcoal);
    for (const x of [-2.5, 0, 2.5]) {
      box(group, [.18, 2.25, .18], [x, 1.12, -.55], materials.charcoal);
      box(group, [.18, 2.25, .18], [x, 1.12, .55], materials.charcoal);
    }
    for (const z of [-.72, .72]) {
      box(group, [5.7, .1, .1], [0, 3.18, z], materials.yellow);
      for (const x of [-2.65,-1.3,0,1.3,2.65]) box(group, [.1, 1.0, .1], [x, 2.72, z], materials.charcoal);
    }
    return group;
  }
  
  function buildFootbridge() {
    const group = new THREE.Group();
    box(group, [5.8, .28, 1.7], [0, 1.35, 0], materials.concreteLight);
    box(group, [2.35, .26, 1.7], [-3.94, .7, 0], materials.concrete, [0, 0, .5]);
    box(group, [2.35, .26, 1.7], [3.94, .7, 0], materials.concrete, [0, 0, -.5]);
    box(group, [1.1, .18, 1.95], [-5.0, .09, 0], materials.charcoal);
    box(group, [1.1, .18, 1.95], [5.0, .09, 0], materials.charcoal);
    for (const x of [-2.55, 2.55]) for (const z of [-.66, .66]) {
      box(group, [.16, 1.2, .16], [x, .6, z], materials.charcoal);
    }
    for (const z of [-.8, .8]) {
      box(group, [5.8, .11, .11], [0, 2.28, z], materials.yellow);
      box(group, [5.8, .09, .12], [0, 1.53, z], materials.yellow);
      for (const x of [-2.7, -1.35, 0, 1.35, 2.7]) {
        box(group, [.1, .86, .1], [x, 1.86, z], materials.charcoal);
      }
    }
    return group;
  }
  
  function buildLadderPlatform() {
    const group = new THREE.Group();
    box(group, [3.35, .24, 2.2], [0, 3.05, 0], materials.metal);
    for (const x of [-1.45, 1.45]) for (const z of [-.85, .85]) box(group, [.16, 3.0, .16], [x, 1.5, z], materials.charcoal);
    box(group, [.13, 3.15, .13], [-1.0, 1.55, 1.18], materials.yellow);
    box(group, [.13, 3.15, .13], [-.35, 1.55, 1.18], materials.yellow);
    for (let i = 0; i < 8; i += 1) box(group, [.72, .08, .1], [-.67, .3 + i * .38, 1.18], materials.concreteLight);
    for (const z of [-1.05, 1.05]) box(group, [3.3, .1, .1], [0, 3.9, z], materials.yellow);
    for (const x of [-1.58, 0, 1.58]) for (const z of [-1.05,1.05]) box(group, [.1, .85, .1], [x, 3.5, z], materials.charcoal);
    return group;
  }
  
  function buildReinforcementDoor() {
    const group = new THREE.Group();
    box(group, [5.4, 3.7, .72], [0, 1.85, 0], materials.concrete);
    box(group, [3.65, 3.05, .18], [0, 1.55, .46], materials.dark);
    box(group, [1.72, 2.78, .16], [-.9, 1.52, .58], materials.charcoal);
    box(group, [1.72, 2.78, .16], [.9, 1.52, .58], materials.charcoal);
    for (const x of [-1.72,0,1.72]) box(group, [.16, 3.18, .28], [x, 1.62, .58], materials.metal);
    box(group, [3.9, .34, .48], [0, 3.35, .42], materials.yellow);
    box(group, [1.45, .45, .1], [0, 3.35, .7], materials.dark);
    for (const x of [-2.1, 2.1]) {
      box(group, [.38, .55, .22], [x, 2.65, .55], materials.charcoal);
      box(group, [.24, .3, .08], [x, 2.63, .7], materials.red);
    }
    box(group, [4.05, .18, 1.15], [0, .09, .28], materials.concreteLight);
    return group;
  }
  
  function buildShutter() {
    const group = new THREE.Group();
    box(group, [5.65, 3.65, .76], [0, 1.82, 0], materials.concreteLight);
    box(group, [4.25, 2.85, .16], [0, 1.5, .47], materials.dark);
    for (let i = 0; i < 12; i += 1) box(group, [4.0, .13, .08], [0, .22 + i * .23, .6], i % 3 ? materials.metal : materials.charcoal);
    box(group, [4.65, .62, .82], [0, 3.34, .18], materials.yellow);
    cylinder(group, [.32, .32], 4.3, 12, [0, 3.33, .5], materials.charcoal, [0, 0, Math.PI / 2]);
    box(group, [.65, .82, .34], [2.45, 2.75, .48], materials.orange);
    box(group, [.22, .22, .08], [2.45, 2.86, .69], materials.acid);
    box(group, [4.55, .18, 1.0], [0, .09, .3], materials.concrete);
    return group;
  }
  
  function buildFloorHatch() {
    const group = new THREE.Group();
    box(group, [4.8, .2, 4.2], [0, .1, 0], materials.asphalt);
    const rim = finish(new THREE.Mesh(new THREE.TorusGeometry(1.25, .18, 6, 12), materials.metal));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = .22;
    group.add(rim);
    cylinder(group, [1.05, 1.05], .14, 12, [0, .17, 0], materials.dark);
    cylinder(group, [1.08, 1.08], .16, 12, [0, 1.28, -1.03], materials.concrete, [Math.PI / 2, 0, 0]);
    for (const x of [-.62, .62]) cylinder(group, [.13, .13], .45, 8, [x, .38, -.98], materials.orange, [0, 0, Math.PI / 2]);
    for (const x of [-.34, .34]) box(group, [.1, .48, .1], [x, 1.28, -.92], materials.yellow);
    box(group, [.78, .1, .1], [0, 1.49, -.92], materials.yellow);
    for (const [x, z] of [[-.86,0],[.86,0],[0,-.86],[0,.86]]) {
      cylinder(group, [.065, .065], .08, 8, [x, .34, z], materials.metal);
    }
    return group;
  }
  
  function buildBreachVent() {
    const group = new THREE.Group();
    box(group, [5.2, 3.45, .72], [0, 1.72, 0], materials.concrete);
    box(group, [2.45, 1.65, .3], [0, 1.55, .52], materials.dark);
    box(group, [2.68, .22, .5], [0, .68, .48], materials.metal);
    box(group, [2.68, .22, .5], [0, 2.42, .48], materials.metal);
    box(group, [.22, 1.95, .5], [-1.35, 1.55, .48], materials.metal);
    box(group, [.22, 1.95, .5], [1.35, 1.55, .48], materials.metal);
    for (let i = 0; i < 7; i += 1) beamBetween(group, [-1.1 + i * .36, .78, .76], [-.68 + i * .36, 2.3, .76], .07, materials.charcoal, .08);
    box(group, [1.3, .14, .12], [1.75, 2.75, .52], materials.yellow, [0, 0, -.08]);
    box(group, [.68, .22, .58], [-1.65, .16, .52], materials.concreteLight, [0, .32, .12]);
    box(group, [.52, .18, .44], [1.58, .13, .65], materials.concrete, [0, -.25, -.08]);
    return group;
  }
  
  function buildCargoLift() {
    const group = new THREE.Group();
    box(group, [4.5, .32, 3.15], [0, .16, 0], materials.yellow);
    box(group, [4.05, .18, 2.72], [0, .41, 0], materials.metal);
    for (const x of [-2.05,2.05]) for (const z of [-1.35,1.35]) {
      box(group, [.18, 3.2, .18], [x, 2.02, z], materials.charcoal);
    }
    for (const z of [-1.35,1.35]) box(group, [4.15, .12, .12], [0, 3.58, z], materials.yellow);
    for (const x of [-2.05,2.05]) box(group, [.12, .12, 2.78], [x, 3.58, 0], materials.yellow);
    for (const x of [-1.35,-.68,0,.68,1.35]) box(group, [.08, 2.82, .08], [x, 1.95, -1.35], materials.metal);
    for (const x of [-2.05,2.05]) for (const z of [-.7,0,.7]) box(group, [.08, 2.82, .08], [x, 1.95, z], materials.metal);
    for (const x of [-1.35,-.45,.45,1.35]) box(group, [.08, 1.86, .08], [x, 1.43, 1.35], materials.metal);
    box(group, [3.1, .12, .12], [0, 2.36, 1.35], materials.yellow);
    box(group, [.72, 1.0, .38], [1.62, 1.08, 1.5], materials.orange);
    box(group, [.28, .28, .08], [1.62, 1.22, 1.74], materials.acid);
    box(group, [1.75, 1.02, 1.35], [-.82, 1.0, -.35], materials.concreteLight);
    box(group, [1.35, .46, 1.02], [.88, .73, .3], materials.blue);
    return group;
  }
  
  function buildCoverHeights() {
    const group = new THREE.Group();
    const specs = [[-2.1,.62,1.18,materials.yellow],[0,1.18,2.3,materials.concreteLight],[2.1,1.9,3.72,materials.blue]];
    specs.forEach(([x, y, height, material], index) => {
      box(group, [1.55, height, .9], [x, y, 0], material);
      box(group, [1.72, .18, 1.05], [x, .09, 0], materials.charcoal);
      box(group, [1.2, .16, .08], [x, Math.min(height - .28, 1.25), .5], index === 2 ? materials.orange : materials.dark);
    });
    return group;
  }
  
  function buildCornerCover() {
    const group = new THREE.Group();
    box(group, [4.4, 1.35, .85], [-.7, .68, 0], materials.concreteLight);
    box(group, [.85, 1.35, 3.55], [1.9, .68, 1.35], materials.concrete);
    box(group, [4.55, .2, 1.0], [-.7, .1, 0], materials.charcoal);
    box(group, [1.0, .2, 3.7], [1.9, .1, 1.35], materials.charcoal);
    for (const x of [-2.1,-1.25,-.4,.45]) box(group, [.34, .85, .08], [x, .83, .47], materials.yellow, [0, 0, -.12]);
    box(group, [.08, .85, 1.8], [2.37, .83, 1.4], materials.orange, [0, 0, .08]);
    return group;
  }
  
  function buildPeekCover() {
    const group = new THREE.Group();
    box(group, [2.35, 2.45, .82], [-1.78, 1.23, 0], materials.concrete);
    box(group, [2.35, 2.45, .82], [1.78, 1.23, 0], materials.concreteLight);
    box(group, [1.22, 1.08, .82], [0, .54, 0], materials.charcoal);
    box(group, [1.22, .56, .82], [0, 2.17, 0], materials.yellow);
    box(group, [6.0, .2, 1.0], [0, .1, 0], materials.charcoal);
    box(group, [6.0, .16, .95], [0, 2.53, 0], materials.metal);
    for (const x of [-.68,.68]) box(group, [.12, .92, .12], [x, 1.52, .47], materials.orange);
    box(group, [.82, .13, .08], [0, 1.0, .47], materials.red);
    for (const x of [-2.68,2.68]) box(group, [.18, 2.58, .95], [x, 1.29, 0], materials.metal);
    return group;
  }
  
  function buildBreakableCover() {
    const group = new THREE.Group();
    box(group, [2.55, 1.4, .82], [-1.62, .7, 0], materials.concreteLight);
    box(group, [1.2, .75, .82], [.45, .38, 0], materials.concrete, [0, 0, -.12]);
    box(group, [.78, .5, .72], [1.38, .25, .08], materials.concreteLight, [0, .28, .18]);
    box(group, [.65, .38, .58], [2.08, .2, -.12], materials.concrete, [0, -.35, -.12]);
    box(group, [5.45, .18, 1.0], [-.15, .09, 0], materials.charcoal);
    box(group, [1.65, .16, .08], [-1.62, 1.03, .46], materials.yellow);
    for (const x of [-.2,.45,1.05,1.65,2.3]) box(group, [.08, .65 + (x % 2) * .25, .08], [x, .58, .1], materials.orange, [0, 0, -.2 + x * .12]);
    return group;
  }
  
  function buildTerminal() {
    const group = new THREE.Group();
    box(group, [2.4, .3, 1.8], [0, .15, 0], materials.charcoal);
    box(group, [1.45, 1.65, 1.18], [0, 1.02, 0], materials.concrete);
    box(group, [1.85, .22, 1.38], [0, 1.82, 0], materials.yellow, [-.08, 0, 0]);
    box(group, [1.48, .94, .14], [0, 2.28, .58], materials.dark, [-.12, 0, 0]);
    box(group, [1.22, .68, .08], [0, 2.28, .69], materials.cyan, [-.12, 0, 0]);
    for (let i = 0; i < 3; i += 1) box(group, [.24, .08, .06], [-.36 + i * .36, 2.25, .76], i === 1 ? materials.red : materials.acid, [-.12, 0, 0]);
    box(group, [1.16, .18, .52], [0, 1.63, .7], materials.metal, [-.18, 0, 0]);
    box(group, [.45, .3, .5], [.66, 1.95, -.26], materials.metal);
    cylinder(group, [.08, .08], 1.42, 6, [.66, 2.58, -.26], materials.charcoal);
    cylinder(group, [.2, .24], .3, 6, [.66, 3.35, -.26], materials.red);
    return group;
  }
  
  function buildPowerRelay() {
    const group = new THREE.Group();
    box(group, [3.2, .32, 2.4], [0, .16, 0], materials.charcoal);
    for (const x of [-1.08,1.08]) {
      box(group, [.42, 2.55, .42], [x, 1.42, 0], materials.metal);
      cylinder(group, [.62, .7], .28, 10, [x, 2.75, 0], materials.yellow);
      cylinder(group, [.42, .5], .24, 10, [x, .36, 0], materials.concrete);
    }
    const coil = finish(new THREE.Mesh(new THREE.TorusGeometry(.78, .16, 6, 12), materials.cyan));
    coil.position.set(0, 1.55, 0);
    group.add(coil);
    const coil2 = coil.clone(); coil2.scale.set(.72,.72,.72); coil2.position.y = 1.55; group.add(coil2);
    cylinder(group, [.22, .22], 1.72, 8, [0, 1.55, 0], materials.acid);
    beamBetween(group, [-1.08, 2.58, 0], [-.65, 1.95, 0], .12, materials.orange);
    beamBetween(group, [1.08, 2.58, 0], [.65, 1.95, 0], .12, materials.orange);
    return group;
  }
  
  function buildCaptureBeacon() {
    const group = new THREE.Group();
    cylinder(group, [2.25, 2.55], .3, 10, [0, .15, 0], materials.charcoal);
    cylinder(group, [1.65, 1.9], .24, 10, [0, .42, 0], materials.yellow);
    cylinder(group, [.36, .55], 2.8, 8, [0, 1.88, 0], materials.metal);
    for (const y of [1.0,1.8,2.6]) {
      const ring = finish(new THREE.Mesh(new THREE.TorusGeometry(.82 - y * .08, .08, 6, 12), materials.cyan));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
    }
    const crown = finish(new THREE.Mesh(new THREE.OctahedronGeometry(.58, 0), materials.acid));
    crown.position.y = 3.55;
    group.add(crown);
    for (const angle of [0,Math.PI*.5,Math.PI,Math.PI*1.5]) {
      const x = Math.cos(angle) * 1.75, z = Math.sin(angle) * 1.75;
      beamBetween(group, [x,.32,z], [x*.45,1.0,z*.45], .1, materials.orange);
    }
    return group;
  }
  
  function buildAmmoStation() {
    const group = new THREE.Group();
    box(group, [3.65, 2.8, 1.45], [0, 1.4, 0], materials.charcoal);
    box(group, [3.35, 2.45, .12], [0, 1.42, .78], materials.dark);
    for (const y of [.55,1.25,1.95]) box(group, [3.15, .14, 1.0], [0, y, .25], materials.metal);
    const slots = [[-1.05,.72],[0,.72],[1.05,.72],[-.72,1.45],[.72,1.45],[-.95,2.15],[.2,2.15],[1.2,2.15]];
    slots.forEach(([x,y], index) => box(group, [.68, .38, .72], [x, y, .62], index % 3 === 0 ? materials.orange : materials.yellow, [0, index * .05, 0]));
    box(group, [3.82, .3, 1.62], [0, 2.92, 0], materials.yellow);
    box(group, [1.35, .34, .08], [0, 2.92, .86], materials.dark);
    box(group, [.5, .62, .26], [1.48, 1.55, .86], materials.blue);
    box(group, [.18, .18, .08], [1.48, 1.64, 1.05], materials.acid);
    return group;
  }
  
  function buildCorridor() {
    const group = new THREE.Group();
    box(group, [4.5, .22, 6.2], [0, .11, 0], materials.concrete);
    box(group, [.3, 3.55, 6.2], [-2.1, 1.78, 0], materials.plaster);
    box(group, [.3, 3.55, 6.2], [2.1, 1.78, 0], materials.plaster);
    for (const z of [-2.85,-1.4,0,1.4,2.85]) box(group, [4.45, .18, .18], [0, 3.45, z], materials.charcoal);
    for (const z of [-2.25,0,2.25]) {
      box(group, [1.5, .12, .48], [0, 3.32, z], materials.white);
      box(group, [1.12, .06, .34], [0, 3.23, z], materials.acid);
    }
    box(group, [.12, 1.05, 3.8], [-1.9, 1.05, .3], materials.blue);
    box(group, [.12, .22, 3.8], [-1.82, 1.62, .3], materials.yellow);
    box(group, [.5, 1.45, .22], [1.84, 1.25, -1.7], materials.orange);
    box(group, [.18, .18, .08], [1.68, 1.48, -1.7], materials.red);
    return group;
  }
  
  function shelfUnit(group, x, z, rotation = 0) {
    const shelf = new THREE.Group();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotation;
    group.add(shelf);
    box(shelf, [2.0, .18, .68], [0, .1, 0], materials.charcoal);
    for (const sx of [-.9,.9]) box(shelf, [.14, 2.85, .14], [sx, 1.5, 0], materials.metal);
    for (const y of [.55,1.2,1.85,2.5]) box(shelf, [2.0, .12, .72], [0, y, 0], materials.metal);
    for (let row = 0; row < 3; row += 1) for (let i = 0; i < 5; i += 1) box(shelf, [.25, .42, .48], [-.62 + i * .31, .82 + row * .65, .05], (i + row) % 3 === 0 ? materials.yellow : materials.sand, [0, 0, (i % 2 ? .04 : -.04)]);
  }
  
  function buildArchives() {
    const group = new THREE.Group();
    box(group, [6.2, .18, 4.4], [0, .09, 0], materials.concrete);
    shelfUnit(group, -1.75, -.6, 0);
    shelfUnit(group, .7, -.6, 0);
    shelfUnit(group, 2.15, 1.15, -.45);
    box(group, [1.35, .38, .9], [-1.4, .28, 1.35], materials.sand, [0, .3, .12]);
    box(group, [.95, .28, .72], [-.25, .2, 1.6], materials.yellow, [0, -.2, -.08]);
    return group;
  }
  
  function buildEmergencySign() {
    const group = new THREE.Group();
    for (const x of [-2.55,2.55]) {
      box(group, [.18, 3.5, .18], [x, 1.75, 0], materials.charcoal);
      box(group, [.62, .18, .62], [x, .09, 0], materials.concrete);
    }
    box(group, [5.4, .22, .32], [0, 3.35, 0], materials.metal);
    box(group, [4.25, 1.0, .18], [0, 2.82, .18], materials.yellow);
    box(group, [1.3, .16, .08], [-1.15, 2.82, .3], materials.dark, [0, 0, .55]);
    box(group, [1.3, .16, .08], [-1.15, 2.82, .31], materials.dark, [0, 0, -.55]);
    box(group, [1.55, .2, .08], [1.05, 2.82, .3], materials.dark);
    for (const x of [-1.65,0,1.65]) {
      box(group, [.72, .32, .26], [x, 3.62, 0], materials.charcoal);
      box(group, [.52, .18, .08], [x, 3.57, .2], materials.acid);
    }
    box(group, [.65, .7, .28], [2.55, 1.2, .22], materials.orange);
    box(group, [.22, .22, .08], [2.55, 1.35, .4], materials.red);
    return group;
  }
  
  const modelData = {
    checkpoint: { title: 'Quarantine checkpoint', description: 'A wide, readable gateway with ground-seated hinged gate panels, supported controls, warning lamps, and a strong overhead beam.', meshes: '31 pieces', role: 'Navigation', build: buildCheckpoint, lift: 0, scale: 1 },
    gabion: { title: 'Gabion cover cluster', description: 'Three reusable cage modules become a stepped cover island. Low-poly rock fill prevents the silhouette from reading as another cube.', meshes: '35 pieces', role: 'Waist cover', build: buildGabion, lift: 0, scale: 1.05 },
    generator: { title: 'Field generator', description: 'A bright utility object with a protective frame, readable vents, wheels, control light, and cable path for environmental storytelling.', meshes: '29 pieces', role: 'Story anchor', build: buildGenerator, lift: 0, scale: 1.03 },
    pipes: { title: 'Drainage pipe stack', description: 'A circular three-piece cluster that breaks the arena’s box language while providing low cover and a strong side-on silhouette.', meshes: '23 pieces', role: 'Cover cluster', build: buildPipes, lift: 0, scale: 1.03 },
    decon: { title: 'Decontamination arch', description: 'An open portal with a curved top, spray heads, mist markers, status panel, and side hoses—a readable spawn or transition landmark.', meshes: '19 pieces', role: 'Spawn portal', build: buildDeconArch, lift: 0, scale: .92 },
    tower: { title: 'Field watchpoint', description: 'A tall surveillance silhouette with splayed supports, glass observation deck, ladder, roof lamps, and strong quarantine-yellow cap.', meshes: '25 pieces', role: 'Orientation', build: buildTower, lift: 0, scale: .82 },
    kiosk: { title: 'Screening kiosk', description: 'An enclosed story location with damaged glazing, counter, terminal, scattered test trays, and enough mass to function as hard cover.', meshes: '21 pieces', role: 'Loot location', build: buildKiosk, lift: 0, scale: .93 },
    reel: { title: 'Cable reel cluster', description: 'A broad circular prop seated in four diagonal axle supports, with a wound central drum and grounded loose cable trail.', meshes: '24 pieces', role: 'Route cue', build: buildReel, lift: 0, scale: 1.05 },
    barriers: { title: 'Jersey barrier run', description: 'Three slightly misaligned concrete modules form a readable lane edge, with alternating quarantine paint and loose broken fragments.', meshes: '26 pieces', role: 'Lane control', build: buildBarriers, lift: 0, scale: 1 },
    lightmast: { title: 'Portable light mast', description: 'A tall nighttime beacon with four low-poly lamps, connected stabilizer braces, wheels, and a compact control panel.', meshes: '24 pieces', role: 'Light beacon', build: buildLightMast, lift: 0, scale: .82, targetY: 1.75 },
    medcache: { title: 'Secured medical cache', description: 'A caged pallet of color-coded supplies that makes healing pickups feel authored, protected, and immediately readable.', meshes: '26 pieces', role: 'Pickup anchor', build: buildMedCache, lift: 0, scale: 1 },
    trolley: { title: 'Abandoned evacuation trolley', description: 'A grounded civilian trolley with visible wheel forks and hubs, carrying mismatched luggage and medical boxes.', meshes: '35 pieces', role: 'Story debris', build: buildTrolley, lift: 0, scale: 1 },
    enforcer: { title: 'Bureau heavy enforcer', description: 'A blocky ranged enemy with broad shoulders, a red visor, asymmetric status lights, armored backpack, and a weapon silhouette visible from distance.', meshes: '28 pieces', role: 'Heavy ranged', build: buildEnforcer, lift: 0, scale: .92, targetY: 1.85 },
    facade: { title: 'Ruined facade boundary', description: 'An opaque urban edge assembled around empty window bays. Broken top heights, exposed rebar, and rubble make every repeated section feel different.', meshes: '24 pieces', role: 'Hard boundary', build: buildFacade, lift: 0, scale: .93, targetY: 1.55 },
    tarpfence: { title: 'Security fence with torn tarps', description: 'A readable soft perimeter that preserves enemy silhouettes. Swap tarp colors, gaps, diagonal mesh, and warning lamps without changing collision.', meshes: '27 pieces', role: 'Soft boundary', build: buildTarpFence, lift: 0, scale: .94, targetY: 1.5 },
    hesco: { title: 'Stepped Hesco wall', description: 'A heavy quarantine boundary with modular earth-filled cells. The stepped top creates firing positions and a less artificial skyline.', meshes: '46 pieces', role: 'Heavy boundary', build: buildHesco, lift: 0, scale: .9, targetY: 1.25 },
    screenwall: { title: 'Scaffold quarantine screen', description: 'A lightweight construction wall using reusable poles, diagonal braces, weighted feet, and replaceable cloth panels.', meshes: '25 pieces', role: 'Temporary edge', build: buildScreenWall, lift: 0, scale: .93, targetY: 1.55 },
    cargogate: { title: 'Cargo breach gateway', description: 'Two industrial container halves create a deliberate entrance instead of a solid block. The overhead inspection bridge preserves navigation clarity.', meshes: '34 pieces', role: 'Industrial gate', build: buildCargoGate, lift: 0, scale: .9, targetY: 1.45 },
    roadblock: { title: 'Quarantine vehicle roadblock', description: 'A lowered response van body, connected wheel hubs, and offset barriers create an asymmetric story-rich roadway edge.', meshes: '37 pieces', role: 'Story boundary', build: buildRoadblock, lift: 0, scale: .8, targetY: 1.2 },
    concretewall: { title: 'Decorated security wall', description: 'A true tileable six-metre wall: continuous collision, recessed concrete panels, structural pillars, hazard bands, warning lamps, and a readable district plate.', meshes: '31 pieces', role: 'Solid boundary', build: buildConcreteWall, lift: 0, scale: .84, targetY: 1.42 },
    servicewall: { title: 'Industrial service wall', description: 'A continuous corrugated boundary decorated with exposed pipes, cable tray, ventilation unit, control box, and color-coded maintenance systems.', meshes: '34 pieces', role: 'Solid boundary', build: buildServiceWall, lift: 0, scale: .84, targetY: 1.42 },
    civicwall: { title: 'Weathered civic wall', description: 'A solid city boundary with inset mural panels, layered public notices, simple damage marks, cap stones, and reusable support bays.', meshes: '29 pieces', role: 'Solid boundary', build: buildCivicWall, lift: 0, scale: .84, targetY: 1.42 },
    retainingwall: { title: 'Landscape retaining wall', description: 'A stepped solid boundary with drainage outlets, heavy buttresses, top vegetation, and enough depth to meet uneven terrain naturally.', meshes: '33 pieces', role: 'Terrain boundary', build: buildRetainingWall, lift: 0, scale: .84, targetY: 1.45 },
    clinicwall: { title: 'Clinic perimeter wall', description: 'A clean medical compound wall with sealed observation strips, cyan edge lighting, cross marker, security lamps, and a continuous collision body.', meshes: '30 pieces', role: 'Solid boundary', build: buildClinicWall, lift: 0, scale: .84, targetY: 1.42 },
    fortwall: { title: 'Fortified combat wall', description: 'A high-risk arena wall with sloped buttresses, firing slits, crenellated top blocks, hazard plate, and a strong uninterrupted footprint.', meshes: '32 pieces', role: 'Heavy boundary', build: buildFortWall, lift: 0, scale: .8, targetY: 1.58 },
    clinic: { title: 'Modular field clinic', description: 'A compact medical building with a strong cyan roofline, sealed windows, sheltered entrance, rooftop ventilation, and illuminated cross marker.', meshes: '24 pieces', role: 'Medical landmark', build: buildClinic, lift: 0, scale: .72, targetY: 1.55 },
    warehouse: { title: 'Service warehouse', description: 'A low industrial volume with capped corrugated facade, framed loading door, personnel entrance, roof vents, and clean corner posts.', meshes: '35 pieces', role: 'Arena backdrop', build: buildWarehouse, lift: 0, scale: .68, targetY: 1.5 },
    apartment: { title: 'Ruined apartment corner', description: 'An L-shaped urban shell with repeated windows, damaged roofline, balcony, exposed side wall, and rubble-ready ground edge.', meshes: '35 pieces', role: 'Urban landmark', build: buildApartment, lift: 0, scale: .68, targetY: 1.85 },
    guardbooth: { title: 'Checkpoint guard booth', description: 'A small readable building with panoramic glazing, barrier arm, roof beacon, inspection light, and compact solid collision body.', meshes: '21 pieces', role: 'Checkpoint anchor', build: buildGuardBooth, lift: 0, scale: .82, targetY: 1.35 },
    cornershop: { title: 'Abandoned corner shop', description: 'A civilian storefront with security shutter, striped awning, faded sign, side window, service door, and discarded delivery box.', meshes: '28 pieces', role: 'Civilian landmark', build: buildCornerShop, lift: 0, scale: .72, targetY: 1.5 },
    broadleaf: { title: 'Low-poly broadleaf tree', description: 'A broad four-cluster canopy with visible branching and an irregular trunk. Use it as a soft landmark beside open combat space.', meshes: '10 pieces', role: 'Canopy landmark', build: buildBroadleaf, lift: 0, scale: .78, targetY: 2.05 },
    pine: { title: 'Mixed pine cluster', description: 'Three different-height conifers create a strong vertical edge without repeating one identical tree silhouette.', meshes: '19 pieces', role: 'Vertical vegetation', build: buildPine, lift: 0, scale: .76, targetY: 2.0 },
    deadtree: { title: 'Dead quarantine tree', description: 'A hostile branching silhouette with only two dry foliage remnants. Ideal for contaminated sectors and horizon breakup.', meshes: '12 pieces', role: 'Hostile landmark', build: buildDeadTree, lift: 0, scale: .78, targetY: 2.05 },
    benttree: { title: 'Wind-bent directional tree', description: 'A strongly leaning trunk and one-sided canopy naturally point the player along a route while suggesting prevailing weather.', meshes: '8 pieces', role: 'Directional cue', build: buildBentTree, lift: 0, scale: .78, targetY: 2.0 },
    streettree: { title: 'Protected street tree', description: 'A compact urban tree integrated with a concrete planter, soil bed, grass tufts, and district plate for streets and courtyards.', meshes: '14 pieces', role: 'Urban vegetation', build: buildStreetTree, lift: 0, scale: .8, targetY: 1.9 },
    roadcurb: { title: 'Road and curb module', description: 'A reusable roadway segment with raised sidewalk edge, lane markings, drain grate, and manhole detail for clear route composition.', meshes: '15 pieces', role: 'Ground route', build: buildRoadCurb, lift: 0, scale: .82, targetY: .35 },
    sidewalk: { title: 'Sidewalk corner module', description: 'An L-shaped pavement junction with curb returns, expansion joints, bollard, and grounded debris for building entrances and street turns.', meshes: '16 pieces', role: 'Route junction', build: buildSidewalk, lift: 0, scale: .9, targetY: .35 },
    drainage: { title: 'Drainage channel module', description: 'A tileable grated trench that divides spaces without becoming a full barrier and provides a strong industrial ground line.', meshes: '21 pieces', role: 'Soft ground divider', build: buildDrainage, lift: 0, scale: .9, targetY: .3 },
    roaddamage: { title: 'Road damage cluster', description: 'A grounded asphalt patch with crater, broken slabs, rubble, and interrupted markings for authored damage variation.', meshes: '11 pieces', role: 'Ground breakup', build: buildRoadDamage, lift: 0, scale: .88, targetY: .3 },
    stairs: { title: 'Modular stair flight', description: 'A gameplay-scale eight-step stair with top landing, side rails, and structural supports for reliable elevation changes.', meshes: '18 pieces', role: 'Elevation connector', build: buildStairs, lift: 0, scale: .88, targetY: 1.05 },
    loadingramp: { title: 'Loading ramp and dock', description: 'A broad walkable ramp with a supported upper dock, connected handrails, threshold, and traction ribs for accessible vertical routes.', meshes: '23 pieces', role: 'Slope connector', build: buildLoadingRamp, lift: 0, scale: .9, targetY: 1.0 },
    catwalk: { title: 'Industrial service catwalk', description: 'A raised grated platform with structural legs, guardrails, and repeated posts for elevated combat routes.', meshes: '29 pieces', role: 'Raised route', build: buildCatwalk, lift: 0, scale: .82, targetY: 1.55 },
    footbridge: { title: 'Short tactical footbridge', description: 'A compact crossing with grounded approach slopes, deck supports, curb rails, and a clear guardrail rhythm for spanning hazards or lanes.', meshes: '23 pieces', role: 'Crossing connector', build: buildFootbridge, lift: 0, scale: .84, targetY: 1.2 },
    ladderplatform: { title: 'Ladder access platform', description: 'A vertical route module with enclosed support frame, climb rungs, landing, and safety rails.', meshes: '23 pieces', role: 'Vertical connector', build: buildLadderPlatform, lift: 0, scale: .82, targetY: 1.8 },
    reinforcementdoor: { title: 'Bureau reinforcement door', description: 'A heavy double spawn door with supported frame, status lamps, district header, and solid threshold.', meshes: '18 pieces', role: 'Enemy spawn', build: buildReinforcementDoor, lift: 0, scale: .88, targetY: 1.5 },
    shutter: { title: 'Motorized roller shutter', description: 'A warehouse phase gate with segmented shutter, motor housing, control box, and readable ground threshold.', meshes: '20 pieces', role: 'Phase gate', build: buildShutter, lift: 0, scale: .88, targetY: 1.5 },
    floorhatch: { title: 'Ambush floor hatch', description: 'A circular floor entrance with a centered hinged lid, attached hazard handle, bolted rim, and dark spawn opening for surprise enemy arrivals.', meshes: '13 pieces', role: 'Ambush spawn', build: buildFloorHatch, lift: 0, scale: .9, targetY: .6 },
    breachvent: { title: 'Breakable breach vent', description: 'A framed wall opening with diagonal grille, damaged fragments, and warning plate for small-enemy entrances.', meshes: '18 pieces', role: 'Small spawn', build: buildBreachVent, lift: 0, scale: .9, targetY: 1.45 },
    cargolift: { title: 'Wave-delivery cargo lift', description: 'A grounded lift platform with a connected cage frame, front safety gate, controls, and deck-supported cargo for enemy or objective delivery.', meshes: '30 pieces', role: 'Wave delivery', build: buildCargoLift, lift: 0, scale: .82, targetY: 1.65 },
    coverheights: { title: 'Three-height cover family', description: 'One visual family expressed at knee, waist, and full height so combat dimensions stay immediately readable.', meshes: '9 pieces', role: 'Cover grammar', build: buildCoverHeights, lift: 0, scale: .9, targetY: 1.0 },
    cornercover: { title: 'L-shaped corner cover', description: 'A continuous ninety-degree cover turn with reinforced base and hazard markings for intentional route corners.', meshes: '10 pieces', role: 'Corner cover', build: buildCornerCover, lift: 0, scale: .9, targetY: .75 },
    peekcover: { title: 'Sight-gap peek barrier', description: 'Two full cover masses joined by a low sill and lintel to form a deliberate horizontal firing slot with reinforced edges.', meshes: '11 pieces', role: 'Peek cover', build: buildPeekCover, lift: 0, scale: .88, targetY: 1.15 },
    breakablecover: { title: 'Destructible cover states', description: 'An intact segment transitions into fractured blocks, rubble, and exposed reinforcement in one readable family.', meshes: '12 pieces', role: 'Breakable cover', build: buildBreakableCover, lift: 0, scale: .9, targetY: .65 },
    terminal: { title: 'Bureau command terminal', description: 'A player-facing interaction pedestal with an angled screen, controls, and a bracket-mounted antenna and warning beacon.', meshes: '12 pieces', role: 'Interact objective', build: buildTerminal, lift: 0, scale: .95, targetY: 1.4 },
    powerrelay: { title: 'Quarantine power relay', description: 'A phase device with twin supports, energized coils, central core, and service connectors for defend-or-disable objectives.', meshes: '12 pieces', role: 'Phase objective', build: buildPowerRelay, lift: 0, scale: .95, targetY: 1.35 },
    capturebeacon: { title: 'Capture-zone beacon', description: 'A radial objective marker with grounded base, stabilizers, illuminated rings, and visible crown for hold-zone encounters.', meshes: '12 pieces', role: 'Hold objective', build: buildCaptureBeacon, lift: 0, scale: .92, targetY: 1.45 },
    ammostation: { title: 'Secured ammo station', description: 'A stocked resupply cabinet with three shelf heights, color-coded ammunition boxes, status control, and strong yellow cap.', meshes: '18 pieces', role: 'Resupply point', build: buildAmmoStation, lift: 0, scale: .9, targetY: 1.35 },
    corridor: { title: 'Interior corridor shell', description: 'A reusable interior bay with floor, solid walls, ceiling beams, emergency lighting, utility strip, and control panel.', meshes: '18 pieces', role: 'Interior shell', build: buildCorridor, lift: 0, scale: .82, targetY: 1.55 },
    archives: { title: 'Archive shelving cluster', description: 'Three stocked shelf units plus fallen record boxes create interior cover, occlusion, and Bureau-specific storytelling.', meshes: '72 pieces', role: 'Interior cover', build: buildArchives, lift: 0, scale: .82, targetY: 1.3 },
    emergencysign: { title: 'Emergency navigation gantry', description: 'A lit overhead route marker with directional arrows, status lamps, supports, and a local emergency control box.', meshes: '17 pieces', role: 'Navigation signal', build: buildEmergencySign, lift: 0, scale: .88, targetY: 1.65 }
  };

  function buildIsolatedAsset(build) {
    const root = build();
    const materialClones = new Map();
    const cloneMaterial = (material) => {
      if (!material) return material;
      if (!materialClones.has(material)) materialClones.set(material, material.clone());
      return materialClones.get(material);
    };

    root.traverse((object) => {
      if (!object.material) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    });
    return root;
  }

  const assets = Object.entries(modelData).map(([id, data]) => ({
    id,
    label: data.title,
    title: data.title,
    description: data.description,
    category: environmentCategoryFor(id),
    factoryName: data.build.name,
    role: data.role,
    meshes: data.meshes,
    lift: data.lift ?? 0,
    scale: data.scale ?? 1,
    targetY: data.targetY ?? 1.35,
    source: 'environment',
    build: () => buildIsolatedAsset(data.build)
  }));

  if (assets.length !== CORE_ENVIRONMENT_ASSET_COUNT) {
    throw new Error(`Expected ${CORE_ENVIRONMENT_ASSET_COUNT} core environment assets, received ${assets.length}.`);
  }

  return [...assets, ...createLevelAssetRegistry({ THREE })];
}
