import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';

export class PlayerController {
  constructor(THREE, camera, domElement, collidableObjects){
    this.THREE = THREE;
    this.camera = camera;
    this.domElement = domElement;
    this.objects = collidableObjects;

    this.controls = new PointerLockControls(camera, domElement);
    this.controls.getObject().position.set(0, 1.7, 8);
    // PointerLockControls nesting: yawObject -> pitchObject -> camera
    this.yawObject = this.controls.getObject();
    // In current THREE PointerLockControls, yaw is applied to the controls object,
    // and pitch is applied directly on the camera's rotation.x
    this.pitchObject = this.camera;
    // Do NOT reparent when controls return the camera itself (modern THREE)
    // If getObject() returns a separate yaw carrier, you may attach the camera to it,
    // but only when they are distinct objects. We avoid touching hierarchy here.

    // Input state
    this.keys = new Set();
    this.crouching = false;
    this.canJump = false;

    // Movement params
    this.moveSpeed = 6;
    this.accel = 50;
    this.damping = 10;
    this.gravity = 20;
    this.velocityY = 0;
    this.velXZ = new THREE.Vector3();
    this.baseFov = 75;
    this.sprintFov = 82;

    // Stamina system
    this.staminaMax = 100;
    this.stamina = this.staminaMax;
    this.staminaRegenPerSec = 18;     // per design: 18/s
    this.staminaSprintCostPerSec = 12;// per design: ~12/s while sprinting
    this.staminaJumpCost = 15;        // per design: ~15 per jump
    this.staminaRegenDelay = 0.5;     // seconds after last spend
    this._staminaRegenCooldown = 0;   // countdown timer until regen resumes
    this.lowStaminaThreshold = 15;    // cannot jump below this; reduced sprint speed when low

    // Recoil (softer, spring-damped)
    this.recoilPitchOffset = 0;     // radians (current offset)
    this.appliedRecoilPitch = 0;    // last-applied value to camera this frame
    this.recoilPitchVel = 0;        // radians/sec (spring velocity)
    this.recoilStiffness = 48.0;    // spring k (higher = snappier)
    this.recoilDamping = 10.0;      // damping factor (higher = more damping)
    this.recoilImpulse = 10.0;      // velocity gain per input rad
    this.recoilMaxPitch = 0.35;     // safety cap (~20°)

    // Collision helpers
    this.objectBBs = this.objects.map(o => new THREE.Box3().setFromObject(o));
    this.colliderHalf = new THREE.Vector3(0.35, 0.9, 0.35); // approx capsule half extents
    this.fullHeight = this.colliderHalf.y * 2; // ~1.8m
    this._groundRaycaster = new THREE.Raycaster();

    // Scratch temporaries to avoid per-frame allocations
    this._tmp = {
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      wish: new THREE.Vector3(),
      step: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      min: new THREE.Vector3(),
      max: new THREE.Vector3(),
      pbb: new THREE.Box3(),
      up: new THREE.Vector3(0,1,0),
      down: new THREE.Vector3(0,-1,0),
    };

    // Ground cache and thresholds
    this._groundCache = { x: Infinity, z: Infinity, y: 0 };
    this._groundXZThresh = 0.25;

    // Timers / throttles
    this._time = 0;
    this._fovEps = 0.01;
    this._fovCooldown = 0;

    // Listeners
    window.addEventListener('keydown', (e)=>{
      this.keys.add(e.code);
      if(e.code === 'Space' && this.canJump){
        // Block jump if not enough stamina
        if (this.stamina >= this.staminaJumpCost) {
          this.velocityY = 7;
          this.canJump = false;
          // Spend stamina for jump
          this._spendStamina(this.staminaJumpCost);
        }
      }
      if(e.code==='ControlLeft' || e.code==='ControlRight') this.crouching = true;
    });
    window.addEventListener('keyup', (e)=>{
      this.keys.delete(e.code);
      if(e.code==='ControlLeft' || e.code==='ControlRight') this.crouching = false;
    });
  }

  refreshColliders(objects){
    const THREE = this.THREE;
    this.objects = objects;
    this.objectBBs = this.objects.map(o => new THREE.Box3().setFromObject(o));
  }

  resetPosition(x=0, y=1.7, z=8){
    const o = this.controls.getObject();
    // Find nearest free spot if requested point is blocked
    const safe = this._findNearestFreePosition(x, y, z);
    o.position.set(safe.x, safe.y, safe.z);
    this.velocityY = 0;
    this.velXZ.set(0,0,0);
  }

  update(dt){
    const THREE = this.THREE;
    const o = this.controls.getObject();
    const t = this._tmp;
    this._time += dt;
    // Use base yaw (not camera) for movement so recoil never influences movement direction
    t.fwd.set(0,0,-1).applyQuaternion(this.yawObject.quaternion); t.fwd.y = 0; t.fwd.normalize();
    t.right.crossVectors(t.fwd, t.up).normalize();

    t.wish.set(0,0,0);
    if (this.keys.has('KeyW')) t.wish.add(t.fwd);
    if (this.keys.has('KeyS')) t.wish.addScaledVector(t.fwd, -1);
    if (this.keys.has('KeyA')) t.wish.addScaledVector(t.right, -1);
    if (this.keys.has('KeyD')) t.wish.add(t.right);
    const wishLenSq0 = t.wish.lengthSq();

    const wantsSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const hasStaminaForSprint = this.stamina > 0.5; // allow minor underflow guard
    const effectiveSprint = wantsSprint && hasStaminaForSprint;
    // Low stamina penalty: reduced sprint speed if stamina below threshold
    const sprintMultiplier = effectiveSprint ? ((this.stamina <= this.lowStaminaThreshold) ? 1.2 : 1.6) : 1.0;
    const targetSpeed = this.moveSpeed * sprintMultiplier * (this.crouching ? 0.55 : 1.0);

    if (wishLenSq0 > 0) {
      t.wish.normalize().multiplyScalar(targetSpeed);
      t.step.copy(t.wish).sub(this.velXZ).clampLength(0, this.accel * dt);
      this.velXZ.add(t.step);
    } else {
      const damp = Math.max(0, 1 - this.damping * dt);
      this.velXZ.multiplyScalar(damp);
    }

    // Stamina drain/regeneration
    // Drain only while actively sprinting and actually trying to move
    if (wantsSprint && wishLenSq0 > 0 && this.velXZ.lengthSq() > 0.0001) {
      const drain = this.staminaSprintCostPerSec * dt;
      this._spendStamina(drain);
    } else {
      // Count down regen cooldown
      if (this._staminaRegenCooldown > 0) this._staminaRegenCooldown = Math.max(0, this._staminaRegenCooldown - dt);
      // Regen if cooldown elapsed
      if (this._staminaRegenCooldown === 0 && this.stamina < this.staminaMax) {
        this.stamina = Math.min(this.staminaMax, this.stamina + this.staminaRegenPerSec * dt);
      }
    }

    // Spring-damped return toward 0 for soft motion
    this.recoilPitchVel += (-this.recoilPitchOffset * this.recoilStiffness) * dt;
    this.recoilPitchVel *= Math.exp(-this.recoilDamping * dt);
    this.recoilPitchOffset += this.recoilPitchVel * dt;
    // clamp
    this.recoilPitchOffset = Math.max(-this.recoilMaxPitch, Math.min(this.recoilMaxPitch, this.recoilPitchOffset));
    // Apply only the delta so we don't fight PointerLock mouse updates
    if (this.camera) {
      const dPitch = this.recoilPitchOffset - this.appliedRecoilPitch;
      this.camera.rotation.x = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, this.camera.rotation.x + dPitch));
      // guard against any accidental roll accumulation
      this.camera.rotation.z = 0;
      this.appliedRecoilPitch = this.recoilPitchOffset;
    }

    // FOV handling combines sprint FOV and recoil kick
    const desiredFovBase = effectiveSprint ? this.sprintFov : this.baseFov;
    // No recoil FOV kick by default; ensure sprint FOV is preserved
    const desiredFov = desiredFovBase;
    const prevFov = this.camera.fov;
    this.camera.fov += (desiredFov - this.camera.fov) * 0.18;
    this._fovCooldown -= dt;
    if (this._fovCooldown <= 0 && Math.abs(this.camera.fov - prevFov) > this._fovEps) {
      this.camera.updateProjectionMatrix();
      this._fovCooldown = 1/60;
    }

    // Attempt move with collision (axis-separated slide)
    const step = t.step.copy(this.velXZ).multiplyScalar(dt);
    const pos = t.pos.copy(o.position);
    // Cache ground at start and thresholds for step/jump assist
    const groundAt = this._groundHeightAt(pos.x, pos.z);
    const stepUpMax = 0.12 * this.fullHeight;  // ≤12%: auto step
    const jumpAssistMax = 0.30 * this.fullHeight; // ≤30%: auto jump
    const tryAxis = (dx, dz)=>{
      const nx = pos.x + dx, nz = pos.z + dz;
      // Compute player's current feet Y based on eye height (supports mid-air jump movement)
      const eye = this.crouching ? 1.25 : 1.7;
      const feetY = (o.position.y - eye);
      t.min.set(nx - this.colliderHalf.x, Math.max(0.0, feetY + 0.05), nz - this.colliderHalf.z);
      t.max.set(nx + this.colliderHalf.x, feetY + this.fullHeight,  nz + this.colliderHalf.z);
      t.pbb.min.copy(t.min); t.pbb.max.copy(t.max);
      for(const obb of this.objectBBs){
        if(t.pbb.intersectsBox(obb)){
          // Collision at current eye height; allow attempt to step if target ground is only slightly higher
          const newGround = this._groundHeightAt(nx, nz);
          const rise = Math.max(0, newGround - groundAt);
          if (rise > 0 && rise <= jumpAssistMax + 1e-3) {
            // Tentatively allow horizontal move; vertical resolution will be handled below
            pos.x = nx; pos.z = nz; return true;
          }
          return false;
        }
      }
      pos.x += dx; pos.z += dz; return true;
    };
    tryAxis(step.x, 0);
    tryAxis(0, step.z);
    // Step-up assist: if the ground height increased by a small step, climb it; otherwise auto-jump for medium ledges
    const newGround = this._groundHeightAt(pos.x, pos.z);
    const rise = Math.max(0, newGround - groundAt);
    if (rise > 0) {
      if (rise <= stepUpMax + 1e-3) {
        // Snap onto the higher ground while preserving eye offset
        o.position.x = pos.x; o.position.z = pos.z;
        const eye = this.crouching ? 1.25 : 1.7;
        o.position.y = newGround + eye;
        this.velocityY = 0; this.canJump = true;
      } else if (rise <= jumpAssistMax + 1e-3) {
        // Auto-jump if we can; helps climb short ledges without pressing Space
        if (this.canJump && this.stamina >= this.staminaJumpCost) {
          o.position.x = pos.x; o.position.z = pos.z;
          this.velocityY = 7; this.canJump = false; this._spendStamina(this.staminaJumpCost);
        } else { /* if cannot jump now, still allow horizontal position and gravity will handle */
          o.position.x = pos.x; o.position.z = pos.z;
        }
      } else {
        o.position.x = pos.x; o.position.z = pos.z;
      }
    } else {
      o.position.x = pos.x; o.position.z = pos.z;
    }

    // Gravity, ground, head-bob
    const eyeHeight = this.crouching ? 1.25 : 1.7;
    const groundNow = this._groundHeightAt(o.position.x, o.position.z);
    const desiredEyeY = groundNow + eyeHeight;
    this.velocityY -= this.gravity * dt; o.position.y += this.velocityY * dt;
    if (o.position.y <= desiredEyeY) { o.position.y = desiredEyeY; this.velocityY = 0; this.canJump = true; }
    const speed2D = this.velXZ.lengthSq();
    if (this.canJump && speed2D > 0.04) { o.position.y += Math.sin(this._time*6.0) * 0.03; }
  }

  // External API for weapons: vertical-only kick (applied as a velocity impulse)
  applyRecoil({ pitchRad = 0 } = {}){
    this.recoilPitchVel += pitchRad * this.recoilImpulse;
  }

  // Public helpers for HUD
  getStamina01(){ return Math.max(0, Math.min(1, this.stamina / this.staminaMax)); }
  getStamina(){ return this.stamina; }

  // --- Internal stamina helpers ---
  _spendStamina(amount){
    this.stamina = Math.max(0, this.stamina - amount);
    this._staminaRegenCooldown = this.staminaRegenDelay;
  }

  // --- Spawn safety helpers ---
  _isPositionFree(x, y, z){
    const THREE = this.THREE;
    const half = this.colliderHalf;
    const t = this._tmp;
    t.min.set(x - half.x, 0.2, z - half.z);
    t.max.set(x + half.x, 1.9, z + half.z);
    t.pbb.min.copy(t.min); t.pbb.max.copy(t.max);
    for (const obb of this.objectBBs) { if (t.pbb.intersectsBox(obb)) return false; }
    return true;
  }

  _findNearestFreePosition(x, y, z){
    const THREE = this.THREE;
    const baseY = y != null ? y : 1.7;
    // Quick accept
    if (this._isPositionFree(x, baseY, z)) { this._tmp.pos.set(x, baseY, z); return this._tmp.pos; }
    // Clamp search inside arena inner margin
    const min = -38 + this.colliderHalf.x;
    const max =  38 - this.colliderHalf.x;
    const clamp = (v)=> Math.max(min, Math.min(max, v));
    const directions = [];
    const dirCount = 16; // 22.5° steps
    for (let i=0;i<dirCount;i++){
      const a = (i/dirCount) * Math.PI * 2;
      directions.push({ dx: Math.cos(a), dz: Math.sin(a) });
    }
    const step = 1.0; // search step in world units
    const maxRadius = 24; // do not search entire arena
    for (let r = step; r <= maxRadius; r += step){
      for (const d of directions){
        const nx = clamp(x + d.dx * r);
        const nz = clamp(z + d.dz * r);
        if (this._isPositionFree(nx, baseY, nz)) { this._tmp.pos.set(nx, baseY, nz); return this._tmp.pos; }
      }
    }
    // Fallback to center front if everything else fails
    const fx = 0, fz = 8;
    if (this._isPositionFree(fx, baseY, fz)) { this._tmp.pos.set(fx, baseY, fz); return this._tmp.pos; }
    this._tmp.pos.set(x, baseY, z); return this._tmp.pos;
  }

  // Compute supporting ground height at XZ using AABBs (top faces). Returns world Y of ground top.
  _groundHeightAt(x, z, forcePrecise = false){
    const THREE = this.THREE;
    const cache = this._groundCache;
    const o = this.controls.getObject();
    const eye = this.crouching ? 1.25 : 1.7;
    // Decide whether to skip raycast based on movement and airborne state
    let movedXZ = true;
    if (cache.x !== Infinity) {
      const dx = x - cache.x, dz = z - cache.z;
      movedXZ = Math.hypot(dx, dz) > this._groundXZThresh;
      const desiredEyeY = cache.y + eye;
      const airborne = (o.position.y - desiredEyeY) > 0.6;
      if (!forcePrecise) {
        if (airborne) return cache.y;
        if (!movedXZ) return cache.y;
      }
    }

    // Precise raycast downward from above player footprint center
    const t = this._tmp;
    t.pos.set(x, 10.0, z);
    try {
      this._groundRaycaster.set(t.pos, t.down);
      this._groundRaycaster.far = 20;
      const hits = this._groundRaycaster.intersectObjects(this.objects, false);
      if (hits && hits.length) {
        let top = 0;
        for (const h of hits) { if (h.point && h.point.y > top) top = h.point.y; }
        cache.x = x; cache.z = z; cache.y = top;
        return top;
      }
    } catch(_) {}

    // Fallback to AABB sampling of footprint
    const half = this.colliderHalf;
    const probeMinX = x - half.x;
    const probeMaxX = x + half.x;
    const probeMinZ = z - half.z;
    const probeMaxZ = z + half.z;
    let maxTop = 0;
    for (const obb of this.objectBBs){
      if (probeMaxX < obb.min.x || probeMinX > obb.max.x) continue;
      if (probeMaxZ < obb.min.z || probeMinZ > obb.max.z) continue;
      const top = obb.max.y;
      if (top > maxTop) maxTop = top;
    }
    cache.x = x; cache.z = z; cache.y = maxTop;
    return maxTop;
  }
}


