import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_AUTHORED_CAMPAIGN_WAVE,
  LAST_AUTHORED_CAMPAIGN_WAVE,
  isAuthoredCampaignWave
} from '../src/levels/campaign-range.js';

test('authored campaign eligibility includes the Level 11 Blackout Cistern finale', () => {
  assert.equal(FIRST_AUTHORED_CAMPAIGN_WAVE, 1);
  assert.equal(LAST_AUTHORED_CAMPAIGN_WAVE, 73);
  assert.equal(isAuthoredCampaignWave(20), true);
  assert.equal(isAuthoredCampaignWave(21), true);
  assert.equal(isAuthoredCampaignWave(26), true);
  assert.equal(isAuthoredCampaignWave(30), true);
  assert.equal(isAuthoredCampaignWave(31), true);
  assert.equal(isAuthoredCampaignWave(36), true);
  assert.equal(isAuthoredCampaignWave(40), true);
  assert.equal(isAuthoredCampaignWave(41), true);
  assert.equal(isAuthoredCampaignWave(50), true);
  assert.equal(isAuthoredCampaignWave(51), true);
  assert.equal(isAuthoredCampaignWave(71), true);
  assert.equal(isAuthoredCampaignWave(72), true);
  assert.equal(isAuthoredCampaignWave(73), true);
  assert.equal(isAuthoredCampaignWave(74), false);
});
