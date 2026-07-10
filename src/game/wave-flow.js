export function createWaveStartHandler({
  session,
  enemyManager,
  achievements,
  pickups,
  weather,
  player,
  objects,
  progression,
  story,
  getGameTime = () => 0,
  getLastWaveStartTime = () => 0,
  setLastWaveStartTime = () => {},
  updateHUD = () => {},
  showToast = () => {}
} = {}) {
  return function onWaveStart(wave, startingAlive) {
    const now = Number(getGameTime()) || 0;
    if (wave > 1) {
      achievements?.check?.({ type: 'waveComplete', time: now - (Number(getLastWaveStartTime()) || 0) });
    }
    setLastWaveStartTime(now);
    achievements?.check?.({ type: 'wave', number: wave });

    if (enemyManager && session?.onWaveStart) {
      enemyManager.waveStartingAlive = session.onWaveStart(enemyManager.wave ?? wave, startingAlive, {
        pickups,
        weather,
        player,
        objects,
        progression,
        story
      });
    }

    updateHUD();
    showToast(`Wave ${wave} start`);
  };
}
