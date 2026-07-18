import { allLevelAssetIds, levelAssetStatus } from './catalog.js';

const STRUCTURAL_CATEGORIES = new Set(['architecture', 'boundaries', 'buildings', 'interiors', 'walls']);
const GROUND_CATEGORIES = new Set(['ground']);

const STRUCTURAL_SLOTS = Object.freeze([
  [-9.5, 0, -9.5, 0], [-5.0, 0, -10.2, 0], [0, 0, -10.5, 0], [5.0, 0, -10.2, 0], [9.5, 0, -9.5, 0],
  [-12.0, 0, -5.8, Math.PI / 2], [12.0, 0, -5.8, -Math.PI / 2],
  [-12.0, 0, -.8, Math.PI / 2], [12.0, 0, -.8, -Math.PI / 2]
]);

const GROUND_SLOTS = Object.freeze([
  [-7.5, .02, 7.0, 0], [-2.5, .02, 7.0, 0], [2.5, .02, 7.0, 0], [7.5, .02, 7.0, 0],
  [-6.0, .02, 3.8, 0], [0, .02, 3.8, 0], [6.0, .02, 3.8, 0]
]);

const GAMEPLAY_SLOTS = Object.freeze([
  [-8.5, 0, 4.8, .18], [-4.25, 0, 4.4, -.16], [4.25, 0, 4.4, .16], [8.5, 0, 4.8, -.18],
  [-9.5, 0, 1.0, Math.PI / 2], [-5.2, 0, 1.4, .12], [5.2, 0, 1.4, -.12], [9.5, 0, 1.0, -Math.PI / 2],
  [-8.2, 0, -2.5, .25], [-4.1, 0, -2.2, -.18], [4.1, 0, -2.2, .18], [8.2, 0, -2.5, -.25],
  [-9.8, 0, -6.0, Math.PI / 2], [-6.6, 0, -6.3, 0], [6.6, 0, -6.3, 0], [9.8, 0, -6.0, -Math.PI / 2],
  [-2.8, 0, 6.0, 0], [2.8, 0, 6.0, 0], [-2.8, 0, -.2, .1], [2.8, 0, -.2, -.1]
]);

const LEVEL_PLACEMENT_OVERRIDES = Object.freeze({
  'relay-district': Object.freeze({
    relaybackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    apartment: { position: [-9.0, 0, -9.2], rotationY: .08, desiredSpan: 6.6 },
    cornershop: { position: [-4.25, 0, -9.1], rotationY: 0, desiredSpan: 5.8 },
    facade: { position: [1.7, 0, -9.7], rotationY: 0, desiredSpan: 6.2 },
    civicwall: { position: [8.0, 0, -9.3], rotationY: 0, desiredSpan: 6.2 },
    fireescape: { position: [-8.1, 0, -5.0], rotationY: .05, desiredSpan: 6.8 },
    reinforcementdoor: { position: [7.6, 0, -5.6], rotationY: 0, desiredSpan: 4.0 },
    breachvent: { position: [11.0, 0, -2.1], rotationY: -Math.PI / 2, desiredSpan: 3.6 },
    checkpoint: { position: [-10.6, 0, -.4], rotationY: Math.PI / 2, desiredSpan: 5.4 },
    roadblock: { position: [10.2, 0, .1], rotationY: -Math.PI / 2, desiredSpan: 5.4 },
    barriers: { position: [-8.1, 0, 3.9], rotationY: .1, desiredSpan: 4.3 },
    gabion: { position: [8.1, 0, 3.8], rotationY: -.12, desiredSpan: 4.0 },
    relaystreetkit: { position: [0, .02, 7.3], rotationY: 0, desiredSpan: 9.2 },
    roadcurb: { position: [-8.1, .02, 8.0], rotationY: 0, desiredSpan: 4.5 },
    sidewalk: { position: [8.2, .02, 7.9], rotationY: 0, desiredSpan: 4.4 },
    streettree: { position: [10.4, 0, 5.5], rotationY: 0, desiredSpan: 3.3 },
    relaymast: { position: [-3.7, 0, -2.2], rotationY: .18, desiredSpan: 4.5 },
    broodinfestation: { position: [3.7, 0, -2.0], rotationY: 0, desiredSpan: 5.6 },
    terminal: { position: [-4.8, 0, 1.3], rotationY: .12, desiredSpan: 3.0 },
    powerrelay: { position: [0, 0, 1.7], rotationY: 0, desiredSpan: 3.2 },
    capturebeacon: { position: [4.8, 0, 1.25], rotationY: -.12, desiredSpan: 3.1 },
    floorhatch: { position: [0, .02, 4.6], rotationY: 0, desiredSpan: 3.2 },
    boss_broodmaker: { position: [0, 0, -5.0], rotationY: Math.PI, desiredSpan: 3.6 }
  }),
  'sanitizer-spire': Object.freeze({
    spirebackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    spirefacade: { position: [0, 0, -10.2], rotationY: 0, desiredSpan: 8.5 },
    clinic: { position: [-8.3, 0, -9.2], rotationY: .04, desiredSpan: 6.4 },
    clinicwall: { position: [8.3, 0, -9.3], rotationY: 0, desiredSpan: 6.2 },
    corridor: { position: [10.5, 0, -4.5], rotationY: -Math.PI / 2, desiredSpan: 5.8 },
    decon: { position: [-10.4, 0, -4.8], rotationY: Math.PI / 2, desiredSpan: 4.5 },
    emergencysign: { position: [0, 0, -6.5], rotationY: 0, desiredSpan: 5.5 },
    reinforcementdoor: { position: [6.8, 0, -6.0], rotationY: 0, desiredSpan: 3.8 },
    shutter: { position: [10.8, 0, .2], rotationY: -Math.PI / 2, desiredSpan: 4.2 },
    boss_sanitizer: { position: [0, 0, -4.0], rotationY: Math.PI, desiredSpan: 3.6 },
    censorshipnodes: { position: [5.4, 0, -.7], rotationY: -.14, desiredSpan: 5.4 },
    terminal: { position: [-6.0, 0, 2.0], rotationY: .1, desiredSpan: 3.0 },
    powerrelay: { position: [-3.8, 0, 2.35], rotationY: .12, desiredSpan: 3.2 },
    ammostation: { position: [5.3, 0, 2.0], rotationY: -.1, desiredSpan: 3.2 },
    suppressiontiles: { position: [0, .02, 7.4], rotationY: 0, desiredSpan: 10.2 },
    cargolift: { position: [-9.4, 0, -.25], rotationY: Math.PI / 2, desiredSpan: 5.4 },
    catwalk: { position: [-8.8, 0, 3.35], rotationY: Math.PI / 2, desiredSpan: 5.8 },
    stairs: { position: [-6.8, 0, 6.0], rotationY: Math.PI, desiredSpan: 5.2 },
    peekcover: { position: [7.7, 0, 4.55], rotationY: -.12, desiredSpan: 4.5 },
    cornercover: { position: [7.2, 0, 7.25], rotationY: -Math.PI / 2, desiredSpan: 4.0 }
  }),
  'ad-zone-arena': Object.freeze({
    adzonebackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    cornershop: { position: [-8.5, 0, -9.2], rotationY: .05, desiredSpan: 6.0 },
    guardbooth: { position: [-3.7, 0, -9.3], rotationY: 0, desiredSpan: 4.0 },
    screenwall: { position: [2.6, 0, -9.7], rotationY: 0, desiredSpan: 6.0 },
    billboardwall: { position: [8.2, 0, -8.7], rotationY: -.28, desiredSpan: 6.8 },
    kiosk: { position: [-9.7, 0, -3.7], rotationY: Math.PI / 2, desiredSpan: 4.2 },
    tower: { position: [10.0, 0, -4.4], rotationY: -.08, desiredSpan: 4.5 },
    catwalk: { position: [8.4, 0, .3], rotationY: Math.PI / 2, desiredSpan: 5.4 },
    lightmast: { position: [-10.2, 0, .9], rotationY: .08, desiredSpan: 4.2 },
    boss_captain: { position: [0, 0, -4.2], rotationY: Math.PI, desiredSpan: 3.5 },
    boss_zeppelin_pod: { position: [0, 5.2, -8.0], rotationY: Math.PI / 2, desiredSpan: 5.2 },
    sponsorprojector: { position: [-3.8, 0, -.8], rotationY: .12, desiredSpan: 4.0 },
    adtrappylon: { position: [3.9, 0, -.7], rotationY: -.08, desiredSpan: 4.1 },
    capturebeacon: { position: [-4.6, 0, 2.6], rotationY: .1, desiredSpan: 3.1 },
    terminal: { position: [4.7, 0, 2.55], rotationY: -.1, desiredSpan: 3.0 },
    barriers: { position: [-8.0, 0, 4.4], rotationY: .15, desiredSpan: 4.3 },
    roadblock: { position: [8.2, 0, 4.4], rotationY: -.18, desiredSpan: 5.2 },
    coverheights: { position: [-4.7, 0, 5.7], rotationY: .12, desiredSpan: 3.9 },
    breakablecover: { position: [4.7, 0, 5.7], rotationY: -.12, desiredSpan: 3.9 },
    adplazakit: { position: [0, .02, 8.0], rotationY: 0, desiredSpan: 10.0 }
  }),
  'trend-wastes': Object.freeze({
    wastesbackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    retainingwall: { position: [0, 0, -10.2], rotationY: 0, desiredSpan: 9.5 },
    hesco: { position: [-8.2, 0, -9.0], rotationY: .05, desiredSpan: 6.4 },
    screenwall: { position: [8.2, 0, -9.0], rotationY: -.05, desiredSpan: 6.2 },
    windbreaks: { position: [7.0, 0, -5.3], rotationY: -.16, desiredSpan: 7.0 },
    stormbeacon: { position: [0, 0, -7.0], rotationY: 0, desiredSpan: 5.2 },
    boss_shard_avatar: { position: [0, 0, -3.8], rotationY: Math.PI, desiredSpan: 3.8 },
    checkpoint: { position: [-10.5, 0, -4.1], rotationY: Math.PI / 2, desiredSpan: 5.0 },
    roadblock: { position: [10.4, 0, -3.9], rotationY: -Math.PI / 2, desiredSpan: 5.0 },
    lightmast: { position: [-10.1, 0, .7], rotationY: .08, desiredSpan: 4.0 },
    capturebeacon: { position: [8.8, 0, .7], rotationY: -.08, desiredSpan: 3.1 },
    pipes: { position: [-5.7, 0, 2.2], rotationY: .12, desiredSpan: 4.1 },
    reel: { position: [5.7, 0, 2.2], rotationY: -.12, desiredSpan: 4.0 },
    drainage: { position: [0, .02, 4.8], rotationY: 0, desiredSpan: 4.8 },
    gabion: { position: [-7.7, 0, 5.2], rotationY: .15, desiredSpan: 4.2 },
    filterruin: { position: [7.7, 0, 5.1], rotationY: -.1, desiredSpan: 5.0 },
    benttree: { position: [-10.4, 0, 4.4], rotationY: .1, desiredSpan: 3.5 },
    deadtree: { position: [10.4, 0, 4.5], rotationY: -.1, desiredSpan: 3.5 },
    wastesterrainkit: { position: [0, .02, 8.0], rotationY: 0, desiredSpan: 11.0 },
    roadcurb: { position: [-8.7, .02, 8.2], rotationY: .02, desiredSpan: 4.2 },
    roaddamage: { position: [8.7, .02, 8.2], rotationY: -.05, desiredSpan: 4.0 }
  }),
  'freight-annex': Object.freeze({
    freightbackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    warehouse: { position: [-7.4, 0, -10.2], rotationY: .03, desiredSpan: 7.4 },
    servicewall: { position: [0, 0, -10.4], rotationY: 0, desiredSpan: 6.8 },
    cargogate: { position: [7.9, 0, -9.6], rotationY: -.03, desiredSpan: 6.8 },
    concretewall: { position: [11.4, 0, -4.6], rotationY: -Math.PI / 2, desiredSpan: 5.8 },
    freightlanekit: { position: [0, 0, -7.2], rotationY: 0, desiredSpan: 11.5 },
    shutter: { position: [8.4, 0, -5.9], rotationY: 0, desiredSpan: 4.0 },

    loadingramp: { position: [-10.1, 0, 5.5], rotationY: Math.PI / 2, desiredSpan: 5.8 },
    catwalk: { position: [-10.2, 0, .8], rotationY: Math.PI / 2, desiredSpan: 6.2 },
    stairs: { position: [-9.2, 0, -4.0], rotationY: Math.PI, desiredSpan: 5.2 },
    ladderplatform: { position: [-11.2, 0, -1.8], rotationY: Math.PI / 2, desiredSpan: 4.6 },

    boss_broodmaker: { position: [0, 0, -3.5], rotationY: Math.PI, desiredSpan: 3.7 },
    industrialnest: { position: [6.8, 0, -2.6], rotationY: -.12, desiredSpan: 5.3 },
    burrowbreach: { position: [-5.8, .02, 2.6], rotationY: 0, desiredSpan: 4.8 },
    cargolift: { position: [8.8, 0, -1.4], rotationY: -Math.PI / 2, desiredSpan: 4.8 },
    breachvent: { position: [10.0, 0, 3.0], rotationY: -Math.PI / 2, desiredSpan: 3.4 },
    floorhatch: { position: [5.1, .02, 4.3], rotationY: 0, desiredSpan: 3.2 },

    generator: { position: [-6.2, 0, -.4], rotationY: .1, desiredSpan: 3.4 },
    pipes: { position: [5.6, 0, .9], rotationY: -.12, desiredSpan: 4.1 },
    reel: { position: [-6.8, 0, 6.2], rotationY: .08, desiredSpan: 3.8 },
    trolley: { position: [6.9, 0, 6.6], rotationY: -.12, desiredSpan: 3.6 },
    infectedprops: { position: [9.0, 0, 6.2], rotationY: -.15, desiredSpan: 5.4 },
    gabion: { position: [-3.2, 0, 5.5], rotationY: .12, desiredSpan: 3.8 },
    hesco: { position: [3.1, 0, 6.4], rotationY: -.12, desiredSpan: 3.8 },
    breakablecover: { position: [9.0, 0, 8.2], rotationY: -.18, desiredSpan: 3.5 }
  }),
  'mirror-garden': Object.freeze({
    mirrorbackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    civicwall: { position: [-7.5, 0, -10.0], rotationY: .04, desiredSpan: 6.5 },
    facade: { position: [7.5, 0, -10.0], rotationY: -.04, desiredSpan: 6.5 },
    mirrorpanels: { position: [0, 0, -8.0], rotationY: 0, desiredSpan: 8.2 },
    streettree: { position: [-10.0, 0, -5.6], rotationY: .08, desiredSpan: 3.5 },
    broadleaf: { position: [10.0, 0, -5.6], rotationY: -.08, desiredSpan: 3.7 },

    boss_hydraclone: { position: [0, 0, -3.6], rotationY: Math.PI, desiredSpan: 3.8 },
    powerrelay: { position: [4.9, 0, -2.0], rotationY: -.12, desiredSpan: 3.0 },
    capturebeacon: { position: [-4.9, 0, -2.0], rotationY: .12, desiredSpan: 3.0 },
    splitring: { position: [-4.5, 0, 2.0], rotationY: .08, desiredSpan: 3.5 },
    terminal: { position: [4.7, 0, 2.2], rotationY: -.12, desiredSpan: 3.0 },

    lightmast: { position: [-10.2, 0, -.2], rotationY: .08, desiredSpan: 4.0 },
    emergencysign: { position: [10.2, 0, -.2], rotationY: -.08, desiredSpan: 3.5 },
    coverheights: { position: [-8.0, 0, 4.8], rotationY: .18, desiredSpan: 3.8 },
    peekcover: { position: [8.0, 0, 4.8], rotationY: -.18, desiredSpan: 4.0 },
    cornercover: { position: [-7.2, 0, 7.8], rotationY: Math.PI / 2, desiredSpan: 3.8 },
    glitchtopiary: { position: [8.0, 0, 7.5], rotationY: -.12, desiredSpan: 5.3 },
    generationmarkers: { position: [4.1, .02, 6.6], rotationY: -.08, desiredSpan: 5.4 },
    mirrorgardenpaths: { position: [0, .02, 1.4], rotationY: 0, desiredSpan: 15.0 }
  }),
  'content-court': Object.freeze({
    courtbackdrop: { position: [0, 0, -18.5], rotationY: 0, desiredSpan: 28 },
    fortwall: { position: [-7.8, 0, -10.0], rotationY: .03, desiredSpan: 6.6 },
    civicwall: { position: [0, 0, -10.4], rotationY: 0, desiredSpan: 6.8 },
    corridor: { position: [7.8, 0, -10.0], rotationY: -.03, desiredSpan: 6.4 },
    archives: { position: [11.0, 0, -5.2], rotationY: -Math.PI / 2, desiredSpan: 6.2 },
    reinforcementdoor: { position: [-10.5, 0, -5.0], rotationY: Math.PI / 2, desiredSpan: 4.0 },
    emergencysign: { position: [9.8, 0, -3.2], rotationY: -.08, desiredSpan: 3.5 },
    stairs: { position: [-10.0, 0, .4], rotationY: Math.PI / 2, desiredSpan: 5.0 },

    tribunaldais: { position: [0, 0, -3.3], rotationY: 0, desiredSpan: 7.2 },
    boss_adjudicator: { position: [0, 1.15, -3.3], rotationY: Math.PI, desiredSpan: 3.6 },
    capturebeacon: { position: [-5.0, 0, -1.9], rotationY: .12, desiredSpan: 3.0 },
    purgenode: { position: [6.2, 0, -.7], rotationY: -.12, desiredSpan: 5.6 },

    courtbench: { position: [-7.2, 0, 3.6], rotationY: .12, desiredSpan: 6.4 },
    terminal: { position: [-5.0, 0, 7.0], rotationY: .12, desiredSpan: 3.0 },
    powerrelay: { position: [5.0, 0, 7.0], rotationY: -.12, desiredSpan: 3.0 },
    cornercover: { position: [-9.2, 0, 7.4], rotationY: Math.PI / 2, desiredSpan: 3.8 },
    peekcover: { position: [8.0, 0, 4.0], rotationY: -.18, desiredSpan: 4.0 },
    breakablecover: { position: [8.8, 0, 7.4], rotationY: -.15, desiredSpan: 3.8 },
    courtsectoraisles: { position: [0, .02, 1.4], rotationY: 0, desiredSpan: 15.0 }
  }),
  'server-cathedral': Object.freeze({
    cathedralbackdrop: { position: [0, 0, -19.0], rotationY: 0, desiredSpan: 25.0 },
    cathedralkit: { position: [0, 0, -9.4], rotationY: 0, desiredSpan: 8.8 },
    dashboardwindows: { position: [0, 0, -11.2], rotationY: 0, desiredSpan: 7.2 },
    corridor: { position: [-8.2, 0, -10.0], rotationY: .04, desiredSpan: 6.2 },
    servicewall: { position: [8.2, 0, -10.0], rotationY: -.04, desiredSpan: 6.3 },
    clinicwall: { position: [-11.0, 0, -5.2], rotationY: Math.PI / 2, desiredSpan: 5.6 },
    archives: { position: [11.0, 0, -5.2], rotationY: -Math.PI / 2, desiredSpan: 5.8 },
    mirrorchoir: { position: [6.3, 0, -5.7], rotationY: -.16, desiredSpan: 6.2 },

    rootaltar: { position: [0, 0, -3.3], rotationY: 0, desiredSpan: 5.6 },
    boss_algorithm: { position: [0, 0.8, -3.3], rotationY: Math.PI, desiredSpan: 4.8 },
    capturebeacon: { position: [-4.8, 0, -1.5], rotationY: .12, desiredSpan: 3.0 },
    terminal: { position: [-4.8, 0, 4.1], rotationY: .12, desiredSpan: 3.0 },
    powerrelay: { position: [4.8, 0, 4.1], rotationY: -.12, desiredSpan: 3.0 },
    endchoice: { position: [7.4, 0, 7.2], rotationY: -.18, desiredSpan: 4.4 },

    cargolift: { position: [-9.7, 0, -.7], rotationY: Math.PI / 2, desiredSpan: 5.0 },
    catwalk: { position: [-9.5, 0, 2.8], rotationY: Math.PI / 2, desiredSpan: 5.8 },
    ladderplatform: { position: [-10.8, 0, 5.0], rotationY: Math.PI / 2, desiredSpan: 4.5 },
    stairs: { position: [-8.5, 0, 7.4], rotationY: Math.PI, desiredSpan: 5.0 },

    reinforcementdoor: { position: [9.7, 0, -2.1], rotationY: -Math.PI / 2, desiredSpan: 3.8 },
    shutter: { position: [10.2, 0, 1.2], rotationY: -Math.PI / 2, desiredSpan: 4.0 },
    breachvent: { position: [9.5, 0, 4.9], rotationY: -Math.PI / 2, desiredSpan: 3.4 },
    emergencysign: { position: [-7.2, 0, 7.0], rotationY: .08, desiredSpan: 3.4 },
    lightmast: { position: [7.2, 0, 1.4], rotationY: -.08, desiredSpan: 4.0 },
    cathedralroutes: { position: [0, .02, 1.5], rotationY: 0, desiredSpan: 15.0 }
  }),
  'sandstorm-expanse': Object.freeze({
    sandstormbackdrop: { position: [0, 0, -19.0], rotationY: 0, desiredSpan: 28 },
    retainingwall: { position: [0, 0, -10.5], rotationY: 0, desiredSpan: 9.2 },
    hesco: { position: [-8.4, 0, -9.2], rotationY: .08, desiredSpan: 6.0 },
    screenwall: { position: [8.5, 0, -9.2], rotationY: -.08, desiredSpan: 6.0 },
    windbreaks: { position: [-9.4, 0, -5.7], rotationY: .18, desiredSpan: 6.2 },
    filterruin: { position: [9.2, 0, -5.8], rotationY: -.15, desiredSpan: 4.8 },
    stormsiren: { position: [0, 0, -7.1], rotationY: 0, desiredSpan: 5.1 },
    checkpoint: { position: [-11.0, 0, -2.2], rotationY: Math.PI / 2, desiredSpan: 4.6 },
    cargogate: { position: [10.8, 0, -2.4], rotationY: -Math.PI / 2, desiredSpan: 5.0 },
    reinforcementdoor: { position: [10.8, 0, 1.9], rotationY: -Math.PI / 2, desiredSpan: 3.4 },
    tower: { position: [-10.4, 0, 1.0], rotationY: .1, desiredSpan: 4.0 },
    lightmast: { position: [10.1, 0, 3.7], rotationY: -.08, desiredSpan: 3.7 },
    stormbeacon: { position: [-6.0, 0, -3.4], rotationY: .08, desiredSpan: 3.8 },
    endurancemonument: { position: [0, 0, -3.3], rotationY: 0, desiredSpan: 4.6 },
    capturebeacon: { position: [6.0, 0, -3.3], rotationY: -.08, desiredSpan: 2.7 },
    powerrelay: { position: [-4.7, 0, 1.2], rotationY: .1, desiredSpan: 2.7 },
    ammostation: { position: [4.7, 0, 1.2], rotationY: -.1, desiredSpan: 2.7 },
    medcache: { position: [7.6, 0, 4.8], rotationY: -.15, desiredSpan: 2.8 },
    pipes: { position: [-8.0, 0, 4.9], rotationY: .12, desiredSpan: 3.6 },
    reel: { position: [-4.5, 0, 5.3], rotationY: .08, desiredSpan: 3.3 },
    gabion: { position: [4.2, 0, 5.2], rotationY: -.12, desiredSpan: 3.5 },
    roadblock: { position: [9.6, 0, 7.6], rotationY: -.2, desiredSpan: 4.5 },
    sandbankkit: { position: [0, .02, 8.2], rotationY: 0, desiredSpan: 12.0 },
    roadcurb: { position: [-8.3, .02, 8.2], rotationY: 0, desiredSpan: 4.0 },
    drainage: { position: [-3.0, .02, 8.5], rotationY: 0, desiredSpan: 3.8 },
    roaddamage: { position: [3.1, .02, 8.5], rotationY: 0, desiredSpan: 3.6 },
    benttree: { position: [-11.0, 0, 6.8], rotationY: .15, desiredSpan: 3.0 },
    deadtree: { position: [11.0, 0, 6.6], rotationY: -.15, desiredSpan: 3.0 },
    gruntbot: { position: [-5.4, 0, -1.9], rotationY: Math.PI, desiredSpan: 2.4 },
    shooterbot: { position: [-3.6, 0, -.5], rotationY: Math.PI, desiredSpan: 2.5 },
    runnerbot: { position: [-1.7, 0, -1.0], rotationY: Math.PI, desiredSpan: 2.3 },
    blockbot: { position: [0, 0, -.4], rotationY: Math.PI, desiredSpan: 2.8 },
    winged_drone: { position: [2.1, 2.1, -1.4], rotationY: Math.PI, desiredSpan: 2.4 },
    healer_bot: { position: [4.0, 0, -.6], rotationY: Math.PI, desiredSpan: 2.5 },
    swarm_warden: { position: [5.8, 0, -1.8], rotationY: Math.PI, desiredSpan: 2.7 }
  }),
  'floodgate-continuity': Object.freeze({
    floodgatebackdrop: { position: [0, 0, -19.0], rotationY: 0, desiredSpan: 28 },
    floodgatekit: { position: [0, 0, -10.2], rotationY: 0, desiredSpan: 12.0 },
    retainingwall: { position: [-9.2, 0, -9.7], rotationY: .04, desiredSpan: 6.0 },
    concretewall: { position: [9.2, 0, -9.7], rotationY: -.04, desiredSpan: 6.0 },
    servicewall: { position: [11.5, 0, -5.4], rotationY: -Math.PI / 2, desiredSpan: 5.7 },
    sluiceconduits: { position: [0, 0, -6.8], rotationY: 0, desiredSpan: 7.6 },
    shutter: { position: [-10.8, 0, -5.2], rotationY: Math.PI / 2, desiredSpan: 3.8 },
    reinforcementdoor: { position: [10.8, 0, -1.2], rotationY: -Math.PI / 2, desiredSpan: 3.5 },
    pumpturbine: { position: [-6.4, 0, -3.6], rotationY: .12, desiredSpan: 6.0 },
    archiveseed: { position: [6.5, 0, -3.5], rotationY: -.12, desiredSpan: 6.2 },
    greywatercore: { position: [0, 0, -3.2], rotationY: 0, desiredSpan: 4.7 },
    generator: { position: [-9.2, 0, -.2], rotationY: .15, desiredSpan: 3.0 },
    tower: { position: [9.5, 0, 2.2], rotationY: -.1, desiredSpan: 3.7 },
    terminal: { position: [-4.7, 0, .8], rotationY: .12, desiredSpan: 2.5 },
    powerrelay: { position: [4.8, 0, .8], rotationY: -.12, desiredSpan: 2.6 },
    capturebeacon: { position: [0, 0, 1.3], rotationY: 0, desiredSpan: 2.5 },
    ammostation: { position: [-7.6, 0, 3.8], rotationY: .14, desiredSpan: 2.7 },
    medcache: { position: [7.6, 0, 3.8], rotationY: -.14, desiredSpan: 2.7 },
    pipes: { position: [-10.1, 0, 6.7], rotationY: .1, desiredSpan: 3.5 },
    reel: { position: [10.1, 0, 6.8], rotationY: -.1, desiredSpan: 3.4 },
    gabion: { position: [-6.0, 0, 6.7], rotationY: .12, desiredSpan: 3.3 },
    peekcover: { position: [5.8, 0, 6.8], rotationY: -.12, desiredSpan: 3.7 },
    breakablecover: { position: [0, 0, 7.3], rotationY: 0, desiredSpan: 3.5 },
    waterlinedebris: { position: [0, .02, 9.2], rotationY: 0, desiredSpan: 8.6 },
    drainage: { position: [-8.4, .02, 9.1], rotationY: 0, desiredSpan: 3.8 },
    floorhatch: { position: [8.7, .02, 8.9], rotationY: 0, desiredSpan: 2.7 },
    breachvent: { position: [11.2, 0, 4.9], rotationY: -Math.PI / 2, desiredSpan: 3.0 },
    cargolift: { position: [-11.0, 0, 3.4], rotationY: Math.PI / 2, desiredSpan: 4.2 },
    loadingramp: { position: [-9.0, 0, 9.0], rotationY: Math.PI / 2, desiredSpan: 4.6 },
    stairs: { position: [-11.0, 0, .9], rotationY: Math.PI / 2, desiredSpan: 4.4 },
    catwalk: { position: [-9.6, 0, -2.7], rotationY: Math.PI / 2, desiredSpan: 4.8 },
    ladderplatform: { position: [10.9, 0, -4.5], rotationY: -Math.PI / 2, desiredSpan: 4.0 },
    footbridge: { position: [0, 0, 5.0], rotationY: 0, desiredSpan: 5.2 },
    shooterbot: { position: [-5.4, 0, -1.0], rotationY: Math.PI, desiredSpan: 2.3 },
    runnerbot: { position: [-3.6, 0, 1.9], rotationY: Math.PI, desiredSpan: 2.2 },
    blockbot: { position: [-1.7, 0, -.2], rotationY: Math.PI, desiredSpan: 2.7 },
    winged_drone: { position: [0, 2.2, -1.0], rotationY: Math.PI, desiredSpan: 2.4 },
    healer_bot: { position: [2.0, 0, -.2], rotationY: Math.PI, desiredSpan: 2.3 },
    sniper_bot: { position: [3.8, 0, 1.9], rotationY: Math.PI, desiredSpan: 2.4 },
    swarm_warden: { position: [5.5, 0, -1.0], rotationY: Math.PI, desiredSpan: 2.6 }
  }),
  'blackout-cistern': Object.freeze({
    cisternbackdrop: { position: [0, 0, -19.0], rotationY: 0, desiredSpan: 28 },
    retainingwall: { position: [-8.7, 0, -9.6], rotationY: .05, desiredSpan: 6.0 },
    concretewall: { position: [8.7, 0, -9.6], rotationY: -.05, desiredSpan: 6.0 },
    cisternfloorkit: { position: [0, .02, -.5], rotationY: 0, desiredSpan: 17.2 },
    lastlightreactor: { position: [0, 0, -2.2], rotationY: 0, desiredSpan: 4.8 },
    blackoutcues: { position: [0, 0, 5.7], rotationY: 0, desiredSpan: 8.2 },
    powerrelay: { position: [-4.1, 0, -4.6], rotationY: .12, desiredSpan: 2.5 },
    capturebeacon: { position: [4.1, 0, -4.6], rotationY: -.12, desiredSpan: 2.5 },
    lightmast: { position: [9.8, 0, -5.0], rotationY: -.08, desiredSpan: 3.6 },
    ammostation: { position: [-4.4, 0, 1.6], rotationY: .15, desiredSpan: 2.7 },
    medcache: { position: [4.4, 0, 1.6], rotationY: -.15, desiredSpan: 2.7 },
    pipes: { position: [-9.4, 0, 5.7], rotationY: .12, desiredSpan: 3.4 },
    gabion: { position: [9.3, 0, 5.8], rotationY: -.12, desiredSpan: 3.3 },
    cornercover: { position: [-7.2, 0, 8.4], rotationY: .5, desiredSpan: 3.2 },
    breakablecover: { position: [7.0, 0, 8.4], rotationY: -.15, desiredSpan: 3.2 },
    drainage: { position: [0, .02, 9.2], rotationY: 0, desiredSpan: 4.0 },
    floorhatch: { position: [-10.3, .02, -.4], rotationY: 0, desiredSpan: 2.5 },
    breachvent: { position: [10.5, 0, -.3], rotationY: -Math.PI / 2, desiredSpan: 2.8 },
    reinforcementdoor: { position: [-10.8, 0, -4.5], rotationY: Math.PI / 2, desiredSpan: 3.3 },
    cargolift: { position: [10.6, 0, 2.6], rotationY: -Math.PI / 2, desiredSpan: 4.0 },
    gruntbot: { position: [-6.0, 0, -1.5], rotationY: Math.PI, desiredSpan: 2.2 },
    gruntlingbot: { position: [-4.5, 0, -.1], rotationY: Math.PI, desiredSpan: 1.8 },
    runnerbot: { position: [-2.8, 0, 1.1], rotationY: Math.PI, desiredSpan: 2.1 },
    blockbot: { position: [0, 0, 2.0], rotationY: Math.PI, desiredSpan: 2.6 },
    winged_drone: { position: [2.6, 2.0, 1.0], rotationY: Math.PI, desiredSpan: 2.2 },
    healer_bot: { position: [4.5, 0, -.1], rotationY: Math.PI, desiredSpan: 2.2 },
    swarm_warden: { position: [6.1, 0, -1.5], rotationY: Math.PI, desiredSpan: 2.5 }
  })
});

function metadataFor(metadataById, assetId) {
  return metadataById instanceof Map ? metadataById.get(assetId) : metadataById?.[assetId];
}

function placementKind(assetId, metadata, level) {
  if (level.background.includes(assetId)) return 'background';
  if (level.characters.includes(assetId)) return 'character';
  if (STRUCTURAL_CATEGORIES.has(metadata?.category)) return 'structure';
  if (GROUND_CATEGORIES.has(metadata?.category)) return 'ground';
  return 'gameplay';
}

function desiredSpan(kind) {
  if (kind === 'background') return 28;
  if (kind === 'structure') return 6.2;
  if (kind === 'ground') return 4.5;
  if (kind === 'character') return 3.4;
  return 3.25;
}

function applyLevelOverrides(level, placements) {
  const overrides = LEVEL_PLACEMENT_OVERRIDES[level.id];
  if (!overrides) return placements;
  return placements.map((placement) => {
    const override = overrides[placement.id];
    if (!override) return placement;
    return {
      ...placement,
      ...override,
      position: override.position ? override.position.slice() : placement.position
    };
  });
}

export function createLevelSceneLayout(level, metadataById) {
  if (!level) throw new TypeError('createLevelSceneLayout requires a level.');

  const groups = {
    background: [],
    character: [],
    structure: [],
    ground: [],
    gameplay: []
  };

  for (const assetId of allLevelAssetIds(level)) {
    const metadata = metadataFor(metadataById, assetId);
    const kind = placementKind(assetId, metadata, level);
    groups[kind].push({ assetId, metadata, kind });
  }

  const placements = [];
  groups.background.forEach((entry, index) => placements.push({
    id: entry.assetId,
    kind: entry.kind,
    status: levelAssetStatus(level, entry.assetId),
    position: [index * 3, 0, -18.5 - index * 2],
    rotationY: 0,
    desiredSpan: desiredSpan(entry.kind)
  }));

  groups.structure.forEach((entry, index) => {
    const slot = STRUCTURAL_SLOTS[index % STRUCTURAL_SLOTS.length];
    const row = Math.floor(index / STRUCTURAL_SLOTS.length);
    placements.push({
      id: entry.assetId,
      kind: entry.kind,
      status: levelAssetStatus(level, entry.assetId),
      position: [slot[0], slot[1], slot[2] + row * 1.2],
      rotationY: slot[3],
      desiredSpan: desiredSpan(entry.kind)
    });
  });

  groups.ground.forEach((entry, index) => {
    const slot = GROUND_SLOTS[index % GROUND_SLOTS.length];
    placements.push({
      id: entry.assetId,
      kind: entry.kind,
      status: levelAssetStatus(level, entry.assetId),
      position: slot.slice(0, 3),
      rotationY: slot[3],
      desiredSpan: desiredSpan(entry.kind)
    });
  });

  groups.gameplay.forEach((entry, index) => {
    const slot = GAMEPLAY_SLOTS[index % GAMEPLAY_SLOTS.length];
    const ring = Math.floor(index / GAMEPLAY_SLOTS.length);
    placements.push({
      id: entry.assetId,
      kind: entry.kind,
      status: levelAssetStatus(level, entry.assetId),
      position: [slot[0] * (1 - ring * .08), slot[1], slot[2] + ring * .8],
      rotationY: slot[3],
      desiredSpan: desiredSpan(entry.kind)
    });
  });

  groups.character.forEach((entry, index) => placements.push({
    id: entry.assetId,
    kind: entry.kind,
    status: levelAssetStatus(level, entry.assetId),
    position: [(index - (groups.character.length - 1) / 2) * 3.8, 0, -4.2],
    rotationY: Math.PI,
    desiredSpan: desiredSpan(entry.kind)
  }));

  return applyLevelOverrides(level, placements);
}
