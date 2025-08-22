import test from 'node:test';
import assert from 'node:assert/strict';
import { Music } from '../src/music.js';

// Provide a no-op audio context to satisfy constructor without accessing Web Audio APIs
const dummyCtx = {};

function makeMusic(){
  return new Music({ audioContextProvider: () => dummyCtx });
}

test('noteToFreq converts semitone offset to frequency', () => {
  const music = makeMusic();
  const freq = music.noteToFreq(440, 12); // one octave up
  assert.equal(Math.round(freq), 880);
});

test('makeMinorChord returns minor triad', () => {
  const music = makeMusic();
  assert.deepStrictEqual(music.makeMinorChord(5), [5, 8, 12]);
});
