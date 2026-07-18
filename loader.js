// src/exportmodels.js
// Loads generated GLB models, keeps a prefab registry,
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
import { MeshoptDecoder } from 'https://unpkg.com/three@0.159.0/examples/jsm/libs/meshopt_decoder.module.js?module';
import * as SkeletonUtils from 'https://unpkg.com/three@0.159.0/examples/jsm/utils/SkeletonUtils.js?module';
import { mergeGeometries } from 'https://unpkg.com/three@0.159.0/examples/jsm/utils/BufferGeometryUtils.js?module';
import { createRuntimeAssetManifest, GENERATED_ASSET_ROOT } from './src/assets/runtime-manifest.js';

// ---------- Manifest ----------
const ASSET_MANIFEST = createRuntimeAssetManifest();

// ---------- Loader setup ----------
function makeLoader() {
  const loader = new GLTFLoader();

  // Meshopt (if your GLBs are meshopt-compressed)
  loader.setMeshoptDecoder(MeshoptDecoder);

  return loader;
}

// ---------- Registry + helpers ----------
const _registry = new Map();   // key -> prefab THREE.Object3D
const _materialsByName = new Map(); // optional dedupe by mat.name
let _prewarmed = false;
let _generatedManifestPromise = null;

// Defensive: some materials may carry stray flags from mismatched libs (e.g., isNodeMaterial)
// or an "onBuild" property that isn't a function. Strip those to avoid renderer errors.
function sanitizeMaterialForCompile(mat){
  if (!mat) return mat;
  try {
    if (mat.isNodeMaterial) mat.isNodeMaterial = false;
  } catch(_) {}
  try {
    if (typeof mat.onBuild !== 'function') {
      // Ensure a callable stub exists so renderers that unconditionally call it do not crash
      mat.onBuild = function(){ /* noop stub for warmup */ };
    }
  } catch(_) {}
  return mat;
}

/**
 * Load all models in ASSET_MANIFEST. Resolves when everything is in registry.
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer - used for shader prewarm (recommended)
 * @param {(done,total)=>void} [options.onProgress]
 * @param {boolean} [options.skipWarmup] - if true, do not prewarm shader programs here
 */
export async function loadAllModels({ renderer, onProgress, skipWarmup } = {}) {
  const loader = makeLoader();

  const keys = Object.keys(ASSET_MANIFEST);
  let done = 0;

  const loadOne = (key, url) => new Promise((resolve) => {
    if (_registry.has(key)) {
      done++; onProgress?.(done, keys.length); resolve(); return;
    }
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
  if (renderer && !_prewarmed && !skipWarmup) {
    try { await prewarmPrograms(renderer, [..._registry.values()]); }
    catch(_) {}
    _prewarmed = true;
  }

  return { registry: _registry };
}

/**
 * Loads selected entries from assets/generated/asset-manifest.json.
 * Static environment prefabs can be merged by material, reducing a source GLB
 * from dozens of small meshes to a handful of renderer draw calls.
 */
export async function loadGeneratedModels({ ids = [], onProgress, optimizeStatic = true } = {}) {
  if (!_generatedManifestPromise) {
    _generatedManifestPromise = fetch(`${GENERATED_ASSET_ROOT}/asset-manifest.json`)
      .then(response => {
        if (!response.ok) throw new Error(`Generated asset manifest returned ${response.status}`);
        return response.json();
      });
  }

  const manifest = await _generatedManifestPromise;
  const requested = new Set(ids);
  const entries = (manifest.assets || []).filter(entry => requested.has(entry.id));
  const loader = makeLoader();
  let done = 0;

  const loadOne = entry => new Promise(resolve => {
    if (_registry.has(entry.id)) {
      done++; onProgress?.(done, entries.length); resolve(); return;
    }
    loader.load(
      `${GENERATED_ASSET_ROOT}/${entry.file}`,
      gltf => {
        let prefab = gltf.scene || gltf.scenes?.[0];
        normalizePrefab(prefab);
        dedupeMaterialsByName(prefab);
        if (optimizeStatic) prefab = mergeStaticPrefabByMaterial(prefab);
        _registry.set(entry.id, prefab);
        done++; onProgress?.(done, entries.length); resolve();
      },
      undefined,
      error => {
        console.warn(`[exportmodels] Failed to load generated asset ${entry.id}`, error);
        done++; onProgress?.(done, entries.length); resolve();
      }
    );
  });

  await Promise.all(entries.map(loadOne));
  return { registry: _registry, loaded: entries.map(entry => entry.id) };
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
  // GLTF extras and Material.clone() can leave a non-callable onBuild value.
  // Sanitize at the final clone boundary as well as at import time because a
  // bad value otherwise fails only when WebGLRenderer first sees the mesh.
  inst.traverse(object => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    if (Array.isArray(object.material)) object.material.forEach(sanitizeMaterialForCompile);
    else sanitizeMaterialForCompile(object.material);
  });
  // Geometry and materials stay shared unless a caller explicitly clones them.
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
  try {
    try {
      const u = new URL(window.location.href);
      const skip = (u.searchParams.get('warmup') === '0') || (localStorage.getItem('disableShaderWarmup') === '1');
      if (skip) return;
    } catch(_) {}
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
        if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isLine || o.isLineSegments || o.isPoints) || !o.material) return;
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
          clone.material = sanitizeMaterialForCompile(m);
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

    // Final sweep: ensure no mesh carries stray node flags
    warmScene.traverse(obj => {
      if (obj && (obj.isMesh || obj.isSkinnedMesh || obj.isInstancedMesh)) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (let i=0;i<mats.length;i++){ mats[i] = sanitizeMaterialForCompile(mats[i]); }
        obj.material = (mats.length === 1 ? mats[0] : mats);
      }
    });

    // Compile all programs (async where available)
    try {
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(warmScene, cam);
      } else {
        renderer.compile(warmScene, cam);
      }
    } catch (err) {
      console.warn('[exportmodels] Warmup compile failed; diagnosing materials…', err);
      await _diagnoseAndBypassBadMaterials(renderer, warmScene, cam);
      try { localStorage.setItem('disableShaderWarmup', '1'); } catch(_) {}
    }

    // Optionally render a tiny frame to force depth/distance variants
    if (includeDepthVariants) {
      const old = renderer.getSize(new THREE.Vector2());
      try {
        try {
          renderer.setViewport(0, 0, 8, 8);
          renderer.setScissorTest(false);
          renderer.render(warmScene, cam);
        } catch (err) {
          console.warn('[exportmodels] Depth-variant render during warmup failed; diagnosing…', err);
          try { await _diagnoseAndBypassBadMaterials(renderer, warmScene, cam); } catch(_) {}
        }
      } finally {
        renderer.setViewport(0, 0, old.x, old.y);
      }
    }

    // Store signatures for debugging
    try { localStorage.setItem('shaderWarmup.signatures', JSON.stringify([...seen])); } catch {}

    // Leave clones to be GC'd with scene; shared materials remain in program cache
  } catch (outer) {
    console.warn('[exportmodels] prewarmAllShaders outer failure; skipping warmup.', outer);
    try { localStorage.setItem('disableShaderWarmup', '1'); } catch(_) {}
  }
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
      // sanitize materials proactively
      if (o.material) {
        if (Array.isArray(o.material)) {
          for (let i=0;i<o.material.length;i++) { o.material[i] = sanitizeMaterialForCompile(o.material[i]); }
        } else {
          o.material = sanitizeMaterialForCompile(o.material);
        }
      }
    }
  });
}

function mergeStaticPrefabByMaterial(root) {
  if (!root) return root;
  root.updateMatrixWorld(true);
  const batches = new Map();

  root.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh || !object.geometry || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    // Generated environment primitives currently use one material per mesh.
    // Keep uncommon multi-material meshes intact instead of risking group loss.
    if (materials.length !== 1) return;
    const material = materials[0];
    let geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    // BufferGeometryUtils requires every geometry in a batch to agree on
    // indexed state and on its complete attribute schema. Generated GLBs can
    // legally mix indexed boxes with non-indexed decorative meshes while
    // sharing one material, so normalize indices and split by schema.
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const attributeSignature = Object.keys(geometry.attributes)
      .sort()
      .map(name => {
        const attribute = geometry.attributes[name];
        return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}:${attribute.array?.constructor?.name || 'array'}`;
      })
      .join('|');
    const morphSignature = Object.keys(geometry.morphAttributes || {})
      .sort()
      .map(name => `${name}:${geometry.morphAttributes[name]?.length || 0}`)
      .join('|');
    const key = `${material.uuid}::${attributeSignature}::${morphSignature}::${geometry.morphTargetsRelative ? 1 : 0}`;
    if (!batches.has(key)) batches.set(key, { material, geometries: [] });
    batches.get(key).geometries.push(geometry);
  });

  if (!batches.size) return root;
  const mergedRoot = new THREE.Group();
  mergedRoot.name = `${root.name || 'generated-prefab'}_merged`;
  for (const { material, geometries } of batches.values()) {
    const mergedGeometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!mergedGeometry) {
      // Defensive preservation: a future Three.js compatibility rule should
      // reduce batching efficiency, never remove visible asset geometry.
      for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, sanitizeMaterialForCompile(material));
        mesh.name = `${mergedRoot.name}_${material.name || material.type}_part`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mergedRoot.add(mesh);
      }
      continue;
    }
    if (geometries.length > 1) geometries.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(mergedGeometry, sanitizeMaterialForCompile(material));
    mesh.name = `${mergedRoot.name}_${material.name || material.type}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mergedRoot.add(mesh);
  }
  return mergedRoot.children.length ? mergedRoot : root;
}

// Re-point equal-named materials to the same instance.
// This greatly reduces program variants & uniform updates across many clones.
function dedupeMaterialsByName(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]; if (!m) continue; sanitizeMaterialForCompile(m); if (!m.name) continue;
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
        sanitizeMaterialForCompile(m);
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
  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(warmScene, cam);
    } else {
      renderer.compile(warmScene, cam);
    }
  } catch (err) {
    console.warn('[exportmodels] Warmup(prewarmPrograms) compile failed; diagnosing materials…', err);
    await _diagnoseAndBypassBadMaterials(renderer, warmScene, cam);
  }

  // Clean temp scene (materials remain in program cache).
  warmScene.traverse(o => { if (o.isMesh) o.geometry.dispose?.(); });
}

// Attempt to find which materials cause compile failure; for each mesh, try compiling alone.
// On failure, sanitize aggressively and, if needed, replace with a temporary safe material
// just for warmup to avoid aborting startup. This does not modify the original prefabs.
async function _diagnoseAndBypassBadMaterials(renderer, scene, camera){
  const offenders = [];
  const meshes = [];
  scene.traverse(o => { if (o && (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) meshes.push(o); });
  for (const m of meshes){
    // try this mesh alone
    const holder = new (scene.constructor)();
    holder.add(m);
    try {
      if (typeof renderer.compileAsync === 'function') { await renderer.compileAsync(holder, camera); }
      else { renderer.compile(holder, camera); }
    } catch (e) {
      // offending material(s)
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (let i=0;i<mats.length;i++){
        const mat = mats[i];
        if (!mat) continue;
        const before = { type: mat.type, name: mat.name, hasOnBuild: !!mat.onBuild, onBuildType: typeof mat.onBuild, isNodeMaterial: !!mat.isNodeMaterial };
        console.warn('[exportmodels] Offending material during warmup', before, mat);
        // aggressive sanitize
        try { mat.isNodeMaterial = false; } catch(_){}
        try { mat.onBuild = function(){}; } catch(_){}
        // Try again with sanitized
        try {
          if (typeof renderer.compileAsync === 'function') { await renderer.compileAsync(holder, camera); }
          else { renderer.compile(holder, camera); }
          continue; // sanitized worked
        } catch(_e){ /* still failing */ }
        // Hide this mesh for warmup only to avoid aborting startup
        console.warn('[exportmodels] Hiding problematic mesh for warmup');
        m.visible = false;
        offenders.push(before);
      }
    } finally {
      holder.remove(m);
    }
  }
  // After replacements, attempt full compile again to finish warming remaining materials
  try {
    if (typeof renderer.compileAsync === 'function') { await renderer.compileAsync(scene, camera); }
    else { renderer.compile(scene, camera); }
  } catch (err) {
    console.warn('[exportmodels] Warmup still failing after bypass; continuing without full warmup.', err, offenders);
  }
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
