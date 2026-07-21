export function disposeOwnedObject3D(root, {
  disposeGeometries = true,
  disposeMaterials = true
} = {}) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
    if (disposeGeometries && object.geometry) geometries.add(object.geometry);
    if (!disposeMaterials) return;
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of assigned) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return { geometries: geometries.size, materials: materials.size };
}

