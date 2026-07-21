// B-04 Breaker observer.
//
// This is deliberately a scene character rather than an enemy. It has no
// collider, health, hit target, AI, or combat registration. Wave 40 uses one
// oversized instance as a silent future-generation silhouette in the upper
// Server Cathedral gallery.

function createMaterials(THREE, accent = 0x55e6df) {
  const standard = (color, roughness, metalness, emissive = 0x000000, emissiveIntensity = 0) => (
    new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity, flatShading: true })
  );
  return {
    armor: standard(0x46524c, .66, .3),
    armorLight: standard(0x7d8982, .6, .26),
    dark: standard(0x1a211d, .78, .28),
    joint: standard(0x090e0b, .9, .12),
    rubber: standard(0x050806, .96, .02),
    accent: standard(accent, .5, .26),
    visor: standard(0xd8fff9, .3, .12, accent, 2.4)
  };
}

export function createBreakerObserverAsset({ THREE, accent = 0x55e6df } = {}) {
  if (!THREE) throw new TypeError('createBreakerObserverAsset requires THREE.');
  const materials = createMaterials(THREE, accent);
  const geometryCache = new Map();

  const roundedGeometry = (width, height, depth, radius = .06, segments = 2) => {
    const safeRadius = Math.min(radius, width * .48, height * .48, depth * .48);
    const key = [width, height, depth, safeRadius, segments].join(':');
    if (geometryCache.has(key)) return geometryCache.get(key);
    const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
    const position = geometry.attributes.position;
    const half = new THREE.Vector3(width / 2, height / 2, depth / 2);
    const inner = new THREE.Vector3(half.x - safeRadius, half.y - safeRadius, half.z - safeRadius);
    const point = new THREE.Vector3();
    const clamped = new THREE.Vector3();
    const delta = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      clamped.set(
        Math.max(-inner.x, Math.min(inner.x, point.x)),
        Math.max(-inner.y, Math.min(inner.y, point.y)),
        Math.max(-inner.z, Math.min(inner.z, point.z))
      );
      delta.copy(point).sub(clamped);
      if (delta.lengthSq() > 1e-8) point.copy(clamped).add(delta.normalize().multiplyScalar(safeRadius));
      position.setXYZ(index, point.x, point.y, point.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometryCache.set(key, geometry);
    return geometry;
  };

  const addMesh = (parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], name = '') => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.name = name;
    object.castShadow = false;
    object.receiveShadow = true;
    object.userData.nonTargetVisual = true;
    object.raycast = () => {};
    parent.add(object);
    return object;
  };
  const rbox = (parent, size, position, material, rotation = [0, 0, 0], radius = .06, segments = 2, name = '') => (
    addMesh(parent, roundedGeometry(...size, radius, segments), material, position, rotation, name)
  );
  const cylinder = (parent, radiusTop, radiusBottom, height, position, material, rotation = [0, 0, 0], segments = 10, name = '') => (
    addMesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, false), material, position, rotation, name)
  );
  const torus = (parent, radius, tube, position, material, rotation = [0, 0, 0], segments = 18, name = '') => (
    addMesh(parent, new THREE.TorusGeometry(radius, tube, 6, segments), material, position, rotation, name)
  );
  const plate = (parent, points, depth, position, material, rotation = [0, 0, 0], name = '') => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: .02,
      bevelThickness: .015,
      curveSegments: 1
    });
    geometry.translate(0, 0, -depth / 2);
    return addMesh(parent, geometry, material, position, rotation, name);
  };
  const link = (parent, from, to, width, depth, material, radius = .05) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const object = rbox(parent, [width, direction.length(), depth], [0, 0, 0], material, [0, 0, 0], radius);
    object.position.copy(start).add(end).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  };
  const collar = (parent, position, radius, axis = 'z') => {
    const rotation = axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
    cylinder(parent, radius, radius, .18, position, materials.joint, rotation, 10);
    torus(parent, radius * .86, .04, position, materials.dark, rotation, 14);
  };

  const buildFist = (parent, position, side) => {
    const fist = new THREE.Group();
    fist.position.set(...position);
    fist.name = side < 0 ? 'breaker_left_fist' : 'breaker_right_fist';
    parent.add(fist);
    rbox(fist, [.55, .45, .42], [0, 0, 0], materials.dark, [0, 0, 0], .075, 2, 'breaker_palm');
    for (let index = 0; index < 4; index += 1) {
      rbox(fist, [.12, .31, .15], [(index - 1.5) * .135, -.3, .1], index % 2 ? materials.armor : materials.dark, [.18, 0, 0], .035, 2, `breaker_finger_${index + 1}`);
    }
    rbox(fist, [.16, .3, .17], [side * .32, -.06, .07], materials.armorLight, [0, 0, side * .5], .04, 2, 'breaker_thumb');
    return fist;
  };

  const buildBoot = (parent, position, side) => {
    const boot = new THREE.Group();
    boot.position.set(...position);
    boot.name = side < 0 ? 'breaker_left_boot' : 'breaker_right_boot';
    parent.add(boot);
    rbox(boot, [.58, .27, .86], [0, .1, .19], materials.rubber, [0, 0, 0], .075);
    rbox(boot, [.51, .2, .48], [0, .28, .11], materials.dark, [0, 0, 0], .06);
    rbox(boot, [.48, .15, .34], [0, .29, .45], materials.armor, [0, 0, 0], .045);
    for (let index = -1; index <= 1; index += 1) {
      rbox(boot, [.1, .065, .2], [index * .17, -.035, .32], materials.joint, [0, 0, 0], .02);
    }
    return boot;
  };

  const buildHelmet = (parent) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.68, .02);
    pivot.rotation.x = .16;
    pivot.name = 'breaker_observer_head';
    parent.add(pivot);
    rbox(pivot, [.68, .68, .61], [0, 0, 0], materials.armor, [0, 0, 0], .09, 3, 'breaker_helmet');
    rbox(pivot, [.74, .23, .64], [0, -.17, .01], materials.dark, [0, 0, 0], .055, 2, 'breaker_brow');
    const visor = rbox(pivot, [.57, .082, .05], [0, -.06, .33], materials.visor, [0, 0, 0], .022, 2, 'breaker_observer_visor');
    rbox(pivot, [.38, .095, .055], [0, -.2, .335], materials.joint, [0, 0, 0], .02);
    for (const side of [-1, 1]) cylinder(pivot, .078, .078, .045, [side * .36, -.05, 0], materials.dark, [0, 0, Math.PI / 2], 10);
    return { pivot, visor };
  };

  const buildShoulder = (parent, side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.02, 2.84, 0);
    shoulder.rotation.z = -side * .1;
    shoulder.name = side < 0 ? 'breaker_left_shoulder' : 'breaker_right_shoulder';
    parent.add(shoulder);
    collar(shoulder, [0, 0, 0], .32, 'z');
    rbox(shoulder, [.78, .57, .75], [side * .06, .02, .01], materials.armor, [0, 0, 0], .13, 3, 'breaker_shoulderguard');
    rbox(shoulder, [.58, .1, .55], [side * .07, .28, .04], materials.armorLight, [0, 0, 0], .04);
    return shoulder;
  };

  const buildArm = (parent, side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 1.03, 2.66, .02);
    arm.rotation.z = side * .085;
    arm.name = side < 0 ? 'breaker_left_arm' : 'breaker_right_arm';
    parent.add(arm);
    const elbow = [side * .2, -.7, .04];
    const hand = [side * .1, -1.38, .16];
    link(arm, [0, 0, 0], elbow, .4, .42, materials.joint, .075);
    rbox(arm, [.49, .63, .5], [elbow[0] * .45, elbow[1] * .48, .01], materials.dark, [0, 0, -side * .06], .085);
    collar(arm, elbow, .24, 'z');
    link(arm, elbow, hand, .43, .46, materials.joint, .07);
    rbox(arm, [.58, .7, .53], [side * .16, -1.05, .12], materials.dark, [0, 0, -side * .05], .09, 3, 'breaker_forearm');
    rbox(arm, [.13, .49, .05], [side * .16, -1.04, .395], materials.visor, [0, 0, -side * .05], .025);
    const fist = buildFist(arm, [hand[0], hand[1] - .12, hand[2]], side);
    return { group: arm, fist };
  };

  const buildLeg = (parent, side) => {
    const leg = new THREE.Group();
    leg.position.set(side * .43, 1.46, 0);
    leg.name = side < 0 ? 'breaker_left_leg' : 'breaker_right_leg';
    parent.add(leg);
    const knee = [-side * .02, -.68, .02];
    const ankle = [side * .05, -1.43, .12];
    collar(leg, [0, 0, 0], .25, 'x');
    link(leg, [0, 0, 0], knee, .43, .45, materials.joint, .08);
    rbox(leg, [.55, .63, .49], [knee[0] * .45, knee[1] * .48, .05], materials.dark, [0, 0, side * .04], .09);
    collar(leg, knee, .24, 'z');
    link(leg, knee, ankle, .4, .43, materials.joint, .07);
    rbox(leg, [.56, .73, .49], [side * .03, -1.06, .1], materials.armor, [0, 0, -side * .04], .09, 3, 'breaker_shin');
    rbox(leg, [.38, .12, .055], [side * .03, -1.03, .36], materials.armorLight, [0, 0, -side * .04], .03);
    buildBoot(leg, [ankle[0], ankle[1] - .2, ankle[2] + .08], side);
    return leg;
  };

  const root = new THREE.Group();
  root.name = 'breaker_generation_observer';
  root.userData.nonTargetVisual = true;
  root.userData.storyRole = 'concealed_generation_observer';

  const hips = new THREE.Group();
  hips.position.y = 1.48;
  hips.name = 'breaker_hips';
  root.add(hips);
  rbox(hips, [1.05, .42, .62], [0, 0, 0], materials.dark, [0, 0, 0], .1);
  rbox(hips, [.55, .28, .66], [0, -.12, .04], materials.armor, [0, 0, 0], .07);

  const torso = new THREE.Group();
  torso.position.set(0, 2.43, 0);
  torso.name = 'breaker_torso';
  root.add(torso);
  rbox(torso, [1.55, 1.35, .72], [0, 0, 0], materials.joint, [0, 0, 0], .16, 3);
  rbox(torso, [1.41, .86, .8], [0, .22, .05], materials.armor, [0, 0, 0], .13, 3);
  plate(torso, [[-.59, -.28], [.59, -.28], [.7, .02], [.46, .36], [-.46, .36], [-.7, .02]], .09, [0, .2, .48], materials.armorLight, [0, 0, 0], 'breaker_chest_plate');
  rbox(torso, [.76, .09, .048], [-.22, .39, .52], materials.visor, [0, 0, 0], .025);
  rbox(torso, [.86, .25, .62], [0, -.5, .01], materials.dark, [0, 0, 0], .08);
  // Three restrained serial bars read as B-04 machinery at distance without a
  // texture allocation or legibility-dependent story label.
  for (let index = 0; index < 3; index += 1) {
    rbox(torso, [.08 + index * .025, .035, .018], [.35, .12 - index * .07, .535], materials.dark, [0, 0, 0], .009, 1);
  }

  const neck = new THREE.Group();
  neck.position.set(0, 3.26, 0);
  neck.name = 'breaker_neck';
  root.add(neck);
  cylinder(neck, .31, .31, .24, [0, 0, 0], materials.joint, [0, 0, 0], 12);
  torus(neck, .28, .06, [0, .02, 0], materials.dark, [Math.PI / 2, 0, 0], 18);

  const head = buildHelmet(root);
  const arms = [];
  const legs = [];
  const shoulders = [];
  for (const side of [-1, 1]) {
    shoulders.push(buildShoulder(root, side));
    const arm = buildArm(root, side);
    const leg = buildLeg(root, side);
    arms.push(arm);
    legs.push(leg);
  }

  root.userData.refs = {
    headPivot: head.pivot,
    visor: head.visor,
    visorMaterial: materials.visor,
    torso,
    leftArm: arms[0].group,
    rightArm: arms[1].group,
    leftShoulder: shoulders[0],
    rightShoulder: shoulders[1],
    leftFist: arms[0].fist,
    rightFist: arms[1].fist,
    lowerBody: [hips, ...legs]
  };
  root.updateMatrixWorld(true);
  return { root, refs: root.userData.refs, materials, geometryCache };
}
