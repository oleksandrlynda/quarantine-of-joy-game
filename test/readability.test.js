import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../styles/styles.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const world = fs.readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const mutations = fs.readFileSync(new URL('../src/mutations.js', import.meta.url), 'utf8');

function ruleFor(selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `Missing CSS selector: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('combat HUD panels avoid live backdrop filters over the WebGL canvas', () => {
  for (const selector of ['.hud-tl #wavePill', '.hud-tc .score-block', '.meter-blocks', '.ammo-panel']) {
    assert.doesNotMatch(ruleFor(selector), /(?:-webkit-)?backdrop-filter\s*:/i, selector);
  }
});

test('grass readability keeps density while lowering blade height', () => {
  assert.match(world, /bladeCount:\s*20000/);
  assert.match(world, /heightRange:\s*\[0\.45,\s*0\.95\]/);
});

test('armor HUD uses progressive disclosure and appears only with run armor capacity', () => {
  assert.match(main, /setDisplayIfChanged\(armorPillEl, stats\.maxArmor > 0 \? '' : 'none'\)/);
  assert.doesNotMatch(main, /setDisplayIfChanged\(armorPillEl,[^\n]*isUnlocked/);
});

test('combat HUD exposes enhanced HP and stamina capacities numerically', () => {
  assert.match(index, /id="hpMax">100</);
  assert.match(index, /id="staminaValue">100</);
  assert.match(index, /id="staminaMaxValue">100</);
  assert.match(main, /setTextIfChanged\(hpMaxEl, Math\.floor\(stats\.maxHp\)\)/);
  assert.match(main, /setTextIfChanged\(staminaMaxValueEl, Math\.floor\(stats\.maxStamina\)\)/);
});

test('boss encounters move the combo beside the score to keep the boss name clear', () => {
  assert.match(main, /hudRootEl\.classList\.toggle\('boss-active', bossActive\)/);
  assert.match(ruleFor('#hud.boss-active .hud-tc'), /flex-direction\s*:\s*row/);
});

test('coarse-pointer landscape keeps status HUD clear of mobile controls', () => {
  const landscapeStart = css.indexOf('@media (pointer:coarse) and (orientation:landscape)');
  assert.notEqual(landscapeStart, -1, 'missing landscape mobile HUD media query');
  const landscape = css.slice(landscapeStart, css.indexOf('/* Punchline Mutations */', landscapeStart));
  assert.match(landscape, /\.hud-bl\s*\{[^}]*transform\s*:\s*scale\(\.68\)/s);
  assert.match(landscape, /\.hud-br\s*\{[^}]*top\s*:[^;}]+;[^}]*bottom\s*:\s*auto/s);
  assert.match(landscape, /#mobileControls #actionButtons button\s*\{[^}]*width\s*:\s*52px[^}]*height\s*:\s*52px/s);
  assert.match(landscape, /\.objective-tracker\s*\{[^}]*top\s*:\s*max\(8px,[^}]*right\s*:\s*calc\(50% \+ 54px\)[^}]*width\s*:\s*auto/s);
  assert.match(landscape, /\.hud-bl \.hp-label,\.hud-bl \.stam-label,\.hud-bl \.armor-label\s*\{[^}]*display\s*:\s*none/s);
  assert.match(landscape, /#hud\.ability-active \.hud-br\s*\{[^}]*flex-direction\s*:\s*row/s);
  assert.match(main, /hudRootEl\.classList\.toggle\('ability-active', Boolean\(state\)\)/);
});

test('mobile actions use SVG icons and hide unavailable alternate fire', () => {
  for (const icon of ['ability', 'alt', 'fire', 'jump', 'reload']) {
    assert.match(index, new RegExp(`assets/icons/mobile-${icon}\\.svg`));
  }
  assert.match(index, /id="btnAlt"[^>]*hidden[^>]*disabled/);
  assert.match(main, /const available = weaponSystem\?\.hasCurrentAltFire\?\.\(\) === true/);
  assert.match(main, /altButton\.hidden = !available/);
  assert.match(main, /altButton\.disabled = !available/);
  assert.doesNotMatch(main, /abilityButton\.textContent\s*=/);
});

test('landscape mobile dialogs use compact, viewport-safe layouts', () => {
  const compactStart = css.indexOf('/* Keep menu dialogs compact on landscape phones.');
  assert.ok(compactStart >= 0);
  const compact = css.slice(compactStart, css.indexOf('/* Punchline Mutations */', compactStart));
  assert.match(compact, /max-height\s*:\s*calc\(100svh - 16px/);
  assert.match(compact, /#defeatMenu \.menu-modal-actions\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(compact, /> #pauseMenu\.pause-menu\s*\{[^}]*width\s*:\s*min\(76vw,520px\)/s);
  assert.match(compact, /\.reset-data-dialog-actions\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/s);

  const finalDefeatStart = css.indexOf('/* Defeat and Archive are authored later');
  assert.ok(finalDefeatStart > compactStart);
  const finalDefeat = css.slice(finalDefeatStart);
  assert.match(finalDefeat, /#defeatMenu\.menu-modal\s*\{[^}]*width\s*:\s*min\(78vw,600px\)/s);
  assert.match(finalDefeat, /\.defeat-stats\s*\{[^}]*grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)/s);
});

test('Archive separates classified ownership and hides mastery until permanent access', () => {
  assert.match(main, /appendSurvivalCard/);
  assert.match(main, /isSurvivalMutationRevealed/);
  assert.match(main, /archive\.unlockProgression/);
  assert.match(main, /mutation\.progress\.poolReady/);
  assert.match(main, /mutation\.progress\.archiveUnlocked/);
  assert.match(main, /appendSectionTitle\('archive\.category\.weapons'\)/);
  assert.match(main, /appendSectionTitle\('archive\.category\.classified'\)/);
  assert.match(main, /revealed \? `\$\{def\.cost\} ◆`/);
  assert.match(main, /revealed \? `\$\{t\('archive\.unlock'\)\} · \$\{def\.cost\} ◆`/);
  assert.match(main, /sortArchiveItemsByCost\([\s\S]*CLASSIFIED_WEAPON_DEFINITIONS,[\s\S]*\)\.forEach\(appendClassifiedCard\)/);
  assert.match(main, /appendSectionTitle\('archive\.category\.spectacle'\)/);
  assert.match(main, /sortArchiveItemsByCost\(spectacles,[^\n]+\)\.forEach\(appendSpectacleCard\)/);
  assert.match(main, /describeSpectacleGrade\(def\.id, grade\)/);
  assert.match(main, /getMutationGrade\('algorithm_roulette'\)/);
  assert.match(main, /getMutationGrade\('opening_act'\)/);
  assert.match(main, /getMutationGrade\('final_cut'\)/);
  assert.match(main, /animateStageDeath/);
  assert.match(css, /\.stage-cue-opening/);
  assert.match(css, /\.stage-cue-final/);
  assert.match(main, /filter\(def => mutations\.isWeaponProgressionAvailable\(def\.weaponId\)\)/);
  assert.match(main, /!def\.weaponId \|\| mutations\.isWeaponProgressionAvailable\(def\.weaponId\)/);
  assert.match(main, /describeWeaponMastery\(def\.id, grade\)/);
  assert.match(main, /current} → \$\{next/);
  assert.match(mutations, /costs: Object\.freeze\(\[4, 5, 6\]\)/);
  assert.doesNotMatch(mutations, /id: 'crowd_heckler'/);
});
