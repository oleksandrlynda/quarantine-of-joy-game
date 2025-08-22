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
        let active = false;
        joyEl.addEventListener('touchstart', e=>{
          active = true; e.preventDefault();
        });
        joyEl.addEventListener('touchmove', e=>{
          if(!active) return; e.preventDefault();
          const t = e.touches[0];
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
          active = false;
          if (knob) knob.style.transform = 'translate(0,0)';
          updateFromVector(0,0);
        };
        joyEl.addEventListener('touchend', reset);
        joyEl.addEventListener('touchcancel', reset);
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
    // Use base yaw (not camera) for movement so recoil never influences movement direction
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(this.yawObject.quaternion); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    const wish = new THREE.Vector3();
    if (this.keys.has('KeyW')) wish.add(forward);
    if (this.keys.has('KeyS')) wish.add(forward.clone().multiplyScalar(-1));
    if (this.keys.has('KeyA')) wish.add(right.clone().multiplyScalar(-1));
    if (this.keys.has('KeyD')) wish.add(right);

    const wantsSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const hasStaminaForSprint = this.stamina > 0.5; // allow minor underflow guard
    const effectiveSprint = wantsSprint && hasStaminaForSprint;
    // Low stamina penalty: reduced sprint speed if stamina below threshold
    const sprintMultiplier = effectiveSprint ? ((this.stamina <= this.lowStaminaThreshold) ? 1.2 : 1.6) : 1.0;
    const targetSpeed = this.moveSpeed * sprintMultiplier * (this.crouching ? 0.55 : 1.0);

    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(targetSpeed);
      const toAdd = wish.clone().sub(this.velXZ).clampLength(0, this.accel * dt);
      this.velXZ.add(toAdd);
    } else {
      const damp = Math.max(0, 1 - this.damping * dt);
      this.velXZ.multiplyScalar(damp);
    }

    // Stamina drain/regeneration
    // Drain only while actively sprinting and actually trying to move
    if (wantsSprint && wish.lengthSq() > 0 && this.velXZ.lengthSq() > 0.0001) {
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
    this.camera.fov += (desiredFov - this.camera.fov) * 0.18; this.camera.updateProjectionMatrix();

    // Attempt move with collision (axis-separated slide)
    const step = this.velXZ.clone().multiplyScalar(dt);
    const pos = o.position.clone();
    // Cache ground at start and thresholds for step/jump assist
    const groundAt = this._groundHeightAt(pos.x, pos.z);
    const stepUpMax = 0.12 * this.fullHeight;  // ≤12%: auto step
    const jumpAssistMax = 0.30 * this.fullHeight; // ≤30%: auto jump
    const tryAxis = (dx, dz)=>{
      const nx = pos.x + dx, nz = pos.z + dz;
      // Compute player's current feet Y based on eye height (supports mid-air jump movement)
      const eye = this.crouching ? 1.25 : 1.7;
      const feetY = (o.position.y - eye);
      const min = new THREE.Vector3(nx - this.colliderHalf.x, Math.max(0.0, feetY + 0.05), nz - this.colliderHalf.z);
      const max = new THREE.Vector3(nx + this.colliderHalf.x, feetY + this.fullHeight, nz + this.colliderHalf.z);
      const pbb = new THREE.Box3(min, max);
      for(const obb of this.objectBBs){
        if(pbb.intersectsBox(obb)){
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
    const speed2D = this.velXZ.length();
    if (this.canJump && speed2D > 0.2) { o.position.y += Math.sin(performance.now()*0.02) * 0.03; }
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
    const min = new THREE.Vector3(x - half.x, 0.2, z - half.z);
    const max = new THREE.Vector3(x + half.x, 1.9, z + half.z);
    const pbb = new THREE.Box3(min, max);
    for (const obb of this.objectBBs) { if (pbb.intersectsBox(obb)) return false; }
    return true;
  }

  _findNearestFreePosition(x, y, z){
    const THREE = this.THREE;
    const baseY = y != null ? y : 1.7;
    // Quick accept
    if (this._isPositionFree(x, baseY, z)) return new THREE.Vector3(x, baseY, z);
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
        if (this._isPositionFree(nx, baseY, nz)) return new THREE.Vector3(nx, baseY, nz);
      }
    }
    // Fallback to center front if everything else fails
    const fx = 0, fz = 8;
    if (this._isPositionFree(fx, baseY, fz)) return new THREE.Vector3(fx, baseY, fz);
    return new THREE.Vector3(x, baseY, z);
  }

  // Compute supporting ground height at XZ using AABBs (top faces). Returns world Y of ground top.
  _groundHeightAt(x, z){
    const THREE = this.THREE;
    // First try precise raycast downward from above player footprint center
    const origin = new THREE.Vector3(x, 10.0, z);
    const dir = new THREE.Vector3(0,-1,0);
    try {
      this._groundRaycaster.set(origin, dir);
      this._groundRaycaster.far = 20;
      const hits = this._groundRaycaster.intersectObjects(this.objects, false);
      if (hits && hits.length) {
        // pick highest hit below origin
        let top = 0;
        for (const h of hits) { if (h.point && h.point.y > top) top = h.point.y; }
        if (top != null) return top;
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
    return maxTop;
  }
}


