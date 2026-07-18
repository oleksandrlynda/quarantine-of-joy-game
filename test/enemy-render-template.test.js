import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneNodeMaterial,
  cloneRenderTemplate,
  getCachedRenderResource,
  instantiateSharedTemplate
} from '../src/enemies/render-template.js';

class Node {
  constructor(name, geometry = null, material = null) {
    this.name = name;
    this.geometry = geometry;
    this.material = material;
    this.children = [];
    this.parent = null;
    this.position = { x: 0, y: 0, z: 0 };
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  clone(recursive) {
    const clone = new Node(this.name, this.geometry, this.material);
    clone.position = { ...this.position };
    if (recursive) for (const child of this.children) clone.add(child.clone(true));
    return clone;
  }
}

function createTemplate() {
  const geometry = { id: 'shared-geometry' };
  const material = { id: 'shared-material', clone() { return { ...this, id: `${this.id}-clone` }; } };
  const root = new Node('root');
  const body = new Node('body', geometry, material);
  const head = new Node('head', geometry, material);
  const left = new Node('left', geometry, material);
  const right = new Node('right', geometry, material);
  root.add(body);
  body.add(head);
  root.add(left);
  root.add(right);
  return {
    root,
    head,
    refs: { body, wings: [left, right], nested: { target: head } }
  };
}

test('shared template factory runs once and clones retain shared render resources', () => {
  const cache = new Map();
  let factoryCalls = 0;
  const create = () => { factoryCalls++; return createTemplate(); };

  const first = instantiateSharedTemplate(cache, 'flyer', create);
  const second = instantiateSharedTemplate(cache, 'flyer', create);

  assert.equal(factoryCalls, 1);
  assert.notEqual(first.root, second.root);
  assert.equal(first.refs.body.geometry, second.refs.body.geometry);
  assert.equal(first.refs.body.material, second.refs.body.material);
});

test('head and direct, array, and nested refs map to each visible clone', () => {
  const source = createTemplate();
  const cloned = cloneRenderTemplate(source);

  assert.equal(cloned.head, cloned.refs.nested.target);
  assert.equal(cloned.refs.body, cloned.root.children[0]);
  assert.deepEqual(cloned.refs.wings, [cloned.root.children[1], cloned.root.children[2]]);
  assert.notEqual(cloned.head, source.head);
  assert.equal(cloned.head.parent, cloned.refs.body);
});

test('instance transforms are isolated while selected animated materials can be cloned', () => {
  const source = createTemplate();
  const first = cloneRenderTemplate(source);
  const second = cloneRenderTemplate(source);

  first.refs.wings[0].position.x = 9;
  assert.equal(second.refs.wings[0].position.x, 0);

  const sharedMaterial = second.head.material;
  cloneNodeMaterial(first.head);
  assert.notEqual(first.head.material, sharedMaterial);
  assert.equal(second.head.material, sharedMaterial);
  assert.equal(first.head.geometry, second.head.geometry);
});

test('invalid templates fail early instead of silently sharing live nodes', () => {
  assert.throws(() => cloneRenderTemplate({}), /cloneable root/);
});

test('transient meshes can share one cached geometry without repeated factories', () => {
  const cache = new Map();
  let factoryCalls = 0;
  const first = getCachedRenderResource(cache, 'projectile', () => ({ id: ++factoryCalls }));
  const second = getCachedRenderResource(cache, 'projectile', () => ({ id: ++factoryCalls }));

  assert.equal(factoryCalls, 1);
  assert.equal(first, second);
});
