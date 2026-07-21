export const DEFAULT_COMBO_CONFIG = Object.freeze({
  decayTime: 3.5,
  thresholds: [2, 5, 9],
  multipliers: [1.0, 1.2, 1.5, 2.0],
  maxTier: 3
});

export const DEFAULT_EMERGENCY_AMMO_OFFSETS = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 0.9, y: 0, z: 0 }),
  Object.freeze({ x: -0.9, y: 0, z: 0 })
]);

export class GameSession {
  constructor({
    maxHp = 100,
    initialBest = 0,
    comboConfig = DEFAULT_COMBO_CONFIG,
    emergencyAmmoCooldown = 22,
    emergencyAmmoOffsets = DEFAULT_EMERGENCY_AMMO_OFFSETS,
    onBest = null,
    onScore = null,
    onComboTier = null,
    onGameOver = null
  } = {}) {
    this.baseMaxHp = maxHp;
    this.maxHp = maxHp;
    this.comboConfig = {
      ...comboConfig,
      thresholds: [...comboConfig.thresholds],
      multipliers: [...comboConfig.multipliers]
    };
    this.emergencyAmmoCooldown = emergencyAmmoCooldown;
    this.emergencyAmmoOffsets = emergencyAmmoOffsets.map(o => ({ ...o }));
    this.onBest = onBest;
    this.onScore = onScore;
    this.onComboTier = onComboTier;
    this.onGameOver = onGameOver;

    this.hp = maxHp;
    this.maxArmor = 0;
    this.armor = 0;
    this.score = 0;
    this.best = Number(initialBest) || 0;
    this.gameOver = false;
    this.combo = { tier: 0, multiplier: 1.0, streakPoints: 0, decayTimer: 0 };
    this.waveStartingAlive = 0;
    this.lastEmergencyAmmoAt = -1000;
  }

  setBest(value) {
    this.best = Number(value) || 0;
  }

  damage(amount, { bypassArmor = false } = {}) {
    if (this.gameOver) return { gameOver: true, died: false, hp: this.hp, armor: this.armor, armorAbsorbed: 0, hpDamage: 0 };
    const n = Math.max(0, Number(amount) || 0);
    const armorAbsorbed = bypassArmor ? 0 : Math.min(this.armor, n);
    this.armor = Math.max(0, this.armor - armorAbsorbed);
    const hpDamage = Math.max(0, n - armorAbsorbed);
    this.hp = Math.max(0, this.hp - hpDamage);
    const died = this.hp <= 0;
    if (died) {
      this.gameOver = true;
      this.onGameOver?.();
    }
    return { gameOver: this.gameOver, died, hp: this.hp, armor: this.armor, armorAbsorbed, hpDamage };
  }

  heal(amount) {
    const n = Math.max(0, Number(amount) || 0);
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp;
  }

  adjustHealth(amount, { minimum = 0 } = {}) {
    const before = this.hp;
    const floor = Math.max(0, Math.min(this.maxHp, Number(minimum) || 0));
    this.hp = Math.max(floor, Math.min(this.maxHp, this.hp + (Number(amount) || 0)));
    return { before, hp: this.hp, amount: this.hp - before };
  }

  addMaxHp(amount, { heal = false } = {}) {
    const gain = Math.max(0, Number(amount) || 0);
    this.maxHp = Math.max(this.baseMaxHp, this.maxHp + gain);
    if (heal) this.hp = Math.min(this.maxHp, this.hp + gain);
    return this.maxHp;
  }

  addArmorCapacity(amount, { fill = true } = {}) {
    const gain = Math.max(0, Number(amount) || 0);
    this.maxArmor = Math.max(0, this.maxArmor + gain);
    if (fill) this.armor = Math.min(this.maxArmor, this.armor + gain);
    return this.maxArmor;
  }

  repairArmor() {
    this.armor = this.maxArmor;
    return this.armor;
  }

  addScore(points) {
    const n = Number(points) || 0;
    this.score += n;
    if (this.score > this.best) {
      this.best = this.score;
      this.onBest?.(this.best);
    }
    this.onScore?.(n, this.score);
    return this.score;
  }

  refreshComboTimer() {
    this.combo.decayTimer = this.comboConfig.decayTime;
  }

  setComboTier(newTier) {
    const clamped = Math.max(0, Math.min(this.comboConfig.maxTier, newTier | 0));
    const prev = this.combo.tier;
    if (clamped === prev) return { changed: false, previous: prev, current: clamped };
    this.combo.tier = clamped;
    this.combo.multiplier = this.comboConfig.multipliers[this.combo.tier] || 1.0;
    this.onComboTier?.(this.combo.tier, prev, this.combo);
    return { changed: true, previous: prev, current: clamped };
  }

  addComboAction(points) {
    this.combo.streakPoints += Number(points) || 0;
    this.refreshComboTimer();
    let tier = 0;
    for (let i = 0; i < this.comboConfig.thresholds.length; i++) {
      if (this.combo.streakPoints >= this.comboConfig.thresholds[i]) tier = i + 1;
    }
    return this.setComboTier(tier);
  }

  decayCombo(dt) {
    if (this.combo.decayTimer <= 0) return false;
    this.combo.decayTimer = Math.max(0, this.combo.decayTimer - Math.max(0, Number(dt) || 0));
    if (this.combo.decayTimer <= 0) {
      this.resetCombo();
      return true;
    }
    return false;
  }

  resetCombo() {
    this.combo.streakPoints = 0;
    this.setComboTier(0);
    this.combo.decayTimer = 0;
  }

  reset({ weaponSystem, player, effects, sfx } = {}) {
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.maxArmor = 0;
    this.armor = 0;
    this.score = 0;
    this.gameOver = false;
    this.lastEmergencyAmmoAt = -1000;
    this.resetCombo();
    weaponSystem?.reset?.();
    player?.resetStaminaCapacity?.();
    if (player && 'stamina' in player) player.stamina = player.staminaMax;
    effects?.setFatigue?.(0);
    sfx?.stopBreath?.();
  }

  applyPickup(type, amount, { weaponSystem, story, sfx } = {}) {
    if (type === 'ammo') {
      const gained = weaponSystem?.onAmmoPickup?.(amount);
      return { type, hp: this.hp, amount: Math.max(0, Number(gained) || 0) };
    }
    if (type === 'med') {
      const hpBefore = this.hp;
      this.heal(amount);
      sfx?.ui?.('pickup');
      story?.onFirstMedPickup?.();
      return { type, hp: this.hp, amount: Math.max(0, this.hp - hpBefore) };
    }
    return { type, hp: this.hp, amount: 0 };
  }

  onWaveStart(wave, startingAlive, { pickups, weather, player, objects, progression, story } = {}) {
    this.waveStartingAlive = startingAlive || 0;
    pickups?.onWave?.(wave);
    weather?.onWave?.();
    player?.refreshColliders?.(objects);
    progression?.onWave?.(wave);
    story?.onWave?.(wave);
    return this.waveStartingAlive;
  }

  totalNonPistolAmmo(weaponSystem) {
    let total = 0;
    for (const w of (weaponSystem?.inventory || [])) {
      if (w?.name === 'Pistol') continue;
      const mag = Math.max(0, (typeof w?.getAmmo === 'function' ? w.getAmmo() : w?.ammoInMag) | 0);
      const res = Math.max(0, (typeof w?.getReserve === 'function' ? w.getReserve() : w?.reserveAmmo) | 0);
      total += mag + res;
    }
    return total;
  }

  getEmergencyAmmoDrops({ weaponSystem, gameTime, commit = true }) {
    if (!weaponSystem) return [];
    if (this.totalNonPistolAmmo(weaponSystem) > 0) return [];
    if ((Number(gameTime) || 0) - this.lastEmergencyAmmoAt < this.emergencyAmmoCooldown) return [];
    if (commit) this.markEmergencyAmmoDrop(gameTime);
    return this.emergencyAmmoOffsets.map(o => ({ ...o }));
  }

  markEmergencyAmmoDrop(gameTime) {
    this.lastEmergencyAmmoAt = Number(gameTime) || 0;
    return this.lastEmergencyAmmoAt;
  }
}
