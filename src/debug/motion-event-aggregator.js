const RAD_TO_DEG = 180 / Math.PI;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function wrappedAngleDelta(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export class MotionEventAggregator {
  constructor({
    enabled = false,
    sampleIntervalMs = 100,
    movementThresholdMeters = 50,
    cameraThresholdDegrees = 360,
    teleportThresholdMeters = 15,
    onBatch
  } = {}) {
    this.enabled = enabled === true;
    if (!this.enabled) return;
    this.sampleIntervalMs = Math.max(16, finite(sampleIntervalMs, 100));
    this.movementThresholdMeters = Math.max(1, finite(movementThresholdMeters, 50));
    this.cameraThresholdDegrees = Math.max(10, finite(cameraThresholdDegrees, 360));
    this.teleportThresholdMeters = Math.max(1, finite(teleportThresholdMeters, 15));
    this.onBatch = typeof onBatch === 'function' ? onBatch : null;
    this.reset();
  }

  reset() {
    if (!this.enabled) return;
    this.hasSample = false;
    this.nextSampleAt = 0;
    this.lastNowMs = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.lastZ = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.distanceMeters = 0;
    this.cameraDegrees = 0;
    this.movementWindow = null;
    this.cameraWindow = null;
  }

  observe(nowMs, active, wave, score, x, y, z, yaw, pitch) {
    if (!this.enabled) return false;
    const now = finite(nowMs);
    if (!active) {
      this.hasSample = false;
      this.nextSampleAt = now;
      return false;
    }
    if (now < this.nextSampleAt) return false;
    this.nextSampleAt = now + this.sampleIntervalMs;

    const px = finite(x);
    const py = finite(y);
    const pz = finite(z);
    const cameraYaw = finite(yaw);
    const cameraPitch = finite(pitch);
    if (!this.hasSample) {
      this._setLast(now, px, py, pz, cameraYaw, cameraPitch);
      this.hasSample = true;
      return false;
    }

    const dx = px - this.lastX;
    const dy = py - this.lastY;
    const dz = pz - this.lastZ;
    const distance = Math.hypot(dx, dy, dz);
    const activeDurationMs = Math.max(0, Math.min(1000, now - this.lastNowMs));
    if (distance <= this.teleportThresholdMeters && distance > 0.001) {
      this._recordMovement(distance, activeDurationMs, now, wave, score, px, py, pz);
    }

    const yawDelta = wrappedAngleDelta(this.lastYaw, cameraYaw);
    const pitchDelta = cameraPitch - this.lastPitch;
    const cameraDeltaDegrees = Math.hypot(yawDelta, pitchDelta) * RAD_TO_DEG;
    if (cameraDeltaDegrees > 0.01) {
      this._recordCamera(cameraDeltaDegrees, activeDurationMs, now, wave, score, cameraYaw, cameraPitch);
    }

    this._setLast(now, px, py, pz, cameraYaw, cameraPitch);
    return true;
  }

  _setLast(now, x, y, z, yaw, pitch) {
    this.lastNowMs = now;
    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
  }

  _recordMovement(distance, activeDurationMs, now, wave, score, x, y, z) {
    this.distanceMeters += distance;
    if (!this.movementWindow) {
      this.movementWindow = {
        count: 0,
        activeDurationMs: 0,
        startedAtMs: this.lastNowMs,
        startWave: finite(wave),
        startScore: finite(score),
        fromX: this.lastX,
        fromY: this.lastY,
        fromZ: this.lastZ
      };
    }
    const window = this.movementWindow;
    window.count += distance;
    window.activeDurationMs += activeDurationMs;
    if (window.count < this.movementThresholdMeters) return;
    const displacement = Math.hypot(x - window.fromX, y - window.fromY, z - window.fromZ);
    this._emit({
      metric: 'distanceMeters',
      distanceMeters: round(window.count),
      totalDistanceMeters: round(this.distanceMeters),
      displacementMeters: round(displacement),
      averageSpeedMetersPerSecond: window.activeDurationMs > 0 ? round(window.count / (window.activeDurationMs / 1000)) : 0,
      from: { x: round(window.fromX), y: round(window.fromY), z: round(window.fromZ) },
      to: { x: round(x), y: round(y), z: round(z) },
      range: this._range(window, now, wave, score)
    });
    this.movementWindow = null;
  }

  _recordCamera(degrees, activeDurationMs, now, wave, score, yaw, pitch) {
    this.cameraDegrees += degrees;
    if (!this.cameraWindow) {
      this.cameraWindow = {
        count: 0,
        activeDurationMs: 0,
        startedAtMs: this.lastNowMs,
        startWave: finite(wave),
        startScore: finite(score),
        fromYaw: this.lastYaw,
        fromPitch: this.lastPitch
      };
    }
    const window = this.cameraWindow;
    window.count += degrees;
    window.activeDurationMs += activeDurationMs;
    // Trigonometric wraparound can leave an exact threshold a few ulps short.
    if (window.count + 1e-6 < this.cameraThresholdDegrees) return;
    this._emit({
      metric: 'cameraDegrees',
      angularTravelDegrees: round(window.count),
      totalCameraDegrees: round(this.cameraDegrees),
      from: { yawDegrees: round(window.fromYaw * RAD_TO_DEG), pitchDegrees: round(window.fromPitch * RAD_TO_DEG) },
      to: { yawDegrees: round(yaw * RAD_TO_DEG), pitchDegrees: round(pitch * RAD_TO_DEG) },
      range: this._range(window, now, wave, score)
    });
    this.cameraWindow = null;
  }

  _range(window, now, wave, score) {
    return {
      startedAtMs: window.startedAtMs,
      endedAtMs: now,
      elapsedMs: Math.max(0, now - window.startedAtMs),
      activeDurationMs: round(window.activeDurationMs),
      startWave: window.startWave,
      endWave: finite(wave),
      startScore: window.startScore,
      endScore: finite(score)
    };
  }

  _emit(batch) {
    try { this.onBatch?.(batch); } catch {}
  }

  getTotals() {
    if (!this.enabled) return {};
    return {
      distanceMeters: round(this.distanceMeters),
      cameraDegrees: round(this.cameraDegrees)
    };
  }
}
