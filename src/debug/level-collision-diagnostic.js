import {
  APARTMENT_COLLIDER_PROFILE,
  assetColliderProfileIds,
  BARRIERS_COLLIDER_PROFILE,
  BENT_TREE_COLLIDER_PROFILE,
  BILLBOARD_WALL_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  BROADLEAF_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE,
  CLINIC_COLLIDER_PROFILE,
  CONCRETE_WALL_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  CORNER_SHOP_COLLIDER_PROFILE,
  COVER_HEIGHTS_COLLIDER_PROFILE,
  DEAD_TREE_COLLIDER_PROFILE,
  FACADE_COLLIDER_PROFILE,
  FILTER_RUIN_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  GLITCH_TOPIARY_COLLIDER_PROFILE,
  GUARD_BOOTH_COLLIDER_PROFILE,
  HESCO_COLLIDER_PROFILE,
  KIOSK_COLLIDER_PROFILE,
  PEEK_COVER_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  GENERATOR_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  RETAINING_WALL_COLLIDER_PROFILE,
  SCREEN_WALL_COLLIDER_PROFILE,
  SERVICE_WALL_COLLIDER_PROFILE,
  SPONSOR_PROJECTOR_COLLIDER_PROFILE,
  STORM_BEACON_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE,
  TOWER_COLLIDER_PROFILE,
  TROLLEY_COLLIDER_PROFILE,
  WAREHOUSE_COLLIDER_PROFILE,
  WINDBREAKS_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  ARCHIVES_COLLIDER_PROFILE,
  EMERGENCY_SIGN_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

const finding = (code, severity, message, evidence = {}) => ({ code, severity, message, evidence });

export const LEVEL_COLLISION_CHANNELS = Object.freeze([
  Object.freeze({ id: 'player_walk', label: 'Player walk' }),
  Object.freeze({ id: 'player_jump_walk', label: 'Player jump + walk' }),
  Object.freeze({ id: 'enemy_walk', label: 'Enemy walk' }),
  Object.freeze({ id: 'player_shot', label: 'Player shot' }),
  Object.freeze({ id: 'enemy_shot', label: 'Enemy shot' }),
  Object.freeze({ id: 'visual_boundary', label: 'Visual boundary' })
]);

export const LEVEL_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_1', label: 'Wave 1 — cordon', wave: 1 }),
  Object.freeze({ id: 'wave_2', label: 'Wave 2 — alarm', wave: 2 }),
  Object.freeze({ id: 'wave_3', label: 'Wave 3 — feeds', wave: 3 }),
  Object.freeze({ id: 'wave_4', label: 'Wave 4 — mast', wave: 4 }),
  Object.freeze({ id: 'wave_5', label: 'Wave 5 — Broodmaker', wave: 5 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — liberated', wave: 5, liberated: true })
]);

export const LEVEL_2_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_6', label: 'Wave 6 — enter the Spire', wave: 6 }),
  Object.freeze({ id: 'wave_7', label: 'Wave 7 — sterile crossfire', wave: 7 }),
  Object.freeze({ id: 'wave_8', label: 'Wave 8 — break the censors', wave: 8 }),
  Object.freeze({ id: 'wave_9', label: 'Wave 9 — press lockdown', wave: 9 }),
  Object.freeze({ id: 'wave_10', label: 'Wave 10 — Sanitizer', wave: 10 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — Spire liberated', wave: 10, liberated: true })
]);

export const LEVEL_3_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_11', label: 'Wave 11 — seize the plaza', wave: 11 }),
  Object.freeze({ id: 'wave_12', label: 'Wave 12 — moving message', wave: 12 }),
  Object.freeze({ id: 'wave_13', label: 'Wave 13 — sponsor window', wave: 13 }),
  Object.freeze({ id: 'wave_14', label: 'Wave 14 — brand lockdown', wave: 14 }),
  Object.freeze({ id: 'wave_15', label: 'Wave 15 — Captain', wave: 15 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — Ad-Zone liberated', wave: 15, liberated: true })
]);

export const LEVEL_4_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_16', label: 'Wave 16 — enter the gust', wave: 16 }),
  Object.freeze({ id: 'wave_17', label: 'Wave 17 — crosswind fire', wave: 17 }),
  Object.freeze({ id: 'wave_18', label: 'Wave 18 — blind lane', wave: 18 }),
  Object.freeze({ id: 'wave_19', label: 'Wave 19 — eye wall', wave: 19 }),
  Object.freeze({ id: 'wave_20', label: 'Wave 20 — Shard', wave: 20 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — Trend Wastes liberated', wave: 20, liberated: true })
]);

export const LEVEL_5_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_21', label: 'Wave 21 — yard intake', wave: 21 }),
  Object.freeze({ id: 'wave_22', label: 'Wave 22 — lift ambush', wave: 22 }),
  Object.freeze({ id: 'wave_23', label: 'Wave 23 — infected manifest', wave: 23 }),
  Object.freeze({ id: 'wave_24', label: 'Wave 24 — cargo breach', wave: 24 }),
  Object.freeze({ id: 'wave_25', label: 'Wave 25 — Broodmaker Prime', wave: 25 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — Freight Annex liberated', wave: 25, liberated: true })
]);

export const LEVEL_6_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_26', label: 'Wave 26 — enter the garden', wave: 26 }),
  Object.freeze({ id: 'wave_27', label: 'Wave 27 — false reflections', wave: 27 }),
  Object.freeze({ id: 'wave_28', label: 'Wave 28 — double exposure', wave: 28 }),
  Object.freeze({ id: 'wave_29', label: 'Wave 29 — break the image', wave: 29 }),
  Object.freeze({ id: 'wave_30', label: 'Wave 30 — Hydraclone', wave: 30 }),
  Object.freeze({ id: 'liberated', label: 'Boss defeated — Mirror Garden liberated', wave: 30, liberated: true })
]);

export const CONTENT_COURT_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_31', label: 'Wave 31 - call to order', wave: 31 }),
  Object.freeze({ id: 'wave_32', label: 'Wave 32 - citation docket', wave: 32 }),
  Object.freeze({ id: 'wave_33', label: 'Wave 33 - purge the record', wave: 33 }),
  Object.freeze({ id: 'wave_34', label: 'Wave 34 - final objection', wave: 34 }),
  Object.freeze({ id: 'wave_35', label: 'Wave 35 - The Adjudicator', wave: 35 }),
  Object.freeze({ id: 'liberated', label: 'Adjudicator defeated - Court liberated', wave: 35, liberated: true })
]);

export const LAST_ORDER_COLLISION_PHASES = Object.freeze([
  Object.freeze({ id: 'wave_41', label: 'Wave 41 - Last Order escape', wave: 41 })
]);

const latePhase = (wave, label) => Object.freeze({ id: `wave_${wave}`, label, wave });
const liberatedPhase = (wave, label) => Object.freeze({ id: 'liberated', label, wave, liberated: true });

export const SERVER_CATHEDRAL_COLLISION_PHASES = Object.freeze([
  latePhase(36, 'Wave 36 - Cathedral breach'), latePhase(37, 'Wave 37 - logic rooms'),
  latePhase(38, 'Wave 38 - mirror choir'), latePhase(39, 'Wave 39 - Root Altar'),
  latePhase(40, 'Wave 40 - The Algorithm'), liberatedPhase(40, 'Algorithm defeated - ending choice')
]);

export const SANDSTORM_COLLISION_PHASES = Object.freeze([
  latePhase(42, 'Wave 42 - enter the Expanse'), latePhase(45, 'Wave 45 - supply hold'),
  latePhase(48, 'Wave 48 - beacon failure'), latePhase(51, 'Wave 51 - last horizon'),
  liberatedPhase(51, 'Expanse complete - monument online')
]);

export const FLOODGATE_COLLISION_PHASES = Object.freeze([
  latePhase(52, 'Wave 52 - dry maintenance'), latePhase(59, 'Wave 59 - rising continuity'),
  latePhase(66, 'Wave 66 - archive vault'), latePhase(72, 'Wave 72 - Greywater core'),
  liberatedPhase(72, 'Floodgate liberated - continuity restored')
]);

export const BLACKOUT_CISTERN_COLLISION_PHASES = Object.freeze([
  latePhase(73, 'Wave 73 - Last Light'), liberatedPhase(73, 'Last Light complete')
]);

const lateJourney = (id, label, actor, start, goal, extra = {}) => Object.freeze({
  id, label, actor, start: Object.freeze(start), goal: Object.freeze(goal),
  tolerance: actor === 'player' ? 1.1 : 1.25, ...extra
});

export const SERVER_CATHEDRAL_JOURNEYS = Object.freeze([
  lateJourney('player_spawn_to_root', 'Player spawn -> Root Altar', 'player', [0, 28], [0, 5]),
  lateJourney('player_spawn_to_west_control', 'Player spawn -> west control approach', 'player', [0, 28], [-21.5, -17]),
  lateJourney('player_spawn_to_east_control', 'Player spawn -> east control approach', 'player', [0, 28], [21.5, -17]),
  lateJourney('player_to_ending_choice', 'Player spawn -> ending choice approach', 'player', [0, 28], [0, 21]),
  lateJourney('enemy_north_west_to_nave', 'North-west entrance -> south nave', 'enemy', [-10, -27.5], [0, 14], { agentRadius: 1.2 }),
  lateJourney('enemy_north_east_to_nave', 'North-east entrance -> south nave', 'enemy', [10, -27.5], [0, 14], { agentRadius: 1.2 }),
  lateJourney('enemy_west_to_nave', 'West transept -> south nave', 'enemy', [-29, -10], [0, 14], { agentRadius: 1.2 }),
  lateJourney('enemy_east_to_nave', 'East transept -> south nave', 'enemy', [29, 10], [0, 14], { agentRadius: 1.2 })
]);

export const SANDSTORM_JOURNEYS = Object.freeze([
  lateJourney('player_spawn_to_siren', 'Player spawn -> storm siren approach', 'player', [0, 25.5], [4, -20.5]),
  lateJourney('player_to_west_beacon', 'Player spawn -> west beacon approach', 'player', [0, 25.5], [-22, -15.5]),
  lateJourney('player_to_east_beacon', 'Player spawn -> east beacon approach', 'player', [0, 25.5], [22, -15.5]),
  lateJourney('enemy_north_west_to_center', 'North-west entrance -> center', 'enemy', [-22, -26.5], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_north_east_to_center', 'North-east entrance -> center', 'enemy', [22, -26.5], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_south_west_to_center', 'South-west entrance -> center', 'enemy', [-22, 26.5], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_south_east_to_center', 'South-east entrance -> center', 'enemy', [22, 26.5], [0, 0], { agentRadius: 1.2 })
]);

export const FLOODGATE_JOURNEYS = Object.freeze([
  lateJourney('player_spawn_to_gate', 'Player spawn -> floodgate approach', 'player', [-22, 29], [0, -23]),
  lateJourney('player_to_west_relay', 'Player spawn -> west handshake relay approach', 'player', [-22, 29], [-18.5, -16]),
  lateJourney('player_to_east_relay', 'Player spawn -> east handshake relay approach', 'player', [-22, 29], [18.5, -16]),
  lateJourney('player_to_center_seed', 'Player spawn -> center archive seed approach', 'player', [-22, 29], [0, 12]),
  lateJourney('enemy_north_west_to_center', 'North-west entrance -> central lane', 'enemy', [-22, -28.5], [0, 4], { agentRadius: 1.2 }),
  lateJourney('enemy_north_east_to_center', 'North-east entrance -> central lane', 'enemy', [22, -28.5], [0, 4], { agentRadius: 1.2 }),
  lateJourney('enemy_south_west_to_center', 'South-west entrance -> central lane', 'enemy', [-22, 28], [0, 4], { agentRadius: 1.2 }),
  lateJourney('enemy_south_east_to_center', 'South-east entrance -> central lane', 'enemy', [22, 28], [0, 4], { agentRadius: 1.2 })
]);

export const BLACKOUT_CISTERN_JOURNEYS = Object.freeze([
  lateJourney('player_spawn_to_reactor', 'Player spawn -> Last Light reactor approach', 'player', [0, 7.5], [0, 3.5]),
  lateJourney('player_cross_cistern', 'Player north sector -> south sector', 'player', [0, -20], [0, 20]),
  lateJourney('enemy_north_to_reactor', 'North sector -> reactor approach', 'enemy', [0, -19.6], [0, -4.5], { agentRadius: 1.0 }),
  lateJourney('enemy_south_to_reactor', 'South sector -> reactor approach', 'enemy', [0, 19.6], [0, 4.5], { agentRadius: 1.0 }),
  lateJourney('enemy_west_to_reactor', 'West sector -> reactor approach', 'enemy', [-16.97, -9.8], [-4.5, 0], { agentRadius: 1.0 }),
  lateJourney('enemy_east_to_reactor', 'East sector -> reactor approach', 'enemy', [16.97, -9.8], [4.5, 0], { agentRadius: 1.0 })
]);

export const CONTENT_COURT_JOURNEYS = Object.freeze([
  lateJourney('player_spawn_to_north_node', 'Player spawn -> north Purge Node approach', 'player', [0, 26], [0, -18]),
  lateJourney('player_spawn_to_west_node', 'Player spawn -> west Purge Node approach', 'player', [0, 26], [-13, 7.5]),
  lateJourney('player_spawn_to_east_node', 'Player spawn -> east Purge Node approach', 'player', [0, 26], [13, 7.5]),
  lateJourney('player_appeal_loop_crossing', 'Player west appeal -> east appeal', 'player', [-29, -8], [29, -8]),
  lateJourney('enemy_north_west_to_dais', 'North-west records -> tribunal dais', 'enemy', [-6, -26.5], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_north_east_to_dais', 'North-east records -> tribunal dais', 'enemy', [6, -26.5], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_west_to_dais', 'West appeal -> tribunal dais', 'enemy', [-29, -8], [0, 0], { agentRadius: 1.2 }),
  lateJourney('enemy_east_to_dais', 'East appeal -> tribunal dais', 'enemy', [29, -8], [0, 0], { agentRadius: 1.2 })
]);

export const LEVEL_1_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_mast', label: 'Player spawn → mast approach', actor: 'player', start: [0, 22], goal: [0, -2], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_west_feed', label: 'Player spawn → west feed', actor: 'player', start: [0, 22], goal: [-12.4, 2], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_east_feed', label: 'Player spawn → east feed', actor: 'player', start: [0, 22], goal: [12.4, 2], tolerance: 1.1 }),
  Object.freeze({ id: 'player_cross_lane', label: 'Player west gate → east alley', actor: 'player', start: [-27, 3.5], goal: [27, -9], tolerance: 1.1 }),
  Object.freeze({ id: 'player_fireescape_approach', label: 'Player spawn → fire escape', actor: 'player', start: [0, 22], goal: [-27, -4], tolerance: 1.1 }),
  Object.freeze({ id: 'enemy_north_to_spawn', label: 'Enemy north door → player spawn', actor: 'enemy', start: [-5, -20], goal: [0, 22], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_west_to_mast', label: 'Enemy west gate → mast flank', actor: 'enemy', start: [-27, 3.5], goal: [-4, -7], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_east_to_mast', label: 'Enemy east alley → mast flank', actor: 'enemy', start: [27, -9], goal: [4, -7], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_hatch_to_spawn', label: 'Enemy floor hatch → player spawn', actor: 'enemy', start: [-12, -14.1], goal: [0, 22], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_vent_to_spawn', label: 'Enemy rear vent → player spawn', actor: 'enemy', start: [21.5, -14.2], goal: [0, 22], tolerance: 1.25 })
]);

export const LEVEL_2_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_spire', label: 'Player spawn → Spire approach', actor: 'player', start: [0, 22], goal: [0, -14], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_west_cover', label: 'Player spawn → west beam cover', actor: 'player', start: [0, 22], goal: [-12.5, -3.5], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_east_cover', label: 'Player spawn → east beam cover', actor: 'player', start: [0, 22], goal: [12.5, -3.5], tolerance: 1.1 }),
  Object.freeze({ id: 'player_west_to_east_gallery', label: 'Player west clinic → east decon lane', actor: 'player', start: [-23, -10], goal: [23, 14], tolerance: 1.1 }),
  Object.freeze({ id: 'player_south_to_press_door', label: 'Player south reinforcement → press door', actor: 'player', start: [-12, 21], goal: [-11, -17.5], tolerance: 1.1 }),
  Object.freeze({ id: 'enemy_north_to_spawn', label: 'Enemy press door → player spawn', actor: 'enemy', start: [-11, -17.5], goal: [0, 22], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_west_to_center', label: 'Enemy west clinic → arena center', actor: 'enemy', start: [-23, -10], goal: [0, 1], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_east_to_center', label: 'Enemy east decon → arena center', actor: 'enemy', start: [23, 14], goal: [0, 1], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_south_to_spire', label: 'Enemy south reinforcement → Spire flank', actor: 'enemy', start: [-12, 21], goal: [5, -14], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_cross_gallery', label: 'Enemy west gallery → east relay lane', actor: 'enemy', start: [-18, 4], goal: [12, 5], tolerance: 1.25 }),
  // Portal parity is static geometry, so these run once unless a phase is selected.
  // Both directions prevent a grid-rasterization asymmetry from appearing healthy.
  Object.freeze({ id: 'portal_west_player_southbound', label: 'Player through west decon: south → north', actor: 'player', start: [-20, 22.5], goal: [-20, 15.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_player_northbound', label: 'Player through west decon: north → south', actor: 'player', start: [-20, 15.5], goal: [-20, 22.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_grunt_southbound', label: 'Grunt through west decon: south → north', actor: 'enemy', enemyType: 'grunt', start: [-20, 22.5], goal: [-20, 15.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_grunt_northbound', label: 'Grunt through west decon: north → south', actor: 'enemy', enemyType: 'grunt', start: [-20, 15.5], goal: [-20, 22.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_tank_southbound', label: 'Tank through west decon: south → north', actor: 'enemy', enemyType: 'tank', start: [-20, 22.5], goal: [-20, 15.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_tank_northbound', label: 'Tank through west decon: north → south', actor: 'enemy', enemyType: 'tank', start: [-20, 15.5], goal: [-20, 22.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_east_player_southbound', label: 'Player through east decon: south → north', actor: 'player', start: [20, 22.5], goal: [20, 15.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_player_northbound', label: 'Player through east decon: north → south', actor: 'player', start: [20, 15.5], goal: [20, 22.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_grunt_southbound', label: 'Grunt through east decon: south → north', actor: 'enemy', enemyType: 'grunt', start: [20, 22.5], goal: [20, 15.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_grunt_northbound', label: 'Grunt through east decon: north → south', actor: 'enemy', enemyType: 'grunt', start: [20, 15.5], goal: [20, 22.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_tank_southbound', label: 'Tank through east decon: south → north', actor: 'enemy', enemyType: 'tank', start: [20, 22.5], goal: [20, 15.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_tank_northbound', label: 'Tank through east decon: north → south', actor: 'enemy', enemyType: 'tank', start: [20, 15.5], goal: [20, 22.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_west_convoy_southbound', label: 'Three-Grunt convoy through west decon: south → north', actor: 'enemy', enemyType: 'grunt', convoyCount: 3, start: [-20, 22], goal: [-20, 16], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_west_convoy_northbound', label: 'Three-Grunt convoy through west decon: north → south', actor: 'enemy', enemyType: 'grunt', convoyCount: 3, start: [-20, 16], goal: [-20, 22], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'west-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 } }),
  Object.freeze({ id: 'portal_east_convoy_southbound', label: 'Three-Grunt convoy through east decon: south → north', actor: 'enemy', enemyType: 'grunt', convoyCount: 3, start: [20, 22], goal: [20, 16], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_east_convoy_northbound', label: 'Three-Grunt convoy through east decon: north → south', actor: 'enemy', enemyType: 'grunt', convoyCount: 3, start: [20, 16], goal: [20, 22], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'east-decon', portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: 18.06, max: 21.94 } }),
  Object.freeze({ id: 'portal_sign_player_southbound', label: 'Player through emergency sign: south → north', actor: 'player', start: [0, 24.5], goal: [0, 20.1], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } }),
  Object.freeze({ id: 'portal_sign_player_northbound', label: 'Player through emergency sign: north → south', actor: 'player', start: [0, 20.1], goal: [0, 24.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } }),
  Object.freeze({ id: 'portal_sign_grunt_southbound', label: 'Grunt through emergency sign: south → north', actor: 'enemy', enemyType: 'grunt', start: [0, 24.5], goal: [0, 20.1], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } }),
  Object.freeze({ id: 'portal_sign_grunt_northbound', label: 'Grunt through emergency sign: north → south', actor: 'enemy', enemyType: 'grunt', start: [0, 20.1], goal: [0, 24.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } }),
  Object.freeze({ id: 'portal_sign_tank_southbound', label: 'Tank through emergency sign: south → north', actor: 'enemy', enemyType: 'tank', start: [0, 24.5], goal: [0, 20.1], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } }),
  Object.freeze({ id: 'portal_sign_tank_northbound', label: 'Tank through emergency sign: north → south', actor: 'enemy', enemyType: 'tank', start: [0, 20.1], goal: [0, 24.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'emergency-sign', portalPlane: { axis: 'z', value: 21.42, crossAxis: 'x', min: -2.295, max: 2.295 } })
]);

export const LEVEL_3_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_sponsor_court', label: 'Player spawn → sponsor court approach', actor: 'player', start: [0, 22], goal: [0, 9], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_west_cover', label: 'Player spawn → west moving-cover lane', actor: 'player', start: [0, 22], goal: [-14, -8], tolerance: 1.1 }),
  Object.freeze({ id: 'player_spawn_to_east_cover', label: 'Player spawn → east moving-cover lane', actor: 'player', start: [0, 22], goal: [14, -8], tolerance: 1.1 }),
  Object.freeze({ id: 'player_cross_south_lane', label: 'Player west gate → east gate', actor: 'player', start: [-26.5, 16], goal: [26.5, 16], tolerance: 1.1 }),
  Object.freeze({ id: 'player_south_west_to_north_left', label: 'Player south-west gate → north-left gate', actor: 'player', start: [-11, 23], goal: [-9, -23], tolerance: 1.1 }),
  Object.freeze({ id: 'player_south_east_to_north_right', label: 'Player south-east gate → north-right gate', actor: 'player', start: [11, 23], goal: [8, -23], tolerance: 1.1 }),
  Object.freeze({ id: 'enemy_north_left_to_spawn', label: 'Enemy north-left gate → player spawn', actor: 'enemy', start: [-9, -23], goal: [0, 22], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_north_right_to_court', label: 'Enemy north-right gate → sponsor court flank', actor: 'enemy', start: [8, -23], goal: [5, 10], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_west_to_center', label: 'Enemy west market gate → arena center', actor: 'enemy', start: [-26.5, 16], goal: [0, 0], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_east_to_center', label: 'Enemy east service gate → arena center', actor: 'enemy', start: [26.5, 16], goal: [0, 0], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_south_west_to_boss_flank', label: 'Enemy south-west gate → boss flank', actor: 'enemy', start: [-11, 23], goal: [-5, -4], tolerance: 1.25 }),
  Object.freeze({ id: 'enemy_south_east_to_boss_flank', label: 'Enemy south-east gate → boss flank', actor: 'enemy', start: [11, 23], goal: [5, -4], tolerance: 1.25 })
]);

export const LEVEL_4_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_shard_core', label: 'Player spawn → Shard core', actor: 'player', start: [0, 26], goal: [0, -3.5], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_south_to_storm_beacon', label: 'Player spawn → storm beacon approach', actor: 'player', start: [0, 26], goal: [0, -17], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_west_wind_lane', label: 'Player south-west road → north-west cut', actor: 'player', start: [-16, 26], goal: [-16, -26], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_east_wind_lane', label: 'Player south-east road → north-east cut', actor: 'player', start: [16, 26], goal: [16, -26], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_north_cross_route', label: 'Player west perimeter → east perimeter through north shelter', actor: 'player', start: [-27, -14], goal: [27, -14], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_south_cross_route', label: 'Player west wash → east wash through south shelter', actor: 'player', start: [-26, 14], goal: [26, 14], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_west_to_spawn', label: 'Enemy north-west cut → player spawn', actor: 'enemy', start: [-16, -26], goal: [0, 26], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_east_to_core', label: 'Enemy north-east cut → Shard flank', actor: 'enemy', start: [16, -26], goal: [5, -3.5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_west_wash_to_core', label: 'Enemy west wash → arena core', actor: 'enemy', start: [-26, 5], goal: [0, -3.5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_east_wash_to_core', label: 'Enemy east wash → arena core', actor: 'enemy', start: [26, 5], goal: [0, -3.5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_south_west_to_beacon', label: 'Enemy south-west road → storm beacon flank', actor: 'enemy', start: [-16, 26], goal: [-5, -22], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_south_east_to_beacon', label: 'Enemy south-east road → storm beacon flank', actor: 'enemy', start: [16, 26], goal: [5, -22], tolerance: 1.25, staticOnce: true })
]);

export const LEVEL_5_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_boss_core', label: 'Player spawn → Broodmaker core', actor: 'player', start: [0, 27], goal: [0, -2], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_spawn_to_north_gate', label: 'Player spawn → north cargo gate', actor: 'player', start: [0, 27], goal: [0, -25], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_cross_service_yard', label: 'Player west service gate → east service gate', actor: 'player', start: [-29, 8], goal: [29, 8], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_cross_south_yard', label: 'Player south-west yard → south-east yard', actor: 'player', start: [-27, 25], goal: [27, 25], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_north_loading_crossing', label: 'Player north-west loading lane → north-east loading lane', actor: 'player', start: [-13, -22], goal: [13, -22], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_floor_hatch_to_rear_vent', label: 'Player floor hatch → rear vent', actor: 'player', start: [-12, 18], goal: [29, -12], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_left_to_spawn', label: 'Enemy north-left gate → player spawn', actor: 'enemy', start: [-12, -25], goal: [0, 27], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_right_to_core', label: 'Enemy north-right gate → arena core', actor: 'enemy', start: [12, -25], goal: [5, -2], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_west_service_to_core', label: 'Enemy west service gate → arena core', actor: 'enemy', start: [-29, 8], goal: [0, -2], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_east_service_to_core', label: 'Enemy east service gate → arena core', actor: 'enemy', start: [29, 8], goal: [0, -2], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_floor_hatch_to_spawn', label: 'Enemy floor hatch → player spawn', actor: 'enemy', start: [-12, 18], goal: [0, 27], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_rear_vent_to_spawn', label: 'Enemy rear vent → player spawn', actor: 'enemy', start: [29, -12], goal: [0, 27], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'portal_cargo_player_northbound', label: 'Player through cargo gate: yard → north apron', actor: 'player', start: [0, -25], goal: [0, -30.25], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_player_southbound', label: 'Player through cargo gate: north apron → yard', actor: 'player', start: [0, -30.25], goal: [0, -25], tolerance: 1.1, agentRadius: .5, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_grunt_northbound', label: 'Grunt through cargo gate: yard → north apron', actor: 'enemy', enemyType: 'grunt', start: [0, -25], goal: [0, -30.25], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_grunt_southbound', label: 'Grunt through cargo gate: north apron → yard', actor: 'enemy', enemyType: 'grunt', start: [0, -30.25], goal: [0, -25], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_tank_northbound', label: 'Tank through cargo gate: yard → north apron', actor: 'enemy', enemyType: 'tank', start: [0, -25], goal: [0, -30.25], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_tank_southbound', label: 'Tank through cargo gate: north apron → yard', actor: 'enemy', enemyType: 'tank', start: [0, -30], goal: [0, -25], tolerance: 1.25, agentRadius: .92, staticOnce: true, contractKind: 'portal_transit', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_convoy_northbound', label: 'Three-Grunt convoy through cargo gate: yard → north apron', actor: 'enemy', enemyType: 'grunt', convoyCount: 3, start: [0, -26.9], goal: [0, -30], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } }),
  Object.freeze({ id: 'portal_cargo_convoy_southbound', label: 'Two-Grunt convoy through cargo gate: north apron → yard', actor: 'enemy', enemyType: 'grunt', convoyCount: 2, start: [0, -29.5], goal: [0, -25.5], tolerance: 1.25, agentRadius: .58, staticOnce: true, contractKind: 'portal_convoy', portalId: 'north-cargo-gate', portalPlane: { axis: 'z', value: -28, crossAxis: 'x', min: -1.65, max: 1.65 } })
]);

const MIRROR_OPEN_PHASES = Object.freeze(['wave_30', 'liberated']);

export const LEVEL_6_JOURNEYS = Object.freeze([
  Object.freeze({ id: 'player_spawn_to_center', label: 'Player spawn → clone court', actor: 'player', start: [0, 30.5], goal: [0, 0], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_outer_west_to_east', label: 'Player west garden → east garden', actor: 'player', start: [-29.5, 8], goal: [29.5, 8], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_outer_north_to_south', label: 'Player north pavilion → south garden', actor: 'player', start: [0, -29.5], goal: [0, 29.5], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_reflection_crossing', label: 'Player north-west reflection → north-east reflection', actor: 'player', start: [-26, -19], goal: [26, -19], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'player_south_gate_crossing', label: 'Player south-west gate → south-east gate', actor: 'player', start: [-11, 29.5], goal: [11, 29.5], tolerance: 1.1, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_to_spawn', label: 'Enemy north pavilion → player spawn', actor: 'enemy', start: [0, -29.5], goal: [0, 30.5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_south_west_to_center', label: 'Enemy south-west gate → clone court', actor: 'enemy', start: [-11, 29.5], goal: [-5, 0], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_south_east_to_center', label: 'Enemy south-east gate → clone court', actor: 'enemy', start: [11, 29.5], goal: [5, 0], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_west_to_center', label: 'Enemy west garden gate → clone court', actor: 'enemy', start: [-29.5, 0], goal: [0, -5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_east_to_center', label: 'Enemy east garden gate → clone court', actor: 'enemy', start: [29.5, 0], goal: [0, 5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_west_to_spawn', label: 'Enemy north-west reflection → player spawn', actor: 'enemy', start: [-26, -19], goal: [0, 30.5], tolerance: 1.25, staticOnce: true }),
  Object.freeze({ id: 'enemy_north_east_to_spawn', label: 'Enemy north-east reflection → player spawn', actor: 'enemy', start: [26, -19], goal: [0, 30.5], tolerance: 1.25, staticOnce: true }),

  // The widest enemy and the production player exercise opposite directions
  // through every cardinal shortcut once the mirror barriers retract.
  Object.freeze({ id: 'portal_north_player_inward', label: 'Player through north mirror → court', actor: 'player', start: [0, -24.5], goal: [0, -16.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'north-mirror', portalPlane: { axis: 'z', value: -20.5, crossAxis: 'x', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_north_tank_outward', label: 'Tank through north mirror → pavilion', actor: 'enemy', enemyType: 'tank', start: [0, -16.5], goal: [0, -24.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'north-mirror', portalPlane: { axis: 'z', value: -20.5, crossAxis: 'x', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_south_player_inward', label: 'Player through south mirror → court', actor: 'player', start: [0, 24.5], goal: [0, 16.5], tolerance: 1.1, agentRadius: .5, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'south-mirror', portalPlane: { axis: 'z', value: 20.5, crossAxis: 'x', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_south_tank_outward', label: 'Tank through south mirror → garden', actor: 'enemy', enemyType: 'tank', start: [0, 16.5], goal: [0, 24.5], tolerance: 1.25, agentRadius: .92, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'south-mirror', portalPlane: { axis: 'z', value: 20.5, crossAxis: 'x', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_west_player_inward', label: 'Player through west mirror → court', actor: 'player', start: [-24.5, 0], goal: [-16.5, 0], tolerance: 1.1, agentRadius: .5, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'west-mirror', portalPlane: { axis: 'x', value: -20.5, crossAxis: 'z', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_west_tank_outward', label: 'Tank through west mirror → garden', actor: 'enemy', enemyType: 'tank', start: [-16.5, 0], goal: [-24.5, 0], tolerance: 1.25, agentRadius: .92, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'west-mirror', portalPlane: { axis: 'x', value: -20.5, crossAxis: 'z', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_east_player_inward', label: 'Player through east mirror → court', actor: 'player', start: [24.5, 0], goal: [16.5, 0], tolerance: 1.1, agentRadius: .5, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'east-mirror', portalPlane: { axis: 'x', value: 20.5, crossAxis: 'z', min: -3.9, max: 3.9 } }),
  Object.freeze({ id: 'portal_east_tank_outward', label: 'Tank through east mirror → garden', actor: 'enemy', enemyType: 'tank', start: [16.5, 0], goal: [24.5, 0], tolerance: 1.25, agentRadius: .92, staticOnce: true, applicablePhases: MIRROR_OPEN_PHASES, contractKind: 'portal_transit', portalId: 'east-mirror', portalPlane: { axis: 'x', value: 20.5, crossAxis: 'z', min: -3.9, max: 3.9 } })
]);

export const LAST_ORDER_JOURNEYS = Object.freeze([
  Object.freeze({
    id: 'player_full_escape', label: 'Player command entrance to shutdown terminal', actor: 'player',
    start: [0, 50.4], goal: [0, -70.2], tolerance: 1.15, pathRadius: 105
  }),
  Object.freeze({
    id: 'player_west_escape_lane', label: 'Player west pursuit lane to terminal approach', actor: 'player',
    start: [-3.2, 42], goal: [-3.2, -66], tolerance: 1.15, pathRadius: 100
  }),
  Object.freeze({
    id: 'player_east_escape_lane', label: 'Player east pursuit lane to terminal approach', actor: 'player',
    start: [3.2, 42], goal: [3.2, -66], tolerance: 1.15, pathRadius: 100
  }),
  Object.freeze({
    id: 'player_terminal_cross_lane', label: 'Player west terminal bank to east terminal bank', actor: 'player',
    start: [-6.8, -62], goal: [6.8, -62], tolerance: 1.1, pathRadius: 24
  }),
  Object.freeze({
    id: 'enemy_rear_west_pursuit', label: 'Pursuer rear-west entrance to corridor midpoint', actor: 'enemy',
    enemyType: 'rusher_elite', start: [-5.2, 75.6], goal: [-1.4, 2], tolerance: 1.25, pathRadius: 90
  }),
  Object.freeze({
    id: 'enemy_rear_center_pursuit', label: 'Pursuer rear-center entrance to corridor midpoint', actor: 'enemy',
    enemyType: 'bailiff', start: [0, 75.6], goal: [1.4, 2], tolerance: 1.25, pathRadius: 90
  }),
  Object.freeze({
    id: 'enemy_rear_east_pursuit', label: 'Pursuer rear-east entrance to corridor midpoint', actor: 'enemy',
    enemyType: 'shooter', start: [5.2, 75.6], goal: [0, 8], tolerance: 1.25, pathRadius: 90
  })
]);

export function level1AssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('infestation')) return phaseId === 'wave_5';
  if (tags.has('objective')) return phaseId !== 'wave_5';
  return true;
}

export function level1AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const z = Number(placement?.position?.[2]) || 0;
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({ mode: 'solid', colliderIds, sizeCheck, occupancyPolicy });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'relaybackdrop') return nonblocking('ambient_allowed');
  if (asset === 'floorhatch') return nonblocking('review');
  if (asset === 'apartment') return solid(assetColliderProfileIds('north-west-apartment', APARTMENT_COLLIDER_PROFILE), 'composite');
  if (asset === 'cornershop') return solid(assetColliderProfileIds('north-east-cornershop', CORNER_SHOP_COLLIDER_PROFILE), 'composite');
  if (asset === 'facade') return solid(assetColliderProfileIds(x < 0 ? 'north-west-facade' : 'north-east-facade', FACADE_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'reinforcementdoor' || asset === 'emergencysign') return solid(['north-civic-frame'], 'shared');
  if (asset === 'civicwall') {
    return solid([`${x < 0 ? 'west' : 'east'}-civic-wall-${z < 0 ? 'north' : 'south'}`]);
  }
  if (asset === 'fireescape') {
    return solid([
      'fireescape-backing',
      'fireescape-support-west',
      'fireescape-support-east',
      'fireescape-bridge-support-west',
      'fireescape-bridge-support-east',
      'fireescape-landing',
      'fireescape-ramp'
    ], 'composite', 'walkable_composite');
  }
  if (asset === 'relaymast') return solid([
    'relay-mast-move-center', 'relay-mast-move-north-mid', 'relay-mast-move-south-mid',
    'relay-mast-move-north-cap', 'relay-mast-move-south-cap',
    'relay-mast-shot-base', 'relay-mast-shot-pedestal-lower', 'relay-mast-shot-pedestal-upper', 'relay-mast-shot-pole',
    'relay-mast-shot-leg-east', 'relay-mast-shot-leg-north-west', 'relay-mast-shot-leg-south-west'
  ], 'composite');
  if (asset === 'capturebeacon') return solid([
    'relay-mast-move-center', 'relay-mast-move-north-mid', 'relay-mast-move-south-mid',
    'relay-mast-move-north-cap', 'relay-mast-move-south-cap',
    'relay-mast-shot-base', 'relay-mast-shot-pedestal-lower', 'relay-mast-shot-pedestal-upper'
  ], 'shared');
  if (asset === 'broodinfestation') return nonblocking('ambient_allowed');
  if (asset === 'terminal') return solid(assetColliderProfileIds('west-terminal', TERMINAL_COLLIDER_PROFILE), 'composite');
  if (asset === 'powerrelay') return solid(assetColliderProfileIds('east-relay', POWER_RELAY_COLLIDER_PROFILE), 'composite');
  if (asset === 'lightmast') {
    const prefix = `lightmast-${z < 0 ? 'north' : 'south'}-${x < 0 ? 'west' : 'east'}`;
    return solid([`${prefix}-base`, `${prefix}-pole`, `${prefix}-lamp-bar`], 'composite');
  }
  if (asset === 'checkpoint') return solid(assetColliderProfileIds('west-checkpoint', CHECKPOINT_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'cornercover') return solid(assetColliderProfileIds('east-corner-cover', CORNER_COVER_COLLIDER_PROFILE), 'composite');
  if (asset === 'gabion') return solid(assetColliderProfileIds(x < 0 ? 'west-cover-mid' : 'east-cover-mid', GABION_COLLIDER_PROFILE), 'composite');
  if (asset === 'roadblock') return solid(assetColliderProfileIds(z < 0 ? 'west-cover-north' : 'south-cover-east', ROADBLOCK_COLLIDER_PROFILE), 'composite');
  if (asset === 'barriers') return solid(assetColliderProfileIds(z < 0 ? 'east-cover-north' : 'south-cover-west', BARRIERS_COLLIDER_PROFILE), 'composite');
  if (asset === 'breachvent') return solid(assetColliderProfileIds('rear-breach-vent', BREACH_VENT_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'streettree') {
    const prefix = `streettree-${z < 0 ? 'north' : 'south'}-${x < 0 ? 'west' : 'east'}`;
    return solid([`${prefix}-planter`, `${prefix}-trunk`], 'composite');
  }
  return null;
}

export function level2AssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('suppressionDressing')) return ['wave_8', 'wave_9', 'wave_10'].includes(phaseId);
  if (tags.has('bossDressing')) return phaseId === 'wave_10';
  return true;
}

export function level2AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const z = Number(placement?.position?.[2]) || 0;
  const side = x < 0 ? 'west' : 'east';
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({ mode: 'solid', colliderIds, sizeCheck, occupancyPolicy });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'spirebackdrop' || asset === 'censorshipnodes' || asset === 'suppressiontiles') return nonblocking('ambient_allowed');
  if (asset === 'emergencysign') return solid(['emergency-sign-west-post', 'emergency-sign-east-post'], 'composite', 'portal_composite');
  if (asset === 'spirefacade') return solid(['spire-shell'], 'shared');
  if (asset === 'reinforcementdoor') return solid([`${side}-reinforcement-door`]);
  if (asset === 'clinic') return solid(assetColliderProfileIds(`${side}-clinic`, CLINIC_COLLIDER_PROFILE), 'composite');
  if (asset === 'clinicwall') return solid([`${side}-wall-movement`, `${side}-wall-sill`, `${side}-wall-cap`], 'composite');
  if (asset === 'corridor') return solid([`${side}-corridor-movement`, `${side}-corridor-north-wall`, `${side}-corridor-south-wall`], 'composite');
  if (asset === 'decon') return solid([`${side}-decon-left-post`, `${side}-decon-right-post`], 'composite', 'portal_composite');
  if (asset === 'shutter') return solid([`${side}-shutter`]);
  if (asset === 'terminal') return solid(assetColliderProfileIds('west-terminal', TERMINAL_COLLIDER_PROFILE), 'composite');
  if (asset === 'powerrelay') return solid(assetColliderProfileIds('east-relay', POWER_RELAY_COLLIDER_PROFILE), 'composite');
  if (asset === 'ammostation') return solid(['ammo-station']);
  if (asset === 'stairs') {
    const end = z > 0 ? 'south' : 'north';
    return solid([
      `west-flank-stair-${end}-rail-west`,
      `west-flank-stair-${end}-rail-east`,
      `west-flank-stair-${end}-ramp`
    ], 'composite', 'walkable_composite');
  }
  if (asset === 'catwalk') return solid([
    'west-flank-catwalk-rail-west', 'west-flank-catwalk-rail-east',
    'west-flank-catwalk-post-nw', 'west-flank-catwalk-post-ne',
    'west-flank-catwalk-post-mw', 'west-flank-catwalk-post-me',
    'west-flank-catwalk-post-sw', 'west-flank-catwalk-post-se',
    'west-flank-catwalk-deck'
  ], 'composite', 'walkable_composite');
  if (asset === 'peekcover') return solid([`${side}-beam-cover`]);
  if (asset === 'cornercover') return solid(assetColliderProfileIds(`${side}-corner-cover`, CORNER_COVER_COLLIDER_PROFILE), 'composite');
  return null;
}

export function level3AssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('bossDressing')) return phaseId === 'wave_15';
  if (tags.has('objective')) return phaseId !== 'wave_15';
  return true;
}

export function level3AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const side = x < 0 ? 'west' : 'east';
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({ mode: 'solid', colliderIds, sizeCheck, occupancyPolicy });
  const phaseSolid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({
    ...solid(colliderIds, sizeCheck, occupancyPolicy),
    phaseBound: true
  });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'adzonebackdrop' || asset === 'adplazakit' || asset === 'adtrappylon') return nonblocking('ambient_allowed');
  if (asset === 'catwalk') return solid([
    'east-catwalk-post-north-west',
    'east-catwalk-post-north-east',
    'east-catwalk-post-mid-west',
    'east-catwalk-post-mid-east',
    'east-catwalk-post-south-west',
    'east-catwalk-post-south-east',
    'east-catwalk-deck'
  ], 'composite', 'support_composite');
  if (asset === 'cornershop') return solid(assetColliderProfileIds('west-market-shell', CORNER_SHOP_COLLIDER_PROFILE), 'composite');
  if (asset === 'screenwall') return solid(['east-screen-shell'], 'shared');
  if (asset === 'guardbooth') return solid(assetColliderProfileIds('west-guardbooth', GUARD_BOOTH_COLLIDER_PROFILE), 'composite');
  if (asset === 'tower') return solid(assetColliderProfileIds('east-tower', TOWER_COLLIDER_PROFILE), 'composite', 'support_composite');
  if (asset === 'kiosk') return solid(assetColliderProfileIds(`${side}-kiosk`, KIOSK_COLLIDER_PROFILE), 'composite');
  if (asset === 'billboardwall') return solid(assetColliderProfileIds(`${side}-billboard`, BILLBOARD_WALL_COLLIDER_PROFILE), 'composite');
  if (asset === 'sponsorprojector') return phaseSolid(assetColliderProfileIds('sponsor-projector', SPONSOR_PROJECTOR_COLLIDER_PROFILE), 'composite');
  if (asset === 'barriers') return solid(assetColliderProfileIds('south-west-barrier', BARRIERS_COLLIDER_PROFILE), 'composite');
  if (asset === 'roadblock') return solid(assetColliderProfileIds('south-east-roadblock', ROADBLOCK_COLLIDER_PROFILE), 'composite');
  if (asset === 'coverheights') return solid(assetColliderProfileIds('west-cover', COVER_HEIGHTS_COLLIDER_PROFILE), 'composite');
  if (asset === 'breakablecover') return solid(assetColliderProfileIds('east-cover', BREAKABLE_COVER_COLLIDER_PROFILE), 'composite');
  if (asset === 'lightmast') return solid([
    `${side}-lightmast-base`, `${side}-lightmast-pole`, `${side}-lightmast-lamp-bar`
  ], 'composite');
  if (asset === 'capturebeacon') return phaseSolid(assetColliderProfileIds('capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE), 'composite', 'step_base_composite');
  if (asset === 'terminal') return phaseSolid(assetColliderProfileIds('adzone-terminal', TERMINAL_COLLIDER_PROFILE), 'composite');
  return null;
}

export function level4AssetPhaseExpectedVisible() {
  return true;
}

export function level4AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({ mode: 'solid', colliderIds, sizeCheck, occupancyPolicy });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'wastesbackdrop') return nonblocking('ambient_allowed');
  if (asset === 'checkpoint') return solid(assetColliderProfileIds('west-checkpoint', CHECKPOINT_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'roadblock') return solid(assetColliderProfileIds('east-roadblock', ROADBLOCK_COLLIDER_PROFILE), 'composite');
  if (asset === 'hesco') return solid(assetColliderProfileIds('west-north-island', HESCO_COLLIDER_PROFILE), 'composite');
  if (asset === 'screenwall') return solid(assetColliderProfileIds('east-north-island', SCREEN_WALL_COLLIDER_PROFILE), 'composite');
  if (asset === 'pipes') return solid(assetColliderProfileIds('west-south-island', PIPES_COLLIDER_PROFILE), 'composite');
  if (asset === 'gabion') return solid(assetColliderProfileIds('east-south-island', GABION_COLLIDER_PROFILE), 'composite');
  if (asset === 'reel') return solid(assetColliderProfileIds('west-reel', REEL_COLLIDER_PROFILE), 'composite');
  if (asset === 'filterruin') return solid(assetColliderProfileIds('east-filter-ruin', FILTER_RUIN_COLLIDER_PROFILE), 'composite');
  if (asset === 'retainingwall') return solid(assetColliderProfileIds('north-retaining-wall', RETAINING_WALL_COLLIDER_PROFILE), 'composite');
  if (asset === 'windbreaks') {
    const route = Number(placement?.position?.[2]) < 0 ? 'north' : 'south';
    const side = x < 0 ? 'west' : 'east';
    return solid(assetColliderProfileIds(`${route}-${side}-windbreak`, WINDBREAKS_COLLIDER_PROFILE), 'composite');
  }
  if (asset === 'wastesterrainkit') {
    return solid(['south-dune-surface', 'south-road-transition', 'south-dry-wash'], 'composite', 'walkable_composite');
  }
  if (asset === 'stormbeacon') return solid(assetColliderProfileIds('storm-beacon', STORM_BEACON_COLLIDER_PROFILE), 'composite');
  if (asset === 'lightmast') return solid([
    'west-lightmast-base', 'west-lightmast-pole', 'west-lightmast-lamp-bar'
  ], 'composite');
  if (asset === 'capturebeacon') return solid(assetColliderProfileIds('east-capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE), 'composite');
  if (asset === 'benttree') return solid(assetColliderProfileIds('south-west-bent-tree', BENT_TREE_COLLIDER_PROFILE), 'composite');
  if (asset === 'deadtree') return solid(assetColliderProfileIds('south-east-dead-tree', DEAD_TREE_COLLIDER_PROFILE), 'composite');
  // Drainage is a shallow grated ground divider designed to be walked over.
  if (asset === 'drainage') return nonblocking('ambient_allowed');
  // Future dressing additions remain visible in the report as uncontracted.
  return null;
}

export function level5AssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('bossDressing')) return phaseId === 'wave_25';
  if (tags.has('infectionDressing')) return ['wave_23', 'wave_24', 'wave_25'].includes(phaseId);
  return true;
}

export function level5AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const z = Number(placement?.position?.[2]) || 0;
  const side = x < 0 ? 'west' : 'east';
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid', missingBoundary = false) => ({
    mode: 'solid', colliderIds, sizeCheck, occupancyPolicy, missingBoundary
  });
  const phaseSolid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({
    ...solid(colliderIds, sizeCheck, occupancyPolicy), phaseBound: true
  });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'freightbackdrop') return nonblocking('ambient_allowed');
  if (asset === 'warehouse') return solid(assetColliderProfileIds(`north-${side}-warehouse`, WAREHOUSE_COLLIDER_PROFILE), 'composite');
  if (asset === 'cargogate') return solid(['north-gate-west-container', 'north-gate-east-container'], 'composite', 'portal_composite');
  if (asset === 'freightlanekit') return solid([
    'freight-lane-straight', 'freight-lane-corner-horizontal',
    'freight-lane-corner-vertical', 'freight-lane-endcap', 'freight-lane-endcap-gate'
  ], 'composite');
  if (asset === 'servicewall') return solid(assetColliderProfileIds(`${side}-service-wall`, SERVICE_WALL_COLLIDER_PROFILE), 'composite');
  if (asset === 'concretewall') return solid(assetColliderProfileIds(`${side}-concrete-wall`, CONCRETE_WALL_COLLIDER_PROFILE), 'composite');
  if (asset === 'stairs') return solid([
    `${side}-stair-rail-west`, `${side}-stair-rail-east`, `${side}-stair-ramp`
  ], 'composite', 'walkable_composite');
  if (asset === 'ladderplatform') return solid([
    `${side}-ladder-post-a`, `${side}-ladder-post-b`, `${side}-ladder-post-c`, `${side}-ladder-post-d`,
    `${side}-ladder-rail-a`, `${side}-ladder-rail-b`, `${side}-ladder-deck`
  ], 'composite', 'support_composite');
  if (asset === 'loadingramp' || asset === 'catwalk' || asset === 'cargolift') {
    return solid([`${side}-elevation-loop`], 'shared', asset === 'loadingramp' ? 'walkable_composite' : 'support_composite');
  }
  if (asset === 'reel') return solid(assetColliderProfileIds('west-north-cover', REEL_COLLIDER_PROFILE), 'composite');
  if (asset === 'trolley') return solid(assetColliderProfileIds('east-north-cover', TROLLEY_COLLIDER_PROFILE), 'composite');
  if (asset === 'generator') return solid(assetColliderProfileIds('west-south-cover', GENERATOR_COLLIDER_PROFILE), 'composite');
  if (asset === 'pipes') return solid(assetColliderProfileIds('east-south-cover', PIPES_COLLIDER_PROFILE), 'composite');
  if (asset === 'gabion') return solid(assetColliderProfileIds('south-west-cover', GABION_COLLIDER_PROFILE), 'composite');
  if (asset === 'hesco') return solid(assetColliderProfileIds('south-east-cover', HESCO_COLLIDER_PROFILE), 'composite');
  if (asset === 'breakablecover') return solid(assetColliderProfileIds('east-breakable-cover', BREAKABLE_COVER_COLLIDER_PROFILE), 'composite');
  if (asset === 'floorhatch') return nonblocking('ambient_allowed');
  if (asset === 'infectedprops') return nonblocking('ambient_allowed');
  if (asset === 'burrowbreach') return nonblocking('ambient_allowed');
  if (asset === 'industrialnest') return phaseSolid(['boss-industrial-nest']);
  if (asset === 'shutter') return solid([`${side}-shutter`]);
  if (asset === 'breachvent') return solid([
    'east-breach-vent-north-post', 'east-breach-vent-south-post',
    'east-breach-vent-sill', 'east-breach-vent-header'
  ], 'composite', 'portal_composite');
  // Keep future freight dressing visible as an uncontracted diagnostic result.
  return null;
}

export function level6AssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('mirrorBarrier')) return ['wave_26', 'wave_27', 'wave_28', 'wave_29'].includes(phaseId);
  if (tags.has('generationDressing')) return ['wave_27', 'wave_28', 'wave_29', 'wave_30'].includes(phaseId);
  if (tags.has('bossDressing')) return phaseId === 'wave_30';
  return true;
}

export function level6AssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const z = Number(placement?.position?.[2]) || 0;
  const side = x < 0 ? 'west' : 'east';
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid', missingBoundary = false) => ({
    mode: 'solid', colliderIds, sizeCheck, occupancyPolicy, missingBoundary
  });
  const phaseSolid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({
    ...solid(colliderIds, sizeCheck, occupancyPolicy), phaseBound: true
  });
  const nonblocking = (occupancyPolicy = 'review') => ({ mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy });

  if (asset === 'mirrorbackdrop' || asset === 'mirrorgardenpaths'
    || asset === 'generationmarkers' || asset === 'splitring') return nonblocking('ambient_allowed');
  if (asset === 'civicwall') return solid([`${side}-civic-${z < 0 ? 'north' : 'south'}`]);
  if (asset === 'facade') return solid(assetColliderProfileIds(`north-${side}-facade`, FACADE_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'mirrorpanels') {
    const threshold = Math.abs(x) > Math.abs(z)
      ? `${side}-mirror-threshold`
      : `${z < 0 ? 'north' : 'south'}-mirror-threshold`;
    return phaseSolid([threshold], 'direct', 'portal_composite');
  }
  if (asset === 'coverheights') return solid(assetColliderProfileIds(`${z < 0 ? 'north-west' : 'south-east'}-formal-cover`, COVER_HEIGHTS_COLLIDER_PROFILE), 'composite');
  if (asset === 'peekcover') return solid(assetColliderProfileIds('north-east-formal-cover', PEEK_COVER_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'cornercover') return solid(assetColliderProfileIds('south-west-formal-cover', CORNER_COVER_COLLIDER_PROFILE), 'composite');
  if (asset === 'terminal') return solid(assetColliderProfileIds('south-west-control', TERMINAL_COLLIDER_PROFILE), 'composite');
  if (asset === 'powerrelay') return solid(assetColliderProfileIds('south-east-control', POWER_RELAY_COLLIDER_PROFILE), 'composite');
  if (asset === 'capturebeacon') return solid(assetColliderProfileIds(`${side === 'west' ? 'north-west' : 'north-east'}-beacon`, CAPTURE_BEACON_COLLIDER_PROFILE), 'composite');
  if (asset === 'lightmast') {
    const prefix = `${z < 0 ? 'north' : 'south'}-${side}-lightmast`;
    return solid([`${prefix}-base`, `${prefix}-pole`, `${prefix}-lamp-bar`], 'composite');
  }
  if (asset === 'emergencysign') {
    const prefix = `south-${side}-sign`;
    return solid([`${prefix}-west-post`, `${prefix}-east-post`], 'composite', 'portal_composite');
  }
  if (asset === 'glitchtopiary') return solid(assetColliderProfileIds(`${z < 0 ? 'north' : 'south'}-${side}-topiary`, GLITCH_TOPIARY_COLLIDER_PROFILE), 'composite');
  if (asset === 'streettree') {
    const location = z < -20 ? 'north-west' : (z > 20 ? 'south-west' : 'west-garden');
    return solid([`${location}-streettree-planter`, `${location}-streettree-trunk`], 'composite');
  }
  if (asset === 'broadleaf') {
    const location = z < -20 ? 'north-east' : (z > 20 ? 'south-east' : 'east-garden');
    return solid(assetColliderProfileIds(`${location}-broadleaf`, BROADLEAF_COLLIDER_PROFILE), 'composite');
  }
  return null;
}

export function lastOrderAssetPhaseExpectedVisible() {
  return true;
}

export function lastOrderAssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const z = Number(placement?.position?.[2]) || 0;
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({
    mode: 'solid', colliderIds, sizeCheck, occupancyPolicy
  });
  const nonblocking = (occupancyPolicy = 'review') => ({
    mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy
  });

  if (asset === 'archives') return solid(assetColliderProfileIds('last-order-archives', ARCHIVES_COLLIDER_PROFILE), 'composite');
  if (asset === 'pipes') return solid(assetColliderProfileIds('last-order-pipes', PIPES_COLLIDER_PROFILE), 'composite');
  if (asset === 'generator') return solid(assetColliderProfileIds('last-order-generator', GENERATOR_COLLIDER_PROFILE), 'composite');
  if (asset === 'powerrelay') return solid(assetColliderProfileIds('last-order-power-relay', POWER_RELAY_COLLIDER_PROFILE), 'composite');
  if (asset === 'terminal') return solid(assetColliderProfileIds('last-order-terminal', TERMINAL_COLLIDER_PROFILE), 'composite');
  if (asset === 'breachvent') return solid(assetColliderProfileIds('last-order-breach-vent', BREACH_VENT_COLLIDER_PROFILE), 'composite', 'portal_composite');
  if (asset === 'emergencysign') {
    const location = z > 20 ? 'entrance' : (z > -20 ? 'middle' : 'terminal');
    return solid(assetColliderProfileIds(`last-order-sign-${location}`, EMERGENCY_SIGN_COLLIDER_PROFILE), 'composite', 'portal_composite');
  }
  if (asset === 'floorhatch') return nonblocking('ambient_allowed');
  return null;
}

export function contentCourtAssetPhaseExpectedVisible() {
  return true;
}

export function contentCourtAssetCollisionExpectation(placement) {
  const asset = placement?.asset;
  const x = Number(placement?.position?.[0]) || 0;
  const z = Number(placement?.position?.[2]) || 0;
  const solid = (colliderIds, sizeCheck = 'direct', occupancyPolicy = 'solid') => ({
    mode: 'solid', colliderIds, sizeCheck, occupancyPolicy
  });
  const nonblocking = (occupancyPolicy = 'ambient_allowed') => ({
    mode: 'nonblocking', colliderIds: [], sizeCheck: 'none', occupancyPolicy
  });

  // These modules sit outside the playable shell. Their visible arena-facing
  // edge is represented by the shared boundary rather than duplicate boxes.
  if (asset === 'fortwall' || asset === 'civicwall' || asset === 'corridor') {
    return solid(['north-boundary'], 'shared', 'support_composite');
  }
  if (asset === 'archives' || asset === 'reinforcementdoor' || asset === 'stairs') {
    return solid([x < 0 ? 'west-boundary' : 'east-boundary'], 'shared', 'support_composite');
  }
  if (asset === 'emergencysign') return solid(['south-boundary'], 'shared', 'support_composite');
  if (asset === 'purgenode') {
    return solid([z < 0 ? 'north-purge-bank' : (x < 0 ? 'south-west-purge-bank' : 'south-east-purge-bank')]);
  }
  if (asset === 'courtbench') {
    return solid([`${z < 0 ? 'north' : 'south'}-${x < 0 ? 'west' : 'east'}-bench`]);
  }
  if (asset === 'cornercover') return solid(['west-appeal-cover']);
  if (asset === 'peekcover') return solid(['east-appeal-cover']);
  if (asset === 'terminal') return solid(assetColliderProfileIds('north-west-control', TERMINAL_COLLIDER_PROFILE), 'composite');
  if (asset === 'powerrelay') return solid(assetColliderProfileIds('north-east-control', POWER_RELAY_COLLIDER_PROFILE), 'composite');
  if (asset === 'capturebeacon') {
    return solid(assetColliderProfileIds(`south-${x < 0 ? 'west' : 'east'}-beacon`, CAPTURE_BEACON_COLLIDER_PROFILE), 'composite');
  }
  if (asset === 'breakablecover') return solid([`south-${x < 0 ? 'west' : 'east'}-breakable`]);
  if (asset === 'courtbackdrop' || asset === 'courtsectoraisles' || asset === 'tribunaldais') return nonblocking();
  return null;
}

function colliderReferencePoint(collider) {
  if (Array.isArray(collider?.position)) return collider.position;
  if (Array.isArray(collider?.from) && Array.isArray(collider?.to)) {
    return collider.from.map((value, index) => (value + collider.to[index]) / 2);
  }
  return [0, 0, 0];
}

// Late-campaign levels author every meaningful solid through assetId-backed
// collider profiles. Assign each primitive to the nearest placement of that
// asset so repeated props receive exact, deterministic diagnostic contracts.
function profileBackedAssetCollisionExpectation(
  placement,
  placementIndex,
  definition,
  { nonblockingAssets = {}, phaseSensitiveTags = [] } = {}
) {
  const asset = placement?.asset;
  if (!asset || !definition) return null;
  const sameAssetPlacements = definition.assets.filter(candidate => candidate.asset === asset);
  const targetIndex = Number.isInteger(placementIndex)
    ? placementIndex
    : sameAssetPlacements.indexOf(placement);
  const colliderIds = definition.colliders
    .filter(collider => collider.assetId === asset)
    .filter(collider => {
      const point = colliderReferencePoint(collider);
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      sameAssetPlacements.forEach((candidate, index) => {
        const dx = point[0] - candidate.position[0];
        const dz = point[2] - candidate.position[2];
        const distance = dx * dx + dz * dz;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      return nearestIndex === targetIndex;
    })
    .map(collider => collider.id);

  if (colliderIds.length) {
    const tags = new Set(placement.tags || []);
    return {
      mode: 'solid',
      colliderIds,
      sizeCheck: 'composite',
      occupancyPolicy: 'solid',
      phaseBound: phaseSensitiveTags.some(tag => tags.has(tag))
    };
  }
  if (Object.hasOwn(nonblockingAssets, asset)) {
    return {
      mode: 'nonblocking', colliderIds: [], sizeCheck: 'none',
      occupancyPolicy: nonblockingAssets[asset]
    };
  }
  return null;
}

const phaseWave = phaseId => Number(String(phaseId || '').replace(/^wave_/, '')) || 0;

export function serverCathedralAssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  if (tags.has('cathedralLeftLock')) return phaseId === 'wave_37';
  if (tags.has('cathedralRightLock') || tags.has('choirDressing')) return phaseId === 'wave_38';
  if (tags.has('rootDressing')) return phaseId === 'liberated' || phaseWave(phaseId) >= 39;
  if (tags.has('logicDressing')) return phaseId === 'wave_39';
  if (tags.has('endChoice')) return phaseId === 'liberated';
  if (tags.has('observerHandClearance')) return phaseId !== 'wave_40' && phaseId !== 'liberated';
  return true;
}

export function serverCathedralAssetCollisionExpectation(placement, placementIndex, definition) {
  return profileBackedAssetCollisionExpectation(placement, placementIndex, definition, {
    nonblockingAssets: { cathedralbackdrop: 'ambient_allowed', cathedralroutes: 'ambient_allowed' },
    phaseSensitiveTags: ['cathedralLeftLock', 'cathedralRightLock', 'choirDressing', 'rootDressing', 'logicDressing', 'endChoice', 'observerHandClearance']
  });
}

export function sandstormAssetPhaseExpectedVisible(placement, phaseId) {
  if ((placement?.tags || []).includes('enduranceComplete')) return phaseId === 'liberated';
  return true;
}

export function sandstormAssetCollisionExpectation(placement, placementIndex, definition) {
  return profileBackedAssetCollisionExpectation(placement, placementIndex, definition, {
    nonblockingAssets: {
      sandstormbackdrop: 'ambient_allowed'
    },
    phaseSensitiveTags: ['enduranceComplete']
  });
}

export function floodgateAssetPhaseExpectedVisible(placement, phaseId) {
  const tags = new Set(placement?.tags || []);
  const wave = phaseWave(phaseId);
  const liberated = phaseId === 'liberated';
  if (tags.has('archiveSeeds') || tags.has('archiveSeedActive')) return !liberated && wave >= 66;
  if (tags.has('greywaterCore') || tags.has('greywaterCoreActive')) return liberated || wave >= 66;
  const water = liberated ? 'dry' : ({
    52: 'dry', 59: 'low', 66: 'low', 72: 'high'
  }[wave] || 'dry');
  if (tags.has('floodMediumLock')) return water === 'medium' || water === 'high';
  if (tags.has('floodHighLock')) return water === 'high';
  const authoredWave = wave - 1;
  const chapter = authoredWave <= 57 ? 1 : authoredWave <= 64 ? 2 : 3;
  const gateVariant = liberated ? 'damaged' : chapter === 1 ? 'closed' : chapter === 2 ? 'opening' : authoredWave === 71 ? 'damaged' : 'locked';
  if (tags.has('floodgateClosedCollider')) return gateVariant === 'closed';
  if (tags.has('floodgateOpeningCollider')) return gateVariant === 'opening';
  if (tags.has('floodgateLockedCollider')) return gateVariant === 'locked';
  if (tags.has('floodgateDamagedCollider')) return gateVariant === 'damaged';
  return true;
}

export function floodgateAssetCollisionExpectation(placement, placementIndex, definition) {
  return profileBackedAssetCollisionExpectation(placement, placementIndex, definition, {
    nonblockingAssets: {
      floodgatebackdrop: 'ambient_allowed', waterlinedebris: 'ambient_allowed',
      floorhatch: 'ambient_allowed'
    },
    phaseSensitiveTags: ['archiveSeeds', 'greywaterCore']
  });
}

export function blackoutCisternAssetPhaseExpectedVisible() {
  return true;
}

export function blackoutCisternAssetCollisionExpectation(placement, placementIndex, definition) {
  return profileBackedAssetCollisionExpectation(placement, placementIndex, definition, {
    nonblockingAssets: {
      cisternfloorkit: 'ambient_allowed', cisternbackdrop: 'ambient_allowed',
      floorhatch: 'ambient_allowed', drainage: 'ambient_allowed'
    }
  });
}

export const LEVEL_COLLISION_PROFILES = Object.freeze({
  'relay-district': Object.freeze({
    id: 'relay-district', label: 'Level 1 — Relay District', shortLabel: 'Level 1',
    phases: LEVEL_COLLISION_PHASES, journeys: LEVEL_1_JOURNEYS,
    assetCollisionExpectation: level1AssetCollisionExpectation,
    assetPhaseExpectedVisible: level1AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['objective', 'infestation']),
    excludedApproachAssets: Object.freeze(['relaybackdrop'])
  }),
  'sanitizer-spire': Object.freeze({
    id: 'sanitizer-spire', label: 'Level 2 — Sanitizer Spire', shortLabel: 'Level 2',
    phases: LEVEL_2_COLLISION_PHASES, journeys: LEVEL_2_JOURNEYS,
    assetCollisionExpectation: level2AssetCollisionExpectation,
    assetPhaseExpectedVisible: level2AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['bossDressing', 'suppressionDressing']),
    excludedApproachAssets: Object.freeze(['spirebackdrop'])
  }),
  'ad-zone-arena': Object.freeze({
    id: 'ad-zone-arena', label: 'Level 3 — Ad-Zone Arena', shortLabel: 'Level 3',
    phases: LEVEL_3_COLLISION_PHASES, journeys: LEVEL_3_JOURNEYS,
    assetCollisionExpectation: level3AssetCollisionExpectation,
    assetPhaseExpectedVisible: level3AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['objective', 'bossDressing', 'movingCover']),
    excludedApproachAssets: Object.freeze(['adzonebackdrop'])
  }),
  'trend-wastes': Object.freeze({
    id: 'trend-wastes', label: 'Level 4 — Trend Wastes', shortLabel: 'Level 4',
    phases: LEVEL_4_COLLISION_PHASES, journeys: LEVEL_4_JOURNEYS,
    assetCollisionExpectation: level4AssetCollisionExpectation,
    assetPhaseExpectedVisible: level4AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['liberation']),
    excludedApproachAssets: Object.freeze(['wastesbackdrop'])
  }),
  'freight-annex': Object.freeze({
    id: 'freight-annex', label: 'Level 5 — Freight Annex', shortLabel: 'Level 5',
    phases: LEVEL_5_COLLISION_PHASES, journeys: LEVEL_5_JOURNEYS,
    assetCollisionExpectation: level5AssetCollisionExpectation,
    assetPhaseExpectedVisible: level5AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['infectionDressing', 'bossDressing']),
    excludedApproachAssets: Object.freeze(['freightbackdrop'])
  }),
  'mirror-garden': Object.freeze({
    id: 'mirror-garden', label: 'Level 6 — Mirror Garden', shortLabel: 'Level 6',
    phases: LEVEL_6_COLLISION_PHASES, journeys: LEVEL_6_JOURNEYS,
    assetCollisionExpectation: level6AssetCollisionExpectation,
    assetPhaseExpectedVisible: level6AssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['mirrorBarrier', 'generationDressing', 'bossDressing']),
    excludedApproachAssets: Object.freeze(['mirrorbackdrop', 'mirrorgardenpaths', 'generationmarkers', 'splitring'])
  }),
  'content-court': Object.freeze({
    id: 'content-court', label: 'Level 7 - Content Court', shortLabel: 'Level 7',
    phases: CONTENT_COURT_COLLISION_PHASES, journeys: CONTENT_COURT_JOURNEYS,
    assetCollisionExpectation: contentCourtAssetCollisionExpectation,
    assetPhaseExpectedVisible: contentCourtAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze([]),
    excludedApproachAssets: Object.freeze(['courtbackdrop', 'courtsectoraisles', 'tribunaldais'])
  }),
  'last-order-base': Object.freeze({
    id: 'last-order-base', label: 'Special - Last Order Base', shortLabel: 'Wave 41',
    phases: LAST_ORDER_COLLISION_PHASES, journeys: LAST_ORDER_JOURNEYS,
    assetCollisionExpectation: lastOrderAssetCollisionExpectation,
    assetPhaseExpectedVisible: lastOrderAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze([]),
    excludedApproachAssets: Object.freeze([])
  }),
  'server-cathedral': Object.freeze({
    id: 'server-cathedral', label: 'Server Cathedral - Waves 36-40', shortLabel: 'Waves 36-40',
    phases: SERVER_CATHEDRAL_COLLISION_PHASES, journeys: SERVER_CATHEDRAL_JOURNEYS,
    assetCollisionExpectation: serverCathedralAssetCollisionExpectation,
    assetPhaseExpectedVisible: serverCathedralAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['cathedralLeftLock', 'cathedralRightLock', 'choirDressing', 'rootDressing', 'logicDressing', 'endChoice', 'observerHandClearance']),
    excludedApproachAssets: Object.freeze(['cathedralbackdrop', 'cathedralroutes'])
  }),
  'sandstorm-expanse': Object.freeze({
    id: 'sandstorm-expanse', label: 'Sandstorm Expanse - Waves 42-51', shortLabel: 'Waves 42-51',
    phases: SANDSTORM_COLLISION_PHASES, journeys: SANDSTORM_JOURNEYS,
    assetCollisionExpectation: sandstormAssetCollisionExpectation,
    assetPhaseExpectedVisible: sandstormAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['enduranceComplete']),
    excludedApproachAssets: Object.freeze(['sandstormbackdrop'])
  }),
  'floodgate-continuity': Object.freeze({
    id: 'floodgate-continuity', label: 'Floodgate Continuity - Waves 52-72', shortLabel: 'Waves 52-72',
    phases: FLOODGATE_COLLISION_PHASES, journeys: FLOODGATE_JOURNEYS,
    assetCollisionExpectation: floodgateAssetCollisionExpectation,
    assetPhaseExpectedVisible: floodgateAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze(['archiveSeeds', 'greywaterCore']),
    excludedApproachAssets: Object.freeze(['floodgatebackdrop', 'waterlinedebris'])
  }),
  'blackout-cistern': Object.freeze({
    id: 'blackout-cistern', label: 'Blackout Cistern - Wave 73', shortLabel: 'Wave 73',
    phases: BLACKOUT_CISTERN_COLLISION_PHASES, journeys: BLACKOUT_CISTERN_JOURNEYS,
    assetCollisionExpectation: blackoutCisternAssetCollisionExpectation,
    assetPhaseExpectedVisible: blackoutCisternAssetPhaseExpectedVisible,
    phaseSensitiveTags: Object.freeze([]),
    excludedApproachAssets: Object.freeze(['cisternfloorkit', 'cisternbackdrop', 'drainage'])
  })
});

export function getLevelCollisionProfile(levelId = 'relay-district') {
  const profile = LEVEL_COLLISION_PROFILES[levelId];
  if (!profile) throw new RangeError(`Unknown level collision profile: ${levelId}`);
  return profile;
}

// True only when the actual XZ route corridor intersects the target footprint.
// This prevents a legal adaptive side start from being mislabeled as a solid crossing.
export function segmentIntersectsExpandedBounds2D(start, end, bounds, padding = 0) {
  if (!start || !end || !bounds?.min || !bounds?.max) return false;
  let tMin = 0;
  let tMax = 1;
  for (const axis of ['x', 'z']) {
    const origin = Number(start[axis]);
    const delta = Number(end[axis]) - origin;
    const min = Number(bounds.min[axis]) - padding;
    const max = Number(bounds.max[axis]) + padding;
    if (![origin, delta, min, max].every(Number.isFinite)) return false;
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const inverse = 1 / delta;
    let near = (min - origin) * inverse;
    let far = (max - origin) * inverse;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }
  return true;
}

export function evaluateSolidCollisionProbe(probe) {
  const findings = [];
  const channels = probe.channels || {};
  const requireBlocked = (channelId, code, label) => {
    const channel = channels[channelId];
    if (channel?.notApplicable) return;
    if (!channel?.exercised) {
      findings.push(finding(`${channelId}_not_exercised`, 'inconclusive', `${label} was not exercised.`, { objectId: probe.objectId }));
    } else if (!channel.blocked) {
      findings.push(finding(code, 'fail', `${label} passed through the authored solid.`, {
        objectId: probe.objectId,
        progress: channel.progress,
        expectedProgress: channel.expectedProgress
      }));
    }
  };

  requireBlocked('playerWalk', 'player_walked_through_solid', 'The player walking body');
  requireBlocked('enemyWalk', 'enemy_walked_through_solid', 'The enemy walking body');
  requireBlocked('playerShot', 'player_shot_through_solid', 'The player hitscan shot');
  requireBlocked('enemyShot', 'enemy_shot_through_solid', 'The enemy projectile');

  const jump = channels.playerJumpWalk;
  if (jump?.notApplicable) {
    // Ballistic-only proxies deliberately have no movement or jump contract.
  } else if (!jump?.exercised) {
    findings.push(finding('player_jump_walk_not_exercised', 'inconclusive', 'Player jump-and-walk traversal was not exercised.', { objectId: probe.objectId }));
  } else if (jump.expectedPass && !jump.passed) {
    findings.push(finding('low_obstacle_not_jumpable', 'warn', 'A low, narrow obstacle could not be crossed by the production player jump.', {
      objectId: probe.objectId,
      height: probe.geometry?.height,
      crossingDepth: probe.geometry?.crossingDepth,
      progress: jump.progress
    }));
  } else if (!jump.expectedPass && jump.passed) {
    findings.push(finding('tall_obstacle_jump_leak', 'fail', 'The player jumped and walked through a collider that should remain solid.', {
      objectId: probe.objectId,
      height: probe.geometry?.height,
      crossingDepth: probe.geometry?.crossingDepth,
      progress: jump.progress
    }));
  }

  const severities = findings.map(item => item.severity);
  const status = severities.includes('fail')
    ? 'fail'
    : (severities.includes('warn') ? 'warn' : (severities.includes('inconclusive') ? 'inconclusive' : 'pass'));
  return {
    ...probe,
    status,
    findings,
    summary: findings[0]?.message || 'The authored boundary blocked every applicable production movement and shooting channel.'
  };
}

export function evaluateLevelJourneyProbe(probe) {
  const findings = [];
  const metrics = probe.metrics || {};
  const portalTransit = probe.contractKind?.startsWith?.('portal_');
  if (!metrics.pathFound) {
    findings.push(finding(portalTransit ? 'portal_transit_path_not_found' : 'journey_path_not_found', 'fail', portalTransit
      ? 'Production pathfinding could not route this body through a player-traversable portal.'
      : 'Production pathfinding could not create a route between authored gameplay points.', {
      journeyId: probe.journeyId,
      phaseId: probe.phaseId,
      start: probe.start,
      goal: probe.goal
    }));
  } else if (!metrics.reachedGoal) {
    findings.push(finding(portalTransit ? 'portal_transit_stuck' : 'journey_destination_unreachable', 'fail', portalTransit
      ? 'The production body became stuck before completing portal transit.'
      : 'The production body did not reach the authored destination.', {
      journeyId: probe.journeyId,
      phaseId: probe.phaseId,
      finalDistance: round(metrics.finalDistance),
      progressRatio: round(metrics.progressRatio),
      elapsedSeconds: round(metrics.elapsedSeconds)
    }));
  }
  if (portalTransit && metrics.reachedGoal && (!metrics.portalCrossed || !metrics.portalCrossingWithinOpening)) {
    findings.push(finding('portal_transit_bypassed_opening', 'fail', 'The route reached its destination without crossing the authored portal opening.', {
      journeyId: probe.journeyId,
      portalId: probe.portalId,
      portalCrossed: !!metrics.portalCrossed,
      portalCrossingCoordinate: metrics.portalCrossingCoordinate,
      portalPlane: probe.portalPlane
    }));
  }
  if ((metrics.maxConsecutiveStuckSeconds || 0) > 2) {
    findings.push(finding('journey_stuck', 'fail', 'The actor remained stuck for more than two simulated seconds while a route remained.', {
      journeyId: probe.journeyId,
      phaseId: probe.phaseId,
      maxConsecutiveStuckSeconds: round(metrics.maxConsecutiveStuckSeconds),
      blockedBy: metrics.blockedBy || {}
    }));
  }
  if ((metrics.maxConsecutiveVisualPenetrationTicks || 0) > 1) {
    findings.push(finding('journey_entered_visible_geometry', 'fail', 'The actor body entered visible level geometry during the journey.', {
      journeyId: probe.journeyId,
      phaseId: probe.phaseId,
      visualPenetrationTicks: metrics.visualPenetrationTicks,
      maxConsecutiveVisualPenetrationTicks: metrics.maxConsecutiveVisualPenetrationTicks,
      penetratedAssetCount: metrics.penetratedAssetCount || 0,
      penetratedAssets: metrics.penetratedAssets || [],
      penetrationEvidenceOmitted: metrics.penetrationEvidenceOmitted || 0
    }));
  }
  const status = findings.some(item => item.severity === 'fail') ? 'fail' : 'pass';
  return {
    ...probe,
    status,
    findings,
    summary: findings[0]?.message || (portalTransit
      ? 'The production body crossed the authored portal opening and reached the opposite side.'
      : 'The production actor followed a full-scene route to its destination without becoming stuck or entering visible geometry.')
  };
}

export function evaluateAssetApproachProbe(probe) {
  const findings = [];
  const approaches = probe.metrics?.approaches || [];
  const exercised = approaches.filter(item => item.exercised);
  const penetrations = exercised.filter(item => (item.maxConsecutivePenetrationTicks || 0) > 1);
  const crossed = exercised.filter(item => item.crossedVisualFootprint);
  const minimumApproaches = Math.max(1, probe.minimumApproaches || 3);
  if (exercised.length < minimumApproaches) {
    findings.push(finding('asset_approach_opportunity_insufficient', 'inconclusive', `Fewer than ${minimumApproaches} perimeter approaches could start from a valid playable position.`, {
      assetId: probe.assetId,
      phaseId: probe.phaseId,
      exercised: exercised.length,
      required: minimumApproaches,
      skipped: approaches.filter(item => !item.exercised).map(item => ({ direction: item.direction, reason: item.reason }))
    }));
  }
  if (probe.expectation?.mode === 'solid' && penetrations.length) {
    findings.push(finding('asset_approach_entered_visible_geometry', 'fail', 'A production actor entered the solid asset from one or more perimeter approaches.', {
      assetId: probe.assetId,
      phaseId: probe.phaseId,
      actor: probe.actor,
      approaches: penetrations.map(item => ({
        direction: item.direction,
        totalPenetrationTicks: item.totalPenetrationTicks,
        maxConsecutivePenetrationTicks: item.maxConsecutivePenetrationTicks,
        firstContact: item.firstContact
      }))
    }));
  }
  const footprintMustRemainSolid = ![
    'portal_composite',
    'walkable_composite',
    'step_base_composite',
    'support_composite'
  ].includes(probe.expectation?.occupancyPolicy);
  if (probe.expectation?.mode === 'solid' && footprintMustRemainSolid && crossed.length) {
    findings.push(finding('asset_approach_crossed_solid_footprint', 'fail', 'A production actor crossed the solid asset footprint without being stopped.', {
      assetId: probe.assetId,
      phaseId: probe.phaseId,
      actor: probe.actor,
      directions: crossed.map(item => item.direction)
    }));
  }
  if (probe.expectation?.mode === 'nonblocking' && probe.expectation?.occupancyPolicy !== 'ambient_allowed' && penetrations.length) {
    findings.push(finding('nonblocking_asset_has_occupiable_geometry', 'warn', 'The asset is contracted as non-blocking, but the production body can occupy its visible geometry.', {
      assetId: probe.assetId,
      phaseId: probe.phaseId,
      actor: probe.actor,
      directions: penetrations.map(item => item.direction)
    }));
  }
  const severities = findings.map(item => item.severity);
  const status = severities.includes('fail')
    ? 'fail'
    : (severities.includes('warn') ? 'warn' : (severities.includes('inconclusive') ? 'inconclusive' : 'pass'));
  return {
    ...probe,
    status,
    findings,
    summary: findings[0]?.message || (probe.expectation?.occupancyPolicy === 'portal_composite'
      ? 'The portal supports remain solid while the intended opening stays traversable.'
      : 'Perimeter approaches stopped the production actor before it entered or crossed the visible solid.')
  };
}

export function evaluateAssetBoundaryProbe(probe) {
  const findings = [];
  const expected = probe.expectation;
  if (!expected) {
    findings.push(finding('asset_collision_contract_missing', 'inconclusive', 'This level asset has no collision expectation.', {
      assetId: probe.assetId,
      placementIndex: probe.placementIndex
    }));
  } else if (!probe.assetLoaded) {
    findings.push(finding('asset_visual_not_loaded', 'fail', 'The production visual asset did not load, so its boundary cannot be compared.', {
      assetId: probe.assetId,
      placementIndex: probe.placementIndex
    }));
  } else {
    if (typeof probe.expectedVisible === 'boolean' && probe.actualVisible !== probe.expectedVisible) {
      findings.push(finding('asset_phase_visibility_mismatch', 'fail', probe.expectedVisible
        ? 'The phase requires this object to be visible, but the production asset is hidden.'
        : 'The phase requires this object to be hidden, but the production asset is visible.', {
        assetId: probe.assetId,
        phaseId: probe.phaseId,
        expectedVisible: probe.expectedVisible,
        actualVisible: probe.actualVisible
      }));
    }
    if (!probe.expectedVisible && expected.mode === 'solid' && (expected.sizeCheck === 'direct' || expected.phaseBound)
      && (probe.activeColliderIds || []).length > 0) {
      findings.push(finding('hidden_asset_retains_solid_boundary', 'fail', 'A phase-hidden object still has an active dedicated boundary that blocks walking and shots.', {
        assetId: probe.assetId,
        phaseId: probe.phaseId,
        activeColliderIds: probe.activeColliderIds
      }));
    }
  }
  if (probe.assetLoaded && probe.expectedVisible !== false && expected?.mode === 'solid') {
    if (expected.missingBoundary || !(expected.colliderIds || []).length || (probe.missingColliderIds || []).length) {
      findings.push(finding('asset_expected_collider_missing', 'fail', 'A solid visual object is missing one or more authored collider definitions.', {
        assetId: probe.assetId,
        missingColliderIds: probe.missingColliderIds,
        noColliderAuthored: !(expected.colliderIds || []).length
      }));
    } else if ((probe.overlappingColliderIds || []).length === 0) {
      findings.push(finding('asset_visual_and_boundary_disconnected', 'fail', 'The visual object does not overlap its assigned collision boundary.', {
        assetId: probe.assetId,
        colliderIds: expected.colliderIds,
        visualBounds: probe.visualBounds,
        colliderBounds: probe.colliderBounds
      }));
    } else if (expected.sizeCheck === 'direct' && ((probe.footprintRatio || 0) < 0.15 || (probe.footprintRatio || 0) > 6)) {
      findings.push(finding('asset_boundary_size_suspicious', 'warn', 'The collision footprint is unusually small or large compared with the visible object.', {
        assetId: probe.assetId,
        footprintRatio: round(probe.footprintRatio),
        visualSize: probe.visualSize,
        colliderSize: probe.colliderSize
      }));
    }
    const fidelity = probe.boundaryFidelity;
    const fidelityEnforced = expected.sizeCheck !== 'shared'
      && !['ambient_allowed', 'walkable_composite', 'portal_composite', 'support_composite'].includes(expected.occupancyPolicy);
    if (fidelityEnforced && fidelity?.sampleCount >= 8) {
      if ((fidelity.colliderOnlyRatio > .18)
        || (fidelity.overblockingRatio > .24 && fidelity.maxOverreach > .5)) {
        findings.push(finding('asset_boundary_overblocks_visible_shape', 'fail', 'The authored boundary protrudes materially beyond the rendered model silhouette.', {
          assetId: probe.assetId,
          colliderOnlyRatio: round(fidelity.colliderOnlyRatio),
          overblockingRatio: round(fidelity.overblockingRatio),
          maxOverreach: round(fidelity.maxOverreach),
          matchedRatio: round(fidelity.matchedRatio),
          sampleCount: fidelity.sampleCount
        }));
      }
      if (fidelity.underblockingRatio > .48 && fidelity.maxUnderreach > .65) {
        findings.push(finding('asset_boundary_underrepresents_visible_shape', 'warn', 'A large part of the rendered silhouette is outside the authored boundary.', {
          assetId: probe.assetId,
          visualOnlyRatio: round(fidelity.visualOnlyRatio),
          underblockingRatio: round(fidelity.underblockingRatio),
          maxUnderreach: round(fidelity.maxUnderreach),
          matchedRatio: round(fidelity.matchedRatio),
          sampleCount: fidelity.sampleCount
        }));
      }
    }
  }

  const severities = findings.map(item => item.severity);
  const status = severities.includes('fail')
    ? 'fail'
    : (severities.includes('warn') ? 'warn' : (severities.includes('inconclusive') ? 'inconclusive' : 'pass'));
  return {
    ...probe,
    status,
    findings,
    summary: findings[0]?.message || (expected?.mode === 'nonblocking'
      ? 'The asset is intentionally non-blocking.'
      : 'The production visual overlaps its assigned authored boundary.')
  };
}

export function summarizeBoundaryFidelity(samples = [], tolerance = .35) {
  const usable = (Array.isArray(samples) ? samples : []).filter(sample =>
    Number.isFinite(sample?.visualDistance) || Number.isFinite(sample?.colliderDistance));
  const result = {
    sampleCount: usable.length,
    matched: 0,
    colliderOnly: 0,
    visualOnly: 0,
    overblocking: 0,
    underblocking: 0,
    matchedRatio: 0,
    colliderOnlyRatio: 0,
    visualOnlyRatio: 0,
    overblockingRatio: 0,
    underblockingRatio: 0,
    maxOverreach: 0,
    maxUnderreach: 0,
    meanAbsoluteOffset: 0
  };
  if (!usable.length) return result;
  let absoluteOffsetTotal = 0;
  let comparable = 0;
  for (const sample of usable) {
    const visual = Number.isFinite(sample.visualDistance) ? sample.visualDistance : null;
    const collider = Number.isFinite(sample.colliderDistance) ? sample.colliderDistance : null;
    if (visual == null) {
      result.colliderOnly++;
      result.overblocking++;
      continue;
    }
    if (collider == null) {
      result.visualOnly++;
      result.underblocking++;
      continue;
    }
    comparable++;
    const offset = visual - collider;
    absoluteOffsetTotal += Math.abs(offset);
    if (Math.abs(offset) <= tolerance) result.matched++;
    else if (offset > 0) {
      result.overblocking++;
      result.maxOverreach = Math.max(result.maxOverreach, offset);
    } else {
      result.underblocking++;
      result.maxUnderreach = Math.max(result.maxUnderreach, -offset);
    }
  }
  const count = usable.length;
  result.matchedRatio = result.matched / count;
  result.colliderOnlyRatio = result.colliderOnly / count;
  result.visualOnlyRatio = result.visualOnly / count;
  result.overblockingRatio = result.overblocking / count;
  result.underblockingRatio = result.underblocking / count;
  result.meanAbsoluteOffset = comparable ? absoluteOffsetTotal / comparable : 0;
  return result;
}

export function buildLevelCollisionReport({ levelId = 'relay-district', environment = {}, startedAt, completedAt, results = [], errors = [], interruptions = [] }) {
  const summary = {
    total: results.length,
    pass: 0,
    warn: 0,
    fail: 0,
    inconclusive: 0,
    healthy: true,
    byKind: {},
    byPhase: {}
  };
  const findingCounts = new Map();
  const rootCauses = new Map();
  for (const result of results) {
    summary[result.status] = (summary[result.status] || 0) + 1;
    const kind = result.objectKind || 'unknown';
    summary.byKind[kind] ||= { pass: 0, warn: 0, fail: 0, inconclusive: 0 };
    summary.byKind[kind][result.status] = (summary.byKind[kind][result.status] || 0) + 1;
    const phase = result.phaseId || 'unspecified';
    summary.byPhase[phase] ||= { pass: 0, warn: 0, fail: 0, inconclusive: 0 };
    summary.byPhase[phase][result.status] = (summary.byPhase[phase][result.status] || 0) + 1;
    for (const item of result.findings || []) {
      findingCounts.set(item.code, (findingCounts.get(item.code) || 0) + 1);
      // The same physical defect is commonly exercised in several level
      // phases. Retain every result as evidence, but collapse those repeats in
      // the executive summary so one bad prop does not look like many bugs.
      const objectId = result.levelObjectId || result.objectId || item.assetId || 'unknown';
      const rootKey = `${item.code}|${objectId}`;
      const root = rootCauses.get(rootKey) || {
        code: item.code,
        levelObjectId: objectId,
        objectKind: result.objectKind || 'unknown',
        severity: item.severity,
        occurrences: 0,
        phases: new Set()
      };
      root.occurrences += 1;
      if (result.phaseId) root.phases.add(result.phaseId);
      rootCauses.set(rootKey, root);
    }
  }
  summary.healthy = summary.fail === 0 && summary.warn === 0 && summary.inconclusive === 0 && errors.length === 0;
  summary.prioritizedFindings = [...findingCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }));
  summary.rootCauseFindings = [...rootCauses.values()]
    .map(item => ({ ...item, phases: [...item.phases].sort() }))
    .sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code) || a.levelObjectId.localeCompare(b.levelObjectId));
  summary.uniqueRootCauses = summary.rootCauseFindings.length;
  return {
    schemaVersion: 7,
    diagnostic: 'level-collision',
    levelId,
    startedAt,
    completedAt,
    environment,
    summary,
    results,
    errors,
    interruptions
  };
}
