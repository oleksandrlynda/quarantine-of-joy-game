export const FINAL_CUT_VARIANTS = Object.freeze({
  BACKDROP: 'backdrop',
  FOLD: 'fold',
  SIDE_EXIT: 'side_exit',
  FALL_APART: 'fall_apart',
  SIGNAL_LOST: 'signal_lost',
  CORKSCREW: 'corkscrew'
});

const GROUNDED_GRADE_I = Object.freeze([FINAL_CUT_VARIANTS.BACKDROP, FINAL_CUT_VARIANTS.FOLD]);
const GROUNDED_GRADE_II = Object.freeze([
  FINAL_CUT_VARIANTS.BACKDROP,
  FINAL_CUT_VARIANTS.FOLD,
  FINAL_CUT_VARIANTS.SIDE_EXIT
]);

function stableHash(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectFinalCutVariant({ grade = 1, wave = 1, enemyType = 'grunt', enemyId = 0, airborne = false } = {}) {
  const currentGrade = Math.min(2, Math.max(1, Math.floor(Number(grade) || 1)));
  const hash = stableHash(`${Math.floor(Number(wave) || 1)}:${enemyType}:${enemyId}`);
  if (airborne) {
    return currentGrade >= 2 && hash % 10 === 0
      ? FINAL_CUT_VARIANTS.CORKSCREW
      : FINAL_CUT_VARIANTS.SIGNAL_LOST;
  }
  if (currentGrade >= 2 && hash % 10 === 0) return FINAL_CUT_VARIANTS.FALL_APART;
  const pool = currentGrade >= 2 ? GROUNDED_GRADE_II : GROUNDED_GRADE_I;
  return pool[hash % pool.length];
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function hasRenderableMesh(root) {
  let found = false;
  root?.traverse?.(node => { if (node.isMesh) found = true; });
  return found;
}

function findModelRoot(root) {
  let modelRoot = root;
  while (modelRoot?.children?.length === 1) {
    const onlyChild = modelRoot.children[0];
    if (onlyChild?.isMesh || !onlyChild?.children?.length) break;
    modelRoot = onlyChild;
  }
  return modelRoot;
}

function findMirroredAssemblies(parent) {
  const groups = (parent?.children || []).filter(node => !node.isMesh && hasRenderableMesh(node));
  const mirrored = [];
  for (let left = 0; left < groups.length; left++) {
    for (let right = left + 1; right < groups.length; right++) {
      const a = groups[left];
      const b = groups[right];
      if (a.position.x * b.position.x >= 0) continue;
      if (Math.abs(Math.abs(a.position.x) - Math.abs(b.position.x)) > 0.18) continue;
      mirrored.push(a, b);
    }
  }
  return [...new Set(mirrored)];
}

function subtreeFloorY(node, root) {
  let minY = Infinity;
  node.traverse?.(child => {
    const geometry = child.geometry;
    if (!child.isMesh || !geometry) return;
    geometry.computeBoundingBox?.();
    const bounds = geometry.boundingBox;
    if (!bounds?.min?.clone) return;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = bounds.min.clone().set(x, y, z);
          child.localToWorld(corner);
          root.worldToLocal(corner);
          minY = Math.min(minY, corner.y);
        }
      }
    }
  });
  return Number.isFinite(minY) ? minY : -0.12;
}

function collectFallApartPieces(root) {
  if (typeof root?.traverse !== 'function' || typeof root?.attach !== 'function') return [];
  const modelRoot = findModelRoot(root);
  const primary = (modelRoot?.children || []).filter(node => (
    node.position && node.rotation && node.scale && hasRenderableMesh(node)
  ));
  const nested = primary.flatMap(findMirroredAssemblies);
  const candidates = [...new Set([...primary, ...nested])];
  root.updateMatrixWorld?.(true);
  for (const node of candidates) root.attach(node);
  root.updateMatrixWorld?.(true);
  const pieces = candidates.map((node, index) => {
    const seed = stableHash(`${node.name || node.userData?.bodyPart || node.type || 'part'}:${index}`);
    const angle = (seed % 6283) / 1000;
    const radius = 1.0 + ((seed >>> 5) % 66) / 100;
    return {
      node,
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone(),
      targetX: node.position.x + Math.cos(angle) * radius,
      targetY: 0,
      targetZ: node.position.z + Math.sin(angle) * radius,
      spinX: ((((seed >>> 11) % 17) - 8) / 8) * 1.45,
      spinY: ((((seed >>> 16) % 17) - 8) / 8) * 1.10,
      spinZ: ((((seed >>> 21) % 17) - 8) / 8) * 1.75,
      lift: 0.28 + ((seed >>> 26) % 24) / 100
    };
  });
  for (const piece of pieces) {
    piece.node.position.set(piece.targetX, 0, piece.targetZ);
    piece.node.rotation.set(
      piece.rotation.x + piece.spinX,
      piece.rotation.y + piece.spinY,
      piece.rotation.z + piece.spinZ
    );
    root.updateMatrixWorld?.(true);
    piece.targetY = 0.025 - subtreeFloorY(piece.node, root);
    piece.node.position.copy(piece.position);
    piece.node.rotation.copy(piece.rotation);
  }
  root.updateMatrixWorld?.(true);
  return pieces;
}

export function createFinalCutMotion(root, { variant = FINAL_CUT_VARIANTS.BACKDROP, grade = 1, direction } = {}) {
  if (!root?.position || !root?.rotation || !root?.scale || !direction?.clone) return null;
  const currentGrade = Math.min(2, Math.max(1, Math.floor(Number(grade) || 1)));
  const startPosition = root.position.clone();
  const startRotation = root.rotation.clone();
  const startScale = root.scale.clone();
  const forward = direction.clone();
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, 1);
  forward.normalize();
  const side = forward.clone().set(-forward.z, 0, forward.x);
  const sign = stableHash(`${startPosition.x.toFixed(2)}:${startPosition.z.toFixed(2)}:${variant}`) % 2 === 0 ? 1 : -1;
  const fallApartPieces = variant === FINAL_CUT_VARIANTS.FALL_APART ? collectFallApartPieces(root) : [];
  const durations = {
    [FINAL_CUT_VARIANTS.BACKDROP]: currentGrade >= 2 ? 1.30 : 1.12,
    [FINAL_CUT_VARIANTS.FOLD]: currentGrade >= 2 ? 1.22 : 1.08,
    [FINAL_CUT_VARIANTS.SIDE_EXIT]: 1.24,
    [FINAL_CUT_VARIANTS.FALL_APART]: 1.62,
    [FINAL_CUT_VARIANTS.SIGNAL_LOST]: currentGrade >= 2 ? 1.42 : 1.24,
    [FINAL_CUT_VARIANTS.CORKSCREW]: 1.38
  };
  const duration = durations[variant] || durations[FINAL_CUT_VARIANTS.BACKDROP];

  function restore() {
    root.position.copy(startPosition);
    root.rotation.copy(startRotation);
    root.scale.copy(startScale);
    for (const piece of fallApartPieces) {
      piece.node.position.copy(piece.position);
      piece.node.rotation.copy(piece.rotation);
      piece.node.scale.copy(piece.scale);
    }
  }

  function applyElapsed(elapsed) {
    restore();
    const time = Math.max(0, Math.min(duration, Number(elapsed) || 0));
    const t = duration > 0 ? time / duration : 1;

    if (variant === FINAL_CUT_VARIANTS.FOLD) {
      const hold = currentGrade >= 2 ? 0.16 : 0.12;
      const fall = smoothstep((time - hold) / Math.max(0.01, duration - hold));
      const buckle = smoothstep(Math.min(1, fall * 2.25));
      root.position.addScaledVector(forward, fall * (currentGrade >= 2 ? 0.58 : 0.42));
      root.position.y = startPosition.y + Math.sin(Math.PI * fall) * 0.08;
      root.rotation.x -= fall * (currentGrade >= 2 ? 1.56 : 1.36);
      root.rotation.z += sign * buckle * 0.10;
      root.scale.y = startScale.y * (1 - buckle * 0.12);
      return;
    }

    if (variant === FINAL_CUT_VARIANTS.SIDE_EXIT) {
      const hold = 0.15;
      const fall = smoothstep((time - hold) / Math.max(0.01, duration - hold));
      root.position.addScaledVector(side, sign * fall * 1.48);
      root.position.addScaledVector(forward, fall * 0.22);
      root.position.y = startPosition.y + Math.sin(Math.PI * fall) * 0.06;
      root.rotation.x += fall * 0.18;
      root.rotation.y += sign * fall * 0.24;
      root.rotation.z -= sign * fall * 1.38;
      return;
    }

    if (variant === FINAL_CUT_VARIANTS.FALL_APART) {
      const release = smoothstep((time - 0.18) / Math.max(0.01, duration - 0.18));
      const loosen = smoothstep(Math.min(1, release * 2.8));
      root.rotation.y += sign * release * 0.08;
      root.scale.y = startScale.y * (1 - loosen * 0.06);
      for (const piece of fallApartPieces) {
        const arc = Math.sin(Math.PI * release) * piece.lift;
        piece.node.position.x = piece.position.x + (piece.targetX - piece.position.x) * release;
        piece.node.position.y = piece.position.y + (piece.targetY - piece.position.y) * release + arc;
        piece.node.position.z = piece.position.z + (piece.targetZ - piece.position.z) * release;
        piece.node.rotation.x = piece.rotation.x + piece.spinX * release;
        piece.node.rotation.y = piece.rotation.y + piece.spinY * release;
        piece.node.rotation.z = piece.rotation.z + piece.spinZ * release;
      }
      return;
    }

    if (variant === FINAL_CUT_VARIANTS.SIGNAL_LOST) {
      const fall = smoothstep(Math.max(0, (time - 0.10) / Math.max(0.01, duration - 0.10)));
      const angle = fall * Math.PI * (currentGrade >= 2 ? 3.7 : 2.8) * sign;
      const radius = fall * (currentGrade >= 2 ? 0.92 : 0.68);
      root.position.x += Math.cos(angle) * radius - radius;
      root.position.z += Math.sin(angle) * radius;
      root.position.y = startPosition.y - fall * (currentGrade >= 2 ? 3.6 : 2.8);
      root.rotation.x += fall * Math.PI * 1.35;
      root.rotation.y += angle;
      root.rotation.z += sign * fall * Math.PI * 1.8;
      root.scale.multiplyScalar(1 - fall * 0.12);
      return;
    }

    if (variant === FINAL_CUT_VARIANTS.CORKSCREW) {
      const fall = smoothstep(Math.max(0, (time - 0.13) / Math.max(0.01, duration - 0.13)));
      const hop = Math.sin(Math.PI * fall) * 0.46;
      root.position.addScaledVector(forward, fall * 1.45);
      root.position.addScaledVector(side, sign * Math.sin(fall * Math.PI * 2) * 0.36);
      root.position.y = startPosition.y + hop - fall * 3.25;
      root.rotation.x += fall * Math.PI * 1.4;
      root.rotation.y += sign * fall * Math.PI * 3.2;
      root.rotation.z += sign * fall * Math.PI * 2.1;
      root.scale.multiplyScalar(1 - fall * 0.16);
      return;
    }

    const hold = currentGrade >= 2 ? 0.20 : 0.16;
    const fall = smoothstep((time - hold) / Math.max(0.01, duration - hold));
    root.position.addScaledVector(forward, fall * (currentGrade >= 2 ? 1.15 : 0.8));
    root.position.y = startPosition.y - fall * (currentGrade >= 2 ? 1.25 : 0.95);
    root.rotation.x += fall * 1.42;
    root.rotation.z += sign * fall * (currentGrade >= 2 ? 0.48 : 0.3);
    const pulse = fall <= 0 ? 1 + Math.sin(t * Math.PI) * 0.06 : 1 - fall * 0.08;
    root.scale.multiplyScalar(pulse);
  }

  return { variant, duration, applyElapsed, restore, pieceCount: fallApartPieces.length };
}
