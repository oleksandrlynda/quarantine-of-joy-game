import { entranceClearanceFor, validateSpawnEntrance } from './contracts.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const distance2D = (a, b) => Math.hypot(a.x - b[0], a.z - b[1]);

function circleIntersectsBox(position, radius, collider) {
  const [cx, , cz] = collider.position;
  const [width, , depth] = collider.size;
  const nearestX = Math.max(cx - width / 2, Math.min(position[0], cx + width / 2));
  const nearestZ = Math.max(cz - depth / 2, Math.min(position[2], cz + depth / 2));
  return Math.hypot(position[0] - nearestX, position[2] - nearestZ) < radius;
}

export function validateLevelSpawnNetwork(definition) {
  return (definition.entrances || []).map(entrance => {
    const errors = validateSpawnEntrance(entrance);
    if (!entrance.air) {
      for (const type of entrance.allow || []) {
        const clearance = entranceClearanceFor(entrance, type);
        if ((definition.colliders || []).some(collider => circleIntersectsBox(entrance.position, clearance, collider))) {
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

export class LevelRuntime {
  constructor({ THREE, scene, objects, grassMesh, weather, clonePrefab, cullGrass, onObjective, onWarning, onRefreshColliders, onTransitionToLegacy }) {
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
    this.group = null;
    this.definition = null;
    this.enemyManager = null;
    this.validEntrances = [];
    this.colliderObjects = [];
    this.walkableObjects = [];
    this.visualGroups = new Map();
    this.objectiveState = null;
    this.liberationTime = 0;
    this._transitioned = false;
    this._pulse = 0;
  }

  attach({ enemyManager }) {
    this.enemyManager = enemyManager;
    if (this.definition) enemyManager.setEncounterHooks(this._createEncounterHooks());
  }

  get active() { return !!this.definition; }
  get playerSpawn() { return this.definition?.playerSpawn || null; }

  load(definition) {
    if (this.definition) this.unload({ restoreGrass: false });
    this.definition = definition;
    this.group = new this.THREE.Group();
    this.group.name = `level:${definition.id}`;
    this.visualGroups.clear();
    this._buildGroundLanguage();
    for (const placement of definition.assets) this._addAsset(placement);
    for (const collider of definition.colliders) this._addCollider(collider, false);
    for (const surface of definition.walkableSurfaces || []) this._addCollider(surface, true);
    this.scene.add(this.group);

    const validation = validateLevelSpawnNetwork(definition);
    this.validEntrances = validation.filter(item => item.valid).map(item => item.entrance);
    for (const item of validation.filter(item => !item.valid)) {
      this.onWarning(`[Relay District] Disabled spawn "${item.entrance?.id || 'unknown'}": ${item.errors.join('; ')}`);
    }
    if (!this.validEntrances.length) this.onWarning('[Relay District] No authored spawn entrances survived validation. Spawns will remain queued.');

    this._setGroupVisible('infestation', false);
    this._resetObjectiveState();
    this._applyWaveVisualState(1);
    this._transitioned = false;
    this._applyGrassMask();
    this.onRefreshColliders?.();
    if (this.enemyManager) this.enemyManager.setEncounterHooks(this._createEncounterHooks());
    return this;
  }

  reset() {
    if (!this.definition) return;
    this._setGroupVisible('infestation', false);
    this._setGroupVisible('objective', true);
    for (const root of this.visualGroups.get('liberation') || []) setMaterialLiberated(root, false);
    this._setGrassLiberated(false);
    this._applyWaveVisualState(1);
    this.liberationTime = 0;
    this._transitioned = false;
    this._resetObjectiveState();
    this._applyGrassMask();
    this.enemyManager?.setEncounterHooks(this._createEncounterHooks());
  }

  unload({ restoreGrass = true } = {}) {
    if (!this.definition) return;
    this.enemyManager?.setEncounterHooks(null);
    for (const object of [...this.colliderObjects, ...this.walkableObjects]) {
      const index = this.objects.indexOf(object);
      if (index >= 0) this.objects.splice(index, 1);
    }
    this.colliderObjects.length = 0;
    this.walkableObjects.length = 0;
    if (this.group) this.scene.remove(this.group);
    this.group = null;
    this.definition = null;
    this.validEntrances.length = 0;
    this.visualGroups.clear();
    this.objectiveState = null;
    this.onObjective?.({ visible: false });
    this._setGrassLiberated(false);
    if (restoreGrass) this.cullGrass?.(this.grassMesh, this.objects);
    this.onRefreshColliders?.();
  }

  onWaveStart(wave) {
    if (!this.definition || !this.definition.waves[wave]) return;
    this.weather?.setMode?.(this.definition.weatherByWave[wave] || 'clear');
    this._applyWaveVisualState(wave);
    this._resetObjectiveState(wave);
    if (wave === 5) {
      this._setGroupVisible('infestation', true);
      this._setGroupVisible('objective', false);
    }
    this._emitObjective();
  }

  onBossDefeated(wave) {
    if (!this.definition || wave !== 5 || this.liberationTime > 0) return;
    this.liberationTime = 0.0001;
    this.weather?.setMode?.('clear');
    this._setGroupVisible('infestation', false);
    this._setGroupVisible('objective', true);
    for (const root of this.visualGroups.get('liberation') || []) setMaterialLiberated(root, true);
    this._setGrassLiberated(true);
    this._applyWaveVisualState(0, true);
    this.objectiveState = { kind: 'liberation', titleKey: 'level.relay.liberating', progress: 0, contested: false };
    this._emitObjective();
  }

  update(dt, playerObject) {
    if (!this.definition) return;
    this._pulse += dt;
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
    if (this.liberationTime > 0) {
      this.liberationTime += dt;
      if (this.objectiveState) this.objectiveState.progress = clamp01(this.liberationTime / 4);
      this._emitObjective();
      if (this.liberationTime >= 4 && !this._transitioned) {
        this._transitioned = true;
        this.onTransitionToLegacy?.();
      }
      return;
    }
    if (!playerObject?.position || !this.objectiveState) return;
    if (this.objectiveState.kind === 'feeds') this._updateFeeds(dt, playerObject.position);
    if (this.objectiveState.kind === 'mast') this._updateMast(dt, playerObject.position);
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
        this.enemyManager?.queueAuthoredEnemies(this.definition.waves[3].packages[1]);
      }
      if (!state.contested) active.progress = Math.min(active.seconds, active.progress + dt);
      if (active.progress >= active.seconds && !active.complete) {
        active.complete = true;
        if (!state.reinforced) {
          state.reinforced = true;
          this.enemyManager?.queueAuthoredEnemies(this.definition.waves[3].packages[2]);
        }
      }
    }
    state.complete = state.targets.every(target => target.complete);
    state.progress = state.targets.reduce((sum, target) => sum + target.progress / target.seconds, 0) / state.targets.length;
    state.remainingTargets = state.targets.filter(target => !target.complete).length;
    this._emitObjective();
    if (state.complete) this.enemyManager?.tryAdvanceWave();
  }

  _updateMast(dt, playerPosition) {
    const state = this.objectiveState;
    const inside = distance2D(playerPosition, state.position) <= state.radius;
    state.contested = inside && this._isContested(state.position, state.radius);
    if (inside && !state.contested) state.elapsed = Math.min(state.seconds, state.elapsed + dt);
    state.progress = state.elapsed / state.seconds;
    if (!state.milestones[0] && state.progress >= 1 / 3) {
      state.milestones[0] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[4].packages[1]);
    }
    if (!state.milestones[1] && state.progress >= 2 / 3) {
      state.milestones[1] = true;
      this.enemyManager?.queueAuthoredEnemies(this.definition.waves[4].packages[2]);
    }
    state.complete = state.elapsed >= state.seconds;
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

  _resetObjectiveState(wave = 0) {
    const def = this.definition;
    if (!def) return;
    const waveDef = def.waves[wave];
    if (!waveDef) {
      this.objectiveState = null;
      return;
    }
    if (wave === 3) {
      this.objectiveState = {
        kind: 'feeds', titleKey: waveDef.titleKey, progress: 0, contested: false,
        started: false, reinforced: false, complete: false, remainingTargets: 2,
        targets: [def.objectives.westFeed, def.objectives.eastFeed].map(target => ({ ...target, progress: 0, complete: false }))
      };
    } else if (wave === 4) {
      this.objectiveState = {
        kind: 'mast', titleKey: waveDef.titleKey, position: def.objectives.mast.position,
        radius: def.objectives.mast.radius, seconds: def.objectives.mast.seconds,
        elapsed: 0, progress: 0, contested: false, complete: false, milestones: [false, false]
      };
    } else {
      this.objectiveState = { kind: wave === 5 ? 'boss' : 'eliminate', titleKey: waveDef.titleKey, progress: 0, contested: false };
    }
  }

  _emitObjective() {
    const state = this.objectiveState;
    if (!state) return this.onObjective?.({ visible: false });
    this.onObjective?.({ visible: true, ...state });
  }

  _createEncounterHooks() {
    return {
      authoredOnly: true,
      getWaveDefinition: wave => this.definition?.waves?.[wave] || null,
      getSpawnCandidates: ({ wave, type }) => this._spawnCandidates(wave, type),
      getBossSpawn: wave => wave === 5 && this.definition ? new this.THREE.Vector3(...this.definition.bossAnchor) : null,
      getBossAddPositions: ({ count, type }) => this._bossAddPositions(count, type),
      canCompleteWave: wave => {
        if (wave === 3 || wave === 4) return !!this.objectiveState?.complete;
        if (wave === 5) return this._transitioned;
        return true;
      }
    };
  }

  _spawnCandidates(wave, type) {
    if (!this.definition) return [];
    return this.validEntrances
      .filter(entrance => !entrance.air && entrance.allow.includes(type) && wave >= entrance.activeWaves[0] && wave <= entrance.activeWaves[1])
      .filter(entrance => this._entranceRuntimeSafe(entrance, type))
      .map(entrance => ({ position: new this.THREE.Vector3(...entrance.position), facing: entrance.facing, entranceId: entrance.id, clearance: entranceClearanceFor(entrance, type) }));
  }

  _entranceRuntimeSafe(entrance, type) {
    const clearance = entranceClearanceFor(entrance, type);
    const zone = this.definition.bossClearZone;
    if (Math.hypot(entrance.position[0] - zone.center[0], entrance.position[2] - zone.center[1]) < zone.radius + clearance) return false;
    for (const objective of Object.values(this.definition.objectives)) {
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
    const THREE = this.THREE;
    const materials = {
      block: new THREE.MeshStandardMaterial({ color: 0x3c4745, roughness: 0.98 }),
      asphalt: new THREE.MeshStandardMaterial({ color: 0x252e2e, roughness: 0.9, metalness: .02 }),
      asphaltPatch: new THREE.MeshStandardMaterial({ color: 0x182120, roughness: 1 }),
      plaza: new THREE.MeshStandardMaterial({ color: 0x69736e, roughness: 0.94 }),
      plazaInset: new THREE.MeshStandardMaterial({ color: 0x4f5b57, roughness: 0.96 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0x8a938c, roughness: 0.98 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xb3b5a8, roughness: 0.92 }),
      facade: new THREE.MeshStandardMaterial({ color: 0x45514e, roughness: 0.94 }),
      inset: new THREE.MeshStandardMaterial({ color: 0x101a1a, roughness: 0.78 }),
      bureauRed: new THREE.MeshStandardMaterial({ color: 0xa73535, emissive: 0x260505, emissiveIntensity: .28, roughness: .7 }),
      signal: new THREE.MeshStandardMaterial({ color: 0x42b9bc, emissive: 0x0d4143, emissiveIntensity: .55, roughness: .58 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xb39b42, roughness: 0.82, emissive: 0x1c1603, emissiveIntensity: 0.08 })
    };
    const plane = (width, depth, x, z, material, y = 0.018) => {
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
    this.group.add(patchMesh);

    // Broad, soft contact patches ground the largest props even on the
    // performance profile where full realtime shadows remain disabled.
    const contacts = [
      [0, -7, 4.2, 3.6], [-24, 11.5, 3.6, 3.0], [-22, -1, 2.2, 3.0], [-24, -15.5, 2.4, 3.2],
      [22, 11.5, 3.0, 2.1], [22, -1, 2.2, 3.0], [24, -15, 2.4, 3.2], [-9, 14.5, 3.3, 1.6],
      [9, 14.5, 3.3, 1.6], [-15.5, 2, 2.0, 2.0], [15.5, 2, 2.1, 2.1]
    ];
    const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x07100f, transparent: true, opacity: .24, depthWrite: false });
    const contactMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), contactMaterial, contacts.length);
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

    const mastPosition = this.definition?.objectives?.mast?.position || [0, -7];
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.15, 5.5, 64), new THREE.MeshBasicMaterial({ color: 0xc7ff36, transparent: true, opacity: 0.48, side: THREE.DoubleSide }));
    ring.name = 'relay-objective-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(mastPosition[0], 0.18, mastPosition[1]);
    this.group.add(ring);

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
    for (const [radius, y] of [[1.28, -.4], [1.72, .12], [2.16, .64]]) {
      const signalRing = new THREE.Mesh(new THREE.TorusGeometry(radius, .045, 6, 32), crownMaterial);
      signalRing.rotation.x = Math.PI / 2;
      signalRing.position.y = y;
      crown.add(signalRing);
    }
    this.group.add(crown);

    const cablePositions = [];
    const crownAnchor = [mastPosition[0], 7.6, mastPosition[1]];
    for (const anchor of [[-5.3, .12, -2], [5.3, .12, -2], [-4.5, .12, -13.5], [4.5, .12, -13.5]]) {
      cablePositions.push(...crownAnchor, ...anchor);
    }
    const guyGeometry = new THREE.BufferGeometry();
    guyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cablePositions, 3));
    const guyLines = new THREE.LineSegments(guyGeometry, new THREE.LineBasicMaterial({ color: 0x222c2b, transparent: true, opacity: .82 }));
    guyLines.name = 'relay-guy-cables';
    this.group.add(guyLines);
  }

  _applyWaveVisualState(wave, liberated = false) {
    if (!this.group) return;
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
  }

  _addAsset(placement) {
    const root = this.clonePrefab?.(placement.asset);
    if (!root) return;
    root.position.set(...placement.position);
    root.rotation.y = placement.yaw || 0;
    root.scale.setScalar(placement.scale || 1);
    root.name = `relay:${placement.asset}`;
    const mutable = (placement.tags || []).some(tag => ['liberation', 'infestation', 'objective'].includes(tag));
    root.traverse?.(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (mutable && node.material) {
        const cloneMaterial = material => {
          const cloned = material.clone();
          if (typeof cloned.onBuild !== 'function') cloned.onBuild = function relayMaterialBuild() {};
          return cloned;
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial)
          : cloneMaterial(node.material);
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
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...definition.size), material);
    mesh.position.set(...definition.position);
    if (definition.rotation) mesh.rotation.set(...definition.rotation);
    mesh.name = `${walkable ? 'walkable' : 'collider'}:${definition.id}`;
    mesh.userData.relayLevel = true;
    mesh.userData.walkableSurface = walkable;
    mesh.updateMatrixWorld(true);
    this.group.add(mesh);
    this.objects.push(mesh);
    (walkable ? this.walkableObjects : this.colliderObjects).push(mesh);
  }

  _setGroupVisible(tag, visible) {
    for (const root of this.visualGroups.get(tag) || []) root.visible = visible;
  }

  _applyGrassMask() {
    const THREE = this.THREE;
    const masks = (this.definition?.grassExclusions || []).map((mask, index) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(mask.size[0], 1, mask.size[1]));
      mesh.position.set(mask.center[0], 0, mask.center[1]);
      mesh.name = `grass-mask:${index}`;
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    this.cullGrass?.(this.grassMesh, [...this.objects, ...masks]);
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
