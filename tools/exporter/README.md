# Asset exporter

The exporter turns procedural asset factories into normalized GLB files. The browser UI and command-line build both consume `src/assets/registry.js`, so an asset is registered only once. Environment props are authored in `src/assets/environment/index.js` and shared with `low-poly-environment-proposal.html`.

## Browser workflow

Serve the repository over HTTP and open:

```text
/tools/exporter/
```

The browser tool previews the factory output, reports bounds and render metrics, exports one GLB, or writes the complete catalog and `asset-manifest.json` to a selected directory. Browsers without the File System Access API fall back to normal downloads.

## Automated workflow

Validate every registered factory:

```bash
npm run assets:validate
```

Build every registered factory into `assets/generated/`:

```bash
npm run assets:build
```

Verify the generated manifest and every GLB header:

```bash
npm run assets:verify
```

`assets/generated/` is intentionally ignored. CI rebuilds it for pull-request validation and again when creating the deployable Pages artifact.

Build one or more assets into a custom directory:

```bash
node scripts/build-assets.mjs --asset=gruntbot,boss_sanitizer --out=tmp/assets
```

By default, exports are horizontally centered and grounded at `Y = 0`. Use `--no-center` or `--no-ground` only for assets whose authored pivot must remain unchanged.

## Registering an asset

Add its procedural factory to `src/assets/registry.js`. Each definition requires a stable `id`, label, category, factory name, and factory function. The exporter assigns deterministic names to otherwise unnamed nodes and includes category, bounds, and render metrics in the manifest.
