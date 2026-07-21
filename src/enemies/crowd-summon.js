import { clear as clearPath, findPath, nextWaypoint, recomputeIfStale } from '../path.js';
import { resolveBehaviorProfile } from './behavior-profiles.js';

export const CROWD_SUMMON_BALANCE = Object.freeze({
  unreachableSeconds: 15,
  reachableCancelSeconds: 2,
  reachabilitySampleSeconds: 0.75,
  formationSeconds: 0.7,
  channelSeconds: 2.8,
  interruptDamage: 50,
  rallyMinDistance: 10,
  rallyMaxDistance: 18,
  rallyRadius: 1.75,
  rallyArrivalRadius: 0.72,
  rallyTimeoutSeconds: 8,
  interruptedCooldownSeconds: 9,
  completedCooldownSeconds: 18,
  minimumAirSpawnDistance: 14,
  pelicanCap: 2
});

const ELIGIBLE_BEHAVIORS = new Set([
  'grunt',
  'rusher',
  'rusher_elite',
  'rusher_explosive',
  'bailiff',
  'shooter'
]);

const FORMATION_ANGLES = Object.freeze([
  -Math.PI / 2,
  -Math.PI / 2 + Math.PI * 2 / 3,
  -Math.PI / 2 + Math.PI * 4 / 3
]);

export function resolveCrowdSummonRoster(existingPelicans = 0, pelicanCap = CROWD_SUMMON_BALANCE.pelicanCap) {
  const availablePelicanSlots = Math.max(0, Math.min(2, pelicanCap - Math.max(0, existingPelicans | 0)));
  return [
    ...new Array(availablePelicanSlots).fill('pelican'),
    ...new Array(2 - availablePelicanSlots).fill('flyer'),
    'warden'
  ];
}

function horizontalDistance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

function rootBehaviorId(root) {
  return root?.userData?.behaviorId || root?.userData?.type || '';
}

function finiteHp(root) {
  const hp = Number(root?.userData?.hp);
  return Number.isFinite(hp) ? hp : 0;
}

export class CrowdSummonController {
  constructor({ THREE, manager, rng = Math.random, balance = {}, reachabilityProbe = null } = {}) {
    this.THREE = THREE;
    this.manager = manager;
    this.rng = rng;
    this.balance = Object.freeze({ ...CROWD_SUMMON_BALANCE, ...balance });
    this.reachabilityProbe = reachabilityProbe;
    this.active = null;
    this.cooldown = 0;
    this.unreachableTime = 0;
    this.reachableTime = 0;
    this._reachabilitySampleIn = 0;
    this._lastReachable = true;
    this._ritualSequence = 0;
    this._completing = false;
    this.lastStartBlocker = 'waiting_for_unreachable';
  }

  reset() {
    this._cancel('reset', 0);
    this.cooldown = 0;
    this.unreachableTime = 0;
    this.reachableTime = 0;
    this._reachabilitySampleIn = 0;
    this._lastReachable = true;
    this.lastStartBlocker = 'waiting_for_unreachable';
  }

  controls(root) {
    return !!this.active?.participants.some(participant => participant.root === root);
  }

  onEnemyRemoved(root) {
    if (this._completing || !this.controls(root)) return;
    this._cancel('participant_removed', this.balance.interruptedCooldownSeconds, root);
  }

  update(dt, { player = null, bossActive = false } = {}) {
    const delta = Math.max(0, Number(dt) || 0);
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (!player?.position) return;

    this._reachabilitySampleIn -= delta;
    if (this._reachabilitySampleIn <= 0) {
      this._reachabilitySampleIn = this.balance.reachabilitySampleSeconds;
      this._lastReachable = this._isPlayerGroundReachable(player.position);
    }

    if (this.active) {
      if (this._lastReachable) this.reachableTime += delta;
      else this.reachableTime = 0;
      if (this.reachableTime >= this.balance.reachableCancelSeconds) {
        this._cancel('player_reachable', this.balance.interruptedCooldownSeconds);
        return;
      }
      this._updateActive(delta, player.position);
      return;
    }

    this.reachableTime = 0;
    if (bossActive || this.manager?.specialWaveState?.active || this.cooldown > 0) {
      this.unreachableTime = 0;
      return;
    }
    if (this._lastReachable) this.unreachableTime = 0;
    else this.unreachableTime += delta;
    if (this.unreachableTime < this.balance.unreachableSeconds) {
      this.lastStartBlocker = 'waiting_for_unreachable';
      return;
    }
    if (this._tryBegin(player.position)) this.unreachableTime = 0;
  }

  _eligibleRoots({ includeSpent = false } = {}) {
    const roots = [];
    for (const root of this.manager?.enemies || []) {
      if (!root?.position || finiteHp(root) <= 0) continue;
      if (this.manager?._nonWaveEnemies?.has?.(root)) continue;
      const behaviorId = rootBehaviorId(root);
      if (!ELIGIBLE_BEHAVIORS.has(behaviorId)) continue;
      if (!includeSpent && root.userData?.crowdSummonSpent) continue;
      if (root.userData?.commandLocked || root.userData?.movementLocked || root.userData?.bossOwnerRoot) continue;
      roots.push(root);
    }
    return roots;
  }

  _isPlayerGroundReachable(playerPosition) {
    const eligible = this._eligibleRoots({ includeSpent: true });
    if (!eligible.length) return true;
    if (typeof this.reachabilityProbe === 'function') {
      return !!this.reachabilityProbe({ playerPosition, eligible, manager: this.manager });
    }

    const nearest = eligible
      .map(root => ({ root, distance: horizontalDistance(root.position, playerPosition) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    if (nearest.some(({ root }) => playerPosition.y - root.position.y <= 2.5)) return true;

    for (const { root, distance } of nearest) {
      const profile = resolveBehaviorProfile(rootBehaviorId(root));
      const path = findPath(root.position, playerPosition, this.manager?.objectBBs || [], {
        radius: Math.max(20, Math.min(48, distance + 5)),
        agentRadius: profile.collisionRadius
      });
      if (path.length > 1) return true;
    }
    return false;
  }

  _tryBegin(playerPosition) {
    if ((Number(this.manager?.alive) || 0) <= 3) {
      this.lastStartBlocker = 'not_enough_living_enemies';
      return false;
    }
    const eligible = this._eligibleRoots().filter(root => {
      if (rootBehaviorId(root) !== 'shooter') return true;
      return !this.manager?.hasWorldLineOfSight?.(root, playerPosition);
    });
    if (eligible.length < 3) {
      this.lastStartBlocker = 'not_enough_eligible_enemies';
      return false;
    }
    const trio = this._selectCompactTrio(eligible);
    if (!trio) {
      this.lastStartBlocker = 'no_compact_trio';
      return false;
    }
    const rally = this._findRallyPoint(playerPosition, trio);
    if (!rally) {
      this.lastStartBlocker = 'no_safe_visible_rally';
      return false;
    }

    const ritualId = `crowd-summon-${++this._ritualSequence}`;
    const participants = trio.map((root, index) => {
      const instance = this.manager.instanceByRoot?.get?.(root) || null;
      const angle = FORMATION_ANGLES[index];
      const slot = new this.THREE.Vector3(
        rally.x + Math.cos(angle) * this.balance.rallyRadius,
        0,
        rally.z + Math.sin(angle) * this.balance.rallyRadius
      );
      const profile = resolveBehaviorProfile(rootBehaviorId(root));
      slot.y = this.manager._groundHeightAt?.(slot.x, slot.z) + profile.groundOffset;
      const participant = {
        root,
        instance,
        slot,
        arrived: false,
        lastHp: finiteHp(root),
        channelDamage: 0,
        armPose: this._captureArmPose(instance),
        pathReady: false
      };
      root.userData.crowdSummonSpent = true;
      root.userData.crowdSummonParticipant = ritualId;
      this._stopCombatActions(participant);
      clearPath(instance || root);
      recomputeIfStale(instance || root, slot, this.manager.objectBBs || [], {
        cacheFor: this.balance.rallyTimeoutSeconds,
        radius: 30,
        agentRadius: profile.collisionRadius
      }).then(path => {
        if (this.active?.id === ritualId) participant.pathReady = path.length > 0;
      });
      this.manager._setAIState?.(root, 'crowd_summon_rally', { rally });
      this.manager._emitAIEvent?.(root, 'crowd_summon_selected', { ritualId, rally });
      return participant;
    });

    this.active = {
      id: ritualId,
      phase: 'gathering',
      elapsed: 0,
      rally,
      participants,
      visual: this._createVisual(rally)
    };
    this.lastStartBlocker = null;
    return true;
  }

  _selectCompactTrio(roots) {
    let best = null;
    for (let a = 0; a < roots.length - 2; a += 1) {
      for (let b = a + 1; b < roots.length - 1; b += 1) {
        for (let c = b + 1; c < roots.length; c += 1) {
          const trio = [roots[a], roots[b], roots[c]];
          const distances = [
            horizontalDistance(trio[0].position, trio[1].position),
            horizontalDistance(trio[0].position, trio[2].position),
            horizontalDistance(trio[1].position, trio[2].position)
          ];
          const maxDistance = Math.max(...distances);
          if (maxDistance > 10) continue;
          const score = distances.reduce((sum, value) => sum + value, 0);
          if (!best || score < best.score) best = { roots: trio, score };
        }
      }
    }
    return best?.roots || null;
  }

  _findRallyPoint(playerPosition, trio) {
    const candidates = [];
    const offset = this.rng() * Math.PI * 2;
    for (const radius of [12, 15, 18]) {
      for (let index = 0; index < 12; index += 1) {
        const angle = offset + index / 12 * Math.PI * 2;
        candidates.push(new this.THREE.Vector3(
          playerPosition.x + Math.cos(angle) * radius,
          0,
          playerPosition.z + Math.sin(angle) * radius
        ));
      }
    }
    for (const source of [...(this.manager?.spawnRings?.mid || []), ...(this.manager?.spawnRings?.edge || [])]) {
      const point = source.clone ? source.clone() : new this.THREE.Vector3(source.x, source.y || 0, source.z);
      const distance = horizontalDistance(point, playerPosition);
      if (distance >= this.balance.rallyMinDistance && distance <= this.balance.rallyMaxDistance) candidates.push(point);
    }

    const valid = [];
    for (const candidate of candidates) {
      const distance = horizontalDistance(candidate, playerPosition);
      if (distance < this.balance.rallyMinDistance || distance > this.balance.rallyMaxDistance) continue;
      const groundY = this.manager._groundHeightAt?.(candidate.x, candidate.z) || 0;
      candidate.y = groundY + 0.03;
      if (!this._circleFitsWorld(candidate, trio)) continue;
      const sightTarget = candidate.clone();
      sightTarget.y = groundY + 1.1;
      if (this.manager?._isVisibleFromPlayer && !this.manager._isVisibleFromPlayer(sightTarget)) continue;
      const travel = trio.reduce((sum, root) => sum + horizontalDistance(root.position, candidate), 0);
      valid.push({ candidate, score: travel });
    }
    valid.sort((a, b) => a.score - b.score);
    return valid[0]?.candidate.clone() || null;
  }

  _circleFitsWorld(center, trio) {
    const arenaRadius = Number(this.manager?.arenaRadius);
    for (let index = 0; index < FORMATION_ANGLES.length; index += 1) {
      const angle = FORMATION_ANGLES[index];
      const root = trio[index];
      const profile = resolveBehaviorProfile(rootBehaviorId(root));
      const x = center.x + Math.cos(angle) * this.balance.rallyRadius;
      const z = center.z + Math.sin(angle) * this.balance.rallyRadius;
      const groundY = this.manager._groundHeightAt?.(x, z) || 0;
      if (Number.isFinite(arenaRadius) && Math.hypot(x, z) > arenaRadius - 1.5 - profile.collisionRadius) return false;
      const bottom = groundY + 0.05;
      const top = bottom + profile.collisionHeight;
      for (const obstacle of this.manager?.objectBBs || []) {
        if (obstacle.max.y <= bottom || obstacle.min.y >= top) continue;
        if (x + profile.collisionRadius < obstacle.min.x || x - profile.collisionRadius > obstacle.max.x) continue;
        if (z + profile.collisionRadius < obstacle.min.z || z - profile.collisionRadius > obstacle.max.z) continue;
        return false;
      }
    }
    return true;
  }

  _updateActive(dt, playerPosition) {
    const ritual = this.active;
    if (!ritual) return;
    for (const participant of ritual.participants) {
      if (!this.manager.enemies.has(participant.root) || finiteHp(participant.root) <= 0) {
        this._cancel('participant_lost', this.balance.interruptedCooldownSeconds, participant.root);
        return;
      }
    }
    ritual.elapsed += dt;
    this._updateVisual(ritual, dt);

    if (ritual.phase === 'gathering') {
      for (const participant of ritual.participants) this._moveParticipant(participant, dt, ritual.rally);
      if (ritual.participants.every(participant => participant.arrived)) {
        ritual.phase = 'forming';
        ritual.elapsed = 0;
        for (const participant of ritual.participants) {
          participant.root.userData.movementLocked = true;
          clearPath(participant.instance || participant.root);
          this.manager._setAIState?.(participant.root, 'crowd_summon_forming');
        }
      } else if (ritual.elapsed >= this.balance.rallyTimeoutSeconds) {
        this._cancel('rally_timeout', this.balance.interruptedCooldownSeconds);
      }
      return;
    }

    if (ritual.phase === 'forming') {
      const pose = Math.min(1, ritual.elapsed / this.balance.formationSeconds);
      for (const participant of ritual.participants) this._applyRaisedHands(participant, pose);
      if (ritual.elapsed >= this.balance.formationSeconds) {
        ritual.phase = 'channeling';
        ritual.elapsed = 0;
        for (const participant of ritual.participants) {
          participant.lastHp = finiteHp(participant.root);
          participant.channelDamage = 0;
          this.manager._setAIState?.(participant.root, 'crowd_summon_channeling');
          this.manager._emitAIEvent?.(participant.root, 'crowd_summon_channel_started', { ritualId: ritual.id });
        }
      }
      return;
    }

    for (const participant of ritual.participants) {
      this._applyRaisedHands(participant, 1);
      const hp = finiteHp(participant.root);
      participant.channelDamage += Math.max(0, participant.lastHp - hp);
      participant.lastHp = hp;
      if (participant.channelDamage >= this.balance.interruptDamage) {
        this.manager._emitAIEvent?.(participant.root, 'crowd_summon_interrupted', {
          ritualId: ritual.id,
          damage: participant.channelDamage
        });
        this._cancel('damage_interrupt', this.balance.interruptedCooldownSeconds);
        return;
      }
    }
    if (ritual.elapsed >= this.balance.channelSeconds) this._complete(playerPosition);
  }

  _moveParticipant(participant, dt, rally) {
    const root = participant.root;
    const distance = horizontalDistance(root.position, participant.slot);
    if (distance <= this.balance.rallyArrivalRadius) {
      participant.arrived = true;
      root.position.x += (participant.slot.x - root.position.x) * Math.min(1, dt * 8);
      root.position.z += (participant.slot.z - root.position.z) * Math.min(1, dt * 8);
      root.rotation.y = Math.atan2(rally.x - root.position.x, rally.z - root.position.z);
      return;
    }
    participant.arrived = false;
    const waypoint = participant.pathReady ? nextWaypoint(participant.instance || root) : null;
    const target = waypoint || participant.slot;
    const direction = new this.THREE.Vector3(target.x - root.position.x, 0, target.z - root.position.z);
    if (direction.lengthSq() <= 1e-6) return;
    direction.normalize();
    const avoided = this.manager._avoidObstacles?.(root.position, direction, 2.2) || direction;
    const separation = this.manager.separation?.(root.position, 1.5, root);
    if (separation?.lengthSq() > 1e-6) avoided.addScaledVector(separation.normalize(), 0.45);
    const speed = Math.max(3.2, Math.min(6.2, Number(participant.instance?.speed) || 3.2));
    const step = avoided.normalize().multiplyScalar(Math.min(distance, speed * dt));
    this.manager._moveWithCollisions?.(root, step);
    root.rotation.y = Math.atan2(step.x, step.z);
    this.manager._setAIState?.(root, 'crowd_summon_rally', { slot: participant.slot });
  }

  _complete(playerPosition) {
    const ritual = this.active;
    if (!ritual) return;
    const existingPelicans = this.manager._specialWaveRoleCount?.('pelican') || 0;
    const roster = resolveCrowdSummonRoster(existingPelicans, this.balance.pelicanCap);
    const entries = this._findAirEntries(playerPosition, roster, ritual.rally);
    if (entries.length < roster.length) {
      this._cancel('no_safe_air_entry', this.balance.interruptedCooldownSeconds);
      return;
    }

    this._completing = true;
    const sourceRoot = ritual.participants[0]?.root || null;
    for (const participant of ritual.participants) this.manager.remove(participant.root);
    const spawned = [];
    for (let index = 0; index < roster.length; index += 1) {
      let type = roster[index];
      let root = this.manager.spawnAt(type, entries[index], { countsTowardAlive: true });
      if (!root && type === 'pelican') {
        type = 'flyer';
        root = this.manager.spawnAt(type, entries[index], { countsTowardAlive: true });
      }
      if (!root) continue;
      const instance = this.manager.instanceByRoot?.get?.(root);
      root.userData.crowdSummoned = true;
      root.userData.crowdSummonRitualId = ritual.id;
      if (type === 'pelican' && instance) {
        instance.state = 'recharge';
        instance.stateTime = 0;
        instance.rechargeTime = Math.max(instance.rechargeTime || 0, index === 0 ? 1.5 : 2.5);
      } else if (type === 'flyer' && instance) {
        instance.cooldown = Math.max(instance.cooldown || 0, 1.25 + index * 0.35);
      }
      spawned.push(root);
    }
    this.manager._emitAIEvent?.(spawned[0] || sourceRoot, 'crowd_summon_completed', {
      ritualId: ritual.id,
      roster: spawned.map(root => root.userData?.type || 'unknown'),
      rally: ritual.rally
    });
    this._completing = false;
    this._destroyVisual(ritual.visual);
    this.active = null;
    this.reachableTime = 0;
    this.unreachableTime = 0;
    this.cooldown = this.balance.completedCooldownSeconds;
  }

  _findAirEntries(playerPosition, roster, rally) {
    const candidates = [];
    const authored = this.manager?.encounterHooks?.getSpawnCandidates;
    for (const type of [...new Set(roster)]) {
      const authoredCandidates = authored?.({ wave: this.manager.wave, type })
        || (type === 'pelican' ? authored?.({ wave: this.manager.wave, type: 'flyer' }) : null)
        || [];
      for (const item of authoredCandidates) {
        const source = item?.position || item;
        if (source) candidates.push(source.clone ? source.clone() : new this.THREE.Vector3(source.x, source.y || 7, source.z));
      }
    }
    for (const source of [...(this.manager?.spawnRings?.edge || []), ...(this.manager?.spawnRings?.mid || [])]) {
      candidates.push(source.clone ? source.clone() : new this.THREE.Vector3(source.x, source.y || 0, source.z));
    }
    if (!candidates.length) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index / 16 * Math.PI * 2;
        candidates.push(new this.THREE.Vector3(
          playerPosition.x + Math.cos(angle) * 20,
          0,
          playerPosition.z + Math.sin(angle) * 20
        ));
      }
    }

    const forward = this.manager?.getPlayer?.()?.forward || new this.THREE.Vector3(0, 0, 1);
    const scored = candidates
      .filter(candidate => horizontalDistance(candidate, playerPosition) >= this.balance.minimumAirSpawnDistance)
      .map(candidate => {
        const direction = candidate.clone().sub(playerPosition).setY(0);
        const distance = direction.length();
        if (distance > 0) direction.normalize();
        const facing = forward.dot(direction);
        const rallyDistance = horizontalDistance(candidate, rally);
        return { candidate, score: Math.abs(facing + 0.35) + rallyDistance * 0.005 };
      })
      .sort((a, b) => a.score - b.score);

    const chosen = [];
    for (let index = 0; index < roster.length; index += 1) {
      const type = roster[index];
      const altitude = type === 'warden' ? 25.2 : (type === 'pelican' ? 7 : 5.5);
      const choice = scored.find(({ candidate }) => {
        if (chosen.some(existing => horizontalDistance(existing, candidate) < 7)) return false;
        const probe = candidate.clone();
        probe.y = altitude;
        return this.manager.isSpawnPointClear?.(type, probe) !== false;
      });
      if (!choice) break;
      const point = choice.candidate.clone();
      point.y = altitude;
      chosen.push(point);
      scored.splice(scored.indexOf(choice), 1);
    }
    return chosen;
  }

  _stopCombatActions(participant) {
    const instance = participant.instance;
    const root = participant.root;
    root.userData.movementLocked = false;
    if (!instance) return;
    instance._charging = false;
    instance._dashTimer = 0;
    instance._windUpTimer = 0;
    instance._attack = null;
    instance._attackPhase = 'idle';
    instance.inBurst = false;
    instance.windupTime = 0;
    instance._meleePhase = 'idle';
    if (Array.isArray(instance.projectiles)) {
      for (const projectile of instance.projectiles) this.manager.scene?.remove?.(projectile.mesh);
      instance.projectiles.length = 0;
    }
  }

  _captureArmPose(instance) {
    const refs = instance?._animRefs || instance?._refs || {};
    return {
      left: refs.leftArm ? { arm: refs.leftArm, rotation: refs.leftArm.rotation.clone() } : null,
      right: refs.rightArm ? { arm: refs.rightArm, rotation: refs.rightArm.rotation.clone() } : null
    };
  }

  _applyRaisedHands(participant, amount) {
    const pose = participant.armPose;
    if (!pose) return;
    const blend = Math.max(0, Math.min(1, amount));
    for (const [side, record] of [['left', pose.left], ['right', pose.right]]) {
      if (!record?.arm) continue;
      const targetZ = record.rotation.z + (side === 'left' ? -2.45 : 2.45);
      record.arm.rotation.x = record.rotation.x + (-0.2 - record.rotation.x) * blend;
      record.arm.rotation.y = record.rotation.y;
      record.arm.rotation.z = record.rotation.z + (targetZ - record.rotation.z) * blend;
    }
  }

  _restoreParticipant(participant) {
    const root = participant.root;
    if (root?.userData) {
      root.userData.movementLocked = false;
      delete root.userData.crowdSummonParticipant;
    }
    for (const record of [participant.armPose?.left, participant.armPose?.right]) {
      if (record?.arm && record.rotation) record.arm.rotation.copy(record.rotation);
    }
    clearPath(participant.instance || root);
  }

  _cancel(reason, cooldown = this.balance.interruptedCooldownSeconds, removedRoot = null) {
    const ritual = this.active;
    if (!ritual) return;
    for (const participant of ritual.participants) {
      if (participant.root !== removedRoot) this._restoreParticipant(participant);
    }
    this.manager?._emitAIEvent?.(
      ritual.participants.find(participant => participant.root !== removedRoot)?.root || removedRoot,
      'crowd_summon_cancelled',
      { ritualId: ritual.id, reason }
    );
    this._destroyVisual(ritual.visual);
    this.active = null;
    this.reachableTime = 0;
    this.unreachableTime = 0;
    this.cooldown = Math.max(this.cooldown, cooldown);
  }

  _createVisual(rally) {
    if (!this.THREE?.Group || !this.THREE?.RingGeometry || !this.THREE?.MeshBasicMaterial || !this.THREE?.Mesh) return null;
    const group = new this.THREE.Group();
    group.position.copy(rally);
    const material = new this.THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.46,
      side: this.THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new this.THREE.Mesh(new this.THREE.RingGeometry(1.45, 1.72, 36), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
    const slotMaterial = material.clone();
    slotMaterial.opacity = 0.3;
    const slots = FORMATION_ANGLES.map(angle => {
      const slot = new this.THREE.Mesh(new this.THREE.RingGeometry(0.42, 0.56, 20), slotMaterial);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(Math.cos(angle) * this.balance.rallyRadius, 0.055, Math.sin(angle) * this.balance.rallyRadius);
      group.add(slot);
      return slot;
    });
    let beacon = null;
    if (this.THREE.CylinderGeometry) {
      const beaconMaterial = new this.THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.15, depthWrite: false });
      beacon = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.12, 0.35, 5, 12, 1, true), beaconMaterial);
      beacon.position.y = 2.5;
      beacon.visible = false;
      group.add(beacon);
    }
    this.manager?.scene?.add?.(group);
    return { group, ring, slots, beacon, material, slotMaterial };
  }

  _updateVisual(ritual) {
    const visual = ritual.visual;
    if (!visual) return;
    visual.group.rotation.y += ritual.phase === 'channeling' ? 0.018 : 0.006;
    const pulse = 1 + Math.sin((this.manager?._aiClock || 0) * 9) * 0.06;
    visual.ring.scale.setScalar(pulse);
    const channeling = ritual.phase === 'channeling';
    visual.material.color.setHex(channeling ? 0xa855f7 : 0xf59e0b);
    visual.material.opacity = channeling ? 0.7 : 0.46;
    if (visual.beacon) {
      visual.beacon.visible = channeling;
      visual.beacon.material.opacity = 0.12 + Math.sin((this.manager?._aiClock || 0) * 7) * 0.04;
    }
  }

  _destroyVisual(visual) {
    if (!visual) return;
    this.manager?.scene?.remove?.(visual.group);
    visual.ring?.geometry?.dispose?.();
    for (const slot of visual.slots || []) slot.geometry?.dispose?.();
    visual.beacon?.geometry?.dispose?.();
    visual.material?.dispose?.();
    visual.slotMaterial?.dispose?.();
    visual.beacon?.material?.dispose?.();
  }
}
