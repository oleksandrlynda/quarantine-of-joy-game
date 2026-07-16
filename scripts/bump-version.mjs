import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(repoRoot, 'package.json');
const versionPath = path.join(repoRoot, 'src', 'version.js');
const indexPath = path.join(repoRoot, 'index.html');

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Expected semver version x.y.z, got "${version}"`);
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const nextVersion = bumpPatch(pkg.version);
pkg.version = nextVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

fs.writeFileSync(
  versionPath,
  `export const APP_VERSION = '${nextVersion}';\nexport const APP_VERSION_LABEL = \`v\${APP_VERSION}\`;\n`,
  'utf8'
);

const index = fs.readFileSync(indexPath, 'utf8');
const nextIndex = index.replace(
  /src="src\/main\.js\?v=[^"]+"/,
  `src="src/main.js?v=${nextVersion}"`
);
if (nextIndex === index) throw new Error('Could not find versioned main.js script tag in index.html');
fs.writeFileSync(indexPath, nextIndex, 'utf8');

console.log(`Bumped app version to v${nextVersion}`);
