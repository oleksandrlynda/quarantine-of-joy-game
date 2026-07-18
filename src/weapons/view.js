import { logError } from '../util/log.js';
import { buildWeaponModel, createWeaponGeometryPool, WEAPON_MUZZLE_AXES } from './models.js';

const WEAPON_VIEW_LENGTHS = Object.freeze({
  pistol: .2646,
  rifle: .72,
  smg: .48,
  shotgun: .70,
  dmr: .74,
  minigun: .68,
  grenade: .50,
  dynamite: .38,
  satellite: .23,
  gravitywell: .43,
  beamsaber: .95
});

const WEAPON_ACTION_DURATIONS = Object.freeze({
  pistol: .18,
  rifle: .10,
  smg: .065,
  shotgun: .36,
  dmr: .16,
  minigun: .05,
  grenade: .22,
  dynamite: .28,
  satellite: .32,
  gravitywell: .3,
  beamsaber: .16
});

export class WeaponView {
    constructor(THREE, camera){
      this.THREE = THREE;
      this.camera = camera;
  
      // ---- hierarchy: root -> sway -> recoil -> slash -> model ----
      this.root = new THREE.Group();
      this.root.renderOrder = 10000;
      camera.add(this.root);

      this._sway   = new THREE.Group();   this.root.add(this._sway);
      this._recoil = new THREE.Group();   this._sway.add(this._recoil);
      this._slashNode = new THREE.Group(); this._recoil.add(this._slashNode);
      this._model  = new THREE.Group();   this._slashNode.add(this._model);
  
      // sockets
      this.sockets = { muzzle: new THREE.Object3D() };
      this._model.add(this.sockets.muzzle);
      this._muzzleLocal = new THREE.Vector3(0, -0.005, -0.25); // 
      this.sockets.muzzle.position.copy(this._muzzleLocal);
  
      // hip offset (початкова позиція зброї у камері)
      this._hipOffset = new THREE.Vector3(0.12, -0.08, 0.0);
      this._adsOffset = new THREE.Vector3();
      this._sprintOffset = new THREE.Vector3();
      this._offsetTarget = new THREE.Vector3();
      this.root.position.copy(this._hipOffset);

      // Opt-in diagnostic overrides. They remain inert in normal play.
      this.debugMotionFrozen = false;
      this.debugBasicMaterial = false;
      this._debugBasicMaterials = null;
      this._debugOriginalMaterials = new Map();
  
      // state
      this._current = null; // { meshes:[], dispose:fn }
      this._move = new THREE.Vector2();   // [-1..1]
      this._look = new THREE.Vector2();   // 
      this._ads = 0;                      // 0..1 aim-down-sights
      this._sprint = 0;                   // 0..1
  
      // sway/bob tuning
      this._swayAmount = 0.012;
      this._lookSway   = 0.008;
      this._bobAmount  = 0.012;    
      this._bobFreq    = 8.0;      
      this._time = 0;
      // --- reload tilt state ---
      this._reload = {
        active: false,
        t: 0,
        dur: 0.7,
        roll: 0.5,
        drop: 0.06,
        back: 0.04
      };

      // --- slash swing state ---
      this._slashState = {
        active: false,
        t: 0,
        dur: 0.15,
        angle: 1.2,
        dir: 1
      };

      // --- charging glow state ---
      this._chargeState = { active: false, t: 0, dur: 2.5 };
      // recoil
      this._kickPos = 0; 
      this._kickRot = 0;    
      this._kickVelPos = 0;
      this._kickVelRot = 0;
      this._kPos = 70.0;     // stiffness
      this._kRot = 55.0;
      this._damp = 10.0;  
  
      // Camera-attached viewmodels use unlit materials. This keeps their palette
      // stable and avoids paying for world-lighting shaders while the camera moves.
      this._matMetal = new THREE.MeshBasicMaterial({ color: 0x7f8983 });
      this._matBody  = new THREE.MeshBasicMaterial({ color: 0x202722 });
      this._matDark  = new THREE.MeshBasicMaterial({ color: 0x0c110e });
      this._matGrip  = new THREE.MeshBasicMaterial({ color: 0x303832 });
      this._matWhite = new THREE.MeshBasicMaterial({ color: 0xe1e7e1 });
      this._matGlass = new THREE.MeshBasicMaterial({ color: 0x72d8e4 });
      this._weaponAccents = new Map([
        ['pistol', new THREE.MeshBasicMaterial({ color: 0xd7ff3f })],
        ['rifle', new THREE.MeshBasicMaterial({ color: 0x45a6ff })],
        ['smg', new THREE.MeshBasicMaterial({ color: 0x5ce1d3 })],
        ['shotgun', new THREE.MeshBasicMaterial({ color: 0xff9a4c })],
        ['dmr', new THREE.MeshBasicMaterial({ color: 0xff6a2f })],
        ['minigun', new THREE.MeshBasicMaterial({ color: 0xf3c64b })],
        ['grenade', new THREE.MeshBasicMaterial({ color: 0xffb52e })],
        ['dynamite', new THREE.MeshBasicMaterial({ color: 0xe2382f })],
        ['satellite', new THREE.MeshBasicMaterial({ color: 0x63e6ff })],
        ['gravitywell', new THREE.MeshBasicMaterial({ color: 0xb56cff })],
        ['beamsaber', new THREE.MeshBasicMaterial({ color: 0x62a8ff })]
      ]);
      this._matBlade = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x60a5fa, emissiveIntensity: 4.0, roughness: 0.2, metalness: 0.0 });
      this._baseBladeIntensity = this._matBlade.emissiveIntensity;
      this._spinnerVelocity = 0;
      this._actionState = { active: false, t: 0, dur: .12 };

      this.setWeapon('rifle');
    }
  
    // ---------- external control ----------
    setMove(x, y){ this._move.set(x||0, y||0); }
    setLook(dx, dy){ this._look.set(dx||0, dy||0); }
    setADS(t){ this._ads = Math.max(0, Math.min(1, t||0)); }
    setSprint(t){ this._sprint = Math.max(0, Math.min(1, t||0)); }

    setDebugMotionFrozen(enabled){
      this.debugMotionFrozen = enabled === true;
    }

    setDebugBasicMaterial(enabled){
      const next = enabled === true;
      if (next === this.debugBasicMaterial) return;

      if (next) {
        if (!this._debugBasicMaterials) {
          this._debugBasicMaterials = {
            mesh: new this.THREE.MeshBasicMaterial({ color: 0xffffff }),
            line: new this.THREE.LineBasicMaterial({ color: 0xffffff })
          };
        }
        this._debugOriginalMaterials.clear();
        for (const object of this._current?.meshes || []) {
          if (!object?.material) continue;
          this._debugOriginalMaterials.set(object, object.material);
          object.material = object.isLine
            ? this._debugBasicMaterials.line
            : this._debugBasicMaterials.mesh;
        }
      } else {
        for (const [object, material] of this._debugOriginalMaterials) {
          object.material = material;
        }
        this._debugOriginalMaterials.clear();
      }

      this.debugBasicMaterial = next;
    }
  
    onFire(strength=1){
      // recoil
      const s = Math.max(0.2, Math.min(1.5, strength));
      this._kickVelPos -= 0.55 * s;
      this._kickVelRot += 0.35 * s;
      if (this._current?.spinner) this._spinnerVelocity = Math.min(24, this._spinnerVelocity + 4.5 * s);
      if (this._current?.actionParts?.length) {
        this._actionState.active = true;
        this._actionState.t = 0;
        this._actionState.dur = WEAPON_ACTION_DURATIONS[this._current.weaponKey] || .12;
      }
    }

    updateActionCycle(dt){
      const state = this._actionState;
      const parts = this._current?.actionParts;
      if (!state.active || !parts?.length) return;

      state.t += dt;
      const progress = Math.min(1, state.t / state.dur);
      const offset = -Math.sin(progress * Math.PI) * .035;
      for (const part of parts) {
        if (part.userData.basePosition) part.position.x = part.userData.basePosition.x + offset;
      }

      if (progress >= 1) {
        state.active = false;
        state.t = 0;
        for (const part of parts) {
          if (part.userData.basePosition) part.position.x = part.userData.basePosition.x;
        }
      }
    }

    startSlash(opts){
      const s = this._slashState;
      s.active = true;
      s.t = 0;
      s.dir *= -1;
      if (opts && typeof opts.dur === 'number') s.dur = opts.dur;
      else s.dur = 0.15;
      if (opts && typeof opts.angle === 'number') s.angle = opts.angle;
      else s.angle = 1.2;
    }

    updateSlash(dt){
      const s = this._slashState;
      const node = this._slashNode;
      if (!s.active){
        node.rotation.set(0,0,0);
        node.position.set(0,0,0);
        return;
      }
      s.t += dt;
      const r = s.t / s.dur;
      const swing = (0.5 - r) * s.angle * s.dir;
      const arc = Math.sin(r * Math.PI);
      node.rotation.y = swing;
      node.position.x = 0.1 * arc * s.dir;
      node.position.y = 0.02 * arc;
      if (r >= 1){
        s.active = false;
        node.rotation.set(0,0,0);
        node.position.set(0,0,0);
      }
    }

    startCharge(){
      const c = this._chargeState;
      c.active = true;
      c.t = 0;
    }

    endCharge(){
      const c = this._chargeState;
      c.active = false;
      c.t = 0;
      if (this._matBlade) this._matBlade.emissiveIntensity = this._baseBladeIntensity;
    }

    updateCharge(dt){
      const c = this._chargeState;
      if (!this._matBlade) return;
      if (c.active){
        c.t += dt;
        const r = Math.min(1, c.t / c.dur);
        const target = this._baseBladeIntensity + 8 * r;
        this._matBlade.emissiveIntensity += (target - this._matBlade.emissiveIntensity) * Math.min(1, dt*10);
      } else {
        const target = this._baseBladeIntensity;
        this._matBlade.emissiveIntensity += (target - this._matBlade.emissiveIntensity) * Math.min(1, dt*10);
      }
    }
  
    update(dt){
      if (this.debugMotionFrozen) return;
      this._time += dt;

      if (this._current?.spinner) {
        this._current.spinner.rotation.x += dt * (1.8 + this._spinnerVelocity);
        this._spinnerVelocity *= Math.exp(-dt * 2.8);
      } else {
        this._spinnerVelocity = 0;
      }
      this.updateActionCycle(dt);
  
      // ---- sway/bob target ----
      const moveLen = Math.max(0, Math.min(1, this._move.length()));
      const bob = Math.sin(this._time * this._bobFreq) * this._bobAmount * moveLen * (1.0 - this._ads*0.8) * (1.0 - this._sprint*0.6);
  
      const swayX = (-this._move.x * this._swayAmount) + (-this._look.x * this._lookSway);
      const swayY = ( this._move.y * this._swayAmount*0.7) + ( this._look.y * this._lookSway*0.8) + bob;
  
      // ADS offset 
      this._adsOffset.set(0.02, -0.03, -0.02);
      const adsOff = this._offsetTarget.copy(this._hipOffset).lerp(this._adsOffset, this._ads);
      // Sprint offset 
      this._sprintOffset.set(0.18, -0.16, 0.05);
      const sprOff = adsOff.lerp(this._sprintOffset, this._sprint);
  
      // position root
      this.root.position.lerp(sprOff, Math.min(1, dt*10));
  
      // sway 
      this._sway.position.x += (swayX - this._sway.position.x) * Math.min(1, dt*12);
      this._sway.position.y += (swayY - this._sway.position.y) * Math.min(1, dt*12);
      const targetRoll = -swayX * 1.2;
      this._sway.rotation.z += (targetRoll - this._sway.rotation.z) * Math.min(1, dt*10);
  
      // ---- recoil spring ----
      // pos (уздовж -Z)
      const accelPos = -this._kPos * this._kickPos - this._damp * this._kickVelPos;
      this._kickVelPos += accelPos * dt;
      this._kickPos    += this._kickVelPos * dt;
      // rot 
      const accelRot = -this._kRot * this._kickRot - this._damp * this._kickVelRot;
      this._kickVelRot += accelRot * dt;
      this._kickRot    += this._kickVelRot * dt;
  
      this._recoil.position.z = -this._kickPos;
      this._recoil.rotation.x = -this._kickRot;
      
      this.updateSlash(dt);
      this.updateCharge(dt);

      // No idle breathing sway; keep weapon fully steady when standing still
      // ---- reload tilt on model node ----
      if (this._reload.active) {
        this._reload.t += dt;
        const r = Math.min(1, this._reload.t / this._reload.dur);
        const s = Math.sin(Math.PI * r);
        this._model.rotation.z = -this._reload.roll * s;
        this._model.position.y = -this._reload.drop * s;
        this._model.position.z =  this._reload.back * s;
        if (r >= 1) this._reload.active = false;
      } else {
        const k = Math.min(1, dt*12);
        this._model.rotation.z += (0 - this._model.rotation.z) * k;
        this._model.position.y += (0 - this._model.position.y) * k;
        this._model.position.z += (0 - this._model.position.z) * k;
      }
    }
  
    // ---------- building ----------
    clear(){
      if (!this._current) return;
      if (this.debugBasicMaterial) this.setDebugBasicMaterial(false);
      try {
        for (const m of this._current.meshes||[]) {
          if (m.parent) m.parent.remove(m);
        }
        for (const node of this._current.nodes||[]) node.removeFromParent();
        for (const geometry of this._current.geometries||[]) geometry.dispose();
      } catch (e) { logError(e); }
      this._current = null;
      this._spinnerVelocity = 0;
      this._actionState.active = false;
      this._actionState.t = 0;
    }
  
    setWeapon(name){
      this.clear();
      this.endCharge();

      const THREE = this.THREE;
      const requestedKey = String(name || 'rifle').toLowerCase();
      const weaponKey = WEAPON_VIEW_LENGTHS[requestedKey] ? requestedKey : 'rifle';
      const targetLength = WEAPON_VIEW_LENGTHS[weaponKey];
      const geometryPool = createWeaponGeometryPool(THREE);
      const accent = this._weaponAccents.get(weaponKey) || this._weaponAccents.get('rifle');
      const built = buildWeaponModel({
        THREE,
        id: weaponKey,
        geometryPool,
        materials: {
          body: this._matBody,
          metal: this._matMetal,
          dark: this._matDark,
          grip: this._matGrip,
          white: this._matWhite,
          glass: this._matGlass,
          accent,
          blade: this._matBlade
        }
      });

      // Lab models face +X. Rotate that exact assembly into the game's -Z
      // view direction, then mount its rear face beyond the camera near plane.
      const sourceLength = built.bounds.max.x - built.bounds.min.x;
      const scale = targetLength / sourceLength;
      const muzzleY = weaponKey === 'beamsaber' ? -.02 : -.005;
      const muzzleAxis = WEAPON_MUZZLE_AXES[weaponKey];
      const cameraNear = Number.isFinite(this.camera?.near) ? this.camera.near : .1;
      const rearPlane = -(cameraNear + .06);
      const muzzleZ = rearPlane - targetLength;

      built.root.scale.setScalar(scale);
      if (weaponKey === 'beamsaber') {
        // Sword stance: hilt low-right, blade cutting upward-left with enough
        // depth to preserve its slash arc without reading as a forward spear.
        const direction = new THREE.Vector3(-.55, .45, -.70).normalize();
        built.root.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        const authoredTip = new THREE.Vector3(muzzleAxis.x, muzzleAxis.y, 0)
          .multiplyScalar(scale)
          .applyQuaternion(built.root.quaternion);
        const stanceTip = new THREE.Vector3(-.24, .18, -.90);
        built.root.position.copy(stanceTip).sub(authoredTip);
        this._muzzleLocal.copy(stanceTip);
      } else {
        built.root.rotation.y = Math.PI / 2;
        built.root.position.set(
          0,
          muzzleY - muzzleAxis.y * scale,
          muzzleZ + built.bounds.max.x * scale
        );
        this._muzzleLocal.set(0, muzzleY, muzzleZ);
      }
      this._model.add(built.root);

      this.sockets.muzzle.position.copy(this._muzzleLocal);
      this._current = {
        meshes: built.meshes,
        nodes: [built.root],
        geometries: Object.values(geometryPool),
        actionParts: built.actionParts,
        spinner: built.spinner,
        weaponKey
      };
    }
  
    // world-position for tracer/muzzle flash
    getMuzzleWorldPos(out){
      const THREE = this.THREE;
      const v = out || new THREE.Vector3();
      return this.sockets.muzzle.getWorldPosition(v);
    }
    // start reload with tilt
    startReload(opts = {}){
      const o = opts || {};
      this._reload.dur  = Math.max(0.25, o.dur  ?? 0.7);
      this._reload.roll = (o.rollDeg != null ? (o.rollDeg * Math.PI/180) : 0.5);
      this._reload.drop = o.drop ?? 0.06;
      this._reload.back = o.back ?? 0.04;
      this._reload.t    = 0;
      this._reload.active = true;
      if (o.cancelADS !== false) this._ads = 0;
    }
    isReloading(){ return !!this._reload.active; }
  }
  
