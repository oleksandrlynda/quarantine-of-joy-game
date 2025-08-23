import test from 'node:test';
import assert from 'node:assert';
import { PathFinder } from '../src/path.js';

class Vector3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
}
class Box3 {
  constructor(min=new Vector3(), max=new Vector3()){ this.min=min; this.max=max; }
}

test('pathfinder navigates around obstacle', () => {
  const obstacle = new Box3(new Vector3(0,0,0), new Vector3(2,2,2));
  const pf = new PathFinder([obstacle], { climbable: 0.5, cellSize: 1 });
  const path = pf.findPath({ x: -1, z: 0 }, { x: 3, z: 0 });
  assert.ok(path.length > 0);
  for (const p of path) {
    assert.ok(p.x < 0 || p.x > 2 || p.z < 0 || p.z > 2);
  }
});
