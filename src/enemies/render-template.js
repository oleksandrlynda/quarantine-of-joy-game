// Clone an enemy hierarchy while retaining immutable geometry/material resources.
// Three.js Object3D.clone(true) gives every instance independent transforms, but
// deliberately shares Geometry and Material objects. Call cloneNodeMaterial for
// the small number of meshes whose materials are animated at runtime.

function pathFromRoot(root, node) {
  if (!root || !node) return null;
  if (node === root) return [];

  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parent;
    if (!parent || !Array.isArray(parent.children)) return null;
    const index = parent.children.indexOf(current);
    if (index < 0) return null;
    path.push(index);
    current = parent;
  }
  return current === root ? path.reverse() : null;
}

function followPath(root, path) {
  let current = root;
  for (const index of path) {
    if (!current || !Array.isArray(current.children) || index >= current.children.length) return null;
    current = current.children[index];
  }
  return current;
}

function remapValue(sourceRoot, cloneRoot, value) {
  if (value == null) return value;

  const path = pathFromRoot(sourceRoot, value);
  if (path !== null) return followPath(cloneRoot, path);

  if (Array.isArray(value)) {
    return value.map((entry) => remapValue(sourceRoot, cloneRoot, entry));
  }

  const prototype = typeof value === 'object' ? Object.getPrototypeOf(value) : null;
  if (prototype === Object.prototype || prototype === null) {
    const mapped = {};
    for (const [key, entry] of Object.entries(value)) {
      mapped[key] = remapValue(sourceRoot, cloneRoot, entry);
    }
    return mapped;
  }

  return value;
}

export function cloneRenderTemplate(template) {
  if (!template?.root || typeof template.root.clone !== 'function') {
    throw new TypeError('A render template with a cloneable root is required');
  }

  const root = template.root.clone(true);
  return {
    root,
    head: remapValue(template.root, root, template.head) || null,
    refs: remapValue(template.root, root, template.refs || {})
  };
}

export function instantiateSharedTemplate(cache, key, createTemplate) {
  let template = cache.get(key);
  if (!template) {
    template = createTemplate();
    cache.set(key, template);
  }
  return cloneRenderTemplate(template);
}

export function getCachedRenderResource(cache, key, createResource) {
  let resource = cache.get(key);
  if (!resource) {
    resource = createResource();
    cache.set(key, resource);
  }
  return resource;
}

export function cloneNodeMaterial(node) {
  if (!node?.material) return null;
  if (Array.isArray(node.material)) {
    node.material = node.material.map((material) => material?.clone?.() || material);
  } else if (typeof node.material.clone === 'function') {
    node.material = node.material.clone();
  }
  return node.material;
}
