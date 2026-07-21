import { logError } from './util/log.js';
import { t } from './i18n/index.js?v=1.0.3&rev=archive-achievements4-i18n-shared1';
import { getJSON, setJSON } from './util/storage.js';

const STORAGE_KEY = 'achievements_v2';
const STORAGE_VERSION = 2;

export const CORE_WEAPONS = Object.freeze([
  'Pistol', 'SMG', 'Rifle', 'Shotgun', 'DMR', 'Minigun', 'BeamSaber'
]);

export const WEATHER_MODES = Object.freeze([
  'clear', 'rain', 'rain+fog', 'snow', 'fog', 'sandstorm', 'windy'
]);

function definition(id, badge, { hidden = false, progress = null, reward = null } = {}) {
  return {
    id,
    badge,
    icon: `assets/icons/achievements/${id}.svg?v=1.0.3&rev=archive-icons1`,
    hidden,
    reward,
    titleKey: `ach.${id}.name`,
    descKey: `ach.${id}.desc`,
    progress
  };
}

const countProgress = (read, target, label = null) => (manager) => {
  const current = Math.max(0, Number(read(manager)) || 0);
  return {
    current,
    target,
    ratio: Math.max(0, Math.min(1, current / target)),
    label: label ? label(current, target) : `${Math.min(current, target)} / ${target}`,
    completedLabel: label ? label(target, target) : `${target} / ${target}`
  };
};

const unlockedProgress = (id) => (manager) => ({
  current: manager.unlocked.has(id) ? 1 : 0,
  target: 1,
  ratio: manager.unlocked.has(id) ? 1 : 0,
  label: manager.unlocked.has(id) ? '1 / 1' : '0 / 1'
});

const fastestProgress = (read, target) => (manager) => {
  const rawBest = read(manager);
  const best = rawBest == null ? NaN : Number(rawBest);
  const unlocked = Number.isFinite(best) && best <= target;
  return {
    current: Number.isFinite(best) ? best : 0,
    target,
    ratio: unlocked ? 1 : (Number.isFinite(best) && best > 0 ? Math.min(.99, target / best) : 0),
    label: Number.isFinite(best) ? `${best.toFixed(1)}s / <${target}s` : `— / <${target}s`
  };
};

export const ACHIEVEMENT_DEFINITIONS = [
  // Enemy defeats
  definition('firstBlood', 'K1', { progress: countProgress(m => m.career.kills, 1) }),
  definition('monsterHunter', 'K100', { progress: countProgress(m => m.career.kills, 100) }),
  definition('massUnfollow', 'K5K', { progress: countProgress(m => m.career.kills, 5000) }),

  // Score
  definition('rookieScore', '1K', { progress: countProgress(m => m.run.score, 1000) }),
  definition('veteranScore', '10K', { progress: countProgress(m => m.run.score, 10000) }),
  definition('primeTime', '1M', { progress: countProgress(m => m.career.score, 1000000) }),

  // Wave and survival milestones
  definition('waveBeginner', 'W1', { progress: countProgress(m => m.run.completedWaves, 1) }),
  definition('waveMaster', 'W10', { progress: countProgress(m => m.run.highestWave, 10) }),
  definition('stillBroadcasting', 'W20', { progress: countProgress(m => m.run.highestWave, 20) }),
  definition('survivor', '15M', { progress: countProgress(m => m.run.time, 900, (c, target) => `${Math.floor(c / 60)}m / ${target / 60}m`) }),
  definition('speedRunner', '<30', { progress: fastestProgress(m => m.career.fastestWave, 30) }),
  definition('rapidResponse', '<20', { progress: fastestProgress(m => m.career.fastestNonBossWave, 20) }),
  definition('cleanFeed', '0HP', { progress: unlockedProgress('cleanFeed') }),

  // Pickups
  definition('collector', 'P10', { progress: countProgress(m => m.career.pickups, 10) }),
  definition('streetSweeper', 'P25', { progress: countProgress(m => m.career.pickups, 25) }),
  definition('contentHoarder', 'P1K', { progress: countProgress(m => m.career.pickups, 1000) }),
  definition('adFreeExperience', '0PK', { hidden: true, progress: countProgress(m => m.run.noPickupStreak, 5) }),

  // Shots and reloads
  definition('arsenal', 'S500', { progress: countProgress(m => m.career.shots, 500) }),
  definition('endlessBarrage', 'S50K', { progress: countProgress(m => m.career.shots, 50000) }),
  definition('noTimeToBuffer', 'NR', { hidden: true, progress: unlockedProgress('noTimeToBuffer') }),

  // Death and damage
  definition('firstCancellation', 'D1', { progress: countProgress(m => m.career.deaths, 1) }),
  definition('unkillableIsh', 'D200', { progress: countProgress(m => m.career.deaths, 200) }),
  definition('damageControl', 'HP10K', { progress: countProgress(m => m.career.damageTaken, 10000) }),
  definition('engagementBait', '≤25', { hidden: true, progress: unlockedProgress('engagementBait') }),

  // Combo and precision
  definition('goingViral', '×2', { progress: countProgress(m => m.run.maxComboTier, 3) }),
  definition('headlineMaterial', 'H10', { progress: countProgress(m => m.wave.headshotKills, 10) }),
  definition('hotMic', 'K15', { progress: countProgress(m => m.run.hotMicKills, 15) }),

  // Bosses
  definition('breakTheBureau', 'B01', { progress: unlockedProgress('breakTheBureau') }),
  definition('untouchable', 'B0', { progress: unlockedProgress('untouchable') }),
  definition('factChecker', 'HYD', { progress: unlockedProgress('factChecker') }),
  definition('threePartExpose', 'B×3', { progress: countProgress(m => m.run.bossKills, 3) }),
  definition('cleanSweep', 'B3/0', { progress: countProgress(m => m.run.flawlessBossWaves.size, 3) }),
  definition('hostileTakeover', 'B15', {
    progress: unlockedProgress('hostileTakeover'),
    reward: Object.freeze({ type: 'weapon', weaponId: 'grenade' })
  }),

  // Weapons
  definition('termsOfEngagement', '5W', { hidden: true, progress: countProgress(m => m.run.weaponOnlyStreaks.BeamSaber, 5) }),
  definition('termsAndConditionsApply', '10W', { hidden: true, progress: countProgress(m => m.run.weaponOnlyStreaks.Shotgun, 10) }),
  definition('lastWord', '01', { hidden: true, progress: unlockedProgress('lastWord') }),
  definition('cutTheFeed', 'S25', { progress: countProgress(m => m.career.weaponKills.BeamSaber, 25) }),
  definition('replyAll', '×3', { progress: countProgress(m => m.run.maxShotgunAttackKills, 3) }),
  definition('fullSpectrum', '7/7', { hidden: true, progress: countProgress(m => m.career.weaponsUsed.size, 7) }),
  definition('defaultSettings', '5W', { hidden: true, progress: countProgress(m => m.run.pistolOnlyWaves.size, 5) }),
  definition('omnichannel', '7×50', { progress: countProgress(m => CORE_WEAPONS.filter(w => m.career.weaponKills[w] >= 50).length, 7) }),
  definition('remoteWork', '25m', { progress: unlockedProgress('remoteWork') }),
  definition('algorithmicBoost', '10/5', { progress: countProgress(m => m.run.minigunKillTimes.length, 10) }),

  // Abilities
  definition('executiveFunction', 'Q×5', { progress: countProgress(m => m.run.maxAbilityAttackKills, 5) }),
  definition('appliedResearch', 'Q25', { progress: countProgress(m => m.career.abilityKills, 25) }),
  definition('controlledDemolition', 'Q100', {
    progress: countProgress(m => m.career.abilityKills, 100),
    reward: Object.freeze({ type: 'weapon', weaponId: 'grenade' })
  }),
  definition('baitAndSwitch', 'B8', { progress: countProgress(m => m.run.maxBaitAffected, 8) }),
  definition('eventHorizon', 'G8', { progress: countProgress(m => m.run.maxGravityWellAttackKills, 8) }),
  definition('specialDelivery', 'HP25', { progress: unlockedProgress('specialDelivery') }),

  // World mastery
  definition('allWeatherAudience', 'WX', { progress: countProgress(m => m.career.weatherClears.size, 7) }),

  // Punchline Archive
  definition('openTheFiles', 'OPEN', { progress: countProgress(m => m.career.archiveVisits, 1) }),
  definition('paperTrail', 'A3', { progress: countProgress(m => m.career.archivePurchases, 3) }),
  definition('masterCopy', 'GIII', { progress: countProgress(m => m.career.archiveMaxGrade, 3) }),
  definition('fragmented', '◆25', { progress: countProgress(m => m.career.archiveFragmentsEarned, 25) }),
  definition('archiveAuthority', 'A5', { progress: countProgress(m => m.career.archiveCategoriesOwned.size, 5) }),
  definition('fullClearance', 'C3', { progress: countProgress(m => m.career.classifiedWeaponsOwned, 3) }),
  definition('finalDraft', 'MAX5', { progress: countProgress(m => m.career.maxedArchiveUpgrades, 5) }),
  definition('blackBudget', '◆120', {
    progress: countProgress(m => m.career.archiveFragmentsSpent, 120),
    reward: Object.freeze({ type: 'weapon', weaponId: 'grenade' })
  })
];

function emptyWeaponCounts() {
  return Object.fromEntries(CORE_WEAPONS.map(name => [name, 0]));
}

function emptyCareer() {
  return {
    kills: 0,
    score: 0,
    pickups: 0,
    shots: 0,
    deaths: 0,
    damageTaken: 0,
    headshotKills: 0,
    weaponKills: emptyWeaponCounts(),
    weaponsUsed: new Set(),
    weatherClears: new Set(),
    bossesDefeated: new Set(),
    fastestWave: null,
    fastestNonBossWave: null,
    archiveVisits: 0,
    archivePurchases: 0,
    archiveFragmentsSpent: 0,
    archiveMaxGrade: 0,
    archiveFragmentsEarned: 0,
    abilityKills: 0,
    archiveCategoriesOwned: new Set(),
    classifiedWeaponsOwned: 0,
    maxedArchiveUpgrades: 0
  };
}

function emptyWave() {
  return {
    active: false,
    number: 0,
    startHp: 100,
    weather: 'clear',
    isBoss: false,
    damageTaken: 0,
    healed: 0,
    reloads: 0,
    pickups: 0,
    shots: 0,
    ammoShots: 0,
    kills: 0,
    headshotKills: 0,
    damageWeapons: new Set()
  };
}

function emptyRun() {
  return {
    active: false,
    mode: null,
    score: 0,
    time: 0,
    highestWave: 0,
    completedWaves: 0,
    maxComboTier: 0,
    maxComboActive: false,
    hotMicKills: 0,
    bossKills: 0,
    weaponOnlyStreaks: { BeamSaber: 0, Shotgun: 0 },
    pistolOnlyWaves: new Set(),
    defaultSettingsValid: true,
    noPickupStreak: 0,
    minigunKillTimes: [],
    hydraMaxGeneration: 0,
    attackKills: new Map(),
    maxShotgunAttackKills: 0,
    abilityAttackKills: new Map(),
    maxAbilityAttackKills: 0,
    maxGravityWellAttackKills: 0,
    maxBaitAffected: 0,
    flawlessBossWaves: new Set()
  };
}

function hydrateCareer(raw = {}) {
  const career = emptyCareer();
  career.kills = Math.max(0, Number(raw.kills) || 0);
  career.score = Math.max(0, Number(raw.score) || 0);
  career.pickups = Math.max(0, Number(raw.pickups) || 0);
  career.shots = Math.max(0, Number(raw.shots) || 0);
  career.deaths = Math.max(0, Number(raw.deaths) || 0);
  career.damageTaken = Math.max(0, Number(raw.damageTaken) || 0);
  career.headshotKills = Math.max(0, Number(raw.headshotKills) || 0);
  for (const weapon of CORE_WEAPONS) career.weaponKills[weapon] = Math.max(0, Number(raw.weaponKills?.[weapon]) || 0);
  career.weaponsUsed = new Set(Array.isArray(raw.weaponsUsed) ? raw.weaponsUsed.filter(w => CORE_WEAPONS.includes(w)) : []);
  career.weatherClears = new Set(Array.isArray(raw.weatherClears) ? raw.weatherClears.filter(w => WEATHER_MODES.includes(w)) : []);
  career.bossesDefeated = new Set(Array.isArray(raw.bossesDefeated) ? raw.bossesDefeated : []);
  career.fastestWave = raw.fastestWave != null && Number.isFinite(Number(raw.fastestWave)) ? Number(raw.fastestWave) : null;
  career.fastestNonBossWave = raw.fastestNonBossWave != null && Number.isFinite(Number(raw.fastestNonBossWave)) ? Number(raw.fastestNonBossWave) : null;
  career.archiveVisits = Math.max(0, Number(raw.archiveVisits) || 0);
  career.archivePurchases = Math.max(0, Number(raw.archivePurchases) || 0);
  career.archiveFragmentsSpent = Math.max(0, Number(raw.archiveFragmentsSpent) || 0);
  career.archiveMaxGrade = Math.max(0, Number(raw.archiveMaxGrade) || 0);
  career.archiveFragmentsEarned = Math.max(0, Number(raw.archiveFragmentsEarned) || 0);
  career.abilityKills = Math.max(0, Number(raw.abilityKills) || 0);
  career.archiveCategoriesOwned = new Set(Array.isArray(raw.archiveCategoriesOwned) ? raw.archiveCategoriesOwned : []);
  career.classifiedWeaponsOwned = Math.max(0, Number(raw.classifiedWeaponsOwned) || 0);
  career.maxedArchiveUpgrades = Math.max(0, Number(raw.maxedArchiveUpgrades) || 0);
  return career;
}

function serialiseCareer(career) {
  return {
    ...career,
    weaponsUsed: [...career.weaponsUsed],
    weatherClears: [...career.weatherClears],
    bossesDefeated: [...career.bossesDefeated],
    archiveCategoriesOwned: [...career.archiveCategoriesOwned]
  };
}

export function showAchievement({ title, description, badge, icon }) {
  const container = globalThis.document?.getElementById?.('achievements');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'achievement';

  const badgeEl = document.createElement('div');
  badgeEl.className = 'achievement-badge';
  if (icon) {
    const iconEl = document.createElement('img');
    iconEl.className = 'achievement-icon';
    iconEl.src = icon;
    iconEl.alt = '';
    badgeEl.appendChild(iconEl);
  } else {
    badgeEl.textContent = badge || 'NEW';
  }

  const text = document.createElement('div');
  text.className = 'achievement-copy';
  const kicker = document.createElement('div');
  kicker.className = 'achievement-kicker';
  kicker.textContent = t('achievements.unlocked');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = title;
  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = description;
  text.append(kicker, name, desc);
  el.append(badgeEl, text);
  container.prepend(el);

  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4000);
}

export class AchievementsManager {
  constructor({ onUnlock, storageKey = STORAGE_KEY } = {}) {
    this.onUnlock = onUnlock || showAchievement;
    this.storageKey = storageKey;
    this.achievements = ACHIEVEMENT_DEFINITIONS;
    this.unlocked = new Set();
    this.career = emptyCareer();
    this.run = emptyRun();
    this.wave = emptyWave();
    this.bossFight = null;
    this.load();
  }

  load() {
    const data = getJSON(this.storageKey, null);
    if (!data || data.version !== STORAGE_VERSION || !Array.isArray(data.unlocked)) return;
    this.unlocked = new Set(data.unlocked.filter(id => this.achievements.some(a => a.id === id)));
    this.career = hydrateCareer(data.career);
  }

  save() {
    setJSON(this.storageKey, {
      version: STORAGE_VERSION,
      unlocked: [...this.unlocked],
      career: serialiseCareer(this.career)
    });
  }

  startRun({ mode = 'standard' } = {}) {
    this.save();
    this.run = emptyRun();
    this.wave = emptyWave();
    this.bossFight = null;
    this.run.mode = mode;
    this.run.active = mode === 'standard';
  }

  getCollection() {
    return this.achievements.map((achievement) => {
      const unlocked = this.unlocked.has(achievement.id);
      const redacted = achievement.hidden && !unlocked;
      let progress = redacted ? null : achievement.progress?.(this) || null;
      if (unlocked && progress && progress.ratio < 1) {
        progress = {
          ...progress,
          current: progress.target,
          ratio: 1,
          label: progress.completedLabel || `${progress.target} / ${progress.target}`
        };
      }
      return {
        id: achievement.id,
        badge: redacted ? '???' : achievement.badge,
        icon: redacted
          ? 'assets/icons/achievements/secret.svg?v=1.0.3&rev=archive-icons1'
          : achievement.icon,
        title: t(redacted ? 'achievements.secret.name' : achievement.titleKey),
        description: t(redacted ? 'achievements.secret.desc' : achievement.descKey),
        hidden: achievement.hidden,
        reward: achievement.reward,
        unlocked,
        progressCurrent: progress?.current ?? null,
        progressTarget: progress?.target ?? null,
        progressRatio: progress?.ratio ?? null,
        progressLabel: progress?.label ?? null
      };
    });
  }

  getUnlockedRewards() {
    return this.achievements
      .filter(achievement => achievement.reward && this.unlocked.has(achievement.id))
      .map(achievement => ({ achievementId: achievement.id, ...achievement.reward }));
  }

  unlock(id) {
    if (this.unlocked.has(id)) return false;
    const achievement = this.achievements.find(a => a.id === id);
    if (!achievement) return false;
    this.unlocked.add(id);
    this.save();
    const payload = {
      id,
      badge: achievement.badge,
      icon: achievement.icon,
      title: t(achievement.titleKey),
      description: t(achievement.descKey)
    };
    if (achievement.reward) payload.reward = achievement.reward;
    try { this.onUnlock?.(payload); } catch (error) { logError(error); }
    if (typeof globalThis.CustomEvent === 'function') {
      try { globalThis.document?.dispatchEvent?.(new CustomEvent('achievementUnlocked', { detail: payload })); }
      catch (error) { logError(error); }
    }
    return true;
  }

  check(event = {}) {
    if (event.type === 'runStart') {
      this.startRun(event);
      return;
    }
    if (event.source === 'debug') return;
    if (event.type === 'archiveOpen') {
      this.career.archiveVisits += 1;
      this._evaluateCounters();
      this.save();
      return;
    }
    if (event.type === 'archivePurchase') {
      this.career.archivePurchases += 1;
      if (event.category !== 'classified') {
        this.career.archiveFragmentsSpent += Math.max(0, Math.floor(Number(event.cost) || 0));
      }
      this.career.archiveMaxGrade = Math.max(this.career.archiveMaxGrade, Math.max(0, Math.floor(Number(event.grade) || 0)));
      this._evaluateCounters();
      this.save();
      return;
    }
    if (event.type === 'archiveFragmentsEarned') {
      this.career.archiveFragmentsEarned += Math.max(0, Math.floor(Number(event.amount) || 0));
      this._evaluateCounters();
      this.save();
      return;
    }
    if (event.type === 'archiveState') {
      this.career.archiveCategoriesOwned = new Set(Array.isArray(event.categoriesOwned) ? event.categoriesOwned : []);
      this.career.classifiedWeaponsOwned = Math.max(0, Math.floor(Number(event.classifiedWeaponsOwned) || 0));
      this.career.maxedArchiveUpgrades = Math.max(0, Math.floor(Number(event.maxedUpgrades) || 0));
      this._evaluateCounters();
      this.save();
      return;
    }
    if (!this.run.active) return;

    switch (event.type) {
      case 'score':
        {
          const amount = Math.max(0, Number(event.amount) || 0);
          this.run.score += amount;
          this.career.score += amount;
          this.save();
        }
        break;
      case 'time':
        this.run.time += Math.max(0, Number(event.delta) || 0);
        break;
      case 'wave':
      case 'waveStart':
        this._startWave(event);
        break;
      case 'waveComplete':
        this._completeWave(event);
        break;
      case 'shot':
        this._recordShot(event);
        break;
      case 'combatHit':
        this._recordCombat(event);
        break;
      case 'playerDamaged':
        this._recordDamage(event);
        break;
      case 'playerDied':
        this.career.deaths += 1;
        this.save();
        break;
      case 'pickup':
        this._recordPickup(event);
        break;
      case 'reload':
        if (this.wave.active) this.wave.reloads += 1;
        break;
      case 'combo':
      case 'comboTier':
        this._recordCombo(event);
        break;
      case 'engagementBaitAffected':
        this.run.maxBaitAffected = Math.max(this.run.maxBaitAffected, Math.max(0, Math.floor(Number(event.count) || 0)));
        if (this.run.maxBaitAffected >= 8) this.unlock('baitAndSwitch');
        break;
      case 'supplyDropOpened':
        if (Number(event.hp) <= 25) this.unlock('specialDelivery');
        break;
      case 'bossStart':
        this.bossFight = {
          id: event.bossId || event.bossType || 'boss',
          wave: Number(event.wave) || this.wave.number,
          damageTaken: 0,
          maxGeneration: Math.max(0, Number(event.maxGeneration) || 0)
        };
        break;
      case 'hydraGeneration':
        this.run.hydraMaxGeneration = Math.max(this.run.hydraMaxGeneration, Number(event.generation) || 0);
        if (this.bossFight) this.bossFight.maxGeneration = Math.max(this.bossFight.maxGeneration, Number(event.generation) || 0);
        break;
      case 'bossDefeated':
        this._recordBossDefeat(event);
        break;
      default:
        break;
    }

    this._evaluateCounters();
  }

  _startWave(event) {
    this.wave = emptyWave();
    this.wave.active = true;
    this.wave.number = Math.max(1, Number(event.number) || 1);
    this.wave.startHp = Math.max(0, Number(event.startHp ?? event.hp) || 0);
    this.wave.weather = WEATHER_MODES.includes(event.weather) ? event.weather : 'clear';
    this.wave.isBoss = event.isBoss === true || this.wave.number % 5 === 0;
    this.run.highestWave = Math.max(this.run.highestWave, this.wave.number);
  }

  _completeWave(event) {
    const hadActiveWave = this.wave.active;
    const wave = hadActiveWave ? this.wave : emptyWave();
    const number = Math.max(1, Number(event.number) || wave.number || 1);
    const duration = Math.max(0, Number(event.duration ?? event.time) || 0);
    const isBoss = event.isBoss ?? wave.isBoss;
    this.run.completedWaves = Math.max(this.run.completedWaves, number);

    if (number >= 1) this.unlock('waveBeginner');
    if (duration > 0 && (this.career.fastestWave == null || duration < this.career.fastestWave)) this.career.fastestWave = duration;
    if (!isBoss && duration > 0 && (this.career.fastestNonBossWave == null || duration < this.career.fastestNonBossWave)) this.career.fastestNonBossWave = duration;
    if (duration > 0 && duration <= 30) this.unlock('speedRunner');
    if (!isBoss && duration > 0 && duration < 20) this.unlock('rapidResponse');
    if (hadActiveWave && wave.damageTaken <= 0) this.unlock('cleanFeed');
    if (hadActiveWave && wave.headshotKills >= 10) this.unlock('headlineMaterial');
    if (hadActiveWave && wave.reloads === 0 && wave.ammoShots > 0) this.unlock('noTimeToBuffer');
    if (hadActiveWave && wave.startHp <= 25 && wave.healed <= 0) this.unlock('engagementBait');

    const onlyWeapon = wave.damageWeapons.size === 1 ? [...wave.damageWeapons][0] : null;
    for (const weapon of ['BeamSaber', 'Shotgun']) {
      this.run.weaponOnlyStreaks[weapon] = onlyWeapon === weapon ? this.run.weaponOnlyStreaks[weapon] + 1 : 0;
    }
    if (this.run.weaponOnlyStreaks.BeamSaber >= 5) this.unlock('termsOfEngagement');
    if (this.run.weaponOnlyStreaks.Shotgun >= 10) this.unlock('termsAndConditionsApply');

    if (number <= 5) {
      if (onlyWeapon === 'Pistol') this.run.pistolOnlyWaves.add(number);
      else this.run.defaultSettingsValid = false;
      if (number === 5 && this.run.defaultSettingsValid && this.run.pistolOnlyWaves.size === 5) this.unlock('defaultSettings');
    }

    this.run.noPickupStreak = wave.pickups === 0 ? this.run.noPickupStreak + 1 : 0;
    if (this.run.noPickupStreak >= 5) this.unlock('adFreeExperience');

    if (WEATHER_MODES.includes(wave.weather)) this.career.weatherClears.add(wave.weather);
    if (number === 30 && this.run.hydraMaxGeneration < 3) this.unlock('factChecker');
    this.save();
    this.wave.active = false;
  }

  _recordShot(event) {
    const weapon = String(event.weapon || '');
    this.career.shots += Math.max(1, Number(event.count) || 1);
    const weaponWasNew = CORE_WEAPONS.includes(weapon) && !this.career.weaponsUsed.has(weapon);
    if (CORE_WEAPONS.includes(weapon)) this.career.weaponsUsed.add(weapon);
    if (this.wave.active) {
      this.wave.shots += 1;
      if (weapon && weapon !== 'BeamSaber') this.wave.ammoShots += 1;
    }
    if (weaponWasNew || this.career.shots % 25 === 0) this.save();
  }

  _recordCombat(event) {
    const weapon = String(event.weapon || 'Unknown');
    const damage = Math.max(0, Number(event.damage) || 0);
    if (String(event.targetType || '').includes('hydra')) {
      this.run.hydraMaxGeneration = Math.max(this.run.hydraMaxGeneration, Number(event.generation) || 0);
    }
    if (damage > 0 && this.wave.active) this.wave.damageWeapons.add(weapon);
    if (!event.killed) return;

    this.career.kills += 1;
    if (CORE_WEAPONS.includes(weapon)) this.career.weaponKills[weapon] += 1;
    if (this.wave.active) {
      this.wave.kills += 1;
      if (event.isHead) this.wave.headshotKills += 1;
    }
    if (event.isHead) this.career.headshotKills += 1;

    if (weapon !== 'BeamSaber' && event.remainingBefore === 1 && event.magazineRemaining === 0) this.unlock('lastWord');
    if (weapon === 'DMR' && event.isHead && Number(event.distance) >= 25) this.unlock('remoteWork');

    if (weapon === 'Shotgun' && event.attackId != null) {
      const key = String(event.attackId);
      const killedTargets = this.run.attackKills.get(key) || new Set();
      killedTargets.add(String(event.targetId ?? event.targetType ?? killedTargets.size));
      this.run.attackKills.set(key, killedTargets);
      this.run.maxShotgunAttackKills = Math.max(this.run.maxShotgunAttackKills, killedTargets.size);
      if (killedTargets.size >= 3) this.unlock('replyAll');
    }

    if (weapon.startsWith('Ability:') && event.attackId != null) {
      this.career.abilityKills += 1;
      const key = String(event.attackId);
      const killedTargets = this.run.abilityAttackKills.get(key) || new Set();
      killedTargets.add(String(event.targetId ?? `${key}:${killedTargets.size}`));
      this.run.abilityAttackKills.set(key, killedTargets);
      this.run.maxAbilityAttackKills = Math.max(this.run.maxAbilityAttackKills, killedTargets.size);
      if (killedTargets.size >= 5) this.unlock('executiveFunction');
      if (weapon === 'Ability:gravity_well') {
        this.run.maxGravityWellAttackKills = Math.max(this.run.maxGravityWellAttackKills, killedTargets.size);
        if (killedTargets.size >= 8) this.unlock('eventHorizon');
      }
    }

    if (this.run.maxComboActive) {
      this.run.hotMicKills += 1;
      if (this.run.hotMicKills >= 15) this.unlock('hotMic');
    }

    if (weapon === 'Minigun') {
      const now = Math.max(0, Number(event.gameTime ?? event.at) || this.run.time);
      this.run.minigunKillTimes.push(now);
      this.run.minigunKillTimes = this.run.minigunKillTimes.filter(time => now - time <= 5);
      if (this.run.minigunKillTimes.length >= 10) this.unlock('algorithmicBoost');
    }
    this.save();
  }

  _recordDamage(event) {
    const amount = Math.max(0, Number(event.amount) || 0);
    this.career.damageTaken += amount;
    if (this.wave.active) this.wave.damageTaken += amount;
    if (this.bossFight) this.bossFight.damageTaken += amount;
    this.save();
  }

  _recordPickup(event) {
    this.career.pickups += 1;
    if (this.wave.active) {
      this.wave.pickups += 1;
      this.wave.healed += Math.max(0, Number(event.healAmount) || 0);
    }
    this.save();
  }

  _recordCombo(event) {
    const tier = Math.max(0, Number(event.tier) || 0);
    this.run.maxComboTier = Math.max(this.run.maxComboTier, tier);
    if (tier >= 3 && !this.run.maxComboActive) {
      this.run.maxComboActive = true;
      this.run.hotMicKills = 0;
    } else if (tier < 3 && this.run.maxComboActive) {
      this.run.maxComboActive = false;
      this.run.hotMicKills = 0;
    }
  }

  _recordBossDefeat(event) {
    const fight = this.bossFight || { damageTaken: Infinity, maxGeneration: Infinity, wave: 0, id: 'boss' };
    const wave = Number(event.wave) || fight.wave;
    const id = event.bossId || event.bossType || fight.id;
    this.run.bossKills += 1;
    this.career.bossesDefeated.add(id);
    if (wave === 5) this.unlock('breakTheBureau');
    if (fight.damageTaken <= 0) this.unlock('untouchable');
    if ([5, 10, 15].includes(wave) && fight.damageTaken <= 0) this.run.flawlessBossWaves.add(wave);
    if (this.run.flawlessBossWaves.size >= 3) this.unlock('cleanSweep');
    if (wave === 15 && fight.damageTaken <= 0) this.unlock('hostileTakeover');
    if (this.run.bossKills >= 3) this.unlock('threePartExpose');
    this.bossFight = null;
    this.save();
  }

  _evaluateCounters() {
    if (this.career.kills >= 1) this.unlock('firstBlood');
    if (this.career.kills >= 100) this.unlock('monsterHunter');
    if (this.run.score >= 1000) this.unlock('rookieScore');
    if (this.run.score >= 10000) this.unlock('veteranScore');
    if (this.career.score >= 1000000) this.unlock('primeTime');
    if (this.run.highestWave >= 10) this.unlock('waveMaster');
    if (this.run.highestWave >= 20) this.unlock('stillBroadcasting');
    if (this.career.pickups >= 10) this.unlock('collector');
    if (this.career.pickups >= 25) this.unlock('streetSweeper');
    if (this.career.shots >= 500) this.unlock('arsenal');
    if (this.career.kills >= 5000) this.unlock('massUnfollow');
    if (this.career.pickups >= 1000) this.unlock('contentHoarder');
    if (this.career.shots >= 50000) this.unlock('endlessBarrage');
    if (this.career.deaths >= 1) this.unlock('firstCancellation');
    if (this.career.deaths >= 200) this.unlock('unkillableIsh');
    if (this.career.damageTaken >= 10000) this.unlock('damageControl');
    if (this.run.time >= 900) this.unlock('survivor');
    if (this.run.maxComboTier >= 3) this.unlock('goingViral');
    if (this.career.weaponKills.BeamSaber >= 25) this.unlock('cutTheFeed');
    if (this.career.weaponsUsed.size >= CORE_WEAPONS.length) this.unlock('fullSpectrum');
    if (this.career.weatherClears.size >= WEATHER_MODES.length) this.unlock('allWeatherAudience');
    if (CORE_WEAPONS.every(weapon => this.career.weaponKills[weapon] >= 50)) this.unlock('omnichannel');
    if (this.career.archiveVisits >= 1) this.unlock('openTheFiles');
    if (this.career.archivePurchases >= 3) this.unlock('paperTrail');
    if (this.career.archiveMaxGrade >= 3) this.unlock('masterCopy');
    if (this.career.archiveFragmentsEarned >= 25) this.unlock('fragmented');
    if (this.career.archiveFragmentsSpent >= 120) this.unlock('blackBudget');
    if (this.career.abilityKills >= 25) this.unlock('appliedResearch');
    if (this.career.abilityKills >= 100) this.unlock('controlledDemolition');
    if (this.career.archiveCategoriesOwned.size >= 5) this.unlock('archiveAuthority');
    if (this.career.classifiedWeaponsOwned >= 3) this.unlock('fullClearance');
    if (this.career.maxedArchiveUpgrades >= 5) this.unlock('finalDraft');
  }

  reset() {
    this.unlocked.clear();
    this.career = emptyCareer();
    this.run = emptyRun();
    this.wave = emptyWave();
    this.bossFight = null;
    this.save();
  }
}
