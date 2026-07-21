function collectContractObjects(value, output = new Set()) {
  if (value?.isObject3D) output.add(value);
  else if (Array.isArray(value)) value.forEach(item => collectContractObjects(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectContractObjects(item, output));
  return output;
}

function userDataSignature(userData) {
  return JSON.stringify(Object.keys(userData || {}).sort().map(key => [key, userData[key]]));
}

function geometrySignature(geometry) {
  return Object.keys(geometry.attributes || {}).sort().map(name => {
    const attribute = geometry.attributes[name];
    return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}:${attribute.array?.constructor?.name || 'array'}`;
  }).join('|');
}

function canUseVertexPalette(material) {
  return !!material?.isMeshLambertMaterial
    && !material.transparent
    && (material.opacity ?? 1) === 1
    && !material.map
    && !material.alphaMap
    && !material.normalMap
    && (!material.emissive || material.emissive.getHex() === 0 || (material.emissiveIntensity ?? 1) === 0);
}

function applyMaterialColor(THREE, geometry, material) {
  const positions = geometry.getAttribute('position');
  const existing = geometry.getAttribute('color');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    if (material.vertexColors && existing) color.fromBufferAttribute(existing, index).multiply(material.color);
    else color.copy(material.color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function mergeGeometryData(THREE, geometries) {
  const names = Object.keys(geometries[0].attributes || {}).sort();
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const attributes = geometries.map(geometry => geometry.getAttribute(name));
    const SourceArray = attributes[0].array.constructor;
    const length = attributes.reduce((sum, attribute) => sum + attribute.array.length, 0);
    const array = new SourceArray(length);
    let offset = 0;
    attributes.forEach(attribute => {
      array.set(attribute.array, offset);
      offset += attribute.array.length;
    });
    merged.setAttribute(name, new THREE.BufferAttribute(array, attributes[0].itemSize, attributes[0].normalized));
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function batchRigidAsset({ THREE, built } = {}) {
  const root = built?.root || built;
  if (!THREE || !root?.isObject3D) throw new TypeError('batchRigidAsset requires THREE and an asset root.');
  const protectedObjects = collectContractObjects({ head: built?.head, refs: built?.refs });
  const vertexMaterials = new Map();
  const vertexMaterialFor = material => {
    const key = `${material.type}:${material.side}:${material.depthTest ? 1 : 0}:${material.depthWrite ? 1 : 0}`;
    if (!vertexMaterials.has(key)) {
      const replacement = material.clone();
      replacement.name = `rigid_vertex_palette_${material.type}`;
      replacement.color.setHex(0xffffff);
      replacement.vertexColors = true;
      replacement.emissive?.setHex?.(0x000000);
      replacement.emissiveIntensity = 0;
      vertexMaterials.set(key, replacement);
    }
    return vertexMaterials.get(key);
  };
  let sourceMeshes = 0;
  root.traverse(object => { if (object.isMesh) sourceMeshes += 1; });

  const parents = [];
  root.traverse(object => parents.push(object));
  let savedMeshes = 0;
  let batchIndex = 0;

  for (const parent of parents.reverse()) {
    const batches = new Map();
    for (const object of [...parent.children]) {
      if (!object.isMesh || object.isSkinnedMesh || !object.geometry || !object.material || object.children.length) continue;
      if (protectedObjects.has(object) || object.name || Array.isArray(object.material)) continue;
      if (object.morphTargetInfluences || Object.keys(object.geometry.morphAttributes || {}).length) continue;
      if (Object.values(object.userData || {}).some(value => value && typeof value === 'object')) continue;
      object.updateMatrix();
      let geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      if (geometry.index) {
        const nonIndexed = geometry.toNonIndexed();
        geometry.dispose();
        geometry = nonIndexed;
      }
      const vertexPalette = canUseVertexPalette(object.material);
      if (vertexPalette) applyMaterialColor(THREE, geometry, object.material);
      const outputMaterial = vertexPalette ? vertexMaterialFor(object.material) : object.material;
      const key = [
        vertexPalette ? `vertex:${outputMaterial.uuid}` : object.material.uuid,
        geometrySignature(geometry),
        userDataSignature(object.userData),
        object.visible ? 1 : 0,
        object.renderOrder
      ].join('::');
      if (!batches.has(key)) batches.set(key, { material: outputMaterial, objects: [], geometries: [] });
      batches.get(key).objects.push(object);
      batches.get(key).geometries.push(geometry);
    }

    for (const { material, objects, geometries } of batches.values()) {
      if (objects.length < 2) {
        geometries[0].dispose();
        continue;
      }
      const geometry = mergeGeometryData(THREE, geometries);
      geometries.forEach(source => source.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `rigid_batch_${String(batchIndex).padStart(2, '0')}`;
      mesh.userData = { ...objects[0].userData };
      mesh.visible = objects[0].visible;
      mesh.renderOrder = objects[0].renderOrder;
      mesh.castShadow = objects.some(object => object.castShadow);
      mesh.receiveShadow = objects.some(object => object.receiveShadow);
      objects.forEach(object => parent.remove(object));
      parent.add(mesh);
      savedMeshes += objects.length - 1;
      batchIndex += 1;
    }
  }

  let outputMeshes = 0;
  root.traverse(object => { if (object.isMesh) outputMeshes += 1; });
  root.userData.rigidBatch = { sourceMeshes, outputMeshes };
  return { built, sourceMeshes, outputMeshes, savedMeshes };
}
