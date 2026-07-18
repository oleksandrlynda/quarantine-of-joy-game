import {
  createEnhancedBlockBot,
  createEnhancedGruntBot,
  createEnhancedGruntlingBot,
  createEnhancedHealerBot,
  createEnhancedRunnerBot,
  createEnhancedShooterBot,
  createEnhancedSniperBot,
  createEnhancedSwarmWarden,
  createEnhancedWingedDrone
} from './enemy-retrofits.js';
import { createBroodmakerAsset } from './boss_broodmaker.js';
import {
  createEnhancedCaptainAsset,
  createEnhancedHydracloneAsset,
  createEnhancedSanitizerAsset,
  createEnhancedZeppelinAsset
} from './boss-retrofits.js';
import { createShardAvatarAsset } from './boss_shard_avatar.js';
import { createStrikeAdjudicatorAsset } from './boss_adjudicator.js';
import { createAlgorithmAsset } from './boss_algorithm.js';
import { createEnvironmentAssetRegistry } from './environment/index.js';

export const ASSET_DEFINITIONS = Object.freeze([
  { id: 'gruntbot', label: 'Grunt Bot', category: 'enemies', factoryName: 'createEnhancedGruntBot', create: createEnhancedGruntBot },
  { id: 'gruntlingbot', label: 'Gruntling Bot', category: 'enemies', factoryName: 'createEnhancedGruntlingBot', create: createEnhancedGruntlingBot, scale: 0.7 },
  { id: 'shooterbot', label: 'Shooter Bot', category: 'enemies', factoryName: 'createEnhancedShooterBot', create: createEnhancedShooterBot },
  { id: 'runnerbot', label: 'Runner Bot', category: 'enemies', factoryName: 'createEnhancedRunnerBot', create: createEnhancedRunnerBot },
  { id: 'blockbot', label: 'Block Bot', category: 'enemies', factoryName: 'createEnhancedBlockBot', create: createEnhancedBlockBot },
  { id: 'winged_drone', label: 'Winged Drone', category: 'enemies', factoryName: 'createEnhancedWingedDrone', create: createEnhancedWingedDrone },
  { id: 'healer_bot', label: 'Healer Bot', category: 'enemies', factoryName: 'createEnhancedHealerBot', create: createEnhancedHealerBot },
  { id: 'sniper_bot', label: 'Sniper Bot', category: 'enemies', factoryName: 'createEnhancedSniperBot', create: createEnhancedSniperBot },
  { id: 'swarm_warden', label: 'Swarm Warden', category: 'enemies', factoryName: 'createEnhancedSwarmWarden', create: createEnhancedSwarmWarden },
  { id: 'boss_broodmaker', label: 'Broodmaker', category: 'bosses', factoryName: 'createBroodmakerAsset', create: createBroodmakerAsset, exportOptions: { outline: false } },
  { id: 'boss_sanitizer', label: 'Sanitizer', category: 'bosses', factoryName: 'createEnhancedSanitizerAsset', create: createEnhancedSanitizerAsset },
  { id: 'boss_hydraclone', label: 'Hydraclone', category: 'bosses', factoryName: 'createEnhancedHydracloneAsset', create: createEnhancedHydracloneAsset },
  { id: 'boss_captain', label: 'Influencer Captain', category: 'bosses', factoryName: 'createEnhancedCaptainAsset', create: createEnhancedCaptainAsset },
  { id: 'boss_zeppelin_pod', label: 'Ad Zeppelin', category: 'bosses', factoryName: 'createEnhancedZeppelinAsset', create: createEnhancedZeppelinAsset },
  { id: 'boss_shard_avatar', label: 'Shard Avatar', category: 'bosses', factoryName: 'createShardAvatarAsset', create: createShardAvatarAsset },
  { id: 'boss_adjudicator', label: 'Strike Adjudicator', category: 'bosses', factoryName: 'createStrikeAdjudicatorAsset', create: createStrikeAdjudicatorAsset },
  { id: 'boss_algorithm', label: 'The Algorithm', category: 'bosses', factoryName: 'createAlgorithmAsset', create: createAlgorithmAsset }
]);

export function createAssetExportMaterials(THREE) {
  return {
    head: new THREE.MeshLambertMaterial({ color: 0x111827, name: 'export_head' }),
    glow: new THREE.MeshLambertMaterial({ color: 0xbef264, emissive: 0x365314, name: 'export_glow' })
  };
}

function createAssetRng(id) {
  let state = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    state ^= id.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAssetRegistry({ THREE } = {}) {
  if (!THREE) throw new TypeError('createAssetRegistry requires THREE.');

  const characterAssets = ASSET_DEFINITIONS.map((definition) => ({
    ...definition,
    build() {
      const mats = createAssetExportMaterials(THREE);
      return definition.create({
        THREE,
        mats,
        scale: definition.scale ?? 1.0,
        rng: createAssetRng(definition.id),
        ...definition.exportOptions
      });
    }
  }));

  return [...characterAssets, ...createEnvironmentAssetRegistry({ THREE })];
}

export function getAssetDefinition(id, { THREE } = {}) {
  const characterDefinition = ASSET_DEFINITIONS.find((definition) => definition.id === id);
  if (characterDefinition) return characterDefinition;
  if (!THREE) return null;
  return createEnvironmentAssetRegistry({ THREE }).find((definition) => definition.id === id) || null;
}
