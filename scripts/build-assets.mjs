import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createAssetRegistry } from '../src/assets/registry.js';
import {
  ASSET_EXPORT_VERSION,
  disposeObject3D,
  manifestEntry,
  prepareAssetForExport
} from '../tools/exporter/core.js';

class NodeFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
  }

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

function printHelp() {
  console.log(`Asset exporter

Usage:
  node scripts/build-assets.mjs [options]

Options:
  --asset=<id[,id]>     Build only the selected asset IDs (repeatable)
  --out=<directory>     Output directory (default: assets/generated)
  --validate-only       Build and validate without writing GLB files
  --no-ground           Preserve the factory's original vertical pivot
  --no-center           Preserve the factory's original X/Z pivot
  --help                Show this message
`);
}

function parseArguments(argv) {
  const options = {
    assetIds: [],
    centerXZ: true,
    ground: true,
    help: false,
    out: path.resolve('assets/generated'),
    validateOnly: false
  };

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--validate-only') options.validateOnly = true;
    else if (argument === '--no-ground') options.ground = false;
    else if (argument === '--no-center') options.centerXZ = false;
    else if (argument.startsWith('--out=')) options.out = path.resolve(argument.slice('--out='.length));
    else if (argument.startsWith('--asset=')) {
      options.assetIds.push(...argument.slice('--asset='.length).split(',').map((id) => id.trim()).filter(Boolean));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function formatMetrics(report) {
  const metrics = report.metrics;
  return `${metrics.meshes} meshes · ${metrics.triangles.toLocaleString()} tris · ${metrics.materials} materials`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const registry = createAssetRegistry({ THREE });
  const requested = new Set(options.assetIds);
  const unknown = [...requested].filter((id) => !registry.some((asset) => asset.id === id));
  if (unknown.length) throw new Error(`Unknown asset ID${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);

  const assets = requested.size ? registry.filter((asset) => requested.has(asset.id)) : registry;
  const exporter = new GLTFExporter();
  const manifestAssets = [];
  const failures = [];

  console.log(`${options.validateOnly ? 'Validating' : 'Building'} ${assets.length} asset${assets.length === 1 ? '' : 's'}…`);

  for (const asset of assets) {
    let prepared = null;
    try {
      prepared = prepareAssetForExport({
        THREE,
        definition: asset,
        built: asset.build(),
        centerXZ: options.centerXZ,
        ground: options.ground
      });

      const report = prepared.report;
      if (!report.valid) {
        failures.push({ id: asset.id, issues: report.issues });
        console.error(`FAIL ${asset.id}: ${report.issues.join(' ')}`);
        continue;
      }

      const warningText = report.warnings.length ? ` · ${report.warnings.join(' ')}` : '';
      console.log(`OK   ${asset.id} · ${formatMetrics(report)}${warningText}`);

      if (options.validateOnly) continue;

      const glb = await exporter.parseAsync(prepared.root, {
        binary: true,
        includeCustomExtensions: false,
        onlyVisible: true,
        trs: false
      });
      const categoryDirectory = path.join(options.out, asset.category);
      const filePath = path.join(categoryDirectory, `${asset.id}.glb`);
      await mkdir(categoryDirectory, { recursive: true });
      await writeFile(filePath, new Uint8Array(glb));
      const relativeFile = path.relative(options.out, filePath).split(path.sep).join('/');
      manifestAssets.push(manifestEntry(report, relativeFile));
    } catch (error) {
      failures.push({ id: asset.id, issues: [error?.message || String(error)] });
      console.error(`FAIL ${asset.id}: ${error?.stack || error}`);
    } finally {
      if (prepared?.root) disposeObject3D(prepared.root);
    }
  }

  if (!options.validateOnly) {
    await mkdir(options.out, { recursive: true });
    const manifest = {
      exportVersion: ASSET_EXPORT_VERSION,
      generator: 'scripts/build-assets.mjs',
      assets: manifestAssets
    };
    await writeFile(path.join(options.out, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${manifestAssets.length} GLB file${manifestAssets.length === 1 ? '' : 's'} and asset-manifest.json to ${options.out}`);
  }

  if (failures.length) {
    console.error(`${failures.length} asset${failures.length === 1 ? '' : 's'} failed.`);
    process.exitCode = 1;
  } else {
    console.log(`${assets.length}/${assets.length} assets passed.`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
