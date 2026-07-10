export function combatKillScore({
  isHead = false,
  multiplier = 1,
  bodyScore = 100,
  headScore = 150
} = {}) {
  const safeMultiplier = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
  return Math.round((isHead ? headScore : bodyScore) * safeMultiplier);
}

export function applyCombatScoring({
  killed = false,
  isHead = false,
  multiplier = 1,
  comboPoints,
  bodyScore = 100,
  headScore = 150
} = {}, { session, addScore, addComboAction } = {}) {
  const awardCombo = addComboAction || ((points) => session?.addComboAction?.(points));
  const awardScore = addScore || ((points) => session?.addScore?.(points));

  if (killed) {
    const points = combatKillScore({ isHead, multiplier, bodyScore, headScore });
    awardScore?.(points);
    const awardedCombo = comboPoints ?? 1;
    awardCombo?.(awardedCombo);
    return { killed: true, points, comboPoints: awardedCombo };
  }

  const awardedCombo = comboPoints ?? 0.25;
  awardCombo?.(awardedCombo);
  return { killed: false, points: 0, comboPoints: awardedCombo };
}
