// Hitscan helper: performs a raycast with optional origin/dir/range and returns hit info

export function performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin: originOpt, dir: dirOpt, range = 80, pierce = 0 }) {
  const dir = dirOpt ? dirOpt.clone().normalize() : (new THREE.Vector3(), camera.getWorldDirection(new THREE.Vector3()));
  const origin = originOpt ? originOpt.clone() : camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir);
  const candidates = [...enemyManager.enemies, ...objects];
  const hits = raycaster.intersectObjects(candidates, true);
  let end = origin.clone().add(dir.clone().multiplyScalar(range));
  let result = { type: 'none', endPoint: end, origin };

  if (hits.length) {
    const hit = hits[0];
    end.copy(hit.point);
    // find root enemy mesh via manager
    let obj = hit.object; while (obj && !enemyManager.enemies.has(obj)) { obj = obj.parent; }
    if (obj) {
      const isHead = (hit.object === obj.userData.head);
      return { type: 'enemy', isHead: !!isHead, endPoint: end.clone(), origin, dir, enemyRoot: obj, hitFace: hit.face, distance: origin.distanceTo(end), remainingPierce: pierce };
    } else {
      // not enemy
      return { type: 'world', endPoint: end.clone(), origin, dir, hitObject: hit.object, hitPoint: hit.point, hitFace: hit.face, distance: origin.distanceTo(end) };
    }
  }
  return result;
}


