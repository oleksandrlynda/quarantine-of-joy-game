import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LevelTransitionController } from '../src/game/level-transition.js';

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../styles/styles.css', import.meta.url), 'utf8');

function classListFixture() {
  const values = new Set();
  return {
    values,
    add(...items) { items.forEach(item => values.add(item)); },
    remove(...items) { items.forEach(item => values.delete(item)); },
    toggle(item, force) {
      if (force) values.add(item);
      else values.delete(item);
    }
  };
}

function elementFixture() {
  return {
    hidden: true,
    dataset: {},
    attributes: {},
    classList: classListFixture(),
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

function harness({ coverMs = 20, minimumCoveredMs = 40, revealMs = 30 } = {}) {
  let now = 0;
  const delays = [];
  const events = [];
  const freezes = [];
  const element = elementFixture();
  const labelElement = { textContent: '' };
  const body = { classList: classListFixture() };
  const controller = new LevelTransitionController({
    documentRef: { body },
    element,
    labelElement,
    coverMs,
    minimumCoveredMs,
    revealMs,
    now: () => now,
    delay: async ms => { delays.push(ms); now += ms; },
    onFreeze: () => freezes.push('freeze'),
    onThaw: () => freezes.push('thaw'),
    onEvent: (name, data) => events.push({ name, data })
  });
  return { controller, element, labelElement, body, delays, events, freezes, get now() { return now; } };
}

test('level transition covers before preparation and thaws only after reveal', async () => {
  const h = harness();
  const order = [];
  const promise = h.controller.run({
    fromId: 'old',
    toId: 'new',
    label: 'Recalibrating',
    prepare: () => order.push(`prepare:${h.controller.phase}`),
    precompile: () => order.push(`compile:${h.controller.phase}`)
  });

  assert.equal(h.controller.active, true, 'freeze flag must be synchronous');
  assert.equal(h.element.hidden, false);
  assert.equal(h.labelElement.textContent, 'Recalibrating');
  await promise;

  assert.deepEqual(order, ['prepare:covered', 'compile:covered']);
  assert.deepEqual(h.delays, [20, 40, 30]);
  assert.deepEqual(h.freezes, ['freeze', 'thaw']);
  assert.equal(h.controller.active, false);
  assert.equal(h.element.hidden, true);
  assert.deepEqual(h.events.map(event => event.name), ['start', 'covered', 'ready', 'complete']);
});

test('concurrent transition requests share one protected handoff', async () => {
  const h = harness({ coverMs: 0, minimumCoveredMs: 0, revealMs: 0 });
  let prepares = 0;
  const first = h.controller.run({ prepare: () => { prepares++; } });
  const second = h.controller.run({ prepare: () => { prepares++; } });

  assert.equal(first, second);
  await first;
  assert.equal(prepares, 1);
});

test('transition reports preparation failure but still reveals and releases controls', async () => {
  const h = harness({ coverMs: 5, minimumCoveredMs: 10, revealMs: 5 });
  await assert.rejects(h.controller.run({
    fromId: 'a',
    toId: 'b',
    prepare: () => { throw new Error('broken level'); }
  }), /broken level/);

  assert.equal(h.controller.active, false);
  assert.equal(h.element.hidden, true);
  assert.deepEqual(h.freezes, ['freeze', 'thaw']);
  assert.ok(h.events.some(event => event.name === 'error'));
  assert.equal(h.events.at(-1).name, 'complete');
});

test('campaign transitions freeze simulation and precompile the real incoming scene', () => {
  assert.match(mainSource, /!paused && !levelTransition\.active && !session\.gameOver/);
  assert.match(mainSource, /if \(!levelTransition\.active && combo\.decayTimer > 0\)/);
  assert.match(mainSource, /typeof renderer\.compileAsync === 'function'/);
  assert.match(mainSource, /enemyManager\.primeAuthoredSpawnTypes/);
  assert.match(mainSource, /repairSceneMaterialBuildHooks\('level_transition_pre_render'\)/);
  assert.match(mainSource, /renderProductionScene\(\);\s*await new Promise\(resolve => requestAnimationFrame\(resolve\)\)/);
  assert.match(mainSource, /fromId: 'last-order-base'[\s\S]*toDefinition: SANDSTORM_EXPANSE/);
  assert.match(mainSource, /beginLiveLevelTransition\(\{[\s\S]*toDefinition: nextDefinition/);
  assert.match(mainSource, /if \(!levelTransition\.active && !document\.body\.classList\.contains\('menu-background-active'\)\)/);
});

test('vision veil obscures only the world layer and avoids backdrop blur cost', () => {
  assert.match(htmlSource, /id="levelTransition"[\s\S]*id="levelTransitionLabel"/);
  const block = cssSource.match(/#levelTransition\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(block, /z-index:9/);
  assert.doesNotMatch(block, /backdrop-filter|filter:\s*blur/);
  assert.match(cssSource, /#hud\{[^}]*z-index:10/);
  assert.match(cssSource, /body\.level-transition-active #crosshair/);
});
