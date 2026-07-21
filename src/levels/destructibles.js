const BARREL_POSITIONS_BY_LEVEL = Object.freeze({
  'relay-district': [[-21, -15], [-19.5, -15], [21, -19], [22, 2], [-16, 15], [16, 15]],
  'sanitizer-spire': [[-18, -15], [-16.5, -15], [18, -15], [19, 1], [-14, 15], [13, 15]],
  'ad-zone-arena': [[-20, -15], [-18.5, -15], [19, -15], [21, 1], [-15, 15], [15, 15]],
  'trend-wastes': [[-20, -17], [-18.5, -17], [19, -17], [20, 1], [-15, 16], [15, 16]],
  'freight-annex': [[-22, -19], [-20.5, -19], [22, -18], [23, 2], [-17, 18], [17, 18]],
  'mirror-garden': [[-22, -19], [-20.5, -19], [22, -19], [24, 2], [-17, 19], [17, 19]],
  'content-court': [[-21, -17], [-19.5, -17], [21, -17], [22, 1], [-16, 16], [16, 16]],
  'server-cathedral': [[-21, -18], [-19.5, -18], [21, -18], [22, 2], [-16, 18], [16, 18]],
  'sandstorm-expanse': [[-23, -15], [-21.5, -15], [23, -15], [25, 1], [-18, 16], [18, 16]],
  'floodgate-continuity': [[-25, -19], [-23.5, -19], [25, -19], [27, 2], [-19, 18], [19, 18]],
  'blackout-cistern': [[-19, -16], [-17.5, -16], [19, -16], [20, 1], [-15, 16], [14, 16]]
});

export const CAMPAIGN_DESTRUCTIBLES = Object.freeze(Object.fromEntries(
  Object.entries(BARREL_POSITIONS_BY_LEVEL).map(([levelId, positions]) => [
    levelId,
    Object.freeze(positions.map(([x, z], index) => Object.freeze({
      id: `${levelId}-barrel-${index + 1}`,
      type: 'barrel',
      x,
      z,
      rotY: (index * Math.PI * 0.37) % (Math.PI * 2)
    })))
  ])
));

export function destructiblesForLevel(levelId) {
  return CAMPAIGN_DESTRUCTIBLES[levelId] || Object.freeze([]);
}
