const ANIMATED_ASSET_CATEGORIES = new Set(['enemies', 'bosses']);

function geometrySignature(geometry) {
  const attributes = Object.keys(geometry.attributes || {})
    .sort()
    .map(name => {
      const attribute = geometry.attributes[name];
      return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}:${attribute.array?.constructor?.name || 'array'}`;
    })
    .join('|');
  const morphs = Object.keys(geometry.morphAttributes || {})
    .sort()
    .map(name => `${name}:${geometry.morphAttributes[name]?.length || 0}`)
    .join('|');
  return `${attributes}::${morphs}::${geometry.morphTargetsRelative ? 1 : 0}`;
}

export function staticBatchBlocker({ entry, root, hasAnimations = false } = {}) {
  if (!root?.isObject3D) return 'missing-root';
  if (ANIMATED_ASSET_CATEGORIES.has(entry?.category)) return 'animated-category';
  if (hasAnimations) return 'animation-clips';

  let blocker = null;
  root.traverse(object => {
    if (blocker) return;
    if (object.isSkinnedMesh || object.skeleton) blocker = 'skinned-mesh';
    else if (object.morphTargetInfluences || Object.keys(object.geometry?.morphAttributes || {}).length) blocker = 'morph-target';
  });
  return blocker;
}

export function batchStaticPrefab({ THREE, mergeGeometries, entry, root, hasAnimations = false } = {}) {
  if (!THREE || typeof mergeGeometries !== 'function') throw new TypeError('batchStaticPrefab requires THREE and mergeGeometries.');
  const blocker = staticBatchBlocker({ entry, root, hasAnimations });
  if (blocker) return { root, batched: false, blocker, sourceMeshes: 0, outputMeshes: 0 };

  root.updateMatrixWorld(true);
  const contractRoots = new Set([root]);
  root.traverse(object => {
    if (/^state_/i.test(object.name || '') || object.userData?.preserveHierarchy || object.userData?.runtimeAnimated) {
      contractRoots.add(object);
    }
  });
  const zoneFor = object => {
    let cursor = object.parent;
    while (cursor && !contractRoots.has(cursor)) cursor = cursor.parent;
    return cursor || root;
  };
  const batches = new Map();
  let sourceMeshes = 0;

  root.traverse(object => {
    if (!object.isMesh) return;
    sourceMeshes += 1;
    if (!object.geometry || !object.material || object.children.length || Object.keys(object.userData || {}).length) return;
    if (Array.isArray(object.material) && object.material.length !== 1) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const zone = zoneFor(object);
    const toZone = new THREE.Matrix4().copy(zone.matrixWorld).invert().multiply(object.matrixWorld);
    let geometry = object.geometry.clone();
    geometry.applyMatrix4(toZone);
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const key = `${zone.uuid}::${material.uuid}::${geometrySignature(geometry)}::${object.visible ? 1 : 0}::${object.renderOrder}`;
    if (!batches.has(key)) batches.set(key, { zone, material, objects: [], geometries: [] });
    const batch = batches.get(key);
    batch.objects.push(object);
    batch.geometries.push(geometry);
  });

  if (!sourceMeshes || !batches.size) {
    return { root, batched: false, blocker: 'no-batchable-meshes', sourceMeshes, outputMeshes: sourceMeshes };
  }

  let savedMeshes = 0;
  let batchIndex = 0;
  for (const { zone, material, objects, geometries } of batches.values()) {
    if (geometries.length < 2) {
      geometries[0].dispose();
      continue;
    }
    const mergedGeometry = mergeGeometries(geometries, false);
    if (!mergedGeometry) {
      geometries.forEach(geometry => geometry.dispose());
      continue;
    }
    geometries.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(mergedGeometry, material);
    mesh.name = `${entry?.id || root.name || 'generated-prefab'}_batch_${String(batchIndex).padStart(2, '0')}`;
    mesh.visible = objects[0].visible;
    mesh.renderOrder = objects[0].renderOrder;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objects.forEach(object => object.parent?.remove(object));
    zone.add(mesh);
    savedMeshes += objects.length - 1;
    batchIndex += 1;
  }

  let outputMeshes = 0;
  root.traverse(object => { if (object.isMesh) outputMeshes += 1; });
  root.userData.staticBatch = { sourceMeshes, outputMeshes };

  return {
    root,
    batched: savedMeshes > 0,
    blocker: savedMeshes > 0 ? null : 'no-compatible-batches',
    sourceMeshes,
    outputMeshes
  };
}
