// Propaganda Pelican: a long-bodied aerial bombardier with an unmistakable
// beak, broad wings, and a visible grenade rack.

export function createPropagandaPelican({ THREE, mats, scale = 1.0, palette = {} } = {}) {
  const root = new THREE.Group();
  root.userData.isFlyer = true;

  const colors = {
    body: palette.body ?? 0xd8d2b8,
    wing: palette.wing ?? 0xb9b092,
    dark: palette.dark ?? 0x242722,
    beak: palette.beak ?? 0xf2a12c,
    warning: palette.warning ?? 0xff5a36,
    grenade: palette.grenade ?? 0x9eb83b
  };
  const bodyMat = new THREE.MeshLambertMaterial({ color: colors.body });
  const wingMat = new THREE.MeshLambertMaterial({ color: colors.wing });
  const darkMat = new THREE.MeshLambertMaterial({ color: colors.dark });
  const beakMat = new THREE.MeshLambertMaterial({ color: colors.beak });
  const warningMat = new THREE.MeshLambertMaterial({
    color: colors.warning,
    emissive: colors.warning,
    emissiveIntensity: 0.75
  });
  const grenadeMat = new THREE.MeshLambertMaterial({ color: colors.grenade });
  const headMat = mats?.head?.clone?.() || darkMat;

  const add = (geometry, material, parent = root, position = [0, 0, 0], rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };

  const body = add(new THREE.BoxGeometry(0.82, 0.62, 1.9), bodyMat);
  body.userData.bodyPart = 'torso';
  add(new THREE.BoxGeometry(0.52, 0.38, 0.72), darkMat, body, [0, -0.03, -1.12]);
  add(new THREE.BoxGeometry(0.16, 0.7, 0.9), wingMat, body, [0, 0.22, -1.35], [0.22, 0, 0]);

  // A raised neck and long forward beak make the silhouette read as a bird,
  // even at combat distance and from below.
  const neck = add(new THREE.BoxGeometry(0.42, 0.72, 0.5), bodyMat, body, [0, 0.42, 0.86], [-0.2, 0, 0]);
  const head = add(new THREE.BoxGeometry(0.56, 0.48, 0.68), headMat, neck, [0, 0.32, 0.36]);
  head.userData.bodyPart = 'head';
  const beak = add(new THREE.ConeGeometry(0.24, 1.35, 4), beakMat, head, [0, -0.05, 0.98], [Math.PI / 2, Math.PI / 4, 0]);
  const beakGlow = add(new THREE.BoxGeometry(0.22, 0.08, 0.34), warningMat, head, [0, -0.13, 0.52]);

  const eyeMat = new THREE.MeshLambertMaterial({
    color: colors.warning,
    emissive: colors.warning,
    emissiveIntensity: 1
  });
  add(new THREE.BoxGeometry(0.08, 0.1, 0.08), eyeMat, head, [0.25, 0.08, 0.2]);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.08), eyeMat, head, [-0.25, 0.08, 0.2]);

  const makeWing = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.42 * side, 0.12, -0.08);
    body.add(pivot);
    add(new THREE.BoxGeometry(2.15, 0.11, 0.78), wingMat, pivot, [1.04 * side, 0, 0]);
    const tip = add(new THREE.BoxGeometry(0.9, 0.08, 0.5), darkMat, pivot, [2.12 * side, -0.03, -0.08], [0, side * -0.16, side * -0.08]);
    tip.userData.performanceDetail = true;
    const stripe = add(new THREE.BoxGeometry(0.55, 0.025, 0.82), warningMat, pivot, [0.82 * side, 0.07, 0]);
    stripe.userData.performanceDetail = true;
    pivot.rotation.z = side > 0 ? -0.08 : 0.08;
    return pivot;
  };
  const leftWing = makeWing(1);
  const rightWing = makeWing(-1);

  const grenadeRack = new THREE.Group();
  grenadeRack.position.set(0, -0.45, 0.1);
  body.add(grenadeRack);
  for (const x of [-0.22, 0, 0.22]) {
    const grenade = add(new THREE.SphereGeometry(0.15, 8, 6), grenadeMat, grenadeRack, [x, -0.08, 0]);
    grenade.userData.performanceDetail = true;
  }
  const warningPanel = add(new THREE.BoxGeometry(0.64, 0.08, 0.48), warningMat, body, [0, -0.36, 0.08]);
  warningPanel.userData.performanceDetail = true;

  root.scale.setScalar(scale);
  return {
    root,
    head,
    refs: { body, neck, beak, beakGlow, leftWing, rightWing, grenadeRack, warningPanel }
  };
}
