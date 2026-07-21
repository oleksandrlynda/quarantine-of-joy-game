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
