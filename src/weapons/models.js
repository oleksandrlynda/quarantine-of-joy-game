export const WEAPON_MUZZLE_AXES = Object.freeze({
  pistol: Object.freeze({ x: .85, y: .34 }),
  rifle: Object.freeze({ x: 1.94, y: .22 }),
  smg: Object.freeze({ x: 1.09, y: .21 }),
  shotgun: Object.freeze({ x: 1.585, y: .31 }),
  dmr: Object.freeze({ x: 2.07, y: .23 }),
  minigun: Object.freeze({ x: 1.74, y: .25 }),
  grenade: Object.freeze({ x: 1.14, y: .23 }),
  dynamite: Object.freeze({ x: .72, y: .2 }),
  satellite: Object.freeze({ x: .36, y: .42 }),
  gravitywell: Object.freeze({ x: 1.05, y: .27 }),
  beamsaber: Object.freeze({ x: 1.69, y: .24 })
});

export function createWeaponGeometryPool(THREE) {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder8: new THREE.CylinderGeometry(.5, .5, 1, 8, 1),
    cylinder12: new THREE.CylinderGeometry(.5, .5, 1, 12, 1),
    torus8: new THREE.TorusGeometry(.5, .085, 5, 12)
  };
}

export function disposeWeaponGeometryPool(pool) {
  for (const geometry of Object.values(pool || {})) geometry?.dispose?.();
}

export function buildWeaponModel({ THREE, id, materials, geometryPool = null }) {
  const root = new THREE.Group();
  const meshes = [];
  const actionParts = [];
  const pool = geometryPool || createWeaponGeometryPool(THREE);
  const ownsGeometryPool = !geometryPool;
  const m = materials;
  const a = m.accent;
  let spinner = null;

  function add(parent, geometry, scale, position, material, rotation = [0, 0, 0], tag = '') {
    const item = new THREE.Mesh(geometry, material);
    item.scale.set(...scale);
    item.position.set(...position);
    item.rotation.set(...rotation);
    item.userData.part = tag;
    item.userData.basePosition = item.position.clone();
    item.userData.baseScale = item.scale.clone();
    parent.add(item);
    meshes.push(item);
    if (tag === 'action') actionParts.push(item);
    return item;
  }

  const box = (r, s, p, material, rotation, tag) => add(r, pool.box, s, p, material, rotation, tag);
  const cylX = (r, length, diameter, p, material, tag, sides = 8) =>
    add(r, sides === 12 ? pool.cylinder12 : pool.cylinder8, [diameter, length, diameter], p, material, [0, 0, -Math.PI / 2], tag);
  const cylY = (r, length, diameter, p, material, tag, sides = 8) =>
    add(r, sides === 12 ? pool.cylinder12 : pool.cylinder8, [diameter, length, diameter], p, material, [0, 0, 0], tag);
  const ringX = (r, diameter, depth, p, material, tag) =>
    add(r, pool.torus8, [diameter, diameter, depth], p, material, [0, Math.PI / 2, 0], tag);
  const ovalGuard = (r, width, height, depth, p, material) =>
    add(r, pool.torus8, [width, height, depth], p, material, [0, 0, 0], 'guard');

  if (id === 'pistol') {
    box(root, [1.0, .24, .3], [.08, .36, 0], m.metal);
    cylX(root, .84, .14, [.47, .35, 0], m.dark, 'barrel', 12);
    box(root, [.34, .2, .27], [.65, .34, 0], m.body, undefined, 'muzzle');
    ringX(root, .13, .45, [.85, .34, 0], m.metal, 'muzzle');
    box(root, [.8, .17, .25], [-.03, .14, 0], m.body);
    box(root, [.38, .09, .27], [.27, .05, 0], m.dark, undefined, 'rail');
    box(root, [.18, .07, .2], [.24, .51, 0], a, undefined, 'action');
    box(root, [.4, .035, .02], [.03, .36, .145], a);
    box(root, [.31, .62, .245], [-.29, -.26, 0], m.grip, [0, 0, -.18], 'magazine');
    box(root, [.055, .46, .255], [-.47, -.24, 0], a, [0, 0, -.18]);
    box(root, [.34, .08, .26], [-.36, -.58, 0], m.metal);
    ovalGuard(root, .31, .2, .42, [.08, -.075, 0], m.metal);
    box(root, [.045, .14, .05], [.1, -.06, 0], a, [0, 0, -.2], 'trigger');
    box(root, [.08, .1, .08], [-.29, .51, 0], m.dark);
    box(root, [.055, .12, .065], [.52, .52, 0], a);
  } else if (id === 'rifle') {
    box(root, [1.22, .34, .38], [-.12, .2, 0], m.white);
    box(root, [.48, .22, .3], [.02, .2, 0], a, undefined, 'action');
    cylX(root, 1.38, .12, [1.14, .22, 0], m.metal, 'muzzle', 12);
    box(root, [1.0, .09, .42], [.78, .42, 0], m.white);
    box(root, [.9, .08, .12], [.74, .04, -.17], m.white);
    box(root, [.9, .08, .12], [.74, .04, .17], m.white);
    for (let i = 0; i < 4; i++) box(root, [.07, .19, .05], [.48 + i * .22, .22, .225], m.dark, [0, 0, -.14]);
    box(root, [.21, .55, .26], [-.24, -.29, 0], m.dark, [0, 0, -.1], 'magazine');
    box(root, [.23, .45, .25], [-.56, -.22, 0], m.grip, [0, 0, -.18]);
    box(root, [.62, .18, .31], [-.98, .2, 0], m.white);
    box(root, [.42, .28, .34], [-1.45, .18, 0], m.grip);
    box(root, [.36, .09, .14], [-.14, .48, 0], m.dark);
    box(root, [.2, .16, .18], [.05, .54, 0], m.glass);
    box(root, [.24, .23, .28], [1.82, .22, 0], a, undefined, 'muzzle');
  } else if (id === 'smg') {
    box(root, [.84, .3, .34], [.1, .2, 0], m.body);
    box(root, [.46, .14, .16], [.86, .21, 0], m.metal, undefined, 'muzzle');
    box(root, [.36, .25, .38], [.57, .2, 0], m.dark);
    box(root, [.07, .19, .34], [.7, .22, 0], a);
    box(root, [.27, .56, .25], [-.1, -.29, 0], m.grip, [0, 0, .16], 'magazine');
    for (let i = 0; i < 3; i++) box(root, [.055, .23, .27], [-.2 + i * .09, -.27 - i * .035, 0], a, [0, 0, .16]);
    box(root, [.5, .08, .08], [-.58, .34, -.15], m.metal);
    box(root, [.5, .08, .08], [-.58, .34, .15], m.metal);
    box(root, [.08, .42, .08], [-.84, .16, -.15], m.metal);
    box(root, [.08, .42, .08], [-.84, .16, .15], m.metal);
    box(root, [.27, .08, .08], [-.73, -.05, -.15], m.metal);
    box(root, [.27, .08, .08], [-.73, -.05, .15], m.metal);
    box(root, [.29, .07, .1], [.02, .4, 0], a, undefined, 'action');
  } else if (id === 'shotgun') {
    box(root, [.78, .42, .52], [-.2, .2, 0], m.body);
    box(root, [.2, .34, .54], [.24, .27, 0], m.dark, undefined, 'breech');
    cylX(root, 1.3, .17, [.9, .31, -.17], m.metal, 'muzzle', 12);
    cylX(root, 1.3, .17, [.9, .31, .17], m.metal, 'muzzle', 12);
    ringX(root, .24, .65, [.29, .31, 0], a, 'breech');
    ringX(root, .23, .65, [1.53, .31, 0], m.dark, 'muzzle');
    box(root, [.5, .32, .6], [.65, .04, 0], m.grip, undefined, 'action');
    for (let i = 0; i < 3; i++) box(root, [.05, .36, .62], [.51 + i * .17, .04, 0], m.metal);
    box(root, [.13, .15, .14], [-.03, .49, 0], a, undefined, 'action');
    box(root, [.66, .24, .34], [-.86, .2, 0], m.grip);
    box(root, [.34, .38, .4], [-1.34, .12, 0], m.dark, [0, 0, -.08]);
    box(root, [.23, .48, .26], [-.34, -.27, 0], m.grip, [0, 0, -.18], 'grip');
    ovalGuard(root, .3, .2, .42, [0, -.075, 0], m.metal);
    box(root, [.045, .14, .05], [.02, -.06, 0], a, [0, 0, -.2], 'trigger');
    box(root, [.055, .12, .055], [1.29, .46, 0], a);
  } else if (id === 'dmr') {
    box(root, [1.33, .38, .38], [-.12, .18, 0], m.dark);
    box(root, [1.45, .12, .12], [1.2, .23, 0], m.metal, undefined, 'muzzle');
    box(root, [.38, .25, .28], [1.88, .23, 0], a, undefined, 'muzzle');
    box(root, [.8, .14, .14], [.15, .35, 0], a, undefined, 'action');
    for (let i = 0; i < 4; i++) box(root, [.08, .16, .44], [.62 + i * .2, .15, 0], m.metal, [0, 0, -.24]);
    box(root, [.22, .56, .28], [-.3, -.34, 0], m.grip, [0, 0, -.1], 'magazine');
    cylX(root, .52, .25, [-.2, .62, 0], m.dark, 'optic', 12);
    cylX(root, .12, .31, [.11, .62, 0], m.glass, 'optic', 12);
    box(root, [.68, .12, .12], [-1.08, .3, -.18], m.metal);
    box(root, [.68, .12, .12], [-1.08, .3, .18], m.metal);
    box(root, [.13, .53, .43], [-1.43, .11, 0], m.grip);
    box(root, [.44, .12, .4], [-1.18, -.1, 0], m.metal, [0, 0, .16]);
  } else if (id === 'minigun') {
    box(root, [.87, .63, .66], [-.6, .22, 0], m.body);
    box(root, [.48, .45, .48], [-1.18, .22, 0], a, undefined, 'action');
    cylX(root, .76, .18, [.2, .25, 0], m.metal, 'drive', 12);
    cylX(root, .28, .5, [.48, .25, 0], m.dark, 'bearing', 12);
    box(root, [.66, .1, .1], [.16, .52, -.31], m.metal);
    box(root, [.66, .1, .1], [.16, .52, .31], m.metal);
    spinner = new THREE.Group();
    spinner.position.set(.63, .25, 0);
    spinner.userData.spin = true;
    root.add(spinner);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      cylX(spinner, 1.72, .11, [.25, Math.cos(angle) * .24, Math.sin(angle) * .24], m.metal, 'muzzle');
    }
    ringX(spinner, .39, .65, [-.43, 0, 0], m.dark);
    ringX(spinner, .38, .65, [.96, 0, 0], a);
    cylY(root, .66, .74, [-.62, -.39, 0], m.grip, 'magazine', 12);
    box(root, [.72, .16, .16], [-.33, .6, 0], m.metal);
    box(root, [.19, .52, .18], [-.63, -.22, -.42], m.metal, [0, 0, -.2]);
    box(root, [.19, .52, .18], [-.63, -.22, .42], m.metal, [0, 0, -.2]);
  } else if (id === 'grenade') {
    box(root, [.78, .5, .46], [-.1, .2, 0], m.body);
    cylX(root, .82, .44, [.67, .23, 0], m.metal, 'muzzle', 12);
    ringX(root, .33, .7, [.29, .23, 0], a, 'action');
    ringX(root, .31, .7, [1.08, .23, 0], m.dark, 'muzzle');
    box(root, [.68, .09, .52], [.12, .53, 0], m.metal);
    box(root, [.09, .27, .52], [-.22, .43, 0], m.metal);
    box(root, [.12, .11, .54], [.46, .55, 0], a);
    box(root, [.3, .66, .31], [-.43, -.32, 0], m.grip, [0, 0, -.15]);
    cylY(root, .15, .18, [-.37, .47, 0], a, 'action', 12);
    box(root, [.07, .22, .06], [-.06, -.01, -.19], m.metal);
    box(root, [.27, .06, .06], [.07, -.12, -.19], m.metal);
  } else if (id === 'dynamite') {
    for (const [y, z] of [[.2, -.14], [.2, .14], [-.04, 0]]) {
      cylX(root, .94, .15, [.05, y, z], a, 'charge', 12);
      ringX(root, .17, .62, [-.39, y, z], m.dark, 'cap');
      ringX(root, .17, .62, [.49, y, z], m.dark, 'cap');
    }
    box(root, [.18, .58, .5], [-.05, .09, 0], m.grip, undefined, 'strap');
    box(root, [.12, .62, .54], [.27, .09, 0], m.metal, undefined, 'strap');
    cylX(root, .28, .035, [.61, .31, 0], m.metal, 'fuse', 8);
    box(root, [.1, .1, .1], [.72, .31, 0], m.white, undefined, 'action');
    box(root, [.31, .3, .2], [-.5, -.19, 0], m.grip, [0, 0, -.15], 'grip');
  } else if (id === 'satellite') {
    // Rugged field terminal: a compact screen-and-keypad tool, not a firearm.
    box(root, [.58, .92, .72], [0, .05, 0], m.grip, undefined, 'terminal');
    box(root, [.07, .74, .58], [-.32, .11, 0], m.dark, undefined, 'face');
    box(root, [.035, .38, .47], [-.365, .24, 0], m.glass, undefined, 'screen');
    box(root, [.025, .035, .34], [-.39, .24, 0], a, undefined, 'action');
    for (const [y, z] of [[-.11, -.17], [-.11, 0], [-.11, .17], [-.27, -.17], [-.27, 0], [-.27, .17]]) {
      box(root, [.035, .09, .1], [-.37, y, z], y === -.27 && z === .17 ? a : m.metal, undefined, 'button');
    }
    box(root, [.12, .72, .12], [.28, .05, -.39], m.metal, undefined, 'bumper');
    box(root, [.12, .72, .12], [.28, .05, .39], m.metal, undefined, 'bumper');
    cylY(root, .48, .045, [.12, .73, .2], m.metal, 'antenna', 8);
    box(root, [.16, .1, .12], [.12, .98, .2], a, [0, 0, -.18], 'signal');
    box(root, [.16, .18, .46], [.12, -.5, 0], m.body, undefined, 'lanyard');
  } else if (id === 'gravitywell') {
    // Open containment cradle: the unstable payload is visible at all times.
    box(root, [.7, .42, .58], [-.42, .2, 0], m.body, undefined, 'housing');
    cylX(root, .34, .4, [.32, .27, 0], m.glass, 'core', 12);
    ringX(root, .44, .62, [.17, .27, 0], a, 'action');
    ringX(root, .46, .62, [.36, .27, 0], m.metal, 'cage');
    ringX(root, .43, .62, [.55, .27, 0], a, 'cage');
    for (const z of [-.31, .31]) {
      box(root, [.95, .08, .1], [.52, .52, z], m.metal, [0, 0, z > 0 ? -.08 : .08], 'rail');
      box(root, [.95, .08, .1], [.52, .02, z], m.metal, [0, 0, z > 0 ? .08 : -.08], 'rail');
    }
    box(root, [.3, .64, .31], [-.5, -.34, 0], m.grip, [0, 0, -.16], 'grip');
    box(root, [.4, .28, .5], [-.82, .1, 0], m.dark, undefined, 'battery');
    box(root, [.035, .16, .28], [-1.03, .12, 0], a, undefined, 'meter');
    cylY(root, .18, .2, [-.35, .52, 0], m.white, 'action', 12);
  } else if (id === 'beamsaber') {
    const blade = cylX(root, 2.02, .13, [.68, .24, 0], m.blade, 'blade', 12);
    blade.userData.pulse = true;
    cylX(root, .74, .27, [-.78, .24, 0], m.grip, 'grip', 12);
    for (let i = 0; i < 3; i++) ringX(root, .18, .7, [-.62 - i * .21, .24, 0], i === 1 ? a : m.metal);
    box(root, [.15, .56, .16], [-.32, .11, -.14], m.metal, [0, 0, -.18]);
    box(root, [.47, .12, .16], [-.5, -.16, -.14], m.metal, [0, 0, .06]);
    box(root, [.2, .16, .34], [-.25, .24, 0], a, undefined, 'action');
    cylX(root, .19, .32, [-1.25, .24, 0], m.metal, 'pommel', 12);
  } else {
    throw new Error(`Unknown weapon model: ${id}`);
  }

  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  return { root, meshes, actionParts, spinner, geometryPool: pool, ownsGeometryPool, bounds };
}
