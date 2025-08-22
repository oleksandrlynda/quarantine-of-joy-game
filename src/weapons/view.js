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
      this.root.position.copy(this._hipOffset);
  
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
  
      // geometry materials
      this._matMetal = new THREE.MeshStandardMaterial({ color: 0x4c5560, roughness: 0.35, metalness: 0.65, emissive: 0x000000 });
      this._matBody  = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.7,  metalness: 0.2,  emissive: 0x060606 });
      this._matBlade = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x60a5fa, emissiveIntensity: 4.0, roughness: 0.2, metalness: 0.0 });
      this._baseBladeIntensity = this._matBlade.emissiveIntensity;

      this.setWeapon('rifle');
    }
  
    // ---------- external control ----------
    setMove(x, y){ this._move.set(x||0, y||0); }
    setLook(dx, dy){ this._look.set(dx||0, dy||0); }
    setADS(t){ this._ads = Math.max(0, Math.min(1, t||0)); }
    setSprint(t){ this._sprint = Math.max(0, Math.min(1, t||0)); }
  
    onFire(strength=1){
      // recoil
      const s = Math.max(0.2, Math.min(1.5, strength));
      this._kickVelPos -= 0.55 * s;
      this._kickVelRot += 0.35 * s;
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
      const THREE = this.THREE;
      this._time += dt;
  
      // ---- sway/bob target ----
      const moveLen = Math.max(0, Math.min(1, this._move.length()));
      const bob = Math.sin(this._time * this._bobFreq) * this._bobAmount * moveLen * (1.0 - this._ads*0.8) * (1.0 - this._sprint*0.6);
  
      const swayX = (-this._move.x * this._swayAmount) + (-this._look.x * this._lookSway);
      const swayY = ( this._move.y * this._swayAmount*0.7) + ( this._look.y * this._lookSway*0.8) + bob;
  
      // ADS offset 
      const adsOff = new THREE.Vector3().copy(this._hipOffset).lerp(new THREE.Vector3(0.02, -0.03, -0.02), this._ads);
      // Sprint offset 
      const sprOff = new THREE.Vector3().copy(adsOff).lerp(new THREE.Vector3(0.18, -0.16, 0.05), this._sprint);
  
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
      try {
        for (const m of this._current.meshes||[]) {
          if (m.parent) m.parent.remove(m);
          if (m.geometry) m.geometry.dispose();
          if (m.material && m.material.isMaterial) m.material.dispose();
        }
      } catch(_){ }
      this._current = null;
    }
  
    setWeapon(name){
      this.clear();
      this.endCharge();
      const THREE = this.THREE;
      const meshes = [];
      const body = this._matBody, metal = this._matMetal;

      // adjust muzzle based on weapon type
      if ((name||'').toLowerCase() === 'beamsaber') {
        this._muzzleLocal.set(0, -0.02, -0.75);
      } else {
        this._muzzleLocal.set(0, -0.005, -0.25);
      }
      this.sockets.muzzle.position.copy(this._muzzleLocal);

      const addBox = (sx, sy, sz, px, py, pz, mat) => {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        const m = new THREE.Mesh(g, mat || body);
        m.position.set(px, py, pz);
        this._model.add(m); meshes.push(m);
        return m;
      };
      // stylized sights
      const addSight = (z, w=0.01, h=0.02) => {
        addBox(w, h, 0.01, 0, 0.0, z, metal);
      };
      // handguard detail lines
      const addRail = (z0, z1, step, y=-0.005) => {
        for (let z=z0; z<=z1; z+=step) addBox(0.002, 0.004, 0.008, 0, y+0.02, z, metal);
      };
      const addCyl = (r, l, px, py, pz, mat) => {
        const g = new THREE.CylinderGeometry(r, r, l, 8);
        const m = new THREE.Mesh(g, mat || body);
        m.position.set(px, py, pz);
        m.rotation.x = Math.PI / 2;
        this._model.add(m); meshes.push(m);
        return m;
      };

      const muzzleZ = this._muzzleLocal.z;
  
      const makePistol = ()=>{
        const L = 0.16, W = 0.045, H = 0.045;
        addBox(W, H, L, 0, -0.005, muzzleZ + L*0.5, metal);               // barrel
        addBox(W*1.8, H*1.2, 0.14, -0.02, -0.01, muzzleZ + L + 0.07, body); // slide
        addSight(muzzleZ + L*0.6, 0.008, 0.016);
        addSight(muzzleZ + L + 0.10, 0.008, 0.018);
      };
  
      const makeRifle = ()=>{
        const L = 0.32, D = 0.035;
        addBox(D, D, L, 0.0, -0.005, muzzleZ + L*0.5, metal);                 // barrel
        addBox(D*2.3, D*1.6, 0.22, -0.035, -0.01, muzzleZ + L + 0.11, body);  // body
        addRail(muzzleZ + 0.06, muzzleZ + L, 0.03);
        addSight(muzzleZ + L*0.65);
        addSight(muzzleZ + L + 0.11);
        // magazine stub
        addBox(D*0.7, D*1.0, 0.10, -0.045, -0.07, muzzleZ + L + 0.03, body);
      };
  
      const makeSMG = ()=>{
        const L = 0.20, D = 0.04;
        addBox(D, D, L, 0.0, -0.005, muzzleZ + L*0.5, metal);
        addBox(D*1.8, D*1.4, 0.16, -0.03, -0.01, muzzleZ + L + 0.08, body);
        addRail(muzzleZ + 0.04, muzzleZ + L, 0.025);
        addSight(muzzleZ + L*0.6);
        addBox(D*0.65, D*0.9, 0.09, -0.04, -0.07, muzzleZ + L*0.9, body); // mag
      };
  
      const makeShotgun = ()=>{
        const L = 0.24, D = 0.06;
        addBox(D, D, L, 0.0, -0.01, muzzleZ + L*0.5, metal);                 // barrel
        addBox(D*2.4, D*1.4, 0.20, -0.04, -0.015, muzzleZ + L + 0.10, body); // body
        addSight(muzzleZ + L + 0.09, 0.012, 0.02);
      };
  
      const makeDMR = ()=>{
        const L = 0.34, D = 0.03;
        addBox(D, D, L, 0.0, -0.005, muzzleZ + L*0.5, metal);
        addBox(D*2.0, D*1.6, 0.22, -0.03, -0.01, muzzleZ + L + 0.11, body);
        addSight(muzzleZ + L*0.7);
        addSight(muzzleZ + L + 0.12);
      };

      const makeGrenade = ()=>{
        const L = 0.20, D = 0.09;
        addBox(D, D, L, 0.0, -0.01, muzzleZ + L*0.5, metal);
        addBox(D*2.6, D*1.6, 0.16, -0.05, -0.015, muzzleZ + L + 0.08, body);
        addSight(muzzleZ + L + 0.06, 0.014, 0.02);
      };

      const makeBeamSaber = ()=>{
        const bladeL = 0.5, bladeR = 0.006;
        const hiltL  = 0.14, hiltR = 0.02;
        const baseZ = muzzleZ + bladeL;

        addCyl(bladeR, bladeL, 0, -0.02, muzzleZ + bladeL*0.5, this._matBlade); // glowing blade
        addCyl(hiltR,  hiltL,  0, -0.02, baseZ + hiltL*0.5, body);               // main grip
        addBox(hiltR*4, hiltR*0.6, 0.02, 0, -0.02, baseZ, metal);                // emitter guard
        addCyl(hiltR*1.1, 0.03, 0, -0.02, baseZ + hiltL + 0.015, metal);         // pommel
      };

      switch ((name||'').toLowerCase()){
        case 'pistol': makePistol(); break;
        case 'smg': makeSMG(); break;
        case 'shotgun': makeShotgun(); break;
        case 'dmr': makeDMR(); break;
        case 'grenade': makeGrenade(); break;
        case 'beamsaber': makeBeamSaber(); break;
        case 'rifle': default: makeRifle(); break;
      }
  
      this._current = { meshes };
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
  