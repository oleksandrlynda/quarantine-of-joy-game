export const BLOCK_BOX_CHANNELS = Object.freeze(['move', 'shoot', 'see']);

export const BLOCK_BOX_CHANNEL_META = Object.freeze({
  move: Object.freeze({ label: 'MOVE', color: 0x20d7ff, scale: 1.0 }),
  shoot: Object.freeze({ label: 'SHOOT', color: 0xff3d62, scale: 1.012 }),
  see: Object.freeze({ label: 'SEE', color: 0xffdc45, scale: 1.024 })
});

const CHANNEL_ALIASES = Object.freeze({
  move: 'move', movement: 'move',
  shoot: 'shoot', shot: 'shoot', shots: 'shoot', ballistic: 'shoot',
  see: 'see', sight: 'see', vision: 'see', los: 'see'
});

export function resolveBlockBoxChannels(params) {
  const raw = params?.get?.('blockBoxes');
  if (!raw) return [];
  const tokens = String(raw).toLowerCase().split(/[,|+\s]+/).filter(Boolean);
  if (tokens.some(token => token === 'all' || token === '1' || token === 'true')) return [...BLOCK_BOX_CHANNELS];
  const requested = new Set(tokens.map(token => CHANNEL_ALIASES[token]).filter(Boolean));
  return BLOCK_BOX_CHANNELS.filter(channel => requested.has(channel));
}

export function colliderBlocksChannel(definition, channel) {
  if (channel === 'move') return definition?.blocksMovement !== false;
  if (channel === 'shoot') return definition?.blocksShots !== false;
  if (channel === 'see') {
    return definition?.blocksSight == null
      ? definition?.blocksShots !== false
      : definition.blocksSight !== false;
  }
  return false;
}
