import {
  getJSON,
  getNumber,
  getString,
  removeStorageValue,
  setJSON,
  setMaxNumber,
  setNumber,
  setString
} from '../util/storage.js';

export const CAMPAIGN_CHECKPOINT_KEY = 'qoj_campaign_checkpoint_v1';
export const CAMPAIGN_CHECKPOINT_STATE_KEY = 'qoj_campaign_checkpoint_v2';
export const CAMPAIGN_REWARD_LEDGER_KEY = 'qoj_campaign_reward_ledger_v1';
export const CAMPAIGN_CHAPTER_STARTS = Object.freeze([1, 6, 11, 16, 21, 26, 31, 36]);
export const CAMPAIGN_RESTART_WAVES = Object.freeze([...CAMPAIGN_CHAPTER_STARTS, 41, 42, 52, 59, 66, 73]);
export const CAMPAIGN_FINAL_WAVE = 40;

const POSITION_KEYS = Object.freeze({
  sandstormComplete: 'bs3d_sandstorm_complete',
  floodgateCheckpoint: 'bs3d_floodgate_checkpoint',
  greywaterComplete: 'bs3d_greywater_complete',
  lastLightComplete: 'bs3d_lastlight_complete',
  endingState: 'bs3d_ending_state',
  lastOrderStarted: 'bs3d_lastorder_started',
  lastOrderComplete: 'bs3d_lastorder_complete'
});

const RESTART_WAVE_SET = new Set(CAMPAIGN_RESTART_WAVES);

export function campaignChapterStartForWave(wave) {
  const current = Math.max(1, Math.min(CAMPAIGN_FINAL_WAVE, Math.floor(Number(wave) || 1)));
  return 1 + Math.floor((current - 1) / 5) * 5;
}

export function getCampaignCheckpoint(storage) {
  return campaignChapterStartForWave(getNumber(CAMPAIGN_CHECKPOINT_KEY, 1, storage));
}

export function recordCampaignCheckpoint(wave, storage) {
  const current = Math.floor(Number(wave) || 0);
  if (current < 1 || current > CAMPAIGN_FINAL_WAVE) return getCampaignCheckpoint(storage);
  const chapterStart = campaignChapterStartForWave(current);
  setMaxNumber(CAMPAIGN_CHECKPOINT_KEY, chapterStart, 1, storage);
  return getCampaignCheckpoint(storage);
}

export function isCampaignChapterStart(wave) {
  return RESTART_WAVE_SET.has(Math.floor(Number(wave) || 0));
}

export function getCampaignCheckpointState(storage) {
  const raw = getJSON(CAMPAIGN_CHECKPOINT_STATE_KEY, null, storage);
  const wave = Math.floor(Number(raw?.wave) || 0);
  if (raw?.version !== 3 || !isCampaignChapterStart(wave)) return null;
  return { ...raw, wave };
}

export function saveCampaignCheckpointState(state, storage) {
  const wave = Math.floor(Number(state?.wave) || 0);
  if (!isCampaignChapterStart(wave)) return false;
  return setJSON(CAMPAIGN_CHECKPOINT_STATE_KEY, { ...state, version: 3, wave }, storage);
}

export function isCampaignComplete(storage) {
  return getString(POSITION_KEYS.lastLightComplete, '0', storage) === '1';
}

export function recordCampaignChapterPosition(wave, storage) {
  const current = Math.floor(Number(wave) || 0);
  if (current >= 1 && current <= CAMPAIGN_FINAL_WAVE) return recordCampaignCheckpoint(current, storage);
  if (current === 41) setString(POSITION_KEYS.lastOrderStarted, '1', storage);
  if (current === 42) {
    setString(POSITION_KEYS.lastOrderStarted, '1', storage);
    setString(POSITION_KEYS.lastOrderComplete, '1', storage);
  }
  return resolveSavedCampaignStartWave(storage);
}

export function markLastOrderComplete(storage) {
  setString(POSITION_KEYS.lastOrderStarted, '1', storage);
  setString(POSITION_KEYS.lastOrderComplete, '1', storage);
  return 42;
}

export function resolveSavedCampaignStartWave(storage) {
  if (getString(POSITION_KEYS.lastLightComplete, '0', storage) === '1') return 1;
  if (getString(POSITION_KEYS.greywaterComplete, '0', storage) === '1') return 73;
  const floodgateCheckpoint = Math.floor(getNumber(POSITION_KEYS.floodgateCheckpoint, 0, storage));
  if (floodgateCheckpoint >= 66) return 66;
  if (floodgateCheckpoint >= 59) return 59;
  if (getString(POSITION_KEYS.sandstormComplete, '0', storage) === '1') return 52;
  if (getString(POSITION_KEYS.lastOrderComplete, '0', storage) === '1') return 42;
  if (getString(POSITION_KEYS.lastOrderStarted, '0', storage) === '1') return 41;
  // Legacy saves only recorded the ending decision. Resume the playable
  // objective at Wave 41 instead of assuming it was already completed.
  if (['free', 'reset'].includes(getString(POSITION_KEYS.endingState, '', storage))) return 41;
  return getCampaignCheckpoint(storage);
}

export function hasSavedCampaignProgress(storage) {
  return getCampaignCheckpointState(storage) !== null
    || getCampaignCheckpoint(storage) > 1
    || getString(POSITION_KEYS.sandstormComplete, '0', storage) === '1'
    || getNumber(POSITION_KEYS.floodgateCheckpoint, 0, storage) > 0
    || getString(POSITION_KEYS.greywaterComplete, '0', storage) === '1'
    || getString(POSITION_KEYS.lastLightComplete, '0', storage) === '1'
    || getString(POSITION_KEYS.lastOrderStarted, '0', storage) === '1'
    || getString(POSITION_KEYS.lastOrderComplete, '0', storage) === '1'
    || getString(POSITION_KEYS.endingState, '', storage) !== '';
}

export function resetCampaignPosition(storage) {
  setNumber(CAMPAIGN_CHECKPOINT_KEY, 1, storage);
  setString(POSITION_KEYS.sandstormComplete, '0', storage);
  setNumber(POSITION_KEYS.floodgateCheckpoint, 0, storage);
  setString(POSITION_KEYS.greywaterComplete, '0', storage);
  setString(POSITION_KEYS.lastLightComplete, '0', storage);
  setString(POSITION_KEYS.endingState, '', storage);
  setString(POSITION_KEYS.lastOrderStarted, '0', storage);
  setString(POSITION_KEYS.lastOrderComplete, '0', storage);
  removeStorageValue(CAMPAIGN_CHECKPOINT_STATE_KEY, storage);
  removeStorageValue(CAMPAIGN_REWARD_LEDGER_KEY, storage);
  return 1;
}
