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

  assert.equal(APP_VERSION, pkg.version);
  assert.equal(APP_VERSION_LABEL, `v${pkg.version}`);
  assert.match(index, new RegExp(`src="src/main\\.js\\?v=${pkg.version.replaceAll('.', '\\.')}"`));
});
