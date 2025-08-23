// Minimal binary min-heap used for A* pathfinding.
// Stores elements in a contiguous array; best item at index 0.
// Designed for small grids so memory overhead stays low.
export default class MinHeap {
  constructor(compare = (a, b) => a - b){
    this._cmp = compare;
    this._data = [];
  }
  size(){ return this._data.length; }
  isEmpty(){ return this._data.length === 0; }
  push(item){
    const data = this._data;
    data.push(item);
    this._bubbleUp(data.length - 1);
    return data.length;
  }
  pop(){
    const data = this._data;
    if (data.length === 0) return undefined;
    const top = data[0];
    const bottom = data.pop();
    if (data.length > 0){
      data[0] = bottom;
      this._bubbleDown(0);
    }
    return top;
  }
  _bubbleUp(idx){
    const data = this._data;
    const cmp = this._cmp;
    while(idx > 0){
      const parent = (idx - 1) >> 1;
      if (cmp(data[idx], data[parent]) >= 0) break;
      [data[idx], data[parent]] = [data[parent], data[idx]];
      idx = parent;
    }
  }
  _bubbleDown(idx){
    const data = this._data;
    const cmp = this._cmp;
    const len = data.length;
    while(true){
      let left = idx * 2 + 1;
      let right = left + 1;
      let smallest = idx;
      if (left < len && cmp(data[left], data[smallest]) < 0) smallest = left;
      if (right < len && cmp(data[right], data[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      [data[idx], data[smallest]] = [data[smallest], data[idx]];
      idx = smallest;
    }
  }
}
