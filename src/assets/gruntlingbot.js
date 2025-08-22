import { createGruntBot } from './gruntbot.js';

export function createGruntlingBot({ THREE, mats, cfg = {}, scale = 0.7, palette } = {}) {
  // Gruntling is a smaller grunt variant with a different color scheme.
  const glow = cfg.color != null ? cfg.color : 0x3d355d;
  const colors = Object.assign({
    armor: 0x9ca3c7,
    joints: 0x232435,
    accent: 0x565a7d,
    visor: 0x111827,
    glow,
  }, palette || {});
  return createGruntBot({ THREE, mats, scale, palette: colors });
}
