const copyPoint = (target) => target ? { x: target.x, y: target.y, z: target.z } : null;

export class EnemyPerceptionMemory {
  constructor({ acquireSeconds = 0.15, loseSeconds = 0.25, memorySeconds = 5, searchSeconds = 3 } = {}) {
    this.acquireSeconds = acquireSeconds;
    this.loseSeconds = loseSeconds;
    this.memorySeconds = memorySeconds;
    this.searchSeconds = searchSeconds;
    this._state = new WeakMap();
  }

  clear(root = null) {
    if (root) this._state.delete(root);
    else this._state = new WeakMap();
  }

  seed(root, targetPosition, time = 0) {
    if (!root || !targetPosition) return;
    this._state.set(root, {
      rawWorldLOS: false,
      stableWorldLOS: false,
      visibleFor: 0,
      hiddenFor: 0,
      lastKnownPosition: copyPoint(targetPosition),
      lastSeenAt: time
    });
  }

  observe(root, { dt, time, rawWorldLOS, targetPosition }) {
    let state = this._state.get(root);
    if (!state) {
      state = {
        rawWorldLOS: !!rawWorldLOS,
        stableWorldLOS: false,
        visibleFor: 0,
        hiddenFor: 0,
        lastKnownPosition: null,
        lastSeenAt: -Infinity
      };
      this._state.set(root, state);
    }
    state.rawWorldLOS = !!rawWorldLOS;
    if (state.rawWorldLOS) {
      state.visibleFor += dt;
      state.hiddenFor = 0;
      state.lastKnownPosition = copyPoint(targetPosition);
      state.lastSeenAt = time;
      if (!state.stableWorldLOS && state.visibleFor >= this.acquireSeconds) state.stableWorldLOS = true;
    } else {
      state.hiddenFor += dt;
      state.visibleFor = 0;
      if (state.stableWorldLOS && state.hiddenFor >= this.loseSeconds) state.stableWorldLOS = false;
    }
    const unseenFor = Math.max(0, time - state.lastSeenAt);
    return {
      rawWorldLOS: state.rawWorldLOS,
      stableWorldLOS: state.stableWorldLOS,
      visibleFor: state.visibleFor,
      hiddenFor: state.hiddenFor,
      lastKnownPosition: state.lastKnownPosition ? { ...state.lastKnownPosition } : null,
      unseenFor,
      memoryActive: unseenFor <= this.memorySeconds,
      searchActive: unseenFor > this.memorySeconds && unseenFor <= this.memorySeconds + this.searchSeconds
    };
  }

  get(root, time = 0) {
    const state = this._state.get(root);
    if (!state) return null;
    const unseenFor = Math.max(0, time - state.lastSeenAt);
    return {
      rawWorldLOS: state.rawWorldLOS,
      stableWorldLOS: state.stableWorldLOS,
      visibleFor: state.visibleFor,
      hiddenFor: state.hiddenFor,
      lastKnownPosition: state.lastKnownPosition ? { ...state.lastKnownPosition } : null,
      unseenFor,
      memoryActive: unseenFor <= this.memorySeconds,
      searchActive: unseenFor > this.memorySeconds && unseenFor <= this.memorySeconds + this.searchSeconds
    };
  }
}
