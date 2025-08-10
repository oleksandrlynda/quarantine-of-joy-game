import { Rifle } from './rifle.js';
import { SMG } from './smg.js';
import { Shotgun } from './shotgun.js';
import { DMR } from './dmr.js';
import { Pistol } from './pistol.js';

// WeaponSystem orchestrates current weapon, input mapping, and HUD sync
export class WeaponSystem {
  constructor({ THREE, camera, raycaster, enemyManager, objects, effects, obstacleManager, pickups, S, updateHUD, addScore, addComboAction, combo, addTracer }) {
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
    this.splitPickupsProportionally = false; // optional economy mode

    this.inventory = [];
    this.currentIndex = 0; // primary slot index

    // Start progression: only Primary (Rifle) and Sidearm (Pistol)
    this.inventory.push(new Rifle());   // Primary
    this.inventory.push(new Pistol());  // Sidearm
  }

  get current() { return this.inventory[this.currentIndex]; }

  getAmmo() { return this.current?.getAmmo() ?? 0; }
  getReserve() { return this.current?.getReserve() ?? 0; }
  getPrimaryName() { return this.current?.name || 'Rifle'; }

  context() {
    return {
      THREE: this.THREE,
      camera: this.camera,
      raycaster: this.raycaster,
      enemyManager: this.enemyManager,
      objects: this.objects,
      effects: this.effects,
      obstacleManager: this.obstacleManager,
      pickups: this.pickups,
      S: this.S,
      updateHUD: this.updateHUD,
      addScore: this.addScore,
      addComboAction: this.addComboAction,
      combo: this.combo,
      addTracer: this.addTracer,
    };
  }

  triggerDown() {
    const w = this.current; if (!w) return;
    // if empty, play reload sound instead
    if (w.getAmmo() <= 0) { this.S?.reload?.(); this.updateHUD?.(); return; }
    w.triggerDown(this.context());
  }

  triggerUp() { this.current?.triggerUp(); }

  reload() { const ok = this.current?.reload(() => this.S?.reload?.()); if (ok) this.updateHUD?.(); }

  update(dt) { this.current?.update(dt, this.context()); }

  reset() { for (const w of this.inventory) w.reset(); this.updateHUD?.(); }

  setObjects(objects) { this.objects = objects; }

  switchSlot(slotIndex1Based) {
    const idx = (slotIndex1Based | 0) - 1;
    if (idx >= 0 && idx < this.inventory.length) {
      this.currentIndex = idx;
      this.updateHUD?.();
    }
  }

  // Swap primary to a new weapon instance and convert reserve from old
  swapPrimary(makeWeaponFn) {
    const old = this.current;
    const carry = Math.floor(Math.max(0, (old?.reserveAmmo || 0)) * 0.5);
    const newW = makeWeaponFn();
    newW.reset();
    newW.addReserve(carry);
    this.inventory[this.currentIndex] = newW;
    this.updateHUD?.();
    return newW;
  }

  // Offer pool based on unlock flags
  getUnlockedPrimaries(unlocks){
    const list = [{ name:'Rifle', make: ()=> new Rifle() }];
    if (unlocks?.smg) list.push({ name:'SMG', make: ()=> new SMG() });
    if (unlocks?.shotgun) list.push({ name:'Shotgun', make: ()=> new Shotgun() });
    if (unlocks?.dmr) list.push({ name:'DMR', make: ()=> new DMR() });
    return list;
  }

  onAmmoPickup(amount) {
    const gain = Math.max(0, amount | 0);
    if (!this.splitPickupsProportionally || this.inventory.length <= 1) {
      this.current?.addReserve(gain);
      this.S?.reload?.();
      this.updateHUD?.();
      return;
    }
    // Proportional to deficits against each weapon's nominal reserve
    const deficits = this.inventory.map(w => Math.max(0, (w.cfg.reserve || 0) - (w.reserveAmmo || 0)));
    const totalDeficit = deficits.reduce((a,b)=>a+b,0);
    if (totalDeficit <= 0) {
      // Fallback: split evenly
      const per = Math.floor(gain / this.inventory.length);
      let rem = gain - per * this.inventory.length;
      for (let i=0;i<this.inventory.length;i++) {
        const add = per + (rem>0?1:0); rem = Math.max(0, rem-1);
        this.inventory[i].addReserve(add);
      }
    } else {
      let remaining = gain;
      for (let i=0;i<this.inventory.length;i++) {
        const share = Math.floor(gain * (deficits[i] / totalDeficit));
        this.inventory[i].addReserve(share);
        remaining -= share;
      }
      // distribute any rounding remainder to current weapon first
      if (remaining > 0) this.current?.addReserve(remaining);
    }
    this.S?.reload?.();
    this.updateHUD?.();
  }
}


