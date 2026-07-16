import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlEntrypoints = [
  'index.html',
  'editor.html',
  'music_player.html',
  ...fs.readdirSync(repoRoot).filter(file => /^test-.*\.html$/.test(file)).sort()
];
const optionalMainIds = new Set([
  // Mobile controls are created/served only for touch layouts and are guarded with optional checks.
  'mobileControls'
]);

function stripQuery(ref) {
  return ref.split('#')[0].split('?')[0];
}

function isExternal(ref) {
  return /^(?:https?:|mailto:|data:|blob:|#)/.test(ref) || ref === '';
}

function resolveLocal(fromFile, ref) {
  if (isExternal(ref)) return null;
  const clean = stripQuery(ref);
  if (!clean || clean === '#') return null;
  return path.resolve(path.dirname(path.resolve(repoRoot, fromFile)), clean);
}

function assertExistingLocalRef(fromFile, ref) {
  const resolved = resolveLocal(fromFile, ref);
  if (!resolved) return;
  assert.ok(resolved.startsWith(repoRoot), `${fromFile} references path outside repo: ${ref}`);
  assert.ok(fs.existsSync(resolved), `${fromFile} references missing resource: ${ref}`);
}

function extractHtmlResourceRefs(html) {
  return [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
}

function extractImportRefs(source) {
  const refs = [];
  for (const match of source.matchAll(/\bimport\s+(?:[^'"()]+?\s+from\s+)?["']([^"']+)["']/g)) refs.push(match[1]);
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) refs.push(match[1]);
  for (const match of source.matchAll(/\bexport\s+[^'"()]+?\s+from\s+["']([^"']+)["']/g)) refs.push(match[1]);
  return refs;
}

test('HTML entrypoints reference existing local scripts, styles, icons, and assets', () => {
  for (const file of htmlEntrypoints) {
    const html = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    for (const ref of extractHtmlResourceRefs(html)) {
      assertExistingLocalRef(file, ref);
    }
    for (const ref of extractImportRefs(html)) {
      assertExistingLocalRef(file, ref);
    }
  }
});

test('DOM ids used by main.js exist in index.html or are explicitly optional', () => {
  const main = fs.readFileSync(path.join(repoRoot, 'src/main.js'), 'utf8');
  const index = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const usedIds = new Set([...main.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(match => match[1]));
  const indexIds = new Set([...index.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const missing = [...usedIds].filter(id => !indexIds.has(id) && !optionalMainIds.has(id)).sort();

  assert.deepEqual(missing, []);
});

test('local imports from src JavaScript files resolve after cache-buster normalization', () => {
  const srcFiles = fs.readdirSync(path.join(repoRoot, 'src'), { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.js'))
    .map(file => path.join('src', file));

  for (const file of srcFiles) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    for (const ref of extractImportRefs(source)) {
      if (!ref.startsWith('.') && !ref.startsWith('/')) continue;
      assertExistingLocalRef(file, ref);
    }
  }
});

test('level JSON files parse and expose expected top-level structures', () => {
  const levelDir = path.join(repoRoot, 'assets/levels');
  const levelFiles = fs.readdirSync(levelDir).filter(file => file.endsWith('.json')).sort();
  assert.ok(levelFiles.length > 0, 'expected at least one level JSON file');

  for (const file of levelFiles) {
    const rel = path.join('assets/levels', file);
    const data = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    assert.equal(typeof data, 'object', `${rel} should parse to an object`);
    assert.equal(typeof data.name, 'string', `${rel} should include a string name`);
    assert.equal(typeof data.playerSpawn, 'object', `${rel} should include playerSpawn`);
    for (const axis of ['x', 'y', 'z']) {
      assert.equal(typeof data.playerSpawn[axis], 'number', `${rel} playerSpawn.${axis} should be numeric`);
    }
    assert.ok(Array.isArray(data.enemySpawns), `${rel} should include enemySpawns array`);
    assert.ok(Array.isArray(data.walls), `${rel} should include walls array`);
    if ('obstacles' in data) assert.ok(Array.isArray(data.obstacles), `${rel} obstacles should be an array when present`);
  }
});
