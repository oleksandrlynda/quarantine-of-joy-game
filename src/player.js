import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';

export class PlayerController {
  constructor(THREE, camera, domElement, collidableObjects, arenaRadius = Infinity){
    this.THREE = THREE;
    this.camera = camera;
    this.domElement = domElement;
    this.objects = collidableObjects;
    this.arenaRadius = arenaRadius;

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
    this._forwardRaycaster = new THREE.Raycaster();

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

    // Input helpers
    this.isMobile = window.matchMedia('(pointer:coarse)').matches;
    this.joy = {x:0, y:0};

    if (!this.isMobile){
      window.addEventListener('keydown', (e)=>{
        this.keys.add(e.code);
        if(e.code === 'Space') this.jump();
        if(e.code==='ControlLeft' || e.code==='ControlRight') this.crouching = true;
      });
      window.addEventListener('keyup', (e)=>{
        this.keys.delete(e.code);
        if(e.code==='ControlLeft' || e.code==='ControlRight') this.crouching = false;
      });
    } else {
      // Virtual joystick for movement
      const joyEl = document.getElementById('joystick');
      const knob = joyEl?.querySelector('.knob');
      const updateFromVector = (dx, dy)=>{
        const threshold = 0.3;
        this.keys.delete('KeyW'); this.keys.delete('KeyS');
        this.keys.delete('KeyA'); this.keys.delete('KeyD');
        if (dy < -threshold) this.keys.add('KeyW');
        if (dy > threshold) this.keys.add('KeyS');
        if (dx < -threshold) this.keys.add('KeyA');
        if (dx > threshold) this.keys.add('KeyD');
      };
      if (joyEl){
        let active = false, joyId = null;
        joyEl.addEventListener('touchstart', e=>{
          const t = e.changedTouches[0];
          joyId = t.identifier;
          active = true; e.preventDefault();
        });
        joyEl.addEventListener('touchmove', e=>{
          if(!active) return; e.preventDefault();
          const t = Array.from(e.touches).find(tt=>tt.identifier===joyId);
          if(!t) return;
          const rect = joyEl.getBoundingClientRect();
          const r = rect.width/2;
          const x = t.clientX - (rect.left + r);
          const y = t.clientY - (rect.top + r);
          const mag = Math.min(r, Math.hypot(x,y));
          const ang = Math.atan2(y,x);
          const dx = Math.cos(ang)*mag/r;
          const dy = Math.sin(ang)*mag/r;
          if (knob) knob.style.transform = `translate(${dx*r}px, ${dy*r}px)`;
          updateFromVector(dx, dy);
        }, {passive:false});
        const reset = ()=>{
          active = false; joyId = null;
          if (knob) knob.style.transform = 'translate(0,0)';
          updateFromVector(0,0);
        };
        joyEl.addEventListener('touchend', e=>{
          if(Array.from(e.changedTouches).some(t=>t.identifier===joyId)) reset();
        });
        joyEl.addEventListener('touchcancel', e=>{
          if(Array.from(e.changedTouches).some(t=>t.identifier===joyId)) reset();
        });
      }
        // Look controls on right side
        let lookId = null, lx=0, ly=0;
        this.domElement.addEventListener('touchstart', e=>{
          if (e.target.closest('#actionButtons')) return;
          for(const t of e.touches){
            if (t.clientX > window.innerWidth/2){ lookId=t.identifier; lx=t.clientX; ly=t.clientY; break; }
          }
        }, {passive:false});
        this.domElement.addEventListener('touchmove', e=>{
          if(lookId===null) return; e.preventDefault();
          const t = Array.from(e.touches).find(tt=>tt.identifier===lookId);
          if(!t) return;
          const dx = t.clientX - lx; const dy = t.clientY - ly;
          this.yawObject.rotation.y -= dx * 0.0025;
          this.pitchObject.rotation.x -= dy * 0.0025;
          this.pitchObject.rotation.x = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, this.pitchObject.rotation.x));
          lx = t.clientX; ly = t.clientY;
        }, {passive:false});
        const endLook = e=>{
          if(lookId===null) return;
          for(const t of e.changedTouches){
            if(t.identifier===lookId){ lookId=null; break; }
          }
        };
        this.domElement.addEventListener('touchend', endLook);
        this.domElement.addEventListener('touchcancel', endLook);
    }
  }

  jump(){
    if(this.canJump && this.stamina >= this.staminaJumpCost){
      this.velocityY = 7;
      this.canJump = false;
      this._spendStamina(this.staminaJumpCost);
    }
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
    // Track the resolved ground used later for gravity snap so we don't
    // instantly "teleport" up to tall wall tops when merely touching them
    let resolvedGround = groundAt;
    // Tighten step-up to reduce unintended wall climbing
    const stepUpMax = 0.08 * this.fullHeight;  // ≤8%: auto step (~14cm)
    const jumpAssistMax = 0.30 * this.fullHeight; // ≤30%: auto jump
    const tryAxis = (dx, dz)=>{
      const nx = pos.x + dx, nz = pos.z + dz;
      if (this.arenaRadius !== Infinity) {
        const maxR = this.arenaRadius - this.colliderHalf.x;
        if (Math.hypot(nx, nz) > maxR) return false;
      }
      // Compute player's current feet Y based on eye height (supports mid-air jump movement)
      const eye = this.crouching ? 1.25 : 1.7;
      const feetY = (o.position.y - eye);
      t.min.set(nx - this.colliderHalf.x, Math.max(0.0, feetY + 0.05), nz - this.colliderHalf.z);
      t.max.set(nx + this.colliderHalf.x, feetY + this.fullHeight,  nz + this.colliderHalf.z);
      t.pbb.min.copy(t.min); t.pbb.max.copy(t.max);
      for(const obb of this.objectBBs){
        if(t.pbb.intersectsBox(obb)){
          // Collision detected - completely block this axis movement
          return false;
        }
      }
      pos.x += dx; pos.z += dz; return true;
    };
    tryAxis(step.x, 0);
    tryAxis(0, step.z);
    // Step-up assist: only works when we successfully moved horizontally (no collisions)
    // Check if we actually moved from where we started
    const actuallyMoved = (Math.abs(pos.x - o.position.x) > 1e-6 || Math.abs(pos.z - o.position.z) > 1e-6);
    if (actuallyMoved) {
      const newGround = this._groundHeightAt(pos.x, pos.z, true);
      const rise = Math.max(0, newGround - groundAt);
      if (rise > 0) {
        if (rise <= stepUpMax + 1e-3) {
          // Small step-up onto accessible surface
          o.position.x = pos.x; o.position.z = pos.z;
          const eye = this.crouching ? 1.25 : 1.7;
          o.position.y = newGround + eye;
          this.velocityY = 0; this.canJump = true;
          resolvedGround = newGround;
        } else if (rise <= jumpAssistMax + 1e-3) {
          // Auto-jump for medium ledges (only if we have stamina and can jump)
          if (this.canJump && this.stamina >= this.staminaJumpCost) {
            o.position.x = pos.x; o.position.z = pos.z;
            this.velocityY = 7; this.canJump = false; this._spendStamina(this.staminaJumpCost);
            resolvedGround = groundAt;
          } else {
            // Can't jump - don't move horizontally, stay where we are
            o.position.x = pos.x; o.position.z = pos.z;
            resolvedGround = groundAt;
          }
        } else {
          // Too high - just move horizontally, don't snap up
          o.position.x = pos.x; o.position.z = pos.z;
          resolvedGround = groundAt;
        }
      } else {
        // Normal movement to same or lower ground
        o.position.x = pos.x; o.position.z = pos.z;
        resolvedGround = newGround;
      }
    } else {
      // Didn't move due to collisions - don't change position or ground reference
      resolvedGround = groundAt;
    }

    // Gravity, ground, head-bob
    const eyeHeight = this.crouching ? 1.25 : 1.7;
    // Use the ground we resolved during the step/jump phase to avoid
    // snapping up to nearby tall walls just because our footprint overlaps them
    const groundNow = resolvedGround;
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
    if (this.arenaRadius !== Infinity) {
      const maxR = this.arenaRadius - half.x;
      if (Math.hypot(x, z) > maxR) return false;
    }
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
    const maxR = this.arenaRadius !== Infinity ? this.arenaRadius - this.colliderHalf.x : 38;
    const clamp = (v)=> Math.max(-maxR, Math.min(maxR, v));
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
        if (this.arenaRadius !== Infinity && Math.hypot(nx, nz) > maxR) continue;
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


