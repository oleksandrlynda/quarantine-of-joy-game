import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StoryManager, storyPresentationMode, visibleStoryText } from '../src/story.js';
import {
  CAMPAIGN_STORY_DISTRICTS,
  districtBeatId,
  getCampaignStoryDistrict,
  POST_CAMPAIGN_STORY_CHAPTERS,
  POST_CAMPAIGN_WAVE_BEATS,
  STORY_CHAPTERS
} from '../src/story-campaign.js';

const ENGLISH_STORY_URL = new URL('../i18n/story_en.json', import.meta.url);
const UKRAINIAN_STORY_URL = new URL('../i18n/story_uk.json', import.meta.url);

async function readBeats(url = ENGLISH_STORY_URL) {
  return JSON.parse(await readFile(url, 'utf8')).beats;
}

function makeDocument() {
  const elements = new Map([
    ['story', { style: { display: 'none' } }],
    ['storyText', { textContent: '' }],
    ['storyNext', { onclick: null }],
    ['offer', { style: { display: 'none' } }]
  ]);
  return { getElementById: id => elements.get(id) || null };
}

function makeManager(beats, options = {}) {
  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    randomFn: () => 0,
    scheduleFn: () => {},
    ...options
  });
  manager.enabled = true;
  manager._beats = beats;
  manager._beatsLoaded = true;
  manager._maybeShow = () => {};
  return manager;
}

test('story chapters cover every authored wave from 1 through 73 without overlap', () => {
  for (let wave = 1; wave <= 73; wave += 1) {
    const district = getCampaignStoryDistrict(wave);
    assert.ok(district, `wave ${wave} should have a narrative district`);
    assert.ok(wave >= district.startWave && wave <= (district.endWave ?? district.bossWave));
    assert.equal(STORY_CHAPTERS.filter(chapter => (
      wave >= chapter.startWave && wave <= (chapter.endWave ?? chapter.bossWave)
    )).length, 1, `wave ${wave} should belong to exactly one story chapter`);
  }
  assert.equal(getCampaignStoryDistrict(0), null);
  assert.equal(getCampaignStoryDistrict(74), null);
  assert.equal(getCampaignStoryDistrict('not-a-wave'), null);
});

test('localization keys remain in source data but are hidden from players', () => {
  assert.equal(visibleStoryText('Keep moving. #lowHp_01'), 'Keep moving.');
  assert.equal(visibleStoryText('No localization suffix'), 'No localization suffix');
  assert.equal(visibleStoryText(null), '');
});

test('in-run narrative uses centered broadcasts while ambient and ending beats keep their roles', () => {
  const broadcastIds = [
    'act1_brief',
    'district_relay_arrival',
    'district_relay_turn',
    'district_relay_resolve',
    'boss_5_start',
    'boss_5_down',
    'postgame_45_supplies',
    'wave72_mara_lastlight'
  ];
  for (const id of broadcastIds) {
    assert.equal(storyPresentationMode({ id, mode: 'ticker' }), 'broadcast', id);
  }
  assert.equal(storyPresentationMode({ id: 'relay_ambient_01', mode: 'ticker' }), 'ticker');
  assert.equal(storyPresentationMode({ id: 'firstWave', mode: 'toast' }), 'toast');
  assert.equal(storyPresentationMode({ id: 'wave72_epilogue_title', mode: 'story' }), 'story');
  assert.equal(storyPresentationMode({ id: 'district_cistern_resolve', mode: 'story' }), 'story');
});

test('centered run narrative replays even if its former toast was saved as seen', () => {
  const manager = makeManager({
    act1_brief: {
      id: 'act1_brief',
      text: 'Recovered archive fragment.',
      mode: 'toast',
      persistOnce: true
    }
  });
  manager._seen.act1_brief = true;

  assert.equal(manager._enqueueBeat('act1_brief'), true);
  assert.deepEqual(manager.queue.map(beat => beat.id), ['act1_brief']);
});

test('English and Ukrainian story banks fully cover every district arc', async () => {
  const [english, ukrainian] = await Promise.all([
    readBeats(ENGLISH_STORY_URL),
    readBeats(UKRAINIAN_STORY_URL)
  ]);

  for (const district of CAMPAIGN_STORY_DISTRICTS) {
    for (const moment of ['arrival', 'turn', 'resolve']) {
      const id = districtBeatId(district.id, moment);
      assert.equal(english[id]?.id, id, `English is missing ${id}`);
      assert.equal(ukrainian[id]?.id, id, `Ukrainian is missing ${id}`);
      if (moment !== 'turn') {
        assert.equal(english[id]?.mode, 'broadcast', `English ${id} should use the chapter broadcast`);
        assert.equal(ukrainian[id]?.mode, 'broadcast', `Ukrainian ${id} should use the chapter broadcast`);
      }
    }
    for (const suffix of ['01', '02']) {
      const id = `${district.id}_ambient_${suffix}`;
      assert.equal(english[id]?.pool, 'ambient', `English is missing ambient metadata for ${id}`);
      assert.equal(english[id]?.district, district.id);
      assert.equal(ukrainian[id]?.pool, 'ambient', `Ukrainian is missing ambient metadata for ${id}`);
      assert.equal(ukrainian[id]?.district, district.id);
    }
    for (const suffix of ['ticker', 'start', 'down']) {
      const id = `boss_${district.bossWave}_${suffix}`;
      assert.equal(english[id]?.id, id, `English is missing ${id}`);
      assert.equal(ukrainian[id]?.id, id, `Ukrainian is missing ${id}`);
    }
  }
});

test('English and Ukrainian story banks fully cover the post-campaign arc and epilogue', async () => {
  const [english, ukrainian] = await Promise.all([
    readBeats(ENGLISH_STORY_URL),
    readBeats(UKRAINIAN_STORY_URL)
  ]);

  for (const chapter of POST_CAMPAIGN_STORY_CHAPTERS) {
    const moments = chapter.turnWave == null ? ['arrival', 'resolve'] : ['arrival', 'turn', 'resolve'];
    for (const moment of moments) {
      const id = districtBeatId(chapter.id, moment);
      assert.equal(english[id]?.id, id, `English is missing ${id}`);
      assert.equal(ukrainian[id]?.id, id, `Ukrainian is missing ${id}`);
      if (moment === 'arrival' || (moment === 'resolve' && chapter.id !== 'cistern')) {
        assert.equal(english[id]?.mode, 'broadcast', `English ${id} should use the chapter broadcast`);
        assert.equal(ukrainian[id]?.mode, 'broadcast', `Ukrainian ${id} should use the chapter broadcast`);
      }
    }
    if (!['cistern', 'lastorder'].includes(chapter.id)) {
      for (const suffix of ['01', '02']) {
        const id = `${chapter.id}_ambient_${suffix}`;
        assert.equal(english[id]?.district, chapter.id, `English is missing ${id}`);
        assert.equal(ukrainian[id]?.district, chapter.id, `Ukrainian is missing ${id}`);
      }
    }
  }

  const requiredIds = [
    ...Object.values(POST_CAMPAIGN_WAVE_BEATS),
    'postgame_guide_free', 'postgame_guide_reset',
    'postgame_archive_access_free', 'postgame_archive_access_reset',
    'wave72_mara_lastlight', 'wave72_epilogue_signal',
    'wave72_epilogue_free', 'wave72_epilogue_reset', 'wave72_epilogue_title'
  ];
  for (const id of requiredIds) {
    assert.equal(english[id]?.id, id, `English is missing ${id}`);
    assert.equal(ukrainian[id]?.id, id, `Ukrainian is missing ${id}`);
  }
});

test('ambient broadcasts come only from the active district and never from boss alerts', async () => {
  const manager = makeManager(await readBeats());

  manager.onWave(1);
  manager.queue.length = 0;
  manager.onWave(2);

  const queuedIds = manager.queue.map(beat => beat.id);
  assert.equal(queuedIds.some(id => id.startsWith('relay_ambient_')), true);
  assert.ok(queuedIds.includes('act1_brief'));
  assert.equal(queuedIds.some(id => id.startsWith('boss_')), false);

  manager.queue.length = 0;
  manager.onWave(3);
  assert.ok(manager.queue.some(beat => beat.id === 'district_relay_turn'));
  assert.equal(
    storyPresentationMode(manager.queue.find(beat => beat.id === 'district_relay_turn')),
    'broadcast'
  );

  manager.queue.length = 0;
  manager.onWave(6);
  manager.onWave(7);
  const spireIds = manager.queue.map(beat => beat.id);
  assert.ok(spireIds.includes('district_spire_arrival'));
  assert.equal(spireIds.some(id => id.startsWith('spire_ambient_')), true);
  assert.equal(spireIds.some(id => id.startsWith('relay_ambient_')), false);
});

test('events raised before story data loads are replayed in their original order', async () => {
  const beats = await readBeats();
  const manager = makeManager(beats);
  manager._beats = {};
  manager._beatsLoaded = false;

  manager.onWave(1);
  assert.deepEqual(manager._pendingBeatIds, ['district_relay_arrival', 'firstWave']);
  assert.deepEqual(manager.queue, []);

  manager._beats = beats;
  manager._beatsLoaded = true;
  manager._flushPendingBeats();
  assert.deepEqual(manager.queue.map(beat => beat.id), ['district_relay_arrival', 'firstWave']);
});

test('startRun preserves wave events that arrive while localized beats are loading', async () => {
  const beats = await readBeats();
  let releaseFetch;
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    fetchFn: async () => {
      await fetchGate;
      return { ok: true, json: async () => ({ beats }) };
    },
    scheduleFn: () => {}
  });
  manager._maybeShow = () => {};

  const loading = manager.startRun();
  manager.onWave(1);
  assert.deepEqual(manager._pendingBeatIds, ['district_relay_arrival', 'firstWave']);

  releaseFetch();
  await loading;

  assert.deepEqual(manager.queue.map(beat => beat.id), [
    'intro',
    'district_relay_arrival',
    'firstWave'
  ]);
  assert.deepEqual(manager._pendingBeatIds, []);
});

test('localized story data overrides English while retaining missing English fallbacks', async () => {
  const banks = {
    'i18n/story_en.json': {
      beats: {
        intro: { id: 'intro', text: 'English intro' },
        english_only: { id: 'english_only', text: 'English fallback' }
      }
    },
    'i18n/story_uk.json': {
      beats: { intro: { id: 'intro', text: 'Український вступ' } }
    }
  };
  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    languageFn: () => 'uk',
    fetchFn: async url => ({ ok: true, json: async () => banks[url] }),
    scheduleFn: () => {}
  });
  manager._maybeShow = () => {};

  await manager.startRun();

  assert.equal(manager._beats.intro.text, 'Український вступ');
  assert.equal(manager._beats.english_only.text, 'English fallback');
});

test('post-campaign runs skip the campaign intro and honor the Wave 40 ending branch', async () => {
  const beats = await readBeats();
  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    fetchFn: async () => ({ ok: true, json: async () => ({ beats }) }),
    scheduleFn: () => {}
  });
  manager._maybeShow = () => {};

  await manager.startRun({ startWave: 41, endingState: 'free' });

  const queuedIds = manager.queue.map(beat => beat.id);
  assert.deepEqual(queuedIds, ['district_lastorder_arrival']);
  assert.equal(queuedIds.includes('intro'), false);
});

test('post-campaign milestones and checkpoints advance the authored chapter story', async () => {
  const manager = makeManager(await readBeats());
  manager._context.endingState = 'reset';

  manager.onWave(46);
  manager.onWave(59);
  manager.onCheckpoint({ levelId: 'floodgate-continuity', wave: 66, completedWave: 65 });

  const queuedIds = manager.queue.map(beat => beat.id);
  assert.ok(queuedIds.includes('postgame_45_supplies'));
  assert.ok(queuedIds.indexOf('district_spillway_resolve') < queuedIds.indexOf('district_galleries_arrival'));
  assert.ok(queuedIds.includes('district_galleries_arrival'));
  assert.ok(queuedIds.includes('postgame_archive_access_reset'));
  assert.ok(queuedIds.includes('district_galleries_resolve'));
});

test('Wave 73 epilogue selects the ending branch and returns control only after its final card', async () => {
  const beats = await readBeats();
  let completed = 0;
  let locks = 0;
  let unlocks = 0;
  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    controls: {
      lock: () => { locks += 1; },
      unlock: () => { unlocks += 1; }
    },
    minGapMs: 0,
    scheduleFn: callback => callback()
  });
  manager.enabled = true;
  manager._beats = beats;
  manager._beatsLoaded = true;
  manager._context.endingState = 'free';

  const queued = manager.onSpecialWave(
    { type: 'complete', encounter: 'last_light' },
    { endingState: 'free', onComplete: () => { completed += 1; } }
  );

  assert.equal(queued, true);
  assert.equal(manager._currentBeat.id, 'district_cistern_resolve');
  assert.equal(completed, 0);
  manager._next();
  assert.equal(manager._currentBeat.id, 'wave72_epilogue_signal');
  assert.equal(locks, 0);
  manager._next();
  assert.equal(manager._currentBeat.id, 'wave72_epilogue_free');
  assert.equal(locks, 0);
  manager._next();
  assert.equal(manager._currentBeat.id, 'wave72_epilogue_title');
  assert.equal(locks, 0);
  assert.equal(manager.queue.some(beat => beat.id === 'wave72_epilogue_reset'), false);
  manager._next();
  assert.equal(completed, 1);
  assert.equal(locks, 1);
  assert.equal(unlocks, 4);
});

test('story scheduler preserves the browser timer receiver', () => {
  let calls = 0;
  function browserScheduler(callback) {
    assert.equal(this, globalThis);
    calls += 1;
    callback();
  }

  const manager = new StoryManager({
    documentRef: makeDocument(),
    tickerFn: () => {},
    toastFn: () => {},
    scheduleFn: browserScheduler,
    minGapMs: 0
  });
  manager.enabled = true;
  manager._beats = {
    scheduler_a: { id: 'scheduler_a', text: 'First', mode: 'toast' },
    scheduler_b: { id: 'scheduler_b', text: 'Second', mode: 'toast' }
  };
  manager._beatsLoaded = true;
  manager._enqueueBeat('scheduler_a');
  manager._enqueueBeat('scheduler_b');

  manager._maybeShow();

  assert.ok(calls >= 1);
});

test('chapter broadcasts are prominent without pausing or capturing controls', () => {
  const broadcasts = [];
  const pauses = [];
  let locks = 0;
  let unlocks = 0;
  const manager = new StoryManager({
    documentRef: makeDocument(),
    onPause: paused => { pauses.push(paused); },
    controls: {
      lock: () => { locks += 1; },
      unlock: () => { unlocks += 1; }
    },
    broadcastFn: (text, holdMs) => { broadcasts.push({ text, holdMs }); },
    scheduleFn: () => {},
    minGapMs: 0
  });
  manager.enabled = true;
  manager._beats = {
    chapter: { id: 'chapter', text: 'A district answers.', mode: 'broadcast', duration: 4800 }
  };
  manager._beatsLoaded = true;
  manager._enqueueBeat('chapter');

  manager._maybeShow();

  assert.deepEqual(broadcasts, [{ text: 'A district answers.', holdMs: 4800 }]);
  assert.deepEqual(pauses, []);
  assert.equal(locks, 0);
  assert.equal(unlocks, 0);
  assert.equal(manager.active, false);
});

test('continuing a modal resumes play before the following chapter broadcast', () => {
  const pauses = [];
  let locks = 0;
  const scheduled = [];
  const manager = new StoryManager({
    documentRef: makeDocument(),
    onPause: paused => { pauses.push(paused); },
    controls: { lock: () => { locks += 1; }, unlock: () => {} },
    broadcastFn: () => {},
    scheduleFn: callback => { scheduled.push(callback); },
    minGapMs: 0
  });
  manager.enabled = true;
  manager._beats = {
    intro: { id: 'intro', text: 'Intro' },
    chapter: { id: 'chapter', text: 'Chapter', mode: 'broadcast' }
  };
  manager._beatsLoaded = true;
  manager._enqueueBeat('intro');
  manager._enqueueBeat('chapter');
  manager._maybeShow();

  manager._next();

  assert.deepEqual(pauses, [true, false]);
  assert.equal(locks, 1);
  assert.equal(scheduled.length, 1);
});

test('a hard-won district victory remembers whether the Courier recovered', async () => {
  const manager = makeManager(await readBeats());
  manager.onWave(1);
  manager.onLowHp();
  manager.onFirstMedPickup();
  manager.queue.length = 0;

  manager.onBossDeath(5);

  const queuedIds = manager.queue.map(beat => beat.id);
  assert.ok(queuedIds.includes('memory_recovered'));
  assert.ok(queuedIds.includes('district_relay_resolve'));
  assert.equal(queuedIds.includes('memory_wounded'), false);
});

test('reset clears run-only history so non-persistent district beats can play again', async () => {
  const beats = await readBeats();
  const manager = makeManager(beats);

  manager.onWave(1);
  assert.ok(manager._beatsFired.has('district_relay_arrival'));

  manager.reset();
  manager.enabled = true;
  manager._beats = beats;
  manager._beatsLoaded = true;
  manager.onWave(1);

  assert.ok(manager.queue.some(beat => beat.id === 'district_relay_arrival'));
});
