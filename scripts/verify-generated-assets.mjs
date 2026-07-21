import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as THREE from 'three';
import { createAssetRegistry } from '../src/assets/registry.js';
import { RUNTIME_ASSET_FILES } from '../src/assets/runtime-manifest.js';
import { ASSET_EXPORT_VERSION } from '../tools/exporter/core.js';

const outputDirectory = path.resolve(process.argv[2] || 'assets/generated');
const manifestPath = path.join(outputDirectory, 'asset-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const expectedAssets = createAssetRegistry({ THREE });
const expectedIds = new Set(expectedAssets.map((asset) => asset.id));
const manifestIds = new Set((manifest.assets || []).map((asset) => asset.id));
const manifestFiles = new Set((manifest.assets || []).map((asset) => asset.file));
const errors = [];

if (manifest.exportVersion !== ASSET_EXPORT_VERSION) errors.push(`Unsupported export version: ${manifest.exportVersion}.`);
if (manifestIds.size !== expectedIds.size) {
  errors.push(`Manifest contains ${manifestIds.size} assets; expected ${expectedIds.size}.`);
}

for (const id of expectedIds) {
  if (!manifestIds.has(id)) errors.push(`Manifest is missing asset: ${id}.`);
}

for (const [runtimeKey, file] of Object.entries(RUNTIME_ASSET_FILES)) {
  if (!manifestFiles.has(file)) errors.push(`Runtime model ${runtimeKey} references missing generated file: ${file}.`);
}

for (const entry of manifest.assets || []) {
  if (!/^[a-f0-9]{16}$/.test(entry.revision || '')) {
    errors.push(`Asset ${entry.id} has an invalid or missing content revision.`);
  }
  if (!expectedIds.has(entry.id)) errors.push(`Manifest contains unknown asset: ${entry.id}.`);
  if (!entry.file || path.isAbsolute(entry.file)) {
    errors.push(`${entry.id} has an invalid generated file path.`);
    continue;
  }

  const filePath = path.resolve(outputDirectory, entry.file);
  const relative = path.relative(outputDirectory, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`${entry.id} resolves outside the generated asset directory.`);
    continue;
  }

  try {
    const fileStat = await stat(filePath);
    const bytes = await readFile(filePath);
    const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    if (fileStat.size < 20) errors.push(`${entry.id} GLB is unexpectedly small.`);
    if (entry.revision !== revision) errors.push(`${entry.id} content revision does not match its GLB.`);
    if (bytes.toString('ascii', 0, 4) !== 'glTF') errors.push(`${entry.id} does not have a GLB header.`);
    if (bytes.readUInt32LE(4) !== 2) errors.push(`${entry.id} is not glTF 2.`);
    if (bytes.readUInt32LE(8) !== bytes.byteLength) errors.push(`${entry.id} GLB length header does not match its file size.`);
  } catch (error) {
    errors.push(`${entry.id} could not be read: ${error?.message || error}`);
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(`ERROR ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Verified ${expectedIds.size} generated GLB assets and asset-manifest.json.`);
}
