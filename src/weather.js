// WeatherSystem module: rain, snow, dynamic cycle, thunder for rain
export class WeatherSystem {
  constructor(ctx){
    this.THREE = ctx.THREE; this.scene = ctx.scene; this.skyMat = ctx.skyMat; this.hemi = ctx.hemi; this.dir = ctx.dir;
    this.group = new this.THREE.Group(); this.scene.add(this.group);

    // Public state
    this.mode = 'clear'; // 'clear' | 'rain' | 'snow'
    this.uTime = { value: 0 };
    this.wind = new this.THREE.Vector3(1.2, 0.0, -0.4);
    this.areaSize = 120;
    this.height = 80;

    // Particles
    this.rain = this.createRainPoints(6000);
    this.snow = this.createSnowPoints(2600);
    this.rain.visible = false; this.snow.visible = false;

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
    this.mode = mode;
    this.rain.visible = mode === 'rain';
    this.snow.visible = mode === 'snow';
    // Mood tweaks
    if (mode === 'rain') {
      this.scene.fog.color.set(0xaecfe6); this.scene.fog.near = 18; this.scene.fog.far = 120;
      this.skyMat.uniforms.top.value.set('#9cd0ff'); this.skyMat.uniforms.bottom.value.set('#dfe9ff');
      this.hemi.intensity = 0.7; this.dir.intensity = 0.65;
    } else if (mode === 'snow') {
      this.scene.fog.color.set(0xeaf3ff); this.scene.fog.near = 22; this.scene.fog.far = 140;
      this.skyMat.uniforms.top.value.set('#cfe9ff'); this.skyMat.uniforms.bottom.value.set('#f6f9ff');
      this.hemi.intensity = 0.9; this.dir.intensity = 0.7;
    } else {
      this.scene.fog.color.set(0xcfe8ff); this.scene.fog.near = 20; this.scene.fog.far = 160;
      this.skyMat.uniforms.top.value.set('#aee9ff'); this.skyMat.uniforms.bottom.value.set('#f1e3ff');
      this.hemi.intensity = 0.9; this.dir.intensity = 0.8;
    }
  }

  update(elapsedSeconds, camera){
    this.uTime.value = elapsedSeconds;
    // center volume to player
    const p = camera.position; this.group.position.set(p.x, 0, p.z);

    // auto change
    if (elapsedSeconds >= this._nextChangeAt){
      this._pickNextWeather();
    }

    // thunder behavior when raining
    if (this.mode === 'rain'){
      this._updateThunder(elapsedSeconds, p);
    } else {
      this._flash = 0; this.lightning.intensity = 0; this.dir.color.copy(this.baseDirColor);
    }
  }

  // ---- Internals ----
  _scheduleNextChange(now){
    // Clear more often: 60% clear, 25% rain, 15% snow.
    // Next change after 20–45 seconds.
    this._nextChangeAt = now + 20 + Math.random()*25;
  }

  _pickNextWeather(){
    const r = Math.random();
    const target = r < 0.6 ? 'clear' : r < 0.85 ? 'rain' : 'snow';
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
      uniforms:{ uTime:this.uTime, uSize:{value:0.6}, uHeight:{value:this.height}, uWind:{value:this.wind}, uArea:{value:this.areaSize} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform vec3 uWind; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float halfA=0.5*uArea; float fx=position.x+uWind.x*uTime+sin(uTime*8.0+aSeed*6.283)*0.08; float fz=position.z+uWind.z*uTime+cos(uTime*6.0+aSeed*6.283)*0.08; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y-uTime*aSpeed,uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize=uSize*clamp(180.0/dist,2.0,14.0); vAlpha=clamp((aSpeed-20.0)/40.0,0.2,1.0); }`,
      fragmentShader:`precision mediump float; varying float vAlpha; void main(){ vec2 pc=gl_PointCoord; float x=abs(pc.x-0.5); float core=smoothstep(0.48,0.45,x); float soft=smoothstep(0.5,0.2,x); float tail=smoothstep(1.0,0.0,pc.y); float a=mix(soft,core,0.85)*tail*vAlpha; if(a<0.02) discard; vec3 col=mix(vec3(0.55,0.75,1.0), vec3(0.9,0.97,1.0), 0.7); gl_FragColor=vec4(col,a);} `
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }

  createSnowPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count); const speeds=g.getAttribute('aSpeed'); for(let i=0;i<speeds.count;i++) speeds.setX(i,3.5+Math.random()*3.0); speeds.needsUpdate=true;
    const material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ uTime:this.uTime, uSize:{value:3.0}, uHeight:{value:this.height}, uArea:{value:this.areaSize} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vFade; void main(){ vec3 pos=position; float s=aSeed*6.283; float halfA=0.5*uArea; float fx=position.x+sin(uTime*0.8+s)*0.9+sin(uTime*1.7+s*1.7)*0.3; float fz=position.z+cos(uTime*0.6+s)*0.9+cos(uTime*1.3+s*1.2)*0.3; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y-uTime*aSpeed,uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=-mv.z; gl_PointSize=uSize*clamp(180.0/dist,1.5,9.0); vFade=clamp((uHeight-pos.y)/uHeight,0.2,1.0); }`,
      fragmentShader:`precision mediump float; varying float vFade; void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc); float a=smoothstep(0.5,0.0,d)*vFade; if(a<0.02) discard; vec3 col=vec3(0.98); gl_FragColor=vec4(col,a);} `
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }
}


