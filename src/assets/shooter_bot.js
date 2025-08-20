// ShooterBot v2: compact biped with right-hand SMG
// Faces +Z in object space; gun also fires along +Z.
// Earlier versions fired backward and needed a code-side π yaw flip.
// Returns { root, head, refs: { gun, muzzle } }
import { getBox } from './geocache.js';

export function createShooterBot({ THREE, mats, scale = 1.0, palette } = {}) {
  const group = new THREE.Group();

  const colors = Object.assign(
    {
      armor: 0x9aa3aa,
      accent: 0x7b8187,
      joints: 0x2a2d31,
      gun:   0x202326,
      glow:  0x10b981
    },
    palette || {}
  );

  const matArmor = new THREE.MeshLambertMaterial({ color: colors.armor });
  const matAccent = new THREE.MeshLambertMaterial({ color: colors.accent });
  const matJoint  = new THREE.MeshLambertMaterial({ color: colors.joints });
  const matHead   = (mats?.head) || (createShooterBot._headMat || (createShooterBot._headMat = new THREE.MeshLambertMaterial({ color: 0x111827 })));
  const matGun    = new THREE.MeshLambertMaterial({ color: colors.gun });
  const matGlow   = new THREE.MeshLambertMaterial({ color: colors.glow, emissive: colors.glow, emissiveIntensity: 0.9 });

  const add = (mesh, parent = group, pos = null, mat = null) => {
    if (mat) mesh.material = mat;
    if (pos) mesh.position.set(pos.x, pos.y, pos.z);
    parent.add(mesh);
    return mesh;
  };

  // -------- torso / hips (вужчий силует)
  const chest = add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.06, 0.72), matArmor),
                    group, new THREE.Vector3(0, 1.52 * scale, 0));
  chest.userData.bodyPart = 'torso';
  const abdomen = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.40, 0.60), matAccent),
                      group, new THREE.Vector3(0, 1.06 * scale, 0.02));
  const hips = add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.42, 0.76), matArmor),
                   group, new THREE.Vector3(0, 0.68 * scale, 0));

  // shoulder pads
  add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.56), matArmor), group, new THREE.Vector3( 0.72, 1.94 * scale, 0));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.56), matArmor), group, new THREE.Vector3(-0.72, 1.94 * scale, 0));

  // -------- head + visor
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.66, 0.74), matHead),
                   group, new THREE.Vector3(0, 2.16 * scale, 0));
  head.userData.bodyPart = 'head';
  add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.10, 0.05), matGlow), head, new THREE.Vector3(0, -0.02, 0.36));

  // -------- arms
  const mkUpper = () => new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.46, 0.44), matJoint);
  const mkFore  = () => new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.62, 0.44), matArmor);

  // left (опущена, трохи назад)
  const L = new THREE.Group(); L.position.set(-0.84, 1.72 * scale, 0); group.add(L);
  add(mkUpper(), L, new THREE.Vector3(0, -0.30, 0));
  add(mkFore(),  L, new THREE.Vector3(0, -0.90, 0.02));

  // right (цільова рука з пістолетом/SMG)
  const R = new THREE.Group(); R.position.set(0.84, 1.78 * scale, 0.02); group.add(R);
  add(mkUpper(), R, new THREE.Vector3(0, -0.30, 0));
  const rFore = add(mkFore(), R, new THREE.Vector3(0.02, -0.88, -0.02));

  // hand block для хвату
  const hand = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.20), matAccent),
                   rFore, new THREE.Vector3(0.16, -0.36, -0.12));

  // -------- gun (+Z forward)
  const gun = new THREE.Group();
  rFore.add(gun);
  gun.position.set(0.22, -0.32, -0.28);
  gun.rotation.y = Math.PI; // align muzzle with +Z

  // receiver + grip
  add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.60), matGun), gun, new THREE.Vector3(0, 0.04, -0.30));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.20, 0.22), matGun), gun, new THREE.Vector3(0, -0.10, -0.02)); // grip
  // short stock (читабельність)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), matGun), gun, new THREE.Vector3(0, 0.06, 0.18));
  // barrel
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.72), matGun), gun, new THREE.Vector3(0, 0.06, -0.86));
  // top rail / sight
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.36), matAccent), gun, new THREE.Vector3(0, 0.18, -0.38));
  // muzzle (socket для ефектів)
  const muzzle = add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.10), matGlow), gun, new THREE.Vector3(0, 0.06, -1.20));

  // -------- legs (knee + boot)
  const mkLeg = (side) => {
    const root = new THREE.Group(); root.position.set(0.40 * side, 0.44, 0); group.add(root);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.50), matArmor), root, new THREE.Vector3(0, -0.31, 0));      // thigh
    add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.68, 0.48), matAccent), root, new THREE.Vector3(0, -0.95, 0.02));  // calf
    add(new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.54), matJoint), root, new THREE.Vector3(0, -0.64, 0.02));   // knee
    add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.26, 0.78), matJoint), root, new THREE.Vector3(0, -1.34, 0.06));   // boot
  };
  mkLeg(1); mkLeg(-1);

  // трохи нахилений вперед (агресивна постава)
  group.rotation.x = -0.05;

  group.scale.set(scale, scale, scale);
  return { root: group, head, refs: { gun, muzzle } };
}
