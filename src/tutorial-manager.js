import { t } from './i18n/index.js';
import { Rifle } from './weapons/rifle.js';

const STEP_KEYS = Object.freeze([
  'tutorial.walk',
  'tutorial.jump',
  'tutorial.shoot',
  'tutorial.obstacles',
  'tutorial.crate',
  'tutorial.grunt',
  'tutorial.hideShooter',
  'tutorial.finalRifle'
]);

const distance2D = (position, target) => Math.hypot(position.x - target[0], position.z - target[1]);

export class TutorialManager {
  constructor({
    documentRef = document,
    hud = (typeof window !== 'undefined' ? window._HUD : null),
    enemyManager = null,
    weaponSystem = null,
    getPlayer = null,
    spawnCrate = null,
    onStep = null,
    onMarker = null,
    onEnd = null
  } = {}) {
    this.doc = documentRef;
    this.hud = hud;
    this.enemyManager = enemyManager;
    this.weaponSystem = weaponSystem;
    this.getPlayer = getPlayer;
    this.spawnCrate = spawnCrate;
    this.onStep = onStep;
    this.onMarker = onMarker;
    this.onEnd = onEnd;
    this._step = 0;
    this.active = false;
    this.layout = null;
    this._origInventory = null;
    this._origIndex = 0;
    this._coverSeconds = 0;
    this._lastProgress = -1;
    this._lastCoverHidden = null;
    this._spawned = new Set();
    this._markerTarget = null;
    this._shooterRoot = null;
    this._onKey = this._onKey.bind(this);
  }

  start(layout = {}) {
    this.active = true;
    this._step = 0;
    this.layout = layout;
    this._coverSeconds = 0;
    this._lastProgress = -1;
    this._lastCoverHidden = null;
    this._spawned.clear();
    this._markerTarget = null;
    this._shooterRoot = null;
    if (this.weaponSystem) {
      this._origInventory = this.weaponSystem.inventory.slice();
      this._origIndex = this.weaponSystem.currentIndex | 0;
      // The room begins with the campaign's actual starting kit: Pistol only.
      this.weaponSystem.currentIndex = Math.max(0, this.weaponSystem.inventory.findIndex(weapon => weapon?.name === 'Pistol'));
      this.weaponSystem.notifyInventoryChange?.();
    }
    this.doc.addEventListener('keydown', this._onKey);
    this._showStep();
  }

  update(dt) {
    if (!this.active) return;
    const player = this.getPlayer?.();
    if (!player?.position) return;
    if (this._step === 0 && distance2D(player.position, this.layout.walkTarget || [0, 5.2]) <= 1.25) {
      this._advance();
      return;
    }
    if (this._step === 3 && distance2D(player.position, this.layout.obstacleTarget || [-5.8, 1.2]) <= 1.4) {
      this._advance();
      return;
    }
    if (this._step !== 6) return;
    const cover = this.layout.coverZone || { center: [2.65, 5.25], radius: 1.4, seconds: 1.5 };
    const hasSightlineTest = !!this._shooterRoot && typeof this.enemyManager?.hasWorldLineOfSight === 'function';
    // The authored safe pocket must stay dependable even when a ray grazes the
    // cover edge. Other cover remains valid when it genuinely breaks sight.
    const inSafePocket = distance2D(player.position, cover.center) <= cover.radius;
    const lineBroken = hasSightlineTest
      && !this.enemyManager.hasWorldLineOfSight(this._shooterRoot, player.position);
    const hidden = inSafePocket || lineBroken;
    if (hidden) this._coverSeconds += Math.max(0, dt || 0);
    // This is a teaching beat, not a punishment: leaving cover pauses progress.
    const completionThreshold = Math.max(0, cover.seconds - .02);
    if (this._coverSeconds >= completionThreshold) {
      this._coverSeconds = cover.seconds;
      this._advance();
      return;
    }
    const progress = Math.min(1, this._coverSeconds / cover.seconds);
    const hiddenChanged = hidden !== this._lastCoverHidden;
    this._lastCoverHidden = hidden;
    if (progress - this._lastProgress >= .025 || hiddenChanged) {
      this._lastProgress = progress;
      const detail = hidden
        ? t('tutorial.hideProgress').replace('{seconds}', Math.max(1, Math.ceil(cover.seconds - this._coverSeconds)))
        : t('tutorial.findCover');
      this._emitStep(progress, detail);
    }
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.doc.removeEventListener('keydown', this._onKey);
    for (const root of this._spawned) this.enemyManager?.remove?.(root);
    this._spawned.clear();
    this._shooterRoot = null;
    if (this.weaponSystem && this._origInventory) {
      this.weaponSystem.inventory = this._origInventory;
      this.weaponSystem.currentIndex = this._origIndex;
      this.weaponSystem.notifyInventoryChange?.();
    }
    this.onStep?.({ visible: false });
    this.onMarker?.({ visible: false });
    const completionMessage = t('tutorial.complete');
    if (this.enemyManager) this.enemyManager.suspendWaves = false;
    if (this.onEnd) this.onEnd({ message: completionMessage });
    else this.hud?.toast?.(completionMessage);
  }

  _showStep() {
    if (!this.active) return;
    const key = STEP_KEYS[this._step];
    if (!key) {
      this.end();
      return;
    }
    this.hud?.toast?.(t(key));
    this._emitStep(0);
    this._emitMarker();
  }

  _emitMarker() {
    if (!this.active) return;
    const layout = this.layout || {};
    const markers = [
      { position: layout.walkTarget || [0, 5.2], color: 'cyan' },
      { position: layout.jumpTarget || [0, 4.25], color: 'amber' },
      { position: layout.shootingTarget || [0, -7.7], color: 'red' },
      { position: layout.obstacleTarget || [-5.8, 1.2], color: 'lime' },
      { position: layout.cratePosition || [5.7, 0, 3.2], color: 'amber' },
      { position: layout.gruntSpawn || [-5.5, .8, 3], target: this._markerTarget, color: 'red' },
      { position: layout.coverZone?.center || [2.65, 5.25], color: 'cyan' },
      { position: layout.finalGruntSpawns?.[1] || [0, .8, -6], color: 'red' }
    ];
    this.onMarker?.({ visible: true, ...markers[this._step] });
  }

  _emitStep(stageProgress = 0, detail = '') {
    const overall = Math.min(1, (this._step + Math.max(0, Math.min(1, stageProgress))) / STEP_KEYS.length);
    this.onStep?.({
      visible: true,
      kind: 'tutorial',
      levelNameKey: 'level.tutorial.name',
      titleKey: STEP_KEYS[this._step],
      detail: detail || t('tutorial.progress')
        .replace('{current}', this._step + 1)
        .replace('{total}', STEP_KEYS.length),
      progress: overall
    });
  }

  _advance() {
    if (!this.active) return;
    this._markerTarget = null;
    this._step += 1;
    this._lastProgress = -1;
    if (this._step === 4) {
      this.spawnCrate?.(this.layout.cratePosition || [5.7, 0, 3.2]);
    } else if (this._step === 5) {
      this._spawnTracked('grunt', this.layout.gruntSpawn || [-5.5, .8, 3], {
        hp: 70,
        trackMarker: true,
        facing: this.layout.gruntFacing || [1, 0, 0],
        revealSeconds: 1.25,
        onCleared: () => this._advance()
      });
    } else if (this._step === 6) {
      this._coverSeconds = 0;
      this._lastCoverHidden = null;
      this._shooterRoot = this._spawnTracked('shooter', this.layout.shooterSpawn || [0, .8, -7.5], {
        hp: 100000,
        movementLocked: true
      });
    } else if (this._step === 7) {
      for (const root of this._spawned) {
        if (root?.userData?.type === 'shooter') {
          this.enemyManager?.remove?.(root);
          this._spawned.delete(root);
        }
      }
      this._shooterRoot = null;
      this.weaponSystem?.swapPrimary?.(() => new Rifle());
      let remaining = (this.layout.finalGruntSpawns || []).length;
      const onCleared = () => {
        remaining -= 1;
        if (remaining <= 0) this._advance();
      };
      for (const position of this.layout.finalGruntSpawns || []) {
        this._spawnTracked('grunt', position, { hp: 70, onCleared });
      }
    }
    this._showStep();
  }

  _spawnTracked(type, position, {
    hp = null,
    onCleared = null,
    trackMarker = false,
    facing = null,
    revealSeconds = 0,
    movementLocked = false
  } = {}) {
    if (!this.enemyManager || !position) return null;
    const spawnPosition = Array.isArray(position)
      ? new this.enemyManager.THREE.Vector3(position[0], position[1], position[2])
      : position;
    const root = this.enemyManager.spawnAt(type, spawnPosition, { countsTowardAlive: false });
    if (!root) return null;
    this._spawned.add(root);
    if (trackMarker) this._markerTarget = root;
    if (movementLocked) root.userData.movementLocked = true;
    if (Array.isArray(facing) && root.rotation) root.rotation.y = Math.atan2(facing[0], facing[2]);
    if (revealSeconds > 0) {
      root.userData.stunnedUntil = (this.enemyManager._aiClock || 0) + revealSeconds;
      root.userData.tutorialReveal = true;
    }
    if (Number.isFinite(hp)) {
      root.userData.hp = hp;
      root.userData.maxHp = hp;
    }
    const instance = this.enemyManager.instanceByRoot?.get?.(root);
    if (instance) {
      const originalRemoved = instance.onRemoved;
      instance.onRemoved = (...args) => {
        // Enemy cleanup methods are instance methods (Shooters clear their
        // projectile pool through `this`). Preserve that receiver when adding
        // tutorial bookkeeping around the production cleanup hook.
        originalRemoved?.call(instance, ...args);
        this._spawned.delete(root);
        if (this.active && onCleared) onCleared();
      };
    }
    return root;
  }

  _onKey(event) {
    if (!this.active) return;
    if (this._step === 1 && event.code === 'Space') this._advance();
  }

  onTargetDestroyed() {
    // Shooting at empty space must not complete the lesson. The authored red
    // plate calls this only after its real world collider reaches zero HP.
    if (this.active && this._step === 2) this._advance();
  }

  onPickup() {
    // The tutorial crate emits ammo when its two-hit Pistol whip interaction
    // succeeds. Pickup collection is therefore a reliable end-to-end signal.
    if (this.active && this._step === 4) this._advance();
  }
}
