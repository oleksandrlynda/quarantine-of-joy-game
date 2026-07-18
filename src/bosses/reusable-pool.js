// Small lifecycle-aware pool for short-lived boss visuals. The pool owns every
// object created by `create`; callers only acquire/release them.
export class ReusablePool {
  constructor({ create, reset = null, release = null, destroy = null, preallocate = 0 } = {}) {
    if (typeof create !== 'function') throw new TypeError('ReusablePool requires create()');
    this._create = create;
    this._reset = reset;
    this._release = release;
    this._destroy = destroy;
    this._available = [];
    this._active = new Set();
    this._owned = new Set();
    this._destroyed = false;

    for (let i = 0; i < preallocate; i++) this._available.push(this._make());
  }

  _make() {
    const value = this._create();
    this._owned.add(value);
    return value;
  }

  acquire(context) {
    if (this._destroyed) throw new Error('Cannot acquire from a destroyed pool');
    const value = this._available.pop() || this._make();
    this._active.add(value);
    this._reset?.(value, context);
    return value;
  }

  release(value, context) {
    if (!this._active.delete(value)) return false;
    this._release?.(value, context);
    this._available.push(value);
    return true;
  }

  releaseAll(context) {
    for (const value of Array.from(this._active)) this.release(value, context);
  }

  destroy(context) {
    if (this._destroyed) return;
    this.releaseAll(context);
    for (const value of this._owned) this._destroy?.(value, context);
    this._available.length = 0;
    this._active.clear();
    this._owned.clear();
    this._destroyed = true;
  }

  get activeCount() { return this._active.size; }
  get totalCount() { return this._owned.size; }
}
