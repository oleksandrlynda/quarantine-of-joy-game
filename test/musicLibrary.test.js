import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../src/musicLibrary.js';

const patternProps = ['kickPattern','snarePattern','hatPattern','clapPattern','ridePattern','stabPattern'];

test('songs have expected structure', () => {
  for (const song of SONGS) {
    assert.ok(song.id && song.name, 'song must have id and name');
    assert.equal(song.progression.length, 8, 'progression has 8 steps');
    patternProps.forEach(prop => {
      assert.equal(song[prop].length, 16, `${prop} length`);
    });
    assert.equal(song.leadArp.length, 4, 'leadArp has 4 notes');
  }
});

