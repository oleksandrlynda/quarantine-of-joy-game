import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
