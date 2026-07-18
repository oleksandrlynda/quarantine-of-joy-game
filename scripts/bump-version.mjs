import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(repoRoot, 'package.json');
const versionPath = path.join(repoRoot, 'src', 'version.js');
const indexPath = path.join(repoRoot, 'index.html');
const mainPath = path.join(repoRoot, 'src', 'main.js');
const enemiesPath = path.join(repoRoot, 'src', 'enemies.js');

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
).replace(
  /from '\.\/src\/i18n\/index\.js(?:\?v=[^']+)?'/,
  `from './src/i18n/index.js?v=${nextVersion}'`
);
if (nextIndex === index) throw new Error('Could not find versioned main.js script tag in index.html');
fs.writeFileSync(indexPath, nextIndex, 'utf8');

const main = fs.readFileSync(mainPath, 'utf8');
const nextMain = main
  .replace(/from '\.\/enemies\.js(?:\?v=[^']+)?'/, `from './enemies.js?v=${nextVersion}'`)
  .replace(/from '\.\/i18n\/index\.js(?:\?v=[^']+)?'/, `from './i18n/index.js?v=${nextVersion}'`)
  .replace(/from '\.\/achievements\.js(?:\?v=[^']+)?'/, `from './achievements.js?v=${nextVersion}'`)
  .replace(/from '\.\/version\.js(?:\?v=[^']+)?'/, `from './version.js?v=${nextVersion}'`);
if (nextMain === main) throw new Error('Could not find cache-versioned imports in src/main.js');
fs.writeFileSync(mainPath, nextMain, 'utf8');

const enemies = fs.readFileSync(enemiesPath, 'utf8');
const nextEnemies = enemies.replace(
  /from '\.\/enemies\/manager\.js(?:\?v=[^']+)?'/,
  `from './enemies/manager.js?v=${nextVersion}'`
);
if (nextEnemies === enemies) throw new Error('Could not find cache-versioned enemy manager import in src/enemies.js');
fs.writeFileSync(enemiesPath, nextEnemies, 'utf8');

const achievementsPath = path.join(repoRoot, 'src', 'achievements.js');
const achievements = fs.readFileSync(achievementsPath, 'utf8');
const nextAchievements = achievements.replace(
  /from '\.\/i18n\/index\.js(?:\?v=[^']+)?'/,
  `from './i18n/index.js?v=${nextVersion}'`
);
if (nextAchievements === achievements) throw new Error('Could not find cache-versioned i18n import in src/achievements.js');
fs.writeFileSync(achievementsPath, nextAchievements, 'utf8');

console.log(`Bumped app version to v${nextVersion}`);
