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

    // Listeners
    window.addEventListener('keydown', (e)=>{
      this.keys.add(e.code);
      if(e.code === 'Space' && this.canJump){ this.velocityY = 7; this.canJump = false; }
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
    o.position.set(x,y,z);
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

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const targetSpeed = this.moveSpeed * (sprinting ? 1.6 : 1.0) * (this.crouching ? 0.55 : 1.0);

    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(targetSpeed);
      const toAdd = wish.clone().sub(this.velXZ).clampLength(0, this.accel * dt);
      this.velXZ.add(toAdd);
    } else {
      const damp = Math.max(0, 1 - this.damping * dt);
      this.velXZ.multiplyScalar(damp);
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
    const desiredFovBase = sprinting ? this.sprintFov : this.baseFov;
    // No recoil FOV kick by default; ensure sprint FOV is preserved
    const desiredFov = desiredFovBase;
    this.camera.fov += (desiredFov - this.camera.fov) * 0.18; this.camera.updateProjectionMatrix();

    // Attempt move with collision (axis-separated slide)
    const step = this.velXZ.clone().multiplyScalar(dt);
    const pos = o.position.clone();
    const tryAxis = (dx, dz)=>{
      const nx = pos.x + dx, nz = pos.z + dz;
      const min = new THREE.Vector3(nx - this.colliderHalf.x, 0.2, nz - this.colliderHalf.z);
      const max = new THREE.Vector3(nx + this.colliderHalf.x, 1.9, nz + this.colliderHalf.z);
      const pbb = new THREE.Box3(min, max);
      for(const obb of this.objectBBs){ if(pbb.intersectsBox(obb)) return false; }
      pos.x += dx; pos.z += dz; return true;
    };
    tryAxis(step.x, 0);
    tryAxis(0, step.z);
    o.position.x = pos.x; o.position.z = pos.z;

    // Gravity, ground, head-bob
    const baseHeight = this.crouching ? 1.25 : 1.7;
    this.velocityY -= this.gravity * dt; o.position.y += this.velocityY * dt;
    if (o.position.y <= baseHeight) { o.position.y = baseHeight; this.velocityY = 0; this.canJump = true; }
    const speed2D = this.velXZ.length();
    if (this.canJump && speed2D > 0.2) { o.position.y += Math.sin(performance.now()*0.02) * 0.03; }
  }

  // External API for weapons: vertical-only kick (applied as a velocity impulse)
  applyRecoil({ pitchRad = 0 } = {}){
    this.recoilPitchVel += pitchRad * this.recoilImpulse;
  }
}


