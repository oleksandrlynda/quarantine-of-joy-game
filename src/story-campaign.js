export const CAMPAIGN_STORY_DISTRICTS = Object.freeze([
  Object.freeze({ id: 'relay', startWave: 1, turnWave: 3, bossWave: 5 }),
  Object.freeze({ id: 'spire', startWave: 6, turnWave: 8, bossWave: 10 }),
  Object.freeze({ id: 'adzone', startWave: 11, turnWave: 13, bossWave: 15 }),
  Object.freeze({ id: 'wastes', startWave: 16, turnWave: 18, bossWave: 20 }),
  Object.freeze({ id: 'freight', startWave: 21, turnWave: 23, bossWave: 25 }),
  Object.freeze({ id: 'mirror', startWave: 26, turnWave: 28, bossWave: 30 }),
  Object.freeze({ id: 'court', startWave: 31, turnWave: 33, bossWave: 35 }),
  Object.freeze({ id: 'cathedral', startWave: 36, turnWave: 38, bossWave: 40 })
]);

export const POST_CAMPAIGN_STORY_CHAPTERS = Object.freeze([
  Object.freeze({ id: 'lastorder', startWave: 41, turnWave: null, endWave: 41 }),
  Object.freeze({ id: 'expanse', startWave: 42, turnWave: 49, endWave: 51 }),
  Object.freeze({ id: 'spillway', startWave: 52, turnWave: 58, endWave: 58 }),
  Object.freeze({ id: 'galleries', startWave: 59, turnWave: 65, endWave: 65 }),
  Object.freeze({ id: 'vault', startWave: 66, turnWave: 71, endWave: 72 }),
  Object.freeze({ id: 'cistern', startWave: 73, turnWave: null, endWave: 73 })
]);

export const STORY_CHAPTERS = Object.freeze([
  ...CAMPAIGN_STORY_DISTRICTS,
  ...POST_CAMPAIGN_STORY_CHAPTERS
]);

export const POST_CAMPAIGN_WAVE_BEATS = Object.freeze({
  46: 'postgame_45_supplies',
  51: 'postgame_50_handshake',
  54: 'postgame_53_restore',
  57: 'postgame_56_badge',
  61: 'postgame_60_profiles',
  63: 'postgame_62_offer',
  67: 'postgame_66_safe',
  69: 'postgame_68_popular',
  70: 'postgame_69_predictable',
  72: 'postgame_71_escape'
});

export function getCampaignStoryDistrict(wave) {
  const normalizedWave = Math.floor(Number(wave));
  if (!Number.isFinite(normalizedWave)) return null;
  return STORY_CHAPTERS.find(district => (
    normalizedWave >= district.startWave
    && normalizedWave <= (district.endWave ?? district.bossWave)
  )) || null;
}

export function districtBeatId(districtId, moment) {
  if (!districtId || !moment) return '';
  return `district_${districtId}_${moment}`;
}
