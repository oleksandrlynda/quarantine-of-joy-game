import { Rifle } from './rifle.js';
import { SMG } from './smg.js';
import { Shotgun } from './shotgun.js';
import { DMR } from './dmr.js';
import { Pistol } from './pistol.js';
import { logError } from '../util/log.js';
import { GrenadePistol } from './grenadepistol.js';
import { Minigun } from './minigun.js';
import { BeamSaber } from './beamsaber.js';
import { AMMO_REGEN_BASE_RESERVE_RATE, AMMO_REGEN_INTERVAL_SECONDS } from '../mutations.js?rev=smg-sidearm1';

// WeaponSystem orchestrates current weapon, input mapping, and HUD sync
export class WeaponSystem {
  constructor({ THREE, camera, raycaster, enemyManager, objects, effects, obstacleManager, pickups, S, updateHUD, addScore, addComboAction, combo, addTracer, applyRecoil, applyPlayerKnockback, getPlayerPosition, setZoomMultiplier, weaponView, achievements, getGameTime, onWeaponSwitch, mutations }) {
    this.THREE = THREE;
    this.camera = camera;
    this.raycaster = raycaster;
    this.enemyManager = enemyManager;
    this.objects = objects;
    this.effects = effects;
    this.obstacleManager = obstacleManager;
    this.pickups = pickups;
    this.S = S;
    this.updateHUD = updateHUD;
    this.addScore = addScore;
    this.addComboAction = addComboAction;
    this.combo = combo;
    this.addTracer = addTracer;
    this.applyRecoil = applyRecoil || (()=>{});
    this.applyPlayerKnockback = applyPlayerKnockback || (()=>{});
    this.getPlayerPosition = getPlayerPosition || (()=>null);
    this.setZoomMultiplier = setZoomMultiplier || (()=>{});
    this.weaponView = weaponView;
    this.achievements = achievements;
    this.getGameTime = getGameTime || (() => 0);
    this.onWeaponSwitch = typeof onWeaponSwitch === 'function' ? onWeaponSwitch : null;
    this.mutations = mutations || null;
    this.splitPickupsProportionally = false; // optional economy mode

    this.inventory = [];
    this.currentIndex = 0; // primary slot index
    this.primarySlotEmpty = true;
    this.zoomed = false;

    // Start wave 1 with the Pistol; the Grenade package is restored separately.
    this.inventory.push(this._configureReserveLimit(new Pistol(), { reset: true }));
    const tactical = this._makeTacticalWeapon(this._getOwnedTacticalId());
    if (tactical) this.inventory.push(tactical);
    for (const weapon of this.inventory) this.mutations?.discoverWeapon?.(weapon?.name);
  }

  get current() { return this.inventory[this.currentIndex]; }

  getAmmo() { return this.current?.getAmmo() ?? 0; }
  getReserve() { return this.current?.getReserve() ?? 0; }
  getPrimaryName() { return this.current?.name || 'Rifle'; }
  hasPrimaryWeapon() { return this.primarySlotEmpty !== true; }
  getPrimaryWeapon() { return this.hasPrimaryWeapon() ? this.inventory[0] || null : null; }
  getSecondaryWeapon() { return this.inventory[this.primarySlotEmpty ? 0 : 1] || null; }
  hasSecondarySMG() { return this.getSecondaryWeapon()?.name === 'SMG'; }

  _configureReserveLimit(weapon, { reset = false } = {}) {
    if (!weapon) return weapon;
    weapon.setReserveLimitProvider?.((baseReserve, weaponSpecificReserve) =>
      this.mutations?.getReserveLimit?.(baseReserve, weaponSpecificReserve) ?? weaponSpecificReserve
    );
    if (reset) weapon.reset?.();
    return weapon;
  }

  _updatePassiveAmmoRegeneration(dt) {
    const primary = this.getPrimaryWeapon();
    const eligible = (this.mutations?.getRank?.('background_sync') || 0) > 0
      && primary
      && !['Pistol', 'Grenade', 'BeamSaber'].includes(primary.name);
    if (!eligible) {
      primary?.resetReserveRegeneration?.();
      return 0;
    }
    const totalCapacity = primary.getMagazineCapacity() + primary.getReserveCapacity();
    const threshold = Math.floor(totalCapacity * 0.5);
    const totalAmmo = primary.getAmmo() + primary.getReserve();
    if (totalAmmo >= threshold) {
      primary.resetReserveRegeneration?.();
      return 0;
    }
    const reserveCeiling = Math.max(0, threshold - primary.getAmmo());
    const gained = primary.advanceReserveRegeneration?.(dt, {
      intervalSeconds: AMMO_REGEN_INTERVAL_SECONDS,
      baseReserveRate: AMMO_REGEN_BASE_RESERVE_RATE,
      reserveCeiling
    }) || 0;
    if (gained > 0) this.updateHUD?.();
    return gained;
  }

  // Crosshair profile for current weapon
  getCrosshairProfile(){
    const w = this.current;
    const def = { baseScale: 0.9, minAlpha: 0.65, k: 0.7, thickPx: 2, gapPx: 5, lenPx: 6, rotDeg: 0 };
    const name = w?.name || '';
    if (name === 'Pistol') return { baseScale: 0.85, minAlpha: 0.75, k: 0.5, thickPx: 2, gapPx: 5, lenPx: 5 };
    if (name === 'Rifle') return { baseScale: 0.9, minAlpha: 0.65, k: 0.7, thickPx: 2, gapPx: 6, lenPx: 6 };
    if (name === 'SMG') return { baseScale: 0.95, minAlpha: 0.6, k: 0.9, thickPx: 2, gapPx: 7, lenPx: 7 };
    if (name === 'Minigun') return { baseScale: 1.0, minAlpha: 0.55, k: 1.0, thickPx: 2, gapPx: 8, lenPx: 8 };
    if (name === 'DMR') return { baseScale: 0.8, minAlpha: 0.78, k: 0.45, thickPx: 2, gapPx: 4, lenPx: 4 };
    if (name === 'Shotgun') return { baseScale: 1.2, minAlpha: 0.65, k: 1.2, thickPx: 2, gapPx: 20, lenPx: 8 };
    if (name === 'BeamSaber') return { baseScale: 0.7, minAlpha: 0.8, k: 0.4, thickPx: 2, gapPx: 3, lenPx: 3, rotDeg: 45 };
    return def;
  }

  // Normalized bloom 0..1 for HUD/crosshair feedback
  getCurrentBloom01() {
    const w = this.current;
    if (!w) return 0;
    // Prefer explicit getter if weapon provides one
    if (typeof w.getBloom01 === 'function') return Math.max(0, Math.min(1, w.getBloom01()));
    // Heuristic: include base spread weight so some weapons are wider at rest
    // Reference spread for normalization ~0.01 rad (~0.57°)
    const REF = 0.01;
    let baseSpread = 0;
    if (typeof w._baseSpread === 'number') baseSpread = w._baseSpread;
    // Shotgun uses spreadRad
    if (!baseSpread && typeof w.spreadRad === 'number') baseSpread = w.spreadRad;
    const baseNorm = Math.max(0, Math.min(1, baseSpread / REF));
    const bloom = (typeof w._bloom === 'number') ? Math.max(0, Math.min(1, w._bloom)) : 0;
    // Compose so bloom grows from base toward 1
    return Math.max(0, Math.min(1, baseNorm + bloom * (1 - baseNorm)));
  }

  context() {
    return {
      THREE: this.THREE,
      camera: this.camera,
      raycaster: this.raycaster,
      enemyManager: this.enemyManager,
      objects: this.objects,
      effects: this.effects,
      weaponView: this.weaponView,
      obstacleManager: this.obstacleManager,
      pickups: this.pickups,
      S: this.S,
      updateHUD: this.updateHUD,
      addScore: this.addScore,
      addComboAction: this.addComboAction,
      combo: this.combo,
      addTracer: this.addTracer,
      applyRecoil: this.applyRecoil,
      applyKnockback: (enemy, vec) => this.enemyManager?.applyKnockback?.(enemy, vec),
      applyPlayerKnockback: this.applyPlayerKnockback,
      getPlayerPosition: this.getPlayerPosition,
      achievements: this.achievements,
      getGameTime: this.getGameTime,
      mutations: this.mutations
    };
  }

  triggerDown() {
    const w = this.current; if (!w) return;
    // Block firing while reload tilt is active
    try { if (this.weaponView?.isReloading?.()) { this.updateHUD?.(); return; } } catch (e) { logError(e); }
    // if empty, play reload sound instead and flash ammo pill state via HUD update
    if (w.getAmmo() <= 0) { this.S?.reload?.(); this.updateHUD?.(); return; }
    w.triggerDown(this.context());
  }

  triggerUp() { this.current?.triggerUp(); }

  triggerAltDown() {
    const w = this.current; if (!w) return;
    const ctx = this.context();
    const zoomMultiplier = Number(w.zoomMultiplier) || 1;
    if (zoomMultiplier > 1) {
      if (typeof w.hasAltFire !== 'function' || !w.hasAltFire(ctx)) return false;
      this.zoomed = !this.zoomed;
      this.setZoomMultiplier(this.zoomed ? zoomMultiplier : 1);
      return true;
    }
    if (typeof w.altTriggerDown === 'function') return w.altTriggerDown(ctx);
    return false;
  }

  triggerAltUp() {
    const w = this.current; if (!w) return;
    if (typeof w.altTriggerUp === 'function') w.altTriggerUp(this.context());
  }

  hasCurrentAltFire() {
    const w = this.current;
    if (!w || typeof w.hasAltFire !== 'function') return false;
    return w.hasAltFire(this.context());
  }

  cancelZoom() {
    if (!this.zoomed) return;
    this.zoomed = false;
    this.setZoomMultiplier(1);
  }

  reload() {
    const ok = this.current?.reload(() => this.S?.reload?.());
    if (ok) {
      this.achievements?.check?.({ type: 'reload', weapon: this.current?.name || 'Unknown' });
      // Trigger simple reload tilt on weapon view
      try {
        const name = this.getPrimaryName();
        const heavy = (name === 'Shotgun' || name === 'DMR');
        this.weaponView?.startReload?.({ dur: heavy ? 0.85 : 0.65, rollDeg: heavy ? 38 : 28, drop: heavy ? 0.08 : 0.06, back: heavy ? 0.06 : 0.045 });
        // Ensure firing stops during reload
        this.current?.triggerUp();
      } catch (e) { logError(e); }
      this.updateHUD?.();
    }
  }

  update(dt) {
    this._updatePassiveAmmoRegeneration(dt);
    const ctx = this.context();
    for (const weapon of this.inventory) weapon?.update?.(dt, ctx);
  }

  reset() { this.cancelZoom(); for (const w of this.inventory) w.reset(); this.updateHUD?.(); }

  resetRunInventory({ tutorial = false } = {}) {
    this.cancelZoom();
    for (const weapon of this.inventory) {
      weapon?.triggerUp?.();
      weapon?.altTriggerCancel?.(this.context());
      weapon?.clearWorld?.(this.context());
    }
    this.inventory = [this._configureReserveLimit(new Pistol(), { reset: true })];
    const tactical = !tutorial ? this._makeTacticalWeapon(this._getOwnedTacticalId()) : null;
    if (tactical) this.inventory.push(tactical);
    this.primarySlotEmpty = true;
    this.currentIndex = 0;
    this.notifyInventoryChange();
  }

  setDebugWaveLoadout() {
    this.cancelZoom();
    for (const weapon of this.inventory) {
      weapon?.triggerUp?.();
      weapon?.altTriggerCancel?.(this.context());
      weapon?.clearWorld?.(this.context());
    }
    this.inventory = [
      new Rifle({ mastery: this.mutations }),
      new SMG({ mastery: this.mutations }),
      new DMR({ mastery: this.mutations }),
      new Pistol()
    ].map(weapon => this._configureReserveLimit(weapon, { reset: true }));
    this.primarySlotEmpty = false;
    this.currentIndex = 0;
    this.notifyInventoryChange();
  }

  setPostCampaignLoadout() {
    this.cancelZoom();
    for (const weapon of this.inventory) {
      weapon?.triggerUp?.();
      weapon?.altTriggerCancel?.(this.context());
      weapon?.clearWorld?.(this.context());
    }
    // This is only a migration fallback for old post-campaign saves. Never
    // grant a classified primary that the Archive has not licensed.
    const classifiedPrimary = this.mutations?.isWeaponOwned?.('rifle') === true
      ? new Rifle({ mastery: this.mutations })
      : this.mutations?.isWeaponOwned?.('dmr') === true
        ? new DMR({ mastery: this.mutations })
        : null;
    this.inventory = [
      ...(classifiedPrimary ? [classifiedPrimary] : []),
      new SMG({ mastery: this.mutations }),
      new Pistol()
    ].map(weapon => this._configureReserveLimit(weapon, { reset: true }));
    const tactical = this._makeTacticalWeapon(this._getOwnedTacticalId());
    if (tactical) this.inventory.push(tactical);
    for (const weapon of this.inventory) this._configureReserveLimit(weapon, { reset: true });
    this.primarySlotEmpty = false;
    this.currentIndex = 0;
    this.notifyInventoryChange();
  }

  exportCheckpointState() {
    return {
      inventory: this.inventory.map(weapon => weapon?.name).filter(Boolean),
      primarySlotEmpty: this.primarySlotEmpty === true,
      currentIndex: this.currentIndex
    };
  }

  restoreCheckpointState(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.inventory)) return false;
    this.cancelZoom();
    for (const weapon of this.inventory) {
      weapon?.triggerUp?.();
      weapon?.altTriggerCancel?.(this.context());
      weapon?.clearWorld?.(this.context());
    }
    const inventory = snapshot.inventory
      .map(name => this._makeCheckpointWeapon(name))
      .filter(Boolean)
      .map(weapon => this._configureReserveLimit(weapon, { reset: true }));
    if (!inventory.length) {
      this.resetRunInventory();
      return false;
    }
    this.inventory = inventory;
    this.primarySlotEmpty = snapshot.primarySlotEmpty === true;
    this.currentIndex = Math.max(0, Math.min(
      this.inventory.length - 1,
      Math.floor(Number(snapshot.currentIndex) || 0)
    ));
    this.notifyInventoryChange();
    return true;
  }

  ensureGrenadeSlot() {
    return this.ensureTacticalSlot('grenade');
  }

  ensureTacticalSlot(weaponId) {
    const id = String(weaponId || '').toLowerCase();
    const tactical = this._makeTacticalWeapon(id);
    if (!tactical) return null;
    if (this.mutations?.hasWeaponAccess && !this.mutations.hasWeaponAccess(id)) return null;
    const tacticalIndex = this.inventory.findIndex(weapon => this._isTacticalWeapon(weapon));
    if (tacticalIndex >= 0) {
      const old = this.inventory[tacticalIndex];
      if (old?.name === tactical.name) return old;
      old?.triggerUp?.();
      old?.clearWorld?.(this.context());
      this.inventory[tacticalIndex] = tactical;
      if (this.currentIndex === tacticalIndex) this.currentIndex = tacticalIndex;
    } else {
      this.inventory.push(tactical);
    }
    this.notifyInventoryChange();
    return tactical;
  }

  _isTacticalWeapon(weapon) {
    return weapon?.name === 'Grenade';
  }

  _makeTacticalWeapon(weaponId) {
    if (weaponId === 'grenade') return this._configureReserveLimit(new GrenadePistol(), { reset: true });
    return null;
  }

  _makeCheckpointWeapon(name) {
    const weaponName = String(name || '');
    const classifiedId = weaponName === 'Rifle' ? 'rifle'
      : weaponName === 'DMR' ? 'dmr'
        : weaponName === 'Grenade' ? 'grenade' : null;
    if (classifiedId && this.mutations?.hasWeaponAccess?.(classifiedId) === false) return null;
    if (weaponName === 'Rifle') return new Rifle({ mastery: this.mutations });
    if (weaponName === 'SMG') return new SMG({ mastery: this.mutations });
    if (weaponName === 'Shotgun') return new Shotgun();
    if (weaponName === 'DMR') return new DMR({ mastery: this.mutations });
    if (weaponName === 'Pistol') return new Pistol();
    if (weaponName === 'Grenade') return new GrenadePistol();
    if (weaponName === 'Minigun') return new Minigun({ mastery: this.mutations });
    if (weaponName === 'BeamSaber') return new BeamSaber();
    return null;
  }

  _getOwnedTacticalId() {
    const equipped = this.mutations?.getEquippedTactical?.();
    if (equipped && this.mutations?.isWeaponOwned?.(equipped)) return equipped;
    if (this.mutations?.isWeaponOwned?.('grenade')) return 'grenade';
    return null;
  }

  setObjects(objects) { this.objects = objects; }

  notifyInventoryChange() {
    for (const weapon of this.inventory) this.mutations?.discoverWeapon?.(weapon?.name);
    this.updateHUD?.();
    this.onWeaponSwitch?.();
  }

  switchSlot(slotIndex1Based) {
    const idx = (slotIndex1Based | 0) - 1;
    if (idx >= 0 && idx < this.inventory.length) {
      const old = this.current;
      this.cancelZoom();
      if (old) {
        old.triggerUp();
        if (typeof old.altTriggerCancel === 'function') old.altTriggerCancel(this.context());
      }
      this.currentIndex = idx;
      this.notifyInventoryChange();
    }
  }

  // Swap primary to a new weapon instance and convert reserve from old
  swapPrimary(makeWeaponFn) {
    const hasNoPrimary = this.primarySlotEmpty === true;
    const old = hasNoPrimary ? null : this.inventory[0];
    this.cancelZoom();
    if (old) {
      old.triggerUp();
      if (typeof old.altTriggerCancel === 'function') old.altTriggerCancel(this.context());
    }
    const carry = Math.floor(Math.max(0, (old?.reserveAmmo || 0)) * 0.5);
    const newW = this._configureReserveLimit(makeWeaponFn(), { reset: true });
    newW.addReserve(carry);
    // If we are in pistol-only start (no primary yet), insert primary and keep pistol as sidearm
    if (hasNoPrimary) {
      this.inventory.unshift(newW); // new primary at slot 0
    } else {
      this.inventory[0] = newW;
    }
    this.primarySlotEmpty = false;
    this.currentIndex = 0;
    this.notifyInventoryChange();
    return newW;
  }

  replaceSecondaryWithSMG() {
    const secondaryIndex = this.primarySlotEmpty ? 0 : 1;
    const old = this.inventory[secondaryIndex];
    if (!old || this._isTacticalWeapon(old)) return null;
    this.cancelZoom();
    old.triggerUp?.();
    old.altTriggerCancel?.(this.context());
    old.clearWorld?.(this.context());
    const smg = this._configureReserveLimit(new SMG({ mastery: this.mutations }), { reset: true });
    this.inventory[secondaryIndex] = smg;
    this.notifyInventoryChange();
    return smg;
  }

  // Offer pool based on unlock flags
  getUnlockedPrimaries(unlocks){
    const list = [];
    // Classified primary weapons must be permanently licensed before they can
    // enter an Armory offer. A reveal/trial is not ownership.
    const canOffer = weapon => !this.mutations?.isWeaponClassified?.(weapon) || this.mutations?.isWeaponOwned?.(weapon) === true;
    if (unlocks?.rifle && canOffer('rifle')) list.push({ name:'Rifle', make: ()=> new Rifle({ mastery: this.mutations }) });
    if (unlocks?.smg) list.push({ name:'SMG', make: ()=> new SMG({ mastery: this.mutations }) });
    if (unlocks?.shotgun) list.push({ name:'Shotgun', make: ()=> new Shotgun() });
    if (unlocks?.dmr && canOffer('dmr')) list.push({ name:'DMR', make: ()=> new DMR({ mastery: this.mutations }) });
    if (unlocks?.minigun) list.push({ name:'Minigun', make: ()=> new Minigun({ mastery: this.mutations }) });
    if (unlocks?.beamsaber) list.push({ name:'BeamSaber', make: ()=> new BeamSaber() });
    return list;
  }

  // The Pistol remains Slot 2. Grenade is a classified permanent Slot 3 package.
  getSidearms(){
    return [{ name:'Pistol', make: ()=> new Pistol() }];
  }

  onAmmoPickup(amount) {
    const gain = Math.max(0, amount | 0);
    const name = this.current?.name || '';
    // BeamSaber has no ammo economy
    if (name === 'BeamSaber') return 0;
    // Balance pass: scale ammo pickup by weapon archetype so each drop yields
    // a comparable fraction of that weapon's default reserve.
    // Target avg fraction of default reserve per drop (approx):
    //  - Rifle ~30% (0.85x of 15–30)
    //  - SMG ~33% (1.6x of 15–30)
    //  - Shotgun ~25% (0.3x of 15–30)
    //  - DMR ~25% (0.4x of 15–30)
    //  - Pistol ~20% (0.45x of 15–30)
    //  - Minigun ~24% (4.0x of 15–30)
    const weaponPickupMultiplier = (w)=>{
      switch (w) {
        case 'SMG': return 1.6;
        case 'Shotgun': return 0.3;
        case 'DMR': return 0.3;
        case 'Pistol': return 0.45;
        case 'Rifle': return 0.85;
        case 'Minigun': return 4.0;
        case 'BeamSaber': return 0.0;
        case 'Grenade': return 0.2;
        default: return 1.0;
      }
    };
    const multiplier = weaponPickupMultiplier(name);

    // Exclude BeamSaber from split calculations
    const weapons = this.inventory.filter(w => w?.name !== 'BeamSaber');

    if (!this.splitPickupsProportionally || weapons.length <= 1) {
      const adjustedGain = Math.floor(gain * multiplier);
      const acceptedGain = this.current?.addReserve(adjustedGain) || 0;
      this.S?.reload?.();
      this.updateHUD?.();
      return acceptedGain;
    }
    // Proportional to deficits against each weapon's nominal reserve
    const deficits = weapons.map(w => Math.max(0, (w.getReserveCapacity?.() ?? w.cfg.reserve ?? 0) - (w.reserveAmmo || 0)));
    const totalDeficit = deficits.reduce((a,b)=>a+b,0);
    let granted = 0;
    if (totalDeficit <= 0) {
      // Fallback: split evenly
      const per = Math.floor(gain / weapons.length);
      let rem = gain - per * weapons.length;
      for (let i=0;i<weapons.length;i++) {
        const add = per + (rem>0?1:0); rem = Math.max(0, rem-1);
        granted += weapons[i].addReserve(add) || 0;
      }
    } else {
      let remaining = gain;
      for (let i=0;i<weapons.length;i++) {
        const share = Math.floor(gain * (deficits[i] / totalDeficit));
        const accepted = weapons[i].addReserve(share) || 0;
        granted += accepted;
        remaining -= share;
      }
      // distribute any rounding remainder to current weapon first
      if (remaining > 0) {
        granted += this.current?.addReserve(remaining) || 0;
      }
      // If current has a >1 multiplier, grant extra bonus to current to keep feel consistent
      if (multiplier > 1) {
        const bonus = Math.floor(gain * (multiplier - 1));
        if (bonus > 0) {
          granted += this.current?.addReserve(bonus) || 0;
        }
      }
    }
    this.S?.reload?.();
    this.updateHUD?.();
    return granted;
  }
}


