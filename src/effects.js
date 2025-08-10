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

    // Promotion pulse element (simple DOM overlay to avoid heavy post)
    this._promoEl = document.getElementById('promoPulse');

    // Muzzle flash quad (reused)
    this._muzzle = null;
    this._muzzleTTL = 0;
    this._muzzleMax = 0.06;
    this.muzzleEnabled = false; // hide muzzle flash for now

    // convenience hook for enemy landing rings
    window._EFFECTS = window._EFFECTS || {};
    window._EFFECTS.ring = (center, radius=5, color=0x9bd1ff)=>{
      this.spawnGroundRing(center, radius, color);
    };
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
    // Update decals (fade and cleanup)
    for (let i=this._decals.length-1; i>=0; i--) {
      const d = this._decals[i];
      // If bound to an owner that has been removed from scene, drop immediately
      if (d.owner && !d.owner.parent) {
        this.scene.remove(d.mesh);
        if (d.mesh.geometry) d.mesh.geometry.dispose();
        if (d.mesh.material) d.mesh.material.dispose();
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
        if (d.mesh.geometry) d.mesh.geometry.dispose();
        if (d.mesh.material) d.mesh.material.dispose();
        this._decals.splice(i,1);
      }
    }
    // Muzzle flash fade (attached to camera)
    if (this._muzzle) {
      if (this._muzzleTTL > 0) {
        this._muzzleTTL = Math.max(0, this._muzzleTTL - dt);
        const k = Math.max(0, Math.min(1, this._muzzleTTL / this._muzzleMax));
        if (this._muzzle.material.uniforms) this._muzzle.material.uniforms.uAlpha.value = 0.8 * k;
      } else if (this._muzzle.material.uniforms && this._muzzle.material.uniforms.uAlpha.value !== 0) {
        this._muzzle.material.uniforms.uAlpha.value = 0;
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
        if (old.mesh.geometry) old.mesh.geometry.dispose();
        if (old.mesh.material) old.mesh.material.dispose();
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

    // Build tiny quad with radial alpha mask using a simple shader (regular blending)
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uAlpha: { value: 0.95 },
        uColor: { value: color },
        uSoft: { value: 0.35 + 0.5 * softness }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uSoft; void main(){ vec2 p = vUv - 0.5; float d = length(p) * 2.0; // alpha highest in center, fade to edge
        float a = (1.0 - smoothstep(uSoft, 1.0, d)) * uAlpha; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`
    });
    const mesh = new THREE.Mesh(geom, mat);

    // Random slight non-square scale and roll
    const sx = size * (0.9 + Math.random()*0.3);
    const sy = size * (0.9 + Math.random()*0.3);
    mesh.scale.set(sx, sy, 1);

    // Orient plane's +Z (plane normal) to align with surface normal
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

    const entry = { mesh, material: mat, ttl, age: 0, baseAlpha: mat.uniforms.uAlpha.value, owner: options.owner || null };
    this._decals.push(entry);
  }

  // Remove all decals associated with a specific owner (e.g., enemy root). If owner is null, no-op
  clearDecalsFor(owner){
    if (!owner) return;
    for (let i=this._decals.length-1; i>=0; i--) {
      const d = this._decals[i];
      if (d.owner === owner) {
        this.scene.remove(d.mesh);
        if (d.mesh.geometry) d.mesh.geometry.dispose();
        if (d.mesh.material) d.mesh.material.dispose();
        this._decals.splice(i,1);
      }
    }
  }

  spawnMuzzleFlash(strength=1){
    if (!this.muzzleEnabled) return; // disabled
    const THREE = this.THREE;
    if (!this._muzzle){
      const g = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.ShaderMaterial({
        transparent:true,
        depthTest:false,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide,
        uniforms:{ uAlpha:{value:0.0}, uColor:{value:new THREE.Color(0xffe08a)}, uEllipse:{value:0.35} },
        vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader:`precision mediump float; varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uEllipse; void main(){ vec2 p = vUv - 0.5; p.x *= uEllipse; float d = length(p) * 2.0; float a = uAlpha * pow(max(0.0, 1.0 - clamp(d, 0.0, 1.0)), 2.2); if(a < 0.001) discard; gl_FragColor = vec4(uColor, a); }`
      });
      this._muzzle = new THREE.Mesh(g, m);
      this._muzzle.position.set(0, -0.05, -0.25); // near camera
      this._muzzle.scale.set(0.12, 0.05, 1); // elongated oval
      this._muzzle.rotation.z = Math.random() * Math.PI;
      this.camera.add(this._muzzle);
      this._muzzle.renderOrder = 9999;
    }
    this._muzzle.material.uniforms.uAlpha.value = Math.min(1, 0.6 * strength + 0.2);
    this._muzzle.rotation.z = Math.random() * Math.PI;
    this._muzzle.scale.set(0.10 + Math.random()*0.05, 0.035 + Math.random()*0.03, 1);
    this._muzzleTTL = this._muzzleMax;
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
    // Adjust tracer material color slightly greener with tier
    const base = new this.THREE.Color(0x111111);
    const tint = new this.THREE.Color(0x16a34a);
    const mixed = base.clone().lerp(tint, Math.max(0, Math.min(1, intensity)) * 0.6);
    if(this.scene && this.scene.traverse){
      this.scene.traverse(obj=>{
        if(obj.isLine && obj.material && obj.material.color && obj.material.name!=="_staticTracer"){
          obj.material.color.copy(mixed);
        }
      });
    }
  }

  onPlayerHit(damage){
    // scale to a reasonable punch
    this.hitStrength = Math.min(1, this.hitStrength + damage * 0.05);
  }

  // External control from game: set fatigue level 0..1 (mapped from low stamina)
  setFatigue(level){
    this.fatigueLevel = Math.max(0, Math.min(1, level||0));
  }

  spawnBulletImpact(position, normal){
    const THREE = this.THREE;
    const count = 80;
    const positions = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const lifes = new Float32Array(count);
    const n = (normal && normal.lengthSq()>0) ? normal.clone().normalize() : new THREE.Vector3(0,1,0);
    for(let i=0;i<count;i++){
      const i3=i*3;
      positions[i3]=position.x; positions[i3+1]=position.y; positions[i3+2]=position.z;
      // hemisphere direction around normal
      const u = Math.random(); const v = Math.random();
      const theta = 2*Math.PI*u; const r = Math.sqrt(v);
      const local = new THREE.Vector3(r*Math.cos(theta), Math.sqrt(1-v), r*Math.sin(theta));
      // align local y to normal
      const basis = new THREE.Matrix4();
      const up = new THREE.Vector3(0,1,0);
      const axis = new THREE.Vector3().crossVectors(up, n);
      const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(n))));
      basis.makeRotationAxis(axis.normalize(), angle || 0);
      local.applyMatrix4(basis);
      dirs[i3]=local.x; dirs[i3+1]=local.y; dirs[i3+2]=local.z;
      speeds[i] = 8 + Math.random()*16;
      lifes[i] = 0.35 + Math.random()*0.25;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions,3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1));
    g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
    const uniforms = { uElapsed:{value:0}, uOrigin:{value: position.clone()}, uGravity:{value:new THREE.Vector3(0,-80,0)}, uSize:{value:0.5} };
    const material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms,
      vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); vec3 pos = uOrigin + aDir * (aSpeed*t) + 0.5*uGravity*(t*t); vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist = -mv.z; gl_PointSize = uSize * clamp(180.0/dist, 1.0, 10.0); vAlpha = 1.0 - (t/aLife); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc = gl_PointCoord-0.5; float d=length(pc); float a = smoothstep(0.5,0.0,d) * vAlpha; if(a<0.02) discard; vec3 col = mix(vec3(1.0,0.85,0.4), vec3(1.0), 0.5); gl_FragColor = vec4(col, a); }`
    });
    const points = new THREE.Points(g, material);
    this.scene.add(points);
    this._alive.push({ points, uniforms, maxLife: 0.6 });
  }

  enemyDeath(center){
    const THREE = this.THREE;
    const count = 140;
    const positions = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const lifes = new Float32Array(count);
    for(let i=0;i<count;i++){
      const i3=i*3;
      positions[i3]=center.x; positions[i3+1]=center.y+0.8; positions[i3+2]=center.z;
      // random sphere dir biased upward
      const u = Math.random(); const v = Math.random();
      const theta = 2*Math.PI*u; const phi = Math.acos(2*v-1);
      const d = new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
      d.y = Math.abs(d.y); d.normalize();
      dirs[i3]=d.x; dirs[i3+1]=d.y; dirs[i3+2]=d.z;
      speeds[i] = 3.0 + Math.random()*6.0;
      lifes[i] = 0.6 + Math.random()*0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions,3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dirs,3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds,1));
    g.setAttribute('aLife', new THREE.BufferAttribute(lifes,1));
    const uniforms = { uElapsed:{value:0}, uOrigin:{value:center.clone()}, uGravity:{value:new THREE.Vector3(0,-16,0)}, uSize:{value:3.0} };
    const material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms,
      vertexShader:`uniform float uElapsed; uniform vec3 uOrigin; uniform vec3 uGravity; uniform float uSize; attribute vec3 aDir; attribute float aSpeed; attribute float aLife; varying float vAlpha; void main(){ float t=min(uElapsed,aLife); float k = smoothstep(0.0, 0.2, t); vec3 pos = uOrigin + aDir * (aSpeed*t*k) + 0.5*uGravity*(t*t); pos.x += sin(t*8.0 + aSpeed)*0.06; pos.z += cos(t*7.0 + aSpeed)*0.06; vec4 mv = modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize = uSize * clamp(180.0/dist, 1.2, 9.0); vAlpha = 1.0 - (t/aLife); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a = smoothstep(0.45,0.0,d) * vAlpha; if(a<0.02) discard; vec3 col = mix(vec3(1.0,0.45,0.25), vec3(1.0,0.8,0.2), 0.15); gl_FragColor = vec4(col, a*0.85); }`
    });
    const points = new THREE.Points(g, material);
    this.scene.add(points);
    this._alive.push({ points, uniforms, maxLife: 1.0 });
  }

  // Composite explosion: shockwave, fireball, sparks, smoke, light flash
  spawnExplosion(center, radius=3.0){
    const THREE = this.THREE;
    // 1) Shockwave ring on ground
    const segs = 72;
    const ringGeom = new THREE.RingGeometry(radius*0.22, radius*0.24, segs, 1);
    const ringMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uElapsed:{value:0}, uLife:{value:0.5}, uStart:{value:radius*0.22}, uEnd:{value:radius*1.4}, uColor:{value:new THREE.Color(0xfff1a1)} },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uElapsed; uniform float uLife; uniform float uStart; uniform float uEnd; uniform vec3 uColor; void main(){ float t = clamp(uElapsed/uLife, 0.0, 1.0); float r = mix(uStart, uEnd, t); float d = abs(length(vUv-0.5)*2.0 - r); float a = smoothstep(0.1, 0.0, d) * (1.0 - t); if(a<0.01) discard; gl_FragColor = vec4(uColor, a); }`
    });
    const ring = new THREE.Mesh(ringGeom, ringMat); ring.position.copy(center.clone().setY(0.05)); ring.rotation.x = -Math.PI/2; this.scene.add(ring);
    this._alive.push({ points: ring, uniforms: ringMat.uniforms, maxLife: 0.5 });

    // 2) Fireball core (circular billboard with radial fade + soft noise) — no square film
    const coreGeom = new THREE.PlaneGeometry(1,1);
    const coreMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uAlpha:{value:0.95}, uTint:{value:new THREE.Color(0xffb347)}, uTime:{value:0} },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uAlpha; uniform vec3 uTint; float hash(vec2 p){ p=fract(p*vec2(123.34, 345.45)); p+=dot(p, p+34.345); return fract(p.x*p.y); } void main(){ vec2 p=vUv-0.5; float r=length(p)*2.0; // radial falloff
        float ring = smoothstep(1.0, 0.0, r) * smoothstep(0.0, 0.55, r);
        // soft noise breakup to avoid film look
        float n = hash(floor(vUv*32.0));
        float a = uAlpha * ring * (0.85 + 0.15*n);
        if(a<0.02) discard; gl_FragColor = vec4(uTint, a); }`
    });
    const core = new THREE.Mesh(coreGeom, coreMat); core.position.copy(center.clone().setY(center.y + 0.6)); core.scale.set(radius*0.3, radius*0.3, 1); this.scene.add(core);
    this._alive.push({ mesh: core, life: 0, maxLife: 0.45, tick: dt=>{
      coreMat.uniforms.uAlpha.value = Math.max(0, coreMat.uniforms.uAlpha.value - dt*2.2);
      const s = core.scale.x + dt * radius * 1.8; core.scale.set(s, s, 1);
      // billboard toward camera
      if (this.camera && this.camera.position) core.lookAt(this.camera.position);
    }, cleanup: ()=>{ coreMat.dispose(); coreGeom.dispose(); } });

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

  // Simple expanding ground ring useful for slams
  spawnGroundRing(center, radius=5.0, color=0x9bd1ff){
    const THREE = this.THREE;
    const segs = 80;
    const ringGeom = new THREE.RingGeometry(radius*0.1, radius*0.12, segs, 1);
    const ringMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uElapsed:{value:0}, uLife:{value:0.6}, uStart:{value:radius*0.1}, uEnd:{value:radius}, uColor:{value:new THREE.Color(color)} },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uElapsed; uniform float uLife; uniform float uStart; uniform float uEnd; uniform vec3 uColor; void main(){ float t=clamp(uElapsed/uLife,0.0,1.0); float r=mix(uStart,uEnd,t); float d=abs(length(vUv-0.5)*2.0 - r); float a=smoothstep(0.08,0.0,d)*(1.0-t); if(a<0.01) discard; gl_FragColor=vec4(uColor, a); }`
    });
    const ring = new THREE.Mesh(ringGeom, ringMat); ring.position.copy(center.clone().setY(0.05)); ring.rotation.x = -Math.PI/2; this.scene.add(ring);
    this._alive.push({ points: ring, uniforms: ringMat.uniforms, maxLife: ringMat.uniforms.uLife.value });
    return ring;
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


