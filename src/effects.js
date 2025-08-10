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

    // Promotion pulse element (simple DOM overlay to avoid heavy post)
    this._promoEl = document.getElementById('promoPulse');

    // Muzzle flash quad (reused)
    this._muzzle = null;
    this._muzzleTTL = 0;
    this._muzzleMax = 0.06;
    this.muzzleEnabled = false; // hide muzzle flash for now
  }

  update(dt){
    // Update transient particle effects
    for(let i=this._alive.length-1;i>=0;i--){
      const fx = this._alive[i];
      fx.uniforms.uElapsed.value += dt;
      if(fx.uniforms.uElapsed.value > fx.maxLife){
        this.scene.remove(fx.points);
        fx.points.geometry.dispose();
        fx.points.material.dispose();
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
}


