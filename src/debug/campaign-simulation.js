import { makeNamespacedRng } from '../util/rng.js';

export const CAMPAIGN_SIMULATION_SCHEMA_VERSION = 1;
export const DEFAULT_CAMPAIGN_LAST_WAVE = 73;
export const DEFAULT_CAMPAIGN_ERROR_LIMIT = 50;
// The first complete 72-wave run produced 43,656 sanitized events. Keep a
// modest safety margin so late-campaign AI and performance evidence is not
// silently discarded after Wave 61.
export const DEFAULT_CAMPAIGN_EVENT_LIMIT = 50000;
export const DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS = 90000;
export const DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS = 30;
export const DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS = 1;
export const DEFAULT_CAMPAIGN_BOSS_SUPPORT_MIN_TARGETS = 4;

const REQUIRED_CAMPAIGN_OBJECTIVE_KINDS = new Set([
  'feeds', 'multi-capture', 'mast', 'hold', 'sponsor', 'escape', 'liberation', 'ending-choice'
]);

const THROTTLED_CAMPAIGN_AI_EVENTS = new Set([
  'state_changed',
  'movement_blocked',
  'movement_slid_around_ally',
  'ally_displaced'
]);

export function shouldThrottleCampaignAIEvent(name) {
  return THROTTLED_CAMPAIGN_AI_EVENTS.has(String(name || ''));
}

export function isCampaignObjectiveRequiredKind(kind) {
  return REQUIRED_CAMPAIGN_OBJECTIVE_KINDS.has(String(kind || ''));
}

export function isCampaignObjectiveAlignmentActive(state, target = null) {
  if (state?.kind === 'multi-capture') return state.activeTargetKey === target?.nameKey;
  if (state?.kind === 'ending-choice') return state.activeChoice === target?.id;
  return true;
}

export function campaignObjectiveTargetProgress(state, targetIndex = 0) {
  if (state?.kind === 'feeds' || state?.kind === 'multi-capture') {
    const target = state.targets?.[Math.max(0, Math.floor(finite(targetIndex)))];
    return Math.max(0, Math.min(1, finite(target?.progress) / Math.max(.001, finite(target?.seconds, 1))));
  }
  return Math.max(0, Math.min(1, finite(state?.progress)));
}

export function hasCampaignObjectiveProgressStalled({
  nowSeconds = 0,
  lastProgressAtSeconds = 0,
  timeoutSeconds = DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS
} = {}) {
  return finite(nowSeconds) - finite(lastProgressAtSeconds) >= Math.max(1, finite(timeoutSeconds, DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS));
}

export function shouldTreatCampaignSpawnFailureAsError({ specialWaveActive = false } = {}) {
  // Special-wave reserve spawns deliberately stay queued when every authored
  // entrance is temporarily occupied. Warden children are also rejected and
  // retried while a role cap is full. The reserve drain owns the real
  // deadlock/guard errors; an individual special-wave rejection is diagnostic.
  return specialWaveActive !== true;
}

export function isCampaignProductionElimination(root) {
  return Number(root?.userData?.hp) <= 0 || root?.userData?.productionSelfDestruct === true;
}

export function reconcileCampaignEliminationCount(phaseEliminations = 0, productionEliminations = 0) {
  return Math.max(
    0,
    Math.floor(finite(phaseEliminations)),
    Math.floor(finite(productionEliminations))
  );
}

export function buildCampaignCombatRepositionOrder({
  productionAimMismatch = false,
  worldDistance = Infinity,
  aimDistance = Infinity,
  stableSide = 'KeyA',
  oppositeSide = 'KeyD'
} = {}) {
  const targetDistance = finite(aimDistance, Infinity);
  // JSON reports encode an absent raycast distance as null. Number(null) is
  // zero, so feeding it through the generic finite helper made the bot treat
  // "no world hit" as a muzzle pressed against a wall and repeatedly back up.
  const blockerDistance = worldDistance == null || worldDistance === ''
    ? Infinity
    : finite(worldDistance, Infinity);
  if (productionAimMismatch && targetDistance > 12) {
    // A long-range mismatch usually benefits from closing distance, but an
    // approach-only order can hold W forever when low cover blocks the player
    // while the ideal camera probe still sees the target. Preserve a forward
    // bias and cycle through both lateral exits plus one backoff.
    return ['KeyW', stableSide, 'KeyW', oppositeSide, 'KeyS'];
  }
  // Back off when the muzzle is almost touching world geometry. On the next
  // probe the bot can commit to a single strafe direction around the blocker.
  if (blockerDistance < 1.5) {
    // One backoff is normally enough. If production collision reports no
    // movement, cycle through both lateral exits instead of issuing the same
    // blocked key forever until the combat watchdog expires.
    return ['KeyS', stableSide, oppositeSide];
  }
  if (blockerDistance + .75 < targetDistance) {
    // Commit to one side even at long range. Advancing into the same broad
    // prop (Floodgate's supply cabinet in the Wave 66 report) only alternates
    // between contact and backoff; a stable circle actually clears its edge.
    return [stableSide];
  }
  if (targetDistance > 30) {
    // A symmetric forward/side/side/back cycle has zero net approach and can
    // trap the bot in a rectangular arena corner forever. Preserve lateral
    // probes, but make long-range recovery advance decisively toward target.
    return ['KeyW', 'KeyW', stableSide, 'KeyW', oppositeSide, 'KeyW'];
  }
  return [stableSide, oppositeSide, 'KeyS', 'KeyW'];
}

export function shouldPromoteProductionDiagnosticToCampaignError(event) {
  if (event?.severity !== 'error') return false;
  return !(event.category === 'performance' && event.name === 'frame_stall');
}

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
};

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.slice(0, 4000);
  if (value instanceof Error) return {
    name: value.name || 'Error',
    message: String(value.message || value).slice(0, 2000),
    stack: String(value.stack || '').slice(0, 12000)
  };
  if (typeof value !== 'object') return String(value).slice(0, 4000);
  // AI events sometimes nest a blocker/owner root inside a generic `data`
  // object. Walking an Object3D graph retains parents, children, geometry and
  // materials for every event, which can exhaust a long Turbo run even though
  // the visible event count is modest. Preserve the gameplay identity only.
  if (value.isObject3D === true) {
    const position = value.position;
    return {
      object3D: true,
      id: String(value.uuid || '').slice(0, 80) || null,
      name: String(value.name || '').slice(0, 160) || null,
      type: String(value.userData?.type || value.type || 'Object3D').slice(0, 120),
      behaviorId: String(value.userData?.behaviorId || '').slice(0, 120) || null,
      colliderId: String(value.userData?.colliderId || '').slice(0, 160) || null,
      hp: Number.isFinite(Number(value.userData?.hp)) ? Number(value.userData.hp) : null,
      maxHp: Number.isFinite(Number(value.userData?.maxHp)) ? Number(value.userData.maxHp) : null,
      position: position && [position.x, position.y, position.z].every(Number.isFinite)
        ? { x: round(position.x), y: round(position.y), z: round(position.z) }
        : null
    };
  }
  if (depth >= 5) return '[max-depth]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const output = Array.isArray(value) ? [] : {};
  const entries = Array.isArray(value)
    ? value.slice(0, 250).entries()
    : Object.entries(value).slice(0, 250);
  for (const [key, item] of entries) output[key] = sanitize(item, depth + 1, seen);
  seen.delete(value);
  return output;
}

export function seededPlayerStart(seed, wave, basePosition = [0, 1.7, 8], radius = 2.5) {
  const base = Array.isArray(basePosition) ? basePosition : [0, 1.7, 8];
  const rng = makeNamespacedRng(String(seed || 'QA-DEFAULT'), `player-start:wave-${wave}`);
  const angle = rng() * Math.PI * 2;
  const distance = Math.sqrt(rng()) * Math.max(0, finite(radius, 2.5));
  return {
    x: round(finite(base[0]) + Math.cos(angle) * distance),
    y: round(finite(base[1], 1.7)),
    z: round(finite(base[2], 8) + Math.sin(angle) * distance),
    yaw: round((rng() * Math.PI * 2) - Math.PI, 6)
  };
}

export function buildPlayerRoute(seed, wave, start, arenaRadius = 30, samples = 4) {
  const rng = makeNamespacedRng(String(seed || 'QA-DEFAULT'), `player-route:wave-${wave}`);
  const safeRadius = Math.max(5, finite(arenaRadius, 30) - 4);
  const route = [{ ...start }];
  for (let index = 0; index < Math.max(1, Math.floor(finite(samples, 4))); index++) {
    const angle = rng() * Math.PI * 2;
    const distance = safeRadius * (0.15 + rng() * 0.65);
    route.push({
      x: round(Math.cos(angle) * distance),
      y: round(finite(start?.y, 1.7)),
      z: round(Math.sin(angle) * distance)
    });
  }
  return route;
}

export function summarizeRoster(types = []) {
  const roster = {};
  for (const type of Array.isArray(types) ? types : []) {
    const key = String(type || 'unknown');
    roster[key] = (roster[key] || 0) + 1;
  }
  return roster;
}

// Campaign objective definitions use both [x, z] and [x, y, z]. Normalize
// both forms before the production player is placed on an objective point.
export function normalizeObjectivePosition(value, playerHeight = 1.7) {
  if (Array.isArray(value)) {
    const isPlanar = value.length === 2;
    return {
      x: finite(value[0]),
      y: isPlanar ? finite(playerHeight, 1.7) : Math.max(finite(playerHeight, 1.7), finite(value[1], playerHeight)),
      z: finite(value[isPlanar ? 1 : 2])
    };
  }
  return {
    x: finite(value?.x),
    y: Math.max(finite(playerHeight, 1.7), finite(value?.y, playerHeight)),
    z: finite(value?.z)
  };
}

export function buildObjectiveAlignmentCandidates(center, radius = 1) {
  const anchor = normalizeObjectivePosition(center);
  const safeRadius = Math.max(.25, finite(radius, 1));
  const candidates = [anchor];
  // Solid consoles, masts and props are often centred inside an interaction
  // volume. Probe two deterministic rings so production collision resolution
  // can find a genuinely valid capsule position without leaving the point.
  for (const fraction of [.42, .72]) {
    const offset = Math.max(.25, safeRadius * fraction);
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      candidates.push({
        x: round(anchor.x + Math.cos(angle) * offset),
        y: anchor.y,
        z: round(anchor.z + Math.sin(angle) * offset)
      });
    }
  }
  return candidates;
}

export function isCampaignObjectivePositionInside(center, position, radius, margin = 0) {
  const anchor = normalizeObjectivePosition(center);
  const actual = normalizeObjectivePosition(position, anchor.y);
  const usableRadius = Math.max(.05, finite(radius, 0) - Math.max(0, finite(margin)));
  return Math.hypot(actual.x - anchor.x, actual.z - anchor.z) <= usableRadius;
}

export function shouldPrioritizeCampaignObjectiveHold({
  holdActive = false,
  objectiveComplete = false,
  contested = false,
  lineOfFireClear = false
} = {}) {
  return holdActive === true
    && objectiveComplete !== true
    && contested !== true
    && lineOfFireClear !== true;
}

export function shouldUseCampaignBossSupport({ authoredBoss = false, bossActive = false } = {}) {
  return authoredBoss === true || bossActive === true;
}

export function isCampaignObjectiveTargetComplete(state, targetIndex = 0, transitioned = false) {
  if (state?.kind === 'feeds' || state?.kind === 'multi-capture') {
    return state.targets?.[Math.max(0, Math.floor(finite(targetIndex)))]?.complete === true;
  }
  if (state?.kind === 'liberation') return transitioned === true;
  return state?.complete === true;
}

export function evaluateCampaignLineOfFire({
  target = null,
  enemyRoot = null,
  enemyDistance = Infinity,
  worldDistance = Infinity,
  epsilon = .025
} = {}) {
  const enemyHitDistance = Number.isFinite(Number(enemyDistance)) ? Number(enemyDistance) : Infinity;
  const worldHitDistance = Number.isFinite(Number(worldDistance)) ? Number(worldDistance) : Infinity;
  const targetIsFirstEnemy = target != null && enemyRoot === target && Number.isFinite(enemyHitDistance);
  const worldBlocksTarget = Number.isFinite(worldHitDistance)
    && worldHitDistance + Math.max(0, finite(epsilon, .025)) < enemyHitDistance;
  return {
    clear: targetIsFirstEnemy && !worldBlocksTarget,
    reason: worldBlocksTarget
      ? 'world_blocked'
      : targetIsFirstEnemy
        ? 'clear'
        : Number.isFinite(enemyHitDistance)
          ? 'enemy_occluded'
          : 'target_not_intersected'
  };
}

export function isCampaignProductionAimMismatch({ probe = null, shot = null } = {}) {
  return probe?.clear === true && shot?.selectedType === 'world';
}

export function buildCombatFiringPositionCandidates({
  target,
  current,
  arenaRadius = 30,
  holdPosition = null
} = {}) {
  const targetPosition = normalizeObjectivePosition(target);
  const currentPosition = normalizeObjectivePosition(current);
  const safeArenaRadius = Math.max(5, finite(arenaRadius, 30) - 1.5);
  const constrained = holdPosition?.radius > 0;
  const center = constrained ? normalizeObjectivePosition(holdPosition) : targetPosition;
  const radii = constrained
    ? [Math.max(.4, holdPosition.radius * .35), Math.max(.75, holdPosition.radius * .7)]
    : [8, 12, 16, 21, 26];
  const baseAngle = Math.atan2(currentPosition.z - center.z, currentPosition.x - center.x);
  const candidates = [];
  for (const radius of radii) {
    for (let index = 0; index < 16; index++) {
      const angle = baseAngle + index * (Math.PI * 2 / 16);
      const candidate = {
        x: round(center.x + Math.cos(angle) * radius),
        y: currentPosition.y,
        z: round(center.z + Math.sin(angle) * radius)
      };
      if (Math.hypot(candidate.x, candidate.z) > safeArenaRadius) continue;
      if (constrained && Math.hypot(candidate.x - center.x, candidate.z - center.z) > holdPosition.radius - .35) continue;
      candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => {
    const leftDistance = Math.hypot(left.x - currentPosition.x, left.z - currentPosition.z);
    const rightDistance = Math.hypot(right.x - currentPosition.x, right.z - currentPosition.z);
    return leftDistance - rightDistance;
  });
}

export function selectCampaignCombatTarget(targets = [], {
  bossRoot = null,
  bossInvulnerable = false,
  distanceSquared = () => Infinity,
  lineOfFireClear = () => false
} = {}) {
  const sorted = targets
    .filter(Boolean)
    .sort((left, right) => {
      // Encounter nodes, pods, echoes, and adds are resolved before the boss
      // anchor so phase shields are exercised instead of attacked forever.
      const leftBoss = left === bossRoot ? 1 : 0;
      const rightBoss = right === bossRoot ? 1 : 0;
      if (leftBoss !== rightBoss) return leftBoss - rightBoss;
      return distanceSquared(left) - distanceSquared(right);
    });
  const candidates = bossInvulnerable && sorted.some(target => target !== bossRoot)
    ? sorted.filter(target => target !== bossRoot)
    : sorted;
  return candidates.find(lineOfFireClear) || candidates[0] || null;
}

export function selectCampaignAreaSupportTarget(targets = [], {
  radius = 6.5,
  positionOf = target => target?.position || target
} = {}) {
  const active = (Array.isArray(targets) ? targets : Array.from(targets || []))
    .map(target => ({ target, position: positionOf(target) }))
    .filter(({ target, position }) => {
      const hp = Number(target?.userData?.hp ?? target?.hp);
      return Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.z))
        && (!Number.isFinite(hp) || hp > 0);
    });
  const radiusSquared = Math.max(.01, finite(radius, 6.5)) ** 2;
  let best = null;
  for (const candidate of active) {
    let count = 0;
    let hp = 0;
    for (const neighbor of active) {
      const dx = finite(neighbor.position.x) - finite(candidate.position.x);
      const dz = finite(neighbor.position.z) - finite(candidate.position.z);
      if (dx * dx + dz * dz > radiusSquared) continue;
      count++;
      hp += Math.max(0, finite(neighbor.target?.userData?.hp ?? neighbor.target?.hp));
    }
    if (!best || count > best.count || (count === best.count && hp > best.hp)) {
      best = { target: candidate.target, position: candidate.position, count, hp };
    }
  }
  return best;
}

export function evaluateCampaignCombatStall({
  consecutiveMisses = 0,
  nowMs = 0,
  lastProgressAtMs = 0,
  missLimit = 60,
  progressTimeoutMs = DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS
} = {}) {
  if (Math.max(0, finite(consecutiveMisses)) >= Math.max(1, finite(missLimit, 60))) {
    return 'consecutive_misses';
  }
  if (finite(nowMs) - finite(lastProgressAtMs) >= Math.max(1000, finite(progressTimeoutMs, DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS))) {
    return 'no_net_hp_progress';
  }
  return null;
}

// Keep combat movement inside an objective without snapping the bot back to
// the objective model after every strafe. Capture points are commonly centred
// on solid props, so the current (already collision-resolved) position is kept
// while it remains inside the usable capture radius. Positions outside the
// leash are projected back to its edge and resolved by PlayerController.
export function leashObjectivePosition(center, current, radius, margin = .6) {
  const anchor = normalizeObjectivePosition(center);
  const position = normalizeObjectivePosition(current, anchor.y);
  const usableRadius = Math.max(.25, finite(radius, 0) - Math.max(0, finite(margin, .6)));
  const dx = position.x - anchor.x;
  const dz = position.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= usableRadius) return { ...position, leashed: false, distance: round(distance) };
  const scale = usableRadius / Math.max(.0001, distance);
  return {
    x: round(anchor.x + dx * scale),
    y: position.y,
    z: round(anchor.z + dz * scale),
    leashed: true,
    distance: round(usableRadius)
  };
}

export function validateCampaignSnapshot(snapshot, expectedWave) {
  const issues = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return [{ code: 'snapshot_missing', message: 'The production game returned no simulation snapshot.' }];
  }
  if (snapshot.wave !== expectedWave) {
    issues.push({ code: 'wave_mismatch', message: `Expected wave ${expectedWave}, received ${snapshot.wave}.` });
  }
  const position = snapshot.player?.position;
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
    issues.push({ code: 'player_position_non_finite', message: 'Player position contains a missing or non-finite coordinate.' });
  }
  if (finite(snapshot.alive) < 0 || finite(snapshot.activeEnemies) < 0) {
    issues.push({ code: 'enemy_count_negative', message: 'Enemy counters must never be negative.' });
  }
  if (!Number.isFinite(snapshot.hp) || snapshot.hp < 0) {
    issues.push({ code: 'player_hp_invalid', message: 'Player HP is missing, negative, or non-finite.' });
  }
  if (snapshot.renderer) {
    for (const key of ['drawCalls', 'triangles', 'geometries', 'textures']) {
      if (!Number.isFinite(snapshot.renderer[key]) || snapshot.renderer[key] < 0) {
        issues.push({ code: `renderer_${key}_invalid`, message: `Renderer metric ${key} is invalid.` });
      }
    }
  }
  return issues;
}

export function validateWaveCompletion({ wave, planned = {}, eliminated = 0, final = {}, queuedEnemies = 0, objective = {} } = {}) {
  const issues = [];
  const completedEscape = objective.kind === 'escape' && objective.complete === true;
  if (!completedEscape && Number(final.activeEnemies) !== 0) {
    issues.push({ code: 'wave_active_enemies_remaining', message: `Wave ${wave} ended with ${final.activeEnemies} active enemies.` });
  }
  if (!completedEscape && Number(final.alive) !== 0) {
    issues.push({ code: 'wave_reserved_alive_remaining', message: `Wave ${wave} ended with ${final.alive} reserved alive enemies.` });
  }
  if (Number(queuedEnemies) !== 0) {
    issues.push({ code: 'wave_spawn_queue_remaining', message: `Wave ${wave} ended with ${queuedEnemies} queued enemies.` });
  }
  if (!completedEscape && (planned.mode === 'authored_packages' || planned.mode === 'special_encounter') && Number(eliminated) < Number(planned.total)) {
    issues.push({ code: 'wave_roster_incomplete', message: `Wave ${wave} exercised ${eliminated} of ${planned.total} planned enemies.` });
  }
  if (completedEscape && Number(final.alive) < Number(planned.total)) {
    issues.push({ code: 'escape_pursuer_roster_incomplete', message: `Wave ${wave} escaped with only ${final.alive} of ${planned.total} committed pursuers active.` });
  }
  if (objective.required === true && objective.complete !== true) {
    issues.push({ code: 'objective_incomplete', message: `Wave ${wave} objective ${objective.kind || 'unknown'} remained incomplete.` });
  }
  return issues;
}

export function summarizeCampaignPerformanceEvents(events = []) {
  const performanceEvents = (Array.isArray(events) ? events : []).map(event => {
    if (event?.category === 'performance') return event;
    if (event?.category === 'production' && String(event.name || '').startsWith('performance.')) {
      return {
        category: 'performance',
        name: String(event.name).slice('performance.'.length),
        data: event.data?.data || {}
      };
    }
    return null;
  }).filter(Boolean);
  const frameSamples = performanceEvents.filter(event => event.name === 'frame_sample');
  const stalls = performanceEvents.filter(event => event.name === 'frame_stall');
  const longTasks = performanceEvents.filter(event => event.name === 'long_task');
  const longAnimationFrames = performanceEvents.filter(event => event.name === 'long_animation_frame');
  const totalFrames = frameSamples.reduce((sum, event) => sum + Math.max(0, finite(event.data?.frames)), 0);
  const totalWindowMs = frameSamples.reduce((sum, event) => sum + Math.max(0, finite(event.data?.windowMs)), 0);
  const sum = key => frameSamples.reduce((total, event) => total + Math.max(0, finite(event.data?.[key])), 0);
  const max = (items, read) => items.reduce((highest, item) => Math.max(highest, Math.max(0, finite(read(item)))), 0);
  const phaseKeys = new Set(frameSamples.flatMap(event => Object.keys(event.data?.phaseMaximaMs || {})));
  const phaseMaximaMs = Object.fromEntries([...phaseKeys].map(key => [
    key,
    round(max(frameSamples, event => event.data?.phaseMaximaMs?.[key]), 1)
  ]));
  const waveIds = new Set(frameSamples.map(event => Math.floor(finite(event.data?.wave))).filter(wave => wave > 0));
  const byWave = Object.fromEntries([...waveIds].sort((a, b) => a - b).map(wave => {
    const samples = frameSamples.filter(event => Math.floor(finite(event.data?.wave)) === wave);
    const frames = samples.reduce((total, event) => total + Math.max(0, finite(event.data?.frames)), 0);
    const windowMs = samples.reduce((total, event) => total + Math.max(0, finite(event.data?.windowMs)), 0);
    return [wave, {
      sampleWindows: samples.length,
      sampledFrames: frames,
      averageFps: windowMs > 0 ? round(frames * 1000 / windowMs, 1) : 0,
      worstFrameMs: round(max(samples, event => event.data?.worstFrameMs), 1),
      framesOver50Ms: samples.reduce((total, event) => total + Math.max(0, finite(event.data?.framesOver50Ms)), 0),
      maxDrawCalls: max(samples, event => event.data?.maxDrawCalls),
      maxTriangles: max(samples, event => event.data?.maxTriangles),
      maxEnemies: max(samples, event => event.data?.maxEnemies)
    }];
  }));
  return {
    measurement: 'visible wall-clock rendered frames; Turbo accelerates simulation time but does not scale browser frame duration',
    sampleWindows: frameSamples.length,
    sampledFrames: totalFrames,
    sampledDurationMs: round(totalWindowMs, 1),
    averageFps: totalWindowMs > 0 ? round(totalFrames * 1000 / totalWindowMs, 1) : 0,
    worstP95FrameMs: round(max(frameSamples, event => event.data?.p95FrameMs), 1),
    worstFrameMs: round(max(frameSamples, event => event.data?.worstFrameMs), 1),
    framesOver33Ms: sum('framesOver33Ms'),
    framesOver50Ms: sum('framesOver50Ms'),
    frameStalls: stalls.length,
    frameStallsAtLeast100Ms: stalls.filter(event => finite(event.data?.frameMs) >= 100).length,
    longestStallMs: round(max(stalls, event => event.data?.frameMs), 1),
    longTasks: longTasks.length,
    longestTaskMs: round(max(longTasks, event => event.data?.durationMs), 1),
    longAnimationFrames: longAnimationFrames.length,
    longestAnimationFrameMs: round(max(longAnimationFrames, event => event.data?.durationMs), 1),
    maxDrawCalls: max(frameSamples, event => event.data?.maxDrawCalls),
    maxTriangles: max(frameSamples, event => event.data?.maxTriangles),
    maxEnemies: max(frameSamples, event => event.data?.maxEnemies),
    maxEffects: max(frameSamples, event => event.data?.maxEffects),
    maxGeometries: max(frameSamples, event => event.data?.maxGeometries),
    maxPrograms: max(frameSamples, event => event.data?.maxPrograms),
    maxSceneObjects: max(frameSamples, event => event.data?.maxSceneObjects),
    phaseMaximaMs,
    byWave
  };
}

export function summarizeCampaignCollisionEvents(events = []) {
  const timeline = Array.isArray(events) ? events : [];
  const summary = {
    measurement: 'production player routes, weapon obstruction, objective alignment, and aggregated enemy movement events',
    playerRouteSamples: 0,
    playerRouteBlocked: 0,
    playerRouteLowProgress: 0,
    lineOfFireBlocked: 0,
    productionAimMismatches: 0,
    blockedProductionShots: 0,
    firingRouteAttempts: 0,
    firingRoutesClear: 0,
    objectiveAlignments: 0,
    objectiveAlignmentFailures: 0,
    enemyMovementBlocked: 0,
    enemyMovementBlockedByWorld: 0,
    enemyMovementBlockedByAlly: 0,
    byWave: {}
  };
  const waveSummary = wave => {
    const id = Math.max(0, Math.floor(finite(wave)));
    const key = id > 0 ? String(id) : 'unspecified';
    summary.byWave[key] ||= {
      playerRouteSamples: 0,
      playerRouteBlocked: 0,
      playerRouteLowProgress: 0,
      lineOfFireBlocked: 0,
      productionAimMismatches: 0,
      blockedProductionShots: 0,
      firingRouteAttempts: 0,
      firingRoutesClear: 0,
      objectiveAlignments: 0,
      objectiveAlignmentFailures: 0,
      enemyMovementBlocked: 0,
      enemyMovementBlockedByWorld: 0,
      enemyMovementBlockedByAlly: 0
    };
    return summary.byWave[key];
  };

  for (const event of timeline) {
    const data = event?.data || {};
    const wave = waveSummary(event?.wave ?? data.wave);
    if (event?.category === 'player' && event?.name === 'route_sample') {
      summary.playerRouteSamples++;
      wave.playerRouteSamples++;
      if (data.movementBlocked === true) {
        summary.playerRouteBlocked++;
        wave.playerRouteBlocked++;
      }
      if (finite(data.forwardProgress) < .05) {
        summary.playerRouteLowProgress++;
        wave.playerRouteLowProgress++;
      }
      continue;
    }
    if (event?.category === 'combat' && event?.name === 'line_of_fire_blocked') {
      summary.lineOfFireBlocked++;
      wave.lineOfFireBlocked++;
      continue;
    }
    if (event?.category === 'combat' && (event?.name === 'engagement_complete' || event?.name === 'engagement_stopped')) {
      const blockedShots = Math.max(0, Math.floor(finite(data.blockedShots)));
      const aimMismatches = Math.max(0, Math.floor(finite(data.productionAimMismatches)));
      summary.blockedProductionShots += blockedShots;
      summary.productionAimMismatches += aimMismatches;
      wave.blockedProductionShots += blockedShots;
      wave.productionAimMismatches += aimMismatches;
      continue;
    }
    if (event?.category === 'combat' && event?.name === 'firing_route_complete') {
      summary.firingRouteAttempts++;
      wave.firingRouteAttempts++;
      if (data.lineOfFire?.clear === true) {
        summary.firingRoutesClear++;
        wave.firingRoutesClear++;
      }
      continue;
    }
    if (event?.category === 'objective' && event?.name === 'collision_safe_alignment') {
      summary.objectiveAlignments++;
      wave.objectiveAlignments++;
      continue;
    }
    if (event?.category === 'objective' && event?.name === 'collision_safe_alignment_failed') {
      summary.objectiveAlignmentFailures++;
      wave.objectiveAlignmentFailures++;
      continue;
    }
    if (event?.category === 'telemetry' && event?.name === 'ai_activity_summary') {
      for (const activity of data.activity || []) {
        if (activity?.name !== 'movement_blocked') continue;
        const count = Math.max(0, Math.floor(finite(activity.count)));
        summary.enemyMovementBlocked += count;
        wave.enemyMovementBlocked += count;
        if (activity.qualifier === 'world') {
          summary.enemyMovementBlockedByWorld += count;
          wave.enemyMovementBlockedByWorld += count;
        } else if (activity.qualifier === 'ally') {
          summary.enemyMovementBlockedByAlly += count;
          wave.enemyMovementBlockedByAlly += count;
        }
      }
    }
  }

  summary.playerRouteBlockedRatio = summary.playerRouteSamples
    ? round(summary.playerRouteBlocked / summary.playerRouteSamples, 4)
    : 0;
  summary.playerRouteLowProgressRatio = summary.playerRouteSamples
    ? round(summary.playerRouteLowProgress / summary.playerRouteSamples, 4)
    : 0;
  summary.firingRouteClearRatio = summary.firingRouteAttempts
    ? round(summary.firingRoutesClear / summary.firingRouteAttempts, 4)
    : 0;
  return summary;
}

export class CampaignSimulationRecorder {
  constructor({ seed, fromWave = 1, toWave = DEFAULT_CAMPAIGN_LAST_WAVE, errorLimit = DEFAULT_CAMPAIGN_ERROR_LIMIT, eventLimit = DEFAULT_CAMPAIGN_EVENT_LIMIT, now, wallNow } = {}) {
    this.seed = String(seed || 'QA-DEFAULT');
    this.fromWave = Math.max(1, Math.floor(finite(fromWave, 1)));
    this.toWave = Math.max(this.fromWave, Math.floor(finite(toWave, DEFAULT_CAMPAIGN_LAST_WAVE)));
    this.errorLimit = Math.max(1, Math.floor(finite(errorLimit, DEFAULT_CAMPAIGN_ERROR_LIMIT)));
    this.eventLimit = Math.max(100, Math.floor(finite(eventLimit, DEFAULT_CAMPAIGN_EVENT_LIMIT)));
    this.now = now || (() => globalThis.performance?.now?.() ?? Date.now());
    this.wallNow = wallNow || (() => Date.now());
    this.startedAt = this.now();
    this.startedWallTime = this.wallNow();
    this.events = [];
    this.errors = [];
    this.waves = [];
    this.currentWave = null;
    this.stopped = false;
    this.stopReason = null;
    this.sealed = false;
    this.completedAtWallTime = null;
    this.completedDurationMs = null;
    this.droppedEvents = 0;
    this.sequence = 1;
  }

  record(category, name, data = {}, severity = 'info') {
    if (this.sealed) return null;
    const event = {
      seq: this.sequence++,
      tMs: round(this.now() - this.startedAt, 1),
      wallTime: new Date(this.wallNow()).toISOString(),
      wave: this.currentWave?.wave ?? null,
      category: String(category || 'simulation').slice(0, 80),
      name: String(name || 'event').slice(0, 120),
      severity: String(severity || 'info').slice(0, 20),
      data: sanitize(data)
    };
    if (this.events.length < this.eventLimit) this.events.push(event);
    else this.droppedEvents++;
    return event;
  }

  error(code, message, data = {}, source = 'assertion') {
    if (this.sealed) return null;
    if (this.stopped && this.stopReason === 'error_limit') return null;
    const issue = {
      index: this.errors.length + 1,
      code: String(code || 'unknown_error').slice(0, 160),
      message: String(message || code || 'Unknown simulation error').slice(0, 2000),
      source: String(source || 'assertion').slice(0, 160),
      wave: this.currentWave?.wave ?? null,
      data: sanitize(data)
    };
    this.errors.push(issue);
    this.record('error', issue.code, issue, 'error');
    if (this.errors.length >= this.errorLimit) this.stop('error_limit');
    return issue;
  }

  beginWave(wave, data = {}) {
    if (this.sealed) return null;
    const entry = {
      wave,
      startedAtMs: round(this.now() - this.startedAt, 1),
      completedAtMs: null,
      durationMs: null,
      status: 'running',
      errorsBefore: this.errors.length,
      start: sanitize(data),
      end: null
    };
    this.currentWave = entry;
    this.waves.push(entry);
    this.record('wave', 'simulation_start', data);
    return entry;
  }

  endWave(data = {}) {
    if (this.sealed || !this.currentWave) return null;
    const at = round(this.now() - this.startedAt, 1);
    this.currentWave.completedAtMs = at;
    this.currentWave.durationMs = round(at - this.currentWave.startedAtMs, 1);
    this.currentWave.end = sanitize(data);
    this.currentWave.status = this.errors.length > this.currentWave.errorsBefore ? 'fail' : 'pass';
    this.record('wave', 'simulation_complete', data, this.currentWave.status === 'fail' ? 'error' : 'info');
    const completed = this.currentWave;
    this.currentWave = null;
    return completed;
  }

  stop(reason = 'manual_stop') {
    if (this.sealed || this.stopped) return null;
    this.stopped = true;
    this.stopReason = reason;
    if (this.currentWave?.status === 'running') this.currentWave.status = 'stopped';
    this.record('simulation', 'stopped', { reason, errorCount: this.errors.length }, reason === 'error_limit' ? 'error' : 'warning');
    return reason;
  }

  buildReport(environment = {}) {
    if (!this.sealed) {
      this.completedAtWallTime = this.wallNow();
      this.completedDurationMs = round(this.now() - this.startedAt, 1);
      this.sealed = true;
    }
    const eventSnapshot = this.events.slice();
    const completedWaves = this.waves.filter(wave => wave.status === 'pass' || wave.status === 'fail').length;
    const passedWaves = this.waves.filter(wave => wave.status === 'pass').length;
    const failedWaves = this.waves.filter(wave => wave.status === 'fail').length;
    return {
      schemaVersion: CAMPAIGN_SIMULATION_SCHEMA_VERSION,
      kind: 'quarantine-of-joy-campaign-simulation',
      seed: this.seed,
      requestedRange: { fromWave: this.fromWave, toWave: this.toWave },
      limits: { errors: this.errorLimit, events: this.eventLimit },
      startedAt: new Date(this.startedWallTime).toISOString(),
      completedAt: new Date(this.completedAtWallTime).toISOString(),
      durationMs: this.completedDurationMs,
      stopped: this.stopped,
      stopReason: this.stopReason,
      summary: {
        plannedWaves: this.toWave - this.fromWave + 1,
        completedWaves,
        passedWaves,
        failedWaves,
        errors: this.errors.length,
        events: eventSnapshot.length,
        droppedEvents: this.droppedEvents
      },
      performance: sanitize(environment.performance || null),
      collision: summarizeCampaignCollisionEvents(eventSnapshot),
      environment: sanitize(environment),
      waves: sanitize(this.waves),
      errors: sanitize(this.errors),
      // Events were sanitized when recorded. Re-sanitizing the entire timeline
      // here doubles peak memory exactly when a long run is completing.
      events: eventSnapshot
    };
  }
}
