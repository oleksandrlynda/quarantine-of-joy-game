export const STORM_GRASS_HOLD_MIN = 10;
export const STORM_GRASS_HOLD_MAX = 15;
export const STORM_GRASS_SHIFT_MIN = Math.PI / 9; // 20 degrees
export const STORM_GRASS_SHIFT_MAX = Math.PI / 4; // 45 degrees

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function nextHold(rng) {
  const roll = clamp01(typeof rng === 'function' ? rng() : Math.random());
  return STORM_GRASS_HOLD_MIN + (STORM_GRASS_HOLD_MAX - STORM_GRASS_HOLD_MIN) * roll;
}

function nextShift(rng) {
  const magnitudeRoll = clamp01(typeof rng === 'function' ? rng() : Math.random());
  const sideRoll = clamp01(typeof rng === 'function' ? rng() : Math.random());
  const magnitude = STORM_GRASS_SHIFT_MIN
    + (STORM_GRASS_SHIFT_MAX - STORM_GRASS_SHIFT_MIN) * magnitudeRoll;
  return magnitude * (sideRoll < 0.5 ? -1 : 1);
}

export function createGrassWeatherMotion() {
  return {
    lean: 0,
    velocity: 0,
    gust: 0.035,
    angle: 0,
    targetAngle: 0,
    angularVelocity: 0,
    stormActive: false,
    nextTurnAt: Infinity
  };
}

// In-place damped spring: storm direction is held for a long interval while
// the blade lean crosses through upright gradually. No per-frame objects.
export function updateGrassWeatherMotion(state, {
  time = 0,
  dt = 0,
  stormMix = 0,
  rainMix = 0,
  snowMix = 0,
  rng = Math.random
} = {}) {
  const storm = clamp01(stormMix);
  const rain = clamp01(rainMix);
  const snow = clamp01(snowMix);
  const step = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
  const now = Number.isFinite(time) ? time : 0;
  const active = storm > 0.08;

  if (active && !state.stormActive) {
    state.nextTurnAt = now + nextHold(rng);
  }
  state.stormActive = active;

  if (active) {
    while (now >= state.nextTurnAt) {
      state.targetAngle += nextShift(rng);
      state.nextTurnAt += nextHold(rng);
    }
  } else {
    state.targetAngle = 0;
    state.nextTurnAt = Infinity;
  }

  const calmLean = 0.035 + rain * 0.06 - snow * 0.015;
  const targetLean = calmLean + storm * 0.5;
  const spring = 8.0;
  const damping = 4.2;
  state.velocity += (targetLean - state.lean) * spring * step;
  state.velocity *= Math.exp(-damping * step);
  state.lean += state.velocity * step;
  state.lean = Math.max(0, Math.min(0.62, state.lean));

  const angleSpring = 6.0;
  const angleDamping = 4.0;
  state.angularVelocity += (state.targetAngle - state.angle) * angleSpring * step;
  state.angularVelocity *= Math.exp(-angleDamping * step);
  state.angle += state.angularVelocity * step;

  state.gust = 0.035 + rain * 0.03 + storm * 0.15;
  return state;
}

export function applyGrassWeatherUniforms(material, state = {}, {
  baseWindX = 1,
  baseWindZ = 0,
  heightFactor,
  snowMix
} = {}) {
  const uniforms = material?.uniforms;
  if (!uniforms) return false;

  if (uniforms.heightFactor && Number.isFinite(heightFactor)) uniforms.heightFactor.value = heightFactor;
  if (uniforms.snowMix && Number.isFinite(snowMix)) uniforms.snowMix.value = snowMix;

  const len = Math.hypot(baseWindX, baseWindZ) || 1;
  const x = baseWindX / len;
  const z = baseWindZ / len;
  const angle = Number.isFinite(state.angle) ? state.angle : 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  uniforms.windDirection?.value?.set?.(x * c - z * s, x * s + z * c);

  const lean = Number.isFinite(state.lean) ? state.lean : 0;
  const gust = Number.isFinite(state.gust) ? state.gust : 0;
  const modern = !!(uniforms.leanBias && uniforms.gustStrength);
  if (modern) {
    uniforms.leanBias.value = lean;
    uniforms.gustStrength.value = gust;
  } else if (uniforms.windStrength) {
    // Cached pre-lean shader compatibility: stay safe and avoid the old
    // high-strength animation-rate multiplication until the page refreshes.
    uniforms.windStrength.value = Math.min(0.6, Math.max(0, lean + gust));
  }
  return true;
}
