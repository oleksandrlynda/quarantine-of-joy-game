import { entranceClearanceFor, validateSpawnEntrance } from './contracts.js';
import { BLOCK_BOX_CHANNEL_META, colliderBlocksChannel } from '../debug/block-boxes.js';
import { createBreakerObserverAsset } from '../assets/breaker-observer.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const distance2D = (a, b) => Math.hypot(a.x - b[0], a.z - b[1]);

function createAnalyticColliderRaycast(THREE, shape) {
  const inverse = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const localPoint = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const unitBox = new THREE.Box3(
    new THREE.Vector3(-.5, -.5, -.5),
    new THREE.Vector3(.5, .5, .5)
  );

  const cylinderIntersection = ray => {
    let best = Infinity;
    let normalKind = 'side';
    const { origin, direction } = ray;
    const a = direction.x * direction.x + direction.z * direction.z;
    if (a > 1e-12) {
      const b = 2 * (origin.x * direction.x + origin.z * direction.z);
      const c = origin.x * origin.x + origin.z * origin.z - .25;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
          const y = origin.y + direction.y * t;
          if (t >= 0 && t < best && y >= -.5 && y <= .5) best = t;
        }
      }
    }
    if (Math.abs(direction.y) > 1e-12) {
      for (const capY of [-.5, .5]) {
        const t = (capY - origin.y) / direction.y;
        const x = origin.x + direction.x * t;
        const z = origin.z + direction.z * t;
        if (t >= 0 && t < best && x * x + z * z <= .25) {
          best = t;
          normalKind = capY < 0 ? 'bottom' : 'top';
        }
      }
    }
    if (!Number.isFinite(best)) return null;
    ray.at(best, localPoint);
    if (normalKind === 'top') normal.set(0, 1, 0);
    else if (normalKind === 'bottom') normal.set(0, -1, 0);
    else normal.set(localPoint.x, 0, localPoint.z).normalize();
    return localPoint;
  };

  return function analyticColliderRaycast(raycaster, intersections) {
    inverse.copy(this.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverse);
    const hit = shape === 'cylinder'
      ? cylinderIntersection(localRay)
      : localRay.intersectBox(unitBox, localPoint);
    if (!hit) return;
    if (shape !== 'cylinder') {
      const ax = Math.abs(Math.abs(localPoint.x) - .5);
      const ay = Math.abs(Math.abs(localPoint.y) - .5);
      const az = Math.abs(Math.abs(localPoint.z) - .5);
      if (ax <= ay && ax <= az) normal.set(Math.sign(localPoint.x), 0, 0);
      else if (ay <= az) normal.set(0, Math.sign(localPoint.y), 0);
      else normal.set(0, 0, Math.sign(localPoint.z));
    }
    worldPoint.copy(localPoint).applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(worldPoint);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersections.push({
      distance,
      point: worldPoint.clone(),
      object: this,
      face: { a: 0, b: 0, c: 0, normal: normal.clone(), materialIndex: 0 },
      faceIndex: 0,
      uv: null
    });
  };
}

function circleIntersectsBox(position, radius, collider) {
  const [cx, , cz] = collider.position;
  const [width, , depth] = collider.size;
  const yaw = collider.rotation?.[1] || 0;
  const dx = position[0] - cx;
  const dz = position[2] - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const nearestX = Math.max(-width / 2, Math.min(localX, width / 2));
  const nearestZ = Math.max(-depth / 2, Math.min(localZ, depth / 2));
  return Math.hypot(localX - nearestX, localZ - nearestZ) < radius;
}

function collectObjectiveClearZones(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value.position)
      && value.position.length >= 2
      && value.position.slice(0, 2).every(Number.isFinite)
      && Number.isFinite(value.radius)) {
    result.push(value);
    return result;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectObjectiveClearZones(child, result);
  }
  return result;
}

export function validateLevelSpawnNetwork(definition) {
  return (definition.entrances || []).map(entrance => {
    const errors = validateSpawnEntrance(entrance);
    if (!entrance.air) {
      for (const type of entrance.allow || []) {
        const clearance = entranceClearanceFor(entrance, type);
        if ((definition.colliders || []).some(collider => collider.blocksSpawn !== false && collider.blocksMovement !== false && circleIntersectsBox(entrance.position, clearance, collider))) {
          errors.push(`${type} pad intersects a static collider`);
        }
      }
    }
    return { entrance, errors, valid: errors.length === 0 };
  });
}

function setMaterialLiberated(root, liberated) {
  root?.traverse?.(node => {
    const material = node.material;
    if (!material) return;
    for (const mat of Array.isArray(material) ? material : [material]) {
      if (!mat?.color) continue;
      if (!mat.userData.relayOriginalColor) mat.userData.relayOriginalColor = mat.color.getHex();
      mat.color.setHex(mat.userData.relayOriginalColor);
      if (liberated) mat.color.offsetHSL(0.015, 0.13, 0.1);
      if (mat.emissive) {
        mat.emissive.set(liberated ? 0x91ff42 : 0x061811);
        mat.emissiveIntensity = liberated ? 0.48 : 0.08;
      }
      mat.needsUpdate = true;
    }
  });
}

export function disposeLevelGroupResources(root, {
  sharedGeometries = new Set(),
  sharedMaterials = new Set()
} = {}) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.(object => {
    if (object?.geometry && !sharedGeometries.has(object.geometry)) geometries.add(object.geometry);
    const assigned = Array.isArray(object?.material) ? object.material : [object?.material];
    for (const material of assigned) {
      if (material && !sharedMaterials.has(material)) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  return { geometries: geometries.size, materials: materials.size };
}

export class LevelRuntime {
  constructor({ THREE, scene, objects, grassMesh, weather, clonePrefab, cullGrass, onObjective, onWarning, onRefreshColliders, onTransitionToLegacy, onLastOrderPowerdown, onCheckpoint, onPlayerHazard, onLoadDestructibles, onClearDestructibles, debugColliderChannels = [] }) {
    this.THREE = THREE;
    this.scene = scene;
    this.objects = objects;
    this.grassMesh = grassMesh;
    this.weather = weather;
    this.clonePrefab = clonePrefab;
    this.cullGrass = cullGrass;
    this.onObjective = onObjective;
    this.onWarning = onWarning || (message => console.warn(message));
    this.onRefreshColliders = onRefreshColliders;
    this.onTransitionToLegacy = onTransitionToLegacy;
    this.onLastOrderPowerdown = onLastOrderPowerdown;
    this.onCheckpoint = onCheckpoint;
    this.onPlayerHazard = onPlayerHazard;
    this.onLoadDestructibles = onLoadDestructibles;
    this.onClearDestructibles = onClearDestructibles;
    this.group = null;
    this.definition = null;
    this.enemyManager = null;
    this.validEntrances = [];
    this.colliderObjects = [];
    this.walkableObjects = [];
    this.visualGroups = new Map();
    this.objectiveState = null;
    this.reinforcementState = null;
    this.liberationTime = 0;
    this._transitioned = false;
    this._pulse = 0;
    this.enemyReadabilityMesh = null;
    this.enemyContactShadowMesh = null;
    this.tutorialObjectiveMarker = null;
    this.tutorialObjectiveTarget = null;
    this._tutorialMarkerWorldPosition = new this.THREE.Vector3();
    this.relayMaterials = null;
    this.sanitizerMaterials = null;
    this._relayMaterialVariants = new Map();
    this.forestFogMaterial = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = null;
    this.mirrorMaterials = null;
    this.courtMaterials = null;
    this.cathedralMaterials = null;
    this.expanseMaterials = null;
    this.expanseStormState = null;
    this.floodgateMaterials = null;
    this.floodgateState = null;
    this.floodgateHazardCooldown = 0;
    this.cisternMaterials = null;
    this.lastOrderMaterials = null;
    this.lastOrderCollapse = [];
    this.lastOrderDust = null;
    this.lastOrderStormVeil = null;
    this.lastOrderStormLayers = [];
    this.lastOrderGuardSlots = [];
    this.storyObserver = null;
    this._storyObserverTarget = new this.THREE.Vector3();
    this._storyObserverHandBounds = new this.THREE.Box3();
    this._storyObserverHandCenter = new this.THREE.Vector3();
    this._storyObserverHandSize = new this.THREE.Vector3();
    this._grassVisibilityBeforeLevel = null;
    this._checkpointEmitted = new Set();
    this.currentWave = 0;
    this.movingCoverTime = 0;
    this.adCoverSpeed = .16;
    this.hiddenArenaBoundaries = [];
    this.debugColliderChannels = new Set(debugColliderChannels);
    this._readabilityRingDummy = new this.THREE.Object3D();
    this._colliderGeometries = null;
    this._colliderMaterials = null;
    this._colliderRaycasts = null;
    this._sharedLevelGeometries = new Set();
    this._sharedLevelMaterials = new Set();
    this.lastDisposedResources = { levelId: null, geometries: 0, materials: 0 };
  }

  attach({ enemyManager }) {
    this.enemyManager = enemyManager;
    if (this.definition) enemyManager.setEncounterHooks(this._createEncounterHooks());
  }

  get active() { return !!this.definition; }
  get playerSpawn() { return this.definition?.playerSpawn || null; }

  setTutorialObjectiveMarker({ visible = false, position = null, target = null, color = 'cyan' } = {}) {
    const marker = this.tutorialObjectiveMarker;
    if (!marker) return;
    marker.visible = !!visible;
    this.tutorialObjectiveTarget = visible ? target : null;
    if (Array.isArray(position)) {
      const z = position.length >= 3 ? position[2] : position[1];
      marker.position.set(position[0], .086, z);
    }
    const colors = { cyan: 0x55e1df, lime: 0xc7f34b, amber: 0xffc857, red: 0xff665c };
    marker.material?.color?.setHex(colors[color] || colors.cyan);
  }

  load(definition) {
    if (this.definition) this.unload({ restoreGrass: false });
    this.definition = definition;
    // A completed boss scene leaves its liberation clock running. Every new
    // authored scene starts with an independent objective timeline; otherwise
    // update() returns through the previous scene's liberation branch and
    // capture/hold objectives never activate.
    this.liberationTime = 0;
    this._transitioned = false;
    this.group = new this.THREE.Group();
    this.group.name = `level:${definition.id}`;
    this._applyGrassVisibility();
    this.visualGroups.clear();
    this._relayMaterialVariants.clear();
    this._hideArenaBoundaries();
    this._buildGroundLanguage();
    for (const placement of definition.assets) this._addAsset(placement);
    this._addStoryObserver(definition.storyObserver);
    for (const collider of definition.colliders) this._addCollider(collider, false);
    for (const surface of definition.walkableSurfaces || []) this._addCollider(surface, true);
    this.scene.add(this.group);
    this.onLoadDestructibles?.(definition);

    const validation = validateLevelSpawnNetwork(definition);
    this.validEntrances = validation.filter(item => item.valid).map(item => item.entrance);
    for (const item of validation.filter(item => !item.valid)) {
      this.onWarning(`[${definition.id}] Disabled spawn "${item.entrance?.id || 'unknown'}": ${item.errors.join('; ')}`);
    }
    if (!this.validEntrances.length) this.onWarning(`[${definition.id}] No authored spawn entrances survived validation. Spawns will remain queued.`);

    this._setGroupVisible('infestation', false);
    this._setGroupVisible('bossDressing', false);
    this._setTaggedCollidersActive('bossDressing', false);
    this._setGroupVisible('suppressionDressing', false);
    this._resetObjectiveState();
    this.reinforcementState = null;
    this.expanseStormState = null;
    this.floodgateState = null;
    this.floodgateHazardCooldown = 0;
    this.currentWave = definition.firstWave || 1;
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = Infinity;
    this._applyWaveVisualState(definition.firstWave || 1);
    this._applyGrassMask();
    this.onRefreshColliders?.();
    if (this.enemyManager) this.enemyManager.setEncounterHooks(this._createEncounterHooks());
    return this;
  }

  reset() {
    if (!this.definition) return;
    this.onClearDestructibles?.();
    this.onLoadDestructibles?.(this.definition);
    this._setTaggedCollidersActive('phase-hidden-objective', true);
    this._setGroupVisible('infestation', false);
    this._setGroupVisible('objective', true);
    this._setGroupVisible('bossDressing', false);
    this._setTaggedCollidersActive('bossDressing', false);
    this._setGroupVisible('suppressionDressing', false);
    for (const root of this.visualGroups.get('liberation') || []) setMaterialLiberated(root, false);
    this._setGrassLiberated(false);
    this._applyWaveVisualState(this.definition.firstWave || 1);
    this.liberationTime = 0;
    this._transitioned = false;
    this._resetObjectiveState();
    if (this.definition.id === 'sanitizer-spire') this._updateSanitizerObjectiveLighting();
    if (this.definition.id === 'ad-zone-arena') this._updateAdZoneObjectiveLighting();
    this.reinforcementState = null;
    this.expanseStormState = null;
    this.floodgateState = null;
    this.floodgateHazardCooldown = 0;
    this.currentWave = this.definition.firstWave || 1;
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = Infinity;
    this._applyGrassMask();
    this.enemyManager?.setEncounterHooks(this._createEncounterHooks());
  }

  unload({ restoreGrass = true } = {}) {
    if (!this.definition) return;
    const levelId = this.definition.id;
    this.onClearDestructibles?.();
    this.enemyManager?.setEncounterHooks(null);
    for (const object of [...this.colliderObjects, ...this.walkableObjects]) {
      const index = this.objects.indexOf(object);
      if (index >= 0) this.objects.splice(index, 1);
    }
    this.colliderObjects.length = 0;
    this.walkableObjects.length = 0;
    if (this.group) {
      this.scene.remove(this.group);
      this.lastDisposedResources = {
        levelId,
        ...disposeLevelGroupResources(this.group, {
          sharedGeometries: this._sharedLevelGeometries,
          sharedMaterials: this._sharedLevelMaterials
        })
      };
    }
    this._sharedLevelGeometries.clear();
    this._sharedLevelMaterials.clear();
    this._restoreArenaBoundaries();
    this._restoreGrassVisibility();
    this.group = null;
    this.definition = null;
    this.validEntrances.length = 0;
    this.visualGroups.clear();
    this.enemyReadabilityMesh = null;
    this.enemyContactShadowMesh = null;
    this.tutorialObjectiveMarker = null;
    this.tutorialObjectiveTarget = null;
    this.relayMaterials = null;
    this.sanitizerMaterials = null;
    this._relayMaterialVariants.clear();
    this.forestFogMaterial = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = null;
    this.mirrorMaterials = null;
    this.courtMaterials = null;
    this.cathedralMaterials = null;
    this.expanseMaterials = null;
    this.expanseStormState = null;
    this.floodgateMaterials = null;
    this.floodgateState = null;
    this.floodgateHazardCooldown = 0;
    this.cisternMaterials = null;
    this.lastOrderMaterials = null;
    this.lastOrderCollapse = [];
    this.lastOrderDust = null;
    this.lastOrderStormVeil = null;
    this.lastOrderStormLayers = [];
    this.lastOrderGuardSlots = [];
    this.storyObserver = null;
    this.currentWave = 0;
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = Infinity;
    this.movingCoverTime = 0;
    this.adCoverSpeed = .16;
    this.objectiveState = null;
    this.reinforcementState = null;
    this.liberationTime = 0;
    this._transitioned = false;
    this.onObjective?.({ visible: false });
    this._setGrassLiberated(false);
    if (restoreGrass) this.cullGrass?.(this.grassMesh, this.objects);
    this.onRefreshColliders?.();
  }

  onWaveStart(wave) {
    if (!this.definition || !this.definition.waves[wave]) return;
    this.currentWave = wave;
    this.weather?.setMode?.(this.definition.weatherByWave[wave] || 'clear', { immediate: wave === (this.definition.firstWave || 1) });
    this._applyWaveVisualState(wave);
    this._resetObjectiveState(wave);
    if (this.definition.id === 'sanitizer-spire') this._updateSanitizerObjectiveLighting();
    if (this.definition.id === 'ad-zone-arena') this._updateAdZoneObjectiveLighting();
    this._configureRegularReinforcements(wave);
    if (this.definition.id === 'sandstorm-expanse') this._configureExpanseStorm(wave);
    if (this.definition.id === 'floodgate-continuity') {
      this._configureFloodgateState(wave);
      const checkpointId = this.definition.checkpointStarts?.[wave];
      if (checkpointId && !this._checkpointEmitted.has(wave)) {
        this._checkpointEmitted.add(wave);
        this.onCheckpoint?.({ levelId: this.definition.id, checkpointId, wave, completedWave: wave - 1 });
      }
    }
    if (wave === (this.definition.bossWave || 5)) {
      this._setGroupVisible('infestation', true);
      this._setGroupVisible('objective', false);
    }
    this._setTaggedCollidersActive('phase-hidden-objective', wave !== (this.definition.bossWave || 5));
    this._setGroupVisible('bossDressing', wave === (this.definition.bossWave || 5));
    this._setTaggedCollidersActive('bossDressing', wave === (this.definition.bossWave || 5));
    if (this.definition.id === 'mirror-garden') {
      this._setGroupVisible('generationDressing', wave >= 27);
      this._setGroupVisible('mirrorBarrier', wave < 30);
    }
    if (this.definition.id === 'sanitizer-spire') {
      this._setGroupVisible('suppressionDressing', wave >= 8);
    }
    this._emitObjective();
  }

  onSpecialWaveEvent(event = {}) {
    if (this.definition?.id !== 'blackout-cistern' || event.encounter !== 'last_light') return;
    const totalSurges = event.totalSurges || 4;
    if (event.type === 'start' || event.type === 'surge') {
      this.objectiveState = {
        kind: 'surge',
        titleKey: 'level.cistern.wave72',
        detailKey: 'level.cistern.surgeDetail',
        surge: event.surge || 1,
        totalSurges,
        progress: (event.surge || 1) / totalSurges,
        contested: false
      };
    } else if (event.type === 'surge-warning') {
      this.objectiveState = {
        ...(this.objectiveState || {}),
        kind: 'surge',
        titleKey: 'level.cistern.wave72',
        detailKey: 'level.cistern.warningDetail',
        surge: event.surge || 1,
        totalSurges,
        progress: Math.max(0, ((event.surge || 1) - 1) / totalSurges),
        contested: true
      };
    } else if (event.type === 'complete') {
      this.objectiveState = {
        kind: 'liberation',
        titleKey: 'level.cistern.completeTitle',
        detailKey: 'level.cistern.completeDetail',
        progress: 1,
        contested: false,
        complete: true
      };
    } else if (event.type === 'cancel') {
      this.objectiveState = null;
    }
    this._emitObjective();
  }

  onBossDefeated(wave) {
    if (!this.definition || wave !== (this.definition.bossWave || 5) || this.liberationTime > 0) return;
    this.liberationTime = 0.0001;
    const liberatedWeather = this.definition.id === 'trend-wastes'
      ? 'wastes-liberated-sand-wind'
      : this.definition.id === 'mirror-garden'
        ? 'mirror-liberated-fog'
        : this.definition.id === 'content-court'
          ? 'court-liberated-fog'
        : this.definition.id === 'server-cathedral'
          ? 'cathedral-liberated-fog'
        : 'clear';
    this.weather?.setMode?.(liberatedWeather);
    this._setGroupVisible('infestation', false);
    this._setGroupVisible('objective', true);
    this._setGroupVisible('bossDressing', false);
    this._setTaggedCollidersActive('bossDressing', false);
    this._setGroupVisible('suppressionDressing', false);
    this._setTaggedCollidersActive('phase-hidden-objective', true);
    // Mirror thresholds retract for Hydraclone and stay open after liberation.
    // The generic objective restore above is correct for campaign terminals,
    // but would otherwise leave four invisible walls across the garden spokes.
    if (this.definition.id === 'mirror-garden') {
      this._setTaggedCollidersActive('phase-hidden-objective', false);
    }
    for (const root of this.visualGroups.get('liberation') || []) setMaterialLiberated(root, true);
    this._setGrassLiberated(true);
    this._applyWaveVisualState(0, true);
    this.objectiveState = {
      kind: 'liberation',
      titleKey: this.definition.liberationTitleKey || 'level.relay.liberating',
      detailKey: this.definition.liberationDetailKey || 'level.relay.signalRestored',
      progress: 0,
      contested: false
    };
    this._emitObjective();
  }

  update(dt, playerObject) {
    if (!this.definition) return;
    this._pulse += dt;
    if (this.definition.id === 'ad-zone-arena') this._updateAdZoneMotion(dt);
    if (this.definition.id === 'mirror-garden') this._updateMirrorGardenMotion(dt);
    if (this.definition.id === 'content-court') this._updateContentCourtMotion(dt);
    if (this.definition.id === 'server-cathedral') this._updateServerCathedralMotion(dt, playerObject);
    if (this.definition.id === 'sandstorm-expanse') this._updateExpanseStorm(dt);
    if (this.definition.id === 'floodgate-continuity') this._updateFloodgate(dt, playerObject);
    if (this.tutorialObjectiveMarker?.visible) {
      if (this.tutorialObjectiveTarget?.getWorldPosition) {
        this.tutorialObjectiveTarget.getWorldPosition(this._tutorialMarkerWorldPosition);
        this.tutorialObjectiveMarker.position.x = this._tutorialMarkerWorldPosition.x;
        this.tutorialObjectiveMarker.position.z = this._tutorialMarkerWorldPosition.z;
      }
      const markerPulse = 1 + Math.sin(this._pulse * 4.5) * .09;
      this.tutorialObjectiveMarker.scale.setScalar(markerPulse);
      this.tutorialObjectiveMarker.rotation.z += dt * .42;
    }
    const beacon = this.group?.getObjectByName?.('relay-objective-ring');
    if (beacon) {
      const pulse = 1 + Math.sin(this._pulse * 3.2) * 0.035;
      beacon.scale.setScalar(pulse);
      beacon.rotation.z += dt * 0.18;
    }
    const crown = this.group?.getObjectByName?.('relay-signal-crown');
    if (crown) {
      crown.rotation.y += dt * (this.liberationTime > 0 ? .72 : .28);
      const signalPulse = 1 + Math.sin(this._pulse * (this.liberationTime > 0 ? 5.2 : 2.4)) * .055;
      crown.scale.setScalar(signalPulse);
    }
    const mastKey = this.group?.getObjectByName?.('relay-mast-key');
    if (mastKey?.userData?.baseIntensity) {
      const lightPulse = 1 + Math.sin(this._pulse * (this.liberationTime > 0 ? 4.8 : 2.1)) * .035;
      mastKey.intensity = mastKey.userData.baseIntensity * lightPulse;
    }
    const spireHeroKey = this.group?.getObjectByName?.('spire-hero-key');
    if (spireHeroKey?.userData?.baseIntensity) {
      const lightPulse = 1 + Math.sin(this._pulse * (this.liberationTime > 0 ? 3.8 : 1.7)) * .025;
      spireHeroKey.intensity = spireHeroKey.userData.baseIntensity * lightPulse;
    }
    const wastesStormKey = this.group?.getObjectByName?.('wastes-storm-eye-key');
    if (wastesStormKey?.userData?.baseIntensity) {
      const lightPulse = 1 + Math.sin(this._pulse * (this.liberationTime > 0 ? 3.4 : 2.25)) * .035;
      wastesStormKey.intensity = wastesStormKey.userData.baseIntensity * lightPulse;
    }
    if (this.definition.id === 'freight-annex') {
      const freightKeys = [
        ['freight-loading-key', 1.7, .025],
        ['freight-west-service-key', 1.35, .035],
        ['freight-east-service-key', 1.5, .035],
        ['freight-floor-hatch-key', 4.8, .09],
        ['freight-rear-vent-key', 5.2, .1],
        ['freight-infection-key', 3.2, .12],
        ['freight-nest-key', 2.8, .1],
        ['freight-breach-key', 3.7, .09]
      ];
      freightKeys.forEach(([name, speed, amount], index) => {
        const key = this.group?.getObjectByName?.(name);
        if (!key || !Number.isFinite(key.userData?.baseIntensity)) return;
        key.intensity = key.userData.baseIntensity
          * (1 + Math.sin(this._pulse * speed + index * .73) * amount);
      });
    }
    const wastesStormSignal = this.group?.getObjectByName?.('wastes-storm-eye-signal');
    if (wastesStormSignal?.material?.uniforms?.uOpacity && Number.isFinite(wastesStormSignal.userData.baseOpacity)) {
      const signalPulse = 1 + Math.sin(this._pulse * 2.6) * .075;
      wastesStormSignal.material.uniforms.uOpacity.value = wastesStormSignal.userData.baseOpacity * signalPulse;
    }
    const surge = this.group?.getObjectByName?.('relay-signal-surge');
    if (surge?.visible) {
      surge.rotation.y -= dt * .38;
      const surgePulse = 1 + Math.sin(this._pulse * 4.6) * .045;
      surge.scale.setScalar(surgePulse);
    }
    const alarm = this.group?.getObjectByName?.('relay-alarm-beacons');
    if (alarm?.visible && alarm.material) {
      alarm.material.emissiveIntensity = 1.45 + Math.max(0, Math.sin(this._pulse * 7.2)) * 1.35;
    }
    this._updateEnemyReadability();
    if (this.definition.id === 'sanitizer-spire') this._updateSanitizerObjectiveLighting();
    if (this.definition.id === 'ad-zone-arena') this._updateAdZoneObjectiveLighting();
    this._updateRegularReinforcements();
    if (this.liberationTime > 0) {
      this.liberationTime += dt;
      if (this.objectiveState) this.objectiveState.progress = clamp01(this.liberationTime / 4);
      this._emitObjective();
      if (this.liberationTime >= 4 && !this._transitioned) {
        if (this.definition.id === 'server-cathedral') {
          this._beginEndingChoice();
          return;
        }
        this._transitioned = true;
        const result = this.definition.id === 'sandstorm-expanse'
          ? { enduranceComplete: true }
          : this.definition.id === 'floodgate-continuity'
            ? { greywaterComplete: true }
            : undefined;
        this.onTransitionToLegacy?.(result);
      }
      return;
    }
    if (!playerObject?.position || !this.objectiveState) return;
    if (this.objectiveState.kind === 'feeds') this._updateFeeds(dt, playerObject.position);
    if (this.objectiveState.kind === 'multi-capture') this._updateMultiCapture(dt, playerObject.position);
    if (this.objectiveState.kind === 'mast') this._updateMast(dt, playerObject.position);
    if (this.objectiveState.kind === 'hold') this._updateMast(dt, playerObject.position);
    if (this.objectiveState.kind === 'sponsor') this._updateSponsor(dt, playerObject.position);
    if (this.objectiveState.kind === 'ending-choice') this._updateEndingChoice(dt, playerObject.position);
    if (this.objectiveState.kind === 'escape') this._updateEscape(dt, playerObject.position);
    if (this.definition.id === 'last-order-base') this._updateLastOrder(dt, playerObject.position);
  }

  _beginEndingChoice() {
    const choices = this.definition?.objectives?.endingChoices;
    if (!choices) {
      this._transitioned = true;
      this.onTransitionToLegacy?.();
      return;
    }
    this.liberationTime = 0;
    this.objectiveState = {
      kind: 'ending-choice',
      titleKey: 'level.cathedral.chooseEnding',
      detailKey: 'level.cathedral.chooseEndingDetail',
      progress: 0,
      contested: false,
      complete: false,
      activeChoice: null,
      choices: Object.values(choices).map(choice => ({ ...choice, elapsed: 0 }))
    };
    this._emitObjective();
  }

  _updateEndingChoice(dt, playerPosition) {
    const state = this.objectiveState;
    if (state.complete) return;
    const active = state.choices
      .filter(choice => distance2D(playerPosition, choice.position) <= choice.radius)
      .sort((a, b) => distance2D(playerPosition, a.position) - distance2D(playerPosition, b.position))[0] || null;
    state.activeChoice = active?.id || null;
    state.detailKey = active
      ? `level.cathedral.${active.id}Choice`
      : 'level.cathedral.chooseEndingDetail';
    for (const choice of state.choices) {
      choice.elapsed = choice === active ? Math.min(choice.seconds, choice.elapsed + dt) : 0;
    }
    state.progress = active ? active.elapsed / active.seconds : 0;
    if (active && active.elapsed >= active.seconds) {
      state.complete = true;
      state.selected = active.id;
      state.detailKey = `level.cathedral.${active.id}Confirmed`;
      state.progress = 1;
      this._transitioned = true;
    }
    this._emitObjective();
    if (state.complete) this.onTransitionToLegacy?.({ endingChoice: state.selected });
  }

  _updateFeeds(dt, playerPosition) {
    const state = this.objectiveState;
    const incomplete = state.targets.filter(target => !target.complete);
    let active = incomplete
      .filter(target => distance2D(playerPosition, target.position) <= target.radius)
      .sort((a, b) => distance2D(playerPosition, a.position) - distance2D(playerPosition, b.position))[0];
    state.contested = false;
    if (active) {
      state.contested = this._isContested(active.position, active.radius);
      if (!state.started) {
        state.started = true;
        this.enemyManager?.queueAuthoredEnemies(this.definition.waves[this.objectiveState.wave].packages[1]);
      }
      if (!state.contested) active.progress = Math.min(active.seconds, active.progress + dt);
      if (active.progress >= active.seconds && !active.complete) {
        active.complete = true;
        if (!state.reinforced) {
          state.reinforced = true;
          this.enemyManager?.queueAuthoredEnemies(this.definition.waves[this.objectiveState.wave].packages[2]);
        }
      }
    }
    state.complete = state.targets.every(target => target.complete);
    state.progress = state.targets.reduce((sum, target) => sum + target.progress / target.seconds, 0) / state.targets.length;
    state.remainingTargets = state.targets.filter(target => !target.complete).length;
    if (this.definition.id === 'sanitizer-spire') this._updateSanitizerObjectiveLighting();
    this._emitObjective();
    if (state.complete && !state.advanceRequested) {
      state.advanceRequested = true;
      this.enemyManager?.tryAdvanceWave();
    }
  }

  _updateMultiCapture(dt, playerPosition) {
    const state = this.objectiveState;
    const incomplete = state.targets.filter(target => !target.complete);
    const active = incomplete
      .filter(target => distance2D(playerPosition, target.position) <= target.radius)
      .sort((a, b) => distance2D(playerPosition, a.position) - distance2D(playerPosition, b.position))[0];
    state.contested = false;
    state.activeTargetKey = null;
    state.activeSecondsRemaining = null;
    if (active) {
      state.activeTargetKey = active.nameKey;
      state.contested = this._isContested(active.position, active.radius);
      if (!state.contested) active.progress = Math.min(active.seconds, active.progress + dt);
      state.activeSecondsRemaining = Math.ceil(Math.max(0, active.seconds - active.progress));
      if (active.progress >= active.seconds && !active.complete) {
        active.complete = true;
        const completedCount = state.targets.filter(target => target.complete).length;
        const packages = this.definition.waves[state.wave].packages;
        const releaseCount = Math.min(completedCount, Math.max(0, packages.length - 1));
        while (state.releasedPackages < releaseCount) {
          state.releasedPackages++;
          this.enemyManager?.queueAuthoredEnemies(packages[state.releasedPackages]);
        }
      }
    }
    state.complete = state.targets.every(target => target.complete);
    state.progress = state.targets.reduce((sum, target) => sum + target.progress / target.seconds, 0) / state.targets.length;
    state.remainingTargets = state.targets.filter(target => !target.complete).length;
    if (this.definition.id === 'sanitizer-spire') this._updateSanitizerObjectiveLighting();
    this._emitObjective();
    if (state.complete && !state.advanceRequested) {
      state.advanceRequested = true;
      this.enemyManager?.tryAdvanceWave();
    }
  }

  _configureRegularReinforcements(wave) {
    const waveDef = this.definition?.waves?.[wave];
    if (!waveDef || waveDef.objective || waveDef.boss || waveDef.packages.length < 2) {
      this.reinforcementState = null;
      return;
    }
    const clearFraction = Math.max(.25, Math.min(.85, Number(waveDef.reinforcementClearFraction) || .55));
    this.reinforcementState = {
      wave,
      nextPackage: 1,
      clearFraction,
      releaseAtAlive: Math.floor(waveDef.packages[0].length * (1 - clearFraction))
    };
  }

  _updateRegularReinforcements() {
    const state = this.reinforcementState;
    const manager = this.enemyManager;
    const waveDef = this.definition?.waves?.[state?.wave];
    if (!state || !manager || manager.wave !== state.wave || !waveDef) return;
    if (state.nextPackage >= waveDef.packages.length || manager.alive > state.releaseAtAlive) return;
    const pkg = waveDef.packages[state.nextPackage++];
    manager.queueAuthoredEnemies(pkg);
    state.releaseAtAlive = Math.floor(manager.alive * (1 - state.clearFraction));
  }

  _updateMast(dt, playerPosition) {
    const state = this.objectiveState;
    const inside = distance2D(playerPosition, state.position) <= state.radius;
    state.contested = inside && this._isContested(state.position, state.radius);
    if (inside && !state.contested) state.elapsed = Math.min(state.seconds, state.elapsed + dt);
    state.progress = state.elapsed / state.seconds;
    if (!state.milestones[0] && state.progress >= 1 / 3) {
      state.milestones[0] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[this.objectiveState.wave].packages[1]);
    }
    if (!state.milestones[1] && state.progress >= 2 / 3) {
      state.milestones[1] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[this.objectiveState.wave].packages[2]);
    }
    state.complete = state.elapsed >= state.seconds;
    this._emitObjective();
    if (state.complete) this.enemyManager?.tryAdvanceWave();
  }

  _updateSponsor(dt, playerPosition) {
    const state = this.objectiveState;
    const inside = distance2D(playerPosition, state.position) <= state.radius;
    state.contested = inside && this._isContested(state.position, state.radius);
    if (inside && !state.contested) state.elapsed = Math.min(state.seconds, state.elapsed + dt);
    state.progress = state.elapsed / state.seconds;
    if (!state.milestones[0] && state.progress >= 1 / 3) {
      state.milestones[0] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[state.wave].packages[1]);
    }
    if (!state.milestones[1] && state.progress >= 2 / 3) {
      state.milestones[1] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[state.wave].packages[2]);
    }
    state.complete = state.elapsed >= state.seconds;
    this._updateAdZoneObjectiveLighting();
    this._emitObjective();
    if (state.complete) this.enemyManager?.tryAdvanceWave();
  }

  _isContested(position, radius) {
    for (const root of this.enemyManager?.enemies || []) {
      if (root?.userData?.type?.startsWith?.('boss_')) continue;
      if (distance2D(root.position, position) <= radius) return true;
    }
    return false;
  }

  _updateEscape(dt, playerPosition) {
    const state = this.objectiveState;
    if (!state || state.complete) return;
    if (state.phase === 'chase') {
      const startZ = this.definition?.playerSpawn?.[2] ?? 33;
      const targetZ = state.position?.[1] ?? -45.5;
      state.progress = clamp01((startZ - playerPosition.z) / Math.max(1, startZ - targetZ));
      // Start the weather blend before the particle wall itself so visibility
      // collapses over a short approach instead of on the objective frame.
      const stormFrontZ = targetZ + 14.5;
      if (!state.stormEntered && playerPosition.z <= stormFrontZ) {
        state.stormEntered = true;
        this.weather?.setMode?.('last-order-heavy-sand-fog-wind', { immediate: true });
      }
      if (distance2D(playerPosition, state.position) <= state.radius) {
        state.phase = 'powerdown';
        state.detailKey = 'level.lastOrder.powerdownDetail';
        state.elapsed = 0;
        state.progress = 0;
        this.onLastOrderPowerdown?.();
        // Preserve the zero-visibility gust through the shutdown beat. Wave
        // 42 then opens in the same sand language at its authored intensity.
        this.weather?.setMode?.('last-order-heavy-sand-fog-wind', { immediate: true });
        this.enemyManager?.clearProjectiles?.();
        this.lastOrderCollapse = [];
        let index = 0;
        for (const root of this.enemyManager?.enemies || []) {
          if (!root?.userData) continue;
          root.userData.stunnedUntil = Infinity;
          root.userData.commandLocked = false;
          this.lastOrderCollapse.push({
            root,
            delay: index++ * .11,
            startY: root.position.y,
            startZRotation: root.rotation.z
          });
        }
      }
    } else if (state.phase === 'powerdown') {
      state.elapsed = Math.min(state.powerdownSeconds, state.elapsed + dt);
      state.progress = clamp01(state.elapsed / state.powerdownSeconds);
      if (state.elapsed >= state.powerdownSeconds) {
        state.complete = true;
        state.detailKey = 'level.lastOrder.silentDetail';
        state.progress = 1;
        if (!this._transitioned) {
          this._transitioned = true;
          this.onTransitionToLegacy?.({ lastOrderComplete: true });
        }
      }
    }
    this._emitObjective();
  }

  _updateLastOrder(dt, playerPosition = null) {
    if (this.definition?.id !== 'last-order-base') return;
    const state = this.objectiveState;
    const powerdown = state?.phase === 'powerdown';
    this._updateLastOrderGuards(playerPosition, powerdown);
    const dustPositions = this.lastOrderDust?.geometry?.getAttribute?.('position');
    const dustVelocities = this.lastOrderDust?.userData?.velocities;
    const dustNearZ = this.lastOrderDust?.userData?.nearZ ?? -26;
    const dustFarZ = this.lastOrderDust?.userData?.farZ ?? -49.5;
    if (dustPositions && dustVelocities) {
      for (let index = 0; index < dustPositions.count; index += 1) {
        const wind = powerdown ? 1.45 : 1;
        let x = dustPositions.getX(index) + dustVelocities[index * 3] * wind * dt;
        let y = dustPositions.getY(index) + dustVelocities[index * 3 + 1] * dt;
        let z = dustPositions.getZ(index) + dustVelocities[index * 3 + 2] * wind * dt;
        if (x > 8.35) x = -8.35;
        if (y > 4.02) y = .12;
        if (z > dustNearZ) z = dustFarZ;
        dustPositions.setXYZ(index, x, y, z);
      }
      dustPositions.needsUpdate = true;
    }
    const stormUniforms = this.lastOrderStormVeil?.material?.uniforms;
    if (stormUniforms?.uTime) stormUniforms.uTime.value += dt * (powerdown ? 1.55 : .7);
    for (const layer of this.lastOrderStormLayers) {
      if (layer?.material?.uniforms?.uTime) {
        layer.material.uniforms.uTime.value += dt * (powerdown ? 1.7 : 1);
      }
    }
    for (let index = 1; index <= 6; index += 1) {
      const light = this.group?.getObjectByName?.(`last-order-light-${index}`);
      if (!light?.material) continue;
      const failing = powerdown && index > Math.ceil((1 - state.progress) * 6);
      light.material.emissiveIntensity = failing ? 0 : 1.4 + Math.max(0, Math.sin(this._pulse * 7 + index)) * .9;
    }
    if (!powerdown) return;
    for (const collapse of this.lastOrderCollapse) {
      if (!collapse.root?.parent) continue;
      const progress = clamp01((state.elapsed - collapse.delay) / .8);
      const eased = progress * progress * (3 - 2 * progress);
      collapse.root.rotation.z = collapse.startZRotation + eased * (collapse.root.position.x < 0 ? 1.18 : -1.18);
      collapse.root.position.y = collapse.startY - eased * .55;
    }
  }

  _updateLastOrderGuards(playerPosition, powerdown) {
    if (!playerPosition || !this.lastOrderGuardSlots.length || !this.enemyManager) return;
    const config = this.definition?.guardRows;
    if (!config) return;
    for (const slot of this.lastOrderGuardSlots) {
      const guardZ = slot.position[2];
      const approachDistance = playerPosition.z - guardZ;
      if (!slot.root && !powerdown
          && approachDistance >= 0 && approachDistance <= config.spawnAhead) {
        const [spawnX, authoredY, spawnZ] = slot.position;
        const groundY = this.enemyManager._groundHeightAt?.(spawnX, spawnZ);
        const spawnY = Number.isFinite(groundY) ? groundY + .8 : authoredY;
        const root = this.enemyManager.spawnAt?.(
          'grunt',
          new this.THREE.Vector3(spawnX, spawnY, spawnZ),
          { countsTowardAlive: false }
        );
        if (root?.userData) {
          root.rotation.y = slot.facingYaw;
          root.userData.lastOrderGuard = true;
          root.userData.lastOrderGuardSide = slot.side;
          root.userData.lastOrderGuardSpawnY = spawnY;
          root.userData.movementLocked = true;
          const instance = this.enemyManager.instanceByRoot?.get?.(root);
          if (instance) {
            instance.speed = Math.max(instance.speed || 0, 3.45);
            instance.role = 'pursuer';
          }
          slot.root = root;
        }
      }
      if (!slot.root?.userData) continue;
      slot.root.userData.movementLocked = powerdown
        || approachDistance > config.activationAhead
        || approachDistance < -config.lockBehind;
    }
  }

  _resetObjectiveState(wave = 0) {
    const def = this.definition;
    if (!def) return;
    const waveDef = def.waves[wave];
    if (!waveDef) {
      this.objectiveState = null;
      if (def.id === 'last-order-base') this.lastOrderGuardSlots = [];
      return;
    }
    if (waveDef.objective === 'feeds') {
      this.objectiveState = {
        kind: 'feeds', wave, titleKey: waveDef.titleKey, progress: 0, contested: false,
        started: false, reinforced: false, complete: false, remainingTargets: 2, advanceRequested: false,
        targets: [def.objectives.westFeed, def.objectives.eastFeed].map(target => ({ ...target, progress: 0, complete: false }))
      };
    } else if (waveDef.objective === 'multi-capture') {
      const objectiveTargets = def.objectives[waveDef.objectiveTargets] || [];
      this.objectiveState = {
        kind: 'multi-capture', wave, titleKey: waveDef.titleKey, progress: 0, contested: false,
        complete: false, remainingTargets: objectiveTargets.length, releasedPackages: 0, advanceRequested: false,
        activeTargetKey: null, activeSecondsRemaining: null,
        targets: objectiveTargets.map(target => ({ ...target, progress: 0, complete: false }))
      };
    } else if (waveDef.objective === 'mast') {
      this.objectiveState = {
        kind: 'mast', wave, titleKey: waveDef.titleKey, position: def.objectives.mast.position,
        radius: def.objectives.mast.radius, seconds: def.objectives.mast.seconds,
        elapsed: 0, progress: 0, contested: false, complete: false, milestones: [false, false]
      };
    } else if (waveDef.objective === 'hold') {
      const target = def.objectives[waveDef.objectiveTarget];
      this.objectiveState = {
        kind: 'hold', wave, titleKey: waveDef.titleKey,
        detailKey: def.id === 'floodgate-continuity' ? 'level.floodgate.holdOverrideDetail' : 'level.expanse.holdSupplyDetail',
        position: target.position, radius: target.radius, seconds: target.seconds,
        elapsed: 0, progress: 0, contested: false, complete: false, milestones: [false, false]
      };
    } else if (waveDef.objective === 'sponsor') {
      this.objectiveState = {
        kind: 'sponsor', wave, titleKey: waveDef.titleKey, position: def.objectives.sponsor.position,
        radius: def.objectives.sponsor.radius, seconds: def.objectives.sponsor.seconds,
        elapsed: 0, progress: 0, contested: false, complete: false, milestones: [false, false]
      };
    } else if (waveDef.objective === 'escape') {
      const target = def.objectives[waveDef.objectiveTarget];
      this.lastOrderGuardSlots = (def.guardRows?.positions || []).map(slot => ({
        ...slot,
        position: [...slot.position],
        root: null
      }));
      this.objectiveState = {
        kind: 'escape', wave, titleKey: waveDef.titleKey,
        detailKey: 'level.lastOrder.escapeDetail', position: target.position,
        radius: target.radius, powerdownSeconds: target.powerdownSeconds,
        phase: 'chase', elapsed: 0, progress: 0, contested: false, complete: false,
        stormEntered: false
      };
    } else {
      const boss = wave === (def.bossWave || 5);
      this.objectiveState = { kind: boss ? 'boss' : 'eliminate', titleKey: waveDef.titleKey, detailKey: boss ? def.bossObjectiveKey : null, progress: 0, contested: false };
    }
  }

  _emitObjective() {
    const state = this.objectiveState;
    if (!state) return this.onObjective?.({ visible: false });
    this.onObjective?.({ visible: true, levelNameKey: this.definition?.nameKey, ...state });
  }

  _createEncounterHooks() {
    return {
      authoredOnly: true,
      getArenaRadius: () => {
        const [width, depth] = this.definition?.size || [];
        return Number.isFinite(width) && Number.isFinite(depth)
          ? Math.min(width, depth) / 2
          : null;
      },
      getWaveDefinition: wave => this.definition?.waves?.[wave] || null,
      getSpawnCandidates: ({ wave, type }) => this._spawnCandidates(wave, type),
      configureSpawnedEnemy: ({ root, instance, type, wave }) => {
        if (this.definition?.id !== 'last-order-base' || wave !== 41 || !root?.userData) return;
        root.userData.commandLocked = true;
        root.userData.hp = Infinity;
        root.userData.maxHp = Infinity;
        if (instance && type === 'rusher_elite') {
          instance.speed = Math.max(instance.speed || 0, 9.15);
          instance._spawnDelay = 0;
          instance._dashCooldown = 0;
        } else if (instance && type === 'bailiff') {
          instance.speed = Math.max(instance.speed || 0, 6.25);
          instance._dashCooldown = 0;
        }
      },
      getBossSpawn: wave => wave === (this.definition?.bossWave || 5) && this.definition ? new this.THREE.Vector3(...this.definition.bossAnchor) : null,
      getBossArenaBounds: wave => wave === (this.definition?.bossWave || 5) ? this.definition?.bossArenaBounds || null : null,
      getBossAddPositions: ({ count, type }) => this._bossAddPositions(count, type),
      canCompleteWave: wave => {
        if (this.definition?.waves?.[wave]?.specialEncounter) return true;
        if (this.reinforcementState?.wave === wave) {
          const packageCount = this.definition?.waves?.[wave]?.packages?.length || 0;
          if (this.reinforcementState.nextPackage < packageCount) return false;
        }
        if (wave === this.definition?.finalWave) {
          const waveObjective = this.definition?.waves?.[wave]?.objective;
          if (waveObjective && !this.objectiveState?.complete) return false;
          if (!this._transitioned && this.liberationTime <= 0) this._beginEnduranceCompletion();
          return false;
        }
        const waveObjective = this.definition?.waves?.[wave]?.objective;
        if (waveObjective) return !!this.objectiveState?.complete;
        if (wave === (this.definition?.bossWave || 5)) return this._transitioned;
        return true;
      }
    };
  }

  _spawnCandidates(wave, type) {
    if (!this.definition) return [];
    const wantsAir = type === 'flyer' || type === 'warden' || type === 'pelican';
    return this.validEntrances
      .filter(entrance => entrance.air === wantsAir && entrance.allow.includes(type) && wave >= entrance.activeWaves[0] && wave <= entrance.activeWaves[1])
      .filter(entrance => this._entranceRuntimeSafe(entrance, type))
      .map(entrance => ({ position: new this.THREE.Vector3(...entrance.position), facing: entrance.facing, entranceId: entrance.id, clearance: entranceClearanceFor(entrance, type) }));
  }

  _entranceRuntimeSafe(entrance, type) {
    const clearance = entranceClearanceFor(entrance, type);
    const zone = this.definition.bossClearZone;
    if (Array.isArray(zone?.center)
        && Math.hypot(entrance.position[0] - zone.center[0], entrance.position[2] - zone.center[1]) < zone.radius + clearance) return false;
    for (const objective of collectObjectiveClearZones(this.definition.objectives)) {
      if (Math.hypot(entrance.position[0] - objective.position[0], entrance.position[2] - objective.position[1]) < objective.radius + clearance) return false;
    }
    return true;
  }

  _bossAddPositions(count, type) {
    const entrances = this.validEntrances.filter(entrance => ['floor-hatch', 'rear-vent'].includes(entrance.id) && entrance.allow.includes(type));
    const result = [];
    const offsets = [[0,0], [1.35,0], [-1.35,0], [0,1.35], [0,-1.35]];
    for (let i = 0; i < count; i++) {
      const entrance = entrances[i % Math.max(1, entrances.length)];
      if (!entrance) break;
      const offset = offsets[Math.floor(i / Math.max(1, entrances.length)) % offsets.length];
      const position = new this.THREE.Vector3(entrance.position[0] + offset[0], entrance.position[1], entrance.position[2] + offset[1]);
      const playerPosition = this.enemyManager?.getPlayer?.()?.position;
      if (playerPosition && Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z) < 12) continue;
      if (this.enemyManager?.isSpawnPointClear(type, position, entranceClearanceFor(entrance, type))) result.push(position);
    }
    return result;
  }

  _buildGroundLanguage() {
    if (this.definition?.id === 'tutorial-yard') {
      this._buildTutorialGroundLanguage();
      return;
    }
    if (this.definition?.id === 'blackout-cistern') {
      this._buildBlackoutCisternGroundLanguage();
      return;
    }
    if (this.definition?.id === 'last-order-base') {
      this._buildLastOrderGroundLanguage();
      return;
    }
    if (this.definition?.id === 'floodgate-continuity') {
      this._buildFloodgateContinuityGroundLanguage();
      return;
    }
    if (this.definition?.id === 'sandstorm-expanse') {
      this._buildSandstormExpanseGroundLanguage();
      return;
    }
    if (this.definition?.id === 'server-cathedral') {
      this._buildServerCathedralGroundLanguage();
      return;
    }
    if (this.definition?.id === 'content-court') {
      this._buildContentCourtGroundLanguage();
      return;
    }
    if (this.definition?.id === 'mirror-garden') {
      this._buildMirrorGardenGroundLanguage();
      return;
    }
    if (this.definition?.id === 'freight-annex') {
      this._buildFreightGroundLanguage();
      return;
    }
    if (this.definition?.id === 'trend-wastes') {
      this._buildTrendWastesGroundLanguage();
      return;
    }
    if (this.definition?.id === 'ad-zone-arena') {
      this._buildAdZoneGroundLanguage();
      return;
    }
    if (this.definition?.id === 'sanitizer-spire') {
      this._buildSanitizerGroundLanguage();
      return;
    }
    const THREE = this.THREE;
    const materials = {
      block: new THREE.MeshStandardMaterial({ color: 0x65726b, roughness: 0.98 }),
      asphalt: new THREE.MeshStandardMaterial({ color: 0x4c5852, roughness: 0.88, metalness: .015 }),
      asphaltPatch: new THREE.MeshStandardMaterial({ color: 0x5c6862, roughness: 0.96 }),
      plaza: new THREE.MeshStandardMaterial({ color: 0x78827c, roughness: 0.9 }),
      plazaInset: new THREE.MeshStandardMaterial({ color: 0x66736d, roughness: 0.96 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0x8a938c, roughness: 0.98 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xb3b5a8, roughness: 0.92 }),
      facade: new THREE.MeshStandardMaterial({ color: 0x718078, roughness: 0.94 }),
      inset: new THREE.MeshStandardMaterial({ color: 0x263733, roughness: 0.82 }),
      bureauRed: new THREE.MeshStandardMaterial({ color: 0xa73535, emissive: 0x260505, emissiveIntensity: .28, roughness: .7 }),
      signal: new THREE.MeshStandardMaterial({ color: 0x42b9bc, emissive: 0x0d4143, emissiveIntensity: .55, roughness: .58 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xb39b42, roughness: 0.82, emissive: 0x1c1603, emissiveIntensity: 0.08 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x7f7549, roughness: .74, metalness: .04 }),
      service: new THREE.MeshStandardMaterial({ color: 0x43534f, roughness: .72, metalness: .07 }),
      perimeter: new THREE.MeshStandardMaterial({ color: 0x6e7a74, roughness: .9, metalness: .02 }),
      wet: new THREE.MeshStandardMaterial({ color: 0x244449, roughness: .18, metalness: .08, transparent: true, opacity: .52, depthWrite: false }),
      story: new THREE.MeshStandardMaterial({ color: 0x66716c, roughness: .8, metalness: .08, vertexColors: true }),
      warning: new THREE.MeshStandardMaterial({ color: 0xc55732, roughness: .68, emissive: 0x301006, emissiveIntensity: .12 })
    };
    this.relayMaterials = materials;
    const plane = (width, depth, x, z, material, y = 0.018) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (width, height, depth, x, y, z, material, parent = this.group) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // A city block first, combat routes second: broad streets overlap into two
    // cross-connections while the lighter relay court reads as one destination.
    plane(64, 56, 0, 0, materials.block, 0.012);
    plane(60, 9, 0, 21, materials.asphalt, 0.019);
    plane(13, 46, 0, 2, materials.asphalt, 0.021);
    plane(10, 48, -22, 0, materials.asphalt, 0.021);
    plane(10, 48, 22, 0, materials.asphalt, 0.021);
    plane(54, 7, 0, 8, materials.asphalt, 0.022);
    plane(54, 7, 0, -17, materials.asphalt, 0.022);
    plane(29, 23, 0, -7, materials.plaza, 0.028);

    // Sidewalk ribbons create coherent street walls and compress the lanes.
    plane(3.2, 48, -28.6, 0, materials.sidewalk, 0.031);
    plane(3.2, 48, 28.6, 0, materials.sidewalk, 0.031);
    plane(2.5, 43, -15.6, 0.5, materials.sidewalk, 0.031);
    plane(2.5, 43, 15.6, 0.5, materials.sidewalk, 0.031);
    plane(39, 3.2, 0, -22.2, materials.sidewalk, 0.032);
    plane(39, 2.6, 0, 15.8, materials.sidewalk, 0.032);

    // The authored collision boundary is continuous, so its visual language
    // must be continuous too. These low retaining walls sit directly on the
    // four boundary colliders and make the playable limit honest from either
    // side without adding any new collision.
    const [levelWidth = 64, levelDepth = 56] = this.definition?.size || [];
    const halfWidth = levelWidth / 2;
    const halfDepth = levelDepth / 2;
    const perimeterSegments = [
      [0, .72, -halfDepth, levelWidth, 1.44, 1],
      [0, .72, halfDepth, levelWidth, 1.44, 1],
      [-halfWidth, .72, 0, 1, 1.44, levelDepth],
      [halfWidth, .72, 0, 1, 1.44, levelDepth]
    ];
    const perimeterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.perimeter, perimeterSegments.length);
    perimeterMesh.name = 'relay-visible-boundaries';
    const perimeterDummy = new THREE.Object3D();
    perimeterSegments.forEach(([x, y, z, width, height, depth], index) => {
      perimeterDummy.position.set(x, y, z);
      perimeterDummy.scale.set(width, height, depth);
      perimeterDummy.updateMatrix();
      perimeterMesh.setMatrixAt(index, perimeterDummy.matrix);
    });
    perimeterMesh.receiveShadow = true;
    this.group.add(perimeterMesh);
    this._buildForestHorizon();

    // Thin edge accents communicate route identity without tinting whole roads.
    plane(0.22, 39, -17.12, 0.5, materials.signal, 0.048);
    plane(0.22, 39, 17.12, 0.5, materials.yellow, 0.048);
    plane(0.18, 16, -6.2, 8.5, materials.bureauRed, 0.048);
    plane(0.18, 16, 6.2, 8.5, materials.bureauRed, 0.048);

    // Curbs, road dashes, and a southern crosswalk give the block human scale.
    for (const x of [-16.9, 16.9]) box(0.22, 0.12, 39, x, 0.07, 0.5, materials.curb);
    for (let z = 19; z >= -13; z -= 6) box(0.22, 0.035, 2.4, 0, 0.055, z, materials.yellow);
    for (let x = -4.5; x <= 4.5; x += 1.5) box(0.72, 0.025, 3.2, x, 0.052, 16.2, materials.curb);

    // Repaired asphalt reads as an occupied city block rather than a black void.
    // Instancing keeps the entire wear pass to one draw call.
    const patches = [
      [-22, 12, 5.4, 1.9, .08], [-22, -8, 4.1, 2.8, -.06], [-21.5, -19, 6.2, 1.3, .03],
      [22, 16, 5.2, 2.2, -.05], [22, -5, 4.8, 1.6, .08], [21.5, -18.5, 6.0, 1.35, -.04],
      [0, 12, 5.2, 1.3, .03], [0, 2.5, 4.3, 1.15, -.08], [-7.5, -17, 3.4, 1.1, .05], [8, -17, 3.8, 1.0, -.04]
    ];
    const patchMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .018, 1), materials.asphaltPatch, patches.length);
    const patchDummy = new THREE.Object3D();
    patches.forEach(([x, z, width, depth, yaw], index) => {
      patchDummy.position.set(x, .042, z);
      patchDummy.rotation.set(0, yaw, 0);
      patchDummy.scale.set(width, 1, depth);
      patchDummy.updateMatrix();
      patchMesh.setMatrixAt(index, patchDummy.matrix);
    });
    patchMesh.receiveShadow = true;
    patchMesh.name = 'relay-asphalt-repairs';
    this.group.add(patchMesh);

    // Fine surface wear breaks up the broad planes at eye level. All marks
    // share one transparent material and one instanced draw call.
    const wearMarks = [
      [-23, 17, 3.8, .18, .04], [-22, 4, 2.8, .12, -.03], [-22, -12, 4.4, .14, .06],
      [23, 13, 3.5, .15, -.05], [22, 0, 2.4, .12, .04], [23, -18, 4.0, .16, -.04],
      [-4, 20, 3.1, .13, .02], [5, 8, 2.6, .12, -.06], [-8, -17, 3.0, .14, .05], [8, -17, 3.3, .13, -.05]
    ];
    const wearMaterial = new THREE.MeshBasicMaterial({ color: 0x101a19, transparent: true, opacity: .2, depthWrite: false });
    const wearMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .008, 1), wearMaterial, wearMarks.length);
    wearMesh.name = 'relay-road-wear';
    const wearDummy = new THREE.Object3D();
    wearMarks.forEach(([x, z, width, depth, yaw], index) => {
      wearDummy.position.set(x, .055, z);
      wearDummy.rotation.set(0, yaw, 0);
      wearDummy.scale.set(width, 1, depth);
      wearDummy.updateMatrix();
      wearMesh.setMatrixAt(index, wearDummy.matrix);
    });
    this.group.add(wearMesh);

    // Rain reveals selective sheen instead of turning the entire arena into a
    // mirror. This stays hidden until Wave 3 and costs one draw call.
    const puddles = [
      [-24, 18, 2.7, 1.0], [-21.5, -8, 1.8, .65], [22, 13, 2.4, .8], [23, -7, 1.7, .6],
      [-7.5, 8, 1.45, .5], [7, -17, 2.1, .65], [-4, -2, 1.25, .45], [5.5, 3, 1.6, .55]
    ];
    const puddleMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), materials.wet, puddles.length);
    puddleMesh.name = 'relay-rain-sheen';
    const puddleDummy = new THREE.Object3D();
    puddles.forEach(([x, z, sx, sz], index) => {
      puddleDummy.position.set(x, .066, z);
      puddleDummy.rotation.set(-Math.PI / 2, 0, (index % 3 - 1) * .18);
      puddleDummy.scale.set(sx, sz, 1);
      puddleDummy.updateMatrix();
      puddleMesh.setMatrixAt(index, puddleDummy.matrix);
    });
    puddleMesh.visible = false;
    puddleMesh.renderOrder = 2;
    this.group.add(puddleMesh);

    // Broad, soft contact patches ground the largest props even on the
    // performance profile where full realtime shadows remain disabled.
    const contacts = [
      [0, -7, 4.2, 3.6], [-24, 11.5, 3.6, 3.0], [-22, -1, 2.2, 3.0], [-24, -15.5, 2.4, 3.2],
      [22, 11.5, 3.0, 2.1], [22, -1, 2.2, 3.0], [24, -15, 2.4, 3.2], [-9, 14.5, 3.3, 1.6],
      [9, 14.5, 3.3, 1.6], [-15.5, 2, 2.0, 2.0], [15.5, 2, 2.1, 2.1]
    ];
    const contactMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { uColor: { value: new THREE.Color(0x030807) }, uOpacity: { value: .28 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = (1.0 - smoothstep(.12, 1.0, radius)) * uOpacity;
          if (alpha < .004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const contactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), contactMaterial, contacts.length);
    contactMesh.name = 'relay-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    contacts.forEach(([x, z, sx, sz], index) => {
      contactDummy.position.set(x, .057, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, 0);
      contactDummy.scale.set(sx, sz, 1);
      contactDummy.updateMatrix();
      contactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    contactMesh.renderOrder = 1;
    this.group.add(contactMesh);

    // A low circular dais protects the landmark silhouette while preserving
    // the 21 m boss-clear court as intentional negative space.
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.35, 0.16, 48), materials.asphalt);
    dais.position.set(0, 0.08, -7);
    dais.receiveShadow = true;
    this.group.add(dais);
    const innerDais = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.45, .045, 48), materials.plazaInset);
    innerDais.position.set(0, .18, -7);
    innerDais.receiveShadow = true;
    this.group.add(innerDais);

    // Visible infrastructure connects the side feeds to the central mast and
    // turns the objectives into one readable broadcast system.
    const cable = (start, end, width, material, y = .075) => {
      const dx = end[0] - start[0];
      const dz = end[1] - start[1];
      const length = Math.hypot(dx, dz);
      const mesh = box(width, .025, length, (start[0] + end[0]) / 2, y, (start[1] + end[1]) / 2, material);
      mesh.rotation.y = Math.atan2(dx, dz);
      return mesh;
    };
    cable([-15.5, 2], [-2.0, -5.7], .48, materials.inset);
    cable([-15.5, 2], [-2.0, -5.7], .10, materials.signal, .095);
    cable([15.5, 2], [2.0, -5.7], .48, materials.inset);
    cable([15.5, 2], [2.0, -5.7], .10, materials.signal, .095);

    // Showcase-inspired civic frontage: solid mass, dark window rhythm, and
    // one gold broadcast lintel. Generated buildings extend the silhouette.
    box(34, 5.2, 1.05, 0, 2.6, -24.65, materials.facade);
    for (const x of [-12, -6, 0, 6, 12]) box(4.2, 1.35, 0.14, x, 2.65, -24.08, materials.inset);
    box(20, 0.58, 1.3, 0, 5.25, -24.45, materials.bureauRed);
    box(2.2, 0.38, 0.24, 0, 4.08, -23.95, materials.signal);

    // A two-draw-call side skyline replaces repeated high-detail backdrop
    // prefabs. It hides the arena rim, preserves asymmetry, and keeps targets
    // against a quiet value range instead of the bright boundary wall.
    const rimBlocks = [
      [-33.2, -20.5, 4.2, 7.0, 7.2], [-33.4, -12.7, 4.5, 8.0, 10.2],
      [-33.1, -3.8, 4.1, 8.2, 6.6], [-33.5, 5.1, 4.8, 8.5, 9.0],
      [-33.0, 14.3, 4.0, 8.0, 7.8], [-33.4, 22.2, 4.6, 6.4, 10.8],
      [33.3, -20.7, 4.4, 7.2, 9.4], [33.1, -12.4, 4.0, 8.0, 6.9],
      [33.5, -3.5, 4.8, 8.4, 10.6], [33.1, 5.4, 4.1, 8.0, 7.5],
      [33.4, 14.1, 4.6, 8.2, 9.2], [33.0, 22.1, 4.0, 6.2, 6.8]
    ];
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x435250, roughness: .96 });
    const rimMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), rimMaterial, rimBlocks.length);
    rimMesh.name = 'relay-rim-massing';
    const rimDummy = new THREE.Object3D();
    rimBlocks.forEach(([x, z, width, depth, height], index) => {
      rimDummy.position.set(x, height / 2, z);
      rimDummy.rotation.set(0, 0, 0);
      rimDummy.scale.set(width, height, depth);
      rimDummy.updateMatrix();
      rimMesh.setMatrixAt(index, rimDummy.matrix);
    });
    rimMesh.receiveShadow = true;
    this.group.add(rimMesh);

    const rimWindows = [];
    rimBlocks.forEach(([x, z, , depth, height], blockIndex) => {
      const faceX = x < 0 ? -30.94 : 30.94;
      const rowCount = height > 9 ? 3 : 2;
      for (let row = 0; row < rowCount; row += 1) {
        for (const offset of [-depth * .24, depth * .24]) {
          if ((blockIndex + row + (offset > 0 ? 1 : 0)) % 3 !== 0) rimWindows.push([faceX, 2.0 + row * 1.75, z + offset]);
        }
      }
    });
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x4cc8c8, emissive: 0x124b4b, emissiveIntensity: .75, roughness: .5 });
    const windowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.10, .52, .72), windowMaterial, rimWindows.length);
    windowMesh.name = 'relay-rim-windows';
    const windowDummy = new THREE.Object3D();
    rimWindows.forEach(([x, y, z], index) => {
      windowDummy.position.set(x, y, z);
      windowDummy.rotation.set(0, 0, 0);
      windowDummy.scale.set(1, 1, 1);
      windowDummy.updateMatrix();
      windowMesh.setMatrixAt(index, windowDummy.matrix);
    });
    this.group.add(windowMesh);

    // Roof caps and service housings turn the side boxes into architecture
    // without increasing collider complexity.
    const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.roof, rimBlocks.length);
    roofMesh.name = 'relay-rim-roofs';
    rimBlocks.forEach(([x, z, width, depth, height], index) => {
      rimDummy.position.set(x, height + .11, z);
      rimDummy.scale.set(width + .24, .22, depth + .24);
      rimDummy.updateMatrix();
      roofMesh.setMatrixAt(index, rimDummy.matrix);
    });
    this.group.add(roofMesh);

    const roofServices = rimBlocks.filter((_, index) => index % 2 === 0);
    const serviceMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.service, roofServices.length);
    serviceMesh.name = 'relay-roof-services';
    roofServices.forEach(([x, z, width, , height], index) => {
      rimDummy.position.set(x, height + .58, z + (index % 2 ? -.65 : .65));
      rimDummy.scale.set(Math.max(1.0, width * .38), .9, 1.25);
      rimDummy.updateMatrix();
      serviceMesh.setMatrixAt(index, rimDummy.matrix);
    });
    this.group.add(serviceMesh);

    // The lightmast asset's lenses sit on local +Z and the prefab owns a -.18
    // yaw. Project each pool along that authored facing instead of centering a
    // generic glow under the stand. The two objective practicals stay local.
    const lightMastPlacements = (this.definition?.assets || []).filter(placement => placement.asset === 'lightmast');
    const lightPools = lightMastPlacements.map(placement => {
      const yaw = (placement.yaw || 0) - .18;
      const scale = placement.scale || 1;
      const reach = 5.8 * scale;
      return [
        placement.position[0] + Math.sin(yaw) * reach,
        placement.position[2] + Math.cos(yaw) * reach,
        2.7 * scale,
        3.35 * scale,
        yaw
      ];
    });
    lightPools.push([-15.5, 2, 1.65, 1.2, 0], [15.5, 2, 1.65, 1.2, 0]);
    const lightPoolMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xf2c75c) },
        uOpacity: { value: .22 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float radius = length((vUv - .5) * 2.0);
          float feather = 1.0 - smoothstep(.16, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
    const lightPoolMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24), lightPoolMaterial, lightPools.length);
    lightPoolMesh.name = 'relay-light-pools';
    const detailDummy = new THREE.Object3D();
    lightPools.forEach(([x, z, width, depth, yaw], index) => {
      detailDummy.position.set(x, .071, z);
      detailDummy.rotation.set(-Math.PI / 2, 0, yaw);
      detailDummy.scale.set(width, depth, 1);
      detailDummy.updateMatrix();
      lightPoolMesh.setMatrixAt(index, detailDummy.matrix);
    });
    lightPoolMesh.renderOrder = 2;
    this.group.add(lightPoolMesh);

    // A rounded frustum starts across the full four-lamp bar, rather than from
    // a single cone apex. View-angle and length falloff keep the volume soft
    // without adding four realtime SpotLights to the combat shader.
    const lightBeamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffd58d) },
        uOpacity: { value: .03 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec4 viewPosition = viewMatrix * worldPosition;
          vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vViewDirection = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
          float edgeFeather = smoothstep(.04, .68, facing);
          float sourceFeather = smoothstep(0.0, .12, vUv.y);
          float endFeather = 1.0 - smoothstep(.72, 1.0, vUv.y);
          float body = mix(.42, 1.0, sourceFeather * endFeather);
          float alpha = uOpacity * edgeFeather * body;
          if (alpha < .001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const lightBeamGeometry = new THREE.CylinderGeometry(.64, 1, 1, 24, 1, true);
    const lightBeamMesh = new THREE.InstancedMesh(lightBeamGeometry, lightBeamMaterial, lightMastPlacements.length);
    lightBeamMesh.name = 'relay-lightmast-beams';
    const beamUp = new THREE.Vector3(0, 1, 0);
    const beamStart = new THREE.Vector3();
    const beamEnd = new THREE.Vector3();
    const beamDirection = new THREE.Vector3();
    lightMastPlacements.forEach((placement, index) => {
      const yaw = (placement.yaw || 0) - .18;
      const scale = placement.scale || 1;
      const reach = 6.5 * scale;
      const lensOffset = .3 * scale;
      beamStart.set(
        placement.position[0] + Math.sin(yaw) * lensOffset,
        4.73 * scale,
        placement.position[2] + Math.cos(yaw) * lensOffset
      );
      beamEnd.set(
        placement.position[0] + Math.sin(yaw) * reach,
        .12,
        placement.position[2] + Math.cos(yaw) * reach
      );
      beamDirection.copy(beamStart).sub(beamEnd);
      const beamLength = beamDirection.length();
      detailDummy.position.copy(beamStart).add(beamEnd).multiplyScalar(.5);
      detailDummy.quaternion.setFromUnitVectors(beamUp, beamDirection.normalize());
      detailDummy.scale.set(2.45 * scale, beamLength, 1.45 * scale);
      detailDummy.updateMatrix();
      lightBeamMesh.setMatrixAt(index, detailDummy.matrix);
    });
    lightBeamMesh.frustumCulled = false;
    lightBeamMesh.renderOrder = 1;
    this.group.add(lightBeamMesh);

    // Three small authored story clusters: abandoned cordon supplies in the
    // west, public broadcast cases in the court, and evacuation debris east.
    const storyCrates = [
      [-27.3, 7.2, .85, .65, .7, .08], [-26.4, 7.4, .62, .52, .5, -.1], [-27.0, 6.55, .55, .48, .45, .16],
      [-11.8, -20.4, .72, .55, .62, -.08], [-10.95, -20.25, .52, .44, .45, .12],
      [26.9, -11.8, .8, .6, .6, -.12], [26.0, -12.0, .6, .48, .46, .1], [27.1, -12.65, .5, .42, .4, .04]
    ];
    const storyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.story, storyCrates.length);
    storyMesh.name = 'relay-story-crates';
    const storyColors = [0x7b837c, 0x485b59, 0xa86d35, 0x5b6965, 0x9a7d43, 0x6c726b, 0x3f5f60, 0x8f5036];
    storyCrates.forEach(([x, z, sx, sy, sz, yaw], index) => {
      detailDummy.position.set(x, sy / 2 + .04, z);
      detailDummy.rotation.set(0, yaw, 0);
      detailDummy.scale.set(sx, sy, sz);
      detailDummy.updateMatrix();
      storyMesh.setMatrixAt(index, detailDummy.matrix);
      storyMesh.setColorAt(index, new THREE.Color(storyColors[index]));
    });
    if (storyMesh.instanceColor) storyMesh.instanceColor.needsUpdate = true;
    this.group.add(storyMesh);

    const warningPosts = [[-28.1, 8.1], [-25.7, 8.1], [-12.6, -19.8], [-10.2, -19.8], [25.5, -11.0], [28.0, -11.0]];
    const warningMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .22, .65, 8), materials.warning, warningPosts.length);
    warningMesh.name = 'relay-cordon-markers';
    warningPosts.forEach(([x, z], index) => {
      detailDummy.position.set(x, .34, z);
      detailDummy.rotation.set(0, 0, 0);
      detailDummy.scale.set(1, 1, 1);
      detailDummy.updateMatrix();
      warningMesh.setMatrixAt(index, detailDummy.matrix);
    });
    this.group.add(warningMesh);

    const alarmMaterial = new THREE.MeshStandardMaterial({ color: 0xff5147, emissive: 0x7a0805, emissiveIntensity: 1.5, roughness: .4 });
    const alarmPositions = [[-13.5, 4.85, -18], [13.5, 4.85, -18], [-13.5, 4.85, 7], [13.5, 4.85, 7], [-15.5, 2.25, 2], [15.5, 2.5, 2]];
    const alarmMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.16, 0), alarmMaterial, alarmPositions.length);
    alarmMesh.name = 'relay-alarm-beacons';
    alarmPositions.forEach(([x, y, z], index) => {
      detailDummy.position.set(x, y, z);
      detailDummy.scale.set(1, 1, 1);
      detailDummy.updateMatrix();
      alarmMesh.setMatrixAt(index, detailDummy.matrix);
    });
    alarmMesh.visible = false;
    this.group.add(alarmMesh);

    const mastPosition = this.definition?.objectives?.mast?.position || [0, -7];
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.15, 5.5, 64), new THREE.MeshBasicMaterial({ color: 0xc7ff36, transparent: true, opacity: 0.48, side: THREE.DoubleSide }));
    ring.name = 'relay-objective-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(mastPosition[0], 0.18, mastPosition[1]);
    this.group.add(ring);

    // The relay is the level's light owner, not only its tallest silhouette.
    // One short-range practical supplies warm form light while shader cards
    // carry the pool and vertical signal at negligible per-frame cost.
    const mastKey = new THREE.PointLight(0xffcf9a, 4.8, 15, 2);
    mastKey.name = 'relay-mast-key';
    mastKey.position.set(mastPosition[0], 3.8, mastPosition[1] + .45);
    mastKey.castShadow = false;
    mastKey.userData.baseIntensity = 4.8;
    this.group.add(mastKey);

    const mastPoolMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0xffc97e) },
        uOpacity: { value: .19 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = (1.0 - smoothstep(.08, 1.0, radius));
          alpha = alpha * alpha * uOpacity;
          if (alpha < .003) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const mastPool = new THREE.Mesh(new THREE.CircleGeometry(5.8, 40), mastPoolMaterial);
    mastPool.name = 'relay-mast-hero-pool';
    mastPool.rotation.x = -Math.PI / 2;
    mastPool.position.set(mastPosition[0], .19, mastPosition[1]);
    mastPool.scale.set(1, .72, 1);
    mastPool.renderOrder = 2;
    this.group.add(mastPool);

    const mastBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0xc7ff36,
      transparent: true,
      opacity: .045,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const mastBeam = new THREE.Mesh(new THREE.CylinderGeometry(.42, 2.15, 8.4, 24, 1, true), mastBeamMaterial);
    mastBeam.name = 'relay-mast-signal-beam';
    mastBeam.position.set(mastPosition[0], 4.3, mastPosition[1]);
    mastBeam.renderOrder = 1;
    this.group.add(mastBeam);

    // The mast crown and guy cables strengthen the hero silhouette from every
    // combat lane. They are visual-only and do not change objective clearance.
    const crown = new THREE.Group();
    crown.name = 'relay-signal-crown';
    crown.position.set(mastPosition[0], 8.25, mastPosition[1]);
    const crownMaterial = new THREE.MeshStandardMaterial({
      color: 0xb83238, emissive: 0x4b080b, emissiveIntensity: 1.1,
      roughness: .42, transparent: true, opacity: .88
    });
    crownMaterial.userData.relaySignal = true;
    for (const [radius, y] of [[1.35, -.08], [1.78, .55]]) {
      const signalRing = new THREE.Mesh(new THREE.TorusGeometry(radius, .085, 6, 24), crownMaterial);
      signalRing.rotation.x = Math.PI / 2;
      signalRing.position.y = y;
      crown.add(signalRing);
    }
    const beaconMaterial = crownMaterial.clone();
    beaconMaterial.opacity = .42;
    beaconMaterial.depthWrite = false;
    beaconMaterial.userData.relaySignal = true;
    const beaconColumn = new THREE.Mesh(new THREE.CylinderGeometry(.06, .20, 3.2, 8), beaconMaterial);
    beaconColumn.position.y = 1.35;
    crown.add(beaconColumn);
    this.group.add(crown);

    const surgeMaterial = new THREE.MeshBasicMaterial({ color: 0xd0ff45, transparent: true, opacity: .42, depthWrite: false, blending: THREE.AdditiveBlending });
    const surgeMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .035, 5, 32), surgeMaterial, 3);
    surgeMesh.name = 'relay-signal-surge';
    for (let index = 0; index < 3; index += 1) {
      detailDummy.position.set(mastPosition[0], 5.9 + index * 1.1, mastPosition[1]);
      detailDummy.rotation.set(Math.PI / 2 + (index - 1) * .18, index * .65, 0);
      detailDummy.scale.setScalar(2.25 + index * .55);
      detailDummy.updateMatrix();
      surgeMesh.setMatrixAt(index, detailDummy.matrix);
    }
    surgeMesh.visible = false;
    surgeMesh.frustumCulled = false;
    this.group.add(surgeMesh);

    const veinSegments = [
      [0, -10.5, .22, 5.8, 0], [-4.6, -12.4, .18, 6.5, .88], [-9.3, -14.6, .16, 5.2, 1.08],
      [4.7, -12.3, .18, 6.4, -.9], [10.4, -14.2, .16, 7.0, -1.08], [16.5, -15.2, .14, 6.3, -1.28]
    ];
    const veinMaterial = new THREE.MeshBasicMaterial({ color: 0xff5948, transparent: true, opacity: .5, depthWrite: false });
    const veinMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .018, 1), veinMaterial, veinSegments.length);
    veinMesh.name = 'relay-infestation-veins';
    veinSegments.forEach(([x, z, width, depth, yaw], index) => {
      detailDummy.position.set(x, .084, z);
      detailDummy.rotation.set(0, yaw, 0);
      detailDummy.scale.set(width, 1, depth);
      detailDummy.updateMatrix();
      veinMesh.setMatrixAt(index, detailDummy.matrix);
    });
    veinMesh.visible = false;
    this.group.add(veinMesh);

    // One grounded threat ring keeps close-range targets readable without the
    // floating "Sims pin" language that made enemies feel debug-tagged.
    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff6259, transparent: true, opacity: .74, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'relay-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    const enemyContactMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { uColor: { value: new THREE.Color(0x020504) }, uOpacity: { value: .34 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = (1.0 - smoothstep(.05, 1.0, radius));
          alpha = alpha * alpha * uOpacity;
          if (alpha < .004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'relay-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildLastOrderGroundLanguage() {
    const THREE = this.THREE;
    const zScale = (this.definition?.size?.[1] || 104) / 104;
    const Z = value => value * zScale;
    const tunnelDepth = Z(104);
    const terminalZ = this.definition?.objectives?.escape?.position?.[1] ?? Z(-39);
    const stormNearZ = terminalZ + 12;
    const stormFarZ = Z(-51.6);
    const materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0x20272a, roughness: .74, metalness: .2 }),
      floorInset: new THREE.MeshStandardMaterial({ color: 0x101619, roughness: .6, metalness: .3 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x343e42, roughness: .82, metalness: .12 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x171e21, roughness: .76, metalness: .22 }),
      ribs: new THREE.MeshStandardMaterial({ color: 0x11171a, roughness: .7, metalness: .32 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc7443f, emissive: 0x60120e, emissiveIntensity: .8, roughness: .48 }),
      emergency: new THREE.MeshStandardMaterial({ color: 0xf06854, emissive: 0xb42518, emissiveIntensity: 1.5, roughness: .35 }),
      deadZone: new THREE.MeshStandardMaterial({ color: 0x66d7c8, emissive: 0x176e68, emissiveIntensity: 1.1, roughness: .38 }),
      gate: new THREE.MeshStandardMaterial({ color: 0x293335, roughness: .7, metalness: .3 }),
      sand: new THREE.MeshStandardMaterial({ color: 0xa4874e, roughness: 1, flatShading: true }),
      sandDark: new THREE.MeshStandardMaterial({ color: 0x725d36, roughness: 1, flatShading: true }),
      mug: new THREE.MeshStandardMaterial({ color: 0xd8caa9, roughness: .72 }),
      coffee: new THREE.MeshStandardMaterial({ color: 0x28160d, roughness: .5 })
    };
    this.lastOrderMaterials = materials;
    const box = (width, height, depth, x, y, z, material, name = '') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    box(18, .14, tunnelDepth, 0, -.02, 0, materials.floor, 'last-order-floor');
    box(3.2, .025, Z(98), 0, .065, 0, materials.floorInset, 'last-order-run-line');
    box(.24, .035, Z(96), -2, .09, 0, materials.red);
    box(.24, .035, Z(96), 2, .09, 0, materials.red);
    box(.45, 4.15, tunnelDepth, -8.72, 2.075, 0, materials.wall);
    box(.45, 4.15, tunnelDepth, 8.72, 2.075, 0, materials.wall);
    box(18, 4.15, .5, 0, 2.075, Z(51.75), materials.wall, 'last-order-start-wall');
    box(18, .3, tunnelDepth, 0, 4.15, 0, materials.ceiling, 'last-order-ceiling');
    box(17, 3.65, .7, 0, 1.825, Z(48), materials.gate, 'last-order-rear-gate');
    box(.12, 3.4, .76, 0, 1.7, Z(47.99), materials.red);
    box(11.5, .08, .78, 0, 3.35, Z(47.98), materials.emergency);

    // The final airlock is an open frame. Its authored collider remains the
    // physical end of the level, while the view through it is the same warm,
    // wind-scoured world the player enters on Wave 42.
    const finishGate = new THREE.Group();
    finishGate.name = 'last-order-finish-gate';
    this.group.add(finishGate);
    const finishPost = (x, width, height, y) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(width, height, .7), materials.gate);
      post.position.set(x, y, Z(-48));
      post.castShadow = true;
      post.receiveShadow = true;
      finishGate.add(post);
      return post;
    };
    finishPost(-8.05, .9, 3.65, 1.825);
    finishPost(8.05, .9, 3.65, 1.825);
    finishPost(0, 15.2, .42, 3.44);
    const finishStrip = finishPost(0, 11.5, .08, 3.34);
    finishStrip.material = materials.deadZone;

    const stormMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0x514b3a) },
        uBottom: { value: new THREE.Color(0xb4975c) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        void main() {
          vec2 gustUv = vec2(vUv.x * 10.0 - uTime * 1.4, vUv.y * 5.0 + uTime * .16);
          float cell = hash(floor(gustUv * vec2(2.4, 8.0)));
          float gust = sin((vUv.x * 14.0 + vUv.y * 5.0 - uTime * 3.2) + cell * 5.0) * .5 + .5;
          gust = smoothstep(.47, .86, gust) * (.35 + cell * .65);
          vec3 color = mix(uBottom, uTop, smoothstep(.02, .95, vUv.y));
          color += vec3(.13, .105, .055) * gust;
          gl_FragColor = vec4(color, .96);
        }
      `
    });
    const stormVeil = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.2), stormMaterial);
    stormVeil.name = 'last-order-sandstorm-veil';
    stormVeil.position.set(0, 2.08, Z(-51.4));
    this.lastOrderStormVeil = stormVeil;
    this.group.add(stormVeil);

    // Closely spaced translucent slices approximate a dense local volume.
    // Unlike scene fog, these remain confined to the buried final chamber and
    // visibly mark the point where the player crosses into the storm.
    const hazeGroup = new THREE.Group();
    hazeGroup.name = 'last-order-heavy-sand-haze';
    hazeGroup.userData.nearZ = stormNearZ;
    hazeGroup.userData.farZ = stormFarZ;
    const hazeLayerCount = 17;
    for (let index = 0; index < hazeLayerCount; index += 1) {
      const offset = index * 1.731;
      const density = .12 + (index % 4) * .014;
      const hazeMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uOffset: { value: offset },
          uDensity: { value: density },
          uColor: { value: new THREE.Color(index % 3 === 0 ? 0xbda36e : 0xa88e5d) }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          uniform float uOffset;
          uniform float uDensity;
          uniform vec3 uColor;
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(41.31, 289.17))) * 45758.5453);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            vec2 windUv = vec2(vUv.x * 5.2 - uTime * 1.9 + uOffset, vUv.y * 7.0 + uTime * .13);
            float broad = noise(windUv * vec2(.72, .34));
            float detail = noise(windUv * vec2(2.3, 1.15) + 7.4);
            float gust = smoothstep(.18, .88, broad * .72 + detail * .38);
            float verticalFade = smoothstep(0.0, .08, vUv.y) * (1.0 - smoothstep(.92, 1.0, vUv.y));
            float alpha = uDensity * (.56 + gust * .86) * verticalFade;
            gl_FragColor = vec4(uColor, alpha);
          }
        `
      });
      const hazeLayer = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 4.08), hazeMaterial);
      const fraction = (index + .45) / hazeLayerCount;
      hazeLayer.position.set(0, 2.04, stormNearZ + (stormFarZ - stormNearZ) * fraction);
      hazeLayer.name = `last-order-heavy-sand-layer-${index + 1}`;
      hazeLayer.renderOrder = 20 + index;
      hazeGroup.add(hazeLayer);
      this.lastOrderStormLayers.push(hazeLayer);
    }
    this.group.add(hazeGroup);

    // A tessellated heightfield gives the accumulated sand real depth and
    // lighting. It begins beyond the terminal, rises along the tunnel axis,
    // and presses into the roof instead of reading as a vertical stage card.
    const duneNearZ = terminalZ - 1.8;
    const duneFarZ = Z(-52);
    const xSegments = 28;
    const zSegments = 30;
    const dunePositions = [];
    const duneColors = [];
    const duneIndices = [];
    const lowSand = new THREE.Color(0x765f36);
    const highSand = new THREE.Color(0xc0a269);
    const colorScratch = new THREE.Color();
    for (let row = 0; row <= zSegments; row += 1) {
      const along = row / zSegments;
      const z = duneNearZ + (duneFarZ - duneNearZ) * along;
      for (let column = 0; column <= xSegments; column += 1) {
        const across = column / xSegments;
        const x = -9 + across * 18;
        const ridge = Math.sin(x * .62 + along * 5.4) * .18
          + Math.sin(x * 1.41 - along * 8.2) * .08;
        const crown = (1 - Math.pow(Math.abs(x) / 9, 1.65)) * (.2 + along * .48);
        const rise = Math.pow(along, .7) * 4.45;
        const y = Math.max(.025, Math.min(4.18, .025 + rise + crown + ridge * (.2 + along)));
        dunePositions.push(x, y, z);
        colorScratch.copy(lowSand).lerp(highSand, Math.max(0, Math.min(1, .18 + y / 5.1 + ridge * .42)));
        duneColors.push(colorScratch.r, colorScratch.g, colorScratch.b);
      }
    }
    const duneStride = xSegments + 1;
    for (let row = 0; row < zSegments; row += 1) {
      for (let column = 0; column < xSegments; column += 1) {
        const a = row * duneStride + column;
        const b = a + 1;
        const c = a + duneStride;
        const d = c + 1;
        duneIndices.push(a, c, b, b, c, d);
      }
    }
    const duneGeometry = new THREE.BufferGeometry();
    duneGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dunePositions, 3));
    duneGeometry.setAttribute('color', new THREE.Float32BufferAttribute(duneColors, 3));
    duneGeometry.setIndex(duneIndices);
    duneGeometry.computeVertexNormals();
    const duneMaterial = materials.sand.clone();
    duneMaterial.vertexColors = true;
    duneMaterial.flatShading = false;
    duneMaterial.side = THREE.DoubleSide;
    const sandWall = new THREE.Mesh(duneGeometry, duneMaterial);
    sandWall.name = 'last-order-end-wall';
    sandWall.userData.transitionSurface = 'sand-3d-heightfield';
    sandWall.castShadow = true;
    sandWall.receiveShadow = true;
    this.group.add(sandWall);
    for (let baseZ = 44, index = 1; baseZ >= -46; baseZ -= 18, index += 1) {
      const z = Z(baseZ);
      box(18, .3, .45, 0, 3.92, z, materials.ribs);
      const light = box(6.4, .08, .18, 0, 3.94, z, materials.emergency, `last-order-light-${index}`);
      light.castShadow = false;
    }
    for (const baseZ of [32, 8, -16, -38]) {
      const light = new THREE.PointLight(baseZ <= -32 ? 0x8cf5e7 : 0xff9b82, 3.8, 25, 1.7);
      light.position.set(0, 3.65, Z(baseZ));
      light.castShadow = false;
      this.group.add(light);
    }
    const sandDrifts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 7), materials.sandDark, 14);
    sandDrifts.name = 'last-order-sand-drifts';
    const sandDummy = new THREE.Object3D();
    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 ? 1 : -1;
      const driftZ = terminalZ + 7 - (index * 11 % 16);
      sandDummy.position.set(side * (2.3 + (index % 5) * 1.05), .04 + (index % 3) * .025, driftZ);
      sandDummy.rotation.set(0, index * .73, 0);
      sandDummy.scale.set(1.5 + (index % 4) * .48, .08 + (index % 3) * .045, .85 + (index % 5) * .26);
      sandDummy.updateMatrix();
      sandDrifts.setMatrixAt(index, sandDummy.matrix);
    }
    sandDrifts.receiveShadow = true;
    this.group.add(sandDrifts);

    const particleCount = 900;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositionArray = new Float32Array(particleCount * 3);
    const dustVelocities = new Float32Array(particleCount * 3);
    const dustSizes = new Float32Array(particleCount);
    const dustAlpha = new Float32Array(particleCount);
    for (let index = 0; index < particleCount; index += 1) {
      dustPositionArray[index * 3] = -8.2 + ((index * 47) % 164) / 10;
      dustPositionArray[index * 3 + 1] = .12 + ((index * 31) % 39) / 10;
      const stormFraction = ((index * 73) % 997) / 996;
      dustPositionArray[index * 3 + 2] = stormFarZ + (stormNearZ - stormFarZ) * stormFraction;
      dustVelocities[index * 3] = 3.4 + (index % 9) * .42;
      dustVelocities[index * 3 + 1] = .015 + (index % 5) * .012;
      dustVelocities[index * 3 + 2] = .46 + (index % 7) * .11;
      dustSizes[index] = .15 + (index % 11) * .045;
      dustAlpha[index] = .22 + (index % 7) * .07;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositionArray, 3));
    dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
    dustGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlpha, 1));
    const dustParticles = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(0xd8bd82) } },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (270.0 / max(1.0, -viewPosition.z)), 2.0, 34.0);
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float radius = length(gl_PointCoord - vec2(.5));
          float soft = 1.0 - smoothstep(.12, .5, radius);
          soft *= soft;
          if (soft < .012) discard;
          gl_FragColor = vec4(uColor, soft * vAlpha);
        }
      `
    }));
    dustParticles.name = 'last-order-airlock-dust';
    dustParticles.userData.velocities = dustVelocities;
    dustParticles.userData.nearZ = stormNearZ;
    dustParticles.userData.farZ = stormFarZ;
    this.lastOrderDust = dustParticles;
    this.group.add(dustParticles);

    const mug = new THREE.Group();
    mug.name = 'last-order-mug';
    mug.position.set(.46, 1.72, terminalZ - .43);
    const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(.17, .14, .32, 12, 1, true), materials.mug);
    mugBody.name = 'last-order-mug-body';
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(.145, 12), materials.coffee);
    coffee.name = 'last-order-mug-coffee';
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = .155;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 6, 12, Math.PI * 1.55), materials.mug);
    handle.name = 'last-order-mug-handle';
    handle.position.set(.17, .01, 0);
    handle.rotation.z = Math.PI * .22;
    mug.add(mugBody, coffee, handle);
    this.group.add(mug);
    for (let baseZ = 39; baseZ >= -39; baseZ -= 6) {
      const z = Z(baseZ);
      box(.18, .025, Z(2.4), 0, .088, z, baseZ <= -33 ? materials.deadZone : materials.emergency);
    }
    const exitRing = new THREE.Mesh(new THREE.RingGeometry(3.45, 3.75, 40), materials.deadZone);
    exitRing.name = 'last-order-exit-ring';
    exitRing.rotation.x = -Math.PI / 2;
    exitRing.position.set(0, .1, terminalZ);
    this.group.add(exitRing);
  }

  _buildTutorialGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0x333d3b, roughness: .9, metalness: .04 }),
      floorInset: new THREE.MeshStandardMaterial({ color: 0x202a29, roughness: .8, metalness: .08 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x46514e, roughness: .9, metalness: .04 }),
      wallInset: new THREE.MeshStandardMaterial({ color: 0x182321, roughness: .82, metalness: .08 }),
      cover: new THREE.MeshStandardMaterial({ color: 0x5c6965, roughness: .86 }),
      cyan: new THREE.MeshBasicMaterial({ color: 0x55e1df, toneMapped: false }),
      lime: new THREE.MeshBasicMaterial({ color: 0xc7f34b, toneMapped: false }),
      amber: new THREE.MeshBasicMaterial({ color: 0xffc857, toneMapped: false }),
      red: new THREE.MeshBasicMaterial({ color: 0xff665c, toneMapped: false }),
      light: new THREE.MeshBasicMaterial({ color: 0xe3fff2, toneMapped: false, side: THREE.DoubleSide })
    };
    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (width, height, depth, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    // A sealed 4x4-cell black-site room: no sky, no exterior silhouette, and
    // one hard ceiling light language. The player is explicitly hiding from
    // Algorithm surveillance rather than training in a public arena.
    plane(18, 18, 0, 0, materials.floor, .012);
    plane(16.8, 16.8, 0, 0, materials.floorInset, .024);
    box(18, 4, .5, 0, 2, -9, materials.wall);
    box(18, 4, .5, 0, 2, 9, materials.wall);
    box(.5, 4, 18, -9, 2, 0, materials.wall);
    box(.5, 4, 18, 9, 2, 0, materials.wall);
    box(18, .3, 18, 0, 3.85, 0, materials.wallInset);

    // Four-by-four cell grid gives scale and route comprehension at a glance.
    for (const coordinate of [-4.5, 0, 4.5]) {
      box(.055, .025, 17, coordinate, .052, 0, materials.cyan);
      box(17, .025, .055, 0, .052, coordinate, materials.cyan);
    }

    // Exactly one objective marker is active at a time. A filled diamond is
    // visually distinct from enemy spawn rings and cannot produce the broken
    // overlapping-circle pattern that the previous static pads created.
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x55e1df,
      transparent: true,
      opacity: .78,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), markerMaterial);
    marker.name = 'tutorial-objective-marker';
    marker.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    marker.position.set(0, .086, 5.2);
    marker.visible = false;
    marker.renderOrder = 4;
    this.tutorialObjectiveMarker = marker;
    this.group.add(marker);

    // Jump hurdle plus three honest pieces of cover. Visual geometry matches
    // the authored collision boxes exactly, so there are no invisible edges.
    box(7.2, .72, .7, 0, .36, 4.25, materials.cover);
    box(2.8, 2.05, .75, 2.65, 1.025, 3.25, materials.cover);
    box(2.2, 1.8, .72, -4.8, .9, .2, materials.cover);
    box(2.2, 1.8, .72, 4.8, .9, -.2, materials.cover);
    for (const x of [-3, 3]) box(.42, .12, .78, x, .78, 4.25, materials.amber);

    // The grid is sufficient route language; multiple floor rings looked like
    // overlapping spawn/debug markers. Keep one explicit object—the target.
    const target = new THREE.Group();
    target.name = 'tutorial-shooting-target';
    box(2.2, 1.3, .16, 0, 1.75, -8.68, materials.red, target);
    box(.75, .75, .18, 0, 1.75, -8.58, materials.wallInset, target);
    this.group.add(target);

    // Recessed ceiling fixtures and restrained local lights keep targets legible
    // without exposing the sky or flattening the room with ambient brightness.
    for (const x of [-4.5, 0, 4.5]) {
      box(2.7, .055, .7, x, 3.92, 0, materials.light);
      const light = new THREE.PointLight(0xd9fff0, 5.2, 12, 1.55);
      light.position.set(x, 3.72, 0);
      light.castShadow = false;
      this.group.add(light);
    }
    box(2.4, .055, .7, -5.2, 3.92, 3, materials.light);
    const combatKey = new THREE.PointLight(0xffd8cb, 4.6, 8, 1.5);
    combatKey.name = 'tutorial-combat-key';
    combatKey.position.set(-5.2, 3.68, 3);
    combatKey.castShadow = false;
    this.group.add(combatKey);
    box(11, .1, .12, 0, 3.35, -8.7, materials.red);
    box(11, .1, .12, 0, 3.35, 8.7, materials.cyan);
  }

  _buildBlackoutCisternGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0x101917, roughness: .88, metalness: .12 }),
      inset: new THREE.MeshStandardMaterial({ color: 0x07100f, roughness: .94, metalness: .08 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x172321, roughness: .9, metalness: .12 }),
      cyan: new THREE.MeshBasicMaterial({ color: 0x55ded5, transparent: true, opacity: .35, depthWrite: false }),
      amber: new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: .4, depthWrite: false }),
      dark: new THREE.MeshBasicMaterial({ color: 0x010605, transparent: true, opacity: .7, depthWrite: false })
    };
    this.cisternMaterials = materials;

    const floor = new THREE.Mesh(new THREE.CircleGeometry(28.65, 64), materials.floor);
    floor.name = 'cistern-arena-floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = .014;
    floor.receiveShadow = true;
    this.group.add(floor);

    const outerInset = new THREE.Mesh(new THREE.RingGeometry(10.2, 28.55, 64), materials.inset);
    outerInset.name = 'cistern-dark-falloff';
    outerInset.rotation.x = -Math.PI / 2;
    outerInset.position.y = .026;
    outerInset.receiveShadow = true;
    this.group.add(outerInset);

    for (let sector = 0; sector < 6; sector += 1) {
      const angle = -Math.PI + sector * Math.PI / 3;
      const material = sector % 2 ? materials.cyan : materials.amber;
      const lane = new THREE.Mesh(new THREE.RingGeometry(18.5, 27.6, 28, 1, angle + .04, Math.PI / 3 - .08), material);
      lane.name = `cistern-dark-sector-${sector + 1}`;
      lane.rotation.x = -Math.PI / 2;
      lane.position.y = .041;
      lane.material = material.clone();
      lane.material.opacity = .07;
      this.group.add(lane);

      const marker = new THREE.Mesh(new THREE.RingGeometry(22.9, 24.15, 18, 1, angle + .35, .34), material);
      marker.name = `cistern-spawn-sector-marker-${sector + 1}`;
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = .052;
      this.group.add(marker);
    }

    const boundaryData = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI * 2 / 16;
      return [Math.cos(angle) * 28.7, Math.sin(angle) * 28.7, -angle - Math.PI / 2];
    });
    const boundary = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, boundaryData.length);
    boundary.name = 'cistern-visible-circular-boundary';
    const boundaryDummy = new THREE.Object3D();
    boundaryData.forEach(([x, z, yaw], index) => {
      boundaryDummy.position.set(x, .72, z);
      boundaryDummy.rotation.set(0, yaw, 0);
      boundaryDummy.scale.set(11.35, 1.44, 1.1);
      boundaryDummy.updateMatrix();
      boundary.setMatrixAt(index, boundaryDummy.matrix);
    });
    boundary.receiveShadow = true;
    this.group.add(boundary);

    const threatMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7855,
      transparent: true,
      opacity: .58,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true
    });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.6, .77, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'cistern-role-readability-rings';
    this.enemyReadabilityMesh.userData.roleColors = {
      grunt: new THREE.Color(0x64a8db),
      gruntling: new THREE.Color(0x87badd),
      rusher: new THREE.Color(0xff8a3d),
      tank: new THREE.Color(0x5d91e8),
      flyer: new THREE.Color(0xb47aff),
      pelican: new THREE.Color(0xf2a12c),
      healer: new THREE.Color(0x67ef7b),
      warden: new THREE.Color(0x42e6dc)
    };
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(.72, 18), materials.dark, 96);
    this.enemyContactShadowMesh.name = 'cistern-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildFloodgateContinuityGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x20282a, roughness: .93, metalness: .06 }),
      deck: new THREE.MeshStandardMaterial({ color: 0x465154, roughness: .84, metalness: .1 }),
      channel: new THREE.MeshStandardMaterial({ color: 0x303b3d, roughness: .72, metalness: .14 }),
      bridge: new THREE.MeshStandardMaterial({ color: 0x687274, roughness: .7, metalness: .18 }),
      west: new THREE.MeshStandardMaterial({ color: 0xe4b44e, emissive: 0x4b3209, emissiveIntensity: .82, roughness: .5 }),
      center: new THREE.MeshStandardMaterial({ color: 0x54d8d4, emissive: 0x104f51, emissiveIntensity: .86, roughness: .42 }),
      east: new THREE.MeshStandardMaterial({ color: 0x9e83ef, emissive: 0x36236f, emissiveIntensity: .82, roughness: .42 }),
      water: new THREE.MeshStandardMaterial({ color: 0x287985, emissive: 0x092c33, emissiveIntensity: .42, roughness: .18, metalness: .12, transparent: true, opacity: .68, depthWrite: false }),
      waterHigh: new THREE.MeshStandardMaterial({ color: 0x286a78, emissive: 0x08282f, emissiveIntensity: .35, roughness: .2, metalness: .1, transparent: true, opacity: .52, depthWrite: false }),
      warning: new THREE.MeshStandardMaterial({ color: 0xff714f, emissive: 0x6e180b, emissiveIntensity: 1.12, roughness: .4 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x303a3c, roughness: .88, metalness: .08 }),
      shadow: new THREE.MeshBasicMaterial({ color: 0x071011, transparent: true, opacity: .3, depthWrite: false })
    };
    this.floodgateMaterials = materials;
    const slab = (width, depth, x, z, material, y = .02, name = '') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .06, depth), material);
      mesh.name = name; mesh.position.set(x, y, z); mesh.receiveShadow = true; this.group.add(mesh); return mesh;
    };
    const ring = (x, z, inner, outer, material, name) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), material);
      mesh.name = name; mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .145, z); this.group.add(mesh); return mesh;
    };
    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, yaw = 0, visible = true) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.set(-Math.PI / 2, 0, yaw);
      pool.position.set(x, .147, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };
    const dummy = new THREE.Object3D();

    // Complete base prevents the top view from exposing gaps when water and
    // chapter dressing change. The west route is always dry; the center is a
    // low channel and the east route reads as an elevated maintenance deck.
    slab(76, 66, 0, 0, materials.foundation, .005, 'floodgate-foundation');
    slab(22, 63, -25, 0, materials.deck, .085, 'floodgate-west-dry-route');
    slab(16, 63, 0, 0, materials.channel, .045, 'floodgate-central-channel');
    slab(22, 63, 25, 0, materials.deck, .16, 'floodgate-east-service-route');
    for (const z of [-16, 0, 16]) slab(58, 6.8, 0, z, materials.bridge, .19, `floodgate-crossing-${z}`);

    [-22, 0, 22].forEach((x, routeIndex) => {
      const routeMaterial = [materials.west, materials.center, materials.east][routeIndex];
      for (let z = -28; z <= 28; z += 5.6) slab(.3, 2.7, x, z, routeMaterial, .235, `floodgate-route-mark-${routeIndex}-${z}`);

      // Five diffused breadcrumbs keep the three authored routes legible
      // through gallery and vault fog. They are shader decals rather than
      // realtime lights, so all fifteen markers cost only three draw calls.
      const routeColors = [0xe4b44e, 0x61e4df, 0xaa91f4];
      const glows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), radialMaterial(routeColors[routeIndex], .055), 5);
      glows.name = `floodgate-route-glows-${routeIndex + 1}`;
      glows.userData.baseOpacity = .055;
      for (let index = 0; index < 5; index += 1) {
        dummy.position.set(x, .146, 24 - index * 12);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1.55, 1.85, 1);
        dummy.updateMatrix();
        glows.setMatrixAt(index, dummy.matrix);
      }
      glows.renderOrder = 2;
      this.group.add(glows);
    });

    const water = slab(15.4, 62, 0, 0, materials.water, .12, 'floodgate-channel-water');
    water.renderOrder = 2;
    const westOverflow = slab(9.5, 61, -12.5, 0, materials.waterHigh, .13, 'floodgate-west-overflow');
    const eastOverflow = slab(9.5, 61, 12.5, 0, materials.waterHigh, .13, 'floodgate-east-overflow');
    westOverflow.visible = false; eastOverflow.visible = false;

    const currentMaterial = new THREE.MeshBasicMaterial({ color: 0x7de8e2, transparent: true, opacity: .4, depthWrite: false });
    const currents = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .02, 3.4), currentMaterial, 24);
    currents.name = 'floodgate-current-streaks';
    for (let index = 0; index < 24; index += 1) {
      dummy.position.set(-6 + (index % 6) * 2.4, .17, -28 + Math.floor(index / 6) * 18.5);
      dummy.rotation.set(0, (index % 3 - 1) * .05, 0); dummy.scale.set(1, 1, .75 + (index % 4) * .15); dummy.updateMatrix();
      currents.setMatrixAt(index, dummy.matrix);
    }
    currents.renderOrder = 3; this.group.add(currents);

    const mediumBarrier = slab(12, 1.15, 0, 0, materials.warning, .66, 'floodgate-medium-visible-lock');
    const highBarrier = slab(9, 1.15, 22, 14, materials.warning, .66, 'floodgate-high-visible-lock');
    mediumBarrier.scale.y = 18; highBarrier.scale.y = 18;
    mediumBarrier.visible = false; highBarrier.visible = false;

    const perimeterData = [[0, .75, -32.5, 76, 1.5, 1], [0, .75, 32.5, 76, 1.5, 1], [-37.5, .75, 0, 1, 1.5, 66], [37.5, .75, 0, 1, 1.5, 66]];
    const perimeter = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, 4);
    perimeter.name = 'floodgate-visible-boundary';
    perimeterData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); perimeter.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(perimeter);

    for (const [index, target] of (this.definition.objectives?.handshakeRelays || []).entries()) ring(target.position[0], target.position[1], target.radius - .25, target.radius, index ? materials.east : materials.west, `floodgate-handshake-ring-${index + 1}`).visible = false;
    for (const [index, target] of (this.definition.objectives?.pumpControls || []).entries()) ring(target.position[0], target.position[1], target.radius - .25, target.radius, [materials.west, materials.center, materials.east][index], `floodgate-pump-ring-${index + 1}`).visible = false;
    for (const [index, target] of (this.definition.objectives?.archiveSeeds || []).entries()) ring(target.position[0], target.position[1], target.radius - .25, target.radius, materials.east, `floodgate-seed-ring-${index + 1}`).visible = false;
    const core = this.definition.objectives?.masterOverride;
    if (core) ring(core.position[0], core.position[1], core.radius - .3, core.radius, materials.warning, 'floodgate-core-ring').visible = false;

    // The two portable lightmasts own the broad combat keys. Source positions
    // follow the visible four-lamp bars after the model's internal -.18 yaw,
    // placement yaw, and .85 scale. Wide penumbrae avoid hard theatrical cones.
    const mastSources = [
      [-33.762, 4.02, -17.957, -24, -18],
      [33.762, 4.02, -18.043, 24, -18]
    ];
    mastSources.forEach(([x, y, z, targetX, targetZ], index) => {
      addPool(`floodgate-mast-pool-${index + 1}`, targetX, targetZ, 5.5, 6.5, 0xffd49b, .095);
      const target = new THREE.Object3D();
      target.name = `floodgate-mast-target-${index + 1}`;
      target.position.set(targetX, .12, targetZ);
      this.group.add(target);
      const key = new THREE.SpotLight(0xffd8a7, 5.7, 20, .62, .92, 1.75);
      key.name = `floodgate-mast-key-${index + 1}`;
      key.position.set(x, y, z);
      key.target = target;
      key.castShadow = false;
      key.userData.baseIntensity = 5.7;
      this.group.add(key);
    });

    // The active floodgate status strip previews the next water state. Its key
    // is placed on the modeled strip (4.62 m high, .79 m forward, scale 1.12),
    // never in unsupported air above the landmark.
    addPool('floodgate-gate-pool', 0, -25.2, 5.8, 4.4, 0x76e4dd, .105);
    const gateKey = new THREE.PointLight(0x8cece4, 2.9, 15, 2);
    gateKey.name = 'floodgate-gate-status-key';
    gateKey.position.set(0, 5.174, -26.115);
    gateKey.castShadow = false;
    gateKey.userData.baseIntensity = 2.9;
    this.group.add(gateKey);

    // Objective pools remain floor-bound and appear only for their encounter.
    // Pump previews stay dim between objectives so players can read the next
    // water route without turning all three controls into competing keys.
    [-22, 22].forEach((x, index) => addPool(`floodgate-handshake-pool-${index + 1}`, x, -16, 4.4, 4.4, index ? 0xaa91f4 : 0xe4b44e, 0, 0, false));
    [-22, 0, 22].forEach((x, index) => addPool(`floodgate-pump-pool-${index + 1}`, x, 0, 4.2, 4.2, [0xe4b44e, 0x61e4df, 0xaa91f4][index], .035));
    [-14, 0, 14].forEach((x, index) => {
      addPool(`floodgate-seed-pool-${index + 1}`, x, 8, 4.1, 4.1, 0xb398ff, 0, 0, false);
      const key = new THREE.PointLight(0xb9a3ff, 0, 10.5, 2);
      key.name = `floodgate-seed-key-${index + 1}`;
      key.position.set(x, 2.61, 8);
      key.castShadow = false;
      key.visible = false;
      key.userData.baseIntensity = 0;
      this.group.add(key);
    });
    addPool('floodgate-core-pool', 0, -18, 6.1, 6.1, 0x72e5df, 0, 0, false);
    const coreKey = new THREE.PointLight(0x8ff4ec, 0, 15, 2);
    coreKey.name = 'floodgate-greywater-core-key';
    coreKey.position.set(0, 4.568, -18);
    coreKey.castShadow = false;
    coreKey.visible = false;
    coreKey.userData.baseIntensity = 0;
    this.group.add(coreKey);

    // One instanced feathered pass grounds permanent machinery and recovery
    // pockets without shadow maps inside the 29-enemy endurance budget.
    const staticContacts = [
      [0, -27, 3.2, 2.1], [-25.5, -10, 3.5, 3.1], [25.5, -10, 3.5, 3.1],
      [0, -9, 4.1, 2.1], [0, 10, 4.1, 2.1], [-31, 9, 2.1, 2.5], [31, 9, 2.1, 2.5],
      [-30, 23, 1.8, 1.8], [30, 23, 1.8, 1.8], [-18, 23, 2.3, 1.7], [18, 23, 2.3, 1.7],
      [-13, -6, 2.0, 1.2], [13, -6, 2.0, 1.2], [-13, 16, 1.8, 1.4], [13, 16, 1.8, 1.4],
      [-34, -18, 1.35, 1.05], [34, -18, 1.35, 1.05]
    ];
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), radialMaterial(0x061012, .32), staticContacts.length);
    staticContactMesh.name = 'floodgate-static-contact-shadows';
    staticContacts.forEach(([x, z, width, depth], index) => {
      dummy.position.set(x, .143, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(width, depth, 1);
      dummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, dummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff725c, transparent: true, opacity: .84, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .78, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'floodgate-enemy-readability-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.enemyReadabilityMesh.frustumCulled = false; this.enemyReadabilityMesh.count = 0; this.group.add(this.enemyReadabilityMesh);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), radialMaterial(0x061012, .36), 96);
    this.enemyContactShadowMesh.name = 'floodgate-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.enemyContactShadowMesh.frustumCulled = false; this.enemyContactShadowMesh.count = 0; this.group.add(this.enemyContactShadowMesh);
  }

  _buildSandstormExpanseGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      sand: new THREE.MeshStandardMaterial({ color: 0x62563c, roughness: .99 }),
      hardpan: new THREE.MeshStandardMaterial({ color: 0x4b4637, roughness: .96 }),
      lane: new THREE.MeshStandardMaterial({ color: 0x41453d, emissive: 0x11130e, emissiveIntensity: .24, roughness: .9, metalness: .03 }),
      shelter: new THREE.MeshStandardMaterial({ color: 0x625d4a, roughness: .95 }),
      berm: new THREE.MeshStandardMaterial({ color: 0x746346, roughness: 1 }),
      shadow: new THREE.MeshBasicMaterial({ color: 0x171a16, transparent: true, opacity: .2, depthWrite: false }),
      west: new THREE.MeshStandardMaterial({ color: 0x4aaea5, emissive: 0x123e3b, emissiveIntensity: .75, roughness: .55 }),
      center: new THREE.MeshStandardMaterial({ color: 0xd2a13d, emissive: 0x54380a, emissiveIntensity: .86, roughness: .52 }),
      east: new THREE.MeshStandardMaterial({ color: 0xd16445, emissive: 0x551b0d, emissiveIntensity: .82, roughness: .54 }),
      warning: new THREE.MeshBasicMaterial({ color: 0xffb94e, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide }),
      dust: new THREE.MeshBasicMaterial({ color: 0xd9bd7c, transparent: true, opacity: .16, depthWrite: false })
    };
    this.expanseMaterials = materials;

    const slab = (width, depth, x, z, material, y = .02, yaw = 0, name = '') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .05, depth), material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const ring = (x, z, inner, outer, material, name) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, .105, z);
      this.group.add(mesh);
      return mesh;
    };
    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, yaw = 0, visible = true) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.set(-Math.PI / 2, 0, yaw);
      pool.position.set(x, .147, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };
    const dummy = new THREE.Object3D();

    // Full nested slabs eliminate clipped triangles and exposed voids in the
    // top view. All other ground language sits above these complete surfaces.
    slab(72, 60, 0, 0, materials.sand, .005, 0, 'expanse-foundation');
    slab(68, 56, 0, 0, materials.hardpan, .035, 0, 'expanse-hardpan');

    // Three unmistakable routes survive the short visibility envelope. The
    // cross-lines create loops and always lead back to a shelter pocket.
    [-22, 0, 22].forEach((x, index) => {
      slab(8.2, 54, x, 0, materials.lane, .07, 0, `expanse-route-${index + 1}`);
      const routeMaterial = [materials.west, materials.center, materials.east][index];
      for (let z = -24; z <= 24; z += 5.5) slab(.28, 2.5, x, z, routeMaterial, .112);
    });
    slab(52, 7.6, 0, -11, materials.lane, .071, 0, 'expanse-north-crossline');
    slab(52, 7.6, 0, 14.5, materials.lane, .071, 0, 'expanse-south-crossline');
    slab(11, 9, -24, 16, materials.shelter, .09, 0, 'expanse-west-shelter-pad');
    slab(11, 9, 24, 16, materials.shelter, .09, 0, 'expanse-east-shelter-pad');

    // Route pylons create a visible breadcrumb every twelve metres. They are
    // decorative, waist-low, and non-colliding, so fog never hides all three
    // destinations at once or creates an unexplained traversal blocker.
    [-22, 0, 22].forEach((x, routeIndex) => {
      const pylonMaterial = [materials.west, materials.center, materials.east][routeIndex];
      const pylons = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .2, .72, 8), pylonMaterial, 5);
      pylons.name = `expanse-route-pylons-${routeIndex + 1}`;
      for (let index = 0; index < 5; index += 1) {
        dummy.position.set(x, .43, 22 - index * 11); dummy.rotation.set(0, index * .35, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        pylons.setMatrixAt(index, dummy.matrix);
      }
      this.group.add(pylons);

      // Five feathered patches per route keep the next breadcrumb readable at
      // the authored 12 m heavy-storm range. They are instanced shader decals,
      // not realtime lights, so fifteen markers cost only three draw calls.
      const glowColors = [0x67dcd3, 0xf0bd58, 0xee7b59];
      const pylonGlows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), radialMaterial(glowColors[routeIndex], .052), 5);
      pylonGlows.name = `expanse-route-pylon-glows-${routeIndex + 1}`;
      pylonGlows.userData.calmOpacity = .052;
      pylonGlows.userData.heavyOpacity = .078;
      for (let index = 0; index < 5; index += 1) {
        dummy.position.set(x, .146, 22 - index * 11);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1.55, 1.55, 1);
        dummy.updateMatrix();
        pylonGlows.setMatrixAt(index, dummy.matrix);
      }
      pylonGlows.renderOrder = 2;
      this.group.add(pylonGlows);
    });

    // Soft-edged sand shelves interrupt the regularity but do not become
    // collision or split the clear authored lanes.
    const drifts = [
      [-32, -21, 7.5, 3.8, .18], [-31, 23, 8.5, 4.2, -.1], [32, -21, 7.8, 4, -.14], [31, 23, 8.4, 4.4, .12],
      [-12, -1, 6.5, 2.6, .28], [12, -1, 6.3, 2.8, -.25], [-11, 9, 5.7, 2.4, -.18], [11, 9, 5.9, 2.5, .2]
    ];
    const driftMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.14, .13, 14), materials.berm, drifts.length);
    driftMesh.name = 'expanse-sand-drifts';
    drifts.forEach(([x, z, sx, sz, yaw], index) => {
      dummy.position.set(x, .13, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(sx, 1, sz); dummy.updateMatrix();
      driftMesh.setMatrixAt(index, dummy.matrix);
    });
    driftMesh.receiveShadow = true;
    this.group.add(driftMesh);

    // A visible continuous berm honestly communicates the collision boundary.
    const perimeter = [[0, .62, -29.5, 72, 1.2, 1], [0, .62, 29.5, 72, 1.2, 1], [-35.5, .62, 0, 1, 1.2, 60], [35.5, .62, 0, 1, 1.2, 60]];
    const perimeterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.berm, perimeter.length);
    perimeterMesh.name = 'expanse-visible-boundary';
    perimeter.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      perimeterMesh.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(perimeterMesh);

    [-22, 0, 22].forEach((x, index) => ring(x, -18, 2.45, 2.8, [materials.west, materials.center, materials.east][index], `expanse-beacon-ring-${index + 1}`));
    ring(-24, 16, 4, 4.35, materials.west, 'expanse-supply-hold-ring').visible = false;
    ring(-22, -2, 3.05, 3.35, materials.warning, 'expanse-failure-ring-1').visible = false;
    ring(22, -2, 3.05, 3.35, materials.warning, 'expanse-failure-ring-2').visible = false;

    // The three route keys sit inside the modeled storm-eye cores
    // (5.18 * .92 = 4.77 m). Fixed route colors survive every gust state.
    const beaconColors = [0x70e8df, 0xffcc70, 0xff8a66];
    [-22, 0, 22].forEach((x, index) => {
      addPool(`expanse-beacon-pool-${index + 1}`, x, -18, 4.2, 4.2, beaconColors[index], .1);
      const key = new THREE.PointLight(beaconColors[index], 2.45, 12.5, 2);
      key.name = `expanse-beacon-key-${index + 1}`;
      key.position.set(x, 4.77, -18);
      key.castShadow = false;
      key.userData.calmIntensity = 2.45;
      key.userData.heavyIntensity = 3.25;
      this.group.add(key);
    });

    // The siren's red cap owns the warning key at y=7.12 * 1.18. Its pool is
    // amber-red and low to the ground, preserving the storm's black silhouette.
    addPool('expanse-siren-pool', 0, -20.5, 5.3, 5.3, 0xff8257, .09);
    const sirenKey = new THREE.PointLight(0xff7656, 2.0, 13, 2);
    sirenKey.name = 'expanse-storm-siren-key';
    sirenKey.position.set(0, 8.4, -20.5);
    sirenKey.castShadow = false;
    sirenKey.userData.calmIntensity = 2.0;
    sirenKey.userData.heavyIntensity = 3.25;
    this.group.add(sirenKey);

    // Side lightmasts follow their actual visible facing. The west mast throws
    // inward/south toward its supply pocket; the east mast throws inward/north
    // toward the approach, matching the shared model's internal -.18 yaw.
    const mastSources = [
      [-33.77, 3.88, 14.04, -24.16, 15.79, 1.39],
      [33.77, 3.88, 13.96, 24.16, 12.21, -1.75]
    ];
    mastSources.forEach(([x, y, z, targetX, targetZ, yaw], index) => {
      addPool(`expanse-mast-pool-${index + 1}`, targetX, targetZ, 5.0, 4.2, 0xffd295, .105, yaw);
      const target = new THREE.Object3D();
      target.name = `expanse-mast-target-${index + 1}`;
      target.position.set(targetX, .12, targetZ);
      this.group.add(target);
      const key = new THREE.SpotLight(0xffd9a2, 5.1, 17, .62, .92, 1.75);
      key.name = `expanse-mast-key-${index + 1}`;
      key.position.set(x, y, z);
      key.target = target;
      key.castShadow = false;
      key.userData.calmIntensity = 5.1;
      key.userData.heavyIntensity = 5.8;
      this.group.add(key);
    });

    // Objective lighting is phase-owned and remains floor-bound. Failure
    // markers use warm warning pools; completion is sourced by the monument core.
    addPool('expanse-supply-hold-pool', -24, 16, 5.2, 5.2, 0x6be2d3, 0, 0, false);
    addPool('expanse-failure-pool-1', -22, -2, 3.8, 3.8, 0xffb34f, 0, 0, false);
    addPool('expanse-failure-pool-2', 22, -2, 3.8, 3.8, 0xffb34f, 0, 0, false);
    addPool('expanse-monument-pool', 0, 20.5, 5.3, 5.3, 0xc8f47e, 0, 0, false);
    const monumentKey = new THREE.PointLight(0xd9ff9b, 0, 14, 2);
    monumentKey.name = 'expanse-endurance-monument-key';
    monumentKey.position.set(0, 4.61, 20.5);
    monumentKey.castShadow = false;
    monumentKey.visible = false;
    monumentKey.userData.calmIntensity = 0;
    monumentKey.userData.heavyIntensity = 0;
    this.group.add(monumentKey);

    // Moving streaks are one draw call. Their opacity and direction change
    // with gust state, making the weather legible before visibility closes.
    const streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.8, .08), materials.dust, 52);
    streaks.name = 'expanse-ground-gusts';
    for (let index = 0; index < 52; index += 1) {
      const x = -33 + ((index * 17) % 67);
      const z = -27 + ((index * 29) % 55);
      dummy.position.set(x, .14 + (index % 3) * .025, z);
      dummy.rotation.set(-Math.PI / 2, 0, -.32 + (index % 5) * .035);
      dummy.scale.set(.65 + (index % 4) * .22, 1, 1);
      dummy.updateMatrix(); streaks.setMatrixAt(index, dummy.matrix);
    }
    streaks.renderOrder = 3;
    this.group.add(streaks);

    // One feathered instanced pass grounds the permanent shelter, cover, and
    // route hardware without adding shadow maps inside the 26-enemy budget.
    const staticContacts = [
      [0, -20.5, 2.0, 2.0, 0], [-22, -18, 1.55, 1.55, 0], [0, -18, 1.55, 1.55, 0], [22, -18, 1.55, 1.55, 0],
      [-25, 13.5, 2.0, 3.5, 0], [25, 13.5, 2.0, 3.5, 0], [-29, 16.5, 2.8, 1.45, 0], [29, 16.5, 2.8, 1.45, 0],
      [-24, 16, 1.45, 1.55, 0], [24, 16, 1.45, 1.55, 0], [-20.5, 16, 2.0, 1.6, 0], [20.5, 16, 2.0, 1.6, 0],
      [-12, 18, 2.25, 1.35, 0], [12, 18, 2.25, 1.35, 0], [-12, -18, 2.35, 1.0, 0], [12, -18, 2.35, 1.0, 0],
      [-31, -7, 1.9, 2.8, 0], [31, -7, 1.9, 2.8, 0], [-32, 6, 1.4, 3.2, 0], [32, 6, 1.4, 3.2, 0],
      [-34, 14, 1.25, 1.0, 0], [34, 14, 1.25, 1.0, 0]
    ];
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), radialMaterial(0x11130f, .3), staticContacts.length);
    staticContactMesh.name = 'expanse-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth, yaw], index) => {
      contactDummy.position.set(x, .144, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, yaw);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff715c, transparent: true, opacity: .86, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .78, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'expanse-enemy-readability-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), radialMaterial(0x10130f, .34), 96);
    this.enemyContactShadowMesh.name = 'expanse-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildServerCathedralGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x171b27, roughness: .9, metalness: .12 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x303746, roughness: .78, metalness: .18 }),
      crossing: new THREE.MeshStandardMaterial({ color: 0x485263, roughness: .72, metalness: .22 }),
      loop: new THREE.MeshStandardMaterial({ color: 0x252c38, roughness: .75, metalness: .2 }),
      altar: new THREE.MeshStandardMaterial({ color: 0x242635, roughness: .56, metalness: .34 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x1d2431, roughness: .8, metalness: .22 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x55d8e0, emissive: 0x115a68, emissiveIntensity: .9, roughness: .34, metalness: .34 }),
      purple: new THREE.MeshStandardMaterial({ color: 0x9a7cff, emissive: 0x39226f, emissiveIntensity: .95, roughness: .32, metalness: .36 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xf1a24e, emissive: 0x733008, emissiveIntensity: .92, roughness: .36, metalness: .3 }),
      logic: new THREE.MeshStandardMaterial({ color: 0xe5ecff, emissive: 0x465986, emissiveIntensity: .72, roughness: .3, metalness: .36 }),
      threat: new THREE.MeshStandardMaterial({ color: 0xff6574, emissive: 0x82111e, emissiveIntensity: 1.1, roughness: .3, metalness: .28, transparent: true, opacity: .82 }),
      free: new THREE.MeshStandardMaterial({ color: 0x5ce8e2, emissive: 0x176a67, emissiveIntensity: 1.25, roughness: .28, metalness: .32 }),
      reset: new THREE.MeshStandardMaterial({ color: 0xff655f, emissive: 0x7d1610, emissiveIntensity: 1.25, roughness: .28, metalness: .32 })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = null;
    this.mirrorMaterials = null;
    this.courtMaterials = null;
    this.cathedralMaterials = materials;

    const plane = (width, depth, x, z, material, y = .02, name = '') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .04, depth), material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const ring = (inner, outer, material, name, x = 0, z = 0, y = .08) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const ringPoolMaterial = (inner, outer, color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying float vBand;
        void main() {
          vBand = (length(position.xy) - ${inner.toFixed(3)}) / ${(outer - inner).toFixed(3)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vBand;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float feather = sin(clamp(vBand, 0.0, 1.0) * 3.14159265);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, yaw = 0, visible = true) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 36), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.set(-Math.PI / 2, 0, yaw);
      pool.position.set(x, .142, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };
    const addRingPool = (name, inner, outer, color, opacity, visible = true) => {
      const pool = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), ringPoolMaterial(inner, outer, color, opacity));
      pool.name = name;
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = .141;
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };

    // Two continuous slabs guarantee a clean top view. The floor never depends
    // on decorative assets meeting perfectly at their modular edges.
    plane(64, 64, 0, 0, materials.foundation, .005, 'cathedral-foundation');
    plane(60, 60, 0, 0, materials.floor, .018, 'cathedral-nave-floor');

    // Complete perimeter loop and three full-length crosslinks prevent a gate
    // swap from producing a dead end. Lanes are drawn last and retain color.
    plane(58, 7.5, 0, -25, materials.loop, .038, 'cathedral-north-processional');
    plane(58, 7.5, 0, 25, materials.loop, .038, 'cathedral-south-processional');
    plane(7.5, 58, -25, 0, materials.loop, .038, 'cathedral-west-processional');
    plane(7.5, 58, 25, 0, materials.loop, .038, 'cathedral-east-processional');
    for (const [index, z] of [-15, 0, 15].entries()) {
      plane(52, 7.5, 0, z, materials.crossing, .048, `cathedral-logic-crossing-${index + 1}`);
    }
    const laneMaterials = [materials.cyan, materials.purple, materials.orange];
    const laneNames = ['cyan', 'purple', 'orange'];
    for (let index = 0; index < 3; index += 1) {
      const x = -13 + index * 13;
      plane(8, 58, x, 0, materials.loop, .055, `cathedral-${laneNames[index]}-nave`);
      plane(.22, 57, x, 0, laneMaterials[index], .082, `cathedral-${laneNames[index]}-route-line`);
      for (const z of [-22, -11, 0, 11, 22]) {
        plane(5.8, .24, x, z, laneMaterials[index], .083, `cathedral-${laneNames[index]}-threshold-${z}`);
      }
    }

    const centerFloor = new THREE.Mesh(new THREE.CylinderGeometry(18.6, 18.6, .08, 72), materials.altar);
    centerFloor.name = 'cathedral-algorithm-floor';
    centerFloor.position.y = .078;
    centerFloor.receiveShadow = true;
    this.group.add(centerFloor);
    const bossRing = ring(15.6, 16.05, materials.threat, 'cathedral-boss-ring', 0, 0, .124);
    bossRing.visible = false;

    // The north stained-dashboard windows project three broad, low-contrast
    // route-colored patches into the nave. They are shader-only so the glass
    // reads as a large architectural source without six extra realtime lights.
    const windowColors = [0x70e5e5, 0xaf93ff, 0xffb45f];
    [-20, 0, 20].forEach((x, index) => {
      addPool(`cathedral-window-pool-${index + 1}`, x, -24.2, 4.5, 7.2, windowColors[index], .1);
    });

    // Two modeled lightmasts own the nave keys. The light positions match the
    // authored four-lamp bars after their .9 placement scale and -.18 model yaw.
    // Wide penumbrae and matching feathered pools avoid theatrical hard cones.
    const mastSources = [
      [-26.046, 4.26, -24.748, -13, -14, 0xc9f7f4],
      [25.954, 4.26, -24.748, 13, -14, 0xffdda8]
    ];
    mastSources.forEach(([x, y, z, targetX, targetZ, color], index) => {
      addPool(`cathedral-mast-pool-${index + 1}`, targetX, targetZ, 5.2, 6.8, color, .105);
      const target = new THREE.Object3D();
      target.name = `cathedral-mast-target-${index + 1}`;
      target.position.set(targetX, .12, targetZ);
      this.group.add(target);
      const key = new THREE.SpotLight(color, 7.2, 24, .58, .9, 1.7);
      key.name = `cathedral-mast-key-${index + 1}`;
      key.position.set(x, y, z);
      key.target = target;
      key.castShadow = false;
      key.userData.baseIntensity = 7.2;
      this.group.add(key);
    });

    // Phase accents stay on the floor and remain subordinate to combat actors.
    // They are motivated by the modeled shutter panels and Mirror Choir emitters.
    addPool('cathedral-left-lock-pool', -13, 0, 4.4, 2.1, 0x72dff1, 0, 0, false);
    addPool('cathedral-right-lock-pool', 13, 0, 4.4, 2.1, 0xa78bff, 0, 0, false);
    addPool('cathedral-choir-pool-west', -23.8, -7.5, 4.4, 3.4, 0x9f83ef, 0, Math.PI / 2, false);
    addPool('cathedral-choir-pool-east', 23.8, -7.5, 4.4, 3.4, 0x75dfe0, 0, -Math.PI / 2, false);

    // Wave 39 targets share the exact 11 m bearings used by Algorithm Phase 1.
    [[5.5, 9.53], [5.5, -9.53], [-11, 0]].forEach(([x, z], index) => {
      const marker = ring(2.65, 3.02, laneMaterials[index], `cathedral-logic-node-ring-${index + 1}`, x, z, .126);
      marker.visible = false;
      addPool(`cathedral-logic-node-pool-${index + 1}`, x, z, 3.45, 3.45, windowColors[index], 0, 0, false);
    });

    // The Root Altar's modeled acid sphere and crossed cyan/purple rings own
    // the central key from Wave 39 onward (1.75 * 1.08 = 1.89 m source height).
    addPool('cathedral-root-altar-pool', 0, 0, 6.3, 6.3, 0xffcc80, 0, 0, false);
    const rootKey = new THREE.PointLight(0xffd08a, 0, 17, 2);
    rootKey.name = 'cathedral-root-core-key';
    rootKey.position.set(0, 1.89, 0);
    rootKey.castShadow = false;
    rootKey.visible = false;
    rootKey.userData.baseIntensity = 0;
    this.group.add(rootKey);

    // The Algorithm phase receives a floor-bound magenta pressure rim. The
    // boss's own eye light remains responsible for attack telegraphs.
    addRingPool('cathedral-algorithm-rim-pool', 12.2, 17.6, 0xff6574, 0, false);

    const falseTargets = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2 + .16;
      const radius = index % 2 ? 12.7 : 18.1;
      falseTargets.push([Math.cos(angle) * radius, Math.sin(angle) * radius, angle]);
    }
    const dummy = new THREE.Object3D();
    const choirGlyphs = new THREE.InstancedMesh(new THREE.RingGeometry(.58, .78, 20), materials.purple, falseTargets.length);
    choirGlyphs.name = 'cathedral-false-targets';
    falseTargets.forEach(([x, z, angle], index) => {
      dummy.position.set(x, .121, z);
      dummy.rotation.set(-Math.PI / 2, 0, angle);
      dummy.scale.setScalar(index % 3 ? 1 : 1.25);
      dummy.updateMatrix();
      choirGlyphs.setMatrixAt(index, dummy.matrix);
    });
    choirGlyphs.visible = false;
    this.group.add(choirGlyphs);

    const freeRing = ring(.78, 1.04, materials.free, 'cathedral-free-choice-ring', -1.15, 24, .132);
    const resetRing = ring(.78, 1.04, materials.reset, 'cathedral-reset-choice-ring', 1.15, 24, .132);
    freeRing.visible = false;
    resetRing.visible = false;
    addPool('cathedral-free-choice-pool', -1.15, 24, 2.1, 2.1, 0x5ce8e2, 0, 0, false);
    addPool('cathedral-reset-choice-pool', 1.15, 24, 2.1, 2.1, 0xff655f, 0, 0, false);
    const choiceKey = new THREE.PointLight(0xc8ffd1, 0, 10, 2);
    choiceKey.name = 'cathedral-choice-beacon-key';
    choiceKey.position.set(0, 3.0, 22.92);
    choiceKey.castShadow = false;
    choiceKey.visible = false;
    choiceKey.userData.baseIntensity = 0;
    this.group.add(choiceKey);

    // Existing south emergency-sign panels own restrained entry pools.
    addPool('cathedral-entry-pool-west', -11, 26.7, 3.8, 3.0, 0xcff4dc, .055, Math.PI);
    addPool('cathedral-entry-pool-east', 11, 26.7, 3.8, 3.0, 0xcff4dc, .055, Math.PI);

    // Visible walls exactly match all four collision boundaries, including the
    // corners. The player never meets an unexplained invisible perimeter.
    const boundaryData = [
      [0, .76, -31.5, 64, 1.52, 1], [0, .76, 31.5, 64, 1.52, 1],
      [-31.5, .76, 0, 1, 1.52, 64], [31.5, .76, 0, 1, 1.52, 64]
    ];
    const boundaries = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, boundaryData.length);
    boundaries.name = 'cathedral-visible-boundaries';
    boundaryData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      boundaries.setMatrixAt(index, dummy.matrix);
    });
    boundaries.castShadow = true;
    boundaries.receiveShadow = true;
    this.group.add(boundaries);

    // One instanced feathered pass grounds all permanent nave furniture. Phase
    // props use their own visibility-controlled pools, preventing orphan shadows.
    const staticContacts = [
      [-20, -29.5, 3.7, 1.9, 0], [0, -29.5, 3.7, 1.9, 0], [20, -29.5, 3.7, 1.9, 0],
      [-24.5, -17, 1.5, 1.9, 0], [24.5, -17, 1.5, 1.9, 0],
      [-24.5, 10.5, 1.8, 2.8, 0], [24.5, 10.5, 1.8, 2.8, 0],
      [-24.5, 22, 1.8, 2.4, 0], [24.5, 22, 1.8, 2.4, 0],
      [-26, -25, 1.3, 1.0, 0], [26, -25, 1.3, 1.0, 0],
      [-11, 29.5, 2.6, .72, 0], [11, 29.5, 2.6, .72, 0]
    ];
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), radialMaterial(0x050811, .32), staticContacts.length);
    staticContactMesh.name = 'cathedral-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth, yaw], index) => {
      contactDummy.position.set(x, .138, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, yaw);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff7180, transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .77, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'cathedral-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    const contactMaterial = radialMaterial(0x05070c, .36);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), contactMaterial, 96);
    this.enemyContactShadowMesh.name = 'cathedral-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildContentCourtGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: .96, metalness: .03 }),
      chamber: new THREE.MeshStandardMaterial({ color: 0x555860, roughness: .88, metalness: .08 }),
      loop: new THREE.MeshStandardMaterial({ color: 0x3d4149, roughness: .75, metalness: .16 }),
      aisle: new THREE.MeshStandardMaterial({ color: 0x85827c, roughness: .8, metalness: .06 }),
      center: new THREE.MeshStandardMaterial({ color: 0x343740, roughness: .62, metalness: .24 }),
      cyanSector: new THREE.MeshStandardMaterial({ color: 0x346c6e, emissive: 0x103b3d, emissiveIntensity: .42, roughness: .73, metalness: .12 }),
      orangeSector: new THREE.MeshStandardMaterial({ color: 0x76583b, emissive: 0x442407, emissiveIntensity: .42, roughness: .74, metalness: .1 }),
      purpleSector: new THREE.MeshStandardMaterial({ color: 0x5d4d72, emissive: 0x2f1c46, emissiveIntensity: .42, roughness: .72, metalness: .13 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: .86, metalness: .12 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xd0b45f, emissive: 0x493506, emissiveIntensity: .38, roughness: .48, metalness: .34 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x62d9d4, emissive: 0x135e60, emissiveIntensity: .92, roughness: .34, metalness: .26 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xe7a34b, emissive: 0x743307, emissiveIntensity: .96, roughness: .36, metalness: .24 }),
      purple: new THREE.MeshStandardMaterial({ color: 0xa987d4, emissive: 0x4b286c, emissiveIntensity: .96, roughness: .34, metalness: .26 }),
      strike: new THREE.MeshStandardMaterial({ color: 0xff655d, emissive: 0x87140f, emissiveIntensity: 1.2, roughness: .3, metalness: .24, transparent: true, opacity: .86 }),
      liberated: new THREE.MeshStandardMaterial({ color: 0xbce890, emissive: 0x356b21, emissiveIntensity: 1.0, roughness: .34, metalness: .18 })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = null;
    this.mirrorMaterials = null;
    this.courtMaterials = materials;

    const plane = (width, depth, x, z, material, y = .02, yaw = 0, name = '') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .04, depth), material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const ring = (inner, outer, material, name, y = .05) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const ringPoolMaterial = (inner, outer, color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying float vBand;
        void main() {
          vBand = (length(position.xy) - ${inner.toFixed(3)}) / ${(outer - inner).toFixed(3)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vBand;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float feather = sin(clamp(vBand, 0.0, 1.0) * 3.14159265);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, yaw = 0) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 36), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.set(-Math.PI / 2, 0, yaw);
      pool.position.set(x, .132, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };
    const addRingPool = (name, inner, outer, color, opacity, visible = true) => {
      const pool = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), ringPoolMaterial(inner, outer, color, opacity));
      pool.name = name;
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = .131;
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };

    // Every decorative layer rests on two complete slabs. Even when viewed
    // from above, no radial module can expose a void or clipped floor edge.
    plane(64, 60, 0, 0, materials.foundation, .005, 0, 'court-foundation');
    plane(60, 56, 0, 0, materials.chamber, .018, 0, 'court-chamber-floor');
    ring(22.15, 26.5, materials.loop, 'court-appeal-loop', .045);

    const sectorMaterials = [materials.cyanSector, materials.orangeSector, materials.purpleSector];
    const sectorNames = ['cyan', 'orange', 'purple'];
    for (let index = 0; index < 3; index += 1) {
      const sector = new THREE.Mesh(
        new THREE.RingGeometry(6.8, 22.15, 56, 1, index * Math.PI * 2 / 3 + .13, Math.PI * 2 / 3 - .26),
        sectorMaterials[index]
      );
      sector.name = `court-${sectorNames[index]}-sector`;
      sector.rotation.x = -Math.PI / 2;
      sector.position.y = .04;
      sector.receiveShadow = true;
      this.group.add(sector);
    }

    // Three broad, uninterrupted paths cross the sector wedges. Their eight
    // metre width is greater than the authored requirement and leaves space to
    // pass Citation mines laterally rather than entering the firing line.
    [Math.PI, Math.PI / 3, -Math.PI / 3].forEach((angle, index) => {
      const radius = 14.2;
      plane(8, 27.6, Math.sin(angle) * radius, Math.cos(angle) * radius, materials.aisle, .067, angle, `court-${sectorNames[index]}-aisle`);
      const route = plane(.18, 25.8, Math.sin(angle) * radius, Math.cos(angle) * radius, [materials.cyan, materials.orange, materials.purple][index], .094, angle, `court-${sectorNames[index]}-route-line`);
      route.castShadow = false;
    });

    const centerCourt = new THREE.Mesh(new THREE.CylinderGeometry(6.82, 6.82, .11, 64), materials.center);
    centerCourt.name = 'court-verdict-dais-floor';
    centerCourt.position.y = .09;
    centerCourt.receiveShadow = true;
    this.group.add(centerCourt);
    ring(13.7, 14.08, materials.strike, 'court-boss-ring', .106).visible = false;

    // The modeled verdict lectern owns the court's hero key. Its red lens sits
    // at local y=1.86 and is scaled to 2.05 m in the authored dais placement.
    // A broad, low-opacity pool reads as bounced light rather than a decal.
    addPool('court-dais-pool', 0, .2, 6.2, 5.4, 0xffddb0, .08);
    const daisKey = new THREE.PointLight(0xffddb0, 3.15, 15, 2);
    daisKey.name = 'court-verdict-lectern-key';
    daisKey.position.set(0, 2.05, .2);
    daisKey.castShadow = false;
    daisKey.userData.baseIntensity = 3.15;
    this.group.add(daisKey);

    // Purge destinations use distinct rings and short transverse thresholds.
    // They line up with the authored node families and remain visible through
    // the boss's red mine telegraphs.
    [Math.PI, Math.PI / 3, -Math.PI / 3].forEach((angle, index) => {
      const x = Math.sin(angle) * 20.5;
      const z = Math.cos(angle) * 20.5;
      const marker = new THREE.Mesh(new THREE.RingGeometry(2.65, 3.02, 36), [materials.cyan, materials.orange, materials.purple][index]);
      marker.name = `court-purge-node-ring-${index + 1}`;
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(x, .113, z);
      marker.userData.baseScale = 1;
      this.group.add(marker);
      plane(5.5, .32, x, z, materials.trim, .111, angle + Math.PI / 2, `court-purge-threshold-${index + 1}`);
    });

    // Each local key sits inside the visible illuminated core of its Purge Node
    // (model y=2.12, authored scale=.7 => 1.48 m). Fixed sector colors preserve
    // target priority even when the later strike phases turn the court red.
    const purgeSources = [
      [0, -20.5, 0x7ce8e0, 0, 4.4, 3.5],
      [17.75, 10.25, 0xffb968, -Math.PI * 2 / 3, 4.4, 3.5],
      [-17.75, 10.25, 0xc8a5ed, Math.PI * 2 / 3, 4.4, 3.5]
    ];
    purgeSources.forEach(([x, z, color, yaw, width, depth], index) => {
      addPool(`court-purge-node-pool-${index + 1}`, x, z, width, depth, color, .095, yaw);
      const key = new THREE.PointLight(color, 2.35, 9.5, 2);
      key.name = `court-purge-node-key-${index + 1}`;
      key.position.set(x, 1.48, z);
      key.castShadow = false;
      key.userData.baseIntensity = 2.35;
      this.group.add(key);
    });

    // The existing emergency-sign panels motivate the two spawn-side pools.
    // They remain shader-only so the bounded local-light budget stays at four.
    addPool('court-entry-pool-west', -12, 25.7, 3.9, 3.0, 0xdce89c, .058, Math.PI);
    addPool('court-entry-pool-east', 12, 25.7, 3.9, 3.0, 0xdce89c, .058, Math.PI);

    // Later strike pressure stays close to the floor. A feathered annulus gives
    // the Adjudicator a red rim without tinting bodies or filling the fog.
    addRingPool('court-strike-rim-pool', 11.6, 16.2, 0xff665e, 0, false);

    // A sparse radial strike grid arrives in later waves. It is floor language,
    // not collision, and therefore cannot create invisible traversal blockers.
    const strikeData = [];
    for (let spoke = 0; spoke < 18; spoke += 1) {
      const angle = spoke / 18 * Math.PI * 2;
      const radius = 17.6 + (spoke % 2) * 2.2;
      strikeData.push([Math.sin(angle) * radius, Math.cos(angle) * radius, angle, spoke % 3 ? 2.7 : 4.1]);
    }
    const dummy = new THREE.Object3D();
    const strikeGrid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .025, .12), materials.strike, strikeData.length);
    strikeGrid.name = 'court-strike-grid';
    strikeData.forEach(([x, z, angle, length], index) => {
      dummy.position.set(x, .123, z); dummy.rotation.set(0, angle, 0); dummy.scale.set(1, 1, length); dummy.updateMatrix();
      strikeGrid.setMatrixAt(index, dummy.matrix);
    });
    strikeGrid.visible = false;
    this.group.add(strikeGrid);

    // Visible low walls exactly match the four boundary colliders. Corners are
    // closed deliberately, preventing both scenery gaps and unexplained stops.
    const boundaryData = [
      [0, .7, -29.5, 64, 1.4, 1], [0, .7, 29.5, 64, 1.4, 1],
      [-31.5, .7, 0, 1, 1.4, 60], [31.5, .7, 0, 1, 1.4, 60]
    ];
    const boundaries = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, boundaryData.length);
    boundaries.name = 'court-visible-boundaries';
    boundaryData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      boundaries.setMatrixAt(index, dummy.matrix);
    });
    boundaries.castShadow = true;
    boundaries.receiveShadow = true;
    this.group.add(boundaries);

    // Cheap feathered grounding binds the large court props to the chamber.
    // The source list mirrors authored placements and introduces no draw-call
    // growth beyond one instanced mesh.
    const staticContacts = [
      [0, 0, 3.7, 3.25, 0],
      [0, -20.5, 3.1, 1.45, 0], [17.75, 10.25, 3.1, 1.45, -Math.PI * 2 / 3], [-17.75, 10.25, 3.1, 1.45, Math.PI * 2 / 3],
      [-12, 28.5, 2.6, .72, 0], [12, 28.5, 2.6, .72, 0],
      [-23.5, -12.5, 1.35, 3.35, 0], [23.5, -12.5, 1.35, 3.35, 0],
      [-22.5, 15.5, 1.35, 3.35, 0], [22.5, 15.5, 1.35, 3.35, 0],
      [-25, 2.5, 1.45, 1.9, 0], [25, 2.5, 1.45, 1.9, 0],
      [-14, -24, 1.75, 1.35, 0], [14, -24, 1.75, 1.35, 0],
      [-14, 24, 1.45, 1.45, 0], [14, 24, 1.45, 1.45, 0],
      [-25, 23, 1.45, 1.9, 0], [25, 23, 1.45, 1.9, 0]
    ];
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), radialMaterial(0x090b0f, .29), staticContacts.length);
    staticContactMesh.name = 'court-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth, yaw], index) => {
      contactDummy.position.set(x, .128, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, yaw);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff766f, transparent: true, opacity: .76, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .77, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'court-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    const enemyContactMaterial = radialMaterial(0x08090c, .34);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'court-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildMirrorGardenGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x263130, roughness: .96, metalness: .02 }),
      lawn: new THREE.MeshStandardMaterial({ color: 0x4c6658, roughness: .98, metalness: 0 }),
      path: new THREE.MeshStandardMaterial({ color: 0x909693, roughness: .72, metalness: .14 }),
      innerPath: new THREE.MeshStandardMaterial({ color: 0x5e6568, roughness: .68, metalness: .2 }),
      center: new THREE.MeshStandardMaterial({ color: 0x3d4850, roughness: .58, metalness: .3 }),
      hedge: new THREE.MeshStandardMaterial({ color: 0x304d3c, roughness: .96 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xaeb5ae, roughness: .86, metalness: .04 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x6fe1de, emissive: 0x145f61, emissiveIntensity: .8, roughness: .36, metalness: .28 }),
      purple: new THREE.MeshStandardMaterial({ color: 0xa984d2, emissive: 0x40245e, emissiveIntensity: .88, roughness: .35, metalness: .3 }),
      fracture: new THREE.MeshStandardMaterial({ color: 0xe5b8ff, emissive: 0x6d2f8f, emissiveIntensity: 1.1, roughness: .28, metalness: .32 }),
      boss: new THREE.MeshStandardMaterial({ color: 0xf084dd, emissive: 0x742463, emissiveIntensity: 1.25, roughness: .3, metalness: .28 })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = null;
    this.mirrorMaterials = materials;

    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const ring = (inner, outer, material, name, y = .04) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const radialMaterial = (color, opacity, blending = THREE.NormalBlending) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 localPosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            localPosition = instanceMatrix * localPosition;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * localPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const ringPoolMaterial = (inner, outer, color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying float vBand;
        void main() {
          vBand = (length(position.xy) - ${inner.toFixed(3)}) / ${(outer - inner).toFixed(3)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vBand;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float feather = sin(clamp(vBand, 0.0, 1.0) * 3.14159265);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, yaw = 0, visible = true) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 36), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.set(-Math.PI / 2, 0, yaw);
      pool.position.set(x, .062, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };
    const addRingPool = (name, inner, outer, color, opacity, visible = true) => {
      const pool = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), ringPoolMaterial(inner, outer, color, opacity));
      pool.name = name;
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = .058;
      pool.renderOrder = 2;
      pool.visible = visible;
      pool.userData.baseOpacity = opacity;
      this.group.add(pool);
      return pool;
    };

    // One uninterrupted garden slab, three complete concentric paths, and two
    // cardinal axes keep the top view coherent. Every path reaches the same
    // 32 m inner boundary, so no modular ends or clipped floor strips appear.
    plane(68, 68, 0, 0, materials.foundation, .008);
    plane(64, 64, 0, 0, materials.lawn, .016);
    plane(7.2, 64, 0, 0, materials.path, .027);
    plane(64, 7.2, 0, 0, materials.path, .028);
    ring(6.2, 10.2, materials.innerPath, 'mirror-inner-clone-loop', .035);
    ring(14.0, 18.2, materials.path, 'mirror-middle-reflection-loop', .036);
    ring(23.3, 27.8, materials.path, 'mirror-outer-garden-loop', .035);

    const centerCourt = new THREE.Mesh(new THREE.CylinderGeometry(6.25, 6.25, .08, 64), materials.center);
    centerCourt.name = 'mirror-center-court';
    centerCourt.position.y = .06;
    centerCourt.receiveShadow = true;
    this.group.add(centerCourt);
    const bossRing = ring(15.75, 16.15, materials.boss, 'mirror-boss-ring', .074);
    bossRing.visible = false;

    // Generation rings are introduced one at a time as the campaign approaches
    // Wave 30. They provide a stable visual scale reference for the lineage.
    [5.3, 11.9, 20.7].forEach((radius, index) => {
      const marker = ring(radius, radius + .18, index === 0 ? materials.cyan : index === 1 ? materials.purple : materials.fracture, `mirror-generation-ring-${index + 1}`, .071);
      marker.visible = index === 0;
    });

    const dummy = new THREE.Object3D();
    const boundaryData = [
      [0, .7, -33.5, 68, 1.4, 1], [0, .7, 33.5, 68, 1.4, 1],
      [-33.5, .7, 0, 1, 1.4, 68], [33.5, .7, 0, 1, 1.4, 68]
    ];
    const boundaries = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.hedge, boundaryData.length);
    boundaries.name = 'mirror-visible-boundaries';
    boundaryData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      boundaries.setMatrixAt(index, dummy.matrix);
    });
    boundaries.receiveShadow = true;
    this.group.add(boundaries);

    // Alternating low topiary beds make the outer loop feel planted while the
    // four cardinal openings and diagonals stay wide enough for clone traffic.
    const hedgeSegments = [];
    for (let index = 0; index < 32; index += 1) {
      if (index % 8 === 0 || index % 8 === 4) continue;
      const angle = index / 32 * Math.PI * 2;
      const radius = index % 2 ? 30.4 : 29.4;
      hedgeSegments.push([Math.cos(angle) * radius, Math.sin(angle) * radius, angle, index % 3 ? 2.9 : 2.15]);
    }
    const hedges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.hedge, hedgeSegments.length);
    hedges.name = 'mirror-formal-planting-beds';
    hedgeSegments.forEach(([x, z, angle, length], index) => {
      dummy.position.set(x, .38, z); dummy.rotation.set(0, -angle, 0); dummy.scale.set(length, .76, 1.25); dummy.updateMatrix();
      hedges.setMatrixAt(index, dummy.matrix);
    });
    hedges.castShadow = true;
    hedges.receiveShadow = true;
    this.group.add(hedges);

    // Small reflective floor shards grow toward the center during fracture
    // waves. An instanced strip is cheaper and clearer than transparent panels.
    const shardData = [];
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const angle = spoke / 12 * Math.PI * 2 + .12;
      for (let step = 0; step < 3; step += 1) {
        const radius = 9.4 + step * 5.1 + (spoke % 2) * .65;
        shardData.push([Math.cos(angle) * radius, Math.sin(angle) * radius, angle, .9 + step * .28]);
      }
    }
    const shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .025, .13), materials.fracture, shardData.length);
    shards.name = 'mirror-fracture-shards';
    shardData.forEach(([x, z, angle, length], index) => {
      dummy.position.set(x, .086, z); dummy.rotation.set(0, -angle, 0); dummy.scale.set(length, 1, 1); dummy.updateMatrix();
      shards.setMatrixAt(index, dummy.matrix);
    });
    shards.visible = false;
    this.group.add(shards);

    // Four modeled four-lamp bars own the garden keys. Their authored yaw aims
    // local +Z at the court; wide penumbrae and feathered pools keep the source
    // broad without introducing hard theatrical cones through the mirror fog.
    const mastPlacements = (this.definition?.assets || []).filter(placement => placement.asset === 'lightmast');
    mastPlacements.forEach(placement => {
      const [x, , z] = placement.position;
      const yaw = placement.yaw || 0;
      const scale = placement.scale || 1;
      const reach = 8.6 * scale;
      const poolX = x + Math.sin(yaw) * reach;
      const poolZ = z + Math.cos(yaw) * reach;
      const quadrant = `${z < 0 ? 'north' : 'south'}-${x < 0 ? 'west' : 'east'}`;
      addPool(`mirror-mast-pool-${quadrant}`, poolX, poolZ, 4.5 * scale, 5.6 * scale, 0xb7f4e8, .105, yaw);

      const target = new THREE.Object3D();
      target.name = `mirror-mast-target-${quadrant}`;
      target.position.set(poolX, .12, poolZ);
      this.group.add(target);
      const key = new THREE.SpotLight(0xc7fff3, 7.2, 17, .58, .88, 1.7);
      key.name = `mirror-mast-key-${quadrant}`;
      key.position.set(x + Math.sin(yaw) * .28 * scale, 4.73 * scale, z + Math.cos(yaw) * .28 * scale);
      key.target = target;
      key.castShadow = false;
      key.userData.baseIntensity = 7.2;
      this.group.add(key);
    });

    // The south navigation gantries own restrained entry pools. Their existing
    // emissive arrows remain the visible source and the light stays off the sky.
    addPool('mirror-entry-pool-west', -10, 27.1, 3.7, 3.0, 0xa9f6e8, .07, Math.PI);
    addPool('mirror-entry-pool-east', 10, 27.1, 3.7, 3.0, 0xbca5e7, .07, Math.PI);

    // Mirror panels receive lateral reflected spill while they physically block
    // the shortcuts. The pools disappear with the panels for the boss wave.
    addPool('mirror-threshold-pool-north', 0, -20.5, 4.7, 3.1, 0x80e5df, .09);
    addPool('mirror-threshold-pool-south', 0, 20.5, 4.7, 3.1, 0xb995df, .085, Math.PI);
    addPool('mirror-threshold-pool-west', -20.5, 0, 4.7, 3.1, 0x80e5df, .09, Math.PI / 2);
    addPool('mirror-threshold-pool-east', 20.5, 0, 4.7, 3.1, 0xb995df, .085, -Math.PI / 2);

    // Each clone generation gains a broad, low-contrast annular pool with its
    // authored ring. The colored floor remains a locator, not a blanket body tint.
    addRingPool('mirror-generation-pool-1', 3.25, 7.35, 0x7be5df, .068, true);
    addRingPool('mirror-generation-pool-2', 9.45, 14.35, 0xb497df, 0, false);
    addRingPool('mirror-generation-pool-3', 17.95, 23.45, 0xe6b8f2, 0, false);

    // Wave 30 turns the modeled Split Ring sphere into the hero source. The
    // cyan core lights bodies neutrally while the magenta band owns the phase.
    const bossCorePool = addPool('mirror-boss-core-pool', 0, 0, 6.2, 6.2, 0x9cf2e7, 0, 0, false);
    bossCorePool.position.y = .083;
    addRingPool('mirror-boss-rim-pool', 12.6, 18.15, 0xef83dc, 0, false);
    const bossKey = new THREE.PointLight(0xbff9ee, 0, 18, 2);
    bossKey.name = 'mirror-split-ring-key';
    bossKey.position.set(0, 1.25 * 1.22, 0);
    bossKey.castShadow = false;
    bossKey.visible = false;
    bossKey.userData.baseIntensity = 0;
    this.group.add(bossKey);

    // Static grounding is intentionally soft and cheap. Phase-hidden mirror
    // panels are omitted so no orphaned shadow remains after their shortcuts open.
    const staticContacts = [
      [-27, -27, 1.65, 1.25], [27, -27, 1.65, 1.25], [-27, 27, 1.65, 1.25], [27, 27, 1.65, 1.25],
      [-10, 31, 2.55, .8], [10, 31, 2.55, .8],
      [-23, -16, 3.35, 1.55], [23, -16, 3.35, 1.55], [-23, 16, 3.35, 1.55], [23, 16, 3.35, 1.55],
      [-29, 12, 2.2, 1.55], [29, -12, 3.0, 2.15], [-16, -28, 2.1, 1.5], [16, -28, 2.85, 2.05],
      [-18, 27.5, 2.1, 1.5], [16, 28, 2.85, 2.05],
      [-25, -7, 1.0, 2.65], [25, -7, 1.0, 2.75], [-25, 8, 1.75, 2.55], [25, 8, 1.0, 2.55],
      [-24, 23, 1.75, 1.35], [24, 23, 1.75, 1.35], [-24, -23, 1.45, 1.45], [24, -23, 1.45, 1.45],
      [-22, -31, 3.4, .9], [22, -31, 3.4, .9]
    ];
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), radialMaterial(0x0a1011, .27), staticContacts.length);
    staticContactMesh.name = 'mirror-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth], index) => {
      contactDummy.position.set(x, .067, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, 0);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b74, transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'mirror-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    const enemyContactMaterial = radialMaterial(0x080d10, .34);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'mirror-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildFreightGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x292c2c, roughness: .94, metalness: .04 }),
      yard: new THREE.MeshStandardMaterial({ color: 0x484a45, roughness: .9, metalness: .06 }),
      west: new THREE.MeshStandardMaterial({ color: 0x355b59, emissive: 0x092f2d, emissiveIntensity: .28, roughness: .84 }),
      center: new THREE.MeshStandardMaterial({ color: 0x68563a, emissive: 0x2b1908, emissiveIntensity: .3, roughness: .85 }),
      east: new THREE.MeshStandardMaterial({ color: 0x634338, emissive: 0x2d1008, emissiveIntensity: .3, roughness: .84 }),
      crossing: new THREE.MeshStandardMaterial({ color: 0x777368, roughness: .9, metalness: .03 }),
      dock: new THREE.MeshStandardMaterial({ color: 0x22292a, roughness: .76, metalness: .18 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x3a4140, roughness: .82, metalness: .14 }),
      route: new THREE.MeshStandardMaterial({ color: 0xf0a543, emissive: 0x653007, emissiveIntensity: .9, roughness: .48 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x44d2ca, emissive: 0x0a4c49, emissiveIntensity: .72, roughness: .5 }),
      goo: new THREE.MeshStandardMaterial({ color: 0x8aa52d, emissive: 0x283807, emissiveIntensity: .55, roughness: .58 }),
      boss: new THREE.MeshStandardMaterial({ color: 0xe36a3d, emissive: 0x651508, emissiveIntensity: 1.05, roughness: .46 }),
      fixtureHousing: new THREE.MeshStandardMaterial({ color: 0x171b1b, roughness: .66, metalness: .34 }),
      fixtureWarm: new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xff7a24, emissiveIntensity: 2.2, roughness: .3, metalness: .12 }),
      fixtureCyan: new THREE.MeshStandardMaterial({ color: 0x7de9e2, emissive: 0x1ca49e, emissiveIntensity: 1.8, roughness: .3, metalness: .12 }),
      fixtureWarning: new THREE.MeshStandardMaterial({ color: 0xff6844, emissive: 0xb51b08, emissiveIntensity: 1.35, roughness: .32, metalness: .1 }),
      fixtureInfected: new THREE.MeshStandardMaterial({ color: 0xc4d857, emissive: 0x708d0d, emissiveIntensity: 0, roughness: .36, metalness: .06 })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = null;
    this.freightMaterials = materials;
    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (width, height, depth, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    // A single continuous yard slab prevents the modular freight dressing from
    // producing exposed seams. Three lanes share identical endpoints and both
    // cross-routes span the exact sixty-metre inner yard width.
    plane(68, 64, 0, 0, materials.foundation, .008);
    plane(62, 58, 0, 0, materials.yard, .016);
    plane(12, 56, -22, 0, materials.west, .026);
    plane(19, 56, 0, 0, materials.center, .027);
    plane(12, 56, 22, 0, materials.east, .026);
    plane(60, 6.2, 0, -18, materials.crossing, .036);
    plane(60, 7.2, 0, 18, materials.crossing, .036);
    plane(60, .8, 0, -28.1, materials.crossing, .043);
    plane(60, .8, 0, 28.1, materials.crossing, .043);

    // Northern loading docks read as one built edge while retaining a wide
    // central gate and two enemy approach lanes.
    box(14, .42, 3.2, -22, .22, -25.8, materials.dock);
    box(14, .42, 3.2, 22, .22, -25.8, materials.dock);
    for (const x of [-28, -24, -20, -16, 16, 20, 24, 28]) {
      box(2.2, .04, .26, x, .465, -24.25, materials.route);
    }

    const court = new THREE.Mesh(new THREE.CylinderGeometry(13.15, 13.15, .075, 64), materials.dock);
    court.position.set(0, .063, -2);
    court.receiveShadow = true;
    this.group.add(court);
    const bossRing = new THREE.Mesh(new THREE.RingGeometry(12.45, 12.82, 64), materials.boss);
    bossRing.name = 'freight-boss-ring';
    bossRing.rotation.x = -Math.PI / 2;
    bossRing.position.set(0, .11, -2);
    this.group.add(bossRing);

    const dummy = new THREE.Object3D();
    const boundaryData = [
      [0, .85, -31.5, 68, 1.7, 1], [0, .85, 31.5, 68, 1.7, 1],
      [-33.5, .85, 0, 1, 1.7, 64], [33.5, .85, 0, 1, 1.7, 64]
    ];
    const boundaries = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, boundaryData.length);
    boundaries.name = 'freight-visible-boundaries';
    boundaryData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      boundaries.setMatrixAt(index, dummy.matrix);
    });
    boundaries.receiveShadow = true;
    this.group.add(boundaries);

    const routeData = [];
    for (const x of [-22, 0, 22]) {
      for (let z = -24; z <= 24; z += 6) routeData.push([x, z, x < 0 ? materials.cyan : materials.route]);
    }
    const westMarks = routeData.filter(([x]) => x < 0);
    const warmMarks = routeData.filter(([x]) => x >= 0);
    const addMarks = (data, material, name) => {
      const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .025, 2.15), material, data.length);
      marks.name = name;
      data.forEach(([x, z], index) => {
        dummy.position.set(x, .06, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        marks.setMatrixAt(index, dummy.matrix);
      });
      this.group.add(marks);
    };
    addMarks(westMarks, materials.cyan, 'freight-west-route-marks');
    addMarks(warmMarks, materials.route, 'freight-warm-route-marks');

    // Thin, low-cost infestation strips grow toward the boss breach from Wave
    // 23 onward. Their shared geometry keeps the visual escalation inexpensive.
    const veins = [];
    for (let index = 0; index < 28; index += 1) {
      const spoke = index % 7;
      const step = Math.floor(index / 7) + 1;
      const angle = spoke / 7 * Math.PI * 2 + step * .08;
      const radius = 3.4 + step * 3.1;
      veins.push([Math.cos(angle) * radius, -2 + Math.sin(angle) * radius, angle]);
    }
    const infection = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, .024, .13), materials.goo, veins.length);
    infection.name = 'freight-infection-veins';
    veins.forEach(([x, z, yaw], index) => {
      dummy.position.set(x, .082, z); dummy.rotation.set(0, -yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      infection.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(infection);

    const radialMaterial = (color, opacity, blending = THREE.NormalBlending) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const addPool = (name, x, z, width, depth, color, opacity, visible = true) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 36), radialMaterial(color, opacity));
      pool.name = name;
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, .094, z);
      pool.scale.set(width, depth, 1);
      pool.renderOrder = 2;
      pool.visible = visible;
      this.group.add(pool);
      return pool;
    };
    const addKey = (name, color, intensity, distance, x, y, z) => {
      const key = new THREE.PointLight(color, intensity, distance, 2);
      key.name = name;
      key.position.set(x, y, z);
      key.castShadow = false;
      key.userData.baseIntensity = intensity;
      this.group.add(key);
      return key;
    };
    const addFixtureBar = (name, x, y, z, width, yaw, lensMaterial) => {
      const fixture = new THREE.Group();
      fixture.name = name;
      fixture.position.set(x, y, z);
      fixture.rotation.y = yaw;
      const housing = box(width + .28, .34, .46, x, y, z, materials.fixtureHousing);
      housing.rotation.y = yaw;
      const lens = box(width, .13, .12, x + Math.sin(yaw) * .25, y - .12, z + Math.cos(yaw) * .25, lensMaterial);
      lens.name = `${name}-lens`;
      lens.rotation.y = yaw;
      fixture.userData.lightOwner = true;
      this.group.add(fixture);
      return fixture;
    };

    // A broad loading fixture is visibly attached to the cargo portal. Its
    // soft pool reaches into the yard without drawing a hard triangular beam.
    addFixtureBar('freight-loading-fixture', 0, 3.48, -25.92, 4.4, 0, materials.fixtureWarm);
    addPool('freight-loading-pool', 0, -21.2, 7.2, 6.1, 0xffc174, .15);
    addKey('freight-loading-key', 0xffbd72, 2.35, 17, 0, 3.18, -25.45);

    // These compact panel owners sit directly on the generator and cargo-lift
    // assemblies rather than introducing unsupported aerial light sources.
    addFixtureBar('freight-west-service-fixture', -21, 1.72, 14.05, 1.25, .08, materials.fixtureCyan);
    addPool('freight-west-service-pool', -21, 13.1, 4.6, 3.8, 0x62d8d0, .105);
    addKey('freight-west-service-key', 0x72e4dc, 1.45, 10.5, -21, 1.7, 14);
    addFixtureBar('freight-east-service-fixture', 26.82, 2.86, -5, 1.4, -Math.PI / 2, materials.fixtureWarm);
    addPool('freight-east-service-pool', 24.5, -5, 4.8, 3.7, 0xffb765, .11);
    addKey('freight-east-service-key', 0xffb15d, 1.55, 11, 26.55, 2.65, -5);

    // Ambush light is deliberately low and local: the source is the hatch lip
    // or vent header, so warning illumination never appears to float in fog.
    for (const x of [-12, 12]) {
      const lens = box(1.45, .1, .16, x, .17, 16.95, materials.fixtureWarning);
      lens.name = `freight-floor-hatch-lens-${x < 0 ? 'west' : 'east'}`;
    }
    addPool('freight-floor-hatch-pool', -12, 17.35, 3.6, 2.65, 0xff7048, .075);
    addKey('freight-floor-hatch-key', 0xff6744, .78, 7.5, -12, .34, 17.55);
    addFixtureBar('freight-rear-vent-fixture', 29.15, 2.82, -12, 1.65, -Math.PI / 2, materials.fixtureWarning);
    addPool('freight-rear-vent-pool', 26.7, -12, 4.2, 2.75, 0xff6b45, .07);
    addKey('freight-rear-vent-key', 0xff6845, .72, 7.5, 28.85, 1.35, -12);

    // Infection illumination is owned by the modeled eggs, machinery mouth and
    // breach. Every key stays close to the geometry and appears only with it.
    addPool('freight-infection-props-pool', 17.5, 20.5, 4.3, 3.5, 0xb7d84d, 0, false);
    addKey('freight-infection-key', 0xb8dc52, 0, 9.5, 17.5, .82, 20.5).visible = false;
    addPool('freight-nest-pool', 0, -18, 5.4, 4.2, 0xc4cf45, 0, false);
    addKey('freight-nest-key', 0xd3d553, 0, 11, 0, .72, -17.1).visible = false;
    addPool('freight-breach-pool', 0, -2, 10.8, 8.7, 0xff6e42, 0, false);
    addKey('freight-breach-key', 0xff7147, 0, 17.5, 0, .38, -2).visible = false;

    // Soft contact layers preserve grounding under dense freight fog without
    // paying for realtime shadows on every modular prop and enemy.
    const staticContacts = [
      [-22, -28, 6.8, 3.2], [22, -28, 6.8, 3.2], [0, -28, 4.1, 2.0],
      [-27, -2.5, 2.6, 6.3], [27, -.5, 2.6, 6.3], [-25.5, -12, 1.8, 2.8], [25.5, 12, 1.8, 2.8],
      [-30, -17, 1.05, 3.0], [30, -17, 1.05, 3.0], [30, -12, 1.1, 2.1],
      [-12, 18, 2.0, 1.4], [12, 18, 2.0, 1.4], [-21, 14, 2.8, 2.3], [21, 14, 2.5, 2.2],
      [-22, -16, 2.4, 1.8], [22, -16, 2.3, 1.7], [-19, 23, 2.8, 1.3], [19, 23, 3.4, 1.35],
      [23, 20, 2.8, 1.2], [0, -22, 6.0, 2.2]
    ];
    const contactMaterial = radialMaterial(0x101412, .28);
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), contactMaterial, staticContacts.length);
    staticContactMesh.name = 'freight-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth], index) => {
      contactDummy.position.set(x, .068, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, 0);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff6259, transparent: true, opacity: .74, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'freight-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);
    const enemyContactMaterial = radialMaterial(0x090d0c, .36);
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'freight-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildTrendWastesGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      sand: new THREE.MeshStandardMaterial({ color: 0x8d7957, roughness: .98, metalness: 0 }),
      road: new THREE.MeshStandardMaterial({ color: 0x514d43, roughness: .94, metalness: .02 }),
      west: new THREE.MeshStandardMaterial({ color: 0x445b56, emissive: 0x082a28, emissiveIntensity: .2, roughness: .9 }),
      center: new THREE.MeshStandardMaterial({ color: 0x665a43, emissive: 0x2c1b08, emissiveIntensity: .22, roughness: .91 }),
      east: new THREE.MeshStandardMaterial({ color: 0x654c42, emissive: 0x2a100a, emissiveIntensity: .2, roughness: .91 }),
      shelter: new THREE.MeshStandardMaterial({ color: 0x9b8f70, roughness: .96 }),
      dust: new THREE.MeshStandardMaterial({ color: 0x79694c, roughness: 1 }),
      boundary: new THREE.MeshStandardMaterial({ color: 0x66583e, roughness: 1 }),
      landmark: new THREE.MeshStandardMaterial({ color: 0xf0ba4d, emissive: 0x71410b, emissiveIntensity: 1.1, roughness: .42 }),
      gust: new THREE.MeshBasicMaterial({ color: 0xe6cf9a, transparent: true, opacity: .34, depthWrite: false, side: THREE.DoubleSide })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = null;
    this.trendWastesMaterials = materials;
    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    plane(60, 60, 0, 0, materials.sand, .008);
    plane(50, 56, 0, 0, materials.road, .018);
    // The lanes are worn routes, not three pristine colored runways. Their
    // widths remain readable at combat height while sand bites interrupt the
    // top-view silhouette and stop the floor from looking like a diagram.
    const laneSegments = [
      [-15.7, -21.2, 8.3, 10.6, materials.west], [-16.3, -7.3, 8.7, 12.0, materials.west],
      [-15.6, 7.1, 8.1, 11.2, materials.west], [-16.2, 21.0, 8.5, 11.0, materials.west],
      [.25, -21.4, 9.0, 11.0, materials.center], [-.2, -7.5, 9.4, 11.8, materials.center],
      [.35, 7.0, 8.9, 11.0, materials.center], [-.15, 21.1, 9.3, 11.2, materials.center],
      [15.8, -21.0, 8.4, 11.0, materials.east], [16.35, -7.0, 8.7, 11.4, materials.east],
      [15.55, 7.2, 8.2, 11.0, materials.east], [16.15, 21.0, 8.6, 11.0, materials.east]
    ];
    laneSegments.forEach(([x, z, width, depth, material], index) => plane(width, depth, x, z, material, .03 + index % 3 * .0005));

    // Cross-routes use a narrow continuous trace plus two broad shelter pads
    // at the windbreaks. This preserves navigation language without drawing a
    // beige bar through the whole composition.
    for (const z of [-15, 14]) {
      plane(46, .65, 0, z, materials.shelter, .044);
      plane(10.5, 4.2, -19, z, materials.shelter, .043);
      plane(10.5, 4.2, 19, z, materials.shelter, .043);
    }

    // Irregular dust fans erode each lane at different intervals. They are
    // ground decals rather than obstacles, so the authored route clearances
    // and collision contracts remain unchanged.
    const dustPatches = [
      [-16.1, -14.3, 3.7, 1.45, .12], [-15.2, .1, 3.0, 1.25, -.28], [-16.7, 14.1, 3.5, 1.3, .18],
      [.4, -14.4, 3.1, 1.25, -.08], [-.8, .2, 3.4, 1.2, .24], [.5, 14.2, 3.0, 1.35, -.18],
      [16.1, -14.1, 3.2, 1.35, -.16], [15.4, .1, 3.5, 1.2, .22], [16.5, 14.2, 3.1, 1.3, -.3],
      [-7.2, -9, 2.8, 1.1, .3], [7.5, 12, 3.1, 1.15, -.22]
    ];
    const dustShape = new THREE.Shape();
    dustShape.moveTo(-1, -.18);
    dustShape.lineTo(-.64, -.82);
    dustShape.lineTo(.18, -1);
    dustShape.lineTo(.92, -.48);
    dustShape.lineTo(.78, .38);
    dustShape.lineTo(.22, .92);
    dustShape.lineTo(-.72, .68);
    dustShape.closePath();
    const patchGeometry = new THREE.ShapeGeometry(dustShape);
    const patches = new THREE.InstancedMesh(patchGeometry, materials.dust, dustPatches.length);
    patches.name = 'wastes-eroded-route-patches';
    const patchDummy = new THREE.Object3D();
    dustPatches.forEach(([x, z, width, depth, yaw], index) => {
      patchDummy.position.set(x, .052, z);
      patchDummy.rotation.set(-Math.PI / 2, 0, yaw);
      patchDummy.scale.set(width, depth, 1);
      patchDummy.updateMatrix();
      patches.setMatrixAt(index, patchDummy.matrix);
    });
    patches.receiveShadow = true;
    this.group.add(patches);

    // Entry thresholds cap the hardpan road without creating another large
    // horizontal stripe.
    plane(22, .7, 0, -27.62, materials.shelter, .05);
    plane(22, .7, 0, 27.62, materials.shelter, .05);

    const dummy = new THREE.Object3D();
    const bermData = [
      [0, .65, -29.45, 60, 1.3, 1.1], [0, .65, 29.45, 60, 1.3, 1.1],
      [-29.45, .65, 0, 1.1, 1.3, 60], [29.45, .65, 0, 1.1, 1.3, 60]
    ];
    const berms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.boundary, bermData.length);
    berms.name = 'wastes-visible-boundaries';
    bermData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      berms.setMatrixAt(index, dummy.matrix);
    });
    berms.receiveShadow = true;
    this.group.add(berms);

    const routeMarks = [];
    for (let z = -23; z <= 23; z += 8) routeMarks.push([0, z, z % 16 ? .04 : -.04]);
    for (let z = -21; z <= 21; z += 10.5) {
      routeMarks.push([-16, z, .17]);
      routeMarks.push([16, z + 2.4, -.17]);
    }
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .025, 2.2), materials.landmark, routeMarks.length);
    marks.name = 'wastes-route-marks';
    routeMarks.forEach(([x, z, yaw], index) => {
      dummy.position.set(x, .065, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); marks.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(marks);

    const gustData = [];
    for (let index = 0; index < 24; index++) {
      const lane = index % 3;
      const x = [-16, 0, 16][lane] + ((index * 7) % 5 - 2) * .7;
      const z = -25 + Math.floor(index / 3) * 7.1;
      gustData.push([x, .12, z, 3.4 + index % 4, .16 + index % 3 * .05]);
    }
    const gusts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), materials.gust, gustData.length);
    gusts.name = 'wastes-ground-gusts';
    gustData.forEach(([x, y, z, width, depth], index) => {
      dummy.position.set(x, y, z); dummy.rotation.set(-Math.PI / 2, -.32, 0); dummy.scale.set(width, depth, 1); dummy.updateMatrix(); gusts.setMatrixAt(index, dummy.matrix);
    });
    gusts.renderOrder = 2;
    this.group.add(gusts);

    const bossRing = new THREE.Mesh(new THREE.RingGeometry(10.7, 11, 64), materials.landmark);
    bossRing.name = 'wastes-shard-ring';
    bossRing.rotation.x = -Math.PI / 2;
    bossRing.position.set(0, .075, -3.5);
    this.group.add(bossRing);

    const radialMaterial = (color, opacity, blending = THREE.AdditiveBlending) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const volumeMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          vUv = uv;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDirection = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
          float edge = smoothstep(.04, .72, facing);
          float endFade = 1.0 - smoothstep(.62, 1.0, vUv.y);
          float alpha = uOpacity * edge * mix(.42, 1.0, endFade);
          if (alpha < .001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });

    // The storm-eye globe is the long-range light owner. The key sits inside
    // the modeled sphere, the warm pool grounds the tower, and the signal starts
    // at the globe before widening upward through the sand.
    const stormGlobeY = 5.18 * 1.25;
    const stormPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), radialMaterial(0xffc477, .15));
    stormPool.name = 'wastes-storm-eye-pool';
    stormPool.rotation.x = -Math.PI / 2;
    stormPool.position.set(0, .082, -22);
    stormPool.scale.set(5.1, 4.35, 1);
    stormPool.renderOrder = 2;
    this.group.add(stormPool);
    const stormKey = new THREE.PointLight(0xa7fff1, 3.5, 18, 2);
    stormKey.name = 'wastes-storm-eye-key';
    stormKey.position.set(0, stormGlobeY, -22);
    stormKey.castShadow = false;
    stormKey.userData.baseIntensity = 3.5;
    this.group.add(stormKey);
    const stormSignalHeight = 9.5;
    const stormSignal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, .32, stormSignalHeight, 28, 1, true), volumeMaterial(0xb5fff2, .026));
    stormSignal.name = 'wastes-storm-eye-signal';
    stormSignal.position.set(0, stormGlobeY + stormSignalHeight / 2, -22);
    stormSignal.renderOrder = 1;
    stormSignal.userData.baseOpacity = .026;
    this.group.add(stormSignal);

    // The west mast follows the authored local +Z lamp direction. Its wide
    // frustum begins at the full lamp bar and ends in a soft elliptical pool.
    const mastPlacement = (this.definition?.assets || []).find(placement => placement.asset === 'lightmast');
    if (mastPlacement) {
      const yaw = (mastPlacement.yaw || 0) - .18;
      const scale = mastPlacement.scale || 1;
      const reach = 6.6 * scale;
      const poolX = mastPlacement.position[0] + Math.sin(yaw) * reach;
      const poolZ = mastPlacement.position[2] + Math.cos(yaw) * reach;
      const mastPool = new THREE.Mesh(new THREE.CircleGeometry(1, 28), radialMaterial(0xffd28a, .14));
      mastPool.name = 'wastes-lightmast-pool';
      mastPool.position.set(poolX, .086, poolZ);
      mastPool.rotation.set(-Math.PI / 2, 0, yaw);
      mastPool.scale.set(3.25 * scale, 4.25 * scale, 1);
      mastPool.renderOrder = 2;
      this.group.add(mastPool);

      const beamStart = new THREE.Vector3(
        mastPlacement.position[0] + Math.sin(yaw) * .35 * scale,
        4.75 * scale,
        mastPlacement.position[2] + Math.cos(yaw) * .35 * scale
      );
      const beamEnd = new THREE.Vector3(poolX, .12, poolZ);
      const beamDirection = beamStart.clone().sub(beamEnd);
      const mastBeam = new THREE.Mesh(new THREE.CylinderGeometry(.74, 1, 1, 26, 1, true), volumeMaterial(0xffdda2, .02));
      mastBeam.name = 'wastes-lightmast-beam';
      mastBeam.position.copy(beamStart).add(beamEnd).multiplyScalar(.5);
      mastBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDirection.clone().normalize());
      mastBeam.scale.set(2.9 * scale, beamDirection.length(), 1.65 * scale);
      mastBeam.renderOrder = 1;
      this.group.add(mastBeam);

      const mastKey = new THREE.PointLight(0xffcf8d, 1.45, 10.5, 2);
      mastKey.name = 'wastes-lightmast-key';
      mastKey.position.set(poolX, 2.0, poolZ);
      mastKey.castShadow = false;
      mastKey.userData.baseIntensity = 1.45;
      this.group.add(mastKey);
    }

    // The east navigation pool is sourced by the modeled capture-beacon crown.
    const capturePool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), radialMaterial(0x75e9e1, .115));
    capturePool.name = 'wastes-capture-beacon-pool';
    capturePool.rotation.x = -Math.PI / 2;
    capturePool.position.set(24, .082, 1);
    capturePool.scale.set(3.7, 3.25, 1);
    capturePool.renderOrder = 2;
    this.group.add(capturePool);
    const captureKey = new THREE.PointLight(0x86f4e8, 1.35, 10.5, 2);
    captureKey.name = 'wastes-capture-beacon-key';
    captureKey.position.set(24, 3.55 * 1.02, 1);
    captureKey.castShadow = false;
    captureKey.userData.baseIntensity = 1.35;
    this.group.add(captureKey);

    // Wave 20 converts the visible floor ring into the cold Shard light owner.
    // The low key is ring-sourced, so it never reads as an unsupported aerial lamp.
    const shardPool = new THREE.Mesh(new THREE.CircleGeometry(1, 48), radialMaterial(0x7cecff, .16));
    shardPool.name = 'wastes-shard-court-pool';
    shardPool.rotation.x = -Math.PI / 2;
    shardPool.position.set(0, .092, -3.5);
    shardPool.scale.set(11.2, 9.5, 1);
    shardPool.renderOrder = 2;
    shardPool.visible = false;
    this.group.add(shardPool);
    const shardKey = new THREE.PointLight(0x91eeff, 0, 17, 2);
    shardKey.name = 'wastes-shard-court-key';
    shardKey.position.set(0, .55, -3.5);
    shardKey.castShadow = false;
    shardKey.userData.baseIntensity = 0;
    this.group.add(shardKey);

    // One instanced contact layer grounds the large silhouette props without
    // enabling expensive storm-wide realtime shadows.
    const staticContacts = [
      [0, -22, 2.2, 2.15], [-24, 1, 1.55, 1.35], [24, 1, 2.15, 2.05],
      [-24, -18, 1.15, 3.15], [24, -18, 2.05, 4.3],
      [-19, -12.5, 4.3, 1.0], [19, -12.5, 4.3, 1.0], [-19, 13.5, 4.3, 1.0], [19, 13.5, 4.3, 1.0],
      [0, 16, 6.0, 3.1], [-18, -7, 3.75, 1.05], [-17, 8.5, 2.35, 2.3],
      [18, -7, 2.9, 1.0], [17, 8.5, 1.2, 2.6], [-23, 17.5, 2.2, 1.7],
      [23, 17.5, 2.5, 1.55], [0, -28, 4.0, 1.15], [0, 20.5, 2.8, 1.25]
    ];
    const contactMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { uColor: { value: new THREE.Color(0x171009) }, uOpacity: { value: .27 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = 1.0 - smoothstep(.08, 1.0, radius);
          alpha = alpha * alpha * uOpacity;
          if (alpha < .004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), contactMaterial, staticContacts.length);
    staticContactMesh.name = 'wastes-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, width, depth], index) => {
      contactDummy.position.set(x, .061, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, 0);
      contactDummy.scale.set(width, depth, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff6259, transparent: true, opacity: .74, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'wastes-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);
    const enemyContactMaterial = contactMaterial.clone();
    enemyContactMaterial.uniforms = {
      uColor: { value: new THREE.Color(0x100b07) },
      uOpacity: { value: .34 }
    };
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'wastes-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildAdZoneGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x282d30, roughness: .9, metalness: .06 }),
      plaza: new THREE.MeshStandardMaterial({ color: 0x62666a, roughness: .82, metalness: .06 }),
      market: new THREE.MeshStandardMaterial({ color: 0x405d62, roughness: .78, metalness: .08 }),
      sponsor: new THREE.MeshStandardMaterial({ color: 0x795237, roughness: .76, metalness: .08 }),
      service: new THREE.MeshStandardMaterial({ color: 0x654052, roughness: .78, metalness: .08 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x20272b, roughness: .72, metalness: .18 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xa9aaa1, roughness: .88 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x3fd9d1, emissive: 0x0a5553, emissiveIntensity: .72, roughness: .46 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xff9b35, emissive: 0x6a2b08, emissiveIntensity: .82, roughness: .45 }),
      magenta: new THREE.MeshStandardMaterial({ color: 0xe65392, emissive: 0x5c0d32, emissiveIntensity: .72, roughness: .46 }),
      red: new THREE.MeshStandardMaterial({ color: 0xf15a4f, emissive: 0x64100b, emissiveIntensity: .72, roughness: .48 }),
      perimeter: new THREE.MeshStandardMaterial({ color: 0x3c484c, roughness: .84, metalness: .12 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x36575d, emissive: 0x0c3337, emissiveIntensity: .32, transparent: true, opacity: .7, roughness: .24, metalness: .16 })
    };
    this.relayMaterials = null;
    this.adZoneMaterials = materials;
    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (width, height, depth, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    plane(60, 54, 0, 0, materials.foundation, .012);
    plane(54, 48, 0, 0, materials.plaza, .018);
    plane(14, 46, -18, 0, materials.market, .027);
    plane(14, 46, 0, 0, materials.sponsor, .028);
    plane(14, 46, 18, 0, materials.service, .027);
    for (const z of [-15.5, 15.5]) plane(54, 4.4, 0, z, materials.dark, .034);

    // Lane colors are thick enough to read during combat, but stop short of
    // looking like hazard telegraphs. Boss attacks retain the saturated red.
    plane(.28, 44, -10.8, 0, materials.cyan, .052);
    plane(.28, 44, 10.8, 0, materials.magenta, .052);
    plane(.3, 44, 0, 0, materials.orange, .053);
    for (const x of [-23, -18, -13, -5, 5, 13, 18, 23]) {
      box(2.8, .035, .18, x, .062, 15.5, x < -7 ? materials.cyan : x > 7 ? materials.magenta : materials.orange);
    }

    const court = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 10.6, .08, 48), materials.dark);
    court.position.set(0, .065, -3);
    court.receiveShadow = true;
    this.group.add(court);
    // Objective rings own cloned materials so alert-state changes never erase
    // the cyan / orange / magenta navigation language shared by the lanes.
    const courtRing = new THREE.Mesh(new THREE.RingGeometry(9.55, 9.85, 64), materials.orange.clone());
    courtRing.name = 'adzone-court-ring';
    courtRing.rotation.x = -Math.PI / 2;
    courtRing.position.set(0, .115, -3);
    this.group.add(courtRing);
    const sponsorRing = new THREE.Mesh(new THREE.RingGeometry(4.95, 5.45, 64), materials.cyan.clone());
    sponsorRing.name = 'adzone-sponsor-ring';
    sponsorRing.rotation.x = -Math.PI / 2;
    sponsorRing.position.set(0, .12, 5.5);
    this.group.add(sponsorRing);

    // Visible physical edge: low commercial parapets plus luminous caps make
    // the collision limit legible from every approach and corner.
    const segments = [
      [0, .72, -26.55, 59, 1.4, .9], [0, .72, 26.55, 59, 1.4, .9],
      [-29.55, .72, 0, .9, 1.4, 53], [29.55, .72, 0, .9, 1.4, 53]
    ];
    const perimeter = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.perimeter, segments.length);
    perimeter.name = 'adzone-visible-boundaries';
    const dummy = new THREE.Object3D();
    segments.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      perimeter.setMatrixAt(index, dummy.matrix);
    });
    perimeter.receiveShadow = true;
    this.group.add(perimeter);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.orange, 4);
    segments.forEach(([x, , z, width, , depth], index) => {
      dummy.position.set(x, 1.46, z); dummy.scale.set(width, .08, depth); dummy.updateMatrix();
      caps.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(caps);

    // Layered media towers close the horizon at low draw-call cost.
    const towerData = [];
    for (let index = 0; index < 22; index++) {
      const side = index % 2 ? -1 : 1;
      const lane = Math.floor(index / 2);
      const z = -25 + lane * 5.2;
      const height = 5.5 + ((index * 5) % 6) * 1.15;
      towerData.push([side * (33 + (index % 3) * 3), height / 2, z, 5.2, height, 4.5]);
    }
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.perimeter, towerData.length);
    towers.name = 'adzone-media-skyline';
    towerData.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      towers.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(towers);
    const screens = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.glass, 22);
    screens.name = 'adzone-skyline-screens';
    for (let index = 0; index < 22; index++) {
      const side = index % 2 ? -1 : 1;
      dummy.position.set(side * 30.65, 2.4 + (index % 4) * 1.4, -24 + Math.floor(index / 2) * 5.1);
      dummy.scale.set(.04, .76, 2.1); dummy.updateMatrix(); screens.setMatrixAt(index, dummy.matrix);
    }
    this.group.add(screens);

    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.08, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const volumeMaterial = (color, opacity) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          vUv = uv;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDirection = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
          float edge = smoothstep(.04, .72, facing);
          float vertical = smoothstep(0.0, .14, vUv.y) * (1.0 - smoothstep(.68, 1.0, vUv.y));
          float alpha = uOpacity * edge * mix(.42, 1.0, vertical);
          if (alpha < .001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });

    // A quiet court wash gives actors a readable midtone without flattening
    // the route bands. Its practical key lives inside the sponsor projector's
    // orange head instead of implying an unsupported source over the court.
    const courtPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), radialMaterial(0xffb45c, .075));
    courtPool.name = 'adzone-court-light-pool';
    courtPool.rotation.x = -Math.PI / 2;
    courtPool.position.set(0, .122, -3);
    courtPool.scale.set(10.7, 8.9, 1);
    courtPool.renderOrder = 2;
    this.group.add(courtPool);
    const courtKey = new THREE.PointLight(0xffc47c, 2.15, 18, 2);
    courtKey.name = 'adzone-court-key';
    courtKey.position.set(0, 2.58, 5.5);
    courtKey.castShadow = false;
    courtKey.userData.baseIntensity = 2.15;
    this.group.add(courtKey);
    const bossColumn = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 7.2, 11, 28, 1, true), volumeMaterial(0xff7650, .012));
    bossColumn.name = 'adzone-boss-air-column';
    bossColumn.position.set(0, 5.55, -3);
    bossColumn.renderOrder = 1;
    bossColumn.visible = false;
    this.group.add(bossColumn);

    // Sponsor lighting is intentionally broad and diffuse: a soft floor field,
    // a restrained vertical volume, and one short-range form key. Wave 13 owns
    // these elements and objective progress drives their state.
    const sponsorPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), radialMaterial(0xffa548, .14));
    sponsorPool.name = 'adzone-sponsor-light-pool';
    sponsorPool.rotation.x = -Math.PI / 2;
    sponsorPool.position.set(0, .132, 5.5);
    sponsorPool.scale.set(6.6, 5.6, 1);
    sponsorPool.renderOrder = 3;
    sponsorPool.visible = false;
    this.group.add(sponsorPool);
    // The frustum terminates inside the underside of the modeled orange head:
    // no narrow apex or glow is allowed to float above the practical source.
    const sponsorVolume = new THREE.Mesh(new THREE.CylinderGeometry(.36, 2.85, 2.3, 24, 1, true), volumeMaterial(0x62e5df, .02));
    sponsorVolume.name = 'adzone-sponsor-light-volume';
    sponsorVolume.position.set(0, 1.25, 5.5);
    sponsorVolume.renderOrder = 2;
    sponsorVolume.visible = false;
    this.group.add(sponsorVolume);
    const sponsorKey = new THREE.PointLight(0xffb45e, 0, 13, 2);
    sponsorKey.name = 'adzone-sponsor-key';
    sponsorKey.position.set(0, 2.58, 5.5);
    sponsorKey.castShadow = false;
    this.group.add(sponsorKey);

    // The lamp heads face local +Z. Wide frustums begin across the full
    // four-lamp source, while elliptical pools and short-range keys provide
    // soft form lighting without shadow-casting SpotLights.
    const lightMastPlacements = (this.definition?.assets || []).filter(placement => placement.asset === 'lightmast');
    const mastPools = lightMastPlacements.map(placement => {
      const yaw = (placement.yaw || 0) - .18;
      const scale = placement.scale || 1;
      const reach = 6.35 * scale;
      return [
        placement.position[0] + Math.sin(yaw) * reach,
        placement.position[2] + Math.cos(yaw) * reach,
        3.45 * scale,
        4.35 * scale,
        yaw
      ];
    });
    const mastPoolMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xffd58d) }, uOpacity: { value: .16 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length((vUv - vec2(.5)) * 2.0);
          float feather = 1.0 - smoothstep(.10, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const mastPoolMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28), mastPoolMaterial, mastPools.length);
    mastPoolMesh.name = 'adzone-lightmast-pools';
    const lightingDummy = new THREE.Object3D();
    mastPools.forEach(([x, z, width, depth, yaw], index) => {
      lightingDummy.position.set(x, .112, z);
      lightingDummy.rotation.set(-Math.PI / 2, 0, yaw);
      lightingDummy.scale.set(width, depth, 1);
      lightingDummy.updateMatrix();
      mastPoolMesh.setMatrixAt(index, lightingDummy.matrix);
    });
    mastPoolMesh.renderOrder = 2;
    this.group.add(mastPoolMesh);
    const mastBeamMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uOpacity: { value: .022 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec4 viewPosition = viewMatrix * worldPosition;
          vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vViewDirection = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
          float edge = smoothstep(.04, .7, facing);
          float start = smoothstep(0.0, .1, vUv.y);
          float end = 1.0 - smoothstep(.72, 1.0, vUv.y);
          float alpha = uOpacity * edge * mix(.46, 1.0, start * end);
          if (alpha < .001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const mastBeamGeometry = new THREE.CylinderGeometry(.76, 1, 1, 28, 1, true);
    const mastBeamMesh = new THREE.InstancedMesh(mastBeamGeometry, mastBeamMaterial, lightMastPlacements.length);
    mastBeamMesh.name = 'adzone-lightmast-beams';
    const beamUp = new THREE.Vector3(0, 1, 0);
    const beamStart = new THREE.Vector3();
    const beamEnd = new THREE.Vector3();
    const beamDirection = new THREE.Vector3();
    lightMastPlacements.forEach((placement, index) => {
      const yaw = (placement.yaw || 0) - .18;
      const scale = placement.scale || 1;
      const reach = 7.2 * scale;
      beamStart.set(
        placement.position[0] + Math.sin(yaw) * .36 * scale,
        4.75 * scale,
        placement.position[2] + Math.cos(yaw) * .36 * scale
      );
      beamEnd.set(
        placement.position[0] + Math.sin(yaw) * reach,
        .12,
        placement.position[2] + Math.cos(yaw) * reach
      );
      beamDirection.copy(beamStart).sub(beamEnd);
      const length = beamDirection.length();
      lightingDummy.position.copy(beamStart).add(beamEnd).multiplyScalar(.5);
      lightingDummy.quaternion.setFromUnitVectors(beamUp, beamDirection.normalize());
      lightingDummy.scale.set(3.05 * scale, length, 1.72 * scale);
      lightingDummy.updateMatrix();
      mastBeamMesh.setMatrixAt(index, lightingDummy.matrix);

      const key = new THREE.PointLight(0xffcf91, 1.55, 10.5, 2);
      key.name = `adzone-lightmast-key-${index + 1}`;
      key.position.set(mastPools[index][0], 2.1, mastPools[index][1]);
      key.castShadow = false;
      key.userData.baseIntensity = 1.55;
      this.group.add(key);
    });
    mastBeamMesh.frustumCulled = false;
    mastBeamMesh.renderOrder = 1;
    this.group.add(mastBeamMesh);

    // Contact patches keep the large commercial props grounded on the default
    // no-shadow performance profile. Their irregular scales avoid decal-like
    // uniformity while remaining one draw call.
    const staticContacts = [
      [-23.5, -21.5, 5.1, 2.9], [22.5, -21.5, 5.5, 2.8], [-15.5, -22, 3.7, 2.5],
      [17.5, -20.8, 2.4, 2.3], [25.1, -8.5, 1.3, 3.5], [-25.2, -7, 2.3, 2.8],
      [25.2, 7.5, 2.3, 2.8], [-25, 8.5, 1.7, 1.4], [24.5, -2.5, 1.7, 1.4],
      [-11.5, -2.5, 3.6, 1.35], [11.5, 3.5, 3.6, 1.35], [0, 5.5, 1.25, 1.1],
      [0, 13.5, 3.4, 2.6], [-18.5, 12.8, 3.7, 1.25], [18.5, 12.8, 4.7, 2.35],
      [-18, -8.5, 1.15, 3.35], [18, -8.5, 1.15, 3.35]
    ];
    const contactMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { uColor: { value: new THREE.Color(0x070608) }, uOpacity: { value: .27 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = (1.0 - smoothstep(.08, 1.0, radius));
          alpha = alpha * alpha * uOpacity;
          if (alpha < .004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), contactMaterial, staticContacts.length);
    staticContactMesh.name = 'adzone-static-contact-shadows';
    staticContacts.forEach(([x, z, width, depth], index) => {
      lightingDummy.position.set(x, .068, z);
      lightingDummy.rotation.set(-Math.PI / 2, 0, 0);
      lightingDummy.scale.set(width, depth, 1);
      lightingDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, lightingDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff695c, transparent: true, opacity: .76, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'adzone-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);
    const enemyContactMaterial = contactMaterial.clone();
    enemyContactMaterial.uniforms = {
      uColor: { value: new THREE.Color(0x030205) },
      uOpacity: { value: .34 }
    };
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'adzone-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _buildSanitizerGroundLanguage() {
    const THREE = this.THREE;
    const materials = {
      foundation: new THREE.MeshStandardMaterial({ color: 0x202829, roughness: .92, metalness: .04 }),
      press: new THREE.MeshStandardMaterial({ color: 0x77817e, roughness: .82, metalness: .08 }),
      sterile: new THREE.MeshStandardMaterial({ color: 0xb9c1bc, roughness: .78 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x273133, roughness: .72, metalness: .18 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x4b5654, roughness: .78, metalness: .12 }),
      cyan: new THREE.MeshStandardMaterial({ color: 0x329da3, emissive: 0x06373a, emissiveIntensity: .42, roughness: .58 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc84d49, emissive: 0x3c0c0a, emissiveIntensity: .38, roughness: .58 }),
      acid: new THREE.MeshStandardMaterial({ color: 0xc8ed48, emissive: 0x3b4c08, emissiveIntensity: .52, roughness: .56 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x27484d, emissive: 0x09282c, emissiveIntensity: .28, transparent: true, opacity: .72, roughness: .25, metalness: .18 }),
      perimeter: new THREE.MeshStandardMaterial({ color: 0x3d4948, roughness: .86, metalness: .08 })
    };
    this.relayMaterials = null;
    this.sanitizerMaterials = materials;
    const plane = (width, depth, x, z, material, y = .02) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const box = (width, height, depth, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const radialMaterial = (color, opacity) => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float radius = length((vUv - .5) * 2.0);
          float feather = 1.0 - smoothstep(.1, 1.0, radius);
          float alpha = feather * feather * uOpacity;
          if (alpha < .002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const volumeMaterial = (color, opacity) => new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          vUv = uv;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vViewDirection = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewDirection;
        void main() {
          float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
          float edgeFeather = smoothstep(.04, .72, facing);
          float lengthFeather = .28 + .72 * sin(3.14159265 * clamp(vUv.y, 0.0, 1.0));
          float alpha = uOpacity * edgeFeather * lengthFeather;
          if (alpha < .001) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    // Top-view hierarchy: dark compound, bright press nave, then three routes.
    plane(54, 54, 0, 0, materials.foundation, .012);
    plane(38, 44, 0, -1, materials.press, .018);
    plane(12, 46, 0, 0, materials.sterile, .026);
    plane(8.5, 42, -16.5, 0, materials.dark, .027);
    plane(8.5, 42, 16.5, 0, materials.dark, .027);
    plane(46, 6.5, 0, 18.5, materials.frame, .03);
    plane(46, 5.2, 0, -19.5, materials.frame, .03);

    // Cross-links prevent three disconnected bowling lanes.
    for (const z of [-12, 8]) plane(41, 4.2, 0, z, materials.press, .034);
    plane(.24, 38, -12.1, 0, materials.cyan, .052);
    plane(.24, 38, 12.1, 0, materials.red, .052);
    for (const z of [-14, -7, 0, 7, 14]) {
      box(.18, .035, 2.8, 0, .058, z, materials.dark);
    }

    // The boss court is one unmistakable destination, not another loose prop cluster.
    const court = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 10.8, .08, 8), materials.dark);
    court.position.set(0, .055, -3);
    court.receiveShadow = true;
    this.group.add(court);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.45, 9.72, 64), materials.red);
    ring.name = 'relay-objective-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, .108, -3);
    this.group.add(ring);
    const nodeRing = new THREE.Mesh(new THREE.RingGeometry(11.75, 11.95, 64), materials.cyan);
    nodeRing.rotation.x = -Math.PI / 2;
    nodeRing.position.set(0, .072, -3);
    nodeRing.material = materials.cyan;
    this.group.add(nodeRing);
    const innerCourtRing = new THREE.Mesh(new THREE.RingGeometry(6.35, 6.62, 64), materials.press);
    innerCourtRing.rotation.x = -Math.PI / 2;
    innerCourtRing.position.set(0, .112, -3);
    this.group.add(innerCourtRing);
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      const accent = box(.18, .035, 2.2, Math.sin(angle) * 8.05, .116, -3 + Math.cos(angle) * 8.05, index % 2 ? materials.cyan : materials.red);
      accent.rotation.y = angle;
    }
    for (const target of this.definition.objectives?.suppressionNodes || []) {
      const targetRing = new THREE.Mesh(new THREE.RingGeometry(target.radius - .22, target.radius, 40), materials.acid);
      targetRing.name = `spire-suppression-ring:${target.id}`;
      targetRing.rotation.x = -Math.PI / 2;
      targetRing.position.set(target.position[0], .105, target.position[1]);
      this.group.add(targetRing);
    }

    // The facade owns the visual hierarchy. One short-range, shadowless key
    // provides real form light; shader cards carry the broad facade and court
    // washes without adding shadow or post-processing cost.
    const heroKey = new THREE.PointLight(0xcffff5, 4.5, 18, 2);
    heroKey.name = 'spire-hero-key';
    heroKey.position.set(0, 6.1, -18.6);
    heroKey.castShadow = false;
    heroKey.userData.baseIntensity = 4.5;
    this.group.add(heroKey);

    const facadeWash = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 12.4), radialMaterial(0xbff9ef, .095));
    facadeWash.name = 'spire-facade-wash';
    facadeWash.position.set(0, 6.35, -21.62);
    facadeWash.renderOrder = 2;
    this.group.add(facadeWash);

    const courtPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), radialMaterial(0xcaf8f0, .12));
    courtPool.name = 'spire-court-light-pool';
    courtPool.rotation.x = -Math.PI / 2;
    courtPool.position.set(0, .102, -3);
    courtPool.scale.set(10.4, 8.8, 1);
    courtPool.renderOrder = 2;
    this.group.add(courtPool);

    const suppressionColors = [0x5de4df, 0xff7468, 0xcbed50];
    const suppressionVolumeGeometry = new THREE.CylinderGeometry(.55, 1.35, 3.6, 20, 1, true);
    for (const [index, target] of (this.definition.objectives?.suppressionNodes || []).entries()) {
      const color = suppressionColors[index % suppressionColors.length];
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), radialMaterial(color, .18));
      pool.name = `spire-suppression-pool:${target.id}`;
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(target.position[0], .112, target.position[1]);
      pool.scale.set(target.radius * 1.08, target.radius * .86, 1);
      pool.renderOrder = 3;
      pool.visible = false;
      pool.userData.baseColor = color;
      this.group.add(pool);

      const volume = new THREE.Mesh(suppressionVolumeGeometry, volumeMaterial(color, .028));
      volume.name = `spire-suppression-volume:${target.id}`;
      volume.position.set(target.position[0], 1.86, target.position[1]);
      volume.renderOrder = 1;
      volume.visible = false;
      volume.userData.baseColor = color;
      this.group.add(volume);
    }

    // Institutional wall rhythm gives the perimeter mass and human scale.
    for (const x of [-22, -11, 0, 11, 22]) box(8.2, .45, .7, x, .24, 24.8, materials.sterile);
    for (const z of [-20, -10, 0, 10, 20]) {
      box(.7, .45, 7.2, -24.8, .24, z, materials.sterile);
      box(.7, .45, 7.2, 24.8, .24, z, materials.sterile);
    }
    const [levelWidth, levelDepth] = this.definition.size;
    const perimeterSegments = [
      [0, 1.1, -levelDepth / 2, levelWidth, 2.2, 1], [0, 1.1, levelDepth / 2, levelWidth, 2.2, 1],
      [-levelWidth / 2, 1.1, 0, 1, 2.2, levelDepth], [levelWidth / 2, 1.1, 0, 1, 2.2, levelDepth]
    ];
    const perimeter = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.perimeter, 4);
    perimeter.name = 'spire-visible-boundaries';
    const dummy = new THREE.Object3D();
    perimeterSegments.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      perimeter.setMatrixAt(index, dummy.matrix);
    });
    perimeter.receiveShadow = true;
    this.group.add(perimeter);

    // Ground the largest architecture and combatants on the default no-shadow
    // performance profile. Soft radial patches avoid duplicating hard geometry.
    const staticContacts = [
      [0, -23.2, 7.8, 3.0], [-19.5, -20.5, 4.3, 3.25], [19.5, -20.5, 4.3, 3.25],
      [-25, -5, 3.0, 3.5], [25, -5, 3.0, 3.5], [-20, 19, 2.5, 1.15], [20, 19, 2.5, 1.15],
      [0, 18, 2.1, 1.15], [-12.5, -8, .9, 3.0], [12.5, -8, .9, 3.0],
      [-17, 10.5, 2.7, 1.85], [17, 10.5, 2.7, 1.85], [-20, 0, 1.7, 4.4]
    ];
    const contactMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { uColor: { value: new THREE.Color(0x020708) }, uOpacity: { value: .26 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float radius = length(vUv - vec2(.5)) * 2.0;
          float alpha = (1.0 - smoothstep(.1, 1.0, radius)) * uOpacity;
          if (alpha < .004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const staticContactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), contactMaterial, staticContacts.length);
    staticContactMesh.name = 'spire-static-contact-shadows';
    const contactDummy = new THREE.Object3D();
    staticContacts.forEach(([x, z, sx, sz], index) => {
      contactDummy.position.set(x, .058, z);
      contactDummy.rotation.set(-Math.PI / 2, 0, 0);
      contactDummy.scale.set(sx, sz, 1);
      contactDummy.updateMatrix();
      staticContactMesh.setMatrixAt(index, contactDummy.matrix);
    });
    staticContactMesh.renderOrder = 1;
    this.group.add(staticContactMesh);

    // Distant press blocks close the horizon without stealing combat space.
    const skylineMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6666, roughness: .94, emissive: 0x101b1c, emissiveIntensity: .2 });
    const skylineWindow = new THREE.MeshBasicMaterial({ color: 0x5ed2d0, transparent: true, opacity: .52, toneMapped: false });
    const skyline = [];
    for (let index = 0; index < 18; index++) {
      const side = index % 2 ? -1 : 1;
      const lane = Math.floor(index / 2);
      const z = -24 + lane * 6;
      const height = 5.5 + (index * 7 % 5) * 1.25;
      skyline.push([side * (30.5 + (index % 3) * 2.4), height / 2, z, 4.8, height, 4.4]);
    }
    for (const x of [-20, -11, 0, 11, 20]) {
      const height = 6.5 + (Math.abs(x) % 4);
      skyline.push([x, height / 2, -31, 8.5, height, 5]);
    }
    const skylineMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skylineMaterial, skyline.length);
    skylineMesh.name = 'spire-skyline-massing';
    skyline.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      skylineMesh.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(skylineMesh);
    const skylineCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.dark, skyline.length);
    skylineCaps.name = 'spire-skyline-roofs';
    skyline.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y + height / 2 + .18, z);
      dummy.scale.set(width + .35, .36, depth + .35);
      dummy.updateMatrix();
      skylineCaps.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(skylineCaps);
    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), skylineWindow, 20);
    windows.name = 'spire-skyline-windows';
    for (let index = 0; index < 20; index++) {
      const side = index % 2 ? -1 : 1;
      dummy.position.set(side * 28.2, 2.8 + (index % 3) * 1.65, -23 + Math.floor(index / 2) * 5.4);
      dummy.scale.set(.04, .62, 1.45); dummy.updateMatrix(); windows.setMatrixAt(index, dummy.matrix);
    }
    this.group.add(windows);

    // Thin aerial service links make the outer blocks read as one secured campus.
    const bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x394546, roughness: .82, metalness: .12 });
    const bridges = [
      [-29.5, 5.8, -17, 1.1, .45, 8], [29.5, 6.5, -11, 1.1, .45, 8],
      [-29.5, 4.9, 8, 1.1, .45, 7], [29.5, 5.5, 14, 1.1, .45, 7]
    ];
    const bridgeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bridgeMaterial, bridges.length);
    bridgeMesh.name = 'spire-skyline-service-links';
    bridges.forEach(([x, y, z, width, height, depth], index) => {
      dummy.position.set(x, y, z); dummy.scale.set(width, height, depth); dummy.updateMatrix();
      bridgeMesh.setMatrixAt(index, dummy.matrix);
    });
    this.group.add(bridgeMesh);

    const threatMaterial = new THREE.MeshBasicMaterial({ color: 0xff6259, transparent: true, opacity: .74, depthWrite: false, side: THREE.DoubleSide });
    this.enemyReadabilityMesh = new THREE.InstancedMesh(new THREE.RingGeometry(.60, .76, 24), threatMaterial, 96);
    this.enemyReadabilityMesh.name = 'spire-enemy-threat-rings';
    this.enemyReadabilityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyReadabilityMesh.frustumCulled = false;
    this.enemyReadabilityMesh.count = 0;
    this.group.add(this.enemyReadabilityMesh);

    const enemyContactMaterial = contactMaterial.clone();
    enemyContactMaterial.uniforms = {
      uColor: { value: new THREE.Color(0x010405) },
      uOpacity: { value: .32 }
    };
    this.enemyContactShadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), enemyContactMaterial, 96);
    this.enemyContactShadowMesh.name = 'spire-enemy-contact-shadows';
    this.enemyContactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyContactShadowMesh.frustumCulled = false;
    this.enemyContactShadowMesh.count = 0;
    this.group.add(this.enemyContactShadowMesh);
  }

  _updateAdZoneMotion(dt) {
    this.movingCoverTime += dt;
    const offset = Math.sin(this.movingCoverTime * this.adCoverSpeed) * .72;
    const covers = this.visualGroups.get('movingCover') || [];
    covers.forEach((root, index) => {
      if (!Number.isFinite(root.userData.adZoneBaseYaw)) root.userData.adZoneBaseYaw = root.rotation.y;
      root.rotation.y = root.userData.adZoneBaseYaw + (index % 2 ? -offset : offset);
      root.updateMatrixWorld(true);
    });
    for (const collider of this.colliderObjects) {
      const motion = collider.userData.motion;
      if (motion?.kind !== 'billboard') continue;
      const signedOffset = motion.index % 2 ? -offset : offset;
      collider.rotation.y = collider.userData.motionBaseYaw + signedOffset;
      if (Array.isArray(motion.origin) && Array.isArray(motion.baseOffset)) {
        const cos = Math.cos(signedOffset);
        const sin = Math.sin(signedOffset);
        const [dx, dz] = motion.baseOffset;
        collider.position.x = motion.origin[0] + cos * dx + sin * dz;
        collider.position.z = motion.origin[2] - sin * dx + cos * dz;
      }
      collider.updateMatrixWorld(true);
      const debugRoot = collider.userData.debugColliderRoot;
      if (debugRoot) {
        debugRoot.position.copy(collider.position);
        debugRoot.rotation.copy(collider.rotation);
        debugRoot.updateMatrixWorld(true);
      }
    }
  }

  _configureExpanseStorm(wave) {
    const config = this.definition?.stormByWave?.[wave];
    if (!config) return;
    const authoredWave = wave - (Number(this.definition?.waveOffset) || 0);
    this.expanseStormState = {
      wave,
      heavy: !!config.startHeavy,
      elapsed: 0,
      calmSeconds: config.calmSeconds,
      heavySeconds: config.heavySeconds,
      normalRange: config.normal,
      heavyRange: config.heavy,
      rotating: !!config.rotating,
      route: authoredWave % 3
    };
    this._applyExpanseStormState(true);
  }

  _configureFloodgateState(wave) {
    const water = this.definition?.waterByWave?.[wave] || 'dry';
    const authoredWave = wave - (Number(this.definition?.waveOffset) || 0);
    const chapter = authoredWave <= 57 ? 1 : authoredWave <= 64 ? 2 : 3;
    const gateVariant = chapter === 1 ? 'closed' : chapter === 2 ? 'opening' : authoredWave === 71 ? 'damaged' : 'locked';
    this.floodgateState = { wave, authoredWave, water, chapter, currentSpeed: water === 'high' ? 2.1 : water === 'medium' ? 1.25 : water === 'low' ? .65 : 0 };
    this._setTaggedCollidersActive('floodMediumLock', water === 'medium' || water === 'high');
    this._setTaggedCollidersActive('floodHighLock', water === 'high');
    this._setTaggedCollidersActive('floodgateClosedCollider', gateVariant === 'closed');
    this._setTaggedCollidersActive('floodgateOpeningCollider', gateVariant === 'opening');
    this._setTaggedCollidersActive('floodgateLockedCollider', gateVariant === 'locked');
    this._setTaggedCollidersActive('floodgateDamagedCollider', gateVariant === 'damaged');
    this._setTaggedCollidersActive('archiveSeedActive', chapter === 3);
    this._setTaggedCollidersActive('greywaterCoreActive', chapter === 3);
    const channel = this.group?.getObjectByName?.('floodgate-channel-water');
    const westOverflow = this.group?.getObjectByName?.('floodgate-west-overflow');
    const eastOverflow = this.group?.getObjectByName?.('floodgate-east-overflow');
    const levels = { dry: .075, low: .12, medium: .22, high: .38 };
    if (channel) {
      channel.visible = water !== 'dry';
      channel.position.y = levels[water];
      channel.material.opacity = water === 'high' ? .8 : water === 'medium' ? .72 : .58;
    }
    if (westOverflow) { westOverflow.visible = water === 'high'; westOverflow.position.y = .23; }
    if (eastOverflow) { eastOverflow.visible = water === 'medium' || water === 'high'; eastOverflow.position.y = water === 'high' ? .28 : .17; }
    const mediumLock = this.group?.getObjectByName?.('floodgate-medium-visible-lock');
    const highLock = this.group?.getObjectByName?.('floodgate-high-visible-lock');
    if (mediumLock) mediumLock.visible = water === 'medium' || water === 'high';
    if (highLock) highLock.visible = water === 'high';
    const currents = this.group?.getObjectByName?.('floodgate-current-streaks');
    if (currents) currents.visible = water !== 'dry';
    this._setGroupVisible('archiveSeeds', chapter === 3);
    this._setGroupVisible('greywaterCore', chapter === 3);
    this._setVariantFamily('floodgate', gateVariant);
    if (chapter < 3) this._setVariantFamily('archiveSeed', 'shielded');
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = chapter === 3 ? 42 : Infinity;
    this._updateFloodgateObjectiveVisuals();
  }

  _updateFloodgate(dt, playerObject) {
    const state = this.floodgateState;
    if (!state) return;
    const currents = this.group?.getObjectByName?.('floodgate-current-streaks');
    if (currents) currents.position.z = ((currents.position.z + dt * state.currentSpeed + 6) % 12) - 6;
    const channel = this.group?.getObjectByName?.('floodgate-channel-water');
    if (channel?.material) channel.material.opacity += (Math.sin(this._pulse * 2.1) * .018 - (channel.material.opacity - (state.water === 'high' ? .8 : state.water === 'medium' ? .72 : .58))) * .08;
    this.floodgateHazardCooldown = Math.max(0, this.floodgateHazardCooldown - dt);
    const position = playerObject?.position;
    if (position && state.water !== 'dry') {
      const onCrossing = [-16, 0, 16].some(z => Math.abs(position.z - z) <= 3.5);
      const inChannel = Math.abs(position.x) <= 7.7;
      const inOverflow = state.water === 'high' && position.x > -17.5 && position.x < 17.5;
      const hazardous = !onCrossing && (inChannel || inOverflow);
      if (hazardous) {
        position.z = Math.max(-30.5, Math.min(30.5, position.z + state.currentSpeed * dt));
        if (this.floodgateHazardCooldown <= 0) {
          this.floodgateHazardCooldown = 1;
          this.onPlayerHazard?.({ type: 'floodwater', damage: state.water === 'high' ? 6 : state.water === 'medium' ? 4 : 2, waterState: state.water });
        }
      }
    }
    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`floodgate-mast-key-${index}`);
      if (key && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.2 + index * 1.4) * .012);
      }
    }
    const gateKey = this.group?.getObjectByName?.('floodgate-gate-status-key');
    if (gateKey && Number.isFinite(gateKey.userData?.baseIntensity)) {
      const surge = state.water === 'high' ? Math.max(0, Math.sin(this._pulse * 4.6)) * .045 : 0;
      gateKey.intensity = gateKey.userData.baseIntensity * (1 + surge);
    }
    for (let index = 1; index <= 3; index += 1) {
      const key = this.group?.getObjectByName?.(`floodgate-seed-key-${index}`);
      if (key?.visible && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.7 + index * 1.45) * .025);
      }
    }
    const coreKey = this.group?.getObjectByName?.('floodgate-greywater-core-key');
    if (coreKey?.visible && Number.isFinite(coreKey.userData?.baseIntensity)) {
      coreKey.intensity = coreKey.userData.baseIntensity
        * (1 + Math.max(0, Math.sin(this._pulse * (state.authoredWave === 71 ? 3.8 : 1.6))) * .04);
    }
    this._updateFloodgateObjectiveVisuals();
  }

  _updateFloodgateObjectiveVisuals() {
    if (this.definition?.id !== 'floodgate-continuity') return;
    const wave = this.currentWave - (Number(this.definition?.waveOffset) || 0);
    for (let index = 1; index <= 2; index += 1) {
      const ring = this.group?.getObjectByName?.(`floodgate-handshake-ring-${index}`);
      if (ring) ring.visible = wave === 57 && this.liberationTime <= 0;
      const pool = this.group?.getObjectByName?.(`floodgate-handshake-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.visible = wave === 57 && this.liberationTime <= 0;
        pool.userData.baseOpacity = pool.visible ? .15 : 0;
        pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
      }
    }
    for (let index = 1; index <= 3; index += 1) {
      const ring = this.group?.getObjectByName?.(`floodgate-pump-ring-${index}`);
      if (ring) ring.visible = wave === 64 && this.liberationTime <= 0;
      const seedRing = this.group?.getObjectByName?.(`floodgate-seed-ring-${index}`);
      if (seedRing) seedRing.visible = wave === 70 && this.liberationTime <= 0;
      const pumpPool = this.group?.getObjectByName?.(`floodgate-pump-pool-${index}`);
      if (pumpPool?.material?.uniforms) {
        pumpPool.visible = this.liberationTime <= 0;
        pumpPool.userData.baseOpacity = wave === 64 ? .15 : .035;
        pumpPool.material.uniforms.uOpacity.value = pumpPool.userData.baseOpacity;
      }
    }
    const coreRing = this.group?.getObjectByName?.('floodgate-core-ring');
    if (coreRing) coreRing.visible = wave === 71 && this.liberationTime <= 0;
    if (wave === 70 && this.objectiveState?.kind === 'multi-capture') {
      this.objectiveState.targets.forEach((target, index) => {
        const variant = target.complete ? 'destroyed' : this.objectiveState.activeTargetKey === target.nameKey ? 'exposed' : 'shielded';
        for (const root of this.visualGroups.get(`seed${index + 1}`) || []) this._setAssetVariant(root, variant);
        const pool = this.group?.getObjectByName?.(`floodgate-seed-pool-${index + 1}`);
        if (pool?.material?.uniforms) {
          pool.userData.baseOpacity = target.complete ? .025 : variant === 'exposed' ? .18 : .115;
          pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
        }
        const key = this.group?.getObjectByName?.(`floodgate-seed-key-${index + 1}`);
        if (key) {
          key.color.setHex(variant === 'exposed' ? 0xff8a72 : 0xb9a3ff);
          key.userData.baseIntensity = target.complete ? .35 : variant === 'exposed' ? 2.8 : 1.85;
          key.intensity = key.userData.baseIntensity;
        }
      });
    }
    if (wave === 71 && coreRing?.material) {
      const progress = this.objectiveState?.progress || 0;
      coreRing.material.emissiveIntensity = .9 + progress * 1.6 + Math.max(0, Math.sin(this._pulse * 4.5)) * .3;
    }
  }

  _setAssetVariant(root, variant) {
    if (!root?.userData?.levelVariantFamily) return;
    root.userData.levelVariant = variant;
    root.traverse?.(node => {
      if (!node.name?.startsWith?.('state_')) return;
      node.position.x = 0;
      node.visible = node.name === `state_${variant}`;
    });
  }

  _setVariantFamily(family, variant) {
    this.group?.traverse?.(root => {
      if (root?.userData?.levelVariantFamily === family) this._setAssetVariant(root, variant);
    });
  }

  _applyExpanseStormState(immediate = false) {
    const state = this.expanseStormState;
    if (!state) return;
    const mode = state.heavy ? 'expanse-heavy-sand-wind' : 'expanse-sand-wind';
    this.weather?.setMode?.(mode, { immediate });
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = state.heavy ? state.heavyRange : state.normalRange;
    const gusts = this.group?.getObjectByName?.('expanse-ground-gusts');
    if (gusts?.material) gusts.material.opacity = state.heavy ? .34 : .14;
    for (let index = 1; index <= 3; index += 1) {
      const ring = this.group?.getObjectByName?.(`expanse-beacon-ring-${index}`);
      if (!ring?.material) continue;
      ring.material.emissiveIntensity = state.heavy ? 1.25 : .78;
      const selected = !state.rotating || !state.heavy || state.route === index - 1;
      const key = this.group?.getObjectByName?.(`expanse-beacon-key-${index}`);
      if (key) {
        const intensity = state.heavy ? key.userData.heavyIntensity : key.userData.calmIntensity;
        key.userData.baseIntensity = intensity * (selected ? 1 : .58);
        key.intensity = key.userData.baseIntensity;
      }
      const pool = this.group?.getObjectByName?.(`expanse-beacon-pool-${index}`);
      if (pool?.material?.uniforms) {
        const opacity = state.heavy ? pool.userData.heavyOpacity : pool.userData.calmOpacity;
        pool.userData.baseOpacity = opacity * (selected ? 1 : .64);
        pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
      }
      const pylonGlows = this.group?.getObjectByName?.(`expanse-route-pylon-glows-${index}`);
      if (pylonGlows?.material?.uniforms) {
        const opacity = state.heavy ? pylonGlows.userData.heavyOpacity : pylonGlows.userData.calmOpacity;
        pylonGlows.material.uniforms.uOpacity.value = opacity * (selected ? 1 : .72);
      }
    }
    const sirenKey = this.group?.getObjectByName?.('expanse-storm-siren-key');
    if (sirenKey) {
      sirenKey.userData.baseIntensity = state.heavy ? sirenKey.userData.heavyIntensity : sirenKey.userData.calmIntensity;
      sirenKey.intensity = sirenKey.userData.baseIntensity;
    }
    const sirenPool = this.group?.getObjectByName?.('expanse-siren-pool');
    if (sirenPool?.material?.uniforms) {
      sirenPool.userData.baseOpacity = state.heavy ? sirenPool.userData.heavyOpacity : sirenPool.userData.calmOpacity;
      sirenPool.material.uniforms.uOpacity.value = sirenPool.userData.baseOpacity;
    }
    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`expanse-mast-key-${index}`);
      if (key) {
        key.userData.baseIntensity = state.heavy ? key.userData.heavyIntensity : key.userData.calmIntensity;
        key.intensity = key.userData.baseIntensity;
      }
    }
  }

  _updateExpanseStorm(dt) {
    const state = this.expanseStormState;
    if (!state) return;
    const monumentKey = this.group?.getObjectByName?.('expanse-endurance-monument-key');
    if (monumentKey?.visible && Number.isFinite(monumentKey.userData?.calmIntensity)) {
      monumentKey.intensity = monumentKey.userData.calmIntensity * (1 + Math.sin(this._pulse * 1.8) * .025);
    }
    if (this.liberationTime > 0) return;
    state.elapsed += dt;
    const duration = state.heavy ? state.heavySeconds : state.calmSeconds;
    if (state.elapsed >= duration) {
      state.elapsed %= duration;
      state.heavy = !state.heavy;
      if (state.rotating && state.heavy) state.route = (state.route + 1) % 3;
      this._applyExpanseStormState();
    }
    const gusts = this.group?.getObjectByName?.('expanse-ground-gusts');
    if (gusts) {
      gusts.position.x = ((gusts.position.x + dt * (state.heavy ? 7.5 : 3.5) + 4) % 8) - 4;
      gusts.position.z = Math.sin(this._pulse * .32) * 1.2;
    }
    for (let index = 1; index <= 3; index += 1) {
      const ring = this.group?.getObjectByName?.(`expanse-beacon-ring-${index}`);
      if (!ring) continue;
      const selected = !state.rotating || !state.heavy || state.route === index - 1;
      ring.scale.setScalar((selected ? 1 : .9) + Math.sin(this._pulse * 3.6 + index) * .035);
      ring.rotation.z += dt * (index % 2 ? .18 : -.18);
      const key = this.group?.getObjectByName?.(`expanse-beacon-key-${index}`);
      if (key && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.7 + index * 1.25) * .018);
      }
    }
    const sirenKey = this.group?.getObjectByName?.('expanse-storm-siren-key');
    if (sirenKey && Number.isFinite(sirenKey.userData?.baseIntensity)) {
      sirenKey.intensity = sirenKey.userData.baseIntensity
        * (1 + Math.max(0, Math.sin(this._pulse * (state.heavy ? 5.2 : 2.4))) * .055);
    }
    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`expanse-mast-key-${index}`);
      if (key && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.25 + index) * .012);
      }
    }
  }

  _beginEnduranceCompletion() {
    if (this.liberationTime > 0 || this._transitioned) return;
    this.liberationTime = .0001;
    const floodgate = this.definition?.id === 'floodgate-continuity';
    this.weather?.setMode?.(floodgate ? 'floodgate-cleared-fog' : 'expanse-cleared-sand-wind');
    this._setGroupVisible('enduranceComplete', !floodgate);
    for (const root of this.visualGroups.get('liberation') || []) setMaterialLiberated(root, true);
    if (this.enemyManager) this.enemyManager.combatVisibilityRange = floodgate ? Infinity : 30;
    this._applyWaveVisualState(0, true);
    this.objectiveState = {
      kind: 'liberation',
      titleKey: this.definition.liberationTitleKey,
      detailKey: this.definition.liberationDetailKey,
      progress: 0,
      contested: false
    };
    this._emitObjective();
  }

  _updateServerCathedralMotion(dt, playerObject) {
    for (let index = 1; index <= 3; index += 1) {
      const marker = this.group?.getObjectByName?.(`cathedral-logic-node-ring-${index}`);
      if (!marker?.visible) continue;
      marker.rotation.z += dt * (.16 + index * .035) * (index % 2 ? 1 : -1);
      marker.scale.setScalar(1 + Math.sin(this._pulse * 3.2 + index * 1.7) * .035);
    }
    const glyphs = this.group?.getObjectByName?.('cathedral-false-targets');
    if (glyphs?.visible) glyphs.rotation.y += dt * .04;
    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`cathedral-mast-key-${index}`);
      if (key && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.25 + index * 1.4) * .014);
      }
    }
    for (const [name, speed, amount] of [
      ['cathedral-root-core-key', 1.55, .022],
      ['cathedral-choice-beacon-key', 2.1, .028]
    ]) {
      const key = this.group?.getObjectByName?.(name);
      if (!key?.visible || !Number.isFinite(key.userData?.baseIntensity)) continue;
      key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * speed) * amount);
    }
    for (let index = 1; index <= 3; index += 1) {
      const pool = this.group?.getObjectByName?.(`cathedral-logic-node-pool-${index}`);
      if (!pool?.visible || !pool.material?.uniforms || !Number.isFinite(pool.userData?.baseOpacity)) continue;
      pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity
        * (1 + Math.sin(this._pulse * 1.8 + index * 1.25) * .035);
    }
    for (const name of ['cathedral-free-choice-ring', 'cathedral-reset-choice-ring']) {
      const ring = this.group?.getObjectByName?.(name);
      if (!ring?.visible) continue;
      ring.rotation.z += dt * (name.includes('free') ? .34 : -.34);
      ring.scale.setScalar(1 + Math.sin(this._pulse * 4.2 + (name.includes('free') ? 0 : Math.PI)) * .045);
    }
    const observer = this.storyObserver;
    if (observer?.root?.visible && observer.refs?.headPivot) {
      let targetYaw = observer.headYaw;
      let targetPitch = observer.headPitch;
      if (playerObject?.position) {
        observer.root.updateMatrixWorld(true);
        this._storyObserverTarget.copy(playerObject.position);
        observer.root.worldToLocal(this._storyObserverTarget);
        const targetX = this._storyObserverTarget.x - observer.refs.headPivot.position.x;
        const targetY = this._storyObserverTarget.y - observer.refs.headPivot.position.y;
        const targetZ = this._storyObserverTarget.z - observer.refs.headPivot.position.z;
        const horizontalDistance = Math.hypot(targetX, targetZ);
        targetYaw = Math.max(-.52, Math.min(.52, Math.atan2(targetX, targetZ)));
        targetPitch = Math.max(.08, Math.min(.5, Math.atan2(-targetY, horizontalDistance)));
      }
      // The observer never snaps or wanders: its gaze continuously eases toward
      // the player's current position with the inertia expected at this scale.
      const response = 1 - Math.exp(-dt * .55);
      observer.headYaw += (targetYaw - observer.headYaw) * response;
      observer.headPitch += (targetPitch - observer.headPitch) * response;
      const breath = Math.sin(this._pulse * .74) * .65 + Math.sin(this._pulse * .31 + 1.4) * .35;
      const weightShift = Math.sin(this._pulse * .43 + .8);
      observer.refs.headPivot.rotation.y = observer.headYaw;
      observer.refs.headPivot.rotation.x = observer.headPitch + Math.sin(this._pulse * .61) * .006;
      observer.refs.headPivot.rotation.z = weightShift * .009;
      if (observer.refs.torso) {
        observer.refs.torso.position.y = 2.43 + breath * .012;
        observer.refs.torso.rotation.x = (observer.config.pose === 'border-lean' ? .27 : 0) + breath * .009;
        observer.refs.torso.rotation.z = weightShift * .006;
      }
      if (observer.config.pose === 'border-lean') {
        observer.refs.leftShoulder.rotation.x = breath * .006;
        observer.refs.rightShoulder.rotation.x = -breath * .006;
        observer.refs.leftArm.rotation.x = -1.15 + breath * .007 + weightShift * .004;
        observer.refs.rightArm.rotation.x = -1.15 + breath * .007 - weightShift * .004;
        observer.refs.leftFist.rotation.z = Math.max(0, Math.sin(this._pulse * .52)) * .012;
        observer.refs.rightFist.rotation.z = -Math.max(0, Math.sin(this._pulse * .52 + Math.PI)) * .012;
      }
      if (observer.refs.visorMaterial) {
        const scan = Math.max(0, Math.sin(this._pulse * 1.37 + Math.sin(this._pulse * .19)));
        observer.refs.visorMaterial.emissiveIntensity = 2.18 + breath * .08 + scan * .42;
      }
      this._syncStoryObserverHandBlockers();
    }
  }

  _updateContentCourtMotion(dt) {
    for (let index = 1; index <= 3; index += 1) {
      const marker = this.group?.getObjectByName?.(`court-purge-node-ring-${index}`);
      if (!marker?.visible) continue;
      const pulse = 1 + Math.sin(this._pulse * 3.1 + index * 1.8) * .035;
      marker.scale.setScalar(pulse);
      marker.rotation.z += dt * .09 * (index % 2 ? 1 : -1);
      const key = this.group?.getObjectByName?.(`court-purge-node-key-${index}`);
      if (key && Number.isFinite(key.userData?.baseIntensity)) {
        key.intensity = key.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.65 + index * 1.35) * .018);
      }
      const pool = this.group?.getObjectByName?.(`court-purge-node-pool-${index}`);
      if (pool?.material?.uniforms && Number.isFinite(pool.userData?.baseOpacity)) {
        pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity * (1 + Math.sin(this._pulse * 1.4 + index) * .025);
      }
    }
    const daisKey = this.group?.getObjectByName?.('court-verdict-lectern-key');
    if (daisKey && Number.isFinite(daisKey.userData?.baseIntensity)) {
      daisKey.intensity = daisKey.userData.baseIntensity * (1 + Math.sin(this._pulse * 1.1) * .012);
    }
    const strikeGrid = this.group?.getObjectByName?.('court-strike-grid');
    if (strikeGrid?.visible && strikeGrid.material) {
      strikeGrid.material.opacity = .7 + Math.max(0, Math.sin(this._pulse * 4.5)) * .2;
    }
  }

  _updateMirrorGardenMotion(dt) {
    const horizontal = this.group?.getObjectByName?.('horizontal_pulse_ring');
    const vertical = this.group?.getObjectByName?.('vertical_split_ring');
    if (horizontal?.parent?.parent?.visible !== false && horizontal) {
      horizontal.rotation.y += dt * .72;
      const pulse = 1 + Math.sin(this._pulse * 3.4) * .055;
      horizontal.scale.setScalar(pulse);
    }
    if (vertical?.parent?.parent?.visible !== false && vertical) {
      vertical.rotation.z -= dt * .58;
      vertical.scale.setScalar(1 + Math.sin(this._pulse * 2.8 + 1.2) * .045);
    }
    for (let index = 1; index <= 3; index += 1) {
      const marker = this.group?.getObjectByName?.(`mirror-generation-ring-${index}`);
      if (!marker?.visible) continue;
      marker.rotation.z += dt * (.025 + index * .012) * (index % 2 ? 1 : -1);
    }
    let mastIndex = 0;
    this.group?.traverse?.(object => {
      if (!object.isSpotLight || !object.name.startsWith('mirror-mast-key-')) return;
      if (Number.isFinite(object.userData?.baseIntensity)) {
        object.intensity = object.userData.baseIntensity
          * (1 + Math.sin(this._pulse * 1.45 + mastIndex * 1.17) * .022);
      }
      mastIndex += 1;
    });
    for (const name of [
      'mirror-generation-pool-1', 'mirror-generation-pool-2', 'mirror-generation-pool-3',
      'mirror-boss-core-pool', 'mirror-boss-rim-pool'
    ]) {
      const pool = this.group?.getObjectByName?.(name);
      if (!pool?.visible || !pool.material?.uniforms?.uOpacity || !Number.isFinite(pool.userData?.baseOpacity)) continue;
      pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity
        * (1 + Math.sin(this._pulse * (name.includes('boss') ? 3.1 : 1.9) + name.length * .17) * (name.includes('boss') ? .08 : .045));
    }
    const splitKey = this.group?.getObjectByName?.('mirror-split-ring-key');
    if (splitKey?.visible && Number.isFinite(splitKey.userData?.baseIntensity)) {
      splitKey.intensity = splitKey.userData.baseIntensity * (1 + Math.sin(this._pulse * 3.15) * .075);
    }
  }

  _updateEnemyReadability() {
    if (!this.enemyReadabilityMesh || !this.enemyManager?.enemies) return;
    const ringDummy = this._readabilityRingDummy;
    let index = 0;
    for (const root of this.enemyManager.enemies) {
      if (!root?.position || index >= 96 || root.userData?.type?.startsWith?.('boss_')) continue;
      const type = root.userData?.type || '';
      const radius = type === 'tank' || type === 'warden' ? 1.35 : (type === 'gruntling' ? .72 : 1);
      const pulse = 1 + Math.sin(this._pulse * 4.2 + index * .9) * .055;
      ringDummy.position.set(root.position.x, .085, root.position.z);
      ringDummy.rotation.set(-Math.PI / 2, 0, 0);
      ringDummy.scale.setScalar(radius * pulse);
      ringDummy.updateMatrix();
      this.enemyReadabilityMesh.setMatrixAt(index, ringDummy.matrix);
      const roleColors = this.enemyReadabilityMesh.userData?.roleColors;
      if (roleColors && this.enemyReadabilityMesh.setColorAt) {
        this.enemyReadabilityMesh.setColorAt(index, roleColors[type] || roleColors.grunt);
      }
      if (this.enemyContactShadowMesh) {
        ringDummy.position.y = .061;
        ringDummy.scale.set(radius * .92, radius * .62, 1);
        ringDummy.updateMatrix();
        this.enemyContactShadowMesh.setMatrixAt(index, ringDummy.matrix);
      }
      index += 1;
    }
    this.enemyReadabilityMesh.count = index;
    this.enemyReadabilityMesh.instanceMatrix.needsUpdate = true;
    if (this.enemyReadabilityMesh.instanceColor) this.enemyReadabilityMesh.instanceColor.needsUpdate = true;
    if (this.enemyContactShadowMesh) {
      this.enemyContactShadowMesh.count = index;
      this.enemyContactShadowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _applyWaveVisualState(wave, liberated = false) {
    if (!this.group) return;
    if (this.definition?.id === 'floodgate-continuity') {
      this._applyFloodgateWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'sandstorm-expanse') {
      this._applyExpanseWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'server-cathedral') {
      this._applyServerCathedralWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'sanitizer-spire') {
      this._applySanitizerWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'content-court') {
      this._applyContentCourtWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'mirror-garden') {
      this._applyMirrorGardenWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'freight-annex') {
      this._applyFreightWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'trend-wastes') {
      this._applyTrendWastesWaveVisualState(wave, liberated);
      return;
    }
    if (this.definition?.id === 'ad-zone-arena') {
      this._applyAdZoneWaveVisualState(wave, liberated);
      return;
    }
    const signal = liberated
      ? { color: 0xc7ff36, emissive: 0x4f6f08, intensity: 1.65 }
      : ({
          1: { color: 0xa52d35, emissive: 0x41070a, intensity: .9 },
          2: { color: 0xff4f46, emissive: 0x6e0b08, intensity: 1.35 },
          3: { color: 0x43cbd0, emissive: 0x0b5255, intensity: 1.25 },
          4: { color: 0xd0ff45, emissive: 0x55740a, intensity: 1.8 },
          5: { color: 0xff5948, emissive: 0x71100a, intensity: 1.65 }
        }[wave] || { color: 0xa52d35, emissive: 0x41070a, intensity: .9 });
    const crown = this.group.getObjectByName?.('relay-signal-crown');
    crown?.traverse?.(node => {
      const material = node.material;
      if (!material?.userData?.relaySignal) return;
      material.color.setHex(signal.color);
      material.emissive.setHex(signal.emissive);
      material.emissiveIntensity = signal.intensity;
      material.opacity = wave === 1 && !liberated ? .68 : .92;
    });
    const objectiveRing = this.group.getObjectByName?.('relay-objective-ring');
    if (objectiveRing?.material?.color) {
      objectiveRing.material.color.setHex(signal.color);
      objectiveRing.material.opacity = wave === 1 && !liberated ? .25 : .5;
    }
    const heroProfile = liberated
      ? { key: 0xd9ff92, intensity: 7.2, pool: 0xc7ff36, poolOpacity: .28, beamOpacity: .105 }
      : ({
          1: { key: 0xffcf9a, intensity: 4.8, pool: 0xffc97e, poolOpacity: .19, beamOpacity: .042 },
          2: { key: 0xffbd8a, intensity: 5.2, pool: 0xffb870, poolOpacity: .2, beamOpacity: .05 },
          3: { key: 0xffd0a3, intensity: 5.8, pool: 0xf5c98c, poolOpacity: .23, beamOpacity: .062 },
          4: { key: 0xe2ffa9, intensity: 6.2, pool: 0xd0ff45, poolOpacity: .25, beamOpacity: .08 },
          5: { key: 0xffaa8c, intensity: 6.4, pool: 0xff8f70, poolOpacity: .24, beamOpacity: .075 }
        }[wave] || { key: 0xffcf9a, intensity: 4.8, pool: 0xffc97e, poolOpacity: .19, beamOpacity: .042 });
    const mastKey = this.group.getObjectByName?.('relay-mast-key');
    if (mastKey) {
      mastKey.color.setHex(heroProfile.key);
      mastKey.intensity = heroProfile.intensity;
      mastKey.userData.baseIntensity = heroProfile.intensity;
    }
    const mastPool = this.group.getObjectByName?.('relay-mast-hero-pool');
    if (mastPool?.material?.uniforms) {
      mastPool.material.uniforms.uColor.value.setHex(heroProfile.pool);
      mastPool.material.uniforms.uOpacity.value = heroProfile.poolOpacity;
    }
    const mastBeam = this.group.getObjectByName?.('relay-mast-signal-beam');
    if (mastBeam?.material?.color) {
      mastBeam.material.color.setHex(signal.color);
      mastBeam.material.opacity = heroProfile.beamOpacity;
    }
    const wet = wave >= 3 && !liberated;
    const surge = wave >= 4 && !liberated;
    const infestation = wave === 5 && !liberated;
    const alarm = wave >= 2 && !liberated;
    const setVisible = (name, visible) => {
      const object = this.group.getObjectByName?.(name);
      if (object) object.visible = visible;
    };
    setVisible('relay-rain-sheen', wet);
    setVisible('relay-alarm-beacons', alarm);
    setVisible('relay-signal-surge', surge);
    setVisible('relay-infestation-veins', infestation);
    const materials = this.relayMaterials;
    if (materials) {
      materials.asphalt.color.setHex(liberated ? 0x536159 : (wet ? 0x354441 : 0x46514d));
      materials.asphalt.roughness = wet ? .4 : .84;
      materials.asphalt.metalness = wet ? .16 : .025;
      materials.plaza.color.setHex(liberated ? 0x89978c : (wet ? 0x63716d : 0x707a74));
      materials.plaza.roughness = wet ? .56 : .9;
    }
    if (this.forestFogMaterial) {
      const forestFog = liberated
        ? { color: 0x789184, density: .34 }
        : ({
            1: { color: 0x748781, density: .42 },
            2: { color: 0x6c807a, density: .44 },
            3: { color: 0x64797a, density: .47 },
            4: { color: 0x596e70, density: .5 },
            5: { color: 0x4d5e63, density: .54 }
          }[wave] || { color: 0x748781, density: .42 });
      this.forestFogMaterial.color.setHex(forestFog.color);
      this.forestFogMaterial.opacity = forestFog.density;
    }
    const lightPools = this.group.getObjectByName?.('relay-light-pools');
    if (lightPools?.material?.uniforms?.uOpacity) {
      lightPools.material.uniforms.uOpacity.value = liberated ? .3 : (wet ? .27 : (wave >= 4 ? .26 : .22));
    }
    const lightMastBeams = this.group.getObjectByName?.('relay-lightmast-beams');
    if (lightMastBeams?.material?.uniforms?.uOpacity) {
      lightMastBeams.material.uniforms.uOpacity.value = liberated ? .045 : (wet ? .036 : (wave >= 2 ? .032 : .03));
    }
  }

  _applyFloodgateWaveVisualState(wave, liberated = false) {
    const campaignWave = wave;
    wave -= Number(this.definition?.waveOffset) || 0;
    const chapter = wave <= 57 ? 1 : wave <= 64 ? 2 : 3;
    this._setGroupVisible('archiveSeeds', !liberated && chapter === 3);
    this._setGroupVisible('greywaterCore', liberated || chapter === 3);
    this._setTaggedCollidersActive('archiveSeedActive', !liberated && chapter === 3);
    this._setTaggedCollidersActive('greywaterCoreActive', liberated || chapter === 3);
    if (liberated) {
      this._setVariantFamily('floodgate', 'damaged');
      this._setVariantFamily('archiveSeed', 'destroyed');
      this._setTaggedCollidersActive('floodgateClosedCollider', false);
      this._setTaggedCollidersActive('floodgateOpeningCollider', false);
      this._setTaggedCollidersActive('floodgateLockedCollider', false);
      this._setTaggedCollidersActive('floodgateDamagedCollider', true);
    }
    const materials = this.floodgateMaterials;
    if (materials) {
      const profiles = {
        1: { deck: 0x465154, channel: 0x303b3d, water: 0x317f89 },
        2: { deck: 0x404c50, channel: 0x293739, water: 0x267581 },
        3: { deck: 0x394449, channel: 0x242f34, water: 0x225e70 }
      };
      const profile = liberated ? { deck: 0x51605c, channel: 0x344849, water: 0x3d8d89 } : profiles[chapter];
      materials.deck.color.setHex(profile.deck);
      materials.channel.color.setHex(profile.channel);
      materials.water.color.setHex(profile.water);
      materials.waterHigh.color.setHex(profile.water);
    }
    const water = this.definition?.waterByWave?.[campaignWave] || 'dry';
    const nextWater = liberated ? 'dry' : (this.definition?.waterByWave?.[Math.min(this.definition.finalWave, campaignWave + 1)] || water);
    const previewColors = {
      dry: 0x7be8df,
      low: 0x68ddd9,
      medium: 0xf0bd62,
      high: 0xff8268
    };
    const profile = liberated
      ? { mast: 4.7, mastPool: .075, gate: 2.35, gatePool: .085, seed: 0, seedPool: 0, core: 3.0, corePool: .15 }
      : chapter === 1
        ? { mast: 5.7, mastPool: .095, gate: 2.9, gatePool: .105, seed: 0, seedPool: 0, core: 0, corePool: 0 }
        : chapter === 2
          ? { mast: 5.45, mastPool: .09, gate: 3.2, gatePool: .115, seed: 0, seedPool: 0, core: 0, corePool: 0 }
          : { mast: 5.05, mastPool: .085, gate: 3.45, gatePool: .125, seed: 1.85, seedPool: .115, core: wave === 71 ? 4.45 : 0, corePool: wave === 71 ? .18 : 0 };

    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`floodgate-mast-key-${index}`);
      if (key) {
        key.userData.baseIntensity = profile.mast;
        key.intensity = profile.mast;
      }
      const pool = this.group?.getObjectByName?.(`floodgate-mast-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.userData.baseOpacity = profile.mastPool;
        pool.material.uniforms.uOpacity.value = profile.mastPool;
      }
    }
    const previewColor = previewColors[nextWater];
    const gateKey = this.group?.getObjectByName?.('floodgate-gate-status-key');
    if (gateKey) {
      gateKey.color.setHex(previewColor);
      gateKey.userData.baseIntensity = profile.gate;
      gateKey.intensity = profile.gate;
    }
    const gatePool = this.group?.getObjectByName?.('floodgate-gate-pool');
    if (gatePool?.material?.uniforms) {
      gatePool.userData.baseOpacity = profile.gatePool;
      gatePool.material.uniforms.uColor.value.setHex(previewColor);
      gatePool.material.uniforms.uOpacity.value = profile.gatePool;
    }
    const routeOpacity = {
      dry: [.064, .058, .058],
      low: [.066, .055, .058],
      medium: [.07, .045, .062],
      high: [.078, .032, .047]
    }[water];
    for (let index = 1; index <= 3; index += 1) {
      const glows = this.group?.getObjectByName?.(`floodgate-route-glows-${index}`);
      if (glows?.material?.uniforms) {
        glows.userData.baseOpacity = liberated ? .058 : routeOpacity[index - 1];
        glows.material.uniforms.uOpacity.value = glows.userData.baseOpacity;
      }
      const seedKey = this.group?.getObjectByName?.(`floodgate-seed-key-${index}`);
      const seedVisible = !liberated && chapter === 3 && wave < 71;
      if (seedKey) {
        seedKey.visible = seedVisible;
        seedKey.color.setHex(0xb9a3ff);
        seedKey.userData.baseIntensity = seedVisible ? profile.seed : 0;
        seedKey.intensity = seedKey.userData.baseIntensity;
      }
      const seedPool = this.group?.getObjectByName?.(`floodgate-seed-pool-${index}`);
      if (seedPool?.material?.uniforms) {
        seedPool.visible = seedVisible;
        seedPool.userData.baseOpacity = seedVisible ? profile.seedPool : 0;
        seedPool.material.uniforms.uOpacity.value = seedPool.userData.baseOpacity;
      }
    }
    const coreKey = this.group?.getObjectByName?.('floodgate-greywater-core-key');
    const coreVisible = liberated || wave === 71;
    if (coreKey) {
      coreKey.visible = coreVisible;
      coreKey.color.setHex(liberated ? 0xc7ffd9 : 0x8ff4ec);
      coreKey.userData.baseIntensity = coreVisible ? profile.core : 0;
      coreKey.intensity = coreKey.userData.baseIntensity;
    }
    const corePool = this.group?.getObjectByName?.('floodgate-core-pool');
    if (corePool?.material?.uniforms) {
      corePool.visible = coreVisible;
      corePool.userData.baseOpacity = coreVisible ? profile.corePool : 0;
      corePool.material.uniforms.uColor.value.setHex(liberated ? 0xc7ffd9 : 0x72e5df);
      corePool.material.uniforms.uOpacity.value = corePool.userData.baseOpacity;
    }
    this._updateFloodgateObjectiveVisuals();
  }

  _applyExpanseWaveVisualState(wave, liberated = false) {
    wave -= Number(this.definition?.waveOffset) || 0;
    const pressure = liberated ? 0 : clamp01((wave - 41) / 9);
    const profile = liberated
      ? { beaconCalm: 2.15, beaconHeavy: 2.15, beaconPool: .09, pylonCalm: .06, pylonHeavy: .06, sirenCalm: 0, sirenHeavy: 0, sirenPool: 0, mastCalm: 4.6, mastHeavy: 4.6, mastPool: .09, supplyPool: 0, failurePool: 0, monument: 3.2, monumentPool: .17 }
      : {
          beaconCalm: 2.45 + pressure * .75,
          beaconHeavy: 3.25 + pressure * .95,
          beaconPool: .1 + pressure * .018,
          pylonCalm: .052 + pressure * .012,
          pylonHeavy: .078 + pressure * .018,
          sirenCalm: 2.0 + pressure * .65,
          sirenHeavy: 3.25 + pressure * 1.0,
          sirenPool: .09 + pressure * .025,
          mastCalm: 5.1 + pressure * .55,
          mastHeavy: 5.8 + pressure * .65,
          mastPool: .105 + pressure * .012,
          supplyPool: .155,
          failurePool: .17,
          monument: 0,
          monumentPool: 0
        };
    this._setGroupVisible('enduranceComplete', liberated);
    this._setTaggedCollidersActive('enduranceComplete', liberated);
    const hold = this.group?.getObjectByName?.('expanse-supply-hold-ring');
    if (hold) hold.visible = wave === 45 && !liberated;
    for (let index = 1; index <= 2; index += 1) {
      const marker = this.group?.getObjectByName?.(`expanse-failure-ring-${index}`);
      if (marker) marker.visible = wave === 48 && !liberated;
    }
    const gusts = this.group?.getObjectByName?.('expanse-ground-gusts');
    if (gusts?.material) gusts.material.opacity = liberated ? .1 : (wave >= 49 ? .32 : .16);
    for (let index = 1; index <= 3; index += 1) {
      const ring = this.group?.getObjectByName?.(`expanse-beacon-ring-${index}`);
      if (!ring?.material) continue;
      ring.material.emissiveIntensity = liberated ? 1.55 : (wave >= 48 ? 1.08 : .78);
      const key = this.group?.getObjectByName?.(`expanse-beacon-key-${index}`);
      if (key) {
        key.userData.calmIntensity = profile.beaconCalm;
        key.userData.heavyIntensity = profile.beaconHeavy;
        key.intensity = profile.beaconCalm;
      }
      const pool = this.group?.getObjectByName?.(`expanse-beacon-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.userData.calmOpacity = profile.beaconPool;
        pool.userData.heavyOpacity = profile.beaconPool * 1.22;
        pool.userData.baseOpacity = profile.beaconPool;
        pool.material.uniforms.uOpacity.value = profile.beaconPool;
      }
      const pylonGlows = this.group?.getObjectByName?.(`expanse-route-pylon-glows-${index}`);
      if (pylonGlows?.material?.uniforms) {
        pylonGlows.userData.calmOpacity = profile.pylonCalm;
        pylonGlows.userData.heavyOpacity = profile.pylonHeavy;
        pylonGlows.material.uniforms.uOpacity.value = profile.pylonCalm;
      }
    }
    const sirenKey = this.group?.getObjectByName?.('expanse-storm-siren-key');
    if (sirenKey) {
      sirenKey.visible = profile.sirenCalm > 0;
      sirenKey.userData.calmIntensity = profile.sirenCalm;
      sirenKey.userData.heavyIntensity = profile.sirenHeavy;
      sirenKey.intensity = profile.sirenCalm;
    }
    const sirenPool = this.group?.getObjectByName?.('expanse-siren-pool');
    if (sirenPool?.material?.uniforms) {
      sirenPool.visible = profile.sirenPool > 0;
      sirenPool.userData.calmOpacity = profile.sirenPool;
      sirenPool.userData.heavyOpacity = profile.sirenPool * 1.3;
      sirenPool.userData.baseOpacity = profile.sirenPool;
      sirenPool.material.uniforms.uOpacity.value = profile.sirenPool;
    }
    for (let index = 1; index <= 2; index += 1) {
      const key = this.group?.getObjectByName?.(`expanse-mast-key-${index}`);
      if (key) {
        key.userData.calmIntensity = profile.mastCalm;
        key.userData.heavyIntensity = profile.mastHeavy;
        key.intensity = profile.mastCalm;
      }
      const pool = this.group?.getObjectByName?.(`expanse-mast-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.userData.baseOpacity = profile.mastPool;
        pool.material.uniforms.uOpacity.value = profile.mastPool;
      }
    }
    const supplyPool = this.group?.getObjectByName?.('expanse-supply-hold-pool');
    if (supplyPool?.material?.uniforms) {
      supplyPool.visible = !liberated && wave === 45;
      supplyPool.userData.baseOpacity = supplyPool.visible ? profile.supplyPool : 0;
      supplyPool.material.uniforms.uOpacity.value = supplyPool.userData.baseOpacity;
    }
    for (let index = 1; index <= 2; index += 1) {
      const pool = this.group?.getObjectByName?.(`expanse-failure-pool-${index}`);
      if (!pool?.material?.uniforms) continue;
      pool.visible = !liberated && wave === 48;
      pool.userData.baseOpacity = pool.visible ? profile.failurePool : 0;
      pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
    }
    const monumentKey = this.group?.getObjectByName?.('expanse-endurance-monument-key');
    if (monumentKey) {
      monumentKey.visible = liberated;
      monumentKey.userData.calmIntensity = profile.monument;
      monumentKey.userData.heavyIntensity = profile.monument;
      monumentKey.intensity = profile.monument;
    }
    const monumentPool = this.group?.getObjectByName?.('expanse-monument-pool');
    if (monumentPool?.material?.uniforms) {
      monumentPool.visible = liberated;
      monumentPool.userData.baseOpacity = profile.monumentPool;
      monumentPool.material.uniforms.uOpacity.value = profile.monumentPool;
    }
  }

  _applyServerCathedralWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xbaf6dc, emissive: 0x2d7659, intensity: .96, pressure: 0, mastColor: 0xd7ffe6, mast: 5.6, mastPool: .085, windowPool: .075, rootColor: 0xcfffd5, root: 3.0, rootPool: .1, lockPool: 0, choirPool: 0, logicPool: 0, bossPool: 0, entryPool: .048, choice: 2.25, choicePool: .15 }
      : ({
          36: { color: 0x55d8e0, emissive: 0x115a68, intensity: .82, pressure: 0, mastColor: 0xc9f7f4, mast: 7.2, mastPool: .105, windowPool: .105, rootColor: 0xffd08a, root: 0, rootPool: 0, lockPool: 0, choirPool: 0, logicPool: 0, bossPool: 0, entryPool: .055, choice: 0, choicePool: 0 },
          37: { color: 0x74c9ef, emissive: 0x194f76, intensity: .92, pressure: .22, mastColor: 0xccecff, mast: 7.4, mastPool: .11, windowPool: .095, rootColor: 0xffd08a, root: 0, rootPool: 0, lockPool: .105, choirPool: 0, logicPool: 0, bossPool: 0, entryPool: .053, choice: 0, choicePool: 0 },
          38: { color: 0x9a7cff, emissive: 0x39226f, intensity: 1.06, pressure: .48, mastColor: 0xd8d2ff, mast: 6.9, mastPool: .1, windowPool: .105, rootColor: 0xffd08a, root: 0, rootPool: 0, lockPool: .105, choirPool: .135, logicPool: 0, bossPool: 0, entryPool: .05, choice: 0, choicePool: 0 },
          39: { color: 0xf1a24e, emissive: 0x733008, intensity: 1.2, pressure: .72, mastColor: 0xffdfb0, mast: 6.35, mastPool: .092, windowPool: .085, rootColor: 0xffd08a, root: 3.65, rootPool: .125, lockPool: 0, choirPool: 0, logicPool: .135, bossPool: 0, entryPool: .047, choice: 0, choicePool: 0 },
          40: { color: 0xff6574, emissive: 0x82111e, intensity: 1.52, pressure: 1, mastColor: 0xcbd9ff, mast: 5.8, mastPool: .08, windowPool: .065, rootColor: 0xd9baff, root: 4.35, rootPool: .135, lockPool: 0, choirPool: 0, logicPool: 0, bossPool: .12, entryPool: .043, choice: 0, choicePool: 0 }
        }[wave] || { color: 0x55d8e0, emissive: 0x115a68, intensity: .82, pressure: 0, mastColor: 0xc9f7f4, mast: 7.2, mastPool: .105, windowPool: .105, rootColor: 0xffd08a, root: 0, rootPool: 0, lockPool: 0, choirPool: 0, logicPool: 0, bossPool: 0, entryPool: .055, choice: 0, choicePool: 0 });

    const leftLocked = !liberated && wave === 37;
    const rightLocked = !liberated && wave === 38;
    this._setGroupVisible('cathedralLeftLock', leftLocked);
    this._setTaggedCollidersActive('cathedralLeftLock', leftLocked);
    this._setGroupVisible('cathedralRightLock', rightLocked);
    this._setTaggedCollidersActive('cathedralRightLock', rightLocked);
    this._setGroupVisible('choirDressing', !liberated && wave === 38);
    this._setTaggedCollidersActive('choirDressing', !liberated && wave === 38);
    this._setGroupVisible('rootDressing', liberated || wave >= 39);
    this._setTaggedCollidersActive('rootDressing', liberated || wave >= 39);
    this._setGroupVisible('logicDressing', !liberated && wave === 39);
    this._setTaggedCollidersActive('logicDressing', !liberated && wave === 39);
    this._setGroupVisible('endChoice', liberated);
    this._setTaggedCollidersActive('endChoice', liberated);
    const observerHandClearance = wave === 40 || liberated;
    this._setGroupVisible('observerHandClearance', !observerHandClearance);
    this._setTaggedCollidersActive('observerHandClearance', !observerHandClearance);
    if (this.storyObserver?.root) {
      const visibleWaves = this.storyObserver.config.visibleWaves || [];
      const hiddenByEnding = liberated && this.storyObserver.config.hideWhenLiberated !== false;
      this.storyObserver.root.visible = !hiddenByEnding && visibleWaves.includes(wave);
      this._setTaggedCollidersActive('storyObserverHands', this.storyObserver.root.visible && wave === 40);
      if (!this.storyObserver.root.visible && this.storyObserver.refs?.headPivot) {
        this.storyObserver.headYaw = 0;
        this.storyObserver.headPitch = this.storyObserver.config.headPitch ?? .16;
        this.storyObserver.refs.headPivot.rotation.set(this.storyObserver.config.headPitch ?? .16, 0, 0);
      }
    }

    for (let index = 1; index <= 2; index += 1) {
      const key = this.group.getObjectByName?.(`cathedral-mast-key-${index}`);
      if (key) {
        key.color.setHex(profile.mastColor);
        key.userData.baseIntensity = profile.mast;
        key.intensity = profile.mast;
      }
      const pool = this.group.getObjectByName?.(`cathedral-mast-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.userData.baseOpacity = profile.mastPool;
        pool.material.uniforms.uColor.value.setHex(profile.mastColor);
        pool.material.uniforms.uOpacity.value = profile.mastPool;
      }
    }
    for (let index = 1; index <= 3; index += 1) {
      const pool = this.group.getObjectByName?.(`cathedral-window-pool-${index}`);
      if (!pool?.material?.uniforms) continue;
      pool.userData.baseOpacity = profile.windowPool;
      pool.material.uniforms.uOpacity.value = profile.windowPool;
    }
    const leftLockPool = this.group.getObjectByName?.('cathedral-left-lock-pool');
    const rightLockPool = this.group.getObjectByName?.('cathedral-right-lock-pool');
    if (leftLockPool?.material?.uniforms) {
      leftLockPool.visible = leftLocked;
      leftLockPool.userData.baseOpacity = leftLocked ? profile.lockPool : 0;
      leftLockPool.material.uniforms.uOpacity.value = leftLockPool.userData.baseOpacity;
    }
    if (rightLockPool?.material?.uniforms) {
      rightLockPool.visible = rightLocked;
      rightLockPool.userData.baseOpacity = rightLocked ? profile.lockPool : 0;
      rightLockPool.material.uniforms.uOpacity.value = rightLockPool.userData.baseOpacity;
    }
    for (const name of ['cathedral-choir-pool-west', 'cathedral-choir-pool-east']) {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms) continue;
      pool.visible = !liberated && wave === 38;
      pool.userData.baseOpacity = pool.visible ? profile.choirPool : 0;
      pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
    }
    const rootKey = this.group.getObjectByName?.('cathedral-root-core-key');
    if (rootKey) {
      rootKey.visible = profile.root > 0;
      rootKey.color.setHex(profile.rootColor);
      rootKey.userData.baseIntensity = profile.root;
      rootKey.intensity = profile.root;
    }
    const rootPool = this.group.getObjectByName?.('cathedral-root-altar-pool');
    if (rootPool?.material?.uniforms) {
      rootPool.visible = profile.rootPool > 0;
      rootPool.userData.baseOpacity = profile.rootPool;
      rootPool.material.uniforms.uColor.value.setHex(profile.rootColor);
      rootPool.material.uniforms.uOpacity.value = profile.rootPool;
    }
    const bossPool = this.group.getObjectByName?.('cathedral-algorithm-rim-pool');
    if (bossPool?.material?.uniforms) {
      bossPool.visible = !liberated && wave === 40;
      bossPool.userData.baseOpacity = profile.bossPool;
      bossPool.material.uniforms.uColor.value.setHex(profile.color);
      bossPool.material.uniforms.uOpacity.value = profile.bossPool;
    }

    const bossRing = this.group.getObjectByName?.('cathedral-boss-ring');
    if (bossRing?.material) {
      bossRing.visible = liberated || wave === 40;
      bossRing.material.color.setHex(profile.color);
      bossRing.material.emissive?.setHex?.(profile.emissive);
      bossRing.material.emissiveIntensity = profile.intensity;
    }
    const falseTargets = this.group.getObjectByName?.('cathedral-false-targets');
    if (falseTargets?.material) {
      falseTargets.visible = !liberated && wave === 38;
      falseTargets.material.emissiveIntensity = profile.intensity;
    }
    for (let index = 1; index <= 3; index += 1) {
      const marker = this.group.getObjectByName?.(`cathedral-logic-node-ring-${index}`);
      if (!marker?.material) continue;
      marker.visible = !liberated && wave === 39;
      marker.material.emissiveIntensity = .9 + profile.pressure * .35;
      const pool = this.group.getObjectByName?.(`cathedral-logic-node-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.visible = marker.visible;
        pool.userData.baseOpacity = pool.visible ? profile.logicPool : 0;
        pool.material.uniforms.uOpacity.value = pool.userData.baseOpacity;
      }
    }
    for (const name of ['cathedral-free-choice-ring', 'cathedral-reset-choice-ring']) {
      const ring = this.group.getObjectByName?.(name);
      if (ring) ring.visible = liberated;
    }
    const choiceKey = this.group.getObjectByName?.('cathedral-choice-beacon-key');
    if (choiceKey) {
      choiceKey.visible = liberated;
      choiceKey.userData.baseIntensity = profile.choice;
      choiceKey.intensity = profile.choice;
    }
    for (const name of ['cathedral-free-choice-pool', 'cathedral-reset-choice-pool']) {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms) continue;
      pool.visible = liberated;
      pool.userData.baseOpacity = profile.choicePool;
      pool.material.uniforms.uOpacity.value = profile.choicePool;
    }
    for (const name of ['cathedral-entry-pool-west', 'cathedral-entry-pool-east']) {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms) continue;
      pool.userData.baseOpacity = profile.entryPool;
      pool.material.uniforms.uOpacity.value = profile.entryPool;
    }
    if (this.cathedralMaterials) {
      this.cathedralMaterials.floor.color.setHex(liberated ? 0x465448 : (wave >= 40 ? 0x282b38 : wave >= 38 ? 0x303343 : 0x303746));
      this.cathedralMaterials.crossing.color.setHex(liberated ? 0x58645b : (wave >= 39 ? 0x4c4144 : 0x485263));
      this.cathedralMaterials.altar.color.setHex(liberated ? 0x35473d : (wave === 40 ? 0x332934 : 0x242635));
      this.cathedralMaterials.cyan.emissiveIntensity = liberated ? .62 : .82 + profile.pressure * .18;
      this.cathedralMaterials.purple.emissiveIntensity = liberated ? .62 : .88 + profile.pressure * .22;
      this.cathedralMaterials.orange.emissiveIntensity = liberated ? .62 : .84 + profile.pressure * .26;
      this.cathedralMaterials.logic.emissiveIntensity = liberated ? .48 : .68 + profile.pressure * .32;
    }
  }

  _applySanitizerWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? {
          accent: 0xc9f56b, emissive: 0x426b10, ring: 0xbaf25a,
          key: 0xe2ffb5, keyIntensity: 6.0, facade: 0xd7ffb0, facadeOpacity: .14,
          court: 0xd1f58f, courtOpacity: .18,
          foundation: 0x303b35, press: 0x87958b, sterile: 0xcbd4c7, dark: 0x35403a, frame: 0x59655d
        }
      : ({
          6: {
            accent: 0x66d8d3, emissive: 0x0b4c4d, ring: 0xc84d49,
            key: 0xcffff5, keyIntensity: 4.5, facade: 0xbff9ef, facadeOpacity: .095,
            court: 0xcaf8f0, courtOpacity: .12,
            foundation: 0x293334, press: 0x7d8985, sterile: 0xc1c9c4, dark: 0x313c3e, frame: 0x56615f
          },
          7: {
            accent: 0x59c8c7, emissive: 0x0a4447, ring: 0xff675d,
            key: 0xb9ece6, keyIntensity: 4.25, facade: 0x9fe9e2, facadeOpacity: .08,
            court: 0x80dcd7, courtOpacity: .095,
            foundation: 0x222c2e, press: 0x6d7875, sterile: 0xb1bbb6, dark: 0x2b3638, frame: 0x4d5957
          },
          8: {
            accent: 0xcbed50, emissive: 0x405609, ring: 0xcbed50,
            key: 0xdfffa6, keyIntensity: 5.2, facade: 0xd4ff9f, facadeOpacity: .115,
            court: 0xc9f47a, courtOpacity: .145,
            foundation: 0x2b3434, press: 0x87928e, sterile: 0xc7cec8, dark: 0x34403f, frame: 0x5b6660
          },
          9: {
            accent: 0xff655a, emissive: 0x65110d, ring: 0xff5b50,
            key: 0xa8dfda, keyIntensity: 4.0, facade: 0x88d4d0, facadeOpacity: .07,
            court: 0x65c5c2, courtOpacity: .08,
            foundation: 0x20292b, press: 0x687370, sterile: 0xaab4af, dark: 0x293335, frame: 0x485351
          },
          10: {
            accent: 0xff6c60, emissive: 0x6b120e, ring: 0xff5f52,
            key: 0xffaa9a, keyIntensity: 5.8, facade: 0xff8f7d, facadeOpacity: .115,
            court: 0xff796c, courtOpacity: .16,
            foundation: 0x211f22, press: 0x686c6b, sterile: 0xafa9a4, dark: 0x302a2c, frame: 0x514648
          }
        }[wave] || {
          accent: 0x66d8d3, emissive: 0x0b4c4d, ring: 0xc84d49,
          key: 0xcffff5, keyIntensity: 4.5, facade: 0xbff9ef, facadeOpacity: .095,
          court: 0xcaf8f0, courtOpacity: .12,
          foundation: 0x293334, press: 0x7d8985, sterile: 0xc1c9c4, dark: 0x313c3e, frame: 0x56615f
        });

    const heroKey = this.group.getObjectByName?.('spire-hero-key');
    if (heroKey) {
      heroKey.color.setHex(profile.key);
      heroKey.intensity = profile.keyIntensity;
      heroKey.userData.baseIntensity = profile.keyIntensity;
    }
    const facadeWash = this.group.getObjectByName?.('spire-facade-wash');
    if (facadeWash?.material?.uniforms) {
      facadeWash.material.uniforms.uColor.value.setHex(profile.facade);
      facadeWash.material.uniforms.uOpacity.value = profile.facadeOpacity;
    }
    const courtPool = this.group.getObjectByName?.('spire-court-light-pool');
    if (courtPool?.material?.uniforms) {
      courtPool.material.uniforms.uColor.value.setHex(profile.court);
      courtPool.material.uniforms.uOpacity.value = profile.courtOpacity;
    }
    const objectiveRing = this.group.getObjectByName?.('relay-objective-ring');
    if (objectiveRing?.material) {
      objectiveRing.material.color?.setHex?.(profile.ring);
      objectiveRing.material.emissive?.setHex?.(profile.emissive);
      objectiveRing.material.emissiveIntensity = liberated ? .72 : (wave === 10 ? 1.15 : .68);
    }
    for (const target of this.definition.objectives?.suppressionNodes || []) {
      const targetRing = this.group.getObjectByName?.(`spire-suppression-ring:${target.id}`);
      if (!targetRing?.material) continue;
      targetRing.visible = !liberated && wave === 8;
      targetRing.material.color?.setHex?.(profile.accent);
      targetRing.material.emissive?.setHex?.(profile.emissive);
      targetRing.material.emissiveIntensity = wave === 8 ? 1.05 : .52;
    }
    const materials = this.sanitizerMaterials;
    if (materials) {
      materials.foundation.color.setHex(profile.foundation);
      materials.press.color.setHex(profile.press);
      materials.sterile.color.setHex(profile.sterile);
      materials.dark.color.setHex(profile.dark);
      materials.frame.color.setHex(profile.frame);
      materials.cyan.emissiveIntensity = liberated ? .56 : (wave === 8 ? .82 : .55);
      materials.red.emissiveIntensity = liberated ? .42 : (wave >= 9 ? .82 : .52);
      materials.acid.emissiveIntensity = liberated ? .58 : (wave === 8 ? 1.05 : .52);
    }
    this._updateSanitizerObjectiveLighting();
  }

  _updateSanitizerObjectiveLighting() {
    if (this.definition?.id !== 'sanitizer-spire' || !this.group) return;
    const state = this.objectiveState;
    const activeWave = this.liberationTime <= 0 && state?.kind === 'multi-capture' && state.wave === 8;
    const targets = this.definition.objectives?.suppressionNodes || [];
    for (const [index, target] of targets.entries()) {
      const pool = this.group.getObjectByName?.(`spire-suppression-pool:${target.id}`);
      const volume = this.group.getObjectByName?.(`spire-suppression-volume:${target.id}`);
      if (pool) pool.visible = activeWave;
      if (volume) volume.visible = activeWave;
      if (!activeWave) continue;
      const targetState = state.targets?.find(item => item.id === target.id);
      const complete = !!targetState?.complete;
      const focused = state.activeTargetKey === target.nameKey;
      const contested = focused && state.contested;
      const progress = targetState ? clamp01(targetState.progress / targetState.seconds) : 0;
      const pulse = .5 + .5 * Math.sin(this._pulse * (focused ? 4.8 : 2.2) + index * 1.7);
      const color = complete ? 0x8df58d : contested ? 0xff594f : (pool?.userData?.baseColor || 0xcbed50);
      if (pool?.material?.uniforms) {
        pool.material.uniforms.uColor.value.setHex(color);
        pool.material.uniforms.uOpacity.value = complete
          ? .075
          : .15 + progress * .035 + (focused ? .045 : 0) + pulse * .012;
      }
      if (volume?.material?.uniforms) {
        volume.material.uniforms.uColor.value.setHex(color);
        volume.material.uniforms.uOpacity.value = complete
          ? .008
          : .021 + progress * .008 + (focused ? .009 : 0) + pulse * .003;
      }
    }
  }

  _applyAdZoneWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xc8ff52, emissive: 0x4b6f0b, intensity: 1.35, speed: .08 }
      : ({
          11: { color: 0x43d9d2, emissive: 0x0a5553, intensity: .9, speed: .11 },
          12: { color: 0xe65392, emissive: 0x5c0d32, intensity: 1.05, speed: .15 },
          13: { color: 0xffa33b, emissive: 0x6a2b08, intensity: 1.25, speed: .18 },
          14: { color: 0xf15a4f, emissive: 0x64100b, intensity: 1.35, speed: .22 },
          15: { color: 0xff7346, emissive: 0x73180a, intensity: 1.55, speed: .25 }
        }[wave] || { color: 0x43d9d2, emissive: 0x0a5553, intensity: .9, speed: .11 });
    this.adCoverSpeed = profile.speed;
    const courtRing = this.group.getObjectByName?.('adzone-court-ring');
    if (courtRing?.material) {
      courtRing.material.color.setHex(liberated ? 0xc8ff52 : 0xff9b35);
      courtRing.material.emissive?.setHex?.(liberated ? 0x4b6f0b : 0x6a2b08);
      courtRing.material.emissiveIntensity = liberated ? 1.2 : .84;
    }
    const sponsorRing = this.group.getObjectByName?.('adzone-sponsor-ring');
    if (sponsorRing?.material) {
      sponsorRing.visible = liberated || wave === 13;
      sponsorRing.material.color.setHex(liberated ? 0xc8ff52 : 0x43d9d2);
      sponsorRing.material.emissive?.setHex?.(liberated ? 0x4b6f0b : 0x0a5553);
      sponsorRing.material.emissiveIntensity = liberated ? 1.2 : .88;
    }
    const screens = this.group.getObjectByName?.('adzone-skyline-screens');
    if (screens?.material) {
      screens.material.color.setHex(profile.color);
      screens.material.emissive?.setHex?.(profile.emissive);
      screens.material.emissiveIntensity = profile.intensity * .55;
      screens.material.opacity = liberated ? .42 : .7;
    }
    const materials = this.adZoneMaterials;
    if (materials) {
      materials.plaza.color.setHex(liberated ? 0x707a70 : (wave >= 14 ? 0x54595d : 0x62666a));
      materials.foundation.color.setHex(liberated ? 0x303a34 : (wave === 15 ? 0x22272a : 0x282d30));
    }
    const courtPool = this.group.getObjectByName?.('adzone-court-light-pool');
    if (courtPool?.material?.uniforms) {
      const courtColor = liberated ? 0xc8ff82 : (wave === 15 ? 0xff7650 : (wave === 14 ? 0xff8a6a : 0xffb45c));
      courtPool.material.uniforms.uColor.value.setHex(courtColor);
      courtPool.material.uniforms.uOpacity.value = liberated ? .11 : (wave === 15 ? .14 : (wave === 14 ? .095 : .075));
    }
    const courtKey = this.group.getObjectByName?.('adzone-court-key');
    if (courtKey) {
      courtKey.color.setHex(liberated ? 0xd9ffab : (wave >= 14 ? 0xff9775 : 0xffc47c));
      courtKey.userData.baseIntensity = liberated ? 2.5 : (wave === 15 ? 3.2 : (wave === 14 ? 2.55 : 2.15));
      courtKey.intensity = courtKey.userData.baseIntensity;
    }
    const bossColumn = this.group.getObjectByName?.('adzone-boss-air-column');
    if (bossColumn) bossColumn.visible = !liberated && wave === 15;
    const mastPools = this.group.getObjectByName?.('adzone-lightmast-pools');
    if (mastPools?.material?.uniforms) mastPools.material.uniforms.uOpacity.value = liberated ? .13 : (wave >= 14 ? .19 : .16);
    const mastBeams = this.group.getObjectByName?.('adzone-lightmast-beams');
    if (mastBeams?.material?.uniforms) mastBeams.material.uniforms.uOpacity.value = liberated ? .016 : (wave >= 14 ? .027 : .022);
    for (let index = 1; index <= 2; index++) {
      const key = this.group.getObjectByName?.(`adzone-lightmast-key-${index}`);
      if (!key) continue;
      key.userData.baseIntensity = liberated ? 1.25 : (wave >= 14 ? 1.8 : 1.55);
      key.intensity = key.userData.baseIntensity;
    }
    this._updateAdZoneObjectiveLighting();
  }

  _updateAdZoneObjectiveLighting() {
    if (this.definition?.id !== 'ad-zone-arena' || !this.group) return;
    const state = this.objectiveState;
    const liberated = this.liberationTime > 0 || state?.kind === 'liberation';
    const active = !liberated && state?.kind === 'sponsor' && state.wave === 13;
    const visible = liberated || active;
    const progress = active ? clamp01(state.progress || 0) : 0;
    const contested = active && state.contested;
    const complete = active && state.complete;
    const pulse = .5 + .5 * Math.sin(this._pulse * (contested ? 7.2 : 2.8));
    const poolColor = liberated || complete ? 0xc8ff63 : (contested ? 0xff554b : 0xffa548);
    const volumeColor = liberated || complete ? 0xaaff7a : (contested ? 0xff6258 : 0x62e5df);
    const pool = this.group.getObjectByName?.('adzone-sponsor-light-pool');
    const volume = this.group.getObjectByName?.('adzone-sponsor-light-volume');
    const key = this.group.getObjectByName?.('adzone-sponsor-key');
    const ring = this.group.getObjectByName?.('adzone-sponsor-ring');
    if (pool) pool.visible = visible;
    if (volume) volume.visible = visible;
    if (pool?.material?.uniforms) {
      pool.material.uniforms.uColor.value.setHex(poolColor);
      pool.material.uniforms.uOpacity.value = liberated
        ? .12
        : contested ? .19 + pulse * .045 : .12 + progress * .085 + pulse * .012;
    }
    if (volume?.material?.uniforms) {
      volume.material.uniforms.uColor.value.setHex(volumeColor);
      volume.material.uniforms.uOpacity.value = liberated
        ? .012
        : contested ? .028 + pulse * .009 : .014 + progress * .014 + pulse * .003;
    }
    if (key) {
      key.color.setHex(poolColor);
      key.intensity = visible ? (liberated ? 1.25 : 1.45 + progress * 1.25 + (contested ? pulse * .55 : 0)) : 0;
    }
    if (ring?.material && visible) {
      ring.material.color.setHex(volumeColor);
      ring.material.emissive?.setHex?.(volumeColor);
      ring.material.emissiveIntensity = liberated ? 1.1 : 1.0 + progress * .65 + (contested ? pulse * .45 : 0);
    }
  }

  _applyContentCourtWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xbce890, emissive: 0x356b21, intensity: .95, pressure: 0, daisColor: 0xdbffc6, dais: 2.3, daisPool: .07, nodes: 1.85, nodePool: .072, entryPool: .046, strikePool: 0 }
      : ({
          31: { color: 0x62d9d4, emissive: 0x135e60, intensity: .8, pressure: 0, daisColor: 0xffddb0, dais: 3.0, daisPool: .075, nodes: 2.2, nodePool: .087, entryPool: .058, strikePool: 0 },
          32: { color: 0xe7a34b, emissive: 0x743307, intensity: .9, pressure: .22, daisColor: 0xffd5a6, dais: 3.15, daisPool: .08, nodes: 2.3, nodePool: .09, entryPool: .056, strikePool: 0 },
          33: { color: 0xa987d4, emissive: 0x4b286c, intensity: 1.02, pressure: .5, daisColor: 0xffcfa6, dais: 3.35, daisPool: .085, nodes: 2.4, nodePool: .094, entryPool: .052, strikePool: .055 },
          34: { color: 0xff7c65, emissive: 0x7c1e12, intensity: 1.2, pressure: .76, daisColor: 0xffc2aa, dais: 3.65, daisPool: .09, nodes: 2.5, nodePool: .098, entryPool: .048, strikePool: .075 },
          35: { color: 0xff5c52, emissive: 0x8b100c, intensity: 1.5, pressure: 1, daisColor: 0xffb6a8, dais: 4.15, daisPool: .105, nodes: 2.65, nodePool: .105, entryPool: .044, strikePool: .105 }
        }[wave] || { color: 0x62d9d4, emissive: 0x135e60, intensity: .8, pressure: 0, daisColor: 0xffddb0, dais: 3.0, daisPool: .075, nodes: 2.2, nodePool: .087, entryPool: .058, strikePool: 0 });

    const bossRing = this.group.getObjectByName?.('court-boss-ring');
    if (bossRing?.material) {
      bossRing.visible = liberated || wave === 35;
      bossRing.material.color.setHex(profile.color);
      bossRing.material.emissive?.setHex?.(profile.emissive);
      bossRing.material.emissiveIntensity = profile.intensity;
    }
    const strikeGrid = this.group.getObjectByName?.('court-strike-grid');
    if (strikeGrid?.material) {
      strikeGrid.visible = !liberated && wave >= 33;
      strikeGrid.material.color.setHex(profile.color);
      strikeGrid.material.emissive?.setHex?.(profile.emissive);
      strikeGrid.material.emissiveIntensity = .72 + profile.pressure * .8;
    }
    const strikePool = this.group.getObjectByName?.('court-strike-rim-pool');
    if (strikePool?.material?.uniforms) {
      strikePool.visible = !liberated && wave >= 33;
      strikePool.userData.baseOpacity = profile.strikePool;
      strikePool.material.uniforms.uColor.value.setHex(profile.color);
      strikePool.material.uniforms.uOpacity.value = profile.strikePool;
    }
    const daisKey = this.group.getObjectByName?.('court-verdict-lectern-key');
    if (daisKey) {
      daisKey.color.setHex(profile.daisColor);
      daisKey.userData.baseIntensity = profile.dais;
      daisKey.intensity = profile.dais;
    }
    const daisPool = this.group.getObjectByName?.('court-dais-pool');
    if (daisPool?.material?.uniforms) {
      daisPool.userData.baseOpacity = profile.daisPool;
      daisPool.material.uniforms.uColor.value.setHex(profile.daisColor);
      daisPool.material.uniforms.uOpacity.value = profile.daisPool;
    }
    for (let index = 1; index <= 3; index += 1) {
      const marker = this.group.getObjectByName?.(`court-purge-node-ring-${index}`);
      if (!marker?.material) continue;
      marker.material.emissiveIntensity = liberated ? .45 : .78 + profile.pressure * .32;
      marker.visible = true;
      const key = this.group.getObjectByName?.(`court-purge-node-key-${index}`);
      if (key) {
        key.userData.baseIntensity = profile.nodes;
        key.intensity = profile.nodes;
      }
      const pool = this.group.getObjectByName?.(`court-purge-node-pool-${index}`);
      if (pool?.material?.uniforms) {
        pool.userData.baseOpacity = profile.nodePool;
        pool.material.uniforms.uOpacity.value = profile.nodePool;
      }
    }
    for (const name of ['court-entry-pool-west', 'court-entry-pool-east']) {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms) continue;
      pool.userData.baseOpacity = profile.entryPool;
      pool.material.uniforms.uOpacity.value = profile.entryPool;
    }
    if (this.courtMaterials) {
      this.courtMaterials.chamber.color.setHex(liberated ? 0x666d66 : (wave >= 34 ? 0x4a4b52 : 0x555860));
      this.courtMaterials.loop.color.setHex(liberated ? 0x4c574e : (wave === 35 ? 0x34363d : 0x3d4149));
      this.courtMaterials.center.color.setHex(liberated ? 0x465248 : (wave === 35 ? 0x3f3035 : 0x343740));
      this.courtMaterials.cyan.emissiveIntensity = liberated ? .52 : .82 + profile.pressure * .22;
      this.courtMaterials.orange.emissiveIntensity = liberated ? .52 : .84 + profile.pressure * .28;
      this.courtMaterials.purple.emissiveIntensity = liberated ? .52 : .84 + profile.pressure * .3;
      this.courtMaterials.trim.emissiveIntensity = liberated ? .2 : .32 + profile.pressure * .22;
    }
  }

  _applyMirrorGardenWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xb8f3cf, emissive: 0x2d7053, intensity: .92, fracture: 0 }
      : ({
          26: { color: 0x6fe1de, emissive: 0x145f61, intensity: .78, fracture: 0 },
          27: { color: 0x82cfdf, emissive: 0x205d72, intensity: .86, fracture: 0 },
          28: { color: 0xa984d2, emissive: 0x40245e, intensity: 1.0, fracture: .34 },
          29: { color: 0xd29be8, emissive: 0x672c79, intensity: 1.18, fracture: .72 },
          30: { color: 0xf084dd, emissive: 0x742463, intensity: 1.48, fracture: 1 }
        }[wave] || { color: 0x6fe1de, emissive: 0x145f61, intensity: .78, fracture: 0 });

    for (const name of ['mirror-generation-ring-1', 'mirror-generation-ring-2', 'mirror-generation-ring-3', 'mirror-boss-ring']) {
      const object = this.group.getObjectByName?.(name);
      if (!object?.material) continue;
      object.material.emissive?.setHex?.(profile.emissive);
      object.material.emissiveIntensity = profile.intensity;
    }
    const generationOne = this.group.getObjectByName?.('mirror-generation-ring-1');
    const generationTwo = this.group.getObjectByName?.('mirror-generation-ring-2');
    const generationThree = this.group.getObjectByName?.('mirror-generation-ring-3');
    const bossRing = this.group.getObjectByName?.('mirror-boss-ring');
    if (generationOne) generationOne.visible = !liberated;
    if (generationTwo) generationTwo.visible = !liberated && wave >= 28;
    if (generationThree) generationThree.visible = !liberated && wave >= 29;
    if (bossRing) bossRing.visible = liberated || wave === 30;

    const shards = this.group.getObjectByName?.('mirror-fracture-shards');
    if (shards?.material) {
      shards.visible = !liberated && wave >= 28;
      shards.material.opacity = Math.max(.2, profile.fracture);
      shards.material.transparent = profile.fracture < 1;
      shards.material.emissiveIntensity = .35 + profile.fracture * .95;
    }
    this._setGroupVisible('generationDressing', !liberated && wave >= 27);
    this._setGroupVisible('mirrorBarrier', !liberated && wave < 30);
    if (this.mirrorMaterials) {
      this.mirrorMaterials.lawn.color.setHex(liberated ? 0x607866 : (wave >= 29 ? 0x445a52 : 0x4c6658));
      this.mirrorMaterials.path.color.setHex(liberated ? 0xa8afa7 : (wave >= 28 ? 0x85838f : 0x909693));
      this.mirrorMaterials.center.color.setHex(liberated ? 0x52635c : (wave === 30 ? 0x493f57 : 0x3d4850));
      this.mirrorMaterials.cyan.emissiveIntensity = profile.intensity * .72;
      this.mirrorMaterials.purple.emissiveIntensity = profile.intensity * .8;
    }

    const lighting = liberated
      ? { mast: 6.35, mastPool: .085, entryPool: .08, thresholdPool: 0, generationOne: 0, generationTwo: 0, generationThree: 0, bossKey: 0, bossCore: 0, bossRim: 0 }
      : ({
          26: { mast: 7.2, mastPool: .105, entryPool: .07, thresholdPool: .09, generationOne: .068, generationTwo: 0, generationThree: 0, bossKey: 0, bossCore: 0, bossRim: 0 },
          27: { mast: 7.5, mastPool: .11, entryPool: .075, thresholdPool: .1, generationOne: .075, generationTwo: 0, generationThree: 0, bossKey: 0, bossCore: 0, bossRim: 0 },
          28: { mast: 7.3, mastPool: .105, entryPool: .07, thresholdPool: .11, generationOne: .075, generationTwo: .065, generationThree: 0, bossKey: 0, bossCore: 0, bossRim: 0 },
          29: { mast: 6.8, mastPool: .095, entryPool: .065, thresholdPool: .12, generationOne: .07, generationTwo: .075, generationThree: .07, bossKey: 0, bossCore: 0, bossRim: 0 },
          30: { mast: 5.8, mastPool: .075, entryPool: .05, thresholdPool: 0, generationOne: .05, generationTwo: .065, generationThree: .08, bossKey: 4.4, bossCore: .15, bossRim: .09 }
        }[wave] || { mast: 7.2, mastPool: .105, entryPool: .07, thresholdPool: .09, generationOne: .068, generationTwo: 0, generationThree: 0, bossKey: 0, bossCore: 0, bossRim: 0 });
    const setPool = (name, opacity, visible = opacity > 0) => {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms?.uOpacity) return;
      pool.userData.baseOpacity = opacity;
      pool.material.uniforms.uOpacity.value = opacity;
      pool.visible = visible;
    };
    this.group.traverse?.(object => {
      if (!object.isSpotLight || !object.name.startsWith('mirror-mast-key-')) return;
      object.userData.baseIntensity = lighting.mast;
      object.intensity = lighting.mast;
      object.color.setHex(liberated ? 0xd6f1df : (wave === 30 ? 0xd5f8ee : 0xc7fff3));
      object.visible = lighting.mast > 0;
    });
    ['north-west', 'north-east', 'south-west', 'south-east'].forEach(quadrant => {
      setPool(`mirror-mast-pool-${quadrant}`, lighting.mastPool);
    });
    setPool('mirror-entry-pool-west', lighting.entryPool);
    setPool('mirror-entry-pool-east', lighting.entryPool);
    ['north', 'south', 'west', 'east'].forEach(direction => {
      setPool(`mirror-threshold-pool-${direction}`, lighting.thresholdPool, !liberated && wave < 30);
    });
    setPool('mirror-generation-pool-1', lighting.generationOne, !liberated && lighting.generationOne > 0);
    setPool('mirror-generation-pool-2', lighting.generationTwo, !liberated && lighting.generationTwo > 0);
    setPool('mirror-generation-pool-3', lighting.generationThree, !liberated && lighting.generationThree > 0);
    setPool('mirror-boss-core-pool', lighting.bossCore, !liberated && wave === 30);
    setPool('mirror-boss-rim-pool', lighting.bossRim, !liberated && wave === 30);
    const splitKey = this.group.getObjectByName?.('mirror-split-ring-key');
    if (splitKey) {
      splitKey.userData.baseIntensity = lighting.bossKey;
      splitKey.intensity = lighting.bossKey;
      splitKey.visible = !liberated && wave === 30;
    }
  }

  _applyFreightWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xc9f45b, emissive: 0x496b0a, intensity: 1.25, infection: 0 }
      : ({
          21: { color: 0x49d0c8, emissive: 0x0a4a47, intensity: .78, infection: 0 },
          22: { color: 0xf0b34f, emissive: 0x633207, intensity: .9, infection: 0 },
          23: { color: 0xd6c54b, emissive: 0x4f4707, intensity: 1.0, infection: .56 },
          24: { color: 0xc09f35, emissive: 0x4c3506, intensity: 1.15, infection: .76 },
          25: { color: 0xf06a43, emissive: 0x681408, intensity: 1.45, infection: 1 }
        }[wave] || { color: 0x49d0c8, emissive: 0x0a4a47, intensity: .78, infection: 0 });
    for (const name of ['freight-warm-route-marks', 'freight-boss-ring']) {
      const object = this.group.getObjectByName?.(name);
      if (!object?.material) continue;
      object.material.color.setHex(profile.color);
      object.material.emissive?.setHex?.(profile.emissive);
      object.material.emissiveIntensity = profile.intensity;
    }
    const bossRing = this.group.getObjectByName?.('freight-boss-ring');
    if (bossRing) bossRing.visible = liberated || wave === 25;
    const infection = this.group.getObjectByName?.('freight-infection-veins');
    if (infection?.material) {
      infection.visible = !liberated && wave >= 23;
      infection.material.opacity = profile.infection;
      infection.material.transparent = profile.infection < 1;
    }
    this._setGroupVisible('infectionDressing', !liberated && wave >= 23);
    if (this.freightMaterials) {
      this.freightMaterials.yard.color.setHex(liberated ? 0x52584f : (wave >= 24 ? 0x3c403b : 0x484a45));
      this.freightMaterials.center.color.setHex(liberated ? 0x59614c : (wave === 25 ? 0x57442f : 0x68563a));
      this.freightMaterials.goo.emissiveIntensity = profile.infection * .72;
    }

    const lighting = liberated
      ? { loading: 1.55, west: 1.15, east: 1.15, hatch: .3, vent: .28, infected: 0, nest: 0, breach: 0, loadingPool: .1, westPool: .075, eastPool: .075, hatchPool: .035, ventPool: .03, infectedPool: 0, nestPool: 0, breachPool: 0 }
      : ({
          21: { loading: 2.35, west: 1.45, east: 1.55, hatch: .78, vent: .72, infected: 0, nest: 0, breach: 0, loadingPool: .15, westPool: .105, eastPool: .11, hatchPool: .075, ventPool: .07, infectedPool: 0, nestPool: 0, breachPool: 0 },
          22: { loading: 2.5, west: 1.55, east: 1.7, hatch: 1.0, vent: .95, infected: 0, nest: 0, breach: 0, loadingPool: .16, westPool: .115, eastPool: .12, hatchPool: .105, ventPool: .095, infectedPool: 0, nestPool: 0, breachPool: 0 },
          23: { loading: 2.35, west: 1.5, east: 1.65, hatch: 1.08, vent: 1.05, infected: 1.65, nest: 0, breach: 0, loadingPool: .145, westPool: .11, eastPool: .115, hatchPool: .115, ventPool: .11, infectedPool: .115, nestPool: 0, breachPool: 0 },
          24: { loading: 2.15, west: 1.35, east: 1.45, hatch: 1.25, vent: 1.35, infected: 2.2, nest: 0, breach: 0, loadingPool: .13, westPool: .095, eastPool: .1, hatchPool: .145, ventPool: .15, infectedPool: .165, nestPool: 0, breachPool: 0 },
          25: { loading: 1.65, west: 1.1, east: 1.15, hatch: 1.0, vent: 1.2, infected: 1.2, nest: 2.7, breach: 3.9, loadingPool: .095, westPool: .075, eastPool: .075, hatchPool: .11, ventPool: .13, infectedPool: .1, nestPool: .17, breachPool: .24 }
        }[wave] || { loading: 2.35, west: 1.45, east: 1.55, hatch: .78, vent: .72, infected: 0, nest: 0, breach: 0, loadingPool: .15, westPool: .105, eastPool: .11, hatchPool: .075, ventPool: .07, infectedPool: 0, nestPool: 0, breachPool: 0 });
    const setKey = (name, intensity, color = null) => {
      const key = this.group.getObjectByName?.(name);
      if (!key) return;
      key.userData.baseIntensity = intensity;
      key.intensity = intensity;
      key.visible = intensity > 0;
      if (color != null) key.color.setHex(color);
    };
    const setPool = (name, opacity) => {
      const pool = this.group.getObjectByName?.(name);
      if (!pool?.material?.uniforms?.uOpacity) return;
      pool.material.uniforms.uOpacity.value = opacity;
      pool.visible = opacity > 0;
    };
    setKey('freight-loading-key', lighting.loading, liberated ? 0xdaf0b2 : (wave === 25 ? 0xff9a62 : 0xffbd72));
    setKey('freight-west-service-key', lighting.west, liberated ? 0xbcebd7 : 0x72e4dc);
    setKey('freight-east-service-key', lighting.east, liberated ? 0xd9efba : 0xffb15d);
    setKey('freight-floor-hatch-key', lighting.hatch, liberated ? 0xbadf9c : 0xff6744);
    setKey('freight-rear-vent-key', lighting.vent, liberated ? 0xbadf9c : 0xff6845);
    setKey('freight-infection-key', lighting.infected, wave === 25 ? 0xc6c94b : 0xb8dc52);
    setKey('freight-nest-key', lighting.nest, 0xd6d34b);
    setKey('freight-breach-key', lighting.breach, 0xff7147);
    setPool('freight-loading-pool', lighting.loadingPool);
    setPool('freight-west-service-pool', lighting.westPool);
    setPool('freight-east-service-pool', lighting.eastPool);
    setPool('freight-floor-hatch-pool', lighting.hatchPool);
    setPool('freight-rear-vent-pool', lighting.ventPool);
    setPool('freight-infection-props-pool', lighting.infectedPool);
    setPool('freight-nest-pool', lighting.nestPool);
    setPool('freight-breach-pool', lighting.breachPool);
    if (this.freightMaterials) {
      this.freightMaterials.fixtureWarm.emissiveIntensity = liberated ? 1.25 : 1.65 + lighting.loading * .24;
      this.freightMaterials.fixtureCyan.emissiveIntensity = liberated ? 1.1 : 1.25 + lighting.west * .28;
      this.freightMaterials.fixtureWarning.emissiveIntensity = liberated ? .55 : .7 + Math.max(lighting.hatch, lighting.vent) * .62;
      this.freightMaterials.fixtureInfected.emissiveIntensity = Math.max(lighting.infected, lighting.nest) * .72;
    }
  }

  _applyTrendWastesWaveVisualState(wave, liberated = false) {
    const profile = liberated
      ? { color: 0xc9f26b, emissive: 0x4e6c12, intensity: 1.2, gust: .12, beacon: 0xc9ff8f, beaconIntensity: 4.2, beaconPool: 0xd8ef8d, beaconPoolOpacity: .17, signalOpacity: .022, mast: 1.2, mastPoolOpacity: .11, capture: 1.15, capturePoolOpacity: .095, boss: false }
      : ({
          16: { color: 0x54d2c9, emissive: 0x0b4c48, intensity: .75, gust: .2, beacon: 0xa7fff1, beaconIntensity: 3.5, beaconPool: 0xffc477, beaconPoolOpacity: .15, signalOpacity: .026, mast: 1.45, mastPoolOpacity: .14, capture: 1.35, capturePoolOpacity: .115, boss: false },
          17: { color: 0xe0bb61, emissive: 0x64400c, intensity: .9, gust: .3, beacon: 0xb2fff0, beaconIntensity: 3.85, beaconPool: 0xffc170, beaconPoolOpacity: .16, signalOpacity: .029, mast: 1.55, mastPoolOpacity: .15, capture: 1.45, capturePoolOpacity: .12, boss: false },
          18: { color: 0xf0a94b, emissive: 0x6f3009, intensity: 1.05, gust: .38, beacon: 0xc7fff2, beaconIntensity: 4.4, beaconPool: 0xffb968, beaconPoolOpacity: .175, signalOpacity: .034, mast: 1.7, mastPoolOpacity: .165, capture: 1.6, capturePoolOpacity: .135, boss: false },
          19: { color: 0xf17b4c, emissive: 0x701a09, intensity: 1.25, gust: .5, beacon: 0xffd095, beaconIntensity: 5.0, beaconPool: 0xff9c58, beaconPoolOpacity: .2, signalOpacity: .041, mast: 1.9, mastPoolOpacity: .19, capture: 1.8, capturePoolOpacity: .15, boss: false },
          20: { color: 0x72d9ee, emissive: 0x164f68, intensity: 1.5, gust: .44, beacon: 0xffbe70, beaconIntensity: 4.6, beaconPool: 0xffa35f, beaconPoolOpacity: .18, signalOpacity: .033, mast: 1.6, mastPoolOpacity: .15, capture: 1.75, capturePoolOpacity: .145, boss: true }
        }[wave] || { color: 0x54d2c9, emissive: 0x0b4c48, intensity: .75, gust: .2, beacon: 0xa7fff1, beaconIntensity: 3.5, beaconPool: 0xffc477, beaconPoolOpacity: .15, signalOpacity: .026, mast: 1.45, mastPoolOpacity: .14, capture: 1.35, capturePoolOpacity: .115, boss: false });
    for (const name of ['wastes-route-marks', 'wastes-shard-ring']) {
      const object = this.group.getObjectByName?.(name);
      if (!object?.material) continue;
      object.material.color.setHex(profile.color);
      object.material.emissive?.setHex?.(profile.emissive);
      object.material.emissiveIntensity = profile.intensity;
    }
    const shardRing = this.group.getObjectByName?.('wastes-shard-ring');
    if (shardRing) shardRing.visible = liberated || wave === 20;
    const gusts = this.group.getObjectByName?.('wastes-ground-gusts');
    if (gusts?.material) {
      gusts.material.color.setHex(liberated ? 0xd7e7b2 : profile.color);
      gusts.material.opacity = profile.gust;
    }
    if (this.trendWastesMaterials) {
      this.trendWastesMaterials.road.color.setHex(liberated ? 0x5b5d4f : (wave >= 19 ? 0x454139 : 0x514d43));
      this.trendWastesMaterials.sand.color.setHex(liberated ? 0x958969 : (wave >= 18 ? 0x806d4e : 0x8d7957));
      this.trendWastesMaterials.dust.color.setHex(liberated ? 0x8f8362 : (wave >= 18 ? 0x746247 : 0x79694c));
    }
    const stormKey = this.group.getObjectByName?.('wastes-storm-eye-key');
    if (stormKey) {
      stormKey.color.setHex(profile.beacon);
      stormKey.userData.baseIntensity = profile.beaconIntensity;
      stormKey.intensity = profile.beaconIntensity;
    }
    const stormPool = this.group.getObjectByName?.('wastes-storm-eye-pool');
    if (stormPool?.material?.uniforms) {
      stormPool.material.uniforms.uColor.value.setHex(profile.beaconPool);
      stormPool.material.uniforms.uOpacity.value = profile.beaconPoolOpacity;
    }
    const stormSignal = this.group.getObjectByName?.('wastes-storm-eye-signal');
    if (stormSignal?.material?.uniforms) {
      stormSignal.material.uniforms.uColor.value.setHex(profile.beacon);
      stormSignal.userData.baseOpacity = profile.signalOpacity;
      stormSignal.material.uniforms.uOpacity.value = profile.signalOpacity;
    }
    const mastKey = this.group.getObjectByName?.('wastes-lightmast-key');
    if (mastKey) {
      mastKey.userData.baseIntensity = profile.mast;
      mastKey.intensity = profile.mast;
    }
    const mastPool = this.group.getObjectByName?.('wastes-lightmast-pool');
    if (mastPool?.material?.uniforms) mastPool.material.uniforms.uOpacity.value = profile.mastPoolOpacity;
    const mastBeam = this.group.getObjectByName?.('wastes-lightmast-beam');
    if (mastBeam?.material?.uniforms) mastBeam.material.uniforms.uOpacity.value = profile.mastPoolOpacity * .14;
    const captureKey = this.group.getObjectByName?.('wastes-capture-beacon-key');
    if (captureKey) {
      captureKey.userData.baseIntensity = profile.capture;
      captureKey.intensity = profile.capture;
    }
    const capturePool = this.group.getObjectByName?.('wastes-capture-beacon-pool');
    if (capturePool?.material?.uniforms) capturePool.material.uniforms.uOpacity.value = profile.capturePoolOpacity;
    const shardPool = this.group.getObjectByName?.('wastes-shard-court-pool');
    if (shardPool) shardPool.visible = profile.boss;
    const shardKey = this.group.getObjectByName?.('wastes-shard-court-key');
    if (shardKey) {
      shardKey.userData.baseIntensity = profile.boss ? 3.6 : 0;
      shardKey.intensity = shardKey.userData.baseIntensity;
    }
  }

  _addStoryObserver(config) {
    if (!config) return;
    if (config.model !== 'breaker') {
      this.onWarning?.(`[${this.definition?.id || 'level'}] Unknown story observer model "${config.model}".`);
      return;
    }
    const built = createBreakerObserverAsset({ THREE: this.THREE });
    const root = built.root;
    root.position.set(...config.position);
    root.rotation.y = config.yaw || 0;
    root.scale.setScalar(config.scale || 1);
    root.visible = false;
    root.userData.storyObserverId = config.id;
    root.userData.nonCombat = config.nonCombat !== false;
    if (config.pose === 'border-lean') {
      built.refs.torso.rotation.x = .27;
      built.refs.headPivot.position.set(0, 3.56, .34);
      built.refs.headPivot.rotation.x = config.headPitch ?? .27;
      built.refs.leftArm.rotation.x = -1.15;
      built.refs.rightArm.rotation.x = -1.15;
      for (const lowerPart of built.refs.lowerBody || []) lowerPart.visible = false;
    }
    this.group.add(root);
    const handBlockers = [];
    for (const [side, hand] of [['left', built.refs.leftFist], ['right', built.refs.rightFist]]) {
      this._addCollider({
        id: `breaker-observer-${side}-hand`,
        position: [0, 0, 0],
        size: [1, 1, 1],
        tags: ['storyObserverHands'],
        blocksMovement: true,
        blocksGrounding: false,
        blocksShots: false,
        blocksSight: false,
        blocksSpawn: false
      }, false);
      const blocker = this.colliderObjects[this.colliderObjects.length - 1];
      blocker.userData.storyObserverId = config.id;
      blocker.userData.storyObserverHand = side;
      handBlockers.push({ hand, blocker });
    }
    this.storyObserver = {
      root,
      refs: built.refs,
      config,
      headYaw: 0,
      headPitch: config.headPitch ?? .16,
      handBlockers
    };
    this._syncStoryObserverHandBlockers();
  }

  _syncStoryObserverHandBlockers() {
    const observer = this.storyObserver;
    if (!observer?.handBlockers?.length) return;
    observer.root.updateMatrixWorld(true);
    for (const { hand, blocker } of observer.handBlockers) {
      this._storyObserverHandBounds.makeEmpty().setFromObject(hand);
      if (this._storyObserverHandBounds.isEmpty()) continue;
      this._storyObserverHandBounds.getCenter(this._storyObserverHandCenter);
      this._storyObserverHandBounds.getSize(this._storyObserverHandSize);
      this.group.worldToLocal(this._storyObserverHandCenter);
      blocker.position.copy(this._storyObserverHandCenter);
      blocker.scale.set(
        Math.max(.1, this._storyObserverHandSize.x),
        Math.max(.1, this._storyObserverHandSize.y),
        Math.max(.1, this._storyObserverHandSize.z)
      );
      blocker.updateMatrixWorld(true);
      const debugRoot = blocker.userData.debugColliderRoot;
      if (debugRoot) {
        debugRoot.position.copy(blocker.position);
        debugRoot.scale.copy(blocker.scale);
        debugRoot.updateMatrixWorld(true);
      }
    }
  }

  _addAsset(placement) {
    const root = this.clonePrefab?.(placement.asset);
    if (!root) return;
    root.position.set(...placement.position);
    root.rotation.y = placement.yaw || 0;
    root.scale.setScalar(placement.scale || 1);
    root.name = `relay:${placement.asset}`;
    root.userData.levelAssetId = placement.asset;
    if (placement.variantFamily) {
      root.userData.levelVariantFamily = placement.variantFamily;
      this._setAssetVariant(root, placement.initialVariant || 'closed');
    }
    const mutable = (placement.tags || []).some(tag => ['liberation', 'infestation', 'objective'].includes(tag));
    const relayLit = this.definition?.id === 'relay-district';
    const tutorialLit = this.definition?.id === 'tutorial-yard';
    const sanitizerLit = this.definition?.id === 'sanitizer-spire';
    const adZoneLit = this.definition?.id === 'ad-zone-arena';
    const trendWastesLit = this.definition?.id === 'trend-wastes';
    const freightLit = this.definition?.id === 'freight-annex';
    const mirrorLit = this.definition?.id === 'mirror-garden';
    const courtLit = this.definition?.id === 'content-court';
    const cathedralLit = this.definition?.id === 'server-cathedral';
    const expanseLit = this.definition?.id === 'sandstorm-expanse';
    const floodgateLit = this.definition?.id === 'floodgate-continuity';
    const cisternLit = this.definition?.id === 'blackout-cistern';
    const createLitMaterial = material => {
      const cloned = material.clone();
      if (typeof cloned.onBuild !== 'function') cloned.onBuild = function relayMaterialBuild() {};
      const hasVisibleEmission = cloned.emissive
        && cloned.emissive.getHex() !== 0
        && (cloned.emissiveIntensity ?? 1) >= .2;
      if ((relayLit || tutorialLit || sanitizerLit || adZoneLit || trendWastesLit || freightLit || mirrorLit || courtLit || cathedralLit || expanseLit || floodgateLit || cisternLit) && cloned.isMeshStandardMaterial && cloned.color && !cloned.transparent && !hasVisibleEmission) {
        const hsl = { h: 0, s: 0, l: 0 };
        cloned.color.getHSL(hsl);
        if (hsl.l < .42) {
          const lift = (relayLit || tutorialLit)
            ? (hsl.l < .24 ? .085 : .045)
            : adZoneLit
              ? (hsl.l < .23 ? .075 : .04)
              : freightLit
                ? (hsl.l < .23 ? .07 : .04)
                : mirrorLit
                  ? (hsl.l < .22 ? .06 : .035)
                : courtLit
                  ? (hsl.l < .22 ? .065 : .035)
                : cathedralLit
                  ? (hsl.l < .22 ? .06 : .034)
                : expanseLit
                  ? (hsl.l < .24 ? .085 : .045)
                : floodgateLit
                  ? (hsl.l < .23 ? .075 : .04)
                  : cisternLit
                    ? (hsl.l < .18 ? .04 : .018)
                  : (hsl.l < .22 ? .065 : .035);
          const saturation = (relayLit || tutorialLit) ? .94 : (adZoneLit ? .93 : (freightLit ? .92 : ((mirrorLit || courtLit || cathedralLit) ? .93 : .9)));
          const lightnessCap = sanitizerLit ? .43 : (adZoneLit ? .45 : (freightLit ? .45 : ((mirrorLit || courtLit || cathedralLit) ? .44 : .46)));
          cloned.color.setHSL(hsl.h, hsl.s * saturation, Math.min(lightnessCap, hsl.l + lift));
        }
      }
      return cloned;
    };
    const relayVariant = material => {
      if (mutable) return createLitMaterial(material);
      let variant = this._relayMaterialVariants.get(material);
      if (!variant) {
        variant = createLitMaterial(material);
        this._relayMaterialVariants.set(material, variant);
      }
      return variant;
    };
    root.traverse?.(node => {
      if (!node.isMesh) return;
      if (node.geometry) this._sharedLevelGeometries.add(node.geometry);
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of sourceMaterials) if (material) this._sharedLevelMaterials.add(material);
      node.castShadow = true;
      node.receiveShadow = true;
      if ((mutable || relayLit || sanitizerLit || adZoneLit || trendWastesLit || freightLit || mirrorLit || courtLit || cathedralLit || expanseLit || floodgateLit || cisternLit) && node.material) {
        node.material = Array.isArray(node.material)
          ? node.material.map(relayVariant)
          : relayVariant(node.material);
      }
    });
    this.group.add(root);
    for (const tag of placement.tags || []) {
      if (!this.visualGroups.has(tag)) this.visualGroups.set(tag, []);
      this.visualGroups.get(tag).push(root);
    }
  }

  _addCollider(definition, walkable) {
    const THREE = this.THREE;
    if (!this._colliderGeometries) {
      this._colliderGeometries = Object.freeze({
        box: new THREE.BoxGeometry(1, 1, 1),
        cylinder: new THREE.CylinderGeometry(.5, .5, 1, 12)
      });
      this._colliderMaterials = Object.freeze({
        solid: new THREE.MeshBasicMaterial({ visible: false }),
        walkable: new THREE.MeshBasicMaterial({ visible: false })
      });
      this._colliderRaycasts = Object.freeze({
        box: createAnalyticColliderRaycast(THREE, 'box'),
        cylinder: createAnalyticColliderRaycast(THREE, 'cylinder')
      });
    }
    const shape = definition.shape || 'box';
    const geometry = shape === 'cylinder' ? this._colliderGeometries.cylinder : this._colliderGeometries.box;
    const material = walkable ? this._colliderMaterials.walkable : this._colliderMaterials.solid;
    this._sharedLevelGeometries.add(geometry);
    this._sharedLevelMaterials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.raycast = shape === 'cylinder' ? this._colliderRaycasts.cylinder : this._colliderRaycasts.box;
    if (shape === 'beam') {
      const from = new THREE.Vector3(...definition.from);
      const to = new THREE.Vector3(...definition.to);
      const direction = to.clone().sub(from);
      const length = direction.length();
      mesh.position.copy(from).add(to).multiplyScalar(.5);
      mesh.scale.set(definition.thickness, length, definition.depth ?? definition.thickness);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    } else {
      mesh.position.set(...definition.position);
      mesh.scale.set(...definition.size);
      if (definition.rotation) mesh.rotation.set(...definition.rotation);
    }
    mesh.name = `${walkable ? 'walkable' : 'collider'}:${definition.id}`;
    mesh.userData.relayLevel = true;
    mesh.userData.colliderId = definition.id;
    mesh.userData.colliderShape = shape;
    mesh.userData.colliderAssetId = definition.assetId || null;
    mesh.userData.colliderPrimitiveId = definition.primitiveId || null;
    mesh.userData.colliderTags = [...(definition.tags || [])];
    mesh.userData.colliderActive = true;
    mesh.userData.walkableSurface = walkable;
    mesh.userData.blocksMovement = definition.blocksMovement !== false;
    mesh.userData.blocksGrounding = definition.blocksGrounding !== false;
    mesh.userData.blocksShots = definition.blocksShots !== false;
    mesh.userData.blocksSight = colliderBlocksChannel(definition, 'see');
    mesh.userData.motion = definition.motion || null;
    mesh.userData.motionBaseYaw = definition.motion?.baseYaw || 0;
    if (definition.motion?.baseYaw) mesh.rotation.y = definition.motion.baseYaw;
    mesh.updateMatrixWorld(true);
    this.group.add(mesh);
    this._addColliderDebugOutlines(mesh, definition);
    this.objects.push(mesh);
    (walkable ? this.walkableObjects : this.colliderObjects).push(mesh);
  }

  _addColliderDebugOutlines(mesh, definition) {
    const enabled = [...this.debugColliderChannels].filter(channel => colliderBlocksChannel(definition, channel));
    if (!enabled.length) return;
    const THREE = this.THREE;
    const root = new THREE.Group();
    root.name = `debug:block-box:${definition.id}`;
    root.position.copy(mesh.position);
    root.rotation.copy(mesh.rotation);
    root.quaternion.copy(mesh.quaternion);
    root.scale.copy(mesh.scale);
    root.userData.colliderDebugOnly = true;
    for (const channel of enabled) {
      const meta = BLOCK_BOX_CHANNEL_META[channel];
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: meta.color,
          transparent: true,
          opacity: .96,
          depthTest: false,
          depthWrite: false
        })
      );
      outline.name = `debug:${channel}:${definition.id}`;
      outline.scale.setScalar(meta.scale);
      outline.renderOrder = 1000;
      outline.frustumCulled = false;
      outline.userData.colliderDebugChannel = channel;
      outline.raycast = () => {};
      root.add(outline);
    }
    mesh.userData.debugColliderRoot = root;
    this.group.add(root);
  }

  _setTaggedCollidersActive(tag, active) {
    let changed = false;
    for (const mesh of this.colliderObjects) {
      if (!mesh.userData.colliderTags?.includes(tag) || mesh.userData.colliderActive === active) continue;
      mesh.userData.colliderActive = active;
      mesh.visible = active;
      if (mesh.userData.debugColliderRoot) mesh.userData.debugColliderRoot.visible = active;
      const index = this.objects.indexOf(mesh);
      if (active && index < 0) this.objects.push(mesh);
      if (!active && index >= 0) this.objects.splice(index, 1);
      changed = true;
    }
    if (changed) this.onRefreshColliders?.();
  }

  _setGroupVisible(tag, visible) {
    for (const root of this.visualGroups.get(tag) || []) root.visible = visible;
  }

  _hideArenaBoundaries() {
    this.hiddenArenaBoundaries.length = 0;
    for (const object of this.objects) {
      if (object?.userData?.arenaBoundary !== true) continue;
      this.hiddenArenaBoundaries.push({
        object,
        visible: object.visible,
        blocksMovement: object.userData.blocksMovement,
        blocksShots: object.userData.blocksShots,
        blocksSight: object.userData.blocksSight
      });
      object.visible = false;
      object.userData.blocksMovement = false;
      object.userData.blocksShots = false;
      object.userData.blocksSight = false;
    }
  }

  _restoreArenaBoundaries() {
    for (const entry of this.hiddenArenaBoundaries) {
      entry.object.visible = entry.visible;
      entry.object.userData.blocksMovement = entry.blocksMovement;
      entry.object.userData.blocksShots = entry.blocksShots;
      entry.object.userData.blocksSight = entry.blocksSight;
    }
    this.hiddenArenaBoundaries.length = 0;
  }

  _buildForestHorizon() {
    const THREE = this.THREE;
    const fract = value => value - Math.floor(value);
    const noise = seed => fract(Math.sin(seed * 91.173 + 17.41) * 43758.5453);
    const foregroundTrees = [];
    let seed = 11;
    const addForegroundTree = (x, z, row) => {
      const localSeed = seed++;
      foregroundTrees.push({
        x: x + (noise(localSeed + 7) - .5) * (2.2 + row * .35),
        z: z + (noise(localSeed + 13) - .5) * (1.8 + row * .3),
        scale: .76 + noise(localSeed + 31) * .38 + row * .025,
        yaw: noise(localSeed + 43) * Math.PI * 2,
        seed: localSeed
      });
    };
    const addForegroundRow = row => {
      const spacing = 5.8 + row * .5;
      const depth = 3.1 + row * 3;
      const halfX = 36 + row * 1.7;
      const horizontalCount = Math.ceil(halfX * 2 / spacing);
      for (let index = 0; index <= horizontalCount; index++) {
        const x = -halfX + index * (halfX * 2 / horizontalCount);
        addForegroundTree(x, -28 - depth, row);
        addForegroundTree(x, 28 + depth, row);
      }
      const halfZ = 32 + row * 1.6;
      const verticalCount = Math.ceil(halfZ * 2 / spacing);
      for (let index = 0; index <= verticalCount; index++) {
        const z = -halfZ + index * (halfZ * 2 / verticalCount);
        addForegroundTree(-32 - depth, z, row);
        addForegroundTree(32 + depth, z, row);
      }
    };
    for (let row = 0; row < 4; row++) addForegroundRow(row);

    // Match the existing broadleaf/street-tree grammar: an irregular trunk,
    // visible fork, and three rounded low-poly foliage clusters. Instancing keeps
    // the whole four-row forest at five draw calls instead of cloning ten-mesh props.
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x624f38,
      emissive: 0x18120b,
      emissiveIntensity: .32,
      roughness: 1,
      flatShading: true
    });
    const branchMaterial = trunkMaterial;
    const leafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x63864a, emissive: 0x1d2c16, emissiveIntensity: .48, roughness: 1, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x7d9c50, emissive: 0x283819, emissiveIntensity: .44, roughness: 1, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x6d9147, emissive: 0x213215, emissiveIntensity: .46, roughness: 1, flatShading: true })
    ];
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.34, .52, 1, 7), trunkMaterial, foregroundTrees.length);
    trunkMesh.name = 'relay-forest-trunks';
    const branchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16, .22, 1, 6), branchMaterial, foregroundTrees.length * 2);
    branchMesh.name = 'relay-forest-branches';
    const foliageGeometry = new THREE.IcosahedronGeometry(1, 1);
    const foliageMeshes = leafMaterials.map((material, index) => {
      const mesh = new THREE.InstancedMesh(foliageGeometry, material, foregroundTrees.length);
      mesh.name = `relay-forest-foliage-${index + 1}`;
      return mesh;
    });
    const treeDummy = new THREE.Object3D();
    const branchStart = new THREE.Vector3();
    const branchEnd = new THREE.Vector3();
    const branchDirection = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const rotateOffset = (x, z, yaw) => [
      x * Math.cos(yaw) - z * Math.sin(yaw),
      x * Math.sin(yaw) + z * Math.cos(yaw)
    ];
    const foliageOffsets = [
      [-.88, 3.78, .04, 1.28, 1.02, 1.12],
      [.82, 3.92, -.08, 1.2, .96, 1.08],
      [.02, 4.42, .18, 1.42, 1.14, 1.2]
    ];

    foregroundTrees.forEach((tree, index) => {
      const trunkHeight = 3.2 * tree.scale;
      treeDummy.position.set(tree.x, trunkHeight / 2, tree.z);
      treeDummy.rotation.set(0, tree.yaw, 0);
      treeDummy.scale.set(tree.scale, trunkHeight, tree.scale);
      treeDummy.updateMatrix();
      trunkMesh.setMatrixAt(index, treeDummy.matrix);

      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex === 0 ? -1 : 1;
        const localX = side * (.78 + noise(tree.seed + sideIndex * 17) * .22) * tree.scale;
        const localZ = (noise(tree.seed + sideIndex * 29) - .5) * .5 * tree.scale;
        const [endX, endZ] = rotateOffset(localX, localZ, tree.yaw);
        branchStart.set(tree.x, 2.55 * tree.scale, tree.z);
        branchEnd.set(tree.x + endX, (3.72 + noise(tree.seed + sideIndex * 37) * .2) * tree.scale, tree.z + endZ);
        branchDirection.copy(branchEnd).sub(branchStart);
        const branchLength = branchDirection.length();
        treeDummy.position.copy(branchStart).add(branchEnd).multiplyScalar(.5);
        treeDummy.quaternion.setFromUnitVectors(up, branchDirection.normalize());
        treeDummy.scale.set(tree.scale * .82, branchLength, tree.scale * .82);
        treeDummy.updateMatrix();
        branchMesh.setMatrixAt(index * 2 + sideIndex, treeDummy.matrix);
      }

      foliageMeshes.forEach((mesh, foliageIndex) => {
        const [localX, localY, localZ, width, height, depth] = foliageOffsets[foliageIndex];
        const wobble = (noise(tree.seed + foliageIndex * 53) - .5) * .28;
        const [offsetX, offsetZ] = rotateOffset((localX + wobble) * tree.scale, (localZ - wobble * .4) * tree.scale, tree.yaw);
        treeDummy.position.set(tree.x + offsetX, localY * tree.scale, tree.z + offsetZ);
        treeDummy.quaternion.identity();
        treeDummy.rotation.set(noise(tree.seed + foliageIndex * 61) * .24, tree.yaw + foliageIndex * .7, noise(tree.seed + foliageIndex * 71) * .18);
        treeDummy.scale.set(width * tree.scale, height * tree.scale, depth * tree.scale);
        treeDummy.updateMatrix();
        mesh.setMatrixAt(index, treeDummy.matrix);
      });
    });
    trunkMesh.frustumCulled = false;
    branchMesh.frustumCulled = false;
    trunkMesh.receiveShadow = true;
    branchMesh.receiveShadow = true;
    for (const mesh of foliageMeshes) {
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
    }
    this.group.add(trunkMesh, branchMesh, ...foliageMeshes);

    // Distant fill follows the grass system: hundreds of tiny randomized 3D
    // instances, not readable tree-shaped cards. Three dense outer bands overlap
    // at every corner and dissolve naturally into scene fog.
    const backgroundTrees = [];
    let backgroundSeed = 1701;
    const addBackgroundTree = (x, z, row) => {
      const localSeed = backgroundSeed++;
      backgroundTrees.push({
        x: x + (noise(localSeed + 3) - .5) * 2.6,
        z: z + (noise(localSeed + 5) - .5) * 2.6,
        scale: .48 + noise(localSeed + 17) * .38 + row * .035,
        yaw: noise(localSeed + 23) * Math.PI * 2,
        seed: localSeed
      });
    };
    for (let row = 0; row < 3; row++) {
      const spacing = 3.7 + row * .25;
      const z = 44 + row * 4.2;
      const halfX = 50 + row * 4.5;
      const horizontalCount = Math.ceil(halfX * 2 / spacing);
      for (let index = 0; index <= horizontalCount; index++) {
        const x = -halfX + index * (halfX * 2 / horizontalCount);
        addBackgroundTree(x, -z, row);
        addBackgroundTree(x, z, row);
      }
      const x = 48 + row * 4.2;
      const halfZ = 44 + row * 4.5;
      const verticalCount = Math.ceil(halfZ * 2 / spacing);
      for (let index = 0; index <= verticalCount; index++) {
        const zPosition = -halfZ + index * (halfZ * 2 / verticalCount);
        addBackgroundTree(-x, zPosition, row);
        addBackgroundTree(x, zPosition, row);
      }
    }
    const backgroundTrunkMaterial = new THREE.MeshBasicMaterial({ color: 0x6f6b5d, fog: true, toneMapped: false });
    const backgroundLeafMaterial = new THREE.MeshBasicMaterial({ color: 0x748b73, fog: true, toneMapped: false });
    const backgroundTrunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.16, .28, 1, 5),
      backgroundTrunkMaterial,
      backgroundTrees.length
    );
    backgroundTrunks.name = 'relay-forest-background-trunks';
    const backgroundFoliage = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      backgroundLeafMaterial,
      backgroundTrees.length * 2
    );
    backgroundFoliage.name = 'relay-forest-background-foliage';
    backgroundTrees.forEach((tree, index) => {
      const trunkHeight = 2.65 * tree.scale;
      treeDummy.position.set(tree.x, trunkHeight / 2, tree.z);
      treeDummy.quaternion.identity();
      treeDummy.rotation.set(0, tree.yaw, 0);
      treeDummy.scale.set(tree.scale, trunkHeight, tree.scale);
      treeDummy.updateMatrix();
      backgroundTrunks.setMatrixAt(index, treeDummy.matrix);

      for (let crown = 0; crown < 2; crown++) {
        const side = crown === 0 ? -.34 : .34;
        const [offsetX, offsetZ] = rotateOffset(side * tree.scale, (crown ? -.08 : .1) * tree.scale, tree.yaw);
        treeDummy.position.set(tree.x + offsetX, (2.55 + crown * .48) * tree.scale, tree.z + offsetZ);
        treeDummy.rotation.set(noise(tree.seed + crown * 13) * .3, tree.yaw + crown, noise(tree.seed + crown * 19) * .22);
        treeDummy.scale.set((.88 - crown * .08) * tree.scale, (.72 + crown * .06) * tree.scale, (.8 - crown * .04) * tree.scale);
        treeDummy.updateMatrix();
        backgroundFoliage.setMatrixAt(index * 2 + crown, treeDummy.matrix);
      }
    });
    backgroundTrunks.frustumCulled = false;
    backgroundFoliage.frustumCulled = false;
    this.group.add(backgroundTrunks, backgroundFoliage);

    const fogRampData = new Uint8Array(4 * 32);
    for (let row = 0; row < 32; row++) {
      const value = Math.round(255 * Math.pow(1 - row / 31, 1.65));
      const offset = row * 4;
      fogRampData[offset] = value;
      fogRampData[offset + 1] = value;
      fogRampData[offset + 2] = value;
      fogRampData[offset + 3] = 255;
    }
    const fogRamp = new THREE.DataTexture(fogRampData, 1, 32, THREE.RGBAFormat);
    fogRamp.minFilter = THREE.LinearFilter;
    fogRamp.magFilter = THREE.LinearFilter;
    fogRamp.needsUpdate = true;
    const fogMaterial = new THREE.MeshBasicMaterial({
      color: 0x748781,
      alphaMap: fogRamp,
      opacity: .42,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    this.forestFogMaterial = fogMaterial;
    const fogMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fogMaterial, 4);
    fogMesh.name = 'relay-forest-fog';
    const fogSegments = [
      [0, 8.5, -43.5, 0, 138, 20],
      [0, 8.5, 43.5, Math.PI, 138, 20],
      [-47, 8.5, 0, Math.PI / 2, 126, 20],
      [47, 8.5, 0, -Math.PI / 2, 126, 20]
    ];
    fogSegments.forEach(([x, y, z, yaw, width, height], index) => {
      treeDummy.position.set(x, y, z);
      treeDummy.rotation.set(0, yaw, 0);
      treeDummy.scale.set(width, height, 1);
      treeDummy.updateMatrix();
      fogMesh.setMatrixAt(index, treeDummy.matrix);
    });
    fogMesh.frustumCulled = false;
    fogMesh.renderOrder = 1;
    this.group.add(fogMesh);
  }

  _applyGrassMask() {
    if (this.definition?.hideWorldGrass) {
      if (this.grassMesh) this.grassMesh.visible = false;
      return;
    }
    const THREE = this.THREE;
    const masks = (this.definition?.grassExclusions || []).map((mask, index) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(mask.size[0], 1, mask.size[1]));
      mesh.position.set(mask.center[0], 0, mask.center[1]);
      mesh.name = `grass-mask:${index}`;
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    this.cullGrass?.(this.grassMesh, [...this.objects, ...masks]);
    this._restoreGrassPatches();
  }

  _applyGrassVisibility() {
    if (!this.grassMesh) return;
    if (this._grassVisibilityBeforeLevel == null) {
      this._grassVisibilityBeforeLevel = this.grassMesh.visible !== false;
    }
    if (this.definition?.hideWorldGrass) this.grassMesh.visible = false;
  }

  _restoreGrassVisibility() {
    if (!this.grassMesh || this._grassVisibilityBeforeLevel == null) return;
    this.grassMesh.visible = this._grassVisibilityBeforeLevel;
    this._grassVisibilityBeforeLevel = null;
  }

  _restoreGrassPatches() {
    const patches = this.definition?.grassPatches || [];
    const offsets = this.grassMesh?.geometry?.getAttribute?.('offset');
    const scales = this.grassMesh?.geometry?.getAttribute?.('scale');
    const baseScales = this.grassMesh?.userData?.baseGrassScales;
    if (!patches.length || !offsets || !scales || !baseScales) return;

    const obstacleBoxes = [];
    for (const object of this.objects) {
      try {
        obstacleBoxes.push(new this.THREE.Box3().setFromObject(object));
      } catch (error) {
        this.onWarning(`Grass patch obstacle skipped: ${error?.message || error}`);
      }
    }

    for (let i = 0; i < offsets.count; i++) {
      const x = offsets.getX(i);
      const z = offsets.getZ(i);
      const patch = patches.find(candidate => {
        const radiusX = Math.max(.01, candidate.radius?.[0] || 0);
        const radiusZ = Math.max(.01, candidate.radius?.[1] || 0);
        const dx = (x - candidate.center[0]) / radiusX;
        const dz = (z - candidate.center[1]) / radiusZ;
        return dx * dx + dz * dz <= 1;
      });
      if (!patch) continue;

      const obstructed = obstacleBoxes.some(box => (
        x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z
      ));
      if (obstructed) continue;
      scales.setX(i, baseScales[i] * Math.max(0, patch.heightScale ?? 1));
    }
    scales.needsUpdate = true;
  }

  _setGrassLiberated(liberated) {
    const colors = this.grassMesh?.geometry?.getAttribute?.('color');
    if (!colors) return;
    if (!this.grassMesh.userData.relayBaseGrassColors || this.grassMesh.userData.relayBaseGrassColors.length !== colors.array.length) {
      this.grassMesh.userData.relayBaseGrassColors = Float32Array.from(colors.array);
    }
    const base = this.grassMesh.userData.relayBaseGrassColors;
    for (let i = 0; i < colors.count; i++) {
      const offset = i * 3;
      colors.setXYZ(
        i,
        liberated ? Math.min(1, base[offset] * 1.08) : base[offset],
        liberated ? Math.min(1, base[offset + 1] * 1.2 + 0.04) : base[offset + 1],
        liberated ? Math.min(1, base[offset + 2] * 1.07) : base[offset + 2]
      );
    }
    colors.needsUpdate = true;
  }
}
