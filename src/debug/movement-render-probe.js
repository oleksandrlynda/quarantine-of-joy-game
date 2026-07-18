const DEFAULT_PHASES = [
  'baseline',
  'weapon_hidden',
  'head_bob_disabled',
  'grass_hidden',
  'shadows_disabled'
];

const WEAPON_PHASES = [
  'baseline',
  'weapon_motion_frozen',
  'weapon_basic_material',
  'weapon_hidden'
];

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function roundOne(value) {
  return Math.round(finite(value) * 10) / 10;
}

function createStats() {
  return {
    frames: 0,
    totalRenderMs: 0,
    maxRenderMs: 0,
    renderFramesOver33Ms: 0,
    totalDrawCalls: 0,
    maxDrawCalls: 0,
    maxTriangles: 0
  };
}

export class MovementRenderProbe {
  constructor({
    enabled = false,
    mode = 'full',
    phaseDurationMs = 4000,
    weaponRoot,
    weaponView,
    player,
    grassMesh,
    renderer,
    onEvent
  } = {}) {
    this.enabled = enabled === true;
    this.phaseDurationMs = Math.max(1, finite(phaseDurationMs, 4000));
    this.weaponRoot = weaponRoot || null;
    this.weaponView = weaponView || null;
    this.player = player || null;
    this.grassMesh = grassMesh || null;
    this.renderer = renderer || null;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.phases = mode === 'weapon' ? WEAPON_PHASES : DEFAULT_PHASES;
    this.phaseIndex = 0;
    this.phaseElapsedMs = 0;
    this.stats = createStats();
    this.started = false;
    this.complete = false;
    this.moving = false;
    this.lastNowMs = null;
    this.original = {
      weaponVisible: this.weaponRoot?.visible,
      weaponMotionFrozen: this.weaponView?.debugMotionFrozen,
      weaponBasicMaterial: this.weaponView?.debugBasicMaterial,
      headBobEnabled: this.player?.headBobEnabled,
      grassVisible: this.grassMesh?.visible,
      shadowsEnabled: this.renderer?.shadowMap?.enabled
    };
  }

  beforeFrame({ nowMs = 0, moving = false } = {}) {
    if (!this.enabled || this.complete) return null;
    const now = finite(nowMs);
    const isMoving = moving === true;

    if (!this.started) {
      this.lastNowMs = now;
      if (!isMoving) {
        this._restore();
        return this.phases[this.phaseIndex];
      }
      this.started = true;
      this.moving = true;
      this._applyPhase();
      this._event('movement_probe_started', {
        phases: this.phases,
        phaseDurationMs: this.phaseDurationMs
      });
      this._event('movement_probe_phase', { phase: this.phases[this.phaseIndex] });
      return this.phases[this.phaseIndex];
    }

    const elapsed = Math.max(0, now - finite(this.lastNowMs, now));
    this.lastNowMs = now;
    if (this.moving) this.phaseElapsedMs += elapsed;

    if (!isMoving) {
      this.moving = false;
      this._restore();
      return this.phases[this.phaseIndex];
    }

    this.moving = true;
    if (this.phaseElapsedMs >= this.phaseDurationMs) {
      this._finishPhase();
      this.phaseIndex++;
      this.phaseElapsedMs = 0;
      this.stats = createStats();
      if (this.phaseIndex >= this.phases.length) {
        this.complete = true;
        this._restore();
        this._event('movement_probe_complete', { phasesCompleted: this.phases.length });
        return null;
      }
      this._applyPhase();
      this._event('movement_probe_phase', { phase: this.phases[this.phaseIndex] });
    } else {
      this._applyPhase();
    }
    return this.phases[this.phaseIndex];
  }

  afterFrame({ renderMs = 0, drawCalls = 0, triangles = 0 } = {}) {
    if (!this.enabled || !this.started || this.complete || !this.moving) return false;
    const stats = this.stats;
    const render = Math.max(0, finite(renderMs));
    const calls = Math.max(0, finite(drawCalls));
    stats.frames++;
    stats.totalRenderMs += render;
    stats.maxRenderMs = Math.max(stats.maxRenderMs, render);
    if (render >= 33) stats.renderFramesOver33Ms++;
    stats.totalDrawCalls += calls;
    stats.maxDrawCalls = Math.max(stats.maxDrawCalls, calls);
    stats.maxTriangles = Math.max(stats.maxTriangles, Math.max(0, finite(triangles)));
    return true;
  }

  destroy() {
    this._restore();
    this.complete = true;
  }

  _applyPhase() {
    const phase = this.phases[this.phaseIndex];
    if (this.weaponRoot && this.original.weaponVisible !== undefined) {
      this.weaponRoot.visible = phase === 'weapon_hidden' ? false : this.original.weaponVisible;
    }

    const motionFrozen = phase === 'weapon_motion_frozen'
      ? true
      : this.original.weaponMotionFrozen;
    if (motionFrozen !== undefined && this.weaponView?.debugMotionFrozen !== motionFrozen) {
      this.weaponView?.setDebugMotionFrozen?.(motionFrozen);
    }

    const basicMaterial = phase === 'weapon_basic_material'
      ? true
      : this.original.weaponBasicMaterial;
    if (basicMaterial !== undefined && this.weaponView?.debugBasicMaterial !== basicMaterial) {
      this.weaponView?.setDebugBasicMaterial?.(basicMaterial);
    }

    if (this.player && this.original.headBobEnabled !== undefined) {
      this.player.headBobEnabled = phase === 'head_bob_disabled'
        ? false
        : this.original.headBobEnabled;
    }
    if (this.grassMesh && this.original.grassVisible !== undefined) {
      this.grassMesh.visible = phase === 'grass_hidden' ? false : this.original.grassVisible;
    }
    if (this.renderer?.shadowMap && this.original.shadowsEnabled !== undefined) {
      this.renderer.shadowMap.enabled = phase === 'shadows_disabled'
        ? false
        : this.original.shadowsEnabled;
    }
  }

  _restore() {
    if (this.weaponRoot && this.original.weaponVisible !== undefined) {
      this.weaponRoot.visible = this.original.weaponVisible;
    }
    if (this.original.weaponMotionFrozen !== undefined) {
      this.weaponView?.setDebugMotionFrozen?.(this.original.weaponMotionFrozen);
    }
    if (this.original.weaponBasicMaterial !== undefined) {
      this.weaponView?.setDebugBasicMaterial?.(this.original.weaponBasicMaterial);
    }
    if (this.player && this.original.headBobEnabled !== undefined) {
      this.player.headBobEnabled = this.original.headBobEnabled;
    }
    if (this.grassMesh && this.original.grassVisible !== undefined) {
      this.grassMesh.visible = this.original.grassVisible;
    }
    if (this.renderer?.shadowMap && this.original.shadowsEnabled !== undefined) {
      this.renderer.shadowMap.enabled = this.original.shadowsEnabled;
    }
  }

  _finishPhase() {
    const stats = this.stats;
    this._event('movement_probe_result', {
      phase: this.phases[this.phaseIndex],
      activeDurationMs: roundOne(this.phaseElapsedMs),
      frames: stats.frames,
      averageRenderMs: stats.frames ? roundOne(stats.totalRenderMs / stats.frames) : 0,
      maxRenderMs: roundOne(stats.maxRenderMs),
      renderFramesOver33Percent: stats.frames
        ? roundOne((stats.renderFramesOver33Ms / stats.frames) * 100)
        : 0,
      averageDrawCalls: stats.frames ? roundOne(stats.totalDrawCalls / stats.frames) : 0,
      maxDrawCalls: stats.maxDrawCalls,
      maxTriangles: stats.maxTriangles
    });
  }

  _event(name, data) {
    try { this.onEvent(name, data); } catch {}
  }
}
