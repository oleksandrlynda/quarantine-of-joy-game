import { Dynamite } from '../weapons/dynamite.js?v=1.0.3-dynamite-grade2';
import { GravityWell } from '../weapons/gravitywell.js';
import { SatelliteDesignator } from '../weapons/satellite.js';
import { EngagementBaitAbility } from './engagement-bait.js?rev=archive-achievements4';
import { OvertimeAbility } from './overtime.js';
import { SupplyDropAbility } from './supply-drop.js?rev=ammo-rescue2';
import { ABILITY_BY_ID, ABILITY_DEFINITIONS, normalizeAbilityId, resolveAbilityGradeProfile } from './definitions.js?v=1.0.3-dynamite-grade2';

function makePayload(id) {
  if (id === 'dynamite') return new Dynamite();
  if (id === 'gravity_well') return new GravityWell();
  if (id === 'satellite_strike') return new SatelliteDesignator();
  if (id === 'supply_drop') return new SupplyDropAbility();
  if (id === 'overtime') return new OvertimeAbility();
  if (id === 'engagement_bait') return new EngagementBaitAbility();
  return null;
}

export class AbilitySystem {
  constructor({ getContext, getEquippedAbility, getAbilityGrade, activateRush, onStateChange } = {}) {
    this.getContext = getContext || (() => ({}));
    this.getEquippedAbility = getEquippedAbility || (() => null);
    this.getAbilityGrade = getAbilityGrade || (() => 1);
    this.activateRush = activateRush || (() => false);
    this.onStateChange = onStateChange || (() => {});
    this.debugAbility = null;
    this.runtimes = new Map(ABILITY_DEFINITIONS.map(definition => {
      const profile = resolveAbilityGradeProfile(definition, this.getAbilityGrade(definition.id));
      const payload = makePayload(definition.id);
      payload?.configure?.({
        baseDamage: profile.baseDamage,
        blastRadius: profile.blastRadius,
        maxActiveCharges: profile.maxCharges
      });
      return [definition.id, {
        definition,
        grade: profile.grade,
        maxCharges: profile.maxCharges,
        cooldownSeconds: profile.cooldownSeconds,
        charges: profile.maxCharges,
        rechargeRemaining: 0,
        payload,
        attackSequence: 0
      }];
    }));
  }

  getEquippedId() {
    return this.debugAbility || normalizeAbilityId(this.getEquippedAbility?.());
  }

  setDebugAbility(id) {
    const normalized = normalizeAbilityId(id);
    this.debugAbility = ABILITY_BY_ID.has(normalized) ? normalized : null;
    this.onStateChange();
    return this.debugAbility;
  }

  getState(id = this.getEquippedId()) {
    const runtime = this.runtimes.get(normalizeAbilityId(id));
    if (!runtime) return null;
    this._syncRuntimeProfile(runtime);
    const { definition, grade, charges, maxCharges, cooldownSeconds, rechargeRemaining } = runtime;
    return {
      id: definition.id,
      definition,
      grade,
      charges,
      maxCharges,
      cooldownSeconds,
      cooldownRemaining: rechargeRemaining,
      cooldownProgress: rechargeRemaining > 0 ? 1 - rechargeRemaining / cooldownSeconds : 1,
      ready: charges > 0
    };
  }

  activate() {
    return this.activateById(this.getEquippedId());
  }

  activateById(id, { cooldownSeconds = null, context = null } = {}) {
    const runtime = this.runtimes.get(normalizeAbilityId(id));
    if (runtime) this._syncRuntimeProfile(runtime);
    if (!runtime || runtime.charges <= 0) return false;
    const succeeded = runtime.definition.id === 'punchline_rush'
      ? this.activateRush() === true
      : this._activatePayload(runtime, context);
    if (!succeeded) return false;
    runtime.charges -= 1;
    const rechargeSeconds = cooldownSeconds != null && Number.isFinite(Number(cooldownSeconds))
      ? Math.max(0.001, Number(cooldownSeconds))
      : runtime.cooldownSeconds;
    if (runtime.rechargeRemaining <= 0) runtime.rechargeRemaining = rechargeSeconds;
    this.onStateChange();
    return true;
  }

  _activatePayload(runtime, context = null) {
    const ctx = context || this.getContext() || {};
    const payload = runtime.payload;
    if (!payload) return false;
    const activeBefore = this._activePayloadCount(payload);
    runtime.attackSequence += 1;
    ctx.attackId = `Ability:${runtime.definition.id}:${runtime.attackSequence}`;
    ctx.combatSourceName = `Ability:${runtime.definition.id}`;
    const result = payload.onFire(ctx);
    return result === true || this._activePayloadCount(payload) > activeBefore;
  }

  _activePayloadCount(payload) {
    return (payload.charges?.length || 0) + (payload.wells?.length || 0)
      + (payload.pendingStrikes?.length || 0) + (payload.activeBeams?.length || 0)
      + (payload.pendingDrops?.length || 0) + (payload.crates?.length || 0)
      + (payload.baits?.length || 0);
  }

  hasActivePayload(id) {
    const runtime = this.runtimes.get(normalizeAbilityId(id));
    return this._activePayloadCount(runtime?.payload) > 0;
  }

  _syncRuntimeProfile(runtime) {
    const profile = resolveAbilityGradeProfile(runtime.definition, this.getAbilityGrade(runtime.definition.id));
    if (!profile || (runtime.grade === profile.grade && runtime.maxCharges === profile.maxCharges && runtime.cooldownSeconds === profile.cooldownSeconds)) return;
    const chargeDifference = profile.maxCharges - runtime.maxCharges;
    runtime.grade = profile.grade;
    runtime.maxCharges = profile.maxCharges;
    runtime.cooldownSeconds = profile.cooldownSeconds;
    runtime.charges = Math.max(0, Math.min(profile.maxCharges, runtime.charges + Math.max(0, chargeDifference)));
    if (runtime.rechargeRemaining > 0) runtime.rechargeRemaining = Math.min(runtime.rechargeRemaining, profile.cooldownSeconds);
    runtime.payload?.configure?.({
      baseDamage: profile.baseDamage,
      blastRadius: profile.blastRadius,
      maxActiveCharges: profile.maxCharges
    });
  }

  update(dt) {
    const elapsed = Math.max(0, Number(dt) || 0);
    let stateChanged = false;
    for (const runtime of this.runtimes.values()) {
      this._syncRuntimeProfile(runtime);
      runtime.payload?.update?.(elapsed, this.getContext());
      if (runtime.charges >= runtime.maxCharges || runtime.rechargeRemaining <= 0) continue;
      runtime.rechargeRemaining -= elapsed;
      while (runtime.rechargeRemaining <= 0.000001 && runtime.charges < runtime.maxCharges) {
        runtime.charges += 1;
        stateChanged = true;
        runtime.rechargeRemaining = runtime.charges < runtime.maxCharges
          ? runtime.rechargeRemaining + runtime.cooldownSeconds
          : 0;
      }
    }
    if (stateChanged) this.onStateChange();
  }

  hasEmergencyAmmoCrate() {
    return this.runtimes.get('supply_drop')?.payload?.hasEmergencyAmmoCrate?.() === true;
  }

  spawnEmergencyAmmoCrate(position) {
    const payload = this.runtimes.get('supply_drop')?.payload;
    return payload?.spawnEmergencyAmmoCrate?.(position, this.getContext() || {}) === true;
  }

  spawnBossAmmoCrate(position) {
    const payload = this.runtimes.get('supply_drop')?.payload;
    return payload?.spawnBossAmmoCrate?.(position, this.getContext() || {}) === true;
  }

  spawnBossHealthCrate(position) {
    const payload = this.runtimes.get('supply_drop')?.payload;
    return payload?.spawnBossHealthCrate?.(position, this.getContext() || {}) === true;
  }

  clearBossAmmoCrates() {
    const payload = this.runtimes.get('supply_drop')?.payload;
    return payload?.clearBossAmmoCrates?.(this.getContext() || {}) || 0;
  }

  clearBossHealthCrates() {
    const payload = this.runtimes.get('supply_drop')?.payload;
    return payload?.clearBossHealthCrates?.(this.getContext() || {}) || 0;
  }

  clearWorldObjects() {
    const ctx = this.getContext();
    for (const runtime of this.runtimes.values()) runtime.payload?.clearWorld?.(ctx);
  }

  reset() {
    const ctx = this.getContext();
    for (const runtime of this.runtimes.values()) {
      this._syncRuntimeProfile(runtime);
      runtime.payload?.clearWorld?.(ctx);
      runtime.payload?.reset?.();
      runtime.charges = runtime.maxCharges;
      runtime.rechargeRemaining = 0;
      runtime.attackSequence = 0;
    }
    this.debugAbility = null;
    this.onStateChange();
  }
}
