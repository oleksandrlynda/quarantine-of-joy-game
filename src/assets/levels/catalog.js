export const LEVEL_ASSET_PLAN = Object.freeze([
  {
    id: 'relay-district',
    number: '01',
    title: 'Relay District',
    waves: '1–5',
    role: 'Onboarding arena',
    boss: 'Broodmaker',
    accent: '#d7ff3f',
    reused: ['apartment', 'cornershop', 'facade', 'civicwall', 'roadcurb', 'sidewalk', 'streettree', 'checkpoint', 'roadblock', 'barriers', 'gabion', 'terminal', 'powerrelay', 'capturebeacon', 'reinforcementdoor', 'floorhatch', 'breachvent'],
    requested: ['relaymast', 'fireescape', 'broodinfestation', 'relaystreetkit'],
    background: ['relaybackdrop'],
    characters: ['boss_broodmaker']
  },
  {
    id: 'sanitizer-spire',
    number: '02',
    title: 'Sanitizer Spire',
    waves: '6–10',
    role: 'Suppression and target priority',
    boss: 'Commissioner Sanitizer',
    accent: '#63ded2',
    reused: ['clinic', 'clinicwall', 'corridor', 'decon', 'emergencysign', 'reinforcementdoor', 'shutter', 'terminal', 'powerrelay', 'ammostation', 'stairs', 'catwalk', 'cargolift', 'peekcover', 'cornercover'],
    requested: ['spirefacade', 'censorshipnodes', 'suppressiontiles'],
    background: ['spirebackdrop'],
    characters: ['boss_sanitizer']
  },
  {
    id: 'ad-zone-arena',
    number: '03',
    title: 'Ad-Zone Arena',
    waves: '11–15',
    role: 'Moving cover and area denial',
    boss: 'Influencer Captain',
    accent: '#ff7a36',
    reused: ['kiosk', 'cornershop', 'guardbooth', 'screenwall', 'barriers', 'roadblock', 'coverheights', 'breakablecover', 'lightmast', 'tower', 'catwalk', 'capturebeacon', 'terminal'],
    requested: ['billboardwall', 'sponsorprojector', 'adtrappylon', 'adplazakit'],
    background: ['adzonebackdrop'],
    characters: ['boss_captain', 'boss_zeppelin_pod']
  },
  {
    id: 'trend-wastes',
    number: '04',
    title: 'Trend Wastes',
    waves: '16–20',
    role: 'Weather and long sightlines',
    boss: 'Algorithm Shard Avatar',
    accent: '#e4b638',
    reused: ['hesco', 'screenwall', 'retainingwall', 'roadblock', 'roadcurb', 'drainage', 'roaddamage', 'benttree', 'deadtree', 'lightmast', 'checkpoint', 'capturebeacon', 'pipes', 'reel', 'gabion'],
    requested: ['stormbeacon', 'filterruin', 'windbreaks', 'wastesterrainkit'],
    background: ['wastesbackdrop'],
    characters: ['boss_shard_avatar']
  },
  {
    id: 'freight-annex',
    number: '05',
    title: 'Freight Annex',
    waves: '21–25',
    role: 'Industrial pressure and ambushes',
    boss: 'Broodmaker Heavy',
    accent: '#e06a36',
    reused: ['warehouse', 'servicewall', 'cargogate', 'concretewall', 'loadingramp', 'catwalk', 'stairs', 'ladderplatform', 'generator', 'pipes', 'reel', 'trolley', 'cargolift', 'floorhatch', 'breachvent', 'shutter', 'gabion', 'hesco', 'breakablecover'],
    requested: ['industrialnest', 'infectedprops', 'burrowbreach', 'freightlanekit'],
    background: ['freightbackdrop'],
    characters: ['boss_broodmaker']
  },
  {
    id: 'mirror-garden',
    number: '06',
    title: 'Mirror Garden',
    waves: '26–30',
    role: 'Clone identification and crowd control',
    boss: 'Echo Hydraclone',
    accent: '#a984d2',
    reused: ['civicwall', 'facade', 'streettree', 'broadleaf', 'coverheights', 'peekcover', 'cornercover', 'capturebeacon', 'powerrelay', 'terminal', 'lightmast', 'emergencysign'],
    requested: ['mirrorpanels', 'generationmarkers', 'splitring', 'glitchtopiary', 'mirrorgardenpaths'],
    background: ['mirrorbackdrop'],
    characters: ['boss_hydraclone']
  },
  {
    id: 'content-court',
    number: '07',
    title: 'Content Court',
    waves: '31–35',
    role: 'Radial objectives and Bureau trial',
    boss: 'Strike Adjudicator',
    accent: '#ff5c52',
    reused: ['fortwall', 'civicwall', 'corridor', 'archives', 'stairs', 'reinforcementdoor', 'emergencysign', 'terminal', 'powerrelay', 'capturebeacon', 'cornercover', 'peekcover', 'breakablecover'],
    requested: ['tribunaldais', 'purgenode', 'courtbench', 'courtsectoraisles'],
    background: ['courtbackdrop'],
    characters: ['boss_adjudicator']
  },
  {
    id: 'server-cathedral',
    number: '08',
    title: 'Server Cathedral',
    waves: '36–40',
    role: 'Campaign climax and player choice',
    boss: 'The Algorithm',
    accent: '#78a7ff',
    reused: ['corridor', 'archives', 'servicewall', 'clinicwall', 'catwalk', 'stairs', 'ladderplatform', 'cargolift', 'terminal', 'powerrelay', 'capturebeacon', 'emergencysign', 'lightmast', 'reinforcementdoor', 'shutter', 'breachvent'],
    requested: ['cathedralkit', 'dashboardwindows', 'mirrorchoir', 'rootaltar', 'endchoice', 'cathedralroutes'],
    background: ['cathedralbackdrop'],
    characters: ['boss_algorithm']
  },
  {
    id: 'sandstorm-expanse',
    number: 'E01',
    title: 'Sandstorm Expanse',
    waves: '41–50',
    role: 'Endurance weather run',
    boss: 'Elite command assault',
    accent: '#d8aa42',
    reused: ['hesco', 'screenwall', 'retainingwall', 'roadblock', 'roadcurb', 'drainage', 'roaddamage', 'benttree', 'deadtree', 'lightmast', 'tower', 'pipes', 'reel', 'gabion', 'checkpoint', 'cargogate', 'reinforcementdoor', 'ammostation', 'medcache', 'capturebeacon', 'powerrelay', 'stormbeacon', 'filterruin', 'windbreaks'],
    requested: ['sandbankkit', 'stormsiren', 'endurancemonument'],
    background: ['sandstormbackdrop'],
    characters: ['gruntbot', 'shooterbot', 'runnerbot', 'blockbot', 'winged_drone', 'healer_bot', 'swarm_warden']
  },
  {
    id: 'floodgate-continuity',
    number: 'E02',
    title: 'Floodgate Continuity',
    waves: '51–71',
    role: 'Transforming water routes',
    boss: 'Greywater master core',
    accent: '#58c7bd',
    reused: ['retainingwall', 'concretewall', 'servicewall', 'drainage', 'pipes', 'generator', 'reel', 'tower', 'catwalk', 'footbridge', 'stairs', 'ladderplatform', 'loadingramp', 'shutter', 'reinforcementdoor', 'cargolift', 'floorhatch', 'breachvent', 'terminal', 'powerrelay', 'capturebeacon', 'ammostation', 'medcache', 'gabion', 'peekcover', 'breakablecover'],
    requested: ['floodgatekit', 'pumpturbine', 'sluiceconduits', 'archiveseed', 'greywatercore', 'waterlinedebris'],
    background: ['floodgatebackdrop'],
    characters: ['shooterbot', 'runnerbot', 'blockbot', 'winged_drone', 'healer_bot', 'sniper_bot', 'swarm_warden']
  },
  {
    id: 'blackout-cistern',
    number: '72',
    title: 'Blackout Cistern',
    waves: '72',
    role: 'Last Light swarm survival',
    boss: 'Persistent Swarm Warden',
    accent: '#74e6d8',
    reused: ['retainingwall', 'concretewall', 'drainage', 'pipes', 'powerrelay', 'capturebeacon', 'lightmast', 'floorhatch', 'breachvent', 'reinforcementdoor', 'cargolift', 'ammostation', 'medcache', 'cornercover', 'breakablecover', 'gabion'],
    requested: ['lastlightreactor', 'cisternfloorkit', 'blackoutcues'],
    background: ['cisternbackdrop'],
    characters: ['gruntbot', 'gruntlingbot', 'runnerbot', 'blockbot', 'winged_drone', 'healer_bot', 'swarm_warden']
  }
]);

export function allLevelAssetIds(level) {
  return [...level.background, ...level.requested, ...level.reused, ...level.characters];
}

export function levelAssetStatus(level, assetId) {
  if (level.background.includes(assetId)) return 'background';
  if (level.requested.includes(assetId)) return 'new';
  if (level.characters.includes(assetId)) return 'character';
  return 'reuse';
}
