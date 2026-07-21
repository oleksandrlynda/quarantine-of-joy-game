// Hitscan helper: performs a raycast with optional origin/dir/range and returns hit info

export function performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin: originOpt, dir: dirOpt, range = 80, pierce = 0 }) {
  const dir = dirOpt ? dirOpt.clone().normalize() : (new THREE.Vector3(), camera.getWorldDirection(new THREE.Vector3()));
  const origin = originOpt ? originOpt.clone() : camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, dir);
  // Narrow raycaster
  raycaster.far = Math.max(0.1, range);
  const candidates = enemyManager.getEnemyRaycastTargets ? enemyManager.getEnemyRaycastTargets() : Array.from(enemyManager.enemies);
  const hitsEnemies = candidates.length ? raycaster.intersectObjects(candidates, true) : [];
  const enemyHit = hitsEnemies[0] || null;
  const shotBlockers = objects?.filter?.(object => object?.userData?.blocksShots !== false) || [];
  const worldHit = shotBlockers.length ? (raycaster.intersectObjects(shotBlockers, true)[0] || null) : null;
  // Enemy and world targets live in separate collections, so choose the
  // nearest intersection across both collections.
  const hit = enemyHit && (!worldHit || enemyHit.distance <= worldHit.distance)
    ? enemyHit
    : worldHit;
  // Compact support diagnostic for spatial collision reports. It is intentionally
  // pull-based (qojLastShot()) so normal firing does not spam the console.
  try {
    const selectedType = hit === enemyHit ? 'enemy' : (hit === worldHit ? 'world' : 'none');
    let worldOwner = worldHit?.object || null;
    let namedWorldOwner = worldOwner?.name ? worldOwner : null;
    for (let owner = worldOwner; owner; owner = owner.parent) {
      if (!namedWorldOwner && owner.name) namedWorldOwner = owner;
      if (owner.userData?.colliderId) {
        worldOwner = owner;
        break;
      }
      if (!owner.parent) worldOwner = namedWorldOwner || worldOwner;
    }
    globalThis.__QOJ_LAST_SHOT = {
      selectedType,
      enemyDistance: enemyHit ? Number(enemyHit.distance.toFixed(3)) : null,
      enemyObject: enemyHit?.object?.name || null,
      enemyBodyPart: enemyHit?.object?.userData?.bodyPart || null,
      worldDistance: worldHit ? Number(worldHit.distance.toFixed(3)) : null,
      worldObject: worldOwner?.name || null,
      colliderId: worldOwner?.userData?.colliderId || null,
      blocksShots: worldOwner?.userData?.blocksShots ?? worldHit?.object?.userData?.blocksShots ?? null
    };
    globalThis.qojLastShot = () => JSON.stringify(globalThis.__QOJ_LAST_SHOT);
  } catch {}
  let end = origin.clone().add(dir.clone().multiplyScalar(range));
  let result = { type: 'none', endPoint: end, origin };

  if (hit) {
    end.copy(hit.point);
    // find root enemy mesh via manager
    let obj = hit.object; while (obj && !enemyManager.enemies.has(obj)) { obj = obj.parent; }
    if (obj) {
      let bodyPart = 'torso';
      if (hit.object?.userData?.bodyPart) bodyPart = hit.object.userData.bodyPart;
      // Authored weak points use the existing head-damage path so every weapon
      // receives its intended precision bonus without duplicating damage rules.
      const isWeakpoint = bodyPart === 'weakpoint';
      const isHead = (hit.object === obj.userData.head) || bodyPart === 'head' || isWeakpoint;
      return { type: 'enemy', isHead: !!isHead, isWeakpoint, bodyPart, endPoint: end.clone(), origin, dir, enemyRoot: obj, hitObject: hit.object, hitFace: hit.face, distance: origin.distanceTo(end), remainingPierce: pierce };
    } else {
      // not enemy
      return { type: 'world', endPoint: end.clone(), origin, dir, hitObject: hit.object, hitPoint: hit.point, hitFace: hit.face, distance: origin.distanceTo(end) };
    }
  }
  return result;
}


