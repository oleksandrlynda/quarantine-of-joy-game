const CHANNEL_KEYS = Object.freeze(['blocksMovement', 'blocksShots', 'blocksSight']);

export const assetColliderProfileIds = (idPrefix, primitives) =>
  (primitives || []).map(primitive => `${idPrefix}-${primitive.id}`);

function finiteTuple(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain ${length} finite numbers.`);
  }
  return value;
}

function explicitChannels(channels = {}) {
  const result = {};
  for (const key of CHANNEL_KEYS) {
    if (typeof channels[key] !== 'boolean') {
      throw new TypeError(`Asset collider primitive requires an explicit ${key} boolean.`);
    }
    result[key] = channels[key];
  }
  return result;
}

function rotateXZ([x, y, z], yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [cos * x + sin * z, y, -sin * x + cos * z];
}

function solidBox(id, position, size, rotation = [0, 0, 0], channels = {}) {
  return Object.freeze({
    id, shape: 'box', position, size, rotation,
    blocksMovement: channels.blocksMovement ?? true,
    blocksShots: channels.blocksShots ?? true,
    blocksSight: channels.blocksSight ?? true,
    ...(typeof channels.jumpExpectedPass === 'boolean' ? { jumpExpectedPass: channels.jumpExpectedPass } : {})
  });
}

function centeredRootRotatedBox(id, position, size, rootYaw, centerXZ, localYaw = 0, channels = {}) {
  const rotated = rotateXZ(position, rootYaw);
  return solidBox(
    id,
    [rotated[0] - centerXZ[0], rotated[1], rotated[2] - centerXZ[1]],
    size,
    [0, rootYaw + localYaw, 0],
    channels
  );
}

function transformPoint(point, placement) {
  const scale = placement.scale ?? 1;
  const rotated = rotateXZ(point.map(value => value * scale), placement.yaw ?? 0);
  return [
    placement.position[0] + rotated[0],
    placement.position[1] + rotated[1],
    placement.position[2] + rotated[2]
  ];
}

function commonDefinition({ assetId, idPrefix, primitive, placement, tags }) {
  if (!assetId || !idPrefix || !primitive?.id) throw new TypeError('Asset collider profile requires asset, prefix, and primitive IDs.');
  const definition = {
    id: `${idPrefix}-${primitive.id}`,
    shape: primitive.shape || 'box',
    assetId,
    primitiveId: primitive.id,
    tags: [...new Set([...(tags || []), ...(primitive.tags || [])])],
    ...explicitChannels(primitive)
  };
  if (typeof primitive.jumpExpectedPass === 'boolean') definition.jumpExpectedPass = primitive.jumpExpectedPass;
  return definition;
}

/**
 * Converts an asset-local, low-primitive collision recipe into authored world
 * definitions. Profiles live with the model sources so geometry changes and
 * collision changes can be reviewed together. Rendered triangles remain
 * presentation-only; these recipes stay deterministic for production use.
 */
export function instantiateAssetColliderProfile({ assetId, idPrefix, placement, primitives, tags = [] }) {
  if (!placement?.position) throw new TypeError('Asset collider placement requires a position.');
  finiteTuple(placement.position, 3, 'Asset collider placement position');
  if (!Number.isFinite(placement.scale ?? 1) || (placement.scale ?? 1) <= 0) {
    throw new TypeError('Asset collider placement scale must be positive.');
  }
  if (!Number.isFinite(placement.yaw ?? 0)) throw new TypeError('Asset collider placement yaw must be finite.');

  const inheritedTags = [...new Set([...(placement.tags || []), ...(tags || [])])];
  return (primitives || []).map(primitive => {
    const definition = commonDefinition({ assetId, idPrefix, primitive, placement, tags: inheritedTags });
    const scale = placement.scale ?? 1;
    if (primitive.shape === 'beam') {
      definition.from = transformPoint(finiteTuple(primitive.from, 3, `${primitive.id} beam start`), placement);
      definition.to = transformPoint(finiteTuple(primitive.to, 3, `${primitive.id} beam end`), placement);
      definition.thickness = Number(primitive.thickness) * scale;
      definition.depth = Number(primitive.depth ?? primitive.thickness) * scale;
      if (!(definition.thickness > 0) || !(definition.depth > 0)) {
        throw new TypeError(`${primitive.id} beam thickness and depth must be positive.`);
      }
      return definition;
    }

    const localPosition = finiteTuple(primitive.position, 3, `${primitive.id} position`);
    const localSize = finiteTuple(primitive.size, 3, `${primitive.id} size`);
    if (!localSize.every(value => value > 0)) throw new TypeError(`${primitive.id} size must be positive.`);
    definition.position = transformPoint(localPosition, placement);
    definition.size = localSize.map(value => value * scale);
    if (Number.isFinite(primitive.horizontalCylinderYaw)) {
      definition.rotation = [Math.PI / 2, 0, -(primitive.horizontalCylinderYaw + (placement.yaw ?? 0))];
      return definition;
    }
    const rotation = primitive.rotation || [0, 0, 0];
    finiteTuple(rotation, 3, `${primitive.id} rotation`);
    definition.rotation = [rotation[0], rotation[1] + (placement.yaw ?? 0), rotation[2]];
    return definition;
  });
}

export const RELAY_MAST_COLLIDER_PROFILE = Object.freeze([
  // Five horizontal slabs approximate the decagonal 3.614 x 3.8 m base without
  // inheriting the empty corners of its outer AABB. They deliberately remain
  // movement-only so hitscan uses the exact round proxy below.
  Object.freeze({ id: 'move-center', shape: 'box', position: [0, .52, 0], size: [3.614, 1.04, 1.2], blocksMovement: true, blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'move-north-mid', shape: 'box', position: [0, .52, .975], size: [3.43, 1.04, .75], blocksMovement: true, blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'move-south-mid', shape: 'box', position: [0, .52, -.975], size: [3.43, 1.04, .75], blocksMovement: true, blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'move-north-cap', shape: 'box', position: [0, .52, 1.625], size: [2.54, 1.04, .55], blocksMovement: true, blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'move-south-cap', shape: 'box', position: [0, .52, -1.625], size: [2.54, 1.04, .55], blocksMovement: true, blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'shot-base', shape: 'cylinder', position: [0, .14, 0], size: [3.614, .28, 3.8], blocksMovement: false, blocksShots: true, blocksSight: true }),
  // The pedestal is a tapered 1.15m-to-.7m radius frustum in the model. Two
  // cylinders follow that taper closely without adding a bespoke mesh shape.
  Object.freeze({ id: 'shot-pedestal-lower', shape: 'cylinder', position: [0, .4375, 0], size: [2.1, .325, 2.1], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-pedestal-upper', shape: 'cylinder', position: [0, .7625, 0], size: [1.6, .325, 1.6], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-pole', shape: 'cylinder', position: [0, 3.5, 0], size: [.32, 6.6, .32], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-leg-east', shape: 'beam', from: [1.15, .26, 0], to: [0, 5.4, 0], thickness: .15, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-leg-north-west', shape: 'beam', from: [-.575, .26, .996], to: [0, 5.4, 0], thickness: .15, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-leg-south-west', shape: 'beam', from: [-.575, .26, -.996], to: [0, 5.4, 0], thickness: .15, blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const LIGHT_MAST_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'box', position: [0, .55, 0], size: [2.55, 1.1, 1.9], rotation: [0, -.18, 0], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'pole', shape: 'box', position: [0, 2.88, 0], size: [.3, 4.4, .3], rotation: [0, -.18, 0], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'lamp-bar', shape: 'box', position: [0, 4.9, 0], size: [3.15, .54, .5], rotation: [0, -.18, 0], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const STREET_TREE_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'planter', shape: 'box', position: [0, .43, 0], size: [3.3, .86, 2.65], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'trunk', shape: 'cylinder', position: [0, 2.35, 0], size: [.92, 3.1, .92], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const TERMINAL_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'box', position: [0, .15, 0], size: [2.4, .3, 1.8], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'cabinet', shape: 'box', position: [0, 1.02, 0], size: [1.45, 1.65, 1.18], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'screen', shape: 'box', position: [0, 2.32, .6], size: [1.85, 1.35, .34], rotation: [-.12, 0, 0], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'antenna', shape: 'cylinder', position: [.66, 2.58, -.26], size: [.2, 1.72, .2], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const POWER_RELAY_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'box', position: [0, .16, 0], size: [3.2, .32, 2.4], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'support-west', shape: 'box', position: [-1.08, 1.42, 0], size: [.42, 2.55, .42], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'support-east', shape: 'box', position: [1.08, 1.42, 0], size: [.42, 2.55, .42], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'cap-west', shape: 'cylinder', position: [-1.08, 2.75, 0], size: [1.4, .28, 1.4], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'cap-east', shape: 'cylinder', position: [1.08, 2.75, 0], size: [1.4, .28, 1.4], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'coil', shape: 'cylinder', position: [0, 1.55, 0], size: [1.9, .5, 1.9], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'core', shape: 'cylinder', position: [0, 1.55, 0], size: [.44, 1.72, .44], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const CAPTURE_BEACON_COLLIDER_PROFILE = Object.freeze([
  // Five low movement slabs approximate the decagonal base. Ballistic checks
  // use the elliptical cylinder below, so empty outer corners stay shootable.
  Object.freeze({ id: 'move-center', shape: 'box', position: [0, .27, 0], size: [4.8504, .54, 1.65], blocksMovement: true, blocksShots: false, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'move-north-mid', shape: 'box', position: [0, .27, 1.42], size: [4.5, .54, 1.2], blocksMovement: true, blocksShots: false, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'move-south-mid', shape: 'box', position: [0, .27, -1.42], size: [4.5, .54, 1.2], blocksMovement: true, blocksShots: false, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'move-north-cap', shape: 'box', position: [0, .27, 2.25], size: [3.0, .54, .5], blocksMovement: true, blocksShots: false, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'move-south-cap', shape: 'box', position: [0, .27, -2.25], size: [3.0, .54, .5], blocksMovement: true, blocksShots: false, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'shot-base', shape: 'cylinder', position: [0, .27, 0], size: [4.8504, .54, 5.1], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-pole', shape: 'cylinder', position: [0, 1.88, 0], size: [1.1, 2.8, 1.1], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'shot-crown', shape: 'box', position: [0, 3.55, 0], size: [.82, 1.16, .82], rotation: [0, Math.PI / 4, 0], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

// Reusable Relay street props. These follow the actual authored component
// layout (including the model root yaw), not the outer bounding box. Keeping
// them to 1–5 boxes preserves cheap analytic raycasts while retaining portals,
// L-corners, and gaps between modules.
export const APARTMENT_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('front-wing', [0, 2.4, -.8], [5.2, 4.8, 1], -.35, [-.18989, -.06047]),
  centeredRootRotatedBox('side-wing', [-2.1, 2.13, .75], [1.0, 4.25, 4.2], -.35, [-.18989, -.06047])
]);

export const CORNER_SHOP_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('shop-body', [0, 1.63, 0], [5.68, 3.26, 3.8], -.28, [0, .33548])
]);

export const CHECKPOINT_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-post', [-2.45, 1.52, 0], [.32, 3.05, .32], 0, [0, .16592]),
  centeredRootRotatedBox('east-post', [2.45, 1.52, 0], [.32, 3.05, .32], 0, [0, .16592]),
  centeredRootRotatedBox('header', [0, 3.12, 0], [5.65, .68, .68], 0, [0, .16592], 0, { blocksMovement: false }),
  centeredRootRotatedBox('west-gate', [-1.41, 1.32, 0], [1.9, 2.18, .12], 0, [0, .16592], .18),
  centeredRootRotatedBox('east-gate', [1.41, 1.32, 0], [1.9, 2.18, .12], 0, [0, .16592], -.18)
]);

export const GABION_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('lower-west', [-1.28, .53, .15], [2.15, 1.05, 1.15], -.18, [-.18167, -.08522]),
  centeredRootRotatedBox('lower-east', [1, .431, -.25], [1.935, .861, 1.15], -.18, [-.18167, -.08522]),
  centeredRootRotatedBox('upper', [-.05, 1.493, -.1], [1.978, .95, 1.058], -.18, [-.18167, -.08522])
]);

export const BARRIERS_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-module', [-2, .618, .25], [2.38, 1.235, 1.02], 0, [.02776, .13735], -.18, { jumpExpectedPass: true }),
  centeredRootRotatedBox('center-module', [0, .618, 0], [2.38, 1.235, 1.02], 0, [.02776, .13735], .03, { jumpExpectedPass: true }),
  centeredRootRotatedBox('east-module', [2.05, .618, .32], [2.38, 1.235, 1.02], 0, [.02776, .13735], .2, { jumpExpectedPass: true })
]);

export const ROADBLOCK_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('van-body', [0, 1.1, 0], [4.3, 2.2, 2.2], -.2, [-.18263, .12114]),
  centeredRootRotatedBox('van-cab', [2.48, 1.04, 0], [1.5, 2.08, 2.1], -.2, [-.18263, .12114]),
  centeredRootRotatedBox('west-barrier', [-2.8, .618, 1.25], [2.38, 1.235, 1.02], -.2, [-.18263, .12114], -.28, { jumpExpectedPass: true }),
  centeredRootRotatedBox('east-barrier', [2.5, .618, -1.4], [2.38, 1.235, 1.02], -.2, [-.18263, .12114], .2, { jumpExpectedPass: true })
]);

export const BREACH_VENT_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-frame', [-2.1, 1.725, 0], [1, 3.45, .72], 0, [0, .28453]),
  centeredRootRotatedBox('east-frame', [2.1, 1.725, 0], [1, 3.45, .72], 0, [0, .28453]),
  // AI and player traversal use this as a real portal. The low visible sill can
  // catch bullets, but must not become a knee-high navigation wall.
  centeredRootRotatedBox('sill', [0, .34, 0], [3.2, .68, .72], 0, [0, .28453], 0, { blocksMovement: false }),
  centeredRootRotatedBox('header', [0, 3.01, 0], [3.2, .88, .72], 0, [0, .28453], 0, { blocksMovement: false })
]);

export const CORNER_COVER_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-arm', [-.7, .678, 0], [4.55, 1.355, 1], 0, [-.26558, 1.35]),
  centeredRootRotatedBox('north-arm', [1.9, .678, 1.35], [1, 1.355, 3.7], 0, [-.26558, 1.35])
]);

export const FACADE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('sill', [0, .29, 0], [5.8, .58, .72], 0, [.0072, .35399], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('west-post', [-2.55, 1.82, 0], [.72, 3.15, .72], 0, [.0072, .35399]),
  centeredRootRotatedBox('center-post', [0, 1.58, 0], [.72, 2.7, .72], 0, [.0072, .35399]),
  centeredRootRotatedBox('east-post', [2.55, 1.98, 0], [.72, 3.45, .72], 0, [.0072, .35399]),
  centeredRootRotatedBox('west-header', [-1.32, 3, 0], [2.02, .55, .72], 0, [.0072, .35399], 0, { blocksMovement: false }),
  centeredRootRotatedBox('east-header', [1.32, 3.22, 0], [2.02, .55, .72], 0, [.0072, .35399], 0, { blocksMovement: false })
]);

// Reused environment families below deliberately follow the authored modules
// instead of their outer Box3. This keeps the runtime on cheap pooled analytic
// primitives while preserving firing gaps and empty space between variants.
export const CLINIC_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('movement-shell', [0, 1.58, 0], [5.9, 3.2, 3.8], -.2, [0, .14593], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('rear-ballistic', [0, 1.58, -1.7], [5.9, 3.2, .4], -.2, [0, .14593], 0, { blocksMovement: false }),
  centeredRootRotatedBox('west-ballistic', [-2.75, 1.58, 0], [.4, 3.2, 3.4], -.2, [0, .14593], 0, { blocksMovement: false }),
  centeredRootRotatedBox('east-ballistic', [2.75, 1.58, 0], [.4, 3.2, 3.4], -.2, [0, .14593], 0, { blocksMovement: false }),
  centeredRootRotatedBox('front-sill', [0, .48, 1.72], [5.2, .96, .36], -.2, [0, .14593], 0, { blocksMovement: false }),
  centeredRootRotatedBox('front-header', [0, 2.8, 1.72], [5.2, .75, .36], -.2, [0, .14593], 0, { blocksMovement: false })
]);

export const COVER_HEIGHTS_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('low', [-2.1, .62, 0], [1.55, 1.18, .9], 0, [0, .0075], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('low-base', [-2.1, .09, 0], [1.72, .18, 1.05], 0, [0, .0075], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('mid', [0, 1.18, 0], [1.55, 2.3, .9], 0, [0, .0075]),
  centeredRootRotatedBox('mid-base', [0, .09, 0], [1.72, .18, 1.05], 0, [0, .0075], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('tall', [2.1, 1.9, 0], [1.55, 3.72, .9], 0, [0, .0075]),
  centeredRootRotatedBox('tall-base', [2.1, .09, 0], [1.72, .18, 1.05], 0, [0, .0075], 0, { jumpExpectedPass: true })
]);

export const PEEK_COVER_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('west-mass', [-1.78, 1.29, 0], [2.55, 2.58, .95], 0, [0, .015]),
  centeredRootRotatedBox('east-mass', [1.78, 1.29, 0], [2.55, 2.58, .95], 0, [0, .015]),
  centeredRootRotatedBox('sill', [0, .54, 0], [1.22, 1.08, .82], 0, [0, .015], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('lintel', [0, 2.17, 0], [1.22, .56, .82], 0, [0, .015], 0, { blocksMovement: false })
]);

export const BREAKABLE_COVER_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('intact', [-1.62, .7, 0], [2.55, 1.4, .82], 0, [-.16, .01676], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('fracture', [.45, .38, 0], [1.2, .75, .82], 0, [-.16, .01676], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('rubble-a', [1.38, .25, .08], [.78, .5, .72], 0, [-.16, .01676], .28, { jumpExpectedPass: true }),
  centeredRootRotatedBox('rubble-b', [2.08, .2, -.12], [.65, .4, .58], 0, [-.16, .01676], -.35, { jumpExpectedPass: true })
]);

export const PIPES_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('lower-front', [-.3, .82, .8], [2.9, 1.64, 1.64], -.28, [-.18711, -.11306], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('lower-rear', [-.3, .82, -.9], [2.9, 1.64, 1.64], -.28, [-.18711, -.11306], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('upper', [-.3, 2.15, -.05], [2.9, 1.64, 1.64], -.28, [-.18711, -.11306])
]);

export const REEL_COLLIDER_PROFILE = Object.freeze([
  // Five vertical slices approximate the circular reel flanges. A single box
  // fills their empty upper/lower corners and creates metre-scale phantom hits.
  centeredRootRotatedBox('drum-center', [0, 1.38, 0], [1.3, 2.7, 1.68], -.28, [.85477, .59411], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('drum-west', [-.9, 1.38, 0], [.6, 2.1, 1.68], -.28, [.85477, .59411], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('drum-east', [.9, 1.38, 0], [.6, 2.1, 1.68], -.28, [.85477, .59411], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('drum-west-edge', [-1.275, 1.38, 0], [.15, 1.2, 1.68], -.28, [.85477, .59411], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('drum-east-edge', [1.275, 1.38, 0], [.15, 1.2, 1.68], -.28, [.85477, .59411], 0, { blocksShots: false, blocksSight: false }),
  Object.freeze({ id: 'ballistic-drum', shape: 'cylinder', position: [-.85477, 1.38, -.59411], size: [2.4, 1.68, 2.4], horizontalCylinderYaw: -.28, blocksMovement: false, blocksShots: true, blocksSight: true }),
  centeredRootRotatedBox('base', [0, .12, 0], [2.8, .24, 2], -.28, [.85477, .59411], 0, { jumpExpectedPass: true })
]);

export const BROADLEAF_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('planter', [-.25, .1, .18], [1.15, .2, .82], 0, [-.01549, -.05802], .3, { jumpExpectedPass: true }),
  Object.freeze({ id: 'trunk', shape: 'cylinder', position: [.01549, 1.72, .05802], size: [1.1, 3.45, 1.1], blocksMovement: true, blocksShots: true, blocksSight: true })
]);

export const WINDBREAKS_COLLIDER_PROFILE = Object.freeze([
  solidBox('safe-panel', [-3.4, 1.35, .23878], [2.65, 2.7, .22]),
  solidBox('risky-west', [-.76, 1.52, .23878], [1.02, 1.82, .22]),
  solidBox('risky-east', [.78, 1.38, .23878], [1.02, 1.56, .22]),
  solidBox('collapsed-west', [3.08, .68, .23878], [1.45, 1.08, .32], [0, 0, .34], { jumpExpectedPass: true }),
  solidBox('collapsed-east', [4.15, .48, .41878], [.92, .8, .4], [0, .15, -.42], { jumpExpectedPass: true }),
  solidBox('collapsed-post-west', [2.15, .675, .23878], [.2, 1.35, .2]),
  solidBox('collapsed-post-east', [4.65, .675, .23878], [.2, 1.35, .2])
]);

export const GLITCH_TOPIARY_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base-0', shape: 'cylinder', position: [-2.27196, .24, 0], size: [1.64, .48, 1.64], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'trunk-0', shape: 'cylinder', position: [-2.27196, 1.22, 0], size: [.48, 1.65, .48], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'crown-0', shape: 'cylinder', position: [-2.27196, 2, 0], size: [1.64, 2.05, 1.64], blocksMovement: false, blocksShots: true, blocksSight: true }),
  solidBox('glitch-cube-0', [-1.69196, 2.42, .12], [.58, .58, .58], [0, 0, 0], { blocksMovement: false }),
  Object.freeze({ id: 'base-1', shape: 'cylinder', position: [-.07196, .24, 0], size: [1.64, .48, 1.64], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'trunk-1', shape: 'cylinder', position: [-.07196, 1.22, 0], size: [.48, 1.65, .48], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'crown-1', shape: 'cylinder', position: [.01804, 2.15, 0], size: [1.55, 1.9, 1.55], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'base-2', shape: 'cylinder', position: [2.12804, .24, 0], size: [1.64, .48, 1.64], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'trunk-2', shape: 'cylinder', position: [2.12804, 1.22, 0], size: [.48, 1.65, .48], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('fragment-west-2', [1.62804, 1.85, 0], [.88, .72, .82], [0, 1.85, .12], { blocksMovement: false }),
  solidBox('fragment-east-2', [2.47804, 2.2, .18], [.88, .72, .82], [0, 2.2, .12], { blocksMovement: false }),
  solidBox('fragment-top-2', [2.27804, 2.75, -.12], [.88, .72, .82], [0, 2.75, .12], { blocksMovement: false })
]);

export const KIOSK_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('body', [0, 1.38, 0], [4.15, 2.76, 2.55], -.24, [0, .08631]),
  centeredRootRotatedBox('counter', [-.55, .88, 1.55], [2.5, .24, .72], -.24, [0, .08631], -.08, { jumpExpectedPass: true })
]);

export const TOWER_COLLIDER_PROFILE = Object.freeze([
  ...[[-1.45, -.8], [1.45, -.8], [-1.45, .8], [1.45, .8]].map(([x, z], index) =>
    centeredRootRotatedBox(`leg-${index}`, [x, 1.75, z], [.28, 3.6, .28], -.18, [0, 0])
  ),
  centeredRootRotatedBox('deck', [0, 3.25, 0], [3.45, .3, 2.15], -.18, [0, 0], 0, { blocksMovement: false }),
  centeredRootRotatedBox('cabin', [0, 4.05, 0], [3.2, 1.65, 1.95], -.18, [0, 0], 0, { blocksMovement: false })
]);

export const GUARD_BOOTH_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('booth', [0, 1.34, 0], [3.3, 2.7, 2.8], -.24, [1.16988, .19513]),
  centeredRootRotatedBox('barrier-arm', [3.08, .95, 1.18], [3.75, .3, .2], -.24, [1.16988, .19513], 0, { jumpExpectedPass: true }),
  centeredRootRotatedBox('barrier-post', [1.25, .82, 1.18], [.22, 1.65, .22], -.24, [1.16988, .19513])
]);

export const SPONSOR_PROJECTOR_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .22, 0], size: [1.8, .44, 1.8], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'pole', shape: 'cylinder', position: [0, 1.4, 0], size: [.44, 2.2, .44], blocksMovement: false, blocksShots: true, blocksSight: true }),
  solidBox('head', [0, 2.48, 0], [1.15, .72, .86], [-.08, .28, 0], { blocksMovement: false })
]);

export const STORM_BEACON_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .15, 0], size: [3.1, .3, 3.1], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  ...[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle, index) => Object.freeze({
    id: `leg-${index}`, shape: 'beam',
    from: [Math.cos(angle) * 1.05, .25, Math.sin(angle) * 1.05], to: [0, 5.25, 0], thickness: .13,
    blocksMovement: false, blocksShots: true, blocksSight: true
  })),
  Object.freeze({ id: 'crown', shape: 'cylinder', position: [0, 5.18, 0], size: [1.94, 1.18, 1.94], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

// Post-campaign props use compact analytic recipes. These follow the authored
// modules instead of promoting each model's outer AABB to a large invisible
// cube, and stay far below the per-asset twelve-primitive budget.
export const AMMO_STATION_COLLIDER_PROFILE = Object.freeze([
  solidBox('cabinet', [0, 1.545, 0], [3.82, 3.09, 1.62])
]);

export const MED_CACHE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('cabinet', [0, 1.395, 0], [3.6, 2.79, 2.35], -.22, [0, 0])
]);

export const STORM_SIREN_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .17, 0], size: [3.6, .34, 3.6], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'mast', shape: 'cylinder', position: [0, 3.5, 0], size: [.34, 6.3, .34], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('siren-crown', [0, 6.42, 0], [3.42, 1.82, .55], [0, 0, 0], { blocksMovement: false })
]);

export const ENDURANCE_MONUMENT_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .12, 0], size: [5.6, .24, 5.6], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'pedestal', shape: 'cylinder', position: [0, .5, 0], size: [4.1, .65, 4.1], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'relay-column', shape: 'cylinder', position: [0, 2.45, 0], size: [1.6, 4.35, 1.6], blocksMovement: true, blocksShots: true, blocksSight: true })
]);

export const FLOODGATE_KIT_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'closed', shape: 'box', position: [-6, 2.35, 0], size: [3.52, 4.7, 1.5], tags: ['floodgateClosedCollider'], blocksMovement: true, blocksShots: true, blocksSight: true }),
  // The opening variant visibly raises its gate. Keep its two piers and raised
  // header instead of retaining a full invisible door across the route.
  Object.freeze({ id: 'opening-west-pier', shape: 'box', position: [-3.55, 2.35, 0], size: [.42, 4.7, 1.35], tags: ['floodgateOpeningCollider'], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'opening-east-pier', shape: 'box', position: [-.45, 2.35, 0], size: [.42, 4.7, 1.35], tags: ['floodgateOpeningCollider'], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'opening-raised-gate', shape: 'box', position: [-2, 3.55, .05], size: [2.65, 1.45, .42], tags: ['floodgateOpeningCollider'], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'locked', shape: 'box', position: [2, 2.35, 0], size: [3.52, 4.7, 1.5], tags: ['floodgateLockedCollider'], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'damaged', shape: 'box', position: [6, 2.35, 0], size: [3.52, 4.7, 1.5], tags: ['floodgateDamagedCollider'], blocksMovement: true, blocksShots: true, blocksSight: true })
]);

export const PUMP_TURBINE_COLLIDER_PROFILE = Object.freeze([
  // The wide concrete plates are only 32 cm high and are intentionally
  // stepable. Tall collision follows the round pump and compact turbine body
  // instead of extruding each plate into an invisible full-height cuboid.
  Object.freeze({ id: 'pump-body', shape: 'cylinder', position: [-2.6, 1.55, 0], size: [2.8, 2.4, 2.8], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('turbine-body', [2.55, 1.85, 0], [2.5, 2.2, 1.8]),
  Object.freeze({ id: 'turbine-stack', shape: 'cylinder', position: [2.55, 4.35, 0], size: [1.6, 4, 1.6], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const SLUICE_CONDUITS_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'west-riser', shape: 'cylinder', position: [-2.35, 1.6, -.15], size: [1.5, 3.2, 1.5], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-riser', shape: 'cylinder', position: [2.35, 1.6, -.15], size: [1.5, 3.2, 1.5], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('overhead', [0, 4.35, 0], [7.02, .95, 1.98], [0, 0, 0], { blocksMovement: false })
]);

export const ARCHIVE_SEED_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'shielded-base', shape: 'cylinder', position: [-3.5, .18, 0], size: [2.2, .35, 2.2], tags: ['archiveSeedActive'], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'shielded-body', shape: 'cylinder', position: [-3.5, 2.05, 0], size: [2.1, 3.95, 2.1], tags: ['archiveSeedActive'], blocksMovement: true, blocksShots: true, blocksSight: true })
]);

export const GREYWATER_CORE_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .3, 0], size: [5.6, .6, 5.6], tags: ['greywaterCoreActive'], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  // Do not fill the visible gaps between the central column and four pylons.
  // The broad base already owns movement at ground level; the upright proxy
  // follows the actual 1.64 m core rather than the outer energy-ring diameter.
  Object.freeze({ id: 'core', shape: 'cylinder', position: [0, 2.45, 0], size: [1.64, 4.9, 1.64], tags: ['greywaterCoreActive'], blocksMovement: true, blocksShots: true, blocksSight: true })
]);

export const LAST_LIGHT_REACTOR_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'base', shape: 'cylinder', position: [0, .36, 0], size: [4.6, .72, 4.6], blocksMovement: true, blocksShots: true, blocksSight: true, jumpExpectedPass: true }),
  Object.freeze({ id: 'reactor-column', shape: 'cylinder', position: [0, 3.35, 0], size: [1.56, 6.7, 1.56], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('control', [1.15, .98, .55], [1.15, 1.05, .55])
]);

// Late-campaign structural recipes have one canonical owner. Re-export them
// here for compatibility with callers that use the shared profile catalog.
export {
  ARCHIVES_COLLIDER_PROFILE,
  CARGO_LIFT_COLLIDER_PROFILE,
  CATHEDRAL_KIT_COLLIDER_PROFILE,
  CATWALK_COLLIDER_PROFILE,
  CLINIC_WALL_COLLIDER_PROFILE,
  CORRIDOR_COLLIDER_PROFILE,
  EMERGENCY_SIGN_COLLIDER_PROFILE,
  END_CHOICE_COLLIDER_PROFILE,
  LADDER_PLATFORM_COLLIDER_PROFILE,
  MIRROR_CHOIR_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE,
  ROOT_ALTAR_COLLIDER_PROFILE,
  SHUTTER_COLLIDER_PROFILE,
  STAIRS_COLLIDER_PROFILE
} from './late-collision-profiles.js';

export const SANDBANK_COLLIDER_PROFILE = Object.freeze([
  Object.freeze({ id: 'west-bank', shape: 'cylinder', position: [-5.2, .36, 0], size: [6.5, .72, 3.05], rotation: [0, .08, 0], blocksMovement: true, blocksShots: true, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'center-bank', shape: 'cylinder', position: [0, .52, -.1], size: [7.2, 1.04, 2.5], rotation: [0, -.12, 0], blocksMovement: true, blocksShots: true, blocksSight: false, jumpExpectedPass: true }),
  Object.freeze({ id: 'east-bank', shape: 'cylinder', position: [5.1, .42, .15], size: [5.85, .84, 3.42], rotation: [0, .16, 0], blocksMovement: true, blocksShots: true, blocksSight: false, jumpExpectedPass: true })
]);

export const FILTER_RUIN_COLLIDER_PROFILE = Object.freeze([
  solidBox('base', [0, .1, -.22323], [5.8, .2, 2.7], [0, 0, 0], { jumpExpectedPass: true }),
  solidBox('west-post', [-2.1, 1.5, -.42323], [.4, 2.85, .4], [0, 0, -.08]),
  solidBox('east-post', [2, 1.2, -.42323], [.4, 2.35, .4], [0, 0, .16]),
  solidBox('header', [-.1, 2.65, -.42323], [4.35, .32, .4], [0, 0, -.07], { blocksMovement: false }),
  solidBox('panel', [-.05, 1.72, -.30323], [3.45, 1.55, .24], [0, .05, -.06])
]);

export const SCREEN_WALL_COLLIDER_PROFILE = Object.freeze([
  solidBox('west-screen', [-1.38, 1.73, .25], [2.62, 2.4, .2]),
  solidBox('east-screen', [1.37, 1.73, .25], [2.62, 2.4, .2]),
  solidBox('west-foot', [-2.7, .08, .15], [.62, .16, .62], [0, 0, 0], { jumpExpectedPass: true }),
  solidBox('east-foot', [2.7, .08, .15], [.62, .16, .62], [0, 0, 0], { jumpExpectedPass: true })
]);

export const RETAINING_WALL_COLLIDER_PROFILE = Object.freeze([
  solidBox('lower', [-.01, .63, -.1375], [6.45, 1.25, 1.34]),
  solidBox('middle', [-.01, 1.75, -.2075], [6.25, 1.05, 1.08]),
  solidBox('upper', [-.01, 2.68, -.2875], [6, .82, .86])
]);

export const CONCRETE_WALL_COLLIDER_PROFILE = Object.freeze([
  solidBox('wall', [0, 1.38, -.065], [6.2, 2.75, .7]),
  solidBox('base', [0, .14, -.065], [6.45, .28, .92], [0, 0, 0], { jumpExpectedPass: true })
]);

export const SERVICE_WALL_COLLIDER_PROFILE = Object.freeze([
  solidBox('wall', [0, 1.5, -.16], [6.3, 3, .78]),
  solidBox('west-pillar', [-3.08, 1.6, -.16], [.55, 3.2, .94]),
  solidBox('east-pillar', [3.08, 1.6, -.16], [.55, 3.2, .94])
]);

export const GENERATOR_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('body', [0, 1.18, 0], [3.35, 1.78, 1.85], -.28, [.35436, .72082]),
  centeredRootRotatedBox('base', [0, .34, 0], [3.5, .2, 2.02], -.28, [.35436, .72082], 0, { jumpExpectedPass: true })
]);

export const HESCO_COLLIDER_PROFILE = Object.freeze([
  ...Array.from({ length: 5 }, (_, index) => centeredRootRotatedBox(
    `lower-${index}`, [-2.7 + index * 1.35, .63, 0], [1.42 * (.96 + (index % 2) * .04), 1.25 * (.96 + (index % 2) * .04), 1.05], -.1, [0, .00966], 0,
    { jumpExpectedPass: true }
  )),
  ...Array.from({ length: 3 }, (_, index) => centeredRootRotatedBox(
    `upper-${index}`, [-1.35 + index * 1.35, 1.82, -.04], [1.363, 1.2, 1.05], -.1, [0, .00966]
  ))
]);

export const TROLLEY_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('movement-shell', [0, 1.1, 0], [3, 1.45, 1.65], -.35, [.07864, .02265], 0, { blocksShots: false, blocksSight: false }),
  centeredRootRotatedBox('platform', [0, .72, 0], [3, .16, 1.65], -.35, [.07864, .02265], 0, { blocksMovement: false }),
  centeredRootRotatedBox('north-rail', [0, 1.1, .78], [2.75, .82, .12], -.35, [.07864, .02265], 0, { blocksMovement: false }),
  centeredRootRotatedBox('south-rail', [0, 1.1, -.78], [2.75, .82, .12], -.35, [.07864, .02265], 0, { blocksMovement: false }),
  centeredRootRotatedBox('luggage-west', [-.62, 1.12, -.05], [1.15, .72, 1.08], -.35, [.07864, .02265], .2),
  centeredRootRotatedBox('luggage-east', [.65, 1.04, .18], [.82, .52, .76], -.35, [.07864, .02265], -.18),
  centeredRootRotatedBox('handle', [1.58, 2.05, 0], [.22, 1.2, 1.55], -.35, [.07864, .02265], 0, { blocksMovement: false })
]);

export const WAREHOUSE_COLLIDER_PROFILE = Object.freeze([
  centeredRootRotatedBox('building', [0, 1.63, 0], [6.35, 3.3, 4.05], -.18, [0, 0]),
  centeredRootRotatedBox('roof', [0, 3.35, 0], [6.7, .3, 4.35], -.18, [0, 0], 0, { blocksMovement: false })
]);

export const BENT_TREE_COLLIDER_PROFILE = Object.freeze([
  solidBox('base', [1.96392, .12, -.08017], [1.42, .24, 1.05], [0, -.22, 0], { jumpExpectedPass: true }),
  solidBox('lower-trunk', [1.52392, 1.25, -.08017], [.92, 2.55, .9], [0, 0, .23]),
  solidBox('upper-trunk', [.71392, 3.25, -.07017], [.72, 2.35, .72], [0, 0, .58]),
  Object.freeze({ id: 'west-branch', shape: 'beam', from: [.53392, 3.48, -.06017], to: [-.90608, 4.48, .11983], thickness: .34, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'rear-branch', shape: 'beam', from: [.71392, 3.22, -.12017], to: [-.00608, 4.42, -.74017], thickness: .3, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'canopy-west', shape: 'cylinder', position: [-.90608, 4.5, .11983], size: [2.7, 1.84, 2.1], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'canopy-center', shape: 'cylinder', position: [.06392, 4.55, -.43017], size: [2.4, 1.7, 1.9], blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'canopy-tip', shape: 'cylinder', position: [-1.56608, 4.22, -.20017], size: [1.8, 1.4, 1.6], blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const DEAD_TREE_COLLIDER_PROFILE = Object.freeze([
  solidBox('trunk', [.03118, 2.1, -.0182], [.9, 4.25, .8], [0, 0, -.08]),
  Object.freeze({ id: 'west-branch', shape: 'beam', from: [-.00882, 2.72, -.0182], to: [-1.38882, 4.02, .0618], thickness: .38, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-branch', shape: 'beam', from: [.06118, 2.58, .0018], to: [1.45118, 3.78, -.0682], thickness: .36, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'west-tip', shape: 'beam', from: [-1.01882, 3.68, .0418], to: [-1.88882, 4.7, .1018], thickness: .25, blocksMovement: false, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-tip', shape: 'beam', from: [1.08118, 3.46, -.0482], to: [1.95118, 4.25, -.1182], thickness: .24, blocksMovement: false, blocksShots: true, blocksSight: true })
]);

export const BILLBOARD_WALL_COLLIDER_PROFILE = Object.freeze([
  solidBox('base', [0, .14, .003], [6.2, .28, 1.5], [0, 0, 0], { jumpExpectedPass: true }),
  Object.freeze({ id: 'west-pole', shape: 'cylinder', position: [-2.45, 1.65, .003], size: [.68, 2.8, .68], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'east-pole', shape: 'cylinder', position: [2.45, 1.65, .003], size: [.68, 2.8, .68], blocksMovement: true, blocksShots: true, blocksSight: true }),
  Object.freeze({ id: 'center-pole', shape: 'cylinder', position: [0, 1.38, .003], size: [.64, 2.1, .64], blocksMovement: true, blocksShots: true, blocksSight: true }),
  solidBox('panel', [0, 2.65, .003], [4.75, 2.1, .28], [0, .32, 0], { blocksMovement: false })
]);
