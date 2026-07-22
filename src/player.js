import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { logError } from '../src/util/log.js';

const MAX_LOOK_RADIANS_PER_EVENT = Math.PI / 4;
const MAX_LOOK_DEGREES_PER_EVENT = 45;

function containsExtrudeGeometry(obj){
  if (obj.geometry?.isExtrudeGeometry) return true;
  for (const child of obj.children || []){
    if (containsExtrudeGeometry(child)) return true;
  }
  return false;
}

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
    // Keep direct Euler updates in the same order PointerLockControls uses.
    // Mixing the default XYZ order with PointerLockControls' YXZ quaternion
    // updates can choose the opposite Euler representation near steep pitch.
    if (this.camera?.rotation) this.camera.rotation.order = 'YXZ';
    // Do NOT reparent when controls return the camera itself (modern THREE)
    // If getObject() returns a separate yaw carrier, you may attach the camera to it,
    // but only when they are distinct objects. We avoid touching hierarchy here.

    // Input state
    this.keys = new Set();
    this.crouching = false;
    this.canJump = false;
    this.headBobEnabled = true;
    this.onLookAnomaly = null;

    // Movement params
    this.moveSpeed = 6;
    this.accel = 50;
    this.damping = 10;
    this.gravity = 20;
    this.velocityY = 0;
    this.velXZ = new THREE.Vector3();
    this.baseFov = 75;
    this.sprintFov = 82;
    this.zoomMultiplier = 1;

    // Stamina system
    this.baseStaminaMax = 100;
    this.staminaMax = this.baseStaminaMax;
    this.stamina = this.staminaMax;
    this.staminaRegenPerSec = 18;     // per design: 18/s
    this.staminaSprintCostPerSec = 12;// per design: ~12/s while sprinting
    this.staminaJumpCost = 15;        // per design: ~15 per jump
    this.staminaRegenDelay = 0.5;     // seconds after last spend
    this._staminaRegenCooldown = 0;   // countdown timer until regen resumes
    this.lowStaminaThreshold = 15;    // cannot jump below this; reduced sprint speed when low

    // Punchline Rush is an unlock-gated combat verb configured by main.js.
    this._rush = {
      active: false,
      direction: new THREE.Vector3(0, 0, -1),
      distance: 0,
      travelled: 0,
      duration: 0,
      elapsed: 0,
      speed: 0
    };
    this.onRushStep = null;
    this.onRushEnd = null;

    // Recoil (softer, spring-damped)
    this.recoilPitchOffset = 0;     // radians (current offset)
    this.appliedRecoilPitch = 0;    // last-applied value to camera this frame
    this.recoilPitchVel = 0;        // radians/sec (spring velocity)
    this.recoilStiffness = 48.0;    // spring k (higher = snappier)
    this.recoilDamping = 10.0;      // damping factor (higher = more damping)
    this.recoilImpulse = 10.0;      // velocity gain per input rad
    this.recoilMaxPitch = 0.35;     // safety cap (~20°)

    // Collision helpers (skip extruded walls)
    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o) && !o?.userData?.walkableSurface && o?.userData?.blocksMovement !== false)
      .map(o => new THREE.Box3().setFromObject(o));
    this.collisionObjects = this.objects.filter(o => o?.userData?.blocksMovement !== false);
    this.colliderHalf = new THREE.Vector3(0.45, 0.9, 0.45); // physical body, not a point camera
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
      sweptPbb: new THREE.Box3(),
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

    // Look settings
    this.lookSensitivity = parseFloat(localStorage.getItem('mouseSensitivity') || '1');
    this.invertLook = localStorage.getItem('invertLook') === 'true';
    const sensInput = document.getElementById('mouseSensitivity');
    const invertInput = document.getElementById('invertLook');
    if (sensInput){
      sensInput.value = String(this.lookSensitivity);
      sensInput.addEventListener('input', e=>{
        this.lookSensitivity = parseFloat(e.target.value);
        localStorage.setItem('mouseSensitivity', String(this.lookSensitivity));
      });
    }
    if (invertInput){
      invertInput.checked = this.invertLook;
      invertInput.addEventListener('change', e=>{
        this.invertLook = e.target.checked;
        localStorage.setItem('invertLook', String(this.invertLook));
      });
    }

    if (!this.isMobile){
      window.addEventListener('keydown', (e)=>{
        this.keys.add(e.code);
        if(e.code === 'Space') this.jump();
        if(e.code==='KeyC') this.crouching = true;
      });
      window.addEventListener('keyup', (e)=>{
        this.keys.delete(e.code);
        if(e.code==='KeyC') this.crouching = false;
      });
      // PointerLockControls listens for mousemove on ownerDocument. Capture on
      // that same target so every event takes exactly one rotation path,
      // regardless of whether the browser targets body, canvas, or document.
      const lookEventTarget = this.domElement.ownerDocument || this.domElement;
      lookEventTarget.addEventListener('mousemove', e=>{
        if (this.controls.isLocked !== true) return;
        e.stopImmediatePropagation();
        this._applyLookDelta(e.movementX, e.movementY, 0.002);
      }, true);
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
          this._applyLookDelta(dx, dy, 0.0025, false);
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

  _applyLookDelta(rawX, rawY, radiansPerUnit, rejectOutlier = true){
    const movementX = Number(rawX) || 0;
    const movementY = Number(rawY) || 0;
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) return false;
    const scale = Number.isFinite(radiansPerUnit) ? radiansPerUnit : 0.002;
    const sensitivity = Number.isFinite(this.lookSensitivity) ? this.lookSensitivity : 1;
    const yawDelta = movementX * scale * sensitivity;
    const inv = this.invertLook ? -1 : 1;
    const pitchDelta = movementY * scale * sensitivity * inv;
    // Pointer-lock acquisition and display-buffer resizes can occasionally
    // report a synthetic screen-sized delta. Reject any single event that
    // would teleport the view by more than 45 degrees at the chosen sensitivity.
    if (rejectOutlier && (Math.abs(yawDelta) > MAX_LOOK_RADIANS_PER_EVENT || Math.abs(pitchDelta) > MAX_LOOK_RADIANS_PER_EVENT)) {
      try {
        this.onLookAnomaly?.({
          movementX,
          movementY,
          yawDeltaDegrees: yawDelta * 180 / Math.PI,
          pitchDeltaDegrees: pitchDelta * 180 / Math.PI,
          thresholdDegrees: MAX_LOOK_DEGREES_PER_EVENT,
          sensitivity
        });
      } catch {}
      return false;
    }
    this.yawObject.rotation.y -= yawDelta;
    this.pitchObject.rotation.x -= pitchDelta;
    this.pitchObject.rotation.x = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, this.pitchObject.rotation.x));
    return true;
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
    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o) && !o?.userData?.walkableSurface && o?.userData?.blocksMovement !== false)
      .map(o => new THREE.Box3().setFromObject(o));
    this.collisionObjects = this.objects.filter(o => o?.userData?.blocksMovement !== false);
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

    const rushing = this._rush.active;
    t.wish.set(0,0,0);
    if (rushing) {
      t.wish.copy(this._rush.direction);
    } else {
      if (this.keys.has('KeyW')) t.wish.add(t.fwd);
      if (this.keys.has('KeyS')) t.wish.addScaledVector(t.fwd, -1);
      if (this.keys.has('KeyA')) t.wish.addScaledVector(t.right, -1);
      if (this.keys.has('KeyD')) t.wish.add(t.right);
    }
    const wishLenSq0 = t.wish.lengthSq();

    const wantsSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const hasStaminaForSprint = this.stamina > 0.5; // allow minor underflow guard
    const effectiveSprint = !rushing && wantsSprint && hasStaminaForSprint;
    // Low stamina penalty: reduced sprint speed if stamina below threshold
    const sprintMultiplier = effectiveSprint ? ((this.stamina <= this.lowStaminaThreshold) ? 1.2 : 1.6) : 1.0;
    const targetSpeed = rushing
      ? this._rush.speed
      : this.moveSpeed * sprintMultiplier * (this.crouching ? 0.55 : 1.0);

    if (wishLenSq0 > 0) {
      t.wish.normalize().multiplyScalar(targetSpeed);
      if (rushing) this.velXZ.copy(t.wish);
      else {
        t.step.copy(t.wish).sub(this.velXZ).clampLength(0, this.accel * dt);
        this.velXZ.add(t.step);
      }
    } else {
      const damp = Math.max(0, 1 - this.damping * dt);
      this.velXZ.multiplyScalar(damp);
    }

    // Stamina drain/regeneration
    // Drain only while actively sprinting and actually trying to move
    if (rushing) {
      // Rush spends its entire bar on activation. Its long recovery delay starts
      // counting down only after the committed movement has finished.
    } else if (wantsSprint && wishLenSq0 > 0 && this.velXZ.lengthSq() > 0.0001) {
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

    // FOV handling combines sprint FOV with weapon magnification.
    const desiredFovBase = (effectiveSprint || rushing) ? this.sprintFov : this.baseFov;
    // No recoil FOV kick by default; ensure sprint FOV is preserved
    const desiredFov = desiredFovBase;
    const prevFov = this.camera.fov;
    const prevZoom = Number.isFinite(this.camera.zoom) ? this.camera.zoom : 1;
    this.camera.fov += (desiredFov - this.camera.fov) * 0.18;
    this.camera.zoom = prevZoom + (this.zoomMultiplier - prevZoom) * 0.18;
    this._fovCooldown -= dt;
    const projectionChanged = Math.abs(this.camera.fov - prevFov) > this._fovEps
      || Math.abs(this.camera.zoom - prevZoom) > this._fovEps;
    if (this._fovCooldown <= 0 && projectionChanged) {
      this.camera.updateProjectionMatrix();
      this._fovCooldown = 1/60;
    }

    // Attempt move with collision (axis-separated slide)
    const step = t.step.copy(this.velXZ).multiplyScalar(dt);
    if (rushing) {
      const remainingRushDistance = Math.max(0, this._rush.distance - this._rush.travelled);
      const plannedDistance = step.length();
      if (plannedDistance > remainingRushDistance && plannedDistance > 0) {
        step.multiplyScalar(remainingRushDistance / plannedDistance);
      }
    }
    const pos = t.pos.copy(o.position);
    const rushStartX = o.position.x;
    const rushStartZ = o.position.z;
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
      const currentMinX = pos.x - this.colliderHalf.x;
      const currentMaxX = pos.x + this.colliderHalf.x;
      const currentMinZ = pos.z - this.colliderHalf.z;
      const currentMaxZ = pos.z + this.colliderHalf.z;
      // Test the complete axis motion, not only its destination. A boss
      // impulse, rush, turbo frame, or long frame can otherwise move the body
      // from one side of a thin post to the other without the final AABB ever
      // touching it.
      t.sweptPbb.min.set(
        Math.min(currentMinX, t.min.x),
        t.min.y,
        Math.min(currentMinZ, t.min.z)
      );
      t.sweptPbb.max.set(
        Math.max(currentMaxX, t.max.x),
        t.max.y,
        Math.max(currentMaxZ, t.max.z)
      );
      for(const obb of this.objectBBs){
        const nextIntersects = t.pbb.intersectsBox(obb);
        if (!nextIntersects && !t.sweptPbb.intersectsBox(obb)) continue;

        const currentOverlapX = Math.min(currentMaxX, obb.max.x) - Math.max(currentMinX, obb.min.x);
        const currentOverlapY = Math.min(t.max.y, obb.max.y) - Math.max(t.min.y, obb.min.y);
        const currentOverlapZ = Math.min(currentMaxZ, obb.max.z) - Math.max(currentMinZ, obb.min.z);
        const currentlyPenetrating = currentOverlapX > 0 && currentOverlapY > 0 && currentOverlapZ > 0;

        // A swept hit with a clear destination is either tunnelling from free
        // space (block it), or a complete escape from an existing overlap
        // caused by phase activation (allow it).
        if (!nextIntersects) {
          if (currentlyPenetrating) {
            const currentAxisOffset = dx !== 0
              ? pos.x - (obb.min.x + obb.max.x) * .5
              : pos.z - (obb.min.z + obb.max.z) * .5;
            const nextAxisOffset = dx !== 0
              ? nx - (obb.min.x + obb.max.x) * .5
              : nz - (obb.min.z + obb.max.z) * .5;
            const crossesColliderCenter = currentAxisOffset * nextAxisOffset < 0;
            const movesOutward = Math.abs(nextAxisOffset) > Math.abs(currentAxisOffset) + 1e-8;
            if (!crossesColliderCenter && movesOutward) continue;
          }
          return false;
        }

        if(nextIntersects){
          // A collider can become active while the player is already touching
          // it (objective variants do this), and floating-point/axis-separated
          // movement can also leave a tiny overlap at a rounded prop. Blocking
          // every still-intersecting step traps the player permanently. Permit
          // only steps that strictly reduce the existing overlap volume; steps
          // that hold or increase penetration remain blocked.
          if (currentlyPenetrating) {
            const nextOverlapX = Math.min(t.max.x, obb.max.x) - Math.max(t.min.x, obb.min.x);
            const nextOverlapZ = Math.min(t.max.z, obb.max.z) - Math.max(t.min.z, obb.min.z);
            const currentPenetration = currentOverlapX * currentOverlapY * currentOverlapZ;
            const nextPenetration = Math.max(0, nextOverlapX) * currentOverlapY * Math.max(0, nextOverlapZ);
            if (nextPenetration < currentPenetration - 1e-8) continue;
          }
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

    if (rushing) {
      const moved = Math.hypot(o.position.x - rushStartX, o.position.z - rushStartZ);
      this._rush.travelled += moved;
      this._rush.elapsed += dt;
      this.onRushStep?.({
        position: o.position,
        direction: this._rush.direction,
        travelled: this._rush.travelled,
        distance: this._rush.distance
      });
      if (this._rush.travelled >= this._rush.distance - 0.01 || this._rush.elapsed >= this._rush.duration) {
        this._finishRush();
      }
    }

    // Gravity, ground, head-bob
    const eyeHeight = this.crouching ? 1.25 : 1.7;
    // Use the ground we resolved during the step/jump phase to avoid
    // snapping up to nearby tall walls just because our footprint overlaps them
    const groundNow = resolvedGround;
    const desiredEyeY = groundNow + eyeHeight;
    this.velocityY -= this.gravity * dt; o.position.y += this.velocityY * dt;
    // Resolve upward movement against solid overhead slabs. Horizontal AABB
    // collision already protects walls, but without this pass a jump could
    // move the player's head through a low authored ceiling.
    if (this.velocityY > 0) {
      const feetY = o.position.y - eyeHeight;
      const headY = feetY + this.fullHeight;
      const minX = o.position.x - this.colliderHalf.x;
      const maxX = o.position.x + this.colliderHalf.x;
      const minZ = o.position.z - this.colliderHalf.z;
      const maxZ = o.position.z + this.colliderHalf.z;
      let ceilingBottom = Infinity;
      for (const obb of this.objectBBs) {
        if (maxX < obb.min.x || minX > obb.max.x || maxZ < obb.min.z || minZ > obb.max.z) continue;
        if (obb.min.y <= feetY + .05 || headY < obb.min.y) continue;
        ceilingBottom = Math.min(ceilingBottom, obb.min.y);
      }
      if (Number.isFinite(ceilingBottom)) {
        o.position.y = ceilingBottom - (this.fullHeight - eyeHeight) - .01;
        this.velocityY = 0;
      }
    }
    if (o.position.y <= desiredEyeY) { o.position.y = desiredEyeY; this.velocityY = 0; this.canJump = true; }
    const speed2D = this.velXZ.lengthSq();
    if (this.headBobEnabled !== false && this.canJump && speed2D > 0.04) {
      o.position.y += Math.sin(this._time*6.0) * 0.03;
    }
  }

  // External API for weapons: vertical-only kick (applied as a velocity impulse)
  applyRecoil({ pitchRad = 0 } = {}){
    this.recoilPitchVel += pitchRad * this.recoilImpulse;
  }

  setZoomMultiplier(multiplier = 1){
    const next = Number(multiplier);
    this.zoomMultiplier = Number.isFinite(next) && next > 1 ? next : 1;
  }

  // Allow external systems to push the player horizontally
  applyKnockback(vec){
    if (!vec) return;
    this.velXZ.add(vec);
  }

  // Public helpers for HUD
  getStamina01(){ return Math.max(0, Math.min(1, this.stamina / this.staminaMax)); }
  getStamina(){ return this.stamina; }

  canStartRush({ requireFullStamina = true } = {}){
    return !this._rush.active && (!requireFullStamina || this.stamina >= this.staminaMax - 0.01);
  }

  startRush({ distance = 10, duration = 0.6, regenDelay = 8, requireFullStamina = true, consumeStamina = true } = {}){
    if (!this.canStartRush({ requireFullStamina })) return false;
    const forward = this._rush.direction.set(0, 0, -1).applyQuaternion(this.yawObject.quaternion);
    forward.y = 0;
    if (forward.lengthSq() <= 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    this._rush.active = true;
    this._rush.distance = Math.max(0.1, Number(distance) || 10);
    this._rush.duration = Math.max(0.1, Number(duration) || 0.6);
    this._rush.travelled = 0;
    this._rush.elapsed = 0;
    this._rush.speed = this._rush.distance / this._rush.duration;
    if (consumeStamina) this.stamina = 0;
    if (regenDelay > 0) this._staminaRegenCooldown = Math.max(this._rush.duration, Number(regenDelay) || 0);
    return true;
  }

  isRushing(){ return this._rush.active; }
  isInvulnerable(){ return this._rush.active; }

  _finishRush(){
    if (!this._rush.active) return;
    this._rush.active = false;
    this.velXZ.set(0, 0, 0);
    this.onRushEnd?.({ travelled: this._rush.travelled, distance: this._rush.distance });
  }

  addStaminaCapacity(amount, { fill = true } = {}){
    const gain = Math.max(0, Number(amount) || 0);
    this.staminaMax = Math.max(this.baseStaminaMax, this.staminaMax + gain);
    if (fill) this.stamina = Math.min(this.staminaMax, this.stamina + gain);
    return this.staminaMax;
  }

  restoreStamina(amount){
    const before = this.stamina;
    this.stamina = Math.min(this.staminaMax, this.stamina + Math.max(0, Number(amount) || 0));
    return this.stamina - before;
  }

  resetStaminaCapacity(){
    this._finishRush();
    this.staminaMax = this.baseStaminaMax;
    this.stamina = this.staminaMax;
    this._staminaRegenCooldown = 0;
    return this.staminaMax;
  }

  exportCheckpointState(){
    return { staminaMax: this.staminaMax };
  }

  restoreCheckpointState(snapshot){
    if (!snapshot) return false;
    this._finishRush();
    this.staminaMax = Math.max(this.baseStaminaMax, Number(snapshot.staminaMax) || this.baseStaminaMax);
    this.stamina = this.staminaMax;
    this._staminaRegenCooldown = 0;
    return true;
  }

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
    // A top face is valid ground only when the player's feet can actually
    // reach it. Without this guard, the downward ray can see the roof of a
    // tall prop while the body is still beside it and snap the player onto
    // that roof. The same allowance used by the movement step/jump assist
    // keeps genuinely reachable ledges and landing surfaces valid.
    const feetY = o.position.y - eye;
    const maxReachableTop = feetY + 0.30 * this.fullHeight + 0.001;
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
      const hits = this._groundRaycaster.intersectObjects(this.collisionObjects, false);
      if (hits && hits.length) {
        let top = 0;
        for (const h of hits) {
          if (h.point && h.point.y <= maxReachableTop && h.point.y > top) top = h.point.y;
        }
        cache.x = x; cache.z = z; cache.y = top;
        return top;
      }
    } catch (e) { logError(e); }

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
      if (top > maxReachableTop) continue;
      if (top > maxTop) maxTop = top;
    }
    cache.x = x; cache.z = z; cache.y = maxTop;
    return maxTop;
  }
}


