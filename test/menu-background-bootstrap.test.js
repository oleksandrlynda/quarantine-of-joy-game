import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MENU_BACKGROUND_ACTOR_IDS,
  MENU_BACKGROUND_ACTOR_PLACEMENTS,
  sampleMenuPerchCycle
} from '../src/menu-background.js';

const bootstrapSource = await readFile(new URL('../src/bootstrap.js', import.meta.url), 'utf8');

test('menu assets finish loading before the background and main game start', () => {
  const firstMenuLoad = bootstrapSource.indexOf('await modelModule.loadGeneratedModels');
  const backgroundCreation = bootstrapSource.indexOf('menuModule.createMenuBackground');
  const mainImport = bootstrapSource.indexOf("await import('./main.js");

  assert.ok(firstMenuLoad >= 0);
  assert.ok(backgroundCreation > firstMenuLoad);
  assert.ok(mainImport > backgroundCreation);
});

test('menu actors retain their authored hierarchy instead of static merging', () => {
  assert.match(bootstrapSource, /ids: actorIds,[\s\S]*optimizeStatic: false/);
});

test('the menu replaces one fly with the procedural Propaganda Pelican', () => {
  assert.equal(MENU_BACKGROUND_ACTOR_PLACEMENTS.filter(placement => placement.id === 'propaganda_pelican').length, 1);
  assert.equal(MENU_BACKGROUND_ACTOR_PLACEMENTS.filter(placement => placement.id === 'winged_drone').length, 3);
  assert.equal(MENU_BACKGROUND_ACTOR_IDS.includes('propaganda_pelican'), false);
});

test('the Propaganda Pelican follows an animal-like route and only rarely perches', () => {
  const pelican = MENU_BACKGROUND_ACTOR_PLACEMENTS.find(placement => placement.id === 'propaganda_pelican');
  const perch = pelican.motion.perch;
  const interval = perch.flightDuration + perch.landingDuration + perch.duration + perch.takeoffDuration;

  assert.deepEqual(perch.position, [8.4, 3.82, -4.2]);
  assert.ok(pelican.motion.route.length >= 6);
  assert.ok(interval >= 60);
  assert.ok(perch.duration >= 3 && perch.duration <= 4);
  assert.equal(sampleMenuPerchCycle(perch.flightDuration * .5, perch).phase, 'flight');
  assert.equal(sampleMenuPerchCycle(perch.flightDuration + perch.landingDuration * .5, perch).phase, 'landing');
  assert.equal(sampleMenuPerchCycle(perch.flightDuration + perch.landingDuration + 1, perch).phase, 'perched');
  assert.equal(sampleMenuPerchCycle(interval - .5, perch).phase, 'takeoff');
});
