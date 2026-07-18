import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createAssetRegistry } from '../../src/assets/registry.js';
import {
  ASSET_EXPORT_VERSION,
  disposeObject3D,
  manifestEntry,
  prepareAssetForExport
} from './core.js';

const registry = createAssetRegistry({ THREE });
const exporter = new GLTFExporter();
const reports = new Map();
let selectedId = registry[0]?.id || null;
let activePrepared = null;
let busy = false;

const elements = {
  assetCount: document.querySelector('#assetCount'),
  assetList: document.querySelector('#assetList'),
  bounds: document.querySelector('#bounds'),
  canvas: document.querySelector('#previewCanvas'),
  category: document.querySelector('#category'),
  centerXZ: document.querySelector('#centerXZ'),
  clearLog: document.querySelector('#clearLog'),
  exportAll: document.querySelector('#exportAll'),
  exportSelected: document.querySelector('#exportSelected'),
  ground: document.querySelector('#ground'),
  log: document.querySelector('#log'),
  messages: document.querySelector('#messages'),
  metricMaterials: document.querySelector('#metricMaterials'),
  metricMeshes: document.querySelector('#metricMeshes'),
  metricNodes: document.querySelector('#metricNodes'),
  metricTriangles: document.querySelector('#metricTriangles'),
  search: document.querySelector('#search'),
  selectedCategory: document.querySelector('#selectedCategory'),
  selectedLabel: document.querySelector('#selectedLabel'),
  validateAll: document.querySelector('#validateAll'),
  validationStatus: document.querySelector('#validationStatus'),
  viewport: document.querySelector('#viewport')
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d130f);
scene.fog = new THREE.Fog(0x0d130f, 18, 46);

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
camera.position.set(5, 3.5, 7);

const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.2, 0);

scene.add(new THREE.HemisphereLight(0xcce5d1, 0x233027, 2.4));
const keyLight = new THREE.DirectionalLight(0xfff1ca, 3.8);
keyLight.position.set(7, 11, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xbaffdc, 1.7);
rimLight.position.set(-8, 5, -7);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(18, 64),
  new THREE.MeshStandardMaterial({ color: 0x253228, roughness: 1, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.015;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(30, 30, 0x526052, 0x354137);
grid.material.transparent = true;
grid.material.opacity = 0.38;
scene.add(grid);

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(message) {
  elements.log.textContent += `\n[${timestamp()}] ${message}`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  elements.validateAll.disabled = busy;
  elements.exportAll.disabled = busy;
  elements.exportSelected.disabled = busy || !activePrepared?.report?.valid;
}

function options() {
  return { ground: elements.ground.checked, centerXZ: elements.centerXZ.checked };
}

function filteredAssets() {
  const query = elements.search.value.trim().toLowerCase();
  const category = elements.category.value;
  return registry.filter((asset) => {
    const matchesCategory = category === 'all' || asset.category === category;
    const haystack = `${asset.id} ${asset.label} ${asset.factoryName}`.toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  });
}

function renderAssetList() {
  const assets = filteredAssets();
  elements.assetCount.textContent = String(assets.length);
  elements.assetList.replaceChildren();

  assets.forEach((asset) => {
    const report = reports.get(asset.id);
    const button = document.createElement('button');
    button.className = `asset-row${asset.id === selectedId ? ' selected' : ''}`;
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(asset.id === selectedId));
    button.dataset.assetId = asset.id;

    const index = document.createElement('span');
    index.className = 'asset-index';
    index.textContent = String(registry.indexOf(asset) + 1).padStart(2, '0');

    const name = document.createElement('span');
    name.className = 'asset-name';
    const strong = document.createElement('strong');
    strong.textContent = asset.label;
    const small = document.createElement('small');
    small.textContent = `${asset.category} · ${asset.id}`;
    name.append(strong, small);

    const status = document.createElement('span');
    status.className = `row-status${report ? (report.valid ? ' valid' : ' invalid') : ''}`;
    status.title = report ? (report.valid ? 'Valid' : 'Validation failed') : 'Not validated';

    button.append(index, name, status);
    button.addEventListener('click', () => selectAsset(asset.id));
    elements.assetList.append(button);
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function renderReport(report) {
  if (!report) return;
  elements.validationStatus.textContent = report.valid ? 'Valid' : 'Invalid';
  elements.validationStatus.className = `status ${report.valid ? 'status-valid' : 'status-invalid'}`;
  elements.metricMeshes.textContent = formatNumber(report.metrics.meshes);
  elements.metricTriangles.textContent = formatNumber(report.metrics.triangles);
  elements.metricMaterials.textContent = formatNumber(report.metrics.materials);
  elements.metricNodes.textContent = formatNumber(report.metrics.nodes);

  if (report.bounds) {
    const { min, max, size } = report.bounds;
    elements.bounds.textContent = [
      `size  ${size.x} × ${size.y} × ${size.z}`,
      `min   ${min.x}, ${min.y}, ${min.z}`,
      `max   ${max.x}, ${max.y}, ${max.z}`
    ].join('\n');
  } else {
    elements.bounds.textContent = 'Bounds unavailable.';
  }

  if (!report.issues.length && !report.warnings.length) {
    elements.messages.innerHTML = '<p class="success">Ready for GLB export.</p>';
  } else {
    const items = [
      ...report.issues.map((message) => `<li class="issue">${escapeHtml(message)}</li>`),
      ...report.warnings.map((message) => `<li class="warning">${escapeHtml(message)}</li>`)
    ].join('');
    elements.messages.innerHTML = `<ul>${items}</ul>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createPrepared(asset) {
  return prepareAssetForExport({ THREE, definition: asset, built: asset.build(), ...options() });
}

function fitCamera(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.25, radius * .8, radius * 1.5));
  camera.near = Math.max(.01, radius / 200);
  camera.far = Math.max(100, radius * 30);
  camera.updateProjectionMatrix();
  controls.update();
}

function selectAsset(id) {
  const asset = registry.find((entry) => entry.id === id);
  if (!asset || busy) return;
  selectedId = asset.id;

  if (activePrepared?.root) {
    scene.remove(activePrepared.root);
    disposeObject3D(activePrepared.root);
  }

  try {
    activePrepared = createPrepared(asset);
    reports.set(asset.id, activePrepared.report);
    scene.add(activePrepared.root);
    fitCamera(activePrepared.root);
    elements.selectedCategory.textContent = `${asset.category} · ${asset.factoryName}`;
    elements.selectedLabel.textContent = asset.label;
    renderReport(activePrepared.report);
    elements.exportSelected.disabled = !activePrepared.report.valid;
  } catch (error) {
    activePrepared = null;
    elements.validationStatus.textContent = 'Build failed';
    elements.validationStatus.className = 'status status-invalid';
    elements.messages.innerHTML = `<p class="issue">${escapeHtml(error?.message || error)}</p>`;
    elements.exportSelected.disabled = true;
    log(`${asset.id}: ${error?.message || error}`);
  }

  renderAssetList();
}

async function createGlb(prepared) {
  return exporter.parseAsync(prepared.root, {
    binary: true,
    includeCustomExtensions: false,
    onlyVisible: true,
    trs: false
  });
}

function downloadBlob(blob, filename) {
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportSelected() {
  if (!activePrepared?.report.valid || busy) return;
  setBusy(true);
  try {
    const glb = await createGlb(activePrepared);
    downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), `${activePrepared.report.id}.glb`);
    log(`Exported ${activePrepared.report.id}.glb (${formatNumber(glb.byteLength)} bytes).`);
  } catch (error) {
    log(`Export failed: ${error?.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function validateAll() {
  if (busy) return;
  setBusy(true);
  let valid = 0;
  log(`Validating ${registry.length} registered assets…`);

  for (const asset of registry) {
    let prepared = null;
    try {
      prepared = createPrepared(asset);
      reports.set(asset.id, prepared.report);
      if (prepared.report.valid) valid += 1;
    } catch (error) {
      reports.set(asset.id, {
        id: asset.id,
        valid: false,
        issues: [error?.message || String(error)],
        warnings: [],
        metrics: { nodes: 0, meshes: 0, materials: 0, vertices: 0, triangles: 0 },
        bounds: null
      });
    } finally {
      if (prepared?.root) disposeObject3D(prepared.root);
    }
  }

  log(`Validation complete: ${valid}/${registry.length} assets valid.`);
  renderAssetList();
  setBusy(false);
  if (selectedId) selectAsset(selectedId);
}

async function directoryWriter(rootDirectory, category, filename, data) {
  const categoryDirectory = await rootDirectory.getDirectoryHandle(category, { create: true });
  const fileHandle = await categoryDirectory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function exportAll() {
  if (busy) return;
  setBusy(true);
  const entries = [];
  let directory = null;

  try {
    if ('showDirectoryPicker' in window) {
      directory = await window.showDirectoryPicker({ mode: 'readwrite', id: 'qoj-asset-export' });
    } else {
      log('Directory access is unavailable; using browser downloads.');
    }

    for (const asset of registry) {
      let prepared = null;
      try {
        prepared = createPrepared(asset);
        reports.set(asset.id, prepared.report);
        if (!prepared.report.valid) {
          log(`Skipped ${asset.id}: validation failed.`);
          continue;
        }

        const glb = await createGlb(prepared);
        const filename = `${asset.id}.glb`;
        const relativeFile = `${asset.category}/${filename}`;
        if (directory) {
          await directoryWriter(directory, asset.category, filename, glb);
        } else {
          downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), filename);
        }
        entries.push(manifestEntry(prepared.report, relativeFile));
        log(`Exported ${relativeFile}.`);
      } finally {
        if (prepared?.root) disposeObject3D(prepared.root);
      }
    }

    const manifest = JSON.stringify({
      exportVersion: ASSET_EXPORT_VERSION,
      generatedAt: new Date().toISOString(),
      generator: 'tools/exporter',
      assets: entries
    }, null, 2);

    if (directory) {
      const manifestHandle = await directory.getFileHandle('asset-manifest.json', { create: true });
      const writable = await manifestHandle.createWritable();
      await writable.write(manifest);
      await writable.close();
    } else {
      downloadBlob(new Blob([manifest], { type: 'application/json' }), 'asset-manifest.json');
    }
    log(`Export complete: ${entries.length}/${registry.length} assets.`);
  } catch (error) {
    if (error?.name === 'AbortError') log('Folder export cancelled.');
    else log(`Export failed: ${error?.message || error}`);
  } finally {
    renderAssetList();
    setBusy(false);
    if (selectedId) selectAsset(selectedId);
  }
}

function resizeRenderer() {
  const width = Math.max(1, elements.viewport.clientWidth);
  const height = Math.max(1, elements.viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

const categories = [...new Set(registry.map((asset) => asset.category))].sort();
categories.forEach((category) => {
  const option = document.createElement('option');
  option.value = category;
  option.textContent = category[0].toUpperCase() + category.slice(1);
  elements.category.append(option);
});

elements.search.addEventListener('input', renderAssetList);
elements.category.addEventListener('change', renderAssetList);
elements.ground.addEventListener('change', () => selectAsset(selectedId));
elements.centerXZ.addEventListener('change', () => selectAsset(selectedId));
elements.exportSelected.addEventListener('click', exportSelected);
elements.exportAll.addEventListener('click', exportAll);
elements.validateAll.addEventListener('click', validateAll);
elements.clearLog.addEventListener('click', () => { elements.log.textContent = 'Log cleared.'; });

new ResizeObserver(resizeRenderer).observe(elements.viewport);
window.addEventListener('beforeunload', () => {
  if (activePrepared?.root) disposeObject3D(activePrepared.root);
  renderer.dispose();
});

renderAssetList();
resizeRenderer();
animate();
if (selectedId) selectAsset(selectedId);
log(`Registry loaded: ${registry.length} assets · export schema v${ASSET_EXPORT_VERSION}.`);
validateAll();
