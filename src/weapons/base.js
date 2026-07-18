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
  }

  get name() { return this.cfg.name || 'Weapon'; }
  get mode() { return this.cfg.mode; }

  getAmmo() { return this.ammoInMag; }
  getReserve() { return this.reserveAmmo; }

  getMagazineCapacity() {
    const resolved = typeof this.cfg.getMagSize === 'function' ? this.cfg.getMagSize() : this.cfg.magSize;
    return Math.max(0, Math.floor(Number(resolved) || 0));
  }

  getReserveCapacity() {
    const resolved = typeof this.cfg.getReserveSize === 'function' ? this.cfg.getReserveSize() : this.cfg.reserve;
    return Math.max(0, Math.floor(Number(resolved) || 0));
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
    this.reserveAmmo = Math.max(0, (this.reserveAmmo || 0) + Math.max(0, amount | 0));
  }

  reset() {
    this.ammoInMag = this.getMagazineCapacity();
    this.reserveAmmo = this.getReserveCapacity();
    this._nextFireAtMs = 0;
    this._triggerHeld = false;
    this._attackSequence = 0;
  }
}


