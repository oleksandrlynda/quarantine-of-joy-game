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
      ]
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
      ]
    },
    urban: {
      skyTop: '#b0c4de',
      skyBottom: '#d3d3d3',
      fogColor: 0x9fa0a2,
      ground: 0x555555,
      wall: 0x333333,
      weather: 'rain',
      fauna: 10,
      vegetation: []
    }
  },
  init(ctx){
    this.scene = ctx.scene;
    this.skyMat = ctx.skyMat;
    this.mats = ctx.mats;
    this.weather = ctx.weather || null;
    this.current = ctx.current || 'grass';
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
  getCurrentBiome(){
    return this.current;
  },
  setBiome(name){
    const cfg = this._biomes[name] || this._biomes.grass;
    this.current = name;
    if (this.scene && this.scene.fog) this.scene.fog.color.set(cfg.fogColor);
    if (this.skyMat){
      this.skyMat.uniforms.top.value.set(cfg.skyTop);
      this.skyMat.uniforms.bottom.value.set(cfg.skyBottom);
    }
    if (this.mats && this.mats.floor) this.mats.floor.color.set(cfg.ground);
    if (this.mats && this.mats.wall) this.mats.wall.color.set(cfg.wall);
    if (this.weather && this.weather.setMode) this.weather.setMode(cfg.weather);
    if (this.fauna && this.fauna.setDensity) this.fauna.setDensity(cfg.fauna || 0);
    if (this.vegetation && this.vegetation.setConfig) this.vegetation.setConfig(cfg.vegetation || []);
  }
};
