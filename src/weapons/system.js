import { Rifle } from './rifle.js';
import { SMG } from './smg.js';
import { Shotgun } from './shotgun.js';
import { DMR } from './dmr.js';
import { Pistol } from './pistol.js';
import { GrenadePistol } from './grenadepistol.js';
import { Minigun } from './minigun.js';
import { BeamSaber } from './beamsaber.js';

// WeaponSystem orchestrates current weapon, input mapping, and HUD sync
export class WeaponSystem {
  constructor({ THREE, camera, raycaster, enemyManager, objects, effects, obstacleManager, pickups, S, updateHUD, addScore, addComboAction, combo, addTracer, applyRecoil, weaponView }) {
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
    this.weaponView = weaponView;
    this.splitPickupsProportionally = false; // optional economy mode

    this.inventory = [];
    this.currentIndex = 0; // primary slot index

    // Start wave 1 with only a Pistol
    this.inventory.push(new Pistol());  // Sidearm-only start; primary is acquired later
  }

  get current() { return this.inventory[this.currentIndex]; }

  getAmmo() { return this.current?.getAmmo() ?? 0; }
  getReserve() { return this.current?.getReserve() ?? 0; }
  getPrimaryName() { return this.current?.name || 'Rifle'; }

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
      applyKnockback: (enemy, vec) => this.enemyManager?.applyKnockback?.(enemy, vec)
    };
  }

  triggerDown() {
    const w = this.current; if (!w) return;
    // Block firing while reload tilt is active
    try { if (this.weaponView?.isReloading?.()) { this.updateHUD?.(); return; } } catch(_) {}
    // if empty, play reload sound instead and flash ammo pill state via HUD update
    if (w.getAmmo() <= 0) { this.S?.reload?.(); this.updateHUD?.(); return; }
    w.triggerDown(this.context());
  }

  triggerUp() { this.current?.triggerUp(); }

  triggerAltDown() {
    const w = this.current; if (!w) return;
    if (typeof w.altTriggerDown === 'function') w.altTriggerDown(this.context());
  }

  triggerAltUp() {
    const w = this.current; if (!w) return;
    if (typeof w.altTriggerUp === 'function') w.altTriggerUp(this.context());
  }

  reload() {
    const ok = this.current?.reload(() => this.S?.reload?.());
    if (ok) {
      // Trigger simple reload tilt on weapon view
      try {
        const name = this.getPrimaryName();
        const heavy = (name === 'Shotgun' || name === 'DMR');
        this.weaponView?.startReload?.({ dur: heavy ? 0.85 : 0.65, rollDeg: heavy ? 38 : 28, drop: heavy ? 0.08 : 0.06, back: heavy ? 0.06 : 0.045 });
        // Ensure firing stops during reload
        this.current?.triggerUp();
      } catch(_) {}
      this.updateHUD?.();
    }
  }

  update(dt) { this.current?.update(dt, this.context()); }

  reset() { for (const w of this.inventory) w.reset(); this.updateHUD?.(); }

  setObjects(objects) { this.objects = objects; }

  switchSlot(slotIndex1Based) {
    const idx = (slotIndex1Based | 0) - 1;
    if (idx >= 0 && idx < this.inventory.length) {
      const old = this.current;
      if (old) {
        old.triggerUp();
        if (typeof old.altTriggerCancel === 'function') old.altTriggerCancel(this.context());
      }
      this.currentIndex = idx;
      this.updateHUD?.();
    }
  }

  // Swap primary to a new weapon instance and convert reserve from old
  swapPrimary(makeWeaponFn) {
    const old = this.current;
    if (old) {
      old.triggerUp();
      if (typeof old.altTriggerCancel === 'function') old.altTriggerCancel(this.context());
    }
    const carry = Math.floor(Math.max(0, (old?.reserveAmmo || 0)) * 0.5);
    const newW = makeWeaponFn();
    newW.reset();
    newW.addReserve(carry);
    // If we are in pistol-only start (no primary yet), insert primary and keep pistol as sidearm
    if (this.inventory.length === 1 && (this.inventory[0] instanceof Pistol || this.inventory[0]?.name === 'Pistol')) {
      this.inventory.unshift(newW); // new primary at slot 0
      this.currentIndex = 0;
    } else {
      this.inventory[this.currentIndex] = newW;
    }
    this.updateHUD?.();
    return newW;
  }

  // Offer pool based on unlock flags
  getUnlockedPrimaries(unlocks){
    const list = [{ name:'Rifle', make: ()=> new Rifle() }];
    if (unlocks?.smg) list.push({ name:'SMG', make: ()=> new SMG() });
    if (unlocks?.shotgun) list.push({ name:'Shotgun', make: ()=> new Shotgun() });
    if (unlocks?.dmr) list.push({ name:'DMR', make: ()=> new DMR() });
    if (unlocks?.minigun) list.push({ name:'Minigun', make: ()=> new Minigun() });
    if (unlocks?.beamsaber) list.push({ name:'BeamSaber', make: ()=> new BeamSaber() });
    return list;
  }

  // Sidearm offers (wave 20+): Pistol vs GrenadePistol
  getSidearms(){
    return [
      { name:'Pistol', make: ()=> new Pistol() },
      { name:'Grenade', make: ()=> new GrenadePistol() }
    ];
  }

  onAmmoPickup(amount) {
    const gain = Math.max(0, amount | 0);
    const name = this.current?.name || '';
    // BeamSaber has no ammo economy
    if (name === 'BeamSaber') return;
    // Balance pass: scale ammo pickup by weapon archetype so each drop yields
    // a comparable fraction of that weapon's default reserve.
    // Target avg fraction of default reserve per drop (approx):
    //  - Rifle ~30% (0.85x of 15–30)
    //  - SMG ~33% (1.6x of 15–30)
    //  - Shotgun ~25% (0.3x of 15–30)
    //  - DMR ~25% (0.4x of 15–30)
    //  - Pistol ~20% (0.45x of 15–30)
    //  - Minigun ~20% (1.8x of 15–30)
    const weaponPickupMultiplier = (w)=>{
      switch (w) {
        case 'SMG': return 1.6;
        case 'Shotgun': return 0.3;
        case 'DMR': return 0.3;
        case 'Pistol': return 0.45;
        case 'Rifle': return 0.85;
        case 'Minigun': return 1.8;
        default: return 1.0;
      }
    };
    const multiplier = weaponPickupMultiplier(name);

    // Exclude BeamSaber from split calculations
    const weapons = this.inventory.filter(w => w?.name !== 'BeamSaber');

    if (!this.splitPickupsProportionally || weapons.length <= 1) {
      const adjustedGain = Math.floor(gain * multiplier);
      this.current?.addReserve(adjustedGain);
      this.S?.reload?.();
      this.updateHUD?.();
      return;
    }
    // Proportional to deficits against each weapon's nominal reserve
    const deficits = weapons.map(w => Math.max(0, (w.cfg.reserve || 0) - (w.reserveAmmo || 0)));
    const totalDeficit = deficits.reduce((a,b)=>a+b,0);
    if (totalDeficit <= 0) {
      // Fallback: split evenly
      const per = Math.floor(gain / weapons.length);
      let rem = gain - per * weapons.length;
      for (let i=0;i<weapons.length;i++) {
        const add = per + (rem>0?1:0); rem = Math.max(0, rem-1);
        weapons[i].addReserve(add);
      }
    } else {
      let remaining = gain;
      for (let i=0;i<weapons.length;i++) {
        const share = Math.floor(gain * (deficits[i] / totalDeficit));
        weapons[i].addReserve(share);
        remaining -= share;
      }
      // distribute any rounding remainder to current weapon first
      if (remaining > 0) this.current?.addReserve(remaining);
      // If current has a >1 multiplier, grant extra bonus to current to keep feel consistent
      if (multiplier > 1) {
        const bonus = Math.floor(gain * (multiplier - 1));
        if (bonus > 0) this.current?.addReserve(bonus);
      }
    }
    this.S?.reload?.();
    this.updateHUD?.();
  }
}


