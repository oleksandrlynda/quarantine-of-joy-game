import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../final-cut-animation-showcase.html', import.meta.url), 'utf8');

test('Final Cut showcase exposes all production motion variants and enemy body checks', () => {
  for (const label of ['Backdrop', 'Fold', 'Side Exit', 'Fall Apart', 'Signal Lost', 'Corkscrew']) {
    assert.match(html, new RegExp(`label:'${label}'`));
  }
  for (const factory of ['createEnhancedGruntBot', 'createEnhancedRunnerBot', 'createEnhancedBlockBot', 'createEnhancedWingedDrone']) {
    assert.match(html, new RegExp(factory));
  }
  assert.match(html, /from '\.\/src\/game\/final-cut-animations\.js\?v=fall-apart-3'/);
  assert.match(html, /createFinalCutMotion\(modelFrame/);
  assert.match(html, /airOnly!==currentEnemy\.airborne/);
  assert.match(html, /FINAL_CUT_VARIANTS\.FALL_APART/);
  assert.match(html, /pieceMetric/);
  assert.match(html, /let currentVariant = VARIANTS\.find\(variant=>variant\.id===FINAL_CUT_VARIANTS\.FALL_APART\)/);
  assert.match(html, /button\.disabled=!isVariantAvailable\(variant\)/);
});

test('Final Cut showcase inline module has valid JavaScript syntax after import removal', () => {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, 'module script missing');
  const withoutImports = match[1].replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*$/gm, '');
  assert.doesNotThrow(() => new Function(withoutImports));
});
