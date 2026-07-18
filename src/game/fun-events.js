export const CONFETTI_ELIMINATION_CADENCE = 10;
export const ALGORITHM_ROULETTE_UPWARD_Y = 0.82;
export const ALGORITHM_ROULETTE_SHOT_CADENCE = 7;
export const ALGORITHM_ROULETTE_PROFILES = Object.freeze({
  1: Object.freeze({ winChance: 0.51, winHealth: 5, lossHealth: 7 }),
  2: Object.freeze({ winChance: 0.52, winHealth: 6, lossHealth: 6 })
});
export const OPENING_ACT_COMBO_HOLD_SECONDS = 3;
export const FINAL_CUT_STAMINA_RESTORE = 10;

export class StagecraftDeaths {
  reset() {
    this.wave = null;
    this.eliminations = 0;
  }

  constructor() {
    this.reset();
  }

  recordElimination({
    wave,
    openingGrade = 0,
    finalGrade = 0,
    lastEnemy = false,
    regularWave = false,
    boss = false,
    tutorial = false
  } = {}) {
    const currentWave = Math.max(0, Math.floor(Number(wave) || 0));
    const opening = Math.min(2, Math.max(0, Math.floor(Number(openingGrade) || 0)));
    const final = Math.min(2, Math.max(0, Math.floor(Number(finalGrade) || 0)));
    if (!regularWave || boss || tutorial || currentWave <= 0 || (opening <= 0 && final <= 0)) {
      return { triggered: false, style: null, wave: currentWave };
    }

    if (this.wave !== currentWave) {
      this.wave = currentWave;
      this.eliminations = 0;
    }
    this.eliminations += 1;

    // A one-enemy wave gets the closing beat, never two stacked death treatments.
    if (lastEnemy && final > 0) {
      return {
        triggered: true,
        style: 'final_cut',
        grade: final,
        wave: currentWave,
        elimination: this.eliminations,
        staminaRestore: final >= 2 ? FINAL_CUT_STAMINA_RESTORE : 0,
        comboHoldSeconds: 0
      };
    }
    if (this.eliminations === 1 && opening > 0) {
      return {
        triggered: true,
        style: 'opening_act',
        grade: opening,
        wave: currentWave,
        elimination: this.eliminations,
        staminaRestore: 0,
        comboHoldSeconds: opening >= 2 ? OPENING_ACT_COMBO_HOLD_SECONDS : 0
      };
    }
    return { triggered: false, style: null, wave: currentWave, elimination: this.eliminations };
  }
}

export class EliminationSpectacle {
  constructor({ confettiEvery = CONFETTI_ELIMINATION_CADENCE } = {}) {
    this.confettiEvery = Math.max(1, Math.floor(Number(confettiEvery) || CONFETTI_ELIMINATION_CADENCE));
    this.reset();
  }

  reset() {
    this.eliminations = 0;
  }

  recordElimination({ enabled = false, boss = false, tutorial = false } = {}) {
    if (!enabled || boss || tutorial) return { confetti: false, count: this.eliminations };
    this.eliminations += 1;
    return {
      confetti: this.eliminations % this.confettiEvery === 0,
      count: this.eliminations
    };
  }
}

export class AlgorithmRoulette {
  constructor({
    rng = Math.random,
    upwardY = ALGORITHM_ROULETTE_UPWARD_Y,
    shotCadence = ALGORITHM_ROULETTE_SHOT_CADENCE
  } = {}) {
    this.rng = rng;
    this.upwardY = Math.max(-1, Math.min(1, Number(upwardY) || 0));
    this.shotCadence = Math.max(1, Math.floor(Number(shotCadence) || ALGORITHM_ROULETTE_SHOT_CADENCE));
    this.reset();
  }

  reset() {
    this.usedWave = null;
    this.progressWave = null;
    this.eligibleShots = 0;
  }

  tryShot({ wave, directionY, hp, maxHp, weapon, grade = 0, tutorial = false, gameOver = false } = {}) {
    const currentWave = Math.max(0, Math.floor(Number(wave) || 0));
    const currentHp = Number(hp) || 0;
    const capacity = Math.max(0, Number(maxHp) || 0);
    const currentGrade = Math.min(2, Math.max(0, Math.floor(Number(grade) || 0)));
    const excludedWeapon = weapon === 'BeamSaber';
    const eligible = currentGrade > 0 && !tutorial && !gameOver && !excludedWeapon && currentWave > 0 &&
      this.usedWave !== currentWave && Number(directionY) >= this.upwardY &&
      currentHp >= 8 && currentHp < capacity;
    if (!eligible) return { triggered: false, counted: false, wave: currentWave, delta: 0 };

    if (this.progressWave !== currentWave) {
      this.progressWave = currentWave;
      this.eligibleShots = 0;
    }
    this.eligibleShots += 1;
    if (this.eligibleShots < this.shotCadence) {
      return {
        triggered: false,
        counted: true,
        wave: currentWave,
        delta: 0,
        progress: this.eligibleShots,
        remaining: this.shotCadence - this.eligibleShots
      };
    }

    this.usedWave = currentWave;
    const profile = ALGORITHM_ROULETTE_PROFILES[currentGrade];
    const won = this.rng() < profile.winChance;
    return {
      triggered: true,
      counted: true,
      won,
      grade: currentGrade,
      wave: currentWave,
      delta: won ? profile.winHealth : -profile.lossHealth,
      progress: this.eligibleShots,
      remaining: 0
    };
  }
}
