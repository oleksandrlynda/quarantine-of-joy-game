// Collision recipes for the late campaign's large structural modules. Keeping
// these separate from the shared street-prop catalog makes their ownership
// explicit and prevents asset-catalog regeneration from dropping level-specific
// fidelity work.

const rotateXZ = ([x, y, z], yaw) => {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [cos * x + sin * z, y, -sin * x + cos * z];
};

const solidBox = (id, position, size, rotation = [0, 0, 0], channels = {}) => Object.freeze({
  id,
  shape: 'box',
  position,
  size,
  rotation,
  blocksMovement: channels.blocksMovement ?? true,
  blocksShots: channels.blocksShots ?? true,
  blocksSight: channels.blocksSight ?? true,
  ...(typeof channels.jumpExpectedPass === 'boolean' ? { jumpExpectedPass: channels.jumpExpectedPass } : {})
});

const centeredRootRotatedBox = (id, position, size, rootYaw, centerXZ, localYaw = 0, channels = {}) => {
  const rotated = rotateXZ(position, rootYaw);
  return solidBox(
    id,
    [rotated[0] - centerXZ[0], rotated[1], rotated[2] - centerXZ[1]],
    size,
    [0, rootYaw + localYaw, 0],
    channels
  );
};

export const CATHEDRAL_KIT_COLLIDER_PROFILE = Object.freeze([
  solidBox('west-column', [-2.65, 2.4, 0], [.65, 4.6, .65]),
  solidBox('east-column', [2.65, 2.4, 0], [.65, 4.6, .65]),
  Object.freeze({ id: 'west-base', shape: 'cylinder', position: [-2.65, .31, 0], size: [1.44, .42, 1.44], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-base', shape: 'cylinder', position: [2.65, .31, 0], size: [1.44, .42, 1.44], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('arch-header', [0, 4.62, -.15], [5.3, .28, .48], [0, 0, 0], { blocksMovement: false })
]);

export const DASHBOARD_WINDOWS_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('cyan-panel', [-2.35, 1.78, 0], [1.9, 3.55, .3], 0, [0, .0938]),
  centeredRootRotatedBox('purple-panel', [0, 1.78, 0], [1.9, 3.55, .3], 0, [0, .0938]),
  centeredRootRotatedBox('orange-panel', [2.35, 1.78, 0], [1.9, 3.55, .3], 0, [0, .0938])
]);

export const CORRIDOR_COLLIDER_PROFILE = Object.freeze([
  solidBox('west-wall', [-2.1, 1.78, 0], [.3, 3.55, 6.2]),
  solidBox('east-wall', [2.1, 1.78, 0], [.3, 3.55, 6.2])
]);

export const CLINIC_WALL_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('wall', [0, 1.45, 0], [6.4, 2.9, .72], 0, [0, .075]),
  centeredRootRotatedBox('west-pillar', [-3.1, 1.57, 0], [.42, 3.14, .9], 0, [0, .075]),
  centeredRootRotatedBox('east-pillar', [3.1, 1.57, 0], [.42, 3.14, .9], 0, [0, .075])
]);

export const ARCHIVES_COLLIDER_PROFILE = Object.freeze([
  // Shelf envelopes keep actors out of the shelving, but bullets and sight
  // may use its real gaps instead of striking an invisible solid cupboard.
  centeredRootRotatedBox('west-shelf', [-1.75, 1.5, -.6], [2, 2.85, .72], 0, [.0535, 0], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('center-shelf', [.7, 1.5, -.6], [2, 2.85, .72], 0, [.0535, 0], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('east-shelf', [2.15, 1.5, 1.15], [2, 2.85, .72], 0, [.0535, 0], -.45, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('fallen-box-west', [-1.4, .28, 1.35], [1.35, .56, .9], 0, [.0535, 0], .3, { jumpExpectedPass: true }),
  centeredRootRotatedBox('fallen-box-east', [-.25, .2, 1.6], [.95, .4, .72], 0, [.0535, 0], -.2, { jumpExpectedPass: true })
]);

export const REINFORCEMENT_DOOR_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('door', [0, 1.85, 0], [5.4, 3.7, .72], 0, [0, .2475]),
  centeredRootRotatedBox('threshold', [0, .09, .28], [4.05, .18, 1.15], 0, [0, .2475], 0, { jumpExpectedPass: true })
]);

export const SHUTTER_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('shutter', [0, 1.82, 0], [5.65, 3.65, .76], 0, [0, .22]),
  centeredRootRotatedBox('threshold', [0, .09, .3], [4.55, .18, 1], 0, [0, .22], 0, { jumpExpectedPass: true })
]);

export const EMERGENCY_SIGN_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-post', [-2.55, 1.75, 0], [.18, 3.5, .18], 0, [.0075, .065]),
  centeredRootRotatedBox('east-post', [2.55, 1.75, 0], [.18, 3.5, .18], 0, [.0075, .065]),
  centeredRootRotatedBox('west-foot', [-2.55, .09, 0], [.62, .18, .62], 0, [.0075, .065], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('east-foot', [2.55, .09, 0], [.62, .18, .62], 0, [.0075, .065], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('sign-panel', [0, 3.07, .09], [5.4, 1.22, .32], 0, [.0075, .065], 0, { blocksMovement: false })
]);

export const CARGO_LIFT_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('deck', [0, .25, 0], [4.5, .5, 3.15], 0, [0, .1025], 0, { jumpExpectedPass: true }),
  // Preserve the open cage: four exact posts replace the previous two solid
  // side walls that made bots shoot invisible panels between the bars.
  ...[-2.05, 2.05].flatMap((x, xIndex) => [-1.35, 1.35].map((z, zIndex) =>
    centeredRootRotatedBox(`post-${xIndex + 1}-${zIndex + 1}`, [x, 2.02, z], [.18, 3.2, .18], 0, [0, .1025])
  )),
  centeredRootRotatedBox('large-cargo', [-.82, 1, -.35], [1.75, 1.02, 1.35], 0, [0, .1025])
]);

export const CATWALK_COLLIDER_PROFILE = Object.freeze([
  // Only the arena-facing support row participates in ground collision. The
  // rear row remains outside the combat lane and no pair is merged into a wall.
  solidBox('west-inner-post', [-2.5, 1.12, .55], [.18, 2.25, .18]),
  solidBox('center-inner-post', [0, 1.12, .55], [.18, 2.25, .18]),
  solidBox('east-inner-post', [2.5, 1.12, .55], [.18, 2.25, .18]),
  solidBox('deck', [0, 2.25, 0], [5.8, .22, 1.5], [0, 0, 0], { blocksMovement: false })
]);

export const LADDER_PLATFORM_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-inner-post', [-1.45, 1.5, .85], [.16, 3, .16], 0, [0, .0725]),
  centeredRootRotatedBox('east-inner-post', [1.45, 1.5, .85], [.16, 3, .16], 0, [0, .0725]),
  centeredRootRotatedBox('ladder-envelope', [-.67, 1.55, 1.18], [.8, 3.15, .13], 0, [0, .0725], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('platform', [0, 3.05, 0], [3.35, .24, 2.2], 0, [0, .0725], 0, { blocksMovement: false })
]);

export const STAIRS_COLLIDER_PROFILE = Object.freeze([
  ...Array.from({ length: 8 }, (_, index) => centeredRootRotatedBox(
    `step-${index + 1}`,
    [0, .14 + index * .27, 1.85 - index * .48],
    [2.65, .28, .55],
    0,
    [0, -.1425],
    0,
    { jumpExpectedPass: true }
  )),
  centeredRootRotatedBox('landing', [0, 2.16, -1.9], [3.05, .28, 1.35], 0, [0, -.1425])
]);

export const MIRROR_CHOIR_COLLIDER_PROFILE = Object.freeze([
  ...Array.from({ length: 5 }, (_, index) => {
    const angle = -.8 + index * .4;
    const x = Math.sin(angle) * 3.5;
    const z = Math.cos(angle) * .9;
    return centeredRootRotatedBox(`mirror-${index + 1}`, [x, 1.48, z], [.94, 2.55, .12], 0, [0, .655], -angle);
  }),
  ...Array.from({ length: 5 }, (_, index) => {
    const angle = -.8 + index * .4;
    const x = Math.sin(angle) * 3.5;
    const z = Math.cos(angle) * .9 + .7;
    return centeredRootRotatedBox(`terminal-${index + 1}`, [x, .56, z], [.72, .92, .62], 0, [0, .655], -angle);
  })
]);

export const ROOT_ALTAR_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'core-base', shape: 'cylinder', position: [0, .21, 0], size: [3.5, .42, 3.5], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'core', shape: 'cylinder', position: [0, .88, 0], size: [2.2, 1.15, 2.2], blocksMovement: true, blocksShots: true, blocksSight: true }),
  ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, index) => solidBox(
    `endpoint-${index + 1}`,
    [Math.cos(angle) * 2.8, 1.15, Math.sin(angle) * 2.8],
    [.72, 2.3, 1.2],
    [0, -angle, 0]
  ))
]);

export const END_CHOICE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('free-console', [-1.15, 1.02, 0], [1.55, 1.7, 1.3], 0, [0, -.02], .08),
  centeredRootRotatedBox('reset-console', [1.15, 1.02, 0], [1.55, 1.7, 1.3], 0, [0, -.02], -.08),
  centeredRootRotatedBox('beacon', [0, 1.42, -1], [.18, 2.45, .18], 0, [0, -.02], 0, { blocksMovement: false })
]);

// The Expanse is already close to its static primitive ceiling. These compact
// profiles preserve every arena-facing hard silhouette while merging only
// contiguous model pieces and treating foliage as non-solid presentation.
export const CARGO_GATE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-container', [-3.05, 1.25, 0], [2.34, 2.5, 2.25], -.08, [0, .00526]),
  centeredRootRotatedBox('east-container', [3.05, 1.25, 0], [2.34, 2.5, 2.25], -.08, [0, .00526])
]);

export const EXPANSE_HESCO_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('lower-run', [0, .63, 0], [6.83, 1.25, 1.05], -.1, [0, .00966], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('upper-run', [0, 1.82, -.04], [4.08, 1.2, 1.05], -.1, [0, .00966])
]);

export const EXPANSE_WINDBREAK_COLLIDER_PROFILE = Object.freeze([
  solidBox('safe-panel', [-3.4, 1.35, .23878], [2.65, 2.7, .22]),
  solidBox('risky-west', [-.76, 1.52, .23878], [1.02, 1.82, .22]),
  solidBox('risky-east', [.78, 1.38, .23878], [1.02, 1.56, .22]),
  solidBox('collapsed-cluster', [3.4, .675, .33], [2.7, 1.35, .65], [0, 0, 0], { jumpExpectedPass: true })
]);

export const EXPANSE_DEAD_TREE_COLLIDER_PROFILE = Object.freeze([
  solidBox('trunk', [.03118, 2.1, -.0182], [.9, 4.25, .8], [0, 0, -.08]),
  Object.freeze({ id: 'west-branch', shape: 'beam', from: [-.00882, 2.72, -.0182], to: [-1.38882, 4.02, .0618], thickness: .38, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-branch', shape: 'beam', from: [.06118, 2.58, .0018], to: [1.45118, 3.78, -.0682], thickness: .36, blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const EXPANSE_BENT_TREE_COLLIDER_PROFILE = Object.freeze([
  solidBox('base', [1.96392, .12, -.08017], [1.42, .24, 1.05], [0, -.22, 0], { jumpExpectedPass: true }),
  solidBox('lower-trunk', [1.52392, 1.25, -.08017], [.92, 2.55, .9], [0, 0, .23]),
  solidBox('upper-trunk', [.71392, 3.25, -.07017], [.72, 2.35, .72], [0, 0, .58])
]);

export const EXPANSE_TOWER_EDGE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('arena-leg-west', [-1.45, 1.75, .8], [.28, 3.6, .28], -.18, [0, 0]),
  centeredRootRotatedBox('arena-leg-east', [1.45, 1.75, .8], [.28, 3.6, .28], -.18, [0, 0]),
  centeredRootRotatedBox('cabin', [0, 4.05, 0], [3.75, 2.1, 2.45], -.18, [0, 0], 0, { blocksMovement: false })
]);
