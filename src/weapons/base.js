// Base weapon class that handles ammo, reserve, fire cadence, and input state
// Subclasses should implement onFire(ctx) to perform their specific firing logic

export class Weapon {
  constructor(config) {
    // Required config fields
    // mode: 'semi' | 'auto'
    // fireDelayMs: number
    // magSize: number
    // reserve: number
    this.cfg = Object.freeze({ ...config });

    // Runtime state
    this.ammoInMag = this.getMagazineCapacity();
    this.reserveAmmo = this.getReserveCapacity();
    this._nextFireAtMs = 0;
    this._triggerHeld = false;
    this._attackSequence = 0;
    this._reserveLimitProvider = null;
    this._reserveRegenElapsed = 0;
    this._reserveRegenCarry = 0;
  }

  get name() { return this.cfg.name || 'Weapon'; }
  get mode() { return this.cfg.mode; }

  getAmmo() { return this.ammoInMag; }
  getReserve() { return this.reserveAmmo; }

  getMagazineCapacity() {
    const resolved = typeof this.cfg.getMagSize === 'function' ? this.cfg.getMagSize() : this.cfg.magSize;
    return Math.max(0, Math.floor(Number(resolved) || 0));
  }

  getBaseReserveCapacity() {
    return Math.max(0, Math.floor(Number(this.cfg.reserve) || 0));
  }

  getWeaponReserveCapacity() {
    const resolved = typeof this.cfg.getReserveSize === 'function' ? this.cfg.getReserveSize() : this.cfg.reserve;
    return Math.max(0, Math.floor(Number(resolved) || 0));
  }

  getReserveCapacity() {
    const base = this.getBaseReserveCapacity();
    const weaponSpecific = this.getWeaponReserveCapacity();
    const resolved = this._reserveLimitProvider?.(base, weaponSpecific, this);
    return Math.max(0, Math.floor(Number(resolved ?? weaponSpecific) || 0));
  }

  setReserveLimitProvider(provider) {
    this._reserveLimitProvider = typeof provider === 'function' ? provider : null;
    this.reserveAmmo = Math.min(Math.max(0, this.reserveAmmo | 0), this.getReserveCapacity());
    return this.getReserveCapacity();
  }

  canFire(nowMs) {
    return this.ammoInMag > 0 && nowMs >= this._nextFireAtMs;
  }

  beginAttack(ctx) {
    this._attackSequence += 1;
    const attackId = `${this.name}:${this._attackSequence}`;
    if (ctx) ctx.attackId = attackId;
    ctx?.achievements?.check?.({
      type: 'shot',
      weapon: this.name,
      attackId,
      magazineRemaining: this.ammoInMag
    });
    return attackId;
  }

  recordCombatHit(ctx, target, {
    damage = 0,
    killed = false,
    isHead = false,
    distance = 0,
    attackId = ctx?.attackId
  } = {}) {
    ctx?.achievements?.check?.({
      type: 'combatHit',
      weapon: ctx?.combatSourceName || this.name,
      attackId,
      targetId: target?.uuid || target?.userData?.achievementId || null,
      targetType: target?.userData?.type || 'enemy',
      damage,
      killed,
      isHead,
      distance,
      magazineRemaining: ctx?.combatSourceName ? null : this.ammoInMag,
      remainingBefore: Number(ctx?.enemyManager?.alive) || 0,
      gameTime: Number(ctx?.getGameTime?.()) || 0,
      generation: Number(target?.userData?.generation) || 0
    });
  }

  tryFire(ctx) {
    const now = performance.now();
    if (!this.canFire(now)) return false;
    this.ammoInMag -= 1;
    this._nextFireAtMs = now + (this.cfg.fireDelayMs || 0);
    this.beginAttack(ctx);
    this.onFire(ctx);
    ctx?.weaponView?.onFire?.();
    return true;
  }

  // Default no-op; subclasses override
  onFire(ctx) {}

  triggerDown(ctx) {
    this._triggerHeld = true;
    if (this.mode === 'semi') {
      // if empty, allow caller HUD to show reload state
      if (!this.tryFire(ctx) && ctx && ctx.updateHUD) ctx.updateHUD();
    } else if (this.mode === 'auto') {
      if (!this.tryFire(ctx) && ctx && ctx.updateHUD) ctx.updateHUD();
    }
  }

  triggerUp() {
    this._triggerHeld = false;
  }

  // Optional alternate fire; default no-op
  altTriggerDown(ctx) {}

  altTriggerUp(ctx) {}

  altTriggerCancel(ctx) {}

  update(dt, ctx) { // for auto fire sustain
    // Block sustain if weapon view is reloading (if provided in ctx)
    if (this.mode === 'auto' && this._triggerHeld && !(ctx && ctx.weaponView && ctx.weaponView.isReloading && ctx.weaponView.isReloading())) {
      if (this.canFire(performance.now())) this.tryFire(ctx);
    }
  }

  reload(playSoundFn) {
    const capacity = this.getMagazineCapacity();
    const current = Math.max(0, this.ammoInMag | 0);
    const reserve = Math.max(0, this.reserveAmmo | 0);
    if (current >= capacity) return false;
    if (reserve <= 0) return false;
    const need = Math.min(capacity - current, reserve);
    this.ammoInMag += need;
    this.reserveAmmo -= need;
    if (typeof playSoundFn === 'function') playSoundFn();
    return need > 0;
  }

  addReserve(amount) {
    const before = Math.max(0, this.reserveAmmo | 0);
    const requested = Math.max(0, amount | 0);
    this.reserveAmmo = Math.min(this.getReserveCapacity(), before + requested);
    return this.reserveAmmo - before;
  }

  advanceReserveRegeneration(dt, {
    intervalSeconds = 10,
    baseReserveRate = 0.05,
    reserveCeiling = this.getReserveCapacity()
  } = {}) {
    const ceiling = Math.max(0, Math.min(this.getReserveCapacity(), Math.floor(Number(reserveCeiling) || 0)));
    if (this.getBaseReserveCapacity() <= 0 || this.reserveAmmo >= ceiling) {
      this._reserveRegenElapsed = 0;
      this._reserveRegenCarry = 0;
      return 0;
    }
    const interval = Math.max(0.001, Number(intervalSeconds) || 10);
    this._reserveRegenElapsed += Math.max(0, Number(dt) || 0);
    const ticks = Math.floor(this._reserveRegenElapsed / interval);
    if (ticks <= 0) return 0;
    this._reserveRegenElapsed -= ticks * interval;
    this._reserveRegenCarry += ticks * this.getBaseReserveCapacity() * Math.max(0, Number(baseReserveRate) || 0);
    const wholeRounds = Math.min(Math.floor(this._reserveRegenCarry + 1e-9), Math.max(0, ceiling - this.reserveAmmo));
    if (wholeRounds <= 0) return 0;
    const gained = this.addReserve(wholeRounds);
    this._reserveRegenCarry = Math.max(0, this._reserveRegenCarry - gained);
    if (this.reserveAmmo >= ceiling) this._reserveRegenCarry = 0;
    return gained;
  }

  resetReserveRegeneration() {
    this._reserveRegenElapsed = 0;
    this._reserveRegenCarry = 0;
  }

  reset() {
    this.ammoInMag = this.getMagazineCapacity();
    this.reserveAmmo = this.getReserveCapacity();
    this._nextFireAtMs = 0;
    this._triggerHeld = false;
    this._attackSequence = 0;
    this.resetReserveRegeneration();
  }
}


