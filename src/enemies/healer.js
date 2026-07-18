import { createEnhancedHealerBot } from '../assets/enemy-retrofits.js';
import { cloneNodeMaterial, instantiateSharedTemplate } from './render-template.js';

const _healerTemplates = new WeakMap();
const HEALER_BOMB_COLOR = 0xef233c;

export const HEALER_LAST_SURVIVOR_BOMB = Object.freeze({
  damage: 50,
  currentHpFraction: 0.5,
  radius: 4.5,
  triggerRadius: 2.4,
  fuseSeconds: 1.15,
  chaseSpeed: 6.2
});

const isBossLike = (root) => {
  const type = String(root?.userData?.type || '');
  return type === 'boss' || type.startsWith('boss_') || type.includes('hydraclone');
};

export class HealerEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.rng = rng;

    const built = instantiateSharedTemplate(
      _healerTemplates,
      THREE,
      () => createEnhancedHealerBot({ THREE, mats, scale: 0.5 })
    );
    const body = built.root;
    const head = built.head;
    cloneNodeMaterial(head);
    this._signalMaterials = this._cloneSignalMaterials(built.refs?.signalMeshes);
    body.position.copy(spawnPos);
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    this.speed = cfg.speedMin + this.rng() * (cfg.speedMax - cfg.speedMin);
    this.pulseCooldown = 0;
    this.pulseInterval = 3.5 + (this.rng() - 0.5) * 0.6;
    this.pulseDuration = 2;
    this.pulseTimer = 0;
    this.radius = 6;
    this.healPerSecond = 12;
    this.searchRadius = 14;
    this.selectedTargetRoot = null;
    this.coverAnchor = null;
    this._coverRefresh = 0;
    this._retreatSign = this.rng() < 0.5 ? -1 : 1;
    this._path = null;
    this._bombArmed = false;
    this._bombExploded = false;
    this._bombFuse = HEALER_LAST_SURVIVOR_BOMB.fuseSeconds;
    this._bombPulse = 0;
    this._lastCtx = null;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const root = this.root;
    this._lastCtx = ctx;
    const playerPos = ctx.player.position.clone();

    if (!this._bombArmed && ctx.enemyManager?.isLastWaveEnemy?.(root)) {
      this._armLastSurvivorBomb(ctx);
    }
    if (this._bombArmed) {
      this._updateLastSurvivorBomb(dt, ctx, playerPos);
      return;
    }

    const sense = ctx.sensePlayer?.(root, dt) || { rawWorldLOS: true };

    this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    this.pulseTimer = Math.max(0, this.pulseTimer - dt);
    this._coverRefresh = Math.max(0, this._coverRefresh - dt);

    const target = this._findHealTarget(ctx);
    const nextTargetRoot = target?.root || null;
    if (nextTargetRoot !== this.selectedTargetRoot) {
      this.selectedTargetRoot = nextTargetRoot;
      this.coverAnchor = null;
      this._coverRefresh = 0;
      ctx.emitAIEvent?.(root, 'heal_target_changed', { targetRoot: this.selectedTargetRoot });
    }

    let movementTarget = null;
    if (target) {
      if (!this.coverAnchor || this._coverRefresh <= 0 || target.root.position.distanceTo(this.coverAnchor) > this.radius) {
        this.coverAnchor = this._chooseCoverAnchor(target.root, playerPos, ctx);
        this._coverRefresh = 0.75;
      }
      movementTarget = this.coverAnchor || this._fallbackBehindAlly(target.root, playerPos);
      const targetDistance = root.position.distanceTo(target.root.position);
      const anchorDistance = movementTarget ? root.position.distanceTo(movementTarget) : Infinity;
      if (targetDistance <= this.radius - 0.35 && targetDistance >= 1.45 && anchorDistance <= 0.8) {
        ctx.setAIState?.(root, sense.rawWorldLOS ? 'healing_exposed' : 'healing_from_cover', { targetRoot: target.root });
      } else {
        ctx.setAIState?.(root, 'seeking_heal_cover', { targetRoot: target.root });
      }
    } else {
      movementTarget = this._chooseRetreatTarget(playerPos, ctx);
      ctx.setAIState?.(root, 'retreating', { reason: 'no_injured_allies' });
    }

    if (movementTarget) this._moveToward(movementTarget, playerPos, dt, ctx);

    const injuredInPulse = this._collectAlliesInRadius(ctx, this.radius, true);
    if (this.pulseCooldown <= 0 && this.pulseTimer <= 0 && injuredInPulse.length > 0) {
      this.pulseTimer = this.pulseDuration;
      this.pulseCooldown = this.pulseInterval;
      ctx.emitAIEvent?.(root, 'heal_pulse_started', { targets: injuredInPulse.map(entry => entry.root) });
    }
    if (this.pulseTimer > 0) {
      const amount = this.healPerSecond * dt;
      const allies = this._collectAlliesInRadius(ctx, this.radius, true);
      for (const entry of allies) {
        ctx.proposeHeal?.(entry.root, amount, { sourceRoot: root, targetRoot: entry.root });
        ctx.emitAIEvent?.(root, 'heal_attempted', { targetRoot: entry.root, amount });
      }
      ctx.setAIState?.(root, sense.rawWorldLOS ? 'healing_exposed' : 'healing_from_cover', { targetRoot: this.selectedTargetRoot });
    }
  }

  _cloneSignalMaterials(signalMeshes = []) {
    const materials = [];
    const clones = new Map();
    for (const node of signalMeshes) {
      const source = node?.material;
      if (!source || Array.isArray(source)) continue;
      let material = clones.get(source);
      if (!material) {
        material = source.clone?.() || source;
        clones.set(source, material);
        materials.push(material);
      }
      node.material = material;
    }
    return materials;
  }

  _armLastSurvivorBomb(ctx) {
    this._bombArmed = true;
    this.root.userData.healerBombArmed = true;
    for (const material of this._signalMaterials) {
      material.color?.setHex?.(HEALER_BOMB_COLOR);
      material.emissive?.setHex?.(HEALER_BOMB_COLOR);
      if (material.emissiveIntensity != null) material.emissiveIntensity = 1.5;
    }
    ctx.emitAIEvent?.(this.root, 'healer_bomb_armed', {
      currentHpFraction: HEALER_LAST_SURVIVOR_BOMB.currentHpFraction,
      radius: HEALER_LAST_SURVIVOR_BOMB.radius
    });
    ctx.setAIState?.(this.root, 'last_survivor_bomb');
    try { globalThis.window?._EFFECTS?.ring?.(this.root.position.clone(), HEALER_LAST_SURVIVOR_BOMB.radius, HEALER_BOMB_COLOR); } catch {}
  }

  _updateLastSurvivorBomb(dt, ctx, playerPos) {
    const root = this.root;
    const toPlayer = playerPos.clone().sub(root.position).setY(0);
    const distance = toPlayer.length();
    this._bombPulse += dt;

    if (distance > HEALER_LAST_SURVIVOR_BOMB.triggerRadius && toPlayer.lengthSq() > 0) {
      const step = toPlayer.normalize().multiplyScalar(HEALER_LAST_SURVIVOR_BOMB.chaseSpeed * dt);
      ctx.moveWithCollisions?.(root, step);
      root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      ctx.setAIState?.(root, 'last_survivor_bomb_chase', { distance });
    } else {
      this._bombFuse = Math.max(0, this._bombFuse - dt);
      ctx.setAIState?.(root, 'last_survivor_bomb_fuse', { fuse: this._bombFuse });
    }

    const pulse = 1.15 + (Math.sin(this._bombPulse * 15) * 0.5 + 0.5) * 1.35;
    for (const material of this._signalMaterials) {
      if (material.emissiveIntensity != null) material.emissiveIntensity = pulse;
    }

    if (this._bombFuse <= 0) {
      this._explodeLastSurvivorBomb(ctx);
      ctx.enemyManager?.remove?.(root);
    }
  }

  _explodeLastSurvivorBomb(ctx) {
    if (this._bombExploded) return;
    this._bombExploded = true;
    const root = this.root;
    const pos = root.position.clone();
    const currentHp = Number(
      ctx?.player?.userData?.combatHp
      ?? ctx?.player?.currentHp
      ?? ctx?.player?.hp
    );
    const damage = Number.isFinite(currentHp)
      ? Math.max(0, currentHp) * HEALER_LAST_SURVIVOR_BOMB.currentHpFraction
      : HEALER_LAST_SURVIVOR_BOMB.damage;
    try { globalThis.window?._EFFECTS?.spawnExplosion?.(pos.clone(), HEALER_LAST_SURVIVOR_BOMB.radius, HEALER_BOMB_COLOR); } catch {}
    if (ctx?.player?.position && pos.distanceTo(ctx.player.position) <= HEALER_LAST_SURVIVOR_BOMB.radius) {
      ctx.damagePlayer?.(damage, {
        sourceKind: 'healer_last_survivor_bomb',
        sourceRoot: root,
        ownerRoot: root,
        bypassArmor: true,
        currentHpFraction: HEALER_LAST_SURVIVOR_BOMB.currentHpFraction
      });
    }
    ctx?.emitAIEvent?.(root, 'healer_bomb_exploded', {
      damage,
      currentHpFraction: HEALER_LAST_SURVIVOR_BOMB.currentHpFraction,
      radius: HEALER_LAST_SURVIVOR_BOMB.radius
    });
  }

  onRemoved() {
    if (this._bombArmed && !this._bombExploded) this._explodeLastSurvivorBomb(this._lastCtx);
  }

  _moveToward(target, playerPos, dt, ctx) {
    const THREE = this.THREE;
    const root = this.root;
    let desired = target.clone().sub(root.position).setY(0);
    const distance = desired.length();
    if (distance <= 0.45) return;
    desired.normalize();

    const fromPlayer = root.position.clone().sub(playerPos).setY(0);
    const playerDistance = fromPlayer.length();
    if (fromPlayer.lengthSq() > 0) {
      fromPlayer.normalize();
      desired.add(fromPlayer.multiplyScalar(playerDistance < 18 ? 1.8 : 0.35));
    }

    if (!ctx.locomotionClear?.(root, target) && ctx.pathfind) {
      ctx.pathfind.recomputeIfStale(this, target, { cacheFor: 1.2 }).then(path => { this._path = path; });
      const waypoint = ctx.pathfind.nextWaypoint(this);
      if (waypoint) desired.set(waypoint.x - root.position.x, 0, waypoint.z - root.position.z).normalize();
    } else if (ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
    }

    const avoid = ctx.avoidObstacles?.(root.position, desired, 1.6) || new THREE.Vector3();
    const separation = ctx.separation?.(root.position, 1.7, root) || new THREE.Vector3();
    desired.add(avoid.multiplyScalar(1.1)).add(separation.multiplyScalar(1.35));
    if (desired.lengthSq() > 0) {
      desired.normalize().multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions?.(root, desired);
    }
  }

  _chooseCoverAnchor(targetRoot, playerPos, ctx) {
    const THREE = this.THREE;
    const originAngle = Math.atan2(targetRoot.position.z - playerPos.z, targetRoot.position.x - playerPos.x);
    let best = null;
    let bestScore = -Infinity;
    for (let ringIndex = 0; ringIndex < 2; ringIndex++) {
      const radius = ringIndex === 0 ? 4.2 : 5.25;
      for (let index = 0; index < 12; index++) {
        const angle = originAngle + (index / 12) * Math.PI * 2;
        const candidate = new THREE.Vector3(
          targetRoot.position.x + Math.cos(angle) * radius,
          this.root.position.y,
          targetRoot.position.z + Math.sin(angle) * radius
        );
        if (!ctx.positionClear?.(this.root, candidate, targetRoot)) continue;
        const probe = candidate.clone();
        probe.y += 0.55;
        const hidden = !ctx.enemyManager?._hasImmediateWorldLOS?.(probe, playerPos);
        const playerDistance = Math.hypot(candidate.x - playerPos.x, candidate.z - playerPos.z);
        const travelDistance = Math.hypot(candidate.x - this.root.position.x, candidate.z - this.root.position.z);
        const score = (hidden ? 100 : 0) + playerDistance * 1.4 - travelDistance * 0.35;
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    return best;
  }

  _fallbackBehindAlly(targetRoot, playerPos) {
    const away = targetRoot.position.clone().sub(playerPos).setY(0);
    if (away.lengthSq() === 0) away.set(this._retreatSign, 0, 0);
    away.normalize().multiplyScalar(4.4);
    return targetRoot.position.clone().add(away).setY(this.root.position.y);
  }

  _chooseRetreatTarget(playerPos, ctx) {
    const THREE = this.THREE;
    const allies = ctx.nearbyAllies?.(this.root.position, 14, this.root) || [];
    if (allies.length) {
      let screen = allies[0].root;
      let bestDistance = -Infinity;
      for (const entry of allies) {
        if (isBossLike(entry.root)) continue;
        const distance = entry.root.position.distanceTo(playerPos);
        if (distance > bestDistance) { bestDistance = distance; screen = entry.root; }
      }
      return this._fallbackBehindAlly(screen, playerPos);
    }
    const away = this.root.position.clone().sub(playerPos).setY(0);
    if (away.lengthSq() === 0) away.set(this._retreatSign, 0, 1);
    away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(this._retreatSign * 0.25);
    const target = this.root.position.clone().add(away.add(side).normalize().multiplyScalar(8));
    const clamp = Number.isFinite(ctx.enemyManager?.arenaRadius) ? Math.max(2, ctx.enemyManager.arenaRadius - 2.5) : 38;
    target.x = Math.max(-clamp, Math.min(clamp, target.x));
    target.z = Math.max(-clamp, Math.min(clamp, target.z));
    target.y = this.root.position.y;
    return target;
  }

  _collectAlliesInRadius(ctx, radius, injuredOnly = false) {
    const entries = ctx.nearbyAllies?.(this.root.position, radius, this.root, { verticalRadius: 4 }) || [];
    return entries.filter(entry => {
      const root = entry.root;
      if (!root?.userData || isBossLike(root)) return false;
      if (!injuredOnly) return true;
      const maxHp = root.userData.maxHp ?? root.userData.hp ?? 0;
      return (root.userData.hp ?? 0) < maxHp - 0.001;
    });
  }

  _findHealTarget(ctx) {
    let best = null;
    let bestScore = -Infinity;
    for (const entry of this._collectAlliesInRadius(ctx, this.searchRadius, true)) {
      const root = entry.root;
      const maxHp = root.userData.maxHp ?? root.userData.hp ?? 0;
      const need = Math.max(0, maxHp - (root.userData.hp ?? 0));
      const distance = this.root.position.distanceTo(root.position);
      const score = need * 1.5 - distance;
      if (score > bestScore) {
        bestScore = score;
        best = { root, position: root.position.clone(), need };
      }
    }
    return best;
  }
}
