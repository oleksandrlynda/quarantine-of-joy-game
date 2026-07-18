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
  getProgression = () => progression,
  getStory = () => story,
  getGameTime = () => 0,
  getWaveContext = () => ({}),
  getLastWaveStartTime = () => 0,
  setLastWaveStartTime = () => {},
  updateHUD = () => {},
  showToast = () => {}
} = {}) {
  return function onWaveStart(wave, startingAlive) {
    const now = Number(getGameTime()) || 0;
    if (wave > 1) {
      achievements?.check?.({
        type: 'waveComplete',
        number: wave - 1,
        duration: now - (Number(getLastWaveStartTime()) || 0),
        ...getWaveContext?.(wave - 1, 'complete')
      });
    }
    setLastWaveStartTime(now);

    if (enemyManager && session?.onWaveStart) {
      const currentProgression = getProgression?.() ?? progression;
      const currentStory = getStory?.() ?? story;
      enemyManager.waveStartingAlive = session.onWaveStart(enemyManager.wave ?? wave, startingAlive, {
        pickups,
        weather,
        player,
        objects,
        progression: currentProgression,
        story: currentStory
      });
    }

    achievements?.check?.({
      type: 'waveStart',
      number: wave,
      ...getWaveContext?.(wave, 'start')
    });

    updateHUD();
    showToast(`Wave ${wave} start`);
  };
}
