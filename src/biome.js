export const BiomeManager = {
  _biomes: {
    grass: {
      skyTop: '#aee9ff',
      skyBottom: '#f1e3ff',
      fogColor: 0xcfe8ff,
      ground: 0xd7fbe8,
      wall: 0x8ecae6,
      weather: 'clear',
      fauna: 20,
      vegetation: [
        { type: 'pine', count: 120 },
        { type: 'bush', count: 80 }
      ],
      particles: [],
      waterBodies: [
        { position: [12, -8], radius: 6 }
      ],
      night: {
        skyTop: '#0b0d33',
        skyBottom: '#1a0d26',
        fogColor: 0x0a0c12,
        ground: 0x2b3b2b,
        wall: 0x2e3a4f,
        weather: 'clear',
        fauna: 10,
        particles: [{ type: 'firefly', count: 50 }]
      }
    },
    desert: {
      skyTop: '#f7d9a3',
      skyBottom: '#fbeed1',
      fogColor: 0xf2e5c1,
      ground: 0xe5c87a,
      wall: 0xcba96b,
      weather: 'sandstorm',
      fauna: 5,
      vegetation: [
        { type: 'cactus', count: 80 }
      ],
      particles: [{ type: 'dust', count: 40 }],
      waterBodies: [
        { position: [-15, 15], radius: 4 }
      ],
      night: {
        skyTop: '#332211',
        skyBottom: '#1f1408',
        fogColor: 0x1a140d,
        ground: 0x604e2a,
        wall: 0x4a3a1e,
        weather: 'clear',
        fauna: 3,
        particles: [{ type: 'dust', count: 20 }]
      }
    },
    urban: {
      skyTop: '#b0c4de',
      skyBottom: '#d3d3d3',
      fogColor: 0x9fa0a2,
      ground: 0x555555,
      wall: 0x333333,
      weather: 'rain',
      fauna: 10,
      vegetation: [],
      particles: [],
      waterBodies: [],
      night: {
        skyTop: '#1a1a2a',
        skyBottom: '#0f0f18',
        fogColor: 0x0f1012,
        ground: 0x2a2a2a,
        wall: 0x161616,
        weather: 'rain',
        fauna: 5,
        particles: []
      }
    }
  },
  init(ctx){
    this.scene = ctx.scene;
    this.skyMat = ctx.skyMat;
    this.mats = ctx.mats;
    this.weather = ctx.weather || null;
    this.current = ctx.current || 'grass';
    this.isNight = false;
  },
  attachWeather(weather){
    this.weather = weather;
  },
  attachFauna(fauna){
    this.fauna = fauna;
  },
  attachVegetation(veg){
    this.vegetation = veg;
  },
  attachParticles(p){
    this.particles = p;
  },
  attachWater(w){
    this.water = w;
  },
  getCurrentBiome(){
    return this.current;
  },
  setDayNight(isNight){
    const flag = !!isNight;
    if (this.isNight === flag) return;
    this.isNight = flag;
    if (this.fauna && this.fauna.setNight) this.fauna.setNight(flag);
    this.setBiome(this.current);
  },
  setBiome(name){
    const base = this._biomes[name] || this._biomes.grass;
    const variant = (this.isNight && base.night) ? base.night : {};
    const cfg = { ...base, ...variant };
    this.current = name;
    if (this.scene && this.scene.fog) this.scene.fog.color.set(cfg.fogColor);
    if (this.skyMat){
      this.skyMat.uniforms.top.value.set(cfg.skyTop);
      this.skyMat.uniforms.bottom.value.set(cfg.skyBottom);
    }
    if (this.mats && this.mats.floor) this.mats.floor.color.set(cfg.ground);
    if (this.mats && this.mats.wall) this.mats.wall.color.set(cfg.wall);
    if (this.weather && this.weather.setMode) this.weather.setMode(cfg.weather);
    if (this.fauna){
      if (this.fauna.setNight) this.fauna.setNight(this.isNight);
      if (this.fauna.setDensity) this.fauna.setDensity(cfg.fauna || 0);
    }
    if (this.vegetation && this.vegetation.setConfig) this.vegetation.setConfig(cfg.vegetation || []);
    if (this.particles && this.particles.setConfig) this.particles.setConfig(cfg.particles || []);
    if (this.water && this.water.setConfig) this.water.setConfig(cfg.waterBodies || []);
  }
};
