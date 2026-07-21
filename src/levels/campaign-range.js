export const FIRST_AUTHORED_CAMPAIGN_WAVE = 1;
export const LAST_AUTHORED_CAMPAIGN_WAVE = 73;

export function isAuthoredCampaignWave(wave) {
  const normalizedWave = Math.floor(Number(wave));
  return Number.isFinite(normalizedWave)
    && normalizedWave >= FIRST_AUTHORED_CAMPAIGN_WAVE
    && normalizedWave <= LAST_AUTHORED_CAMPAIGN_WAVE;
}
