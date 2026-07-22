const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loadingBar');
const loadingText = document.getElementById('loadingText');
const loadingLabel = document.getElementById('loadingLabel');
const initialLoadingLabel = loadingLabel?.textContent || 'Loading…';

function setBootstrapProgress(value, label) {
  const progress = Math.max(0, Math.min(1, Number(value) || 0));
  const percent = Math.round(progress * 100);
  if (loadingBar) loadingBar.style.width = `${percent}%`;
  if (loadingText) loadingText.textContent = `${percent}%`;
  if (loadingLabel && label) loadingLabel.textContent = label;
  loadingEl?.setAttribute('aria-valuenow', String(percent));
}

function afterPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function start() {
  const params = new URL(window.location.href).searchParams;
  const relayView = params.get('relayView');
  const shouldPaintMenu = params.get('editor') !== '1' && relayView !== 'top' && relayView !== 'player';
  setBootstrapProgress(.02, initialLoadingLabel);

  try {
    if (!shouldPaintMenu) throw new Error('Menu bootstrap skipped for this view');
    const [THREE, modelModule, menuModule] = await Promise.all([
      import('https://unpkg.com/three@0.159.0/build/three.module.js'),
      import('../loader.js?v=9'),
      import('./menu-background.js')
    ]);

    setBootstrapProgress(.05, initialLoadingLabel);
    const updateMenuProgress = (done, total) => {
      setBootstrapProgress(.05 + .11 * (done / Math.max(1, total)), `${initialLoadingLabel} ${done}/${total}`);
    };
    const environmentIds = menuModule.MENU_BACKGROUND_ASSET_IDS;
    const actorIds = menuModule.MENU_BACKGROUND_ACTOR_IDS;
    const totalMenuAssets = environmentIds.length + actorIds.length;
    await modelModule.loadGeneratedModels({
      ids: environmentIds,
      optimizeStatic: true,
      onProgress(done, total) {
        updateMenuProgress(done, totalMenuAssets);
      }
    });
    await modelModule.loadGeneratedModels({
      ids: actorIds,
      optimizeStatic: false,
      onProgress(done) {
        updateMenuProgress(environmentIds.length + done, totalMenuAssets);
      }
    });

    const background = menuModule.createMenuBackground({
      THREE,
      canvas: document.getElementById('menuBackground'),
      clonePrefab: modelModule.clonePrefab
    });

    if (background) {
      background.show();
      window.__menuBackground = background;
      window.__menuBootstrapReady = true;
      loadingEl?.classList.add('is-background-ready');
      setBootstrapProgress(.18, initialLoadingLabel);
      await afterPaint();
    }
  } catch (error) {
    if (shouldPaintMenu) {
      console.warn('[bootstrap] Lightweight menu scene unavailable; continuing with the full loader', error);
    }
    setBootstrapProgress(.05, initialLoadingLabel);
  }

  try {
    await import('./main.js?v=1.0.5');
  } catch (error) {
    console.error('[bootstrap] Game startup failed', error);
    loadingEl?.classList.add('has-error');
    if (loadingLabel) loadingLabel.textContent = 'The broadcast could not start';
    if (loadingText) loadingText.textContent = 'Reload to try again';
  }
}

start();
