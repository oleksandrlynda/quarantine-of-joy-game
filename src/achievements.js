import { logError } from './util/log.js';
import { t } from './i18n/index.js';

const STORAGE_KEY = 'achievements';

export const ACHIEVEMENT_DEFINITIONS = [
  {
    id: 'firstBlood',
    titleKey: 'ach.firstBlood.name',
    descKey: 'ach.firstBlood.desc',
    condition: (p) => p.kills >= 1,
  },
  {
    id: 'monsterHunter',
    titleKey: 'ach.monsterHunter.name',
    descKey: 'ach.monsterHunter.desc',
    condition: (p) => p.kills >= 100,
  },
  {
    id: 'rookieScore',
    titleKey: 'ach.rookieScore.name',
    descKey: 'ach.rookieScore.desc',
    condition: (p) => p.score >= 1000,
  },
  {
    id: 'veteranScore',
    titleKey: 'ach.veteranScore.name',
    descKey: 'ach.veteranScore.desc',
    condition: (p) => p.score >= 10000,
  },
  {
    id: 'waveBeginner',
    titleKey: 'ach.waveBeginner.name',
    descKey: 'ach.waveBeginner.desc',
    condition: (p) => p.wave >= 1,
  },
  {
    id: 'waveMaster',
    titleKey: 'ach.waveMaster.name',
    descKey: 'ach.waveMaster.desc',
    condition: (p) => p.wave >= 10,
  },
  {
    id: 'collector',
    titleKey: 'ach.collector.name',
    descKey: 'ach.collector.desc',
    condition: (p) => p.pickups >= 10,
  },
  {
    id: 'arsenal',
    titleKey: 'ach.arsenal.name',
    descKey: 'ach.arsenal.desc',
    condition: (p) => p.shots >= 500,
  },
  {
    id: 'speedRunner',
    titleKey: 'ach.speedRunner.name',
    descKey: 'ach.speedRunner.desc',
    condition: (p) => p.fastestWave !== undefined && p.fastestWave <= 30,
  },
  {
    id: 'survivor',
    titleKey: 'ach.survivor.name',
    descKey: 'ach.survivor.desc',
    condition: (p) => p.time >= 900,
  },
];

export function showAchievement({ title, description }) {
  const container = document.getElementById('achievements');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'achievement';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '🏆';

  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = title;
  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = description;
  text.appendChild(name);
  text.appendChild(desc);

  el.appendChild(icon);
  el.appendChild(text);
  container.prepend(el);

  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4000); // auto-hide after 4s so HUD stays visible
}

export class AchievementsManager {
  constructor({ onUnlock } = {}) {
    this.onUnlock = onUnlock || showAchievement;
    this.achievements = ACHIEVEMENT_DEFINITIONS;
    this.unlocked = new Set();
    this.progress = {};
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const id of data) {
            this.unlocked.add(id);
          }
        }
      }
    } catch (e) {
      logError(e);
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.unlocked]));
    } catch (e) {
      logError(e);
    }
  }

  unlock(id) {
    if (this.unlocked.has(id)) return;
    const achievement = this.achievements.find((a) => a.id === id);
    if (!achievement) return;
    this.unlocked.add(id);
    this.save();
    const payload = {
      id: achievement.id,
      title: t(achievement.titleKey),
      description: t(achievement.descKey),
    };
    if (typeof this.onUnlock === 'function') {
      try {
        this.onUnlock(payload);
      } catch (e) {
        logError(e);
      }
    }
    document.dispatchEvent(new CustomEvent('achievementUnlocked', { detail: payload }));
  }

  check(event = {}) {
    // Update tracked progress
    switch (event.type) {
      case 'kill':
        this.progress.kills = (this.progress.kills || 0) + (event.count || 1);
        break;
      case 'score':
        this.progress.score = (this.progress.score || 0) + (event.amount || 0);
        break;
      case 'wave':
        this.progress.wave = Math.max(this.progress.wave || 0, event.number || 0);
        break;
      case 'pickup':
        this.progress.pickups = (this.progress.pickups || 0) + 1;
        break;
      case 'shot':
        this.progress.shots = (this.progress.shots || 0) + 1;
        break;
      case 'time':
        this.progress.time = (this.progress.time || 0) + (event.delta || 0);
        break;
      case 'waveComplete':
        if (event.time !== undefined && (this.progress.fastestWave === undefined || event.time < this.progress.fastestWave)) {
          this.progress.fastestWave = event.time;
        }
        break;
      default:
        break;
    }

    for (const a of this.achievements) {
      if (this.unlocked.has(a.id)) continue;
      try {
        if (a.condition(this.progress, event)) {
          this.unlock(a.id);
        }
      } catch (e) {
        logError(e);
      }
    }
  }

  reset() {
    this.unlocked.clear();
    this.save();
  }
}

