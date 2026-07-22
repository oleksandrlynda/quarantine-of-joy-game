import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_CHECKPOINT_KEY,
  CAMPAIGN_CHECKPOINT_STATE_KEY,
  CAMPAIGN_REWARD_LEDGER_KEY,
  campaignChapterStartForWave,
  getCampaignCheckpoint,
  getCampaignCheckpointState,
  hasSavedCampaignProgress,
  isCampaignComplete,
  markLastOrderComplete,
  recordCampaignChapterPosition,
  recordCampaignCheckpoint,
  resetCampaignPosition,
  resolveSavedCampaignStartWave,
  saveCampaignCheckpointState
} from '../src/game/campaign-checkpoint.js';

function createStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: key => key in store ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
}

test('campaign waves resolve to restartable five-wave district starts', () => {
  assert.equal(campaignChapterStartForWave(1), 1);
  assert.equal(campaignChapterStartForWave(5), 1);
  assert.equal(campaignChapterStartForWave(6), 6);
  assert.equal(campaignChapterStartForWave(10), 6);
  assert.equal(campaignChapterStartForWave(11), 11);
  assert.equal(campaignChapterStartForWave(35), 31);
  assert.equal(campaignChapterStartForWave(40), 36);
});

test('campaign checkpoint advances by district and never moves backward', () => {
  const storage = createStorage();

  assert.equal(recordCampaignCheckpoint(1, storage), 1);
  assert.equal(recordCampaignCheckpoint(6, storage), 6);
  assert.equal(recordCampaignCheckpoint(9, storage), 6);
  assert.equal(recordCampaignCheckpoint(21, storage), 21);
  assert.equal(recordCampaignCheckpoint(12, storage), 21);
  assert.equal(getCampaignCheckpoint(storage), 21);
  assert.equal(storage.store[CAMPAIGN_CHECKPOINT_KEY], '21');
});

test('saved start routing preserves later post-campaign checkpoints', () => {
  assert.equal(resolveSavedCampaignStartWave(createStorage({ [CAMPAIGN_CHECKPOINT_KEY]: '16' })), 16);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_ending_state: 'free' })), 41);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_lastorder_started: '1' })), 41);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_lastorder_complete: '1' })), 42);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_sandstorm_complete: '1' })), 52);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_floodgate_checkpoint: '66' })), 66);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_greywater_complete: '1' })), 73);
  assert.equal(resolveSavedCampaignStartWave(createStorage({ bs3d_lastlight_complete: '1', [CAMPAIGN_CHECKPOINT_KEY]: '36' })), 1);
});

test('Wave 41 and Wave 42 are separate restart positions', () => {
  const storage = createStorage({ bs3d_ending_state: 'reset' });
  assert.equal(recordCampaignChapterPosition(41, storage), 41);
  assert.equal(resolveSavedCampaignStartWave(storage), 41);
  assert.equal(markLastOrderComplete(storage), 42);
  assert.equal(resolveSavedCampaignStartWave(storage), 42);
});

test('versioned checkpoint state is accepted only at authored chapter starts', () => {
  const storage = createStorage();
  const state = { wave: 21, mutations: { points: 6 }, weapons: { inventory: ['SMG', 'Pistol'] } };
  assert.equal(saveCampaignCheckpointState(state, storage), true);
  assert.deepEqual(getCampaignCheckpointState(storage), { ...state, version: 3 });
  assert.equal(saveCampaignCheckpointState({ wave: 22 }, storage), false);
  assert.equal(getCampaignCheckpointState(createStorage({ [CAMPAIGN_CHECKPOINT_STATE_KEY]: '{"version":2,"wave":21}' })), null);
});

test('a started first district counts as Continue progress', () => {
  const storage = createStorage();
  assert.equal(hasSavedCampaignProgress(storage), false);
  saveCampaignCheckpointState({ wave: 1 }, storage);
  assert.equal(hasSavedCampaignProgress(storage), true);
});

test('new campaign resets only position while retaining Archive money and permanent unlocks', () => {
  const archive = JSON.stringify({ fragments: 47, unlocked: ['irony_armor'] });
  const unlocks = JSON.stringify({ bestWave: 31, smg: true });
  const achievements = JSON.stringify({ unlocked: ['first_blood'] });
  const storage = createStorage({
    [CAMPAIGN_CHECKPOINT_KEY]: '31',
    bs3d_ending_state: 'free',
    bs3d_sandstorm_complete: '1',
    bs3d_floodgate_checkpoint: '66',
    bs3d_greywater_complete: '1',
    bs3d_lastlight_complete: '1',
    bs3d_lastorder_started: '1',
    bs3d_lastorder_complete: '1',
    [CAMPAIGN_CHECKPOINT_STATE_KEY]: JSON.stringify({ version: 3, wave: 31 }),
    [CAMPAIGN_REWARD_LEDGER_KEY]: JSON.stringify({ waves: [2, 4], bosses: [5] }),
    qoj_archive_v1: archive,
    bs3d_unlocks: unlocks,
    achievements_v2: achievements
  });

  assert.equal(hasSavedCampaignProgress(storage), true);
  assert.equal(isCampaignComplete(storage), true);
  resetCampaignPosition(storage);

  assert.equal(resolveSavedCampaignStartWave(storage), 1);
  assert.equal(hasSavedCampaignProgress(storage), false);
  assert.equal(isCampaignComplete(storage), false);
  assert.equal(storage.store.qoj_archive_v1, archive);
  assert.equal(storage.store.bs3d_unlocks, unlocks);
  assert.equal(storage.store.achievements_v2, achievements);
  assert.equal(storage.store[CAMPAIGN_CHECKPOINT_STATE_KEY], undefined);
  assert.equal(storage.store[CAMPAIGN_REWARD_LEDGER_KEY], undefined);
});
