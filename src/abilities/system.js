import { Dynamite } from '../weapons/dynamite.js';
import { GravityWell } from '../weapons/gravitywell.js';
import { SatelliteDesignator } from '../weapons/satellite.js';
import { ABILITY_BY_ID, ABILITY_DEFINITIONS, normalizeAbilityId } from './definitions.js';

function makePayload(id) {
  if (id === 'dynamite') return new Dynamite();
  if (id === 'gravity_well') return new GravityWell();
  if (id === 'satellite_strike') return new SatelliteDesignator();
  return null;
}

export class AbilitySystem {
  constructor({ getContext, getEquippedAbility, activateRush, onStateChange } = {}) {
    this.getContext = getContext || (() => ({}));
    this.getEquippedAbility = getEquippedAbility || (() => null);
    this.activateRush = activateRush || (() => false);
    this.onStateChange = onStateChange || (() => {});
    this.debugAbility = null;
    this.runtimes = new Map(ABILITY_DEFINITIONS.map(definition => [definition.id, {
      definition,
      charges: definition.maxCharges,
      rechargeRemaining: 0,
      payload: makePayload(definition.id),
      attackSequence: 0
    }]));
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
    const { definition, charges, rechargeRemaining } = runtime;
    return {
      id: definition.id,
      definition,
      charges,
      maxCharges: definition.maxCharges,
      cooldownSeconds: definition.cooldownSeconds,
      cooldownRemaining: rechargeRemaining,
      cooldownProgress: rechargeRemaining > 0 ? 1 - rechargeRemaining / definition.cooldownSeconds : 1,
      ready: charges > 0
    };
  }

  activate() {
    const runtime = this.runtimes.get(this.getEquippedId());
    if (!runtime || runtime.charges <= 0) return false;
    const succeeded = runtime.definition.id === 'punchline_rush'
      ? this.activateRush() === true
      : this._activatePayload(runtime);
    if (!succeeded) return false;
    runtime.charges -= 1;
    if (runtime.rechargeRemaining <= 0) runtime.rechargeRemaining = runtime.definition.cooldownSeconds;
    this.onStateChange();
    return true;
  }

  _activatePayload(runtime) {
    const ctx = this.getContext() || {};
    const payload = runtime.payload;
    if (!payload) return false;
    const activeBefore = this._activePayloadCount(payload);
    runtime.attackSequence += 1;
    ctx.attackId = `Ability:${runtime.definition.id}:${runtime.attackSequence}`;
    ctx.combatSourceName = `Ability:${runtime.definition.id}`;
    payload.onFire(ctx);
    return this._activePayloadCount(payload) > activeBefore;
  }

  _activePayloadCount(payload) {
    return (payload.charges?.length || 0) + (payload.wells?.length || 0)
      + (payload.pendingStrikes?.length || 0) + (payload.activeBeams?.length || 0);
  }

  update(dt) {
    const elapsed = Math.max(0, Number(dt) || 0);
    let stateChanged = false;
    for (const runtime of this.runtimes.values()) {
      runtime.payload?.update?.(elapsed, this.getContext());
      if (runtime.charges >= runtime.definition.maxCharges || runtime.rechargeRemaining <= 0) continue;
      runtime.rechargeRemaining -= elapsed;
      while (runtime.rechargeRemaining <= 0.000001 && runtime.charges < runtime.definition.maxCharges) {
        runtime.charges += 1;
        stateChanged = true;
        runtime.rechargeRemaining = runtime.charges < runtime.definition.maxCharges
          ? runtime.rechargeRemaining + runtime.definition.cooldownSeconds
          : 0;
      }
    }
    if (stateChanged) this.onStateChange();
  }

  reset() {
    const ctx = this.getContext();
    for (const runtime of this.runtimes.values()) {
      runtime.payload?.clearWorld?.(ctx);
      runtime.payload?.reset?.();
      runtime.charges = runtime.definition.maxCharges;
      runtime.rechargeRemaining = 0;
      runtime.attackSequence = 0;
    }
    this.debugAbility = null;
    this.onStateChange();
  }
}
