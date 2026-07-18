export const ASSET_EXPORT_VERSION = 1;

function finiteTuple(values) {
  return values.every(Number.isFinite);
}

function triangleCount(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  return Math.floor((geometry.attributes?.position?.count || 0) / 3);
}

function formatVector(vector) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4))
  };
}

function assignStableNames(root, id) {
  let groupIndex = 0;
  let meshIndex = 0;

  root.traverse((object) => {
    if (object === root) return;
    if (object.isMesh || object.isLine || object.isPoints) {
      if (!object.name) object.name = `${id}_mesh_${String(meshIndex).padStart(3, '0')}`;
      meshIndex += 1;
    } else if (!object.name) {
      object.name = `${id}_group_${String(groupIndex).padStart(3, '0')}`;
      groupIndex += 1;
    }
  });
}

function convertMaterialsForGltf(THREE, root) {
  const replacements = {
    lit: new Map(),
    unlit: new Map()
  };

  const convert = (material, unlit = false) => {
    if (!material || material.isMeshStandardMaterial || material.isMeshBasicMaterial) return material;
    const materialCache = unlit ? replacements.unlit : replacements.lit;
    if (materialCache.has(material)) return materialCache.get(material);

    const MaterialType = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const parameters = {
      name: material.name || `${material.type}_export`,
      color: material.color?.clone?.() || new THREE.Color(0xffffff),
      map: material.map || null,
      alphaMap: material.alphaMap || null,
      opacity: material.opacity ?? 1,
      transparent: material.transparent ?? false,
      alphaTest: material.alphaTest ?? 0,
      side: material.side ?? THREE.FrontSide,
      vertexColors: material.vertexColors ?? false,
      depthTest: material.depthTest ?? true,
      depthWrite: material.depthWrite ?? true
    };
    if (!unlit) parameters.flatShading = material.flatShading ?? true;

    const replacement = new MaterialType(parameters);
    if (replacement.isMeshStandardMaterial) {
      replacement.emissive.copy(material.emissive || new THREE.Color(0x000000));
      replacement.emissiveIntensity = material.emissiveIntensity ?? 1;
      replacement.emissiveMap = material.emissiveMap || null;
      replacement.normalMap = material.normalMap || null;
      replacement.aoMap = material.aoMap || null;
      replacement.metalness = material.metalness ?? 0;
      replacement.roughness = material.roughness ?? .92;
    }
    replacement.userData = { ...material.userData, sourceMaterialType: material.type };
    materialCache.set(material, replacement);
    return replacement;
  };

  root.traverse((object) => {
    if (!object.isMesh && !object.isLine && !object.isPoints) return;
    const unlit = object.isLine || object.isPoints;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => convert(material, unlit))
      : convert(object.material, unlit);
  });
}

export function getAssetRoot(built) {
  return built?.root || built || null;
}

export function prepareAssetForExport({
  THREE,
  definition,
  built,
  centerXZ = true,
  ground = true
}) {
  if (!THREE) throw new TypeError('prepareAssetForExport requires THREE.');
  if (!definition?.id) throw new TypeError('prepareAssetForExport requires an asset definition.');

  const sourceRoot = getAssetRoot(built);
  if (!sourceRoot?.isObject3D) {
    throw new TypeError(`${definition.id} did not return a THREE.Object3D or { root }.`);
  }

  const exportRoot = new THREE.Group();
  exportRoot.name = definition.id;
  exportRoot.userData.asset = {
    id: definition.id,
    category: definition.category,
    exportVersion: ASSET_EXPORT_VERSION
  };

  if (!sourceRoot.name) sourceRoot.name = `${definition.id}_root`;
  exportRoot.add(sourceRoot);
  convertMaterialsForGltf(THREE, exportRoot);
  exportRoot.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(sourceRoot);
  if (!initialBounds.isEmpty()) {
    const center = initialBounds.getCenter(new THREE.Vector3());
    if (centerXZ) {
      sourceRoot.position.x -= center.x;
      sourceRoot.position.z -= center.z;
    }
    if (ground) sourceRoot.position.y -= initialBounds.min.y;
  }

  assignStableNames(exportRoot, definition.id);
  exportRoot.updateMatrixWorld(true);

  return {
    root: exportRoot,
    sourceRoot,
    report: inspectPreparedAsset({ THREE, definition, root: exportRoot, centerXZ, ground })
  };
}

export function inspectPreparedAsset({ THREE, definition, root, centerXZ = true, ground = true }) {
  const issues = [];
  const warnings = [];
  const materials = new Set();
  let meshes = 0;
  let nodes = 0;
  let vertices = 0;
  let triangles = 0;

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    nodes += 1;
    if (!finiteTuple([
      object.position.x, object.position.y, object.position.z,
      object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w,
      object.scale.x, object.scale.y, object.scale.z
    ])) {
      issues.push(`Node ${object.name || '(unnamed)'} contains a non-finite transform.`);
    }

    if (!object.isMesh) return;
    meshes += 1;
    const position = object.geometry?.attributes?.position;
    vertices += position?.count || 0;
    triangles += triangleCount(object.geometry);

    if (!position?.count) issues.push(`Mesh ${object.name || '(unnamed)'} has no position data.`);
    if (position?.array && !finiteTuple(Array.from(position.array))) {
      issues.push(`Mesh ${object.name || '(unnamed)'} contains a non-finite vertex.`);
    }

    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());

  if (!meshes) issues.push('Asset contains no meshes.');
  if (bounds.isEmpty() || !finiteTuple([size.x, size.y, size.z])) issues.push('Asset bounds are empty or invalid.');
  if (ground && !bounds.isEmpty() && Math.abs(bounds.min.y) > 0.001) {
    issues.push(`Grounding failed: minimum Y is ${bounds.min.y.toFixed(4)}.`);
  }
  if (centerXZ && !bounds.isEmpty() && (Math.abs(center.x) > 0.001 || Math.abs(center.z) > 0.001)) {
    warnings.push(`Horizontal pivot is offset (${center.x.toFixed(3)}, ${center.z.toFixed(3)}).`);
  }
  if (triangles > 75000) warnings.push(`High triangle count: ${triangles.toLocaleString()}.`);
  if (materials.size > 16) warnings.push(`High material count: ${materials.size}.`);

  return {
    id: definition.id,
    label: definition.label,
    category: definition.category,
    factory: definition.factoryName,
    valid: issues.length === 0,
    issues,
    warnings,
    metrics: {
      nodes,
      meshes,
      materials: materials.size,
      vertices,
      triangles
    },
    bounds: bounds.isEmpty() ? null : {
      min: formatVector(bounds.min),
      max: formatVector(bounds.max),
      size: formatVector(size)
    }
  };
}

export function manifestEntry(report, file) {
  return {
    id: report.id,
    label: report.label,
    category: report.category,
    file,
    factory: report.factory,
    metrics: report.metrics,
    bounds: report.bounds,
    warnings: report.warnings
  };
}

export function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    });
  });

  textures.forEach((texture) => texture.dispose?.());
  materials.forEach((material) => material.dispose?.());
  geometries.forEach((geometry) => geometry.dispose?.());
}
