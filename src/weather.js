// WeatherSystem module: rain, snow, fog (can blend with rain), sandstorm, dynamic cycle, thunder for rain
export class WeatherSystem {
  constructor(ctx){
    this.THREE = ctx.THREE; this.scene = ctx.scene; this.skyMat = ctx.skyMat; this.hemi = ctx.hemi; this.dir = ctx.dir;
    this.group = new this.THREE.Group(); this.scene.add(this.group);

    // Public state
    this.mode = 'clear'; // 'clear' | 'rain' | 'snow' | 'fog' | 'rain+fog' | 'sandstorm'
    this.precip = 'none'; // 'none' | 'rain' | 'snow'
    this.uTime = { value: 0 };
    this.wind = new this.THREE.Vector3(1.2, 0.0, -0.4);
    this.areaSize = 120;
    this.height = 80;

    // Particles
    this.rain = this.createRainPoints(6000);
    this.snow = this.createSnowPoints(2600);
    this.fog = this.createFogPoints(1100);
    this.sand = this.createSandPoints(1200);
    this.rain.visible = false; this.snow.visible = false; this.fog.visible = false; this.sand.visible = false;

    // Crossfade state for smoother transitions
    this._mix = { rain: 0, snow: 0, fog: 0, sand: 0 };
    this._mixTarget = { rain: 0, snow: 0, fog: 0, sand: 0 };
    this._transitionTime = 3.5; // seconds to blend between states (longer = smoother)
    this._lastTime = 0;

    // Environment interpolation state (fog, sky, light intensities)
    this._env = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    // Snapshots for eased transitions
    this._envStart = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    this._envTarget = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    // Transition timing
    this._transitionStartTime = 0;

    // Thunder
    this.lightning = new this.THREE.PointLight(0xffffee, 0, 260);
    this.lightning.position.set(0, 60, 0);
    this.scene.add(this.lightning);
    this._thunderCooldown = 3; // seconds until next possible strike
    this._flash = 0; // current flash intensity 0..1

    // Sky flash uniform via hemisphere intensity is subtle; we’ll tint directional light color briefly
    this.baseDirColor = this.dir.color.clone();
    this.flashColor = new this.THREE.Color(0xffffe0);

    // Auto weather cycle
    this._nextChangeAt = 0;
    this._scheduleNextChange(0);
  }

  // ---- Public API ----
  setMode(mode){
    this.mode = mode || 'clear';
    const m = (''+this.mode).toLowerCase();
    const hasRain = m.includes('rain');
    const hasSnow = m.includes('snow');
    const hasFog  = m.includes('fog');
    const hasSand = m.includes('sand');
    this.precip = hasRain ? 'rain' : (hasSnow ? 'snow' : 'none');

    // Particle targets (capture current as start for easing)
    this._mixStart = { rain: this._mix.rain, snow: this._mix.snow, fog: this._mix.fog, sand: this._mix.sand };
    this._mixTarget.rain = hasRain ? 1 : 0;
    this._mixTarget.snow = hasSnow ? 1 : 0;
    this._mixTarget.fog  = hasFog  ? 1 : 0;
    this._mixTarget.sand = hasSand ? 1 : 0;

    // Environment targets (fog/sky/light). Also capture current as start
    this._envStart = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    const C = this.THREE.Color;
    if (hasRain && hasFog){
      this._envTarget.fogColor = new C(0xa8c2d8);
      this._envTarget.fogNear = 14; this._envTarget.fogFar = 95;
      this._envTarget.skyTop = new C('#8fbbe0'); this._envTarget.skyBottom = new C('#d8e6f5');
      this._envTarget.hemiIntensity = 0.65; this._envTarget.dirIntensity = 0.6;
    } else if (hasRain) {
      this._envTarget.fogColor = new C(0xaecfe6);
      this._envTarget.fogNear = 18; this._envTarget.fogFar = 120;
      this._envTarget.skyTop = new C('#9cd0ff'); this._envTarget.skyBottom = new C('#dfe9ff');
      this._envTarget.hemiIntensity = 0.7; this._envTarget.dirIntensity = 0.65;
    } else if (hasSnow) {
      this._envTarget.fogColor = new C(0xeaf3ff);
      this._envTarget.fogNear = 22; this._envTarget.fogFar = 140;
      this._envTarget.skyTop = new C('#cfe9ff'); this._envTarget.skyBottom = new C('#f6f9ff');
      this._envTarget.hemiIntensity = 0.9; this._envTarget.dirIntensity = 0.7;
    } else if (hasSand) {
      this._envTarget.fogColor = new C(0xdcc7a4);
      this._envTarget.fogNear = 12; this._envTarget.fogFar = 90;
      this._envTarget.skyTop = new C('#d2b98c'); this._envTarget.skyBottom = new C('#f0e4d0');
      this._envTarget.hemiIntensity = 0.6; this._envTarget.dirIntensity = 0.55;
    } else if (hasFog) {
      this._envTarget.fogColor = new C(0xd9e6f2);
      this._envTarget.fogNear = 16; this._envTarget.fogFar = 115;
      this._envTarget.skyTop = new C('#b9e0ff'); this._envTarget.skyBottom = new C('#f0f6ff');
      this._envTarget.hemiIntensity = 0.8; this._envTarget.dirIntensity = 0.7;
    } else {
      this._envTarget.fogColor = new C(0xcfe8ff);
      this._envTarget.fogNear = 20; this._envTarget.fogFar = 160;
      this._envTarget.skyTop = new C('#aee9ff'); this._envTarget.skyBottom = new C('#f1e3ff');
      this._envTarget.hemiIntensity = 0.9; this._envTarget.dirIntensity = 0.8;
    }

    // Feed ambient weather loops
    try {
      const windMix = Math.max(this._mixTarget.fog, this._mixTarget.sand);
      window._SFX?.setWeatherMix?.({ rain: this._mixTarget.rain, snow: this._mixTarget.snow, wind: windMix });
    } catch (_) {}

    // Mark transition start
    this._transitionStartTime = this.uTime.value || 0;
  }

  update(elapsedSeconds, camera){
    this.uTime.value = elapsedSeconds;
    const dt = Math.min(0.1, Math.max(0, (this._lastTime===0?0:elapsedSeconds - this._lastTime)));
    this._lastTime = elapsedSeconds;
    // center volume to player
    const p = camera.position; this.group.position.set(p.x, 0, p.z);

    // auto change
    if (elapsedSeconds >= this._nextChangeAt){
      this._pickNextWeather();
    }

    // Smoothly blend particles and environment
    this._updateTransition(dt);

    // thunder behavior when raining (let flash decay naturally when not raining)
    if (this.precip === 'rain'){
      this._updateThunder(elapsedSeconds, p);
    } else if (this._flash > 0){
      this._decayThunder(elapsedSeconds);
    } else {
      this.lightning.intensity = 0; this.dir.color.copy(this.baseDirColor);
    }
  }

  // ---- Internals ----
  _updateTransition(dt){
    const now = this.uTime.value || 0;
    const dur = Math.max(0.001, this._transitionTime);
    let t = Math.max(0, Math.min(1, (now - this._transitionStartTime) / dur));
    // smootherstep for extra smoothness
    const s = t*t*t*(t*(t*6.0 - 15.0) + 10.0);
    const lerp01 = (a,b,u)=> a + (b - a) * u;

    // particle fades (from start to target using eased t)
    this._mix.rain = lerp01(this._mixStart?.rain ?? 0, this._mixTarget.rain, s);
    this._mix.snow = lerp01(this._mixStart?.snow ?? 0, this._mixTarget.snow, s);
    this._mix.fog  = lerp01(this._mixStart?.fog  ?? 0, this._mixTarget.fog,  s);
    this._mix.sand = lerp01(this._mixStart?.sand ?? 0, this._mixTarget.sand, s);

    if (this.rain && this.rain.material?.uniforms?.uAlpha){ this.rain.material.uniforms.uAlpha.value = this._mix.rain; }
    if (this.snow && this.snow.material?.uniforms?.uAlpha){ this.snow.material.uniforms.uAlpha.value = this._mix.snow; }
    if (this.fog  && this.fog.material?.uniforms?.uAlpha){ this.fog.material.uniforms.uAlpha.value  = this._mix.fog; }
    if (this.sand && this.sand.material?.uniforms?.uAlpha){ this.sand.material.uniforms.uAlpha.value = this._mix.sand; }

    if (this.rain) this.rain.visible = this._mix.rain > 0.01;
    if (this.snow) this.snow.visible = this._mix.snow > 0.01;
    if (this.fog)  this.fog.visible  = this._mix.fog  > 0.01;
    if (this.sand) this.sand.visible = this._mix.sand > 0.01;

    // environment blending using eased t
    this.scene.fog.color.copy(this._envStart.fogColor).lerp(this._envTarget.fogColor, s);
    this.skyMat.uniforms.top.value.copy(this._envStart.skyTop).lerp(this._envTarget.skyTop, s);
    this.skyMat.uniforms.bottom.value.copy(this._envStart.skyBottom).lerp(this._envTarget.skyBottom, s);
    this.scene.fog.near = lerp01(this._envStart.fogNear, this._envTarget.fogNear, s);
    this.scene.fog.far  = lerp01(this._envStart.fogFar,  this._envTarget.fogFar,  s);
    this.hemi.intensity = lerp01(this._envStart.hemiIntensity, this._envTarget.hemiIntensity, s);
    this.dir.intensity  = lerp01(this._envStart.dirIntensity,  this._envTarget.dirIntensity,  s);
  }

  _decayThunder(t){
    if (this._flash > 0){
      const f = this._flash;
      const intensity = Math.max(0, 8.0*f + 3.0*Math.sin(t*60.0)*f);
      this.lightning.intensity = intensity;
      this.dir.color.copy(this.baseDirColor).lerp(this.flashColor, Math.min(1.0, f*0.7));
      if (this.skyMat && this.skyMat.uniforms.flashIntensity){
        this.skyMat.uniforms.flashIntensity.value = Math.min(1.0, f);
      }
      this._flash *= 0.90;
      if (this._flash < 0.02){
        this._flash = 0; this.lightning.intensity = 0; this.dir.color.copy(this.baseDirColor);
        if (this.skyMat&&this.skyMat.uniforms.flashIntensity){ this.skyMat.uniforms.flashIntensity.value = 0; }
      }
    }
  }

  _scheduleNextChange(now){
    // Weather probabilities: 45% clear, 18% rain, 8% rain+fog, 17% snow, 7% fog, 5% sandstorm.
    // Next change after 20–45 seconds.
    this._nextChangeAt = now + 20 + Math.random()*25;
  }

  _pickNextWeather(){
    const r = Math.random();
    // 45% clear, 18% rain, 8% rain+fog, 17% snow, 7% fog, 5% sandstorm
    const target = r < 0.45 ? 'clear'
                 : r < 0.63 ? 'rain'
                 : r < 0.71 ? 'rain+fog'
                 : r < 0.88 ? 'snow'
                 : r < 0.95 ? 'fog'
                 : 'sandstorm';
    this.setMode(target);
    this._scheduleNextChange(this.uTime.value);
  }

  _updateThunder(t, playerPos){
    if (this._thunderCooldown <= 0){
      // Lower probability so sound is less frequent
      if (Math.random() < 0.01){
        // place strike somewhere around player
        const angle = Math.random()*Math.PI*2; const dist = 20 + Math.random()*35;
        const x = playerPos.x + Math.cos(angle)*dist; const z = playerPos.z + Math.sin(angle)*dist;
        this.lightning.position.set(x, 50 + Math.random()*20, z);
        this._flash = 1.0; // start flash
        this.lightning.intensity = 0; // will ramp below
        this._thunderCooldown = 10 + Math.random()*18; // next window further apart
        // Play thunder after a short delay depending on distance (speed of sound ~343 m/s)
        const d = Math.sqrt(dist*dist + 50*50);
        const delay = Math.min(4.0, d / 150.0);
        setTimeout(()=>{ try{ this._playThunder(); }catch(e){} }, delay*1000);
      }
    } else {
      this._thunderCooldown -= 1/60; // approximated per frame; sufficient
    }

    // Flash decay and light intensity
    if (this._flash > 0){
      // two-pulse flicker
      const f = this._flash;
      const intensity = Math.max(0, 8.0*f + 3.0*Math.sin(t*60.0)*f);
      this.lightning.intensity = intensity;
      // temporarily tint directional light
      this.dir.color.copy(this.baseDirColor).lerp(this.flashColor, Math.min(1.0, f*0.7));
      // feed sky flash uniform
      if (this.skyMat && this.skyMat.uniforms.flashIntensity){
        this.skyMat.uniforms.flashIntensity.value = Math.min(1.0, f);
        this.skyMat.uniforms.flashDir.value.copy(this.lightning.position).normalize();
      }
      this._flash *= 0.90; // decay
      if (this._flash < 0.02){ this._flash = 0; this.lightning.intensity = 0; this.dir.color.copy(this.baseDirColor); if(this.skyMat&&this.skyMat.uniforms.flashIntensity){ this.skyMat.uniforms.flashIntensity.value = 0; } }
    }
  }

  _playThunder(){
    // Simple synthetic thunder using WebAudio noise burst + low oscillators
    if (!window._weatherAudio){ window._weatherAudio = new (window.AudioContext||window.webkitAudioContext)(); }
    const a = window._weatherAudio;
    const now = a.currentTime;
    // Noise buffer
    const bufferSize = 2 * a.sampleRate;
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * (1 - i/bufferSize); }
    const noise = a.createBufferSource(); noise.buffer = buffer; noise.loop = false;
    const lpf = a.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.setValueAtTime(800, now);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now+0.02); g.gain.exponentialRampToValueAtTime(0.0001, now+2.0);
    noise.connect(lpf).connect(g).connect(a.destination); noise.start(now); noise.stop(now+2.2);

    // Low rumbles
    const osc = a.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(50, now);
    const og = a.createGain(); og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.12, now+0.05); og.gain.exponentialRampToValueAtTime(0.0001, now+1.2);
    osc.connect(og).connect(a.destination); osc.start(now); osc.stop(now+1.3);
  }

  // ---- Geometry + materials ----
  createBaseGeometry(count){
    const half = this.areaSize * 0.5; const positions = new Float32Array(count*3); const speeds = new Float32Array(count); const seeds = new Float32Array(count);
    for (let i=0;i<count;i++){ const i3=i*3; positions[i3]= (Math.random()*this.areaSize)-half; positions[i3+1]= Math.random()*this.height; positions[i3+2]= (Math.random()*this.areaSize)-half; speeds[i]=10+Math.random()*22; seeds[i]=Math.random(); }
    const g = new this.THREE.BufferGeometry();
    g.setAttribute('position', new this.THREE.BufferAttribute(positions,3));
    g.setAttribute('aSpeed', new this.THREE.BufferAttribute(speeds,1));
    g.setAttribute('aSeed', new this.THREE.BufferAttribute(seeds,1));
    return g;
  }

  createRainPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count);
    const speeds = g.getAttribute('aSpeed'); for (let i=0;i<speeds.count;i++) speeds.setX(i, 38 + Math.random()*36); speeds.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms:{ uTime:this.uTime, uSize:{value:0.6}, uHeight:{value:this.height}, uWind:{value:this.wind}, uArea:{value:this.areaSize}, uAlpha:{value:0.0} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform vec3 uWind; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float halfA=0.5*uArea; float fx=position.x+uWind.x*uTime+sin(uTime*8.0+aSeed*6.283)*0.08; float fz=position.z+uWind.z*uTime+cos(uTime*6.0+aSeed*6.283)*0.08; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y-uTime*aSpeed,uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize=uSize*clamp(180.0/dist,2.0,14.0); vAlpha=clamp((aSpeed-20.0)/40.0,0.2,1.0); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; uniform float uAlpha; void main(){ vec2 pc=gl_PointCoord; float x=abs(pc.x-0.5); float core=smoothstep(0.48,0.45,x); float soft=smoothstep(0.5,0.2,x); float tail=smoothstep(1.0,0.0,pc.y); float a=mix(soft,core,0.85)*tail*vAlpha; a*=uAlpha; if(a<0.02) discard; vec3 col=mix(vec3(0.55,0.75,1.0), vec3(0.9,0.97,1.0), 0.7); gl_FragColor=vec4(col,a);} `
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }

  createSnowPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count); const speeds=g.getAttribute('aSpeed'); for(let i=0;i<speeds.count;i++) speeds.setX(i,3.5+Math.random()*3.0); speeds.needsUpdate=true;
    const material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uTime:this.uTime, uSize:{value:3.0}, uHeight:{value:this.height}, uArea:{value:this.areaSize}, uAlpha:{value:0.0} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vFade; void main(){ vec3 pos=position; float s=aSeed*6.283; float halfA=0.5*uArea; float fx=position.x+sin(uTime*0.8+s)*0.9+sin(uTime*1.7+s*1.7)*0.3; float fz=position.z+cos(uTime*0.6+s)*0.9+cos(uTime*1.3+s*1.2)*0.3; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y-uTime*aSpeed,uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize=uSize*clamp(180.0/dist,1.5,9.0); vFade=clamp((uHeight-pos.y)/uHeight,0.2,1.0); }`,
      fragmentShader:`precision mediump float; varying float vFade; uniform float uAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a=smoothstep(0.5,0.0,d)*vFade; a*=uAlpha; if(a<0.02) discard; vec3 col=vec3(0.98); gl_FragColor=vec4(col,a);} `
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }

  createFogPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count);
    // Slow drift speeds for fog puffs
    const speeds = g.getAttribute('aSpeed'); for(let i=0;i<speeds.count;i++) speeds.setX(i, 1.0 + Math.random()*1.5); speeds.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms:{ uTime:this.uTime, uSize:{value:48.0}, uHeight:{value:Math.min(60, this.height)}, uArea:{value:this.areaSize}, uAlpha:{value:0.0} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float s=aSeed*6.283; float halfA=0.5*uArea; float fx=position.x + sin(uTime*0.10 + s)*1.6 + sin(uTime*0.23 + s*1.3)*1.1; float fz=position.z + cos(uTime*0.08 + s)*1.7 + cos(uTime*0.19 + s*0.9)*1.2; pos.x = -halfA + mod(fx + halfA, uArea); pos.z = -halfA + mod(fz + halfA, uArea); pos.y = mod(position.y + sin(uTime*0.12 + s)*0.6, uHeight); vec4 mv = modelViewMatrix * vec4(pos,1.0); gl_Position = projectionMatrix * mv; float dist = max(0.001, -mv.z); gl_PointSize = uSize * clamp(180.0/dist, 10.0, 95.0); float base = clamp(0.06 + fract(aSeed*97.0)*0.14, 0.06, 0.2); float nearFade = clamp((dist - 2.0) / 10.0, 0.0, 1.0); vAlpha = base * nearFade; }`,
      fragmentShader:`precision mediump float; varying float vAlpha; uniform float uAlpha; void main(){ vec2 pc = gl_PointCoord - 0.5; float d2 = dot(pc, pc); float soft = exp(-4.5 * d2); float a = soft * vAlpha * uAlpha; if(a < 0.01) discard; vec3 col = vec3(0.86, 0.92, 0.99); gl_FragColor = vec4(col, a); }`
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }

  createSandPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count);
    const speeds = g.getAttribute('aSpeed'); for(let i=0;i<speeds.count;i++) speeds.setX(i, 1.5 + Math.random()*2.0); speeds.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms:{ uTime:this.uTime, uSize:{value:42.0}, uHeight:{value:Math.min(60, this.height)}, uArea:{value:this.areaSize}, uAlpha:{value:0.0} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float s=aSeed*6.283; float halfA=0.5*uArea; float fx=position.x + sin(uTime*0.15 + s)*2.0 + sin(uTime*0.32 + s*1.1)*1.5; float fz=position.z + cos(uTime*0.12 + s)*2.1 + cos(uTime*0.27 + s*0.9)*1.4; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y + sin(uTime*0.18 + s)*0.4, uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=max(0.001,-mv.z); gl_PointSize=uSize*clamp(180.0/dist,10.0,95.0); float base=clamp(0.12 + fract(aSeed*53.0)*0.18,0.12,0.3); float nearFade=clamp((dist-2.0)/8.0,0.0,1.0); vAlpha=base*nearFade; }`,
      fragmentShader:`precision mediump float; varying float vAlpha; uniform float uAlpha; void main(){ vec2 pc=gl_PointCoord-0.5; float d2=dot(pc,pc); float soft=exp(-4.5*d2); float a=soft*vAlpha*uAlpha; if(a<0.01) discard; vec3 col=vec3(0.78,0.70,0.55); gl_FragColor=vec4(col,a); }`
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }
}


