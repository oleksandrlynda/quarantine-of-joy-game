export const GENERATED_ASSET_ROOT = 'assets/generated';

// Stable gameplay keys mapped to files emitted by scripts/build-assets.mjs.
// Keep aliases here so gameplay names do not need to match exporter asset IDs.
export const RUNTIME_ASSET_FILES = Object.freeze({
  gruntbot: 'enemies/gruntbot.glb',
  shooterbot: 'enemies/shooterbot.glb',
  runnerbot: 'enemies/runnerbot.glb',
  healerbot: 'enemies/healer_bot.glb',
  sniperbot: 'enemies/sniper_bot.glb',
  winged_drone: 'enemies/winged_drone.glb',
  swarm_warden: 'enemies/swarm_warden.glb',
  blockbot: 'enemies/blockbot.glb',
  boss_broodmaker: 'bosses/boss_broodmaker.glb',
  boss_sanitizer: 'bosses/boss_sanitizer.glb',
  boss_echo: 'bosses/boss_hydraclone.glb',
  boss_influencer: 'bosses/boss_captain.glb',
  boss_zeppelin_pod: 'bosses/boss_zeppelin_pod.glb',
  boss_shard: 'bosses/boss_shard_avatar.glb',
  boss_strike: 'bosses/boss_adjudicator.glb'
});

export function createRuntimeAssetManifest(root = GENERATED_ASSET_ROOT) {
  const normalizedRoot = root.replace(/\/+$/, '');
  return Object.fromEntries(
    Object.entries(RUNTIME_ASSET_FILES).map(([key, file]) => [key, `${normalizedRoot}/${file}`])
  );
}
