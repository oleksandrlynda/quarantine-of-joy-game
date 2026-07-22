const finiteBounds = value => value
  && Number.isFinite(value.minX)
  && Number.isFinite(value.maxX)
  && Number.isFinite(value.minZ)
  && Number.isFinite(value.maxZ)
  && value.minX < value.maxX
  && value.minZ < value.maxZ;

// Authored levels are often rectangular, so a single arena radius is not a
// safe movement contract. Keep targets and airborne bodies inside the actual
// level footprint, with a small fallback for the legacy square arena.
export function resolveNavigationBounds(ctx, inset = 0, fallbackRadius = 39) {
  const source = ctx?.navigationBounds
    || ctx?.enemyManager?.encounterHooks?.getNavigationBounds?.()
    || null;
  const raw = finiteBounds(source)
    ? source
    : {
        minX: -fallbackRadius,
        maxX: fallbackRadius,
        minZ: -fallbackRadius,
        maxZ: fallbackRadius
      };
  const safeInset = Math.max(0, Number(inset) || 0);
  const maxInset = Math.max(0, Math.min(raw.maxX - raw.minX, raw.maxZ - raw.minZ) / 2 - 0.1);
  const appliedInset = Math.min(safeInset, maxInset);
  return {
    minX: raw.minX + appliedInset,
    maxX: raw.maxX - appliedInset,
    minZ: raw.minZ + appliedInset,
    maxZ: raw.maxZ - appliedInset
  };
}

export function clampToNavigationBounds(position, bounds) {
  position.x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
  position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
  return position;
}
