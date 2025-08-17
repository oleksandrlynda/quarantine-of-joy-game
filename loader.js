// src/exportmodels.js
// Loads all GLB models from /src/assets, keeps a prefab registry,
// provides cheap instantiation, and pre-warms shader programs.
//
// Usage:
//   import { loadAllModels, clonePrefab, prewarmAllShaders } from './exportmodels.js';
//   const { registry } = await loadAllModels({ renderer });
//   const tank = clonePrefab('blockbot'); scene.add(tank);
//
// Notes on shaders:
// - We can pre-warm shader programs on launch (renderer.compile/compileAsync).
// - Browsers don't allow saving compiled shader binaries to localStorage.
//   So we warm each material variant once per session.

import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.159.0/examples/jsm/loaders/GLTFLoader.js?module';
import { DRACOLoader } from 'https://unpkg.com/three@0.159.0/examples/jsm/loaders/DRACOLoader.js?module';
import { MeshoptDecoder } from 'https://unpkg.com/three@0.159.0/examples/jsm/libs/meshopt_decoder.module.js?module';
import * as SkeletonUtils from 'https://unpkg.com/three@0.159.0/examples/jsm/utils/SkeletonUtils.js?module';

// ---------- Manifest ----------
// Map a stable key to a GLB path under /src/assets.
// Add/remove lines here as you export more models.
const ASSET_MANIFEST = {
  // Core grunts
  'gruntbot'          : 'src/assets/gruntbot.glb',
  'shooterbot'        : 'src/assets/shooterbot.glb',
  'runnerbot'         : 'src/assets/runnerbot.glb',
  'healerbot'         : 'src/assets/healerbot.glb',
  'sniperbot'         : 'src/assets/sniperbot.glb',
  'winged_drone'      : 'src/assets/winged_drone.glb',

  // Tank / BlockBot v2 (skinned or merged variant)
  'blockbot'          : 'src/assets/blockbot_skinned.glb',

  // Bosses
  'boss_broodmaker'   : 'src/assets/boss_broodmaker.glb',
  'boss_sanitizer'    : 'src/assets/boss_sanitizer.glb',
  'boss_echo'         : 'src/assets/boss_echo_hydraclone.glb',
  'boss_influencer'   : 'src/assets/boss_influencer_captain.glb',
  'boss_zeppelin_pod' : 'src/assets/boss_zeppelin_pod.glb',
  'boss_shard'        : 'src/assets/boss_shard_avatar.glb',
  'boss_strike'       : 'src/assets/boss_strike_adjudicator.glb',
};

// ---------- Loader setup ----------
function makeLoader({ dracoPath = 'src/assets/decoders/draco/', ktx2Path = 'src/assets/textures/', renderer } = {}) {
  const loader = new GLTFLoader();

  // Meshopt (if your GLBs are meshopt-compressed)
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Draco (optional; safe to leave even if unused)
  const draco = new DRACOLoader();
  draco.setDecoderPath(dracoPath);
  loader.setDRACOLoader(draco);

  // KTX2 optional: disabled to avoid cross-version module issues in browser module environment

  return loader;
}

// ---------- Registry + helpers ----------
const _registry = new Map();   // key -> prefab THREE.Object3D
const _materialsByName = new Map(); // optional dedupe by mat.name
let _prewarmed = false;

/**
 * Load all models in ASSET_MANIFEST. Resolves when everything is in registry.
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer - used for shader prewarm (recommended)
 * @param {(done,total)=>void} [options.onProgress]
 * @param {string} [options.dracoPath]
 * @param {string} [options.ktx2Path]
 */
export async function loadAllModels({ renderer, onProgress, dracoPath, ktx2Path } = {}) {
  const loader = makeLoader({ dracoPath, ktx2Path, renderer });

  const keys = Object.keys(ASSET_MANIFEST);
  let done = 0;

  const loadOne = (key, url) => new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const prefab = gltf.scene || gltf.scenes?.[0];
        normalizePrefab(prefab);
        dedupeMaterialsByName(prefab);
        _registry.set(key, prefab);
        done++; onProgress?.(done, keys.length);
        resolve();
      },
      undefined,
      (err) => { console.warn(`[exportmodels] Failed to load ${key} @ ${url}`, err); done++; onProgress?.(done, keys.length); resolve(); }
    );
  });

  await Promise.all(keys.map(k => loadOne(k, ASSET_MANIFEST[k])));

  // Optional: pre-warm shader programs to avoid first-use hitch
  if (renderer && !_prewarmed) {
    try { await prewarmPrograms(renderer, [..._registry.values()]); }
    catch(_) {}
    _prewarmed = true;
  }

  return { registry: _registry };
}

/**
 * Returns a deep clone of a prefab ready to use (shares geometry/materials).
 * Uses SkeletonUtils.clone so SkinnedMesh animations still work.
 */
export function clonePrefab(key) {
  const prefab = _registry.get(key);
  if (!prefab) {
    console.warn(`[exportmodels] Missing prefab for key "${key}"`);
    return null;
  }
  const inst = SkeletonUtils.clone(prefab);
  // Ensure shared materials remain shared unless you change them at runtime.
  return inst;
}

/**
 * Pre-warm all shader programs by compiling representative meshes for every material
 * in the provided prefab registry. Supports optional shadow/depth variants and extra
 * meshes (custom ShaderMaterials, postFX quads, beams, etc.). Stores a lightweight
 * signature list in localStorage for diagnostics only.
 */
export async function prewarmAllShaders(
  renderer,
  {
    registry,
    includeShadows = true,
    includeDepthVariants = true,
    extras = []
  } = {}
) {
  const warmScene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 2, 6);

  // Lighting should match render pipeline so the right programs compile
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 6, 5);
  dir.castShadow = !!includeShadows;
  warmScene.add(hemi, dir);

  const seen = new Set();
  const addRep = (root) => {
    if (!root) return;
    root.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        // Build a key that captures variant-driving flags
        const key = [
          m.type, m.name || '',
          !!m.skinning || !!o.isSkinnedMesh,
          !!m.morphTargets || !!o.morphTargetInfluences,
          !!m.fog, !!m.flatShading, !!m.vertexColors,
          m.envMap ? 'env' : 'noenv',
          renderer.shadowMap?.enabled ? 'shadow' : 'noshadow',
          String(renderer.toneMapping)
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        // Reuse geometry/material to avoid memory churn
        const clone = o.clone(false);
        clone.geometry = o.geometry;
        clone.material = m;
        if (clone.isSkinnedMesh) {
          clone.skeleton = o.skeleton;
          clone.bindMatrix = o.bindMatrix?.clone?.() || clone.bindMatrix;
          clone.bindMode = o.bindMode || 'attached';
        }
        if (includeShadows) { clone.castShadow = true; clone.receiveShadow = true; }
        const i = seen.size - 1;
        clone.position.set((i % 8) * 0.35 - 1.2, 0.2 + Math.floor(i / 8) * 0.35, 0);
        warmScene.add(clone);
      }
    });
  };

  // Registry may be a Map or array
  if (registry && typeof registry.values === 'function') {
    for (const prefab of registry.values()) addRep(prefab);
  } else if (Array.isArray(registry)) {
    for (const prefab of registry) addRep(prefab);
  }
  for (const x of (extras || [])) addRep(x);

  // Compile all programs (async where available)
  if (typeof renderer.compileAsync === 'function') {
    try { await renderer.compileAsync(warmScene, cam); }
    catch { renderer.compile(warmScene, cam); }
  } else {
    renderer.compile(warmScene, cam);
  }

  // Optionally render a tiny frame to force depth/distance variants
  if (includeDepthVariants) {
    const old = renderer.getSize(new THREE.Vector2());
    try {
      renderer.setViewport(0, 0, 8, 8);
      renderer.setScissorTest(false);
      renderer.render(warmScene, cam);
    } finally {
      renderer.setViewport(0, 0, old.x, old.y);
    }
  }

  // Store signatures for debugging
  try { localStorage.setItem('shaderWarmup.signatures', JSON.stringify([...seen])); } catch {}

  // Leave clones to be GC'd with scene; shared materials remain in program cache
}

/**
 * Get the original prefab (do not add to scene directly if you plan to scale/animate many copies).
 */
export function getPrefab(key) {
  return _registry.get(key) || null;
}

// ---------- Internals ----------

// Put pivots at sensible defaults, shadow flags, names, etc.
function normalizePrefab(root) {
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Avoid frustum-culling random bits during boss intros
      // (tweak to taste; you can set true globally then disable per big boss)
      // o.frustumCulled = false;
      if (o.material && !o.material.name) {
        // give the material a stable name for dedup
        o.material.name = o.material.type + '_' + (o.material.color?.getHexString?.() || 'mat');
      }
    }
  });
}

// Re-point equal-named materials to the same instance.
// This greatly reduces program variants & uniform updates across many clones.
function dedupeMaterialsByName(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]; if (!m || !m.name) continue;
      const found = _materialsByName.get(m.name);
      if (found) {
        mats[i] = found;
      } else {
        _materialsByName.set(m.name, m);
      }
    }
    o.material = (mats.length === 1 ? mats[0] : mats);
  });
}

// Build a compact scene with representative meshes and ask WebGLRenderer
// to compile all shader programs up-front.
async function prewarmPrograms(renderer, prefabs) {
  const warmScene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 2, 6);

  // Basic lighting that matches your in-game pipeline (Lambert/Standard etc.)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 6, 5);
  dir.castShadow = false; // enabling shadows increases program variants
  warmScene.add(hemi, dir);

  // Grab one representative mesh per unique material to trigger compilation.
  const seenMats = new Set();
  for (const prefab of prefabs) {
    prefab.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        const key = `${m.type}|${m.name}|${!!m.skinning}|${!!m.morphTargets}`;
        if (seenMats.has(key)) continue;
        seenMats.add(key);

        // Make a tiny box to compile that material path.
        const g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(
          (seenMats.size % 8) * 0.3 - 1.0,
          0.2 + Math.floor(seenMats.size / 8) * 0.3,
          0
        );
        warmScene.add(mesh);
      }
    });
  }

  // Newer three has async compile; fall back to sync if missing.
  if (typeof renderer.compileAsync === 'function') {
    try { await renderer.compileAsync(warmScene, cam); }
    catch (_) { renderer.compile(warmScene, cam); }
  } else {
    renderer.compile(warmScene, cam);
  }

  // Clean temp scene (materials remain in program cache).
  warmScene.traverse(o => { if (o.isMesh) o.geometry.dispose?.(); });
}

// ---------- (Optional) small helpers ----------

/**
 * Quick instancer that clones and applies a transform in one call.
 * Good for one-off spawns:
 *   spawn('runnerbot', { position: [x,y,z], rotationY: r, scale: s })
 */
export function spawnPrefab(key, {
  position = [0,0,0],
  rotationY = 0,
  scale = 1
} = {}) {
  const inst = clonePrefab(key);
  if (!inst) return null;
  inst.position.set(position[0], position[1], position[2]);
  inst.rotation.y = rotationY;
  inst.scale.setScalar(scale);
  return inst;
}
