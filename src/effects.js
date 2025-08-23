// Ensure global effects namespace with safe no-op fallbacks
window._EFFECTS = window._EFFECTS || {};
window._EFFECTS.spawnBulletTracer = window._EFFECTS.spawnBulletTracer || (()=>{});
window._EFFECTS.spawnBulletImpact = window._EFFECTS.spawnBulletImpact || (()=>{});

export class Effects {
  constructor(THREE, scene, camera){
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this._alive = [];
    // Persistent decals (bullet holes)
    this._decals = [];
    this._decalMax = 64;

    // Screen overlay for player hits
    this.overlay = this._createHitOverlay();
    this.camera.add(this.overlay);
    this.overlay.renderOrder = 9999;
    this.hitStrength = 0; // 0..1

    // Low-stamina fatigue overlay
    this.fatigueOverlay = this._createFatigueOverlay();
    this.camera.add(this.fatigueOverlay);
    this.fatigueOverlay.renderOrder = 9998;
    this.fatigueLevel = 0; // 0..1

    // Ensure overlays are not culled (screen-space quads)
    try { if (this.overlay) this.overlay.frustumCulled = false; } catch(_) {}
    try { if (this.fatigueOverlay) this.fatigueOverlay.frustumCulled = false; } catch(_) {}

    // Promotion pulse element (simple DOM overlay to avoid heavy post)
    this._promoEl = document.getElementById('promoPulse');

    // Muzzle flash quad (reused)
    this._muzzle = null;
    this._muzzleTTL = 0;
    this._muzzleMax = 0.06;
    // Muzzle flash (group of 2 quads + light)
    this._muzzleGroup = null;
    this._muzzleLight = null;
    this._muzzleFlashA = null;
    this._muzzleFlashB = null;
    this._muzzleTTL = 0;
    this._muzzleMax = 0.06;

    this.muzzleEnabled = true; // hide muzzle flash for now

    // Tracer tint control for bullet tracers
    this._tracerTintMix = 0; // 0..1 mix factor
    this._tracerTintColor = new THREE.Color(0x16a34a);

    // --- Init pooled resources for tracers, flashes, and decals ---
    // Tracer (beam) shared geo + material prototype and pools
    this._beamGeo = new THREE.PlaneGeometry(1, 1);
    this._beamMatProto = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAlpha: { value: 1.0 },
        uTint:  { value: new THREE.Color(0xfff4c0) },
        uNoise: { value: 0.0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uAlpha; uniform vec3 uTint; uniform float uNoise; void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = smoothstep(1.0, 0.0, d); float sparkle = 0.85 + 0.15 * sin((vUv.x + uNoise)*20.0); float a = uAlpha * core * sparkle; if(a < 0.02) discard; gl_FragColor = vec4(uTint, a); }`
    });
    this._beamMatPool = [];
    this._allTracerMats = new Set();

    // Impact flash (at hit point) geo + material prototype and pool
    this._flashGeo = new THREE.PlaneGeometry(1, 1);
    this._flashMatProto = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uAlpha: { value: 1.0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uAlpha; void main(){ vec2 p=vUv-0.5; float r=length(p)*2.0; float a = smoothstep(1.0, 0.0, r) * uAlpha; if(a<0.02) discard; gl_FragColor = vec4(1.0,0.85,0.45,a); }`
    });
    this._flashMatPool = [];

    // Bullet decal (bullet hole) geo + material prototype and pool
    this._decalGeo = new THREE.PlaneGeometry(1, 1);
    this._decalMatProto = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uAlpha: { value: 0.95 },
        uColor: { value: new THREE.Color(0x151515) },
        uSoft:  { value: 0.5 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uAlpha; uniform vec3 uColor; uniform float uSoft; void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float edge = smoothstep(uSoft, 1.0, r); float a = (1.0 - edge) * uAlpha; if (a < 0.02) discard; gl_FragColor = vec4(uColor, a); }`
    });
    this._decalMatPool = [];

    // Pools
    this._tracerPool = { free: [], active: [], cap: 256 };
    this._flashPool = { free: [], active: [], cap: 128 };
    this._ringPool = { free: [], active: [], cap: 24 };
    this._impactPool = { free: [], cap: 16 };
    this._deathPool = { free: [], cap: 6 };

    // Shared geometries for pools
    this._geoPlane1x1 = new THREE.PlaneGeometry(1,1);

    // Explosion shared resources
    this._ringSharedGeo = new THREE.RingGeometry(1, 1.2, 80, 1);
    this._ringSharedMatProto = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uElapsed: { value: 0 },
        uLife: { value: 0.5 },
        uStart: { value: 1.0 },
        uEnd: { value: 1.4 },
        uColor: { value: new THREE.Color(0xfff1a1) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uElapsed; uniform float uLife; uniform float uStart; uniform float uEnd; uniform vec3 uColor; void main(){ float t=clamp(uElapsed/uLife,0.0,1.0); float r=mix(uStart,uEnd,t); float d=abs(length(vUv-0.5)*2.0 - r); float a=smoothstep(0.08,0.0,d)*(1.0-t); if(a<0.01) discard; gl_FragColor=vec4(uColor, a); }`
    });

    this._explCoreGeo = new THREE.PlaneGeometry(1, 1);
    this._explCoreMatProto = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAlpha: { value: 0.95 },
        uTint: { value: new THREE.Color(0xffb347) },
        uTime: { value: 0 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uAlpha; uniform vec3 uTint; uniform float uTime; void main(){ vec2 p=vUv-0.5; float r=length(p)*2.0; float core=smoothstep(1.0,0.0,r); float flicker=0.9+0.1*sin(uTime*30.0); float a=uAlpha*core*flicker; if(a<0.02) discard; gl_FragColor=vec4(uTint,a); }`
    });

    // convenience hook for enemy VFX
    window._EFFECTS = window._EFFECTS || {};
    window._EFFECTS.ring = (center, radius=5, color=0x9bd1ff)=>{
      this.spawnGroundRing(center, radius, color);
    };
    window._EFFECTS.groundSlam = (center, radius=5)=>{
      this.spawnGroundSlam(center, radius);
    };
    // alt alias
    window._EFFECTS.spawnGroundSlam = (center, radius=5)=>{
      this.spawnGroundSlam(center, radius);
    };
    window._EFFECTS.spawnShockwaveArc = (center, dir, angle, radius, color)=>{
      this.spawnShockwaveArc(center, dir, angle, radius, color);
    };
    window._EFFECTS.spawnBulletTracer = (start, end, options={})=>{
      this.spawnBulletTracer(start, end, options);
    };
    window._EFFECTS.spawnBulletImpact = (position, normal)=>{
      this.spawnBulletImpact(position, normal);
    };
    window._EFFECTS.spawnSaberSlash = (start, end, options={})=>{
      this.spawnSaberSlash(start, end, options);
    };
  }

  // --- Tracer pool internals ---
  _allocTracer(){
    let m = this._tracerPool.free.pop();
    if (!m && (this._tracerPool.active.length < this._tracerPool.cap)) {
      const mat = this._beamMatPool.pop() || this._beamMatProto.clone();
      m = new this.THREE.Mesh(this._beamGeo, mat);
      this.scene.add(m);
    }
    if (!m) return null;
    m.userData.poolIndex = this._tracerPool.active.length;
    this._tracerPool.active.push(m);
    // Ensure material is tracked for tinting
    if (m.material) this._allTracerMats.add(m.material);
    return m;
  }
  _freeTracer(m){
    if (!m) return;
    m.visible = false;
    // swap-pop optimization
    const a = this._tracerPool.active;
    const idx = m.userData.poolIndex;
    if (idx !== undefined && idx < a.length) {
      const last = a[a.length - 1];
      a[idx] = last; 
      if (last) last.userData.poolIndex = idx; 
      a.pop();
    }
    // return its material to pool (do NOT dispose)
    if (m.material) {
      this._beamMatPool.push(m.material);
      this._allTracerMats.add(m.material);
    }
    m.material = null; // keep geo reference; it's shared
    this._tracerPool.free.push(m);
  }
  _updateTracerPool(_dt){ /* visuals updated by entry tick; nothing global needed */ }

  // --- Flash pool internals ---
  _allocFlash(){
    let m = this._flashPool.free.pop();
    if (!m && (this._flashPool.active.length < this._flashPool.cap)) {
      const mat = this._flashMatPool.pop() || this._flashMatProto.clone();
      m = new this.THREE.Mesh(this._flashGeo, mat);
      this.scene.add(m);
    }
    if (!m) return null;
    m.userData.poolIndex = this._flashPool.active.length;
    this._flashPool.active.push(m);
    return m;
  }
  _freeFlash(m){ 
    if (!m) return; 
    m.visible = false; 
    // swap-pop optimization
    const a = this._flashPool.active;
    const idx = m.userData.poolIndex;
    if (idx !== undefined && idx < a.length) {
      const last = a[a.length - 1];
      a[idx] = last; 
      if (last) last.userData.poolIndex = idx; 
      a.pop();
    }
    // return material to pool (do NOT dispose)
    if (m.material) this._flashMatPool.push(m.material);
    m.material = null; // keep geo reference; it's shared
    this._flashPool.free.push(m); 
  }
  _updateFlashPool(_dt){ /* fade handled per entry; no-op */ }

  // --- Ring pool internals ---
  _allocRing(){
    const THREE = this.THREE;
    let m = this._ringPool.free.pop();
    if (!m && (this._ringPool.active.length + this._ringPool.free.length) < this._ringPool.cap) {
      m = new THREE.Mesh(); this.scene.add(m);
    }
    return m || null;
  }
  _freeRing(m){ if (!m) return; m.visible = false; this._ringPool.free.push(m); }
  _updateRingPool(dt){
    const list = this._ringPool.active;
    for (let i=list.length-1;i>=0;i--){
      const it = list[i]; it.life += dt;
      if (it.mesh?.material?.uniforms?.uElapsed) it.mesh.material.uniforms.uElapsed.value = it.life;
      if (it.life >= it.ttl) { this._freeRing(it.mesh); list.splice(i,1); }
    }
  }

  update(dt){
    // Update transient particle and mesh effects
    for(let i=this._alive.length-1;i>=0;i--){
      const fx = this._alive[i];
      // Custom tick handler (preferred)
      if (typeof fx.tick === 'function') fx.tick(dt);
      // Uniform-based lifetime
      if (fx.uniforms && fx.uniforms.uElapsed) fx.uniforms.uElapsed.value += dt;
      // Scalar lifetime
      if (fx.life != null) fx.life += dt;
      const elapsed = fx.uniforms && fx.uniforms.uElapsed ? fx.uniforms.uElapsed.value : (fx.life || 0);
      if (elapsed > fx.maxLife){
        // Cleanup
        if (typeof fx.cleanup === 'function') fx.cleanup();
        if (fx.points && this.scene) this.scene.remove(fx.points);
        if (fx.points && fx.points.geometry) fx.points.geometry.dispose();
        if (fx.points && fx.points.material) fx.points.material.dispose();
        if (fx.mesh && this.scene) this.scene.remove(fx.mesh);
        if (fx.light && this.scene) this.scene.remove(fx.light);
        this._alive.splice(i,1);
      }
    }
    // Tracer/flash pools update
    this._updateTracerPool(dt);
    this._updateFlashPool(dt);
    this._updateRingPool(dt);
    // Update decals (fade and cleanup)
    for (let i=this._decals.length-1; i>=0; i--) {
      const d = this._decals[i];
      // If bound to an owner that has been removed from scene, drop immediately
      if (d.owner && !d.owner.parent) {
        this.scene.remove(d.mesh);
        if (d.cleanup) d.cleanup(); // return material to pool, don't dispose
        this._decals.splice(i,1);
        continue;
      }
      d.age += dt;
      const k = Math.max(0, 1 - (d.age / d.ttl));
      if (d.material && d.material.uniforms && d.material.uniforms.uAlpha) {
        d.material.uniforms.uAlpha.value = d.baseAlpha * k;
      } else if (d.material && typeof d.material.opacity === 'number') {
        d.material.opacity = d.baseAlpha * k;
      }
      if (d.age >= d.ttl) {
        this.scene.remove(d.mesh);
        if (d.cleanup) d.cleanup(); // return material to pool, don't dispose
        this._decals.splice(i,1);
      }
    }
    // MUZZLE UPDATE
    if (this._muzzleGroup){
      if (this._muzzleTTL > 0){
        this._muzzleTTL -= dt;
        const k = Math.max(0, this._muzzleTTL / this._muzzleMax);
        const v = Math.pow(k, 1.5); // quick fade

        this._muzzleFlashA.material.uniforms.uAlpha.value = v;
        this._muzzleFlashB.material.uniforms.uAlpha.value = v*0.95;
        if (this._muzzleLight) this._muzzleLight.intensity = 2.8 * v;
      } else {
        this._muzzleFlashA.material.uniforms.uAlpha.value = 0;
        this._muzzleFlashB.material.uniforms.uAlpha.value = 0;
        if (this._muzzleLight) this._muzzleLight.intensity = 0;
      }
    }

    // Overlay decay
    if(this.hitStrength > 0){
      this.hitStrength = Math.max(0, this.hitStrength - dt*1.8);
      this.overlay.material.uniforms.uStrength.value = this.hitStrength;
    }

    // Fatigue overlay time + intensity update
    if (this.fatigueOverlay && this.fatigueOverlay.material && this.fatigueOverlay.material.uniforms) {
      const u = this.fatigueOverlay.material.uniforms;
      u.uTime.value += dt;
      // ease for smoother visual
      const k = Math.max(0, Math.min(1, this.fatigueLevel));
      // slight smoothing toward target to avoid popping
      u.uLevel.value += (k - u.uLevel.value) * Math.min(1, dt * 8);
    }
  }

  // Remove all transient visuals and decals immediately (used by test harness)
  clearAll(){
    // transient entries
    for (let i=this._alive.length-1;i>=0;i--){
      const fx = this._alive[i];
      try { if (fx.cleanup) fx.cleanup(); } catch(_) {}
      try {
        if (fx.points && this.scene) this.scene.remove(fx.points);
        if (fx.mesh && this.scene) this.scene.remove(fx.mesh);
        if (fx.light && this.scene) this.scene.remove(fx.light);
      } catch(_) {}
    }
    this._alive.length = 0;
    // pooled actives
    try { for (const m of this._tracerPool?.active||[]) this._freeTracer(m); this._tracerPool.active.length = 0; } catch(_) {}
    try { for (const m of this._flashPool?.active||[]) this._freeFlash(m); this._flashPool.active.length = 0; } catch(_) {}
    try { for (const it of this._ringPool?.active||[]) this._freeRing(it.mesh); this._ringPool.active.length = 0; } catch(_) {}
    // decals
    for (let i=this._decals.length-1;i>=0;i--){
      const d = this._decals[i];
      try { if (this.scene) this.scene.remove(d.mesh); } catch(_) {}
      try { if (d.cleanup) d.cleanup(); } catch(_) {}
    }
    this._decals.length = 0;
    // overlays + muzzle get reset implicitly next frame
  }

  prewarm(counts = {}){
    const t = Math.max(0, counts.tracers || 64);
    const f = Math.max(0, counts.flashes || 32);
    const r = Math.max(0, counts.rings || 8);
    for (let i=0;i<t;i++){
      const m = this._allocTracer();
      if (m) this._freeTracer(m);
    }
    for (let i=0;i<f;i++){
      const m = this._allocFlash();
      if (m) this._freeFlash(m);
    }
    for (let i=0;i<r;i++){
      const ring = this._allocRing();
      if (ring) this._freeRing(ring);
    }
  }

  // Persistent bullet hole decal on surfaces. Accepts optional options:
  // { size, ttl, color (THREE.Color|hex), softness (0..1), object (for transforming local normals), owner (root that owns decal for cleanup), attachTo (Object3D to parent under, preserving world transform) }
  spawnBulletDecal(position, normal, options = {}){
    if (!position) return;
    const THREE = this.THREE;

    // Pool cap: remove oldest if full
    if (this._decals.length >= (this._decalMax|0 || 64)) {
      const old = this._decals.shift();
      if (old) {
        this.scene.remove(old.mesh);
        if (old.cleanup) old.cleanup(); // return material to pool, don't dispose
      }
    }

    // Defaults
    const ttl = Math.max(1, options.ttl != null ? options.ttl : 14.0);
    const size = Math.max(0.02, options.size != null ? options.size : (0.10 + Math.random()*0.06));
    const softness = Math.max(0.0, Math.min(1.0, options.softness != null ? options.softness : 0.3));
    const color = (options.color instanceof THREE.Color) ? options.color.clone() : new THREE.Color(options.color != null ? options.color : 0x151515);

    // Prepare orientation from normal (prefer world-space). If provided normal is local, allow options.object to convert to world
    let n = (normal && typeof normal.x === 'number') ? normal.clone() : new THREE.Vector3(0,1,0);
    if (options.object && options.object.matrixWorld && normal) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(options.object.matrixWorld);
      n = normal.clone().applyMatrix3(normalMatrix).normalize();
    }
    if (n.lengthSq() === 0) n.set(0,1,0);

    // Use shared geometry and pooled material (no per-decal allocation)
    const mesh = new THREE.Mesh(this._decalGeo, this._decalMatPool.pop() || this._decalMatProto.clone());
    mesh.material.uniforms.uAlpha.value = 0.95;
    mesh.material.uniforms.uColor.value.copy(color);
    mesh.material.uniforms.uSoft.value = 0.35 + 0.5 * softness;

    // Random slight non-square scale and roll
    const sx = size * (0.9 + Math.random()*0.3);
    const sy = size * (0.9 + Math.random()*0.3);
    mesh.scale.set(sx, sy, 1);

    // Orient plane's +Z (plane normal) to align with the surface normal so the decal faces outward
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), n.clone().normalize());
    mesh.quaternion.copy(q);

    // Keep canonical orientation (no roll); bullet holes should look circular

    // Place slightly off surface to avoid z-fighting
    const epsilon = 0.0015;
    const pos = position.clone().add(n.clone().multiplyScalar(epsilon));
    mesh.position.copy(pos);

    // Render order just above default geometry but below HUD overlays
    mesh.renderOrder = 1;

    this.scene.add(mesh);
    // If attaching to a moving object (e.g., enemy), reparent while preserving world transform
    if (options.attachTo && typeof options.attachTo.attach === 'function') {
      options.attachTo.attach(mesh);
    }

    const entry = { mesh, material: mesh.material, ttl, age: 0, baseAlpha: mesh.material.uniforms.uAlpha.value, owner: options.owner || null };
    // Add cleanup callback to return material to pool
    entry.cleanup = () => { this._decalMatPool.push(mesh.material); };
    this._decals.push(entry);
  }

  // Remove all decals associated with a specific owner (e.g., enemy root). If owner is null, no-op
  clearDecalsFor(owner){
    if (!owner) return;
    for (let i=this._decals.length-1; i>=0; i--) {
      const d = this._decals[i];
      if (d.owner === owner) {
        this.scene.remove(d.mesh);
        if (d.cleanup) d.cleanup(); // return material to pool, don't dispose
        this._decals.splice(i,1);
      }
    }
  }

  _ensureMuzzle(){
    if (this._muzzleGroup) return;
  
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.renderOrder = 9999;
  
    // offset from camera center (feeling that the barrel is right and slightly lower)
    group.position.set(0.12, -0.07, -0.25);
    this.camera.add(group);
  
    const makeQuad = () => {
      const g = new THREE.PlaneGeometry(1,1);
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uAlpha:   { value: 0.0 },
          uTime:    { value: 0.0 },
          uSeed:    { value: Math.random()*1000.0 },
          uTint:    { value: new THREE.Color(0xfff1b3) },
          uStretch: { value: 1.8 } // anisotropy (along the barrel)
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: `
          precision mediump float;
          varying vec2 vUv;
          uniform float uAlpha, uTime, uSeed, uStretch;
          uniform vec3  uTint;
  
          // простий грідік-noise
          float hash(float n){ return fract(sin(n)*43758.5453); }
          float noise(vec2 p){
            vec2 i=floor(p), f=fract(p);
            float a=hash(dot(i,vec2(1.0,57.0)));
            float b=hash(dot(i+vec2(1.0,0.0),vec2(1.0,57.0)));
            float c=hash(dot(i+vec2(0.0,1.0),vec2(1.0,57.0)));
            float d=hash(dot(i+vec2(1.0,1.0),vec2(1.0,57.0)));
            vec2 u=f*f*(3.0-2.0*f);
            return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
          }
  
          void main(){
            vec2 p = (vUv - 0.5);
            p.x *= uStretch;                 // stretch into an ellipse (along the barrel)
            float r   = length(p) * 2.0;
            float ang = atan(p.y, p.x);
  
            // central flash + rays
            float core = smoothstep(1.0, 0.0, r);
            float rays = smoothstep(0.9, 0.0, r) * (0.55 + 0.45*cos(ang*8.0 + uSeed));
            float breakup = 0.75 + 0.25*noise(p*14.0 + uSeed);
  
            float a = (core*1.2 + rays) * breakup * uAlpha;
            if (a < 0.01) discard;
  
            vec3 col = mix(vec3(1.0,0.82,0.45), vec3(1.0,0.96,0.75), 0.35);
            gl_FragColor = vec4(col, a);
          }`
      });
      const q = new THREE.Mesh(g, m);
      q.scale.set(0.14, 0.10, 1); // small quad
      q.renderOrder = 9999; // draw just under weapon view (which is >= 10000)
      return q;
    };
  
    this._muzzleFlashA = makeQuad();
    this._muzzleFlashB = makeQuad();
    this._muzzleFlashB.rotation.z = Math.PI * 0.5; // cross "leaves"
  
    group.add(this._muzzleFlashA, this._muzzleFlashB);
  
    // short flash of light in the barrel
    this._muzzleLight = new THREE.PointLight(0xffd28a, 0, 1.6, 2.0);
    group.add(this._muzzleLight);
  
    this._muzzleGroup = group;
  }
  
  getMuzzleWorldPos(out){
    const THREE = this.THREE;
    const v = out || new THREE.Vector3();
    if (this._muzzleGroup && this._muzzleGroup.parent) {
      return this._muzzleGroup.getWorldPosition(v);
    }
    // fallback: slightly in front of the camera
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    this.camera.getWorldPosition(v).add(f.multiplyScalar(0.1));
    return v;
  }
  

  spawnMuzzleFlash(strength = 1){
    if (!this.muzzleEnabled) return;
    this._ensureMuzzle();
  
    // random shape for each shot
    this._muzzleFlashA.material.uniforms.uSeed.value = Math.random()*1000.0;
    this._muzzleFlashB.material.uniforms.uSeed.value = Math.random()*1000.0;
  
    const a = Math.min(1.0, 0.65*strength + 0.25);
    this._muzzleFlashA.material.uniforms.uAlpha.value = a;
    this._muzzleFlashB.material.uniforms.uAlpha.value = a*0.9;
  
    // small "pop" scale
    const s = 1.0 + Math.random()*0.25;
    this._muzzleGroup.scale.setScalar(s);
  
    // light – very short and bright
    this._muzzleLight.intensity = 2.8 * strength;
    this._muzzleLight.distance  = 1.8;
  
    this._muzzleTTL = this._muzzleMax = 0.05 + Math.random()*0.02; // 50–70ms
  }  

  // World position of the muzzle tip (used for tracer start)
  getMuzzleWorldPos(out){
    const THREE = this.THREE;
    const v = out || new THREE.Vector3();
    if (!this._muzzleGroup){
      // approximate relative to camera if muzzle not created yet
      return v.copy(new THREE.Vector3(0.12, -0.07, -0.25)).applyMatrix4(this.camera.matrixWorld);
    }
    return v.copy(this._muzzleGroup.getWorldPosition(new THREE.Vector3()));
  }

  // Subtle screen-edge chroma pulse when combo tier increases
  promotionPulse(){
    if(!this._promoEl){ return; }
    this._promoEl.classList.remove('pulseActive');
    // force reflow to restart animation
    // eslint-disable-next-line no-unused-expressions
    this._promoEl.offsetHeight;
    this._promoEl.classList.add('pulseActive');
  }

  // Optional tracer tinting; caller passes intensity 0..1 based on tier
  setTracerTint(intensity){
    // Store for new tracers and tint any legacy Line tracers
    this._tracerTintMix = Math.max(0, Math.min(1, intensity)) * 0.6;
    const base = new this.THREE.Color(0x111111);
    const mixed = base.clone().lerp(this._tracerTintColor, this._tracerTintMix);
    try {
      if(this.scene && this.scene.traverse){
        this.scene.traverse(obj=>{
          if(obj.isLine && obj.material && obj.material.color && obj.material.name!=="_staticTracer"){
            obj.material.color.copy(mixed);
          }
        });
      }
    } catch(_) {}
  }

  onPlayerHit(damage){
    // scale to a reasonable punch
    this.hitStrength = Math.min(1, this.hitStrength + damage * 0.05);
  }

  // External control from game: set fatigue level 0..1 (mapped from low stamina)
  setFatigue(level){
    this.fatigueLevel = Math.max(0, Math.min(1, level||0));
  }

  spawnSaberSlash(start, end, options = {}) {
    if (!start || !end) return;
    const opts = {
      width: options.width ?? 0.1,
      ttl: options.ttl ?? 0.08,
      color: options.color ?? 0x88ccff,
      cross: options.cross ?? true
    };
    this.spawnBulletTracer(start, end, opts);
  }

  // Fast-moving additive sprite from start->end with brief fadeout
// Arcade beam tracer (cross quads), start = start (better getMuzzleWorldPos)
// Arcade beam tracer: 1 quad by default (no cross).
// Call: effects.spawnBulletTracer(effects.getMuzzleWorldPos(), hitPoint, { width: 0.035 });
spawnBulletTracer(start, end, options = {}) {
  if (!start || !end) return;
  const THREE = this.THREE;

  const from = start.clone();
  const to   = end.clone();
  const v    = to.clone().sub(from);
  const len  = Math.max(1e-4, v.length());
  const dir  = v.clone().normalize();

  // move slightly away from the barrel to avoid near-plane clipping
  from.add(dir.clone().multiplyScalar(0.02));

  // --- SETTINGS ---
  const width = Math.max(0.015, options.width || 0.04);       // thicker by default
  const ttl   = Math.max(0.03,  options.ttl   || 0.08);
  const cross = options.cross ?? false;                        // <— disabled by default
  const baseColor = new THREE.Color(options.color ?? 0xfff4c0);
  const color = baseColor.lerp(this._tracerTintColor, this._tracerTintMix || 0);

  // --- BASE QUAD (XY-plane, normal +Z looks at camera) ---
  const mid   = from.clone().add(to).multiplyScalar(0.5);
  const x     = dir.clone();                                       // along the barrel
  const toCam = this.camera.position.clone().sub(mid).normalize(); // to camera
  const zProj = toCam.sub(x.clone().multiplyScalar(toCam.dot(x))).normalize();
  const z     = (zProj.lengthSq() < 1e-6)
    ? new THREE.Vector3(0,1,0).sub(x.clone().multiplyScalar(x.y)).normalize()
    : zProj;
  const y     = new THREE.Vector3().crossVectors(z, x).normalize();
  const rot   = new THREE.Matrix4().makeBasis(x, y, z);

  const beamA = this._allocTracer();
  if (!beamA) return;
  
  // Ensure geometry and material are properly assigned
  beamA.geometry = this._beamGeo;
  if (!beamA.material) {
    beamA.material = this._beamMatPool.pop() || this._beamMatProto.clone();
    this._allTracerMats.add(beamA.material);
  }
  
  // Reset material uniforms for reuse
  beamA.material.uniforms.uAlpha.value = 1.0;
  beamA.material.uniforms.uTint.value.copy(color);
  beamA.material.uniforms.uNoise.value = Math.random()*1000.0;
  
  // Set transform
  beamA.scale.set(len, width, 1);
  beamA.position.copy(mid);
  beamA.setRotationFromMatrix(rot);
  beamA.visible = true;

  // Cross quad — ONLY if explicitly enabled
  let beamB = null;
  if (cross) {
    beamB = this._allocTracer();
    if (beamB) {
      beamB.geometry = this._beamGeo;
      if (!beamB.material) {
        beamB.material = this._beamMatPool.pop() || this._beamMatProto.clone();
        this._allTracerMats.add(beamB.material);
      }
      beamB.material.uniforms.uAlpha.value = 1.0;
      beamB.material.uniforms.uTint.value.copy(beamA.material.uniforms.uTint.value);
      beamB.material.uniforms.uNoise.value = Math.random()*1000.0;
      beamB.scale.set(len, width, 1);
      beamB.position.copy(mid);
      beamB.setRotationFromMatrix(rot);
      beamB.rotateOnAxis(dir, Math.PI * 0.5);
      beamB.visible = true;
    }
  }

  // impact flash
  let flash = null;
  if (options.impact !== false) {
    flash = this._allocFlash();
    if (flash) {
      flash.geometry = this._flashGeo;
      if (!flash.material) {
        flash.material = this._flashMatPool.pop() || this._flashMatProto.clone();
      }
      flash.material.uniforms.uAlpha.value = 1.0;
      flash.position.copy(to);
      flash.scale.set(0.24, 0.24, 1);
      try { if (this.camera) flash.lookAt(this.camera.position); } catch(_) {}
      flash.visible = true;
    }
  }

  // life/fade
  let t = 0;
  const entry = {
    life: 0, maxLife: ttl,
    tick: (dt) => {
      t += dt;
      const k = Math.max(0, 1 - t/ttl);
      const kk = k*k;
      if (beamA?.material?.uniforms) beamA.material.uniforms.uAlpha.value = kk;
      beamA.scale.y = width * (1.0 + 0.6*(1-kk));
      if (beamB){
        if (beamB.material?.uniforms) beamB.material.uniforms.uAlpha.value = kk;
        beamB.scale.y = width * (1.0 + 0.6*(1-kk));
      }
      if (flash){
        if (flash.material?.uniforms?.uAlpha) flash.material.uniforms.uAlpha.value = kk;
        flash.scale.setScalar(0.24 + 0.4*(1-kk));
        try { if (this.camera) flash.lookAt(this.camera.position); } catch(_) {}
      }
    },
    cleanup: () => {
      this._freeTracer(beamA);
      if (beamB) this._freeTracer(beamB);
      if (flash) this._freeFlash(flash);
    }
  };
  this._alive.push(entry);
}

spawnBulletImpact(position, normal){
    const THREE = this.THREE;
    // Reuse a single small instanced points system per impact via pool
    let sys = this._impactPool.free.pop();
    if (!sys) {
      // Build a reusable points system with attributes sized for 80
      const count = 80;
      const positions = new Float32Array(count * 3);
      const dirs = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
      const lifes = new Float32Array(count);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions,3));
      g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3));
      g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1));
      g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
      const uniforms = { uElapsed:{value:0}, uOrigin:{value: new THREE.Vector3()}, uGravity:{value:new THREE.Vector3(0,-80,0)}, uSize:{value:0.5} };
      const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms,
        vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); vec3 pos = uOrigin + aDir * (aSpeed*t) + 0.5*uGravity*(t*t); vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist = -mv.z; gl_PointSize = uSize * clamp(180.0/dist, 1.0, 10.0); vAlpha = 1.0 - (t/aLife); }`,
        fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc = gl_PointCoord-0.5; float d=length(pc); float a = smoothstep(0.5,0.0,d) * vAlpha; if(a<0.02) discard; vec3 col = mix(vec3(1.0,0.85,0.4), vec3(1.0), 0.5); gl_FragColor = vec4(col, a); }`});
      sys = { points: new THREE.Points(g, mat), geom: g, uniforms, cap: 80 };
      this.scene.add(sys.points);
    }
    // Fill attributes quickly for a new burst
    const g = sys.geom; const pos = g.attributes.position.array; const dir = g.attributes.aDir.array; const spd = g.attributes.aSpeed.array; const life = g.attributes.aLife.array;
    const n = (normal && normal.lengthSq()>0) ? normal.clone().normalize() : new THREE.Vector3(0,1,0);
    const basis = new THREE.Matrix4();
    const up = new THREE.Vector3(0,1,0);
    const axis = new THREE.Vector3().crossVectors(up, n);
    const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(n))));
    basis.makeRotationAxis(axis.normalize(), angle || 0);
    for (let i=0;i<sys.cap;i++){
      const i3=i*3;
      pos[i3]=position.x; pos[i3+1]=position.y; pos[i3+2]=position.z;
      const u=Math.random(), v=Math.random(); const theta=2*Math.PI*u; const r=Math.sqrt(v);
      const local = new THREE.Vector3(r*Math.cos(theta), Math.sqrt(1-v), r*Math.sin(theta));
      local.applyMatrix4(basis);
      dir[i3]=local.x; dir[i3+1]=local.y; dir[i3+2]=local.z;
      spd[i] = 8 + Math.random()*16; life[i] = 0.35 + Math.random()*0.25;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aDir.needsUpdate = true;
    g.attributes.aSpeed.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    sys.uniforms.uOrigin.value.copy(position);
    sys.uniforms.uElapsed.value = 0;
    // Track lifetime on _alive to return to pool
    this._alive.push({ points: sys.points, uniforms: sys.uniforms, maxLife: 0.6, cleanup: ()=>{ this._impactPool.free.push(sys); } });
  }

  enemyDeath(center){
    const THREE = this.THREE;
    let sys = this._deathPool.free.pop();
    if (!sys) {
      const count = 140;
      const positions = new Float32Array(count * 3);
      const dirs = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
      const lifes = new Float32Array(count);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions,3));
      g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3));
      g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1));
      g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
      const uniforms = { uElapsed:{value:0}, uOrigin:{value:new THREE.Vector3()}, uGravity:{value:new THREE.Vector3(0,-16,0)}, uSize:{value:3.0} };
      const material = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms,
        vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); float k = smoothstep(0.0, 0.2, t); vec3 pos = uOrigin + aDir * (aSpeed*t*k) + 0.5*uGravity*(t*t); pos.x += sin(t*8.0 + aSpeed)*0.06; pos.z += cos(t*7.0 + aSpeed)*0.06; vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize = uSize * clamp(180.0/dist, 1.2, 9.0); vAlpha = 1.0 - (t/aLife); }`,
        fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a = smoothstep(0.45,0.0,d) * vAlpha; if(a<0.02) discard; vec3 col = mix(vec3(1.0,0.45,0.25), vec3(1.0,0.8,0.2), 0.15); gl_FragColor = vec4(col, a*0.85); }`});
      sys = { points: new THREE.Points(g, material), geom: g, uniforms, cap: 140 };
      this.scene.add(sys.points);
    }
    // Refill burst
    const g = sys.geom; const pos = g.attributes.position.array; const dir = g.attributes.aDir.array; const spd = g.attributes.aSpeed.array; const life = g.attributes.aLife.array;
    for (let i=0;i<sys.cap;i++){
      const i3=i*3; pos[i3]=center.x; pos[i3+1]=center.y+0.8; pos[i3+2]=center.z;
      const u=Math.random(), v=Math.random(); const theta=2*Math.PI*u; const phi=Math.acos(2*v-1);
      const d=new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.abs(Math.cos(phi)), Math.sin(phi)*Math.sin(theta));
      dir[i3]=d.x; dir[i3+1]=d.y; dir[i3+2]=d.z; spd[i]=3.0+Math.random()*6.0; life[i]=0.6+Math.random()*0.4;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aDir.needsUpdate = true;
    g.attributes.aSpeed.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    sys.uniforms.uOrigin.value.copy(center);
    sys.uniforms.uElapsed.value = 0;
    this._alive.push({ points: sys.points, uniforms: sys.uniforms, maxLife: 1.0, cleanup: ()=>{ this._deathPool.free.push(sys); } });
  }

  // Composite explosion: shockwave, fireball, sparks, smoke, light flash
  spawnExplosion(center, radius=3.0){
    const THREE = this.THREE;
    // 1) Shockwave ring on ground (reuse shared geometry and clone material)
    const ringMat = this._ringSharedMatProto.clone();
    ringMat.uniforms.uElapsed.value = 0;
    ringMat.uniforms.uLife.value = 0.5;
    ringMat.uniforms.uStart.value = radius*0.22;
    ringMat.uniforms.uEnd.value = radius*1.4;
    ringMat.uniforms.uColor.value.copy(new THREE.Color(0xfff1a1));
    const ring = new THREE.Mesh(this._ringSharedGeo, ringMat); 
    ring.position.copy(center.clone().setY(0.05)); 
    ring.rotation.x = -Math.PI/2; 
    this.scene.add(ring);
    this._alive.push({ points: ring, uniforms: ringMat.uniforms, maxLife: 0.5, cleanup: ()=>{ ringMat.dispose(); } });

    // 2) Fireball core (reuse shared geometry and clone material)
    const coreMat = this._explCoreMatProto.clone();
    coreMat.uniforms.uAlpha.value = 0.95;
    coreMat.uniforms.uTint.value.copy(new THREE.Color(0xffb347));
    coreMat.uniforms.uTime.value = 0;
    const core = new THREE.Mesh(this._explCoreGeo, coreMat); 
    core.position.copy(center.clone().setY(center.y + 0.6)); 
    core.scale.set(radius*0.3, radius*0.3, 1); 
    this.scene.add(core);
    this._alive.push({ mesh: core, life: 0, maxLife: 0.45, tick: dt=>{
      coreMat.uniforms.uAlpha.value = Math.max(0, coreMat.uniforms.uAlpha.value - dt*2.2);
      const s = core.scale.x + dt * radius * 1.8; core.scale.set(s, s, 1);
      // billboard toward camera
      if (this.camera && this.camera.position) core.lookAt(this.camera.position);
    }, cleanup: ()=>{ coreMat.dispose(); } });

    // 3) Sparks burst (short‑lived particles)
    const sparks = 120; const positions = new Float32Array(sparks*3); const dirs = new Float32Array(sparks*3); const speeds = new Float32Array(sparks); const lifes = new Float32Array(sparks);
    for (let i=0;i<sparks;i++){
      const i3=i*3; positions[i3]=center.x; positions[i3+1]=center.y+0.6; positions[i3+2]=center.z;
      // random sphere biased upward
      const u=Math.random(), v=Math.random(); const theta=2*Math.PI*u; const phi=Math.acos(2*v-1);
      const d=new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.abs(Math.cos(phi)), Math.sin(phi)*Math.sin(theta));
      dirs[i3]=d.x; dirs[i3+1]=d.y; dirs[i3+2]=d.z; speeds[i]=6+Math.random()*14; lifes[i]=0.35+Math.random()*0.25;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(positions,3)); g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3)); g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1)); g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
    const uniforms = { uElapsed:{value:0}, uOrigin:{value:center.clone()}, uGravity:{value:new THREE.Vector3(0,-50,0)}, uSize:{value:0.9} };
    const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms,
      vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); float k = smoothstep(0.0,0.15,t); vec3 pos = uOrigin + aDir*(aSpeed*t*k) + 0.5*uGravity*(t*t); vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize = uSize * clamp(200.0/dist, 1.0, 10.0); vAlpha = 1.0 - (t/aLife); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a=smoothstep(0.5,0.0,d)*vAlpha; if(a<0.02) discard; vec3 col=mix(vec3(1.0,0.65,0.2), vec3(1.0,0.9,0.4), 0.3); gl_FragColor=vec4(col, a); }`});
    const pts = new THREE.Points(g, mat); this.scene.add(pts); this._alive.push({ points: pts, uniforms, maxLife: 0.55 });

    // 4) Smoke puffs (few sprites rising and fading)
    const smokeCount = 6;
    for (let i=0;i<smokeCount;i++){
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x555555, opacity: 0.35, transparent:true, depthWrite:false }));
      sm.position.copy(center.clone()); sm.position.y += 0.4 + Math.random()*0.4; sm.position.x += (Math.random()*2-1)*0.4; sm.position.z += (Math.random()*2-1)*0.4; sm.scale.set(0.6,0.6,1);
      this.scene.add(sm);
      this._alive.push({ mesh: sm, life:0, maxLife: 1.2 + Math.random()*0.6, tick: dt=>{
        sm.material.opacity = Math.max(0, sm.material.opacity - dt*0.35);
        sm.position.y += dt * 0.8;
        const s = sm.scale.x + dt * 0.8; sm.scale.set(s,s,1);
        if (this.camera) sm.lookAt(this.camera.position);
      }, cleanup: ()=>{ sm.material.dispose(); } });
    }

    // 5) Brief point light flash
    const light = new THREE.PointLight(0xffaa66, 2.2, radius*6, 2.0); light.position.set(center.x, center.y+0.6, center.z); this.scene.add(light);
    this._alive.push({ light, life:0, maxLife:0.18, tick: dt=>{ light.intensity = Math.max(0, light.intensity - dt*10); } });

    return true;
  }

  // Wedge-shaped expanding ring useful for directional shockwaves
  spawnShockwaveArc(center, dir, angle=Math.PI/4, radius=6.0, color=0xffdd55){
    const THREE = this.THREE;
    const ring = this._allocRing();
    if (!ring) return null;
    const thetaLen = angle;
    const thetaStart = -thetaLen/2;
    const segs = 40;
    ring.geometry?.dispose?.();
    ring.geometry = new THREE.RingGeometry(1, 1.2, segs, 1, thetaStart, thetaLen);
    ring.material = ring.material || new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uElapsed:{value:0}, uLife:{value:0.6}, uStart:{value:radius*0.1}, uEnd:{value:radius}, uColor:{value:new THREE.Color(color)} },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uElapsed; uniform float uLife; uniform float uStart; uniform float uEnd; uniform vec3 uColor; void main(){ float t=clamp(uElapsed/uLife,0.0,1.0); float r=mix(uStart,uEnd,t); float d=abs(length(vUv-0.5)*2.0 - r); float a=smoothstep(0.08,0.0,d)*(1.0-t); if(a<0.01) discard; gl_FragColor=vec4(uColor,a); }`
    });
    ring.material.uniforms.uElapsed.value = 0;
    ring.material.uniforms.uLife.value = 0.6;
    ring.material.uniforms.uStart.value = radius*0.1;
    ring.material.uniforms.uEnd.value = radius;
    ring.material.uniforms.uColor.value = new THREE.Color(color);
    ring.position.copy(center.clone().setY(0.05));
    ring.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2, Math.atan2(dir.z, dir.x), 0, 'XYZ'));
    ring.visible = true;
    const ttl = ring.material.uniforms.uLife.value;
    this._ringPool.active.push({ mesh: ring, life: 0, ttl });
    return ring;
  }

  // Simple expanding ground ring useful for slams
  spawnGroundRing(center, radius=5.0, color=0x9bd1ff){
    const THREE = this.THREE;
    const ring = this._allocRing();
    if (!ring) return null;
    if (!ring.material || !ring.geometry) {
      const segs = 80;
      ring.geometry = new THREE.RingGeometry(1, 1.2, segs, 1);
      ring.material = new THREE.ShaderMaterial({
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
        uniforms:{ uElapsed:{value:0}, uLife:{value:0.6}, uStart:{value:radius*0.1}, uEnd:{value:radius}, uColor:{value:new THREE.Color(color)} },
        vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uElapsed; uniform float uLife; uniform float uStart; uniform float uEnd; uniform vec3 uColor; void main(){ float t=clamp(uElapsed/uLife,0.0,1.0); float r=mix(uStart,uEnd,t); float d=abs(length(vUv-0.5)*2.0 - r); float a=smoothstep(0.08,0.0,d)*(1.0-t); if(a<0.01) discard; gl_FragColor=vec4(uColor, a); }`
      });
    } else {
      ring.material.uniforms.uLife.value = 0.6;
      ring.material.uniforms.uStart.value = radius*0.1;
      ring.material.uniforms.uEnd.value = radius;
      ring.material.uniforms.uColor.value = new THREE.Color(color);
      ring.material.uniforms.uElapsed.value = 0;
    }
    ring.position.copy(center.clone().setY(0.05));
    ring.rotation.x = -Math.PI/2;
    ring.visible = true;
    const ttl = ring.material.uniforms.uLife.value;
    this._ringPool.active.push({ mesh: ring, life: 0, ttl });
    return ring;
  }

  // Composite ground slam: expanding ring + dirt burst + dust puffs
  spawnGroundSlam(center, radius=5.0){
    const THREE = this.THREE;
    const c = center.clone(); c.y = Math.max(0.02, c.y);
    // 1) Expanding ring
    this.spawnGroundRing(c, radius * 1.2, 0xdff3ff);
    // 2) Dirt burst (points)
    const count = 140;
    const positions = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const lifes = new Float32Array(count);
    for (let i=0;i<count;i++){
      const i3 = i*3;
      positions[i3]=c.x; positions[i3+1]=c.y+0.02; positions[i3+2]=c.z;
      const theta = Math.random()*Math.PI*2;
      const up = 0.25 + Math.random()*0.45; // slight upward
      const dir = new THREE.Vector3(Math.cos(theta), up, Math.sin(theta)).normalize();
      dirs[i3]=dir.x; dirs[i3+1]=dir.y; dirs[i3+2]=dir.z;
      speeds[i] = (radius*0.9) + Math.random()*(radius*1.4); // bigger throw
      lifes[i] = 0.7 + Math.random()*0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions,3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1));
    g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
    const uniforms = { uElapsed:{value:0}, uOrigin:{value:c.clone()}, uGravity:{value:new THREE.Vector3(0,-30,0)}, uSize:{value:1.1} };
    const mat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.NormalBlending, // dirt should occlude a bit
      uniforms,
      vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); vec3 pos = uOrigin + aDir*(aSpeed*t) + 0.5*uGravity*(t*t); vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize = uSize * clamp(160.0/dist, 1.0, 10.0); vAlpha = 1.0 - (t/aLife); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a = smoothstep(0.55,0.0,d) * vAlpha; if(a<0.02) discard; vec3 col = vec3(0.35,0.28,0.20); gl_FragColor = vec4(col, a); }`
    });
    const pts = new THREE.Points(g, mat);
    this.scene.add(pts);
    this._alive.push({ points: pts, uniforms, maxLife: 1.2 });
    
    // 3) Soft dust puffs
    const puffs = 6 + Math.floor(radius*0.9);
    for (let i=0;i<puffs;i++){
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6b7280, opacity: 0.25, transparent:true, depthWrite:false }));
      sm.position.copy(c); sm.position.x += (Math.random()*2-1)*radius*0.15; sm.position.z += (Math.random()*2-1)*radius*0.15; sm.position.y += 0.05;
      const base = 0.8 + Math.random()*0.8; sm.scale.set(base, base, 1);
      this.scene.add(sm);
      this._alive.push({ mesh: sm, life:0, maxLife: 0.8 + Math.random()*0.4, tick: dt=>{
        sm.material.opacity = Math.max(0, sm.material.opacity - dt*0.35);
        sm.position.y += dt * 0.4;
        const s = sm.scale.x + dt * (1.1 + Math.random()*0.3); sm.scale.set(s,s,1);
        if (this.camera) sm.lookAt(this.camera.position);
      }, cleanup: ()=>{ sm.material.dispose(); } });
    }
    return true;
  }

  _createHitOverlay(){
    const THREE = this.THREE;
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2,2),
      new THREE.ShaderMaterial({
        transparent:true, depthTest:false, depthWrite:false,
        uniforms:{ uStrength:{value:0} },
        vertexShader:`void main(){ gl_Position = vec4(position,1.0); }`,
        fragmentShader:`precision mediump float; uniform float uStrength; void main(){ vec2 uv = gl_FragCoord.xy / vec2(1.0); // ignored; use NDC coords
          // reconstruct NDC from gl_FragCoord is awkward; instead use plane in clip space vertex shader
        }`
      })
    );
    // Replace fragment with proper NDC-based shader using position from vertex
    quad.material.vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    quad.material.fragmentShader = `precision mediump float; varying vec2 vUv; uniform float uStrength; void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float vignette = smoothstep(1.2, 0.2, 1.0 - r); float ring = smoothstep(0.5, 0.2, r); float a = uStrength * (vignette * 0.6 + ring * 0.4); if(a<0.01) discard; vec3 col = mix(vec3(0.8,0.0,0.0), vec3(1.0,0.2,0.0), 0.3); gl_FragColor = vec4(col, a); }`;
    quad.material.needsUpdate = true;
    return quad;
  }

  _createFatigueOverlay(){
    const THREE = this.THREE;
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2,2),
      new THREE.ShaderMaterial({
        transparent:true, depthTest:false, depthWrite:false,
        uniforms:{ uLevel:{value:0}, uTime:{value:0} },
        vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uLevel; uniform float uTime; void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          // Edge emphasis
          float edge = smoothstep(0.35, 1.05, r);
          // Gentle pulse when exhausted
          float pulse = 0.5 + 0.5 * sin(uTime * 4.2);
          float ex = smoothstep(0.85, 1.0, uLevel); // near-exhausted factor
          float a = uLevel * (edge * (0.22 + 0.08 * pulse * ex));
          if (a < 0.01) discard;
          // Cool tint gradient center->edge
          vec3 c1 = vec3(0.55, 0.65, 0.95);
          vec3 c2 = vec3(0.65, 0.55, 0.95);
          vec3 col = mix(c1, c2, clamp((r-0.2)/0.8, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }`
      })
    );
    quad.renderOrder = 9998;
    return quad;
  }
}


