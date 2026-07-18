import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, APP_VERSION_LABEL } from '../src/version.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('displayed app version matches package metadata', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const index = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(repoRoot, 'src', 'bootstrap.js'), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, 'src', 'main.js'), 'utf8');
  const achievements = fs.readFileSync(path.join(repoRoot, 'src', 'achievements.js'), 'utf8');
  const version = pkg.version.replaceAll('.', '\\.');

  assert.equal(APP_VERSION, pkg.version);
  assert.equal(APP_VERSION_LABEL, `v${pkg.version}`);
  assert.match(index, new RegExp(`src="src/bootstrap\\.js\\?v=${version}"`));
  assert.match(bootstrap, new RegExp(`import\\('./main\\.js\\?v=${version}'\\)`));
  assert.match(index, new RegExp(`from './src/i18n/index\\.js\\?v=${version}'`));
  assert.match(main, new RegExp(`from './i18n/index\\.js\\?v=${version}'`));
  assert.match(main, new RegExp(`from './achievements\\.js\\?v=${version}'`));
  assert.match(main, new RegExp(`from './version\\.js\\?v=${version}'`));
  assert.match(achievements, new RegExp(`from './i18n/index\\.js\\?v=${version}'`));
});
