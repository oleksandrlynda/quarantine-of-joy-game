// WeatherSystem module: rain, snow, fog (can blend with rain), sandstorm, windy, dynamic cycle, thunder for rain
import { logError } from './util/log.js';
import { getThunderNoiseBuffer } from './game/weather-audio.js';

// Weather remains visibly dense, but bounded particle fields avoid spending
// fill-rate on thousands of overlapping translucent sprites.
export const WEATHER_PARTICLE_BUDGETS = Object.freeze({
  rain: 4200,
  snow: 1800,
  fog: 700,
  sand: 1000,
  wind: 900
});

export class WeatherSystem {
  constructor(ctx){
    this.THREE = ctx.THREE; this.scene = ctx.scene; this.skyMat = ctx.skyMat; this.hemi = ctx.hemi; this.dir = ctx.dir; this.mats = ctx.mats;
    this.group = new this.THREE.Group(); this.scene.add(this.group);

    // Public state
    this.mode = 'clear'; // 'clear' | 'rain' | 'snow' | 'fog' | 'rain+fog' | 'sandstorm' | 'windy'
    this.precip = 'none'; // 'none' | 'rain' | 'snow'
    this.uTime = { value: 0 };
    this.wind = new this.THREE.Vector3(1.2, 0.0, -0.4);
    this._baseWind = this.wind.clone();
    this.areaSize = 120;
    this.height = 80;

    // Particles
    this.rain = this.createRainPoints(WEATHER_PARTICLE_BUDGETS.rain);
    this.snow = this.createSnowPoints(WEATHER_PARTICLE_BUDGETS.snow);
    this.fog = this.createFogPoints(WEATHER_PARTICLE_BUDGETS.fog);
    // Denser sandstorm particle field than fog for visibility
    this.sand = this.createSandPoints(WEATHER_PARTICLE_BUDGETS.sand);
    this.windPoints = this.createWindPoints(WEATHER_PARTICLE_BUDGETS.wind);
    this.rain.visible = false; this.snow.visible = false; this.fog.visible = false; this.sand.visible = false; this.windPoints.visible = false;

    // Crossfade state for smoother transitions
    this._mix = { rain: 0, snow: 0, fog: 0, sand: 0, wind: 0 };
    this._mixTarget = { rain: 0, snow: 0, fog: 0, sand: 0, wind: 0 };
    this._transitionTime = 3.5; // seconds to blend between states (longer = smoother)
    this._lastTime = 0;

    // Environment interpolation state (fog, sky, light intensities)
    this._env = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiColor: this.hemi.color.clone(),
      hemiGroundColor: this.hemi.groundColor.clone(),
      dirColor: this.dir.color.clone(),
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
      hemiColor: this.hemi.color.clone(),
      hemiGroundColor: this.hemi.groundColor.clone(),
      dirColor: this.dir.color.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    this._envTarget = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiColor: this.hemi.color.clone(),
      hemiGroundColor: this.hemi.groundColor.clone(),
      dirColor: this.dir.color.clone(),
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
    this._thunderNoiseCache = {};

    // Auto weather cycle tied to waves
    // _wavesElapsed counts how many waves have used the current weather
    // _wavesDuration is how many waves the current weather should last
    this._wavesElapsed = 0;
    // Start with clear weather lasting 1–3 waves
    this._wavesDuration = 1 + Math.floor(Math.random()*3);
  }

  // ---- Public API ----
  setMode(mode, options = {}){
    this.mode = mode || 'clear';
    const m = (''+this.mode).toLowerCase();
    const hasRain = m.includes('rain');
    const hasSnow = m.includes('snow');
    const hasFog  = m.includes('fog');
    const hasSand = m.includes('sand');
    const hasWind = m.includes('wind');
    const isRelayCordon = m.includes('relay-cordon');
    const isRelayAlarm = m.includes('relay-alarm');
    const isRelayRain = m.includes('relay-rain');
    const isRelaySignalStorm = m.includes('relay-signalstorm');
    const isRelayInfestationStorm = m.includes('relay-infestationstorm');
    const isSanitizerSterile = m.includes('sanitizer-sterile');
    const isSanitizerLockdown = m.includes('sanitizer-lockdown');
    const isSanitizerPurge = m.includes('sanitizer-purge');
    const isSanitizerBoss = m.includes('sanitizer-boss');
    const isSanitizer = isSanitizerSterile || isSanitizerLockdown || isSanitizerPurge || isSanitizerBoss;
    const isAdZoneOpen = m.includes('adzone-open');
    const isAdZoneNeon = m.includes('adzone-neon');
    const isAdZoneSponsored = m.includes('adzone-sponsored');
    const isAdZoneLockdown = m.includes('adzone-lockdown');
    const isAdZoneBoss = m.includes('adzone-boss');
    const isAdZone = isAdZoneOpen || isAdZoneNeon || isAdZoneSponsored || isAdZoneLockdown || isAdZoneBoss;
    const isWastes = m.includes('wastes-');
    const isWastesBoss = m.includes('wastes-boss');
    const isFreight = m.includes('freight-');
    const isFreightBoss = m.includes('freight-boss');
    const isMirror = m.includes('mirror-');
    const isMirrorBoss = m.includes('mirror-boss');
    const isCourt = m.includes('court-');
    const isCourtBoss = m.includes('court-boss');
    const isCathedral = m.includes('cathedral-');
    const isCathedralBoss = m.includes('cathedral-boss');
    const isExpanse = m.includes('expanse-');
    const isExpanseHeavy = m.includes('expanse-heavy');
    const isExpanseCleared = m.includes('expanse-cleared');
    const isLastOrder = m.includes('last-order-');
    const isLastOrderHeavy = m.includes('last-order-heavy');
    const isFloodgate = m.includes('floodgate-');
    const isFloodgateGallery = m.includes('floodgate-gallery');
    const isFloodgateVault = m.includes('floodgate-vault');
    const isFloodgateDeluge = m.includes('floodgate-deluge');
    const isFloodgateCleared = m.includes('floodgate-cleared');
    const relayRain = isRelayRain || isRelaySignalStorm || isRelayInfestationStorm;
    this.precip = (hasRain || relayRain) ? 'rain' : (hasSnow ? 'snow' : 'none');

    // Particle targets (capture current as start for easing)
    this._mixStart = { rain: this._mix.rain, snow: this._mix.snow, fog: this._mix.fog, sand: this._mix.sand, wind: this._mix.wind };
    this._mixTarget.rain = (hasRain || relayRain) ? 1 : 0;
    this._mixTarget.snow = hasSnow ? 1 : 0;
    // Mirror Garden already uses scene-depth fog for its layered reflections.
    // A lighter particle veil preserves atmosphere without bleaching the
    // cardinal routes and generation colors during the Hydraclone encounter.
    this._mixTarget.fog  = hasFog
      ? (isLastOrder ? (isLastOrderHeavy ? 1 : .46) : isMirror ? .32 : isCourt ? .1 : isCathedral ? .12 : isFloodgate ? .42 : 1)
      : 0;
    // Trend Wastes keeps the storm readable at combat distance. Dense weather
    // still closes long sightlines, but no longer fills the near camera with a
    // uniform beige veil that merges enemies, ground, and sky.
    const wastesSandMix = isExpanse
      ? (isExpanseHeavy ? 1 : isExpanseCleared ? .7 : .9)
      : isWastes
      ? (isWastesBoss ? .84 : m.includes('sandstorm') ? .92 : m.includes('crosswind') ? .82 : .74)
      : 1;
    this._mixTarget.sand = hasSand ? wastesSandMix : 0;
    this._mixTarget.wind = hasWind ? 1 : 0;
    if (this.sand?.material?.uniforms?.uColor) {
      this.sand.material.uniforms.uColor.value.setHex(isLastOrder
        ? 0x806a45
        : isExpanse
          ? (isExpanseHeavy ? 0x5f5b4c : isExpanseCleared ? 0x77705b : 0x6c6855)
          : 0xc7b38c);
    }

    // Environment targets (fog/sky/light). Also capture current as start
    this._envStart = {
      fogColor: this.scene.fog.color.clone(),
      fogNear: this.scene.fog.near,
      fogFar: this.scene.fog.far,
      skyTop: this.skyMat.uniforms.top.value.clone(),
      skyBottom: this.skyMat.uniforms.bottom.value.clone(),
      hemiColor: this.hemi.color.clone(),
      hemiGroundColor: this.hemi.groundColor.clone(),
      dirColor: this.dir.color.clone(),
      hemiIntensity: this.hemi.intensity,
      dirIntensity: this.dir.intensity,
    };
    const C = this.THREE.Color;
    if (isLastOrder) {
      // Wave 41 begins with a cold industrial haze, then collapses into a
      // near-camera ochre whiteout at the terminal. The 2.1 m heavy envelope
      // is deliberately much shorter than the reusable Expanse combat storm.
      const palette = isLastOrderHeavy
        ? { fog: 0x806a45, top: '#332e25', bottom: '#8c7047', near: .05, far: 2.1, hemi: .34, dir: .37 }
        : { fog: 0x34474a, top: '#172326', bottom: '#3e5150', near: 8, far: 62, hemi: .5, dir: .58 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiColor = new C(isLastOrderHeavy ? 0x927c58 : 0x8da9a6);
      this._envTarget.hemiGroundColor = new C(isLastOrderHeavy ? 0x3e3020 : 0x172224);
      this._envTarget.dirColor = new C(isLastOrderHeavy ? 0xb48650 : 0xa8d6cf);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isFloodgate) {
      // Preserve the authored fog distances while lowering the bright fog wall
      // that previously silhouetted every near-field actor in the vault. Local
      // floodgate, mast, seed, and core sources now provide the readable values.
      const palette = isFloodgateDeluge
        ? { fog: 0x30484e, top: '#17272e', bottom: '#415a59', near: 8, far: 58, hemi: .5, dir: .62 }
        : isFloodgateVault
          ? { fog: 0x3d5154, top: '#1f3037', bottom: '#4e6460', near: 12, far: 78, hemi: .54, dir: .68 }
          : isFloodgateGallery
            ? { fog: 0x4f6265, top: '#293e46', bottom: '#607672', near: 15, far: 94, hemi: .62, dir: .76 }
            : isFloodgateCleared
              ? { fog: 0x607e79, top: '#3e5961', bottom: '#789488', near: 22, far: 132, hemi: .78, dir: .94 }
              : { fog: 0x5a6b6d, top: '#30474e', bottom: '#6e7978', near: 18, far: 110, hemi: .68, dir: .82 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiColor = new C(isFloodgateVault || isFloodgateDeluge ? 0x9bb5b2 : 0xb6c9c5);
      this._envTarget.hemiGroundColor = new C(0x263435);
      this._envTarget.dirColor = new C(isFloodgateDeluge ? 0x9fcfd0 : 0xc3ddd5);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isExpanse) {
      // Keep the authored 12-24 m visibility envelope, but retain enough cool
      // ambient and warm directional separation to model combat bodies between
      // local beacons. The previous values collapsed near-field forms to black.
      const palette = isExpanseHeavy
        ? { fog: 0x57594e, top: '#293235', bottom: '#625c49', near: 2.5, far: 15, hemi: .54, dir: .64 }
        : isExpanseCleared
          ? { fog: 0x77715f, top: '#414c4d', bottom: '#897a5b', near: 7, far: 30, hemi: .72, dir: .84 }
          : { fog: 0x626357, top: '#313b3e', bottom: '#716950', near: 4.5, far: 24, hemi: .62, dir: .74 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiColor = new C(isExpanseHeavy ? 0x8a846d : 0x9a967b);
      this._envTarget.hemiGroundColor = new C(0x373328);
      this._envTarget.dirColor = new C(isExpanseHeavy ? 0xc19c64 : 0xd8b477);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isCathedral) {
      const palette = isCathedralBoss
        ? { fog: 0x5d6678, top: '#29364b', bottom: '#766981', near: 17, far: 108, hemi: .66, dir: .82 }
        : m.includes('choir')
          ? { fog: 0x6e7187, top: '#354258', bottom: '#85748f', near: 19, far: 116, hemi: .7, dir: .86 }
          : m.includes('root')
            ? { fog: 0x716b78, top: '#3a4354', bottom: '#91756c', near: 19, far: 120, hemi: .72, dir: .88 }
            : m.includes('liberated')
              ? { fog: 0x91a7a5, top: '#5b7280', bottom: '#b9d4c2', near: 24, far: 148, hemi: .88, dir: 1.04 }
              : m.includes('logic')
                ? { fog: 0x747e8d, top: '#3f5063', bottom: '#8b8494', near: 21, far: 126, hemi: .76, dir: .92 }
                : { fog: 0x7b8792, top: '#46596b', bottom: '#9296a3', near: 22, far: 134, hemi: .8, dir: .96 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isCourt) {
      const palette = isCourtBoss
        ? { fog: 0x66636a, top: '#343944', bottom: '#806864', near: 18, far: 112, hemi: .62, dir: .76 }
        : m.includes('verdict')
          ? { fog: 0x747279, top: '#404752', bottom: '#8a746c', near: 20, far: 120, hemi: .67, dir: .82 }
          : m.includes('purge')
            ? { fog: 0x7a7d83, top: '#47515b', bottom: '#827b82', near: 21, far: 126, hemi: .7, dir: .86 }
            : m.includes('liberated')
              ? { fog: 0x9aa89b, top: '#66777a', bottom: '#c0cbb0', near: 24, far: 146, hemi: .86, dir: 1.02 }
              : { fog: 0x82878a, top: '#4d5962', bottom: '#96877b', near: 23, far: 136, hemi: .75, dir: .92 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isMirror) {
      const palette = isMirrorBoss
        ? { fog: 0x666a75, top: '#2f3847', bottom: '#7e6e86', near: 18, far: 112, hemi: .58, dir: .72 }
        : m.includes('fracture')
          ? { fog: 0x747985, top: '#3e4b5c', bottom: '#887b91', near: 20, far: 120, hemi: .66, dir: .82 }
          : m.includes('echo')
            ? { fog: 0x7b898e, top: '#465865', bottom: '#8c9999', near: 20, far: 126, hemi: .7, dir: .87 }
            : m.includes('liberated')
              ? { fog: 0x91a79d, top: '#62777c', bottom: '#c0d5bd', near: 22, far: 142, hemi: .84, dir: 1.0 }
              : { fog: 0x819091, top: '#4e6068', bottom: '#9aa4a1', near: 22, far: 134, hemi: .74, dir: .9 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isFreight) {
      const palette = isFreightBoss
        ? { fog: 0x5b574d, top: '#374345', bottom: '#816747', near: 13, far: 90, hemi: .6, dir: .72 }
        : m.includes('infection')
          ? { fog: 0x656957, top: '#414d50', bottom: '#876f50', near: 15, far: 100, hemi: .63, dir: .76 }
          : m.includes('smog')
            ? { fog: 0x686861, top: '#424e52', bottom: '#8d7659', near: 17, far: 108, hemi: .66, dir: .8 }
            : { fog: 0x70716a, top: '#47545a', bottom: '#9b8263', near: 18, far: 118, hemi: .68, dir: .84 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isWastes) {
      const palette = isWastesBoss
        ? { fog: 0x887a68, top: '#4d5c62', bottom: '#b89666', near: 12, far: 84, hemi: .72, dir: .84 }
        : hasSand
          ? { fog: 0x97886c, top: '#5a6c70', bottom: '#c6a86f', near: 14, far: m.includes('sandstorm') ? 82 : 104, hemi: .76, dir: .9 }
          : { fog: 0x9da18e, top: '#667676', bottom: '#c8bd91', near: 18, far: 128, hemi: .8, dir: .92 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isAdZone) {
      const palette = isAdZoneBoss
        ? { fog: 0x697078, top: '#3c4652', bottom: '#b56c62', near: 16, far: 105, hemi: .64, dir: .82 }
        : isAdZoneLockdown
          ? { fog: 0x73757b, top: '#45515d', bottom: '#b97975', near: 17, far: 112, hemi: .68, dir: .86 }
          : isAdZoneSponsored
            ? { fog: 0x7e7779, top: '#4a5863', bottom: '#c58a70', near: 18, far: 120, hemi: .72, dir: .92 }
            : isAdZoneNeon
              ? { fog: 0x7a7d82, top: '#4b5c68', bottom: '#b78694', near: 18, far: 122, hemi: .72, dir: .94 }
              : { fog: 0x8d8b87, top: '#596a74', bottom: '#d0a486', near: 20, far: 132, hemi: .78, dir: 1.0 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isSanitizer) {
      const palette = isSanitizerBoss
        ? { fog: 0x687679, top: '#4b5d64', bottom: '#aebbb8', near: 15, far: 92, hemi: .62, dir: .82 }
        : isSanitizerPurge
          ? { fog: 0x879597, top: '#64767b', bottom: '#c4ceca', near: 18, far: 108, hemi: .7, dir: .92 }
          : isSanitizerLockdown
            ? { fog: 0x768487, top: '#586a70', bottom: '#b7c3c0', near: 16, far: 98, hemi: .65, dir: .86 }
            : { fog: 0x929e9d, top: '#6c7d81', bottom: '#cbd2cd', near: 20, far: 116, hemi: .76, dir: 1.0 };
      this._envTarget.fogColor = new C(palette.fog);
      this._envTarget.fogNear = palette.near; this._envTarget.fogFar = palette.far;
      this._envTarget.skyTop = new C(palette.top); this._envTarget.skyBottom = new C(palette.bottom);
      this._envTarget.hemiIntensity = palette.hemi; this._envTarget.dirIntensity = palette.dir;
    } else if (isRelayInfestationStorm) {
      this._envTarget.fogColor = new C(0x586a70);
      this._envTarget.fogNear = 11; this._envTarget.fogFar = 82;
      this._envTarget.skyTop = new C('#334653'); this._envTarget.skyBottom = new C('#957875');
      this._envTarget.hemiIntensity = .52; this._envTarget.dirIntensity = .78;
    } else if (isRelaySignalStorm) {
      this._envTarget.fogColor = new C(0x6e8790);
      this._envTarget.fogNear = 13; this._envTarget.fogFar = 92;
      this._envTarget.skyTop = new C('#435e6d'); this._envTarget.skyBottom = new C('#a3b5b2');
      this._envTarget.hemiIntensity = .58; this._envTarget.dirIntensity = .9;
    } else if (isRelayRain) {
      this._envTarget.fogColor = new C(0x81979c);
      this._envTarget.fogNear = 16; this._envTarget.fogFar = 105;
      this._envTarget.skyTop = new C('#566f7d'); this._envTarget.skyBottom = new C('#b3c0bd');
      this._envTarget.hemiIntensity = .62; this._envTarget.dirIntensity = .92;
    } else if (isRelayAlarm) {
      this._envTarget.fogColor = new C(0x8b9895);
      this._envTarget.fogNear = 17; this._envTarget.fogFar = 112;
      this._envTarget.skyTop = new C('#536a75'); this._envTarget.skyBottom = new C('#bbc1b7');
      this._envTarget.hemiIntensity = .68; this._envTarget.dirIntensity = 1.05;
    } else if (isRelayCordon) {
      this._envTarget.fogColor = new C(0x929e9b);
      this._envTarget.fogNear = 18; this._envTarget.fogFar = 118;
      this._envTarget.skyTop = new C('#617683'); this._envTarget.skyBottom = new C('#c4c8bd');
      this._envTarget.hemiIntensity = .74; this._envTarget.dirIntensity = 1.1;
    } else if (hasRain && hasFog){
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
      // Sandstorms should be thicker than generic fog
      this._envTarget.fogNear = 8; this._envTarget.fogFar = 70;
      this._envTarget.skyTop = new C('#d2b98c'); this._envTarget.skyBottom = new C('#f0e4d0');
      this._envTarget.hemiIntensity = 0.6; this._envTarget.dirIntensity = 0.55;
    } else if (hasWind) {
      this._envTarget.fogColor = new C(0xcfe8ff);
      this._envTarget.fogNear = 18; this._envTarget.fogFar = 150;
      this._envTarget.skyTop = new C('#b0e5ff'); this._envTarget.skyBottom = new C('#f1e3ff');
      this._envTarget.hemiIntensity = 0.9; this._envTarget.dirIntensity = 0.85;
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

    // Relay District uses a cool ambient base and a warm directional key.
    // Color separation supplies form even when realtime shadows are disabled.
    const relayPalette = isLastOrder
      ? { hemi: isLastOrderHeavy ? 0x927c58 : 0x8da9a6, ground: isLastOrderHeavy ? 0x3e3020 : 0x172224, dir: isLastOrderHeavy ? 0xb48650 : 0xa8d6cf }
      : isFloodgate
      ? { hemi: isFloodgateVault || isFloodgateDeluge ? 0x9bb5b2 : 0xb6c9c5, ground: 0x263435, dir: isFloodgateDeluge ? 0x9fcfd0 : 0xc3ddd5 }
      : isExpanse
      ? { hemi: isExpanseHeavy ? 0x8a846d : 0x9a967b, ground: 0x373328, dir: isExpanseHeavy ? 0xc19c64 : 0xd8b477 }
      : isCourt
      ? { hemi: 0xd4d0c5, ground: 0x34333a, dir: isCourtBoss ? 0xff9a8c : 0xffd092 }
      : isMirror
      ? { hemi: 0xcadbd7, ground: 0x303a37, dir: isMirrorBoss ? 0xf6a8eb : 0xb9f7ee }
      : isFreight
      ? { hemi: 0xc3bfa8, ground: 0x2d302b, dir: isFreightBoss ? 0xff8b63 : 0xffc37f }
      : isWastes
      ? { hemi: 0xd4c9a4, ground: 0x51452f, dir: isWastesBoss ? 0x9ee8f5 : 0xffd18a }
      : isSanitizer
      ? { hemi: 0xd2e1df, ground: 0x283436, dir: isSanitizerBoss ? 0xff9b8e : 0xbff9ef }
      : isRelayInfestationStorm
      ? { hemi: 0xa8c0c3, ground: 0x332a32, dir: 0xff9d84 }
      : isRelaySignalStorm
        ? { hemi: 0xb9d9d7, ground: 0x293a3d, dir: 0xe2ffa9 }
        : isRelayRain
          ? { hemi: 0xc3dadd, ground: 0x304046, dir: 0xffd0a3 }
          : isRelayAlarm
            ? { hemi: 0xccdedb, ground: 0x394544, dir: 0xffbd8a }
            : isRelayCordon
              ? { hemi: 0xd6e3df, ground: 0x41504e, dir: 0xffd3a1 }
              : { hemi: 0xffffff, ground: 0x4488aa, dir: 0xffffff };
    this._envTarget.hemiColor = new C(relayPalette.hemi);
    this._envTarget.hemiGroundColor = new C(relayPalette.ground);
    this._envTarget.dirColor = new C(relayPalette.dir);

    // Feed ambient weather loops
    try {
      const windMix = Math.max(this._mixTarget.fog, this._mixTarget.sand, this._mixTarget.wind);
      window._SFX?.setWeatherMix?.({ rain: this._mixTarget.rain, snow: this._mixTarget.snow, wind: windMix });
    } catch (e) { logError(e); }

    // Assign how many waves this mode should last
    this._setWaveDuration(this.mode);
    this._wavesElapsed = 0;

    // Mark transition start
    this._transitionStartTime = this.uTime.value || 0;
    if (options.immediate === true) {
      this._transitionStartTime -= this._transitionTime;
      this._updateTransition(0);
    }
  }

  update(elapsedSeconds, camera){
    this.uTime.value = elapsedSeconds;
    const dt = Math.min(0.1, Math.max(0, (this._lastTime===0?0:elapsedSeconds - this._lastTime)));
    this._lastTime = elapsedSeconds;
    // center volume to player
    const p = camera.position; this.group.position.set(p.x, 0, p.z);

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

  onWave(){
    if (this._wavesElapsed >= this._wavesDuration){
      const force = this.mode === 'clear';
      this._pickNextWeather(force);
    }
    this._wavesElapsed++;
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
    this._mix.wind = lerp01(this._mixStart?.wind ?? 0, this._mixTarget.wind, s);

    if (this.rain && this.rain.material?.uniforms?.uAlpha){ this.rain.material.uniforms.uAlpha.value = this._mix.rain; }
    if (this.snow && this.snow.material?.uniforms?.uAlpha){ this.snow.material.uniforms.uAlpha.value = this._mix.snow; }
    if (this.fog  && this.fog.material?.uniforms?.uAlpha){ this.fog.material.uniforms.uAlpha.value  = this._mix.fog; }
    if (this.sand && this.sand.material?.uniforms?.uAlpha){ this.sand.material.uniforms.uAlpha.value = this._mix.sand; }
    if (this.windPoints && this.windPoints.material?.uniforms?.uAlpha){ this.windPoints.material.uniforms.uAlpha.value = this._mix.wind; }

    if (this.rain) this.rain.visible = this._mix.rain > 0.01;
    if (this.snow) this.snow.visible = this._mix.snow > 0.01;
    if (this.fog)  this.fog.visible  = this._mix.fog  > 0.01;
    if (this.sand) this.sand.visible = this._mix.sand > 0.01;
    if (this.windPoints) this.windPoints.visible = this._mix.wind > 0.01;

    const wIntensity = Math.max(this._mix.wind, this._mix.sand);
    const wScale = 1 + wIntensity * 3.0;
    this.wind.copy(this._baseWind).multiplyScalar(wScale);

    // environment blending using eased t
    this.scene.fog.color.copy(this._envStart.fogColor).lerp(this._envTarget.fogColor, s);
    this.skyMat.uniforms.top.value.copy(this._envStart.skyTop).lerp(this._envTarget.skyTop, s);
    this.skyMat.uniforms.bottom.value.copy(this._envStart.skyBottom).lerp(this._envTarget.skyBottom, s);
    this.hemi.color.copy(this._envStart.hemiColor).lerp(this._envTarget.hemiColor, s);
    this.hemi.groundColor.copy(this._envStart.hemiGroundColor).lerp(this._envTarget.hemiGroundColor, s);
    this.dir.color.copy(this._envStart.dirColor).lerp(this._envTarget.dirColor, s);
    this.scene.fog.near = lerp01(this._envStart.fogNear, this._envTarget.fogNear, s);
    this.scene.fog.far  = lerp01(this._envStart.fogFar,  this._envTarget.fogFar,  s);
    this.hemi.intensity = lerp01(this._envStart.hemiIntensity, this._envTarget.hemiIntensity, s);
    this.dir.intensity  = lerp01(this._envStart.dirIntensity,  this._envTarget.dirIntensity,  s);
    if (this._flash <= 0) this.baseDirColor.copy(this.dir.color);
    if (this.mats && this.mats.weather){
      this.mats.weather.wetness.value = this._mix.rain;
      this.mats.weather.snow.value = this._mix.snow;
    }
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

  _pickNextWeather(forceNonClear=false){
    let target;
    do {
      const r = Math.random();
      // 41% clear, 18% rain, 8% rain+fog, 17% snow, 7% fog, 5% sandstorm, 4% windy
      target = r < 0.41 ? 'clear'
               : r < 0.59 ? 'rain'
               : r < 0.67 ? 'rain+fog'
               : r < 0.84 ? 'snow'
               : r < 0.91 ? 'fog'
               : r < 0.96 ? 'sandstorm'
               : 'windy';
    } while(forceNonClear && target === 'clear');
    this.setMode(target);
  }

  _setWaveDuration(mode){
    if (mode === 'clear'){
      this._wavesDuration = 1 + Math.floor(Math.random()*3); // 1-3 waves
    } else {
      this._wavesDuration = 1 + Math.floor(Math.random()*2); // 1-2 waves
    }
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
        setTimeout(()=>{ try{ this._playThunder(); }catch (e) { logError(e); } }, delay*1000);
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
    // Reuse a short looping noise buffer. The gain envelope supplies the
    // two-second decay without rebuilding a large buffer during gameplay.
    const buffer = getThunderNoiseBuffer(a, this._thunderNoiseCache);
    const noise = a.createBufferSource(); noise.buffer = buffer; noise.loop = true;
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
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
      uniforms:{ uTime:this.uTime, uSize:{value:1.7}, uHeight:{value:this.height}, uWind:{value:this.wind}, uArea:{value:this.areaSize}, uAlpha:{value:0.0}, uOpacity:{value:.34} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform vec3 uWind; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float halfA=0.5*uArea; float fx=position.x+uWind.x*uTime+sin(uTime*8.0+aSeed*6.283)*0.08; float fz=position.z+uWind.z*uTime+cos(uTime*6.0+aSeed*6.283)*0.08; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y-uTime*aSpeed,uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=max(0.1,-mv.z); gl_PointSize=uSize*clamp(220.0/dist,1.8,8.0); float nearFade=smoothstep(3.0,10.0,dist); float farFade=1.0-smoothstep(48.0,92.0,dist); float speedFade=clamp((aSpeed-28.0)/46.0,.32,1.0); vAlpha=nearFade*farFade*speedFade; }`,
      fragmentShader:`precision mediump float; varying float vAlpha; uniform float uAlpha; uniform float uOpacity; void main(){ vec2 pc=gl_PointCoord; float x=abs(pc.x-.5); float streak=smoothstep(.16,.035,x); float head=smoothstep(.98,.72,pc.y); float tail=smoothstep(0.0,.22,pc.y); float a=streak*head*tail*vAlpha*uAlpha*uOpacity; if(a<.012) discard; vec3 col=mix(vec3(.36,.50,.58),vec3(.66,.76,.80),pc.y); gl_FragColor=vec4(col,a);}`
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

  createWindPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms:{ uTime:this.uTime, uSize:{value:1.2}, uHeight:{value:this.height}, uWind:{value:this.wind}, uArea:{value:this.areaSize}, uAlpha:{value:0.0} },
      vertexShader: `uniform float uTime;uniform float uHeight;uniform vec3 uWind;uniform float uSize;uniform float uArea;attribute float aSeed;varying vec2 vVel;varying float vFade;void main(){vec3 pos=position;vec2 w=uWind.xz*10.5;float t=uTime+aSeed*23.17;float n1=sin((position.x*0.17+aSeed*7.0)+t*0.9);float n2=cos((position.z*0.13-aSeed*5.0)-t*1.2);vec2 noise=vec2(n1,-n2)*0.35+vec2(sin(t*1.3+aSeed*11.0),cos(t*1.1+aSeed*9.0))*0.15;vec2 vel=w+noise;vVel=vel;float halfA=0.5*uArea;float fx=position.x+vel.x*uTime;float fz=position.z+vel.y*uTime;pos.x=-halfA+mod(fx+halfA,uArea);pos.z=-halfA+mod(fz+halfA,uArea);float baseY=position.y;pos.y=clamp(baseY+sin(t*0.7)*0.1,0.0,uHeight);vec4 mv=modelViewMatrix*vec4(pos,1.0);gl_Position=projectionMatrix*mv;float dist=-mv.z;float speed=length(vel);gl_PointSize=uSize*(0.6+clamp(speed*0.25,0.0,2.0))*clamp(180.0/dist,1.0,5.0);vFade=0.45;}`,
      fragmentShader: `precision mediump float;varying vec2 vVel;varying float vFade;uniform float uAlpha;float hash(float x){return fract(sin(x)*43758.5453);}void main(){vec2 pc=gl_PointCoord-0.5;vec2 dir=normalize(vVel+1e-6);float ang=atan(dir.y,dir.x);float s=sin(ang),c=cos(ang);vec2 q=vec2(c*pc.x+s*pc.y,-s*pc.x+c*pc.y);float longAxis=0.75;float shortAxis=0.12;float d=sqrt((q.x*q.x)/(longAxis*longAxis)+(q.y*q.y)/(shortAxis*shortAxis));float core=smoothstep(1.0,0.0,d);float head=smoothstep(-0.6,0.8,q.x);float profile=core*mix(0.6,1.0,head);float n=hash(q.x*91.7+q.y*57.3);float a=profile*(0.8+0.2*n)*vFade*uAlpha;if(a<0.02)discard;vec3 col=vec3(0.45,0.40,0.35);gl_FragColor=vec4(col,a);}`
    });
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.NormalBlending;
    material.uniforms.uAlpha.value = 0.7;
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }

  createSandPoints(count){
    const THREE = this.THREE; const g = this.createBaseGeometry(count);
    const speeds = g.getAttribute('aSpeed'); for(let i=0;i<speeds.count;i++) speeds.setX(i, 1.5 + Math.random()*2.0); speeds.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      uniforms:{ uTime:this.uTime, uSize:{value:42.0}, uHeight:{value:Math.min(60, this.height)}, uArea:{value:this.areaSize}, uAlpha:{value:0.0}, uColor:{value:new THREE.Color(0xc7b38c)} },
      vertexShader:`uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uArea; attribute float aSpeed; attribute float aSeed; varying float vAlpha; void main(){ vec3 pos=position; float s=aSeed*6.283; float halfA=0.5*uArea; float fx=position.x + sin(uTime*0.15 + s)*2.0 + sin(uTime*0.32 + s*1.1)*1.5; float fz=position.z + cos(uTime*0.12 + s)*2.1 + cos(uTime*0.27 + s*0.9)*1.4; pos.x=-halfA+mod(fx+halfA,uArea); pos.z=-halfA+mod(fz+halfA,uArea); pos.y=mod(position.y + sin(uTime*0.18 + s)*0.4, uHeight); vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; float dist=max(0.001,-mv.z); gl_PointSize=uSize*clamp(180.0/dist,10.0,95.0); float base=clamp(0.2 + fract(aSeed*53.0)*0.3,0.2,0.5); float nearFade=clamp((dist-2.0)/8.0,0.0,1.0); vAlpha=base*nearFade; }`,
      fragmentShader:`precision mediump float; varying float vAlpha; uniform float uAlpha; uniform vec3 uColor; void main(){ vec2 pc=gl_PointCoord-0.5; float d2=dot(pc,pc); float soft=exp(-4.5*d2); float a=soft*vAlpha*uAlpha; if(a<0.01) discard; gl_FragColor=vec4(uColor,a); }`
    });
    const points = new THREE.Points(g, material); this.group.add(points); return points;
  }
}


