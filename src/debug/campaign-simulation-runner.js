const elements = {
  panel: document.getElementById('panel'), panelToggle: document.getElementById('panelToggle'),
  frame: document.getElementById('gameFrame'), seed: document.getElementById('seed'),
  from: document.getElementById('fromWave'), to: document.getElementById('toWave'),
  scenario: document.getElementById('scenario'), routeSamples: document.getElementById('routeSamples'),
  visualPace: document.getElementById('visualPace'),
  run: document.getElementById('run'),
  stop: document.getElementById('stop'), copy: document.getElementById('copy'),
  download: document.getElementById('download'), status: document.getElementById('status'),
  elapsed: document.getElementById('elapsed'), progress: document.getElementById('progress'),
  waves: document.getElementById('waveCount'), errors: document.getElementById('errorCount'),
  events: document.getElementById('eventCount'), dropped: document.getElementById('dropCount'),
  rows: document.getElementById('rows'), output: document.getElementById('output')
};

const params = new URL(location.href).searchParams;
const ERROR_LIMIT = 50;
let running = false;
let report = null;
let startedAt = 0;
let pollTimer = null;

function setPanelCollapsed(collapsed) {
  const isCollapsed = collapsed === true;
  elements.panel.dataset.collapsed = String(isCollapsed);
  elements.panelToggle.setAttribute('aria-expanded', String(!isCollapsed));
  elements.panelToggle.textContent = isCollapsed ? 'Expand panel' : 'Collapse panel';
}

const clampWave = value => Math.max(1, Math.min(73, Math.floor(Number(value) || 1)));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function setControls(isRunning) {
  running = isRunning;
  elements.run.disabled = isRunning;
  elements.stop.disabled = !isRunning;
  for (const input of [elements.seed, elements.from, elements.to, elements.scenario, elements.routeSamples, elements.visualPace]) input.disabled = isRunning;
}

function frameUrl(seed, startWave) {
  const url = new URL('index.html', location.href);
  Object.entries({
    qaSimulation: 1,
    qaBuild: 'cathedral-route-collision3',
    debug: 1,
    wave: clampWave(startWave),
    story: 0,
    warmup: 0,
    prewarm: 0,
    aa: 0,
    shadows: 0,
    autoDPR: 1,
    seed
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

function bridge() {
  try { return elements.frame.contentWindow?.__qaCampaignBridge || null; } catch { return null; }
}

async function waitForBridge(timeoutMs = 45000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = bridge();
    if (value?.ready) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Production game did not expose the campaign simulation bridge before timeout.');
}

function updateLive() {
  if (!running) return;
  const status = bridge()?.status?.();
  const fromWave = clampWave(elements.from.value);
  const toWave = Math.max(fromWave, clampWave(elements.to.value));
  if (status) {
    const planned = toWave - fromWave + 1;
    elements.waves.textContent = `Waves ${status.completedWaves} / ${planned}`;
    elements.errors.textContent = `Errors ${status.errors} / ${ERROR_LIMIT}`;
    elements.events.textContent = `Events ${status.events}`;
    elements.progress.style.width = `${Math.min(100, (status.completedWaves / planned) * 100)}%`;
    const combatStatus = status.combat
      ? ` · ${status.combat.weapon} vs ${status.combat.target || 'enemy'} (${status.combat.kills} kills / ${status.combat.shots} shots, ${status.combat.activeEnemies} active)`
      : '';
    elements.status.textContent = status.stopped
      ? `Stopped: ${status.stopReason}. Building report…`
      : `Simulating Wave ${status.wave || fromWave} — ${status.completedWaves} completed${combatStatus}`;
  }
  elements.elapsed.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
  pollTimer = setTimeout(updateLive, 100);
}

function renderReport(value) {
  report = value;
  window.__campaignSimulationReport = value;
  window.__campaignSimulationDone = true;
  const summary = value.summary;
  elements.waves.textContent = `Waves ${summary.completedWaves} / ${summary.plannedWaves}`;
  elements.errors.textContent = `Errors ${summary.errors} / ${ERROR_LIMIT}`;
  elements.events.textContent = `Events ${summary.events}`;
  elements.dropped.textContent = `Dropped ${summary.droppedEvents}`;
  elements.progress.style.width = `${Math.min(100, (summary.completedWaves / summary.plannedWaves) * 100)}%`;
  elements.elapsed.textContent = `${(value.durationMs / 1000).toFixed(1)}s`;
  elements.status.textContent = value.stopReason === 'error_limit'
    ? `Stopped at the ${ERROR_LIMIT}-error limit. Fix these failures, then rerun the same seed.`
    : value.stopped
      ? `Stopped: ${value.stopReason}. Partial report is ready.`
      : `Complete: ${summary.passedWaves} passed waves, ${summary.failedWaves} failed waves, ${summary.errors} errors.`;
  elements.rows.innerHTML = value.waves.map(wave => {
    const end = wave.end || {};
    const snapshot = end.snapshot || {};
    const planned = end.planned || {};
    const objective = end.objective || {};
    const objectiveLabel = objective.required ? `${objective.kind}: ${objective.complete ? 'complete' : 'failed'}` : 'eliminate';
    return `<tr data-state="${escapeHtml(wave.status)}"><td>${wave.wave}</td><td>${escapeHtml(snapshot.levelId || wave.start?.levelId || '—')}</td><td>${escapeHtml(planned.mode || '—')}</td><td>${escapeHtml(objectiveLabel)}</td><td>${planned.total ?? '—'}</td><td>${snapshot.activeEnemies ?? '—'}</td><td>${end.eliminated ?? '—'}</td><td>${snapshot.renderer?.drawCalls ?? '—'}</td><td>${(Number(wave.durationMs || 0) / 1000).toFixed(2)}s</td><td>${escapeHtml(wave.status.toUpperCase())}</td></tr>`;
  }).join('');
  // Keep the full report as structured data until the user explicitly copies
  // or downloads it. Eagerly materializing a multi-megabyte JSON string and a
  // second textarea copy can freeze an otherwise successful 73-wave run.
  elements.output.value = `Report ready: ${summary.events} events, ${summary.errors} errors. Use Copy JSON or Download JSON.`;
  elements.output.classList.add('ready');
  elements.copy.disabled = false;
  elements.download.disabled = false;
  setPanelCollapsed(false);
}

async function run() {
  if (running) return;
  const seed = elements.seed.value.trim() || 'ULTIMATE-QA-001';
  const scenario = elements.scenario.value === 'relay-car-summon' ? 'relay-car-summon' : 'campaign';
  const fromWave = scenario === 'relay-car-summon' ? 1 : clampWave(elements.from.value);
  const toWave = scenario === 'relay-car-summon' ? 1 : Math.max(fromWave, clampWave(elements.to.value));
  const routeSamples = Math.max(1, Math.min(12, Math.floor(Number(elements.routeSamples.value) || 4)));
  const paceDelayMs = Math.max(0, Math.min(1000, Math.floor(Number(elements.visualPace.value) || 0)));
  const selectedPace = elements.visualPace.selectedOptions[0];
  const simulationTimeScale = Math.max(0.5, Math.min(4, Number(selectedPace?.dataset.timeScale) || 1));
  elements.from.value = fromWave;
  elements.to.value = toWave;
  setControls(true);
  setPanelCollapsed(true);
  report = null;
  window.__campaignSimulationDone = false;
  elements.rows.innerHTML = '';
  elements.output.classList.remove('ready');
  elements.copy.disabled = true;
  elements.download.disabled = true;
  elements.progress.style.width = '0%';
  elements.status.textContent = 'Loading the production game and QA instrumentation…';
  startedAt = performance.now();
  updateLive();
  try {
    elements.frame.src = frameUrl(seed, fromWave);
    const api = await waitForBridge();
    elements.status.textContent = `Production game ready. Starting Wave ${fromWave}…`;
    const value = await api.run({
      fromWave, toWave, scenario, errorLimit: ERROR_LIMIT, routeSamples, paceDelayMs, simulationTimeScale
    });
    renderReport(value);
  } catch (error) {
    elements.status.textContent = `Harness failure: ${error.message}`;
    window.__campaignSimulationDone = true;
  } finally {
    clearTimeout(pollTimer);
    setControls(false);
  }
}

elements.run.addEventListener('click', run);
elements.panelToggle.addEventListener('click', () => setPanelCollapsed(elements.panel.dataset.collapsed !== 'true'));
elements.stop.addEventListener('click', () => bridge()?.stop?.());
elements.copy.addEventListener('click', async () => {
  if (!report) return;
  await navigator.clipboard.writeText(JSON.stringify(report));
  elements.status.textContent = 'JSON report copied.';
});
elements.download.addEventListener('click', () => {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `qoj-campaign-simulation-${report.seed}-${report.requestedRange.fromWave}-${report.requestedRange.toWave}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

if (params.has('seed')) elements.seed.value = params.get('seed');
if (params.has('from')) elements.from.value = clampWave(params.get('from'));
if (params.has('to')) elements.to.value = clampWave(params.get('to'));
if (params.get('scenario') === 'relay-car-summon') elements.scenario.value = 'relay-car-summon';
if (params.has('pace')) {
  const requestedPace = String(Math.max(0, Math.min(1000, Math.floor(Number(params.get('pace')) || 0))));
  if ([...elements.visualPace.options].some(option => option.value === requestedPace)) elements.visualPace.value = requestedPace;
}
if (params.get('autorun') === '1') run();
