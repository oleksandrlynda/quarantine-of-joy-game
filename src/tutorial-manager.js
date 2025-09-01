import { t } from './i18n/index.js';
import { Rifle } from './weapons/rifle.js';

export class TutorialManager {
  constructor({
    documentRef = document,
    hud = (typeof window !== 'undefined' ? window._HUD : null),
    enemyManager = null,
    weaponSystem = null,
    onEnd = null
  } = {}) {
    this.doc = documentRef;
    this.hud = hud;
    this.enemyManager = enemyManager;
    this.weaponSystem = weaponSystem;
    this._step = 0;
    this.active = false;
    this.enemySpawns = [];
    this.onEnd = onEnd;
    this._onKey = this._onKey.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onMouseDownCapture = this._onMouseDownCapture.bind(this);
    this._sprintTimer = null;
    this._origInventory = null;
    this._origIndex = 0;
    this._preAmmo = null;
  }

  start(spawnPoints = []) {
    this.active = true;
    this._step = 0;
    this.enemySpawns = spawnPoints;
    if (this.weaponSystem && typeof this.weaponSystem.swapPrimary === 'function') {
      try {
        this._origInventory = this.weaponSystem.inventory.slice();
        this._origIndex = this.weaponSystem.currentIndex | 0;
        this.weaponSystem.swapPrimary(() => new Rifle());
      } catch (e) { console.error(e); }
    }
    const staminaEl = this.doc.getElementById('stamina');
    if (staminaEl) staminaEl.style.display = 'none';
    this.hud?.toast?.(t('tutorial.move'));
    this.doc.addEventListener('keydown', this._onKey);
    this.doc.addEventListener('mousemove', this._onMove);
    this.doc.addEventListener('mousedown', this._onMouseDownCapture, true);
    this.doc.addEventListener('mousedown', this._onClick);
  }

  end() {
    this.active = false;
    this.doc.removeEventListener('keydown', this._onKey);
    this.doc.removeEventListener('mousemove', this._onMove);
    this.doc.removeEventListener('mousedown', this._onMouseDownCapture, true);
    this.doc.removeEventListener('mousedown', this._onClick);
    if (this._sprintTimer) {
      clearInterval(this._sprintTimer);
      this._sprintTimer = null;
    }
    const staminaEl = this.doc.getElementById('stamina');
    if (staminaEl) staminaEl.style.display = '';
    if (this.weaponSystem && this._origInventory) {
      this.weaponSystem.inventory = this._origInventory;
      this.weaponSystem.currentIndex = this._origIndex;
      try { this.weaponSystem.updateHUD?.(); } catch (e) { console.error(e); }
    }
    this.hud?.toast?.(t('tutorial.complete'));
    if (this.enemyManager) this.enemyManager.suspendWaves = false;
    if (typeof this.onEnd === 'function') {
      try { this.onEnd(); } catch (e) { console.error(e); }
    }
  }

  _advance() {
    this._step++;
    switch (this._step) {
      case 1: {
        const staminaEl = this.doc.getElementById('stamina');
        if (staminaEl) staminaEl.style.display = '';
        this.hud?.toast?.(t('tutorial.sprint'));
        this._startSprintWatch();
        break;
      }
      case 2:
        this.hud?.toast?.(t('tutorial.jump'));
        break;
      case 3:
        this.hud?.toast?.(t('tutorial.crouch'));
        break;
      case 4:
        this.hud?.toast?.(t('tutorial.aim'));
        break;
      case 5:
        this._spawnGrunt();
        this.hud?.toast?.(t('tutorial.headshot'));
        break;
      case 6:
        if (this.enemyManager && this.enemySpawns[1]) {
          const root = this.enemyManager.spawnAt('shooter', this.enemySpawns[1], { countsTowardAlive: false });
          if (root) {
            const inst = this.enemyManager.instanceByRoot?.get?.(root);
            const origRemoved = inst?.onRemoved;
            if (inst) {
              inst.onRemoved = (...args) => {
                origRemoved?.(...args);
                if (this.active && this._step === 6) this._advance();
              };
            }
          }
        }
        this.hud?.toast?.(t('tutorial.shooter'));
        break;
      case 7:
        this.hud?.toast?.(t('tutorial.sidearm'));
        break;
      case 8:
        this.hud?.toast?.(t('tutorial.primary'));
        break;
      case 9:
        this.hud?.toast?.(t('tutorial.reload'));
        break;
      case 10:
        this.hud?.toast?.(t('tutorial.pickup'));
        break;
      case 11:
        this.end();
        break;
    }
  }

  _onKey(e) {
    if (!this.active) return;
    if (this._step === 0 && ['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
      this._advance();
    } else if (this._step === 2 && e.code === 'Space') {
      this._advance();
    } else if (this._step === 3 && e.code === 'KeyC') {
      this._advance();
    } else if (this._step === 9 && e.code === 'KeyR') {
      this._advance();
    }
  }

  _onMove() {
    if (this.active && this._step === 4) this._advance();
  }

  _onClick() {
    if (!this.active) return;
    const ws = this.weaponSystem;
    if (!ws) return;
    if (this._step === 7 && ws.currentIndex === 1) {
      const after = ws.getAmmo?.();
      if (typeof this._preAmmo === 'number' && after < this._preAmmo) {
        this._advance();
      } else {
        this.hud?.toast?.(t('tutorial.noammo'));
      }
    } else if (this._step === 8 && ws.currentIndex === 0) {
      const after = ws.getAmmo?.();
      if (typeof this._preAmmo === 'number' && after < this._preAmmo) {
        this._advance();
      } else {
        this.hud?.toast?.(t('tutorial.noammo'));
      }
    }
  }

  _onMouseDownCapture() {
    if (!this.active) return;
    if (this._step === 7 || this._step === 8) {
      this._preAmmo = this.weaponSystem?.getAmmo?.();
    } else {
      this._preAmmo = null;
    }
  }

  onPickup() {
    if (this.active && this._step === 10) this._advance();
  }

  _spawnGrunt() {
    if (!this.enemyManager || !this.enemySpawns[0]) return;
    const root = this.enemyManager.spawnAt('grunt', this.enemySpawns[0], { countsTowardAlive: false });
    if (!root || !root.userData) return;
    const base = root.userData.hp || root.userData.maxHp || 100;
    const half = base / 2;
    root.userData.hp = half;
    root.userData.maxHp = half;
    const inst = this.enemyManager.instanceByRoot?.get?.(root);
    if (!inst) return;
    const origHit = inst.onHit;
    const origRemoved = inst.onRemoved;
    inst._killedByHeadshot = false;
    inst.onHit = (damage, isHead, ...args) => {
      const hpBefore = root.userData.hp;
      origHit?.call(inst, damage, isHead, ...args);
      if (isHead && hpBefore - damage <= 0) inst._killedByHeadshot = true;
    };
    inst.onRemoved = (...args) => {
      origRemoved?.(...args);
      if (!this.active || this._step !== 5) return;
      if (inst._killedByHeadshot) {
        this._advance();
      } else {
        this.hud?.toast?.(t('tutorial.headshot'));
        this._spawnGrunt();
      }
    };
  }

  _startSprintWatch() {
    if (this._sprintTimer) return;
    const bar = this.doc.getElementById('staminaBar');
    if (!bar) return;
    this._sprintTimer = setInterval(() => {
      const pct = parseFloat(bar.style.width);
      if (!isNaN(pct) && pct < 85) {
        clearInterval(this._sprintTimer);
        this._sprintTimer = null;
        if (this.active && this._step === 1) this._advance();
      }
    }, 100);
  }
}
