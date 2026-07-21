import { createBroodmakerAsset } from '../assets/boss_broodmaker.js';
import { createSanitizerNodeAsset } from '../assets/boss_sanitizer.js';
import { createAdZoneMarkerAsset } from '../assets/boss_captain.js';
import {
  createEnhancedCaptainAsset,
  createEnhancedSanitizerAsset,
  createEnhancedZeppelinAsset
} from '../assets/boss-retrofits.js';
import { cloneNodeMaterial, cloneRenderTemplate } from '../enemies/render-template.js';

const caches = new WeakMap();

function cacheFor(THREE) {
  let cache = caches.get(THREE);
  if (!cache) { cache = new Map(); caches.set(THREE, cache); }
  return cache;
}

function template(THREE, key, factory) {
  const cache = cacheFor(THREE);
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export function getBossSharedGeometry(THREE, key, factory) {
  return template(THREE, `geometry:${key}`, factory);
}

function clone(THREE, key, factory) {
  return cloneRenderTemplate(template(THREE, key, factory));
}

function cloneSharedMaterial(nodes) {
  const first = nodes?.find?.(node => node?.material);
  const material = first?.material?.clone?.();
  if (!material) return null;
  for (const node of nodes) if (node) node.material = material;
  return material;
}

export function createBroodmakerVisual({ THREE, mats }) {
  const built = clone(THREE, 'broodmaker:1', () => createBroodmakerAsset({ THREE, mats, scale: 1.0 }));
  cloneNodeMaterial(built.head);
  cloneSharedMaterial([...(built.refs?.eggs || []), built.refs?.weakpoint]);
  return built;
}

export function createSanitizerVisual({ THREE, mats }) {
  const built = clone(THREE, 'sanitizer:mk2:1', () => createEnhancedSanitizerAsset({ THREE, mats, scale: 1.0 }));
  cloneNodeMaterial(built.head);
  cloneSharedMaterial(built.refs?.vents || []);
  return built;
}

export function createSanitizerNodeVisual({ THREE }) {
  const built = clone(THREE, 'sanitizer-node:1', () => {
    const asset = createSanitizerNodeAsset({ THREE });
    return { root: asset.root, head: null, refs: { ring: asset.ring } };
  });
  cloneNodeMaterial(built.refs?.ring);
  return { root: built.root, ring: built.refs?.ring };
}

export function createCaptainVisual({ THREE, mats }) {
  const built = clone(THREE, 'captain:mk2:1.2', () => createEnhancedCaptainAsset({ THREE, mats, scale: 1.2 }));
  cloneNodeMaterial(built.head);
  return built;
}

export function createCaptainZoneVisual({ THREE }) {
  const built = clone(THREE, 'captain-zone:warning:2.2', () => {
    const asset = createAdZoneMarkerAsset({
      THREE,
      radius: 2.2,
      palette: { ring: 0xfb7185, fill: 0xf97316 }
    });
    return { root: asset.root, head: null, refs: asset.refs };
  });
  cloneNodeMaterial(built.refs?.ring);
  cloneNodeMaterial(built.refs?.disk);
  return { root: built.root, refs: built.refs };
}

export function createZeppelinBombMarkerVisual({ THREE }) {
  const built = clone(THREE, 'zeppelin-bomb-marker:warning:3.2', () => {
    const asset = createAdZoneMarkerAsset({
      THREE,
      radius: 3.2,
      palette: { ring: 0xffd166, fill: 0xff6b35 }
    });
    return { root: asset.root, head: null, refs: asset.refs };
  });
  cloneNodeMaterial(built.refs?.ring);
  cloneNodeMaterial(built.refs?.disk);
  return { root: built.root, refs: built.refs };
}

export function createZeppelinBombVisual({ THREE }) {
  const built = clone(THREE, 'zeppelin-bomb:1', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: 0x273449, emissive: 0x4a2508 });
    const body = new THREE.Mesh(
      getBossSharedGeometry(THREE, 'zeppelin-bomb-body', () => new THREE.CylinderGeometry(0.14, 0.22, 0.72, 8)),
      material
    );
    const nose = new THREE.Mesh(
      getBossSharedGeometry(THREE, 'zeppelin-bomb-nose', () => new THREE.ConeGeometry(0.22, 0.32, 8)),
      material
    );
    nose.position.y = -0.5;
    nose.rotation.z = Math.PI;
    root.add(body, nose);
    return { root, head: null, refs: { body, nose } };
  });
  const material = cloneSharedMaterial([built.refs?.body, built.refs?.nose]);
  if (material) material.emissive?.setHex?.(0x4a2508);
  return { root: built.root, refs: built.refs };
}

function captainBoltTemplate(THREE) {
  return template(THREE, 'captain-volley-bolt:1', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), material);
    root.add(core);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.85, 6), material);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.42;
    root.add(tail);
    return { root, head: null, refs: { core, tail } };
  });
}

export function createCaptainVolleyBoltVisual({ THREE }) {
  return cloneRenderTemplate(captainBoltTemplate(THREE));
}

export function createZeppelinVisual({ THREE, mats }) {
  return clone(THREE, 'zeppelin:mk4:2:3', () => createEnhancedZeppelinAsset({ THREE, mats, scale: 2.0, podCount: 3 }));
}

function adjudicatorMineTemplate(THREE) {
  return template(THREE, 'adjudicator-citation-mine:1', () => {
    const root = new THREE.Group();
    root.name = 'citation_mine';

    const dark = new THREE.MeshLambertMaterial({ color: 0x172033 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const strike = new THREE.MeshLambertMaterial({
      color: 0xf43f5e,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.85
    });
    const purge = new THREE.MeshLambertMaterial({
      color: 0x67e8f9,
      emissive: 0x0891b2,
      emissiveIntensity: 1.15
    });
    const zone = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.82, 0.22, 10), dark);
    base.position.y = 0.11;
    base.userData.bodyPart = 'torso';
    root.add(base);

    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.45, 8), metal);
    shoulder.position.y = 0.42;
    shoulder.userData.bodyPart = 'torso';
    root.add(shoulder);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), purge);
    core.position.y = 0.9;
    core.userData.bodyPart = 'weakpoint';
    root.add(core);

    const cage = [];
    for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.045, 6, 18), strike);
      ring.position.y = 0.9;
      ring.rotation.set(...rotation);
      ring.userData.bodyPart = 'torso';
      root.add(ring);
      cage.push(ring);
    }

    const floorRing = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.25, 40), zone);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.025;
    root.add(floorRing);

    const purgeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 0.98, 24),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    purgeRing.rotation.x = -Math.PI / 2;
    purgeRing.position.y = 0.035;
    root.add(purgeRing);

    return { root, head: core, refs: { base, shoulder, core, cage, floorRing, purgeRing } };
  });
}

export function createAdjudicatorMineVisual({ THREE }) {
  const built = cloneRenderTemplate(adjudicatorMineTemplate(THREE));
  cloneNodeMaterial(built.refs.core);
  cloneSharedMaterial(built.refs.cage);
  cloneNodeMaterial(built.refs.floorRing);
  cloneNodeMaterial(built.refs.purgeRing);
  return built;
}

function transientWarmupRoot(THREE) {
  return template(THREE, 'boss-transient-warmup:1', () => {
    const root = new THREE.Group();
    const addGround = (geometry, material, x) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.x = x;
      root.add(mesh);
    };
    addGround(getBossSharedGeometry(THREE, 'sanitizer-telegraph', () => new THREE.RingGeometry(0.8, 1.5, 24)), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0);
    addGround(getBossSharedGeometry(THREE, 'sanitizer-tile', () => new THREE.CircleGeometry(1.6, 24)), new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.25, depthWrite: false }), 2);
    addGround(getBossSharedGeometry(THREE, 'broodmaker-phase-ring', () => new THREE.RingGeometry(0.9, 1.8, 28)), new THREE.MeshBasicMaterial({ color: 0xff88aa, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 4);
    addGround(getBossSharedGeometry(THREE, 'generic-boss-telegraph', () => new THREE.RingGeometry(0.4, 0.75, 24)), new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 6);
    root.add(new THREE.Mesh(
      getBossSharedGeometry(THREE, 'sanitizer-beam', () => new THREE.CylinderGeometry(0.12, 0.12, 18, 10, 1, true)),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7, depthWrite: false })
    ));
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(2, 0, 0)]);
    root.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 })));
    const dashed = new THREE.Line(lineGeometry, new THREE.LineDashedMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 }));
    dashed.computeLineDistances?.();
    root.add(dashed);
    return { root, head: null, refs: {} };
  }).root;
}

export function getBossShaderWarmupExtras({ THREE, mats }) {
  return [
    template(THREE, 'broodmaker:1', () => createBroodmakerAsset({ THREE, mats, scale: 1.0 })).root,
    template(THREE, 'sanitizer:mk2:1', () => createEnhancedSanitizerAsset({ THREE, mats, scale: 1.0 })).root,
    template(THREE, 'sanitizer-node:1', () => { const a = createSanitizerNodeAsset({ THREE }); return { root: a.root, head: null, refs: { ring: a.ring } }; }).root,
    template(THREE, 'captain:mk2:1.2', () => createEnhancedCaptainAsset({ THREE, mats, scale: 1.2 })).root,
    template(THREE, 'captain-zone:warning:2.2', () => { const a = createAdZoneMarkerAsset({ THREE, radius: 2.2, palette: { ring: 0xfb7185, fill: 0xf97316 } }); return { root: a.root, head: null, refs: a.refs }; }).root,
    captainBoltTemplate(THREE).root,
    template(THREE, 'zeppelin:mk4:2:3', () => createEnhancedZeppelinAsset({ THREE, mats, scale: 2.0, podCount: 3 })).root,
    adjudicatorMineTemplate(THREE).root,
    transientWarmupRoot(THREE)
  ];
}
