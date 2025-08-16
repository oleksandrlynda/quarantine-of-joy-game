// Hitscan helper: performs a raycast with optional origin/dir/range and returns hit info

export function performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin: originOpt, dir: dirOpt, range = 80, pierce = 0 }) {
  const dir = dirOpt ? dirOpt.clone().normalize() : (new THREE.Vector3(), camera.getWorldDirection(new THREE.Vector3()));
  const origin = originOpt ? originOpt.clone() : camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir);
  // Narrow raycaster
  raycaster.far = Math.max(0.1, range);
  const candidates = enemyManager.getEnemyRaycastTargets ? enemyManager.getEnemyRaycastTargets() : Array.from(enemyManager.enemies);
  const hitsEnemies = candidates.length ? raycaster.intersectObjects(candidates, true) : [];
  let hit = null;
  if (hitsEnemies.length) {
    hit = hitsEnemies[0];
  } else {
    hit = (objects && objects.length) ? (raycaster.intersectObjects(objects, true)[0] || null) : null;
  }
  let end = origin.clone().add(dir.clone().multiplyScalar(range));
  let result = { type: 'none', endPoint: end, origin };

  if (hit) {
    end.copy(hit.point);
    // find root enemy mesh via manager
    let obj = hit.object; while (obj && !enemyManager.enemies.has(obj)) { obj = obj.parent; }
    if (obj) {
      const isHead = (hit.object === obj.userData.head) || (hit.object?.userData?.bodyPart === 'head');
      let bodyPart = 'torso';
      if (hit.object?.userData?.bodyPart) bodyPart = hit.object.userData.bodyPart;
      return { type: 'enemy', isHead: !!isHead, bodyPart, endPoint: end.clone(), origin, dir, enemyRoot: obj, hitObject: hit.object, hitFace: hit.face, distance: origin.distanceTo(end), remainingPierce: pierce };
    } else {
      // not enemy
      return { type: 'world', endPoint: end.clone(), origin, dir, hitObject: hit.object, hitPoint: hit.point, hitFace: hit.face, distance: origin.distanceTo(end) };
    }
  }
  return result;
}


