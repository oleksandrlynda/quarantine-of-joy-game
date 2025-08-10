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
    this.ammoInMag = this.cfg.magSize;
    this.reserveAmmo = this.cfg.reserve;
    this._nextFireAtMs = 0;
    this._triggerHeld = false;
  }

  get name() { return this.cfg.name || 'Weapon'; }
  get mode() { return this.cfg.mode; }

  getAmmo() { return this.ammoInMag; }
  getReserve() { return this.reserveAmmo; }

  canFire(nowMs) {
    return this.ammoInMag > 0 && nowMs >= this._nextFireAtMs;
  }

  tryFire(ctx) {
    const now = performance.now();
    if (!this.canFire(now)) return false;
    this.ammoInMag -= 1;
    this._nextFireAtMs = now + (this.cfg.fireDelayMs || 0);
    this.onFire(ctx);
    return true;
  }

  // Default no-op; subclasses override
  // eslint-disable-next-line no-unused-vars
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

  update(dt, ctx) { // for auto fire sustain
    if (this.mode === 'auto' && this._triggerHeld) {
      if (this.canFire(performance.now())) this.tryFire(ctx);
    }
  }

  reload(playSoundFn) {
    const capacity = Math.max(0, (this.cfg.magSize | 0));
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
    this.ammoInMag = this.cfg.magSize;
    this.reserveAmmo = this.cfg.reserve;
    this._nextFireAtMs = 0;
    this._triggerHeld = false;
  }
}


