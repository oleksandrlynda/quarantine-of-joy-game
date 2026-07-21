import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('pause menu exposes run context, primary resume, and main-menu actions', () => {
  const html = read('index.html');
  for (const id of ['pauseMenu', 'pauseWave', 'pauseScore', 'best', 'resumeBtn', 'pauseRestart', 'pauseAchievements', 'pauseSettings', 'pauseMain']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="pauseMenu"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="pauseMain"[^>]*>[\s\S]*?data-i18n="defeat\.mainMenu"/);
});

test('pause flow refreshes run stats and wires the main-menu exit', () => {
  const main = read('src/main.js');
  assert.match(main, /pauseWave\.textContent\s*=\s*String\(enemyManager\?\.wave/);
  assert.match(main, /pauseScore\.textContent\s*=\s*String\(Math\.floor\(session\.score/);
  assert.match(main, /pauseMain\.onclick\s*=\s*returnToMainMenu/);
  assert.match(main, /function returnToMainMenu\(\)[\s\S]*showStartPanel\(\)/);
});

test('main-menu lifecycle cannot be replaced by pause after browser focus changes', () => {
  const main = read('src/main.js');
  assert.match(main, /function showStartPanel\(\)\s*\{\s*paused\s*=\s*true/);
  assert.match(main, /function showPauseMenu[\s\S]*document\.body\.classList\.contains\('menu-open'\)/);
  assert.match(main, /controls\.addEventListener\('unlock',[\s\S]*classList\.contains\('menu-open'\)\) return/);
});

test('tutorial completion tears down the run and opens the two-yes campaign dialog', () => {
  const html = read('index.html');
  const main = read('src/main.js');
  const finish = main.match(/function finishTutorial[\s\S]*?\n\}/)?.[0] || '';
  for (const id of ['tutorialCompleteMenu', 'tutorialCompleteTitle', 'tutorialCompleteYes', 'tutorialCompleteAlsoYes']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="tutorialCompleteMenu"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(finish, /session\.gameOver\s*=\s*true/);
  assert.match(finish, /showMenuView\('tutorialComplete'\)/);
  assert.doesNotMatch(finish, /showStartPanel\(\)|showToast\(/);
  assert.doesNotMatch(finish, /reset\(true\)/);
  assert.match(main, /tutorialCompleteYes\.onclick\s*=\s*startGame/);
  assert.match(main, /tutorialCompleteAlsoYes\.onclick\s*=\s*startGame/);
});

test('English and Ukrainian localize the new pause-menu hierarchy', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const uk = JSON.parse(read('i18n/uk.json'));
  for (const key of ['pause.title', 'pause.status', 'pause.copy', 'pause.resumeHint', 'pause.mainHint']) {
    assert.ok(en[key]);
    assert.ok(uk[key]);
  }
});

test('English and Ukrainian localize the tutorial completion dialog', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const uk = JSON.parse(read('i18n/uk.json'));
  for (const key of ['tutorial.completeEyebrow', 'tutorial.completeTitle', 'tutorial.completeReady', 'tutorial.completeYes']) {
    assert.ok(en[key]);
    assert.ok(uk[key]);
  }
});

test('pause utility actions contain long localized labels', () => {
  const css = read('styles/styles.css');
  assert.match(css, /\.pause-action-grid\s*\{[^}]*grid-template-columns:repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.pause-action-grid \.secondary\s*\{[^}]*overflow:hidden/);
  assert.match(css, /\.pause-action-grid \.secondary > span\s*\{[^}]*overflow-wrap:anywhere/);
});
