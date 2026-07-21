# Levels & Asset Plan

## Campaign Structure

Build eight reusable campaign levels. Each supports four escalating waves and a boss on the fifth wave. The final campaign package adds Waves 36–40 and culminates at Wave 40 with **The Algorithm**. Clearing the campaign unlocks the first ten-wave post-game endurance sector.

Every seamless level-entry wave after the opening district (Waves 6, 11, 16, 21, 26, 31, 36, and 41) places one authored ammo crate and one authored health crate on separate clear routes near the player approach. These are optional recovery resources rather than an automatic health or reserve refill, and any unopened entry crates are cleared when the next wave begins.

| Level | Waves | Role | Final Encounter |
|---|---:|---|---|
| Relay District | 1–5 | Onboarding arena | Broodmaker (light) |
| Sanitizer Spire | 6–10 | Suppression and target priority | Commissioner Sanitizer |
| Ad-Zone Arena | 11–15 | Moving cover and area denial | Influencer Captain |
| Trend Wastes | 16–20 | Weather and long sightlines | Algorithm Shard Avatar |
| Freight Annex | 21–25 | Industrial pressure and ambushes | Broodmaker (heavy) |
| Mirror Garden | 26–30 | Clone identification and crowd control | Echo Hydraclone |
| Content Court | 31–35 | Radial objectives and final Bureau trial | Strike Adjudicator |
| Server Cathedral | 36–40 | Campaign climax and player choice | The Algorithm |
| Sandstorm Expanse | 41–50 | Post-game endurance sector | Elite assault at Wave 50 |
| Floodgate Continuity | 51–71 | Three-chapter flood-control endurance run | Greywater core shutdown at Wave 71 |
| Blackout Cistern — Last Light | 72 | One-wave darkness climax | Four internal surges and the Swarm Warden |

### Authored Encounter Pacing

Campaign arenas commit a larger authored roster without putting the entire roster on screen at once. Ordinary waves open with one package, release later packages after the active group is substantially cleared, and hold surplus units in a committed queue while the wave's `activeCap` is full. Objective waves attach package releases to objective progress instead. A wave cannot complete while a package or queued unit remains. This preserves escalation and battlefield pressure without returning to random procedural spawn coordinates.

### Shared Level Rules

- Arena footprint: roughly **50–70 m wide**, with a 20–25 m boss-clear zone.
- Navigation: three readable routes plus one reconnecting loop; no dead-end combat lanes.
- Cover: a meaningful decision every 5–8 m, mixing knee, waist, full, peek, and breakable cover.
- Spawns: four to six authored entrances using doors, hatches, vents, lifts, or perimeter gates.
- Readability: one dominant landmark, one route color per lane, and protected space around objectives.
- State change: every level needs an oppressed state and a visibly liberated state after victory.

### Boss Arena Blockout Standard

All dimensions below describe **clear traversable floor inside collision walls**, not the exterior architectural footprint. Treat one world unit as approximately one metre. Add wall thickness, facade depth, inaccessible dressing, and transition spaces outside these dimensions.

| Boss | Recommended clear floor | Absolute minimum | Blockout requirement |
|---|---:|---:|---|
| Broodmaker | 54 x 48 m | 46 m short axis | Maintain two broad routes around the brood screen. The diagnostic recorded an approximately 43 x 33 m boss movement envelope. |
| Commissioner Sanitizer | 52 x 52 m | 46 x 46 m | Preserve the 12 m Suppression Node ring, hazard bands reaching approximately 14 m, and reinforcement spawns at 16–19 m. |
| Influencer Captain | 52 x 46 m | 44 m short axis | Reserve a separate aerial corridor approximately 96 m long for the Zeppelin's pass from X -44 to X +46. |
| Algorithm Shard Avatar | 54 x 54 m | 48 x 48 m | Keep a large open center for radial barrages and use compact cover islands with two bypasses. |
| Broodmaker Prime | 64 x 60 m | 56 x 56 m | Support a recorded 53 x 54 m boss envelope, ten concurrent auxiliaries, burrow relocation, goo, and Flyers. |
| Echo Hydraclone | 52 x 52 m | 44 x 44 m | Support up to 36 active bodies and queued descendants without narrow crowd traps. |
| Strike Adjudicator | 46 x 42 m | 38 x 38 m | Keep lateral escape lanes around Citation mine screens and readable access to every Purge Node. |
| The Algorithm | 42 x 42 m | 36 x 36 m | Keep the anchored center clear; Control Nodes occupy an 11 m radius and Paradox echoes an 8.5 m radius. |

Use **54 x 54 m** as the reusable standard boss module. Use the expanded **64 x 60 m** module for Broodmaker Prime and full-lineage Hydraclone encounters. The Algorithm may use the compact 42 x 42 m anchor module.

Boss-arena construction rules:

- Ground boss routes must be at least 7 m wide, or 8 m when adds share the route.
- Keep 3–4 m of unobstructed perimeter space for retreat, flanking, and spawn recovery.
- Full-height LOS cover should be 4–6 m wide and must have two bypass routes. Never use a continuous barrier to divide the arena into isolated halves.
- Hard cover should occupy approximately 15–20% of the traversable floor. Shard needs a mostly open central pattern space; Sanitizer's objective and hazard rings must not overlap authored clutter.
- Standard clear ceiling height is 10–12 m. Use 14–16 m for Sanitizer jumps, Flyers, and Zeppelin visibility. Captain's Zeppelin requires an exterior or overhead exit volume because its retreat can rise beyond the playable ceiling.
- Expand navigation obstacles by the active boss collision radius. The largest current ground boss radius is approximately 2.45 m, so player-width validation alone is insufficient.
- Place boss, objective, reinforcement, and relocation anchors before decorative cover. Validate every phase layout, not only the opening phase.

Current technical constraint: Sanitizer objective/hazard placement, Broodmaker relocation, Adjudicator clamping, and Captain's Zeppelin route contain world-centered coordinates or bounds. Until encounters expose a local arena origin, boss rooms must remain centered near world XZ `(0, 0)`. The supported outer simulation bounds are approximately X/Z `-39..39`; the Zeppelin uses a wider external flight volume.

## Level 01 — Relay District

**Waves:** 1–5  
**Why:** Teach movement, cover, objectives, and boss rules in a recognizable Echo City district.  
**What:** A civic relay courtyard connected to a service lane and a damaged shopping street. Wave 5 converts the central relay into a Broodmaker nest.

### Playable Relay District Specification

Relay District is the standard campaign runtime for Waves 1–5. It occupies a 64×56 m footprint and starts the player on the southern shopping street, facing north toward the relay mast. A 10.5 m radius around the mast remains clear of ordinary cover, producing a 21 m boss courtyard. The west service route is cyan, the civic courtyard is acid green, and the east shopping route is amber. Both outside lanes reconnect through the southern street and the north courtyard; the west fire escape is a short, two-ended flank rather than a dead-end perch.

The default weather schedule is clear in Waves 1–2, rain in Waves 3–5, and clear during the four-second liberation beat. Roads, buildings, capture spaces, and primary combat lanes exclude grass; medians, damaged verges, and four tree pockets retain the weather-reactive field.

| Wave | Encounter | Authored roster and gate |
|---:|---|---|
| 1 | Break the Cordon | 8 Grunts in two packages; active cap 8. The north door and west gate teach readable reinforcement entrances. |
| 2 | Clear the Blind Spots | 9 Grunts and 2 Shooters in two packages; active cap 9. The east alley enters the spawn rotation. |
| 3 | Restore Both Feeds | 10 Grunts, 3 Shooters, and 1 Tank in three packages; active cap 10. Hold the west terminal and east power relay for 6 seconds each, in either order. |
| 4 | Overcharge the Mast | 11 Grunts, 4 Shooters, and 1 Tank in three packages; active cap 11. Packages release at the start and at 33%/66% of a 24-second cumulative mast capture. |
| 5 | Nest at the Relay | Light Broodmaker at the fixed nest anchor. Infestation replaces normal objective dressing until liberation. |

The boss diagnostic's **Level 1 · Relay District** case targets this Wave 5 light Broodmaker, not Sanitizer. It loads the production Relay geometry and fixed boss anchor, moves the player through both side lanes and the civic court, and validates playable bounds, collision-safe navigation, the production 15–22 m working range, Gruntling placement, and whether the brood forms a real screen between boss and player.

Capture time pauses while the player is outside or an enemy contests the zone. Progress never decays. A wave cannot advance until both its roster and its objective gate are complete. After the Wave 5 liberation beat, Relay District unloads and Wave 6 begins in Sanitizer Spire.

### Relay Spawn Network

Relay uses five ground entrances: `north-door`, `west-gate`, `east-alley`, `floor-hatch`, and `rear-vent`, plus two inactive elevated anchors reserved for flyers. Every entrance owns a finite transform, facing vector, wave range, enemy allowlist, route identity, and per-enemy clearance. Tank pads are wider than Grunt and Shooter pads. Broodmaker Gruntlings may use only the floor hatch and rear vent.

The runtime validates each pad against Relay's simplified static colliders during load. Invalid pads are warned about and removed. Immediately before an enemy is emitted, selection checks the player 12 m safety radius, active enemies, current colliders/destructibles, objectives, and the boss-clear courtyard. Selection prefers occluded or rearward entrances. If all eligible pads are blocked, the enemy remains counted in the authored queue and retries after 0.28 seconds; Relay never falls back to random arena coordinates. Walkable fire-escape ramps and landings support ground height checks but are excluded from navigation-blocker AABBs.

### Assets for This Level

**Reuse from `src/assets`:**

- `apartment`, `cornershop`, `facade`, `civicwall` — form the city perimeter and skyline.
- `roadcurb`, `sidewalk`, `streettree` — define the safe route language.
- `checkpoint`, `roadblock`, `barriers`, `gabion` — divide the three combat lanes.
- `terminal`, `powerrelay`, `capturebeacon` — create the relay activation objective.
- `reinforcementdoor`, `floorhatch`, `breachvent` — separate enemy types by spawn silhouette.

**New asset requests:**

- **Broadcast relay mast** — dominant landmark, objective, and boss-phase anchor.
- **Fire escape and roof connector kit** — one optional elevated flank without building a second floor everywhere.
- **Brood infestation set** — nest openings, egg clusters, and goo decals for the Wave 5 transformation.
- **Relay modular street kit** — six-metre straight and corner road modules with matching sidewalks, curb returns, crossing, drainage, and access-ramp details.

## Level 02 — Sanitizer Spire

**Waves:** 6–10  
**Why:** Introduce suppression fields and force the player to destroy support targets before attacking the boss.  
**What:** A sterile Bureau forecourt leading into a press-control floor. Three censorship stations control visibility, healing, and enemy reinforcement speed.

The west clinic route now contains a short, two-ended stair and catwalk flank with solid rails, support collision, and authored walkable ramps. It creates a real high/low sightline decision without entering the 11 m boss-clear ring. Wave 8 activates three proximity suppression feeds—west censor, east censor, and press censor. Each feed pauses while contested, never loses progress, and releases the next committed reinforcement package when completed.

Regular-wave roster totals are 14, 16, 18, and 20 for Waves 6–9, with active caps rising from 10 to 12. Wave 10 remains the fixed Commissioner Sanitizer encounter.

### Assets for This Level

**Reuse from `src/assets`:**

- `clinic`, `clinicwall`, `corridor` — establish the clean institutional shell.
- `decon`, `emergencysign`, `reinforcementdoor`, `shutter` — signal transitions and phase locks.
- `terminal`, `powerrelay`, `ammostation` — become suppression controls and recovery stations.
- `stairs`, `catwalk`, `cargolift` — support a compact high/low route loop.
- `peekcover`, `cornercover` — protect the player from sweeping attacks without hiding the boss.

**New asset requests:**

- **Spire facade and press-room kit** — gives the level a unique Bureau identity.
- **Censorship node family** — three readable device states: active, vulnerable, destroyed.
- **Suppression floor tiles** — telegraph temporary damaging or healing-blocked zones.

## Level 03 — Ad-Zone Arena

**Waves:** 11–15  
**Why:** Add moving cover, area denial, and rapidly changing combat lanes.  
**What:** A commercial plaza seized by the Influencer Militia. Sponsor zones reward risky positions while billboard walls periodically reshape routes.

Waves 11–14 commit 18, 20, 23, and 24 enemies, with active caps of 12–13. Reinforcement packages preserve the arena's moving-cover rhythm; Wave 13 binds its later packages to the Sponsor Window objective instead of releasing every unit at the opening bell.

### Assets for This Level

**Reuse from `src/assets`:**

- `kiosk`, `cornershop`, `guardbooth`, `screenwall` — build market stalls and plaza edges.
- `barriers`, `roadblock`, `coverheights`, `breakablecover` — create temporary street cover.
- `lightmast`, `tower`, `catwalk` — support Zeppelin sightlines and anti-air targets.
- `capturebeacon`, `terminal` — become sponsor circles and ad-control consoles.

**New asset requests:**

- **Rotating billboard wall** — mechanically reconfigures one lane per phase.
- **Sponsor-zone projector** — clearly marks beneficial and hostile floor zones.
- **Ad-trap pylon and Zeppelin pod** — links ground hazards to the boss support craft.
- **Ad-Zone plaza module kit** — sponsor-lane, cable-crossing, and vendor-frontage modules that give the arena reusable ground identity.

## Level 04 — Trend Wastes

**Waves:** 16–20  
**Why:** Test navigation under poor visibility and give long-range weapons room to breathe.  
**What:** A storm-damaged processing road with three wind lanes. Sand gusts close long sightlines, while sheltered cross-routes remain reliable.

The playable floor combines a walkable dune shoulder, eroded-road transition, and dry-wash terrain module so the arena no longer reads as one flat plane. Four three-state windbreak groups create paired northern and southern shelter decisions while retaining the open Shard pattern space. Waves 16–19 commit 20, 23, 26, and 29 enemies with active caps of 13–14, delivered as staged pressure rather than one performance-heavy burst.

### Assets for This Level

**Reuse from `src/assets`:**

- `hesco`, `screenwall`, `retainingwall`, `roadblock` — shape the broad exterior boundary.
- `roadcurb`, `drainage`, `roaddamage` — create the main processing road and erosion breaks.
- `benttree`, `deadtree` — show wind direction before the storm arrives.
- `lightmast`, `checkpoint`, `capturebeacon` — remain visible as navigation landmarks.
- `pipes`, `reel`, `gabion` — form non-box cover clusters in open terrain.

**New asset requests:**

- **Storm-eye beacon** — the only reliable long-distance landmark in heavy sand.
- **Filter-ruin and icon-debris set** — gives the wastes a memetic identity beyond generic desert props.
- **Windbreak cloth variants** — show safe, risky, and collapsed lane states.
- **Trend Wastes terrain kit** — walkable dune slope, eroded road transition, and dry-wash rock modules for building terrain rather than dressing a flat arena.

## Level 05 — Freight Annex

**Waves:** 21–25  
**Why:** Escalate close industrial combat and reintroduce the Broodmaker with more dangerous spawn control.  
**What:** A large freight yard with a central loading hall, two exterior service lanes, and under-floor ambush routes. Wave 25 infects machinery and cargo entrances.

### Assets for This Level

**Reuse from `src/assets`:**

- `warehouse`, `servicewall`, `cargogate`, `concretewall` — establish the industrial arena shell.
- `loadingramp`, `catwalk`, `stairs`, `ladderplatform` — create two complete elevation loops.
- `generator`, `pipes`, `reel`, `trolley` — provide industrial landmarks and cover.
- `cargolift`, `floorhatch`, `breachvent`, `shutter` — deliver waves from distinct directions.
- `gabion`, `hesco`, `breakablecover` — control long loading-bay sightlines.

**New asset requests:**

- **Industrial brood nest** — combines burrow entrances with freight machinery.
- **Infected prop variants** — staged goo and egg overlays for existing generators, pipes, and doors.
- **Large burrow breach** — supports the heavy Broodmaker entrance and relocation attack.
- **Freight lane modular kit** — straight container edge, inside corner, and gated endcap modules for readable loading-yard boundaries.

## Level 06 — Mirror Garden

**Waves:** 26–30  
**Why:** Give the Hydraclone enough open space for splitting while keeping every generation readable.  
**What:** A formal Bureau garden corrupted into concentric mirror paths. Destroyed mirrors open shortcuts and reduce false clone projections.

### Assets for This Level

**Reuse from `src/assets`:**

- `civicwall`, `facade`, `streettree`, `broadleaf` — create the formal garden boundary.
- `coverheights`, `peekcover`, `cornercover` — shape circular cover without blocking the center.
- `capturebeacon`, `powerrelay`, `terminal` — become clone-control devices.
- `lightmast`, `emergencysign` — maintain orientation during visual distortion.

**New asset requests:**

- **Mirror panel family** — intact, cracked, false-image, and destroyed gameplay states.
- **Generation floor markers** — identify clone split zones at a glance.
- **Split-ring emitter** — telegraphs radial spawns and knockback pulses.
- **Glitch topiary set** — gives the garden a unique silhouette without changing collision rules.
- **Mirror Garden path kit** — concentric walkways, clone loop, destructible shortcut thresholds, and formal planting beds.

## Level 07 — Content Court

**Waves:** 31–35  
**Why:** Deliver the final Bureau authority fight and test target priority under radial pressure.  
**What:** A tribunal chamber arranged around a central dais. Three court sectors hold Purge Nodes; open side aisles let the player clear Strikes without crossing the boss firing line.

### Assets for This Level

**Reuse from `src/assets`:**

- `fortwall`, `civicwall`, `corridor`, `archives` — form the fortified court and side records rooms.
- `stairs`, `reinforcementdoor`, `emergencysign` — frame ceremonial entrances and reinforcement paths.
- `terminal`, `powerrelay`, `capturebeacon` — become court controls and Purge Node bases.
- `cornercover`, `peekcover`, `breakablecover` — protect routes while allowing the boss to remain visible.

**New asset requests:**

- **Tribunal dais and radial floor kit** — defines the boss center and three sectors.
- **Purge Node and Strike pylon** — communicates the cleanse loop without HUD dependence.
- **Court bench and evidence barrier family** — thematic cover with multiple damage states.
- **Court sector aisle kit** — paired strike-clearance aisles, evidence rails, and a three-color verdict threshold.

## Level 08 — Server Cathedral

**Waves:** 36–40  
**Why:** Conclude the campaign with a mastery test, reveal The Algorithm, and stage the free-or-reset choice.  
**What:** A sacred-digital complex progressing from logic rooms into the Data Nave, Mirror Choir, and Root Altar. Geometry shifts between waves, but the same three route colors remain consistent.

### Wave Plan

- **Wave 36 — Data Nave Breach:** shard gauntlet across three long aisles.
- **Wave 37 — Logic Rooms:** route switches open one flank while closing another.
- **Wave 38 — Mirror Choir:** false targets and mirrored enemy silhouettes.
- **Wave 39 — Root Altar:** defend three logic nodes; unresolved Hydraclone remnants may join the wave.
- **Wave 40 — The Algorithm:** implemented final boss. Phase 1 is **Control**, Phase 2 is **Paradox**, and Phase 3 is **Coherence Collapse**; victory ends at the free-or-reset console.

### Assets for This Level

**Reuse from `src/assets`:**

- `corridor`, `archives`, `servicewall`, `clinicwall` — provide the structural graybox and server-stack massing.
- `catwalk`, `stairs`, `ladderplatform`, `cargolift` — create nave balconies and root-level shortcuts.
- `terminal`, `powerrelay`, `capturebeacon` — become logic nodes, locks, and the final choice interface.
- `emergencysign`, `lightmast` — become route-color gantries and vertical navigation beacons.
- `reinforcementdoor`, `shutter`, `breachvent` — support visible, phase-controlled enemy entry.

**New asset requests:**

- **Server Cathedral modular kit** — arches, columns, nave floor, ceiling ribs, and balcony edges.
- **Stained-dashboard window family** — the level's signature light and story surface.
- **Mirror Choir kit** — reflective panels, choir terminals, and false-image emitters.
- **Root Altar and logic-room modules** — shifting walls, bridges, locks, and the central core.
- **End-choice console** — clear free/reset states with persistent world feedback.
- **Server Cathedral route kit** — three persistent nave lanes and a logic-room switch crossing retain route color through every finale phase.
- **The Algorithm boss and phase objects** — implemented with three Control nodes, three capped Paradox echoes, a head-tracked triangular eye beam, and an add-free final duel.

## Endless Sector 01 — Sandstorm Expanse

**Waves:** 41–50  
**Unlock:** Complete Wave 40.  
**Why:** Provide a demanding post-campaign run that tests sustained survival before more endless sectors are produced.  
**What:** A **1.2× arena**—target footprint **72 × 60 m**—built from the Trend Wastes language. Persistent sand limits visibility, while three beacon-marked routes and sheltered resupply pockets keep navigation reliable.

### Endurance Rules

- The ten waves are one run. Clearing Wave 50 records a **Sandstorm Expanse completion** and returns the player to the hub.
- Grow the roster from roughly **55 enemies at Wave 41 to 80 at Wave 50**, delivered in three to five assault groups with a target cap of **26 active enemies**.
- Shooters and flyers each form roughly **25–35%** of the roster; rushers, tanks, healers, and Wardens supply ground pressure.
- Normal visibility is **18–24 m**. Heavy gusts reduce it to **12–16 m** for 6–10 seconds.
- Enemies beyond the current visibility envelope cannot fire accurately. Shooter visors, muzzle flashes, projectiles, and flyer lights remain visible through dust.
- Three storm beacons identify the routes. Each route must reconnect to a sheltered center or resupply pocket.
- Wave 50 is a combined-arms elite assault, not another story boss. Future endurance levels can unlock after this completion gate.

### Wave Plan

- **Wave 41 — Into the Dust:** moderate storm; establish beacons and ranged-enemy rules.
- **Wave 42 — Crosswind:** flyers attack above two moving ground groups.
- **Wave 43 — Firing Line:** shooter squads occupy alternating lane edges.
- **Wave 44 — Blind Push:** heavy gusts shorten combat to close and mid range.
- **Wave 45 — Supply Break:** defend a resupply pocket against elites and healers.
- **Wave 46 — Swarm Front:** the run's largest flyer composition, split into readable flights.
- **Wave 47 — Crossfire:** shooters advance behind tanks while Wardens reinforce the air lane.
- **Wave 48 — Beacon Failure:** restore two disabled route beacons during heavy dust.
- **Wave 49 — No Shelter:** rotating gusts force movement between all three lanes.
- **Wave 50 — Last Horizon:** three combined-arms assault groups followed by one elite command group.

### Assets for This Level

**Reuse from `src/assets`:**

- `hesco`, `screenwall`, `retainingwall`, `roadblock` — create broad boundaries without turning the level into a box.
- `roadcurb`, `drainage`, `roaddamage` — keep routes readable when terrain color disappears in dust.
- `benttree`, `deadtree`, `lightmast`, `tower` — provide silhouettes above the visibility line.
- `pipes`, `reel`, `gabion`, `barriers` — form varied cover islands for the larger enemy count.
- `checkpoint`, `cargogate`, `reinforcementdoor` — make assault-group entrances predictable.
- `ammostation`, `medcache`, `capturebeacon`, `powerrelay` — support resupply, beacon restoration, and hold objectives.

**Shared with Trend Wastes:**

- **Storm-eye beacon** — route landmark and temporary safe-visibility bubble.
- **Filter ruins, icon debris, and windbreak cloth** — extend the same visual kit across a larger arena.

**New asset requests:**

- **Modular sandbank family** — low dunes and drifts that shape lanes without snagging movement.
- **Storm siren tower** — warns of heavy gusts and serves as the arena's dominant landmark.
- **Endurance relay monument** — activates after Wave 50 and records the completed sector.

## Endless Sector 02 — Floodgate Continuity

**Waves:** 51–71  
**Unlock:** Complete Sandstorm Expanse.  
**Story event:** The Greywater Protocol.  
**Why:** Continue the post-game without reversing the victory over The Algorithm. The player fights a dormant Bureau failsafe rather than discovering that the main ending did not matter.  
**What:** One large, transforming Floodgate Underpass level divided into three seven-wave chapters. Flood-control tunnels also cooled the old Bureau data network, so changing water levels reveal a sealed Continuity Archive beneath Echo City.

**Implementation status:** Authored in `src/levels/floodgate-continuity.js` with Waves 51–71, persistent restart checkpoints at Waves 58 and 65, four water states, synchronized route locks and currents, three Archive Seed objectives, and the Wave 71 Greywater override finale.

### Story Setup

The relay recovered at Wave 50 contains an automated handshake from below the sandstorm. It belongs to the **Greywater Protocol**, a non-sentient system designed to restore the quarantine if Echo City ever becomes “unstable”—meaning colorful, decentralized, or joyful. The protocol wakes sealed response units and begins copying old Bureau rules back into public infrastructure.

Both campaign endings converge cleanly:

- **The Algorithm was freed:** it warns the player and translates Greywater routing, but cannot command a system older than itself.
- **The Algorithm was reset:** community operators triangulate the same signal and guide the player manually.
- Gameplay remains identical; dialogue, helper lights, and console graphics reflect the chosen ending.

### Run Structure

Twenty-one uninterrupted waves would create fatigue, so the level uses three chapters with checkpoints and an optional return to the hub after Waves 57 and 64. Water, damage, and opened shortcuts persist when the run resumes.

| Chapter | Waves | Space | Story Goal | Gameplay Change |
|---|---:|---|---|---|
| I — Spillway Approach | 51–57 | Exterior flood walls and maintenance yard | Trace and disable the surface handshake | Sand fades; water begins entering side lanes |
| II — Pump Galleries | 58–64 | Turbine hall, channels, and overhead service routes | Reroute pumps to expose the hidden archive | Water alternates low, medium, and high routes |
| III — Continuity Vault | 65–71 | Cooled server stacks and master sluice chamber | Destroy the Greywater seed before it restores quarantine | Flooding and data locks reshape the arena together |

### Story and Encounter Beats

- **Wave 51 — Signal Below:** enter through the storm drain and establish the first dry safe route.
- **Waves 52–56 — Wake Sequence:** sealed doors release shooters, flyers, tanks, and maintenance Wardens as the protocol comes online.
- **Wave 57 — Cut the Handshake:** defend two relays, then close the exterior floodgate; first checkpoint.
- **Wave 58 — Descent:** the main sluice opens and reveals the pump galleries.
- **Waves 59–63 — Water Logic:** each wave changes which ground, bridge, or catwalk route is usable.
- **Wave 64 — Drain the Archive:** hold three pump controls while elite squads counterattack; second checkpoint.
- **Waves 65–70 — Continuity Purge:** destroy three Archive Seeds. Each destroyed seed removes one Wave 71 hazard.
- **Wave 71 — Data Deluge:** defend the master override during a full combined-arms assault, then destroy the Greywater core. This is an environmental finale, not a new character boss.
- **Future hook:** a final transmission reveals that Greywater copied one seed beyond Echo City, providing a clean unlock for the next endurance level.

### Level Design Rules

- Preserve one dry route at every water state; rising water must change decisions, never create unavoidable damage.
- Use three route layers: channel floor, maintenance deck, and overhead catwalk. Every layer reconnects at two landmarks.
- Shooters occupy dry galleries, flyers pressure open channels, and rushers use vents only after an audio warning.
- Pumps and gate lights preview the next water state before it changes.
- Each chapter visibly transforms the same central floodgate, giving the 21-wave run a sense of progress.
- The Wave 71 core functions like an objective boss with three readable states: shielded, exposed, and destroyed.

### Assets for This Level

**Reuse from `src/assets`:**

- `retainingwall`, `concretewall`, `servicewall`, `drainage` — form the flood-control shell and channels.
- `pipes`, `generator`, `reel`, `tower` — establish pumping infrastructure and large landmarks.
- `catwalk`, `footbridge`, `stairs`, `ladderplatform`, `loadingramp` — create the three route layers.
- `shutter`, `reinforcementdoor`, `cargolift`, `floorhatch`, `breachvent` — control chapter gates and enemy entrances.
- `terminal`, `powerrelay`, `capturebeacon` — become pump controls, Archive Seeds, and master overrides.
- `ammostation`, `medcache`, `gabion`, `peekcover`, `breakablecover` — create protected recovery pockets.
- Existing shooter, flyer, tank, healer, rusher, sniper, and Warden models — represent reactivated Continuity response units.

**New asset requests:**

- **Modular floodgate family** — closed, opening, locked, and damaged states for the central landmark.
- **Pump and turbine family** — large machinery that communicates water-state changes.
- **Sluice pipe and overhead conduit kit** — breaks up walls and connects objectives visually.
- **Continuity Archive Seed** — shielded, exposed, and destroyed states for Waves 65–71.
- **Greywater master core** — environmental finale target with clear damage stages.
- **Waterline debris kit** — grates, algae marks, floating barriers, and maintenance wreckage.

**Required systems, not art assets:**

- Three authored water levels with synchronized collision, damage, current, and navigation updates.
- Persistent chapter checkpoints after Waves 57 and 64.
- Floodgate and shortcut state restoration when a chapter is resumed.
- Ending-specific helper lights and dialogue using the same objective logic.

## Implemented Wave 72 — Blackout Cistern

**Encounter name:** Last Light  
**Unlock:** Shut down the Greywater core at Wave 71.  
**Why:** End the Floodgate story with a memorable swarm spectacle built from the existing enemy library.  
**What:** Destroying Greywater triggers its final blackout failsafe and seals the Courier inside an overflow cistern. One damaged light remains at the center while a hidden Swarm Warden releases every stored response unit.

### Arena and Visibility

- Use a roughly **56 m diameter** circular arena with minimal full-height cover and six dark spawn sectors.
- The central lamp provides clear visibility for **5 m**, fades between **5–10 m**, and leaves the outer arena almost black.
- The floor, cover edges, and outer wall are barely readable silhouettes. There is no general flashlight.
- Enemy identity remains fair through emissive eyes, footsteps, attack sounds, and role colors: cyan Warden, violet drones, green Healer, orange Runners, and blue Block Bots.
- The Warden sends a cyan locator pulse every 8–10 seconds. After the final surge, the central lamp tracks it until it dies.
- Do not spawn Shooters or Snipers. The player should fear enemies emerging from darkness, not invisible ranged damage.

### Initial Enemy Package

| Enemy | Runtime Type | Count | Purpose |
|---|---|---:|---|
| Grunt Bot | `grunt` | 10 | Main pressure around the light |
| Gruntling Bot | `gruntling` | 10 | Small targets that fill gaps and hide behind larger units |
| Runner Bot | `rusher` | 12 by default; tune within 10–15 | Charges from darkness and forces quick turns |
| Block Bot | `tank` | 3 | Enters the light and displaces the player |
| Winged Drone | `flyer` | 5 | Vertical pressure and Warden screen |
| Healer Bot | `healer` | 1 | High-priority glowing target outside the light |
| Swarm Warden | `warden` | 1 persistent | Commands the wave and replenishes drones |

**Initial total:** 42 enemies at the default Runner count.

### Reinforcement Logic

- Trigger a new full package after roughly **40% of the latest package is killed**. The tuning range may move between 30–50%, matching difficulty and performance.
- Repeat the package **3 times on Standard, 4 on Hard, and 5 on Nightmare/endless challenge**. The single Warden persists instead of being duplicated.
- At the default Runner count, this commits approximately **165 enemies on Standard, 206 on Hard, or 247 on Nightmare** across the full encounter.
- Reinforcements arrive on top of survivors from four alternating dark sectors after a three-second alarm.
- Target maximum: **60 active enemies**. Units beyond the cap remain in a committed reserve and enter immediately as active slots open; they still count toward the surge total.
- Role caps: 6 Block Bots, 10 Winged Drones, and 2 Healers active at once. The Warden replenishes drones only up to the drone cap.
- Maintain at least 18 seconds between surge alarms so a high-damage build cannot trigger every package simultaneously.
- Display **Surge 1/4**, not a misleading remaining-enemy counter. The final cleanup counter appears only after all packages are committed.

### Combat Rhythm

- Grunts and Gruntlings establish a ring; Runners break it and force the player to turn.
- Block Bots enter the illuminated center so it never becomes a passive camping zone.
- The Healer remains near the 8–12 m falloff edge, creating a short, deliberate trip into darkness.
- Drones telegraph dives with visible wing lights and audio before crossing into the lit radius.
- The central `ammostation` refreshes after every surge. The `medcache` refreshes after every second surge.
- Killing the Warden early stops drone replenishment but does not cancel committed ground packages, rewarding a risky hunt without skipping the encounter.
- The wave ends only when every committed package and the Warden are dead. Full lighting then returns and exposes the destination of Greywater's escaped seed.

### Assets for This Level

**Reuse from `assets/generated`:**

- `gruntbot`, `gruntlingbot`, `runnerbot`, `blockbot` — the ground swarm.
- `winged_drone`, `healer_bot`, `swarm_warden` — air pressure, sustain, and command roles.

**Reuse from `src/assets`:**

- `retainingwall`, `concretewall`, `drainage`, `pipes` — form the mostly silhouetted cistern shell.
- `powerrelay`, `capturebeacon`, `lightmast` — graybox the central Last Light assembly.
- `floorhatch`, `breachvent`, `reinforcementdoor`, `cargolift` — provide six distinct dark spawn sectors.
- `ammostation`, `medcache` — support the extended ammunition and health economy.
- `cornercover`, `breakablecover`, `gabion` — create low silhouettes near the light falloff.

**New asset requests:**

- **Last Light reactor** — one hero prop combining the central lamp, surge alarm, and victory-state beacon.
- **Radial cistern floor kit** — subtle rings at 5 m and 10 m to teach the light boundary without HUD text.
- **Blackout enemy cue set** — small role-colored emissive inserts shared by the seven enemy models.

**Required systems, not art assets:**

- Local darkness/fog volume that preserves selected enemy emissive cues and attack telegraphs.
- Threshold-based surge controller with committed reserves, role caps, and a 60-active performance budget.
- Pooled spawning and an automated stress test using the exact Wave 72 composition.
- Warden locator pulse, final searchlight tracking, and per-surge resupply refresh.

## Supporting Spaces

These are authored spaces, but they do not need independent wave packages.

- **Meme Underground hub:** reuse `corridor`, `archives`, `kiosk`, `terminal`, and `ammostation`; request the Remix Bench, vendor stalls, NPC stations, and liberation-state dressing.
- **Archive Subway set piece:** reuse `retainingwall`, `corridor`, `drainage`, `stairs`, `footbridge`, `shutter`, and `cargolift`; request rails, platform edges, tunnel arches, and one damaged train shell.
- **Omega Broadcast epilogue:** reuse the Relay District mast and city architecture; request signal amplifiers, a compact broadcast stage, and crowd silhouettes.

## Distant Background Package

Player-space props cover roughly the first 30 metres. Each combat level also owns one lightweight horizon kit for placement beyond the playable boundary. These models prioritize silhouette and color blocking over interaction detail and should use simplified collision or no collision.

| Level | Generated backdrop | Horizon job |
|---|---|---|
| Relay District | `relaybackdrop` | Civic roofline, water tower, relay antennas, and elevated service line. |
| Sanitizer Spire | `spirebackdrop` | Sterile Bureau megaspire and flanking press blocks. |
| Ad-Zone Arena | `adzonebackdrop` | Commercial skyline, sponsor screens, and media gantry. |
| Trend Wastes | `wastesbackdrop` | Sand mesas, filter towers, and distant wind silhouettes. |
| Freight Annex | `freightbackdrop` | Silos, container massing, and dominant gantry crane. |
| Mirror Garden | `mirrorbackdrop` | Formal mirrored pavilion and symmetrical topiary horizon. |
| Content Court | `courtbackdrop` | Monumental tribunal facade, authority crown, and side towers. |
| Server Cathedral | `cathedralbackdrop` | Server spires, nested data arches, and luminous stack bands. |

Background placement rules:

- Place primary backdrops approximately **45–120 m** from the playable routes.
- Keep them outside navigation, projectile, spawn, and physics queries.
- Use one dominant silhouette and at most two supporting repeats per camera sector.
- Preserve each level's route-color accents at reduced brightness so backgrounds support orientation without competing with objectives.
- Author a simplified distance material or unlit LOD when the final lighting pipeline is established.

## Production Priority

1. Graybox all eight campaign arenas and validate routes, spawn safety, and boss-clear zones.
2. Prototype post-game in order: Sandstorm Expanse, Floodgate Continuity, then the Wave 72 Blackout Cistern stress test.
3. Reuse the current library for collision and gameplay; do not wait for visual assets.
4. Build mechanic-critical requests first: boss nodes, moving walls, mirrors, water states, surge control, and phase objects.
5. Build signature architecture second: Spire, Court, Cathedral, and Floodgate kits.
6. Add dressing last. Avoid creating more generic crates, walls, or barriers unless a gameplay dimension is missing.

## Current Boss Status

- **Current implemented last boss:** Strike Adjudicator at **Wave 35**.
- **Campaign last boss:** The Algorithm at **Wave 40** in Server Cathedral.
- **First post-game run:** Sandstorm Expanse at **Waves 41–50**, ending with an elite assault rather than a new boss.
- **Proposed second post-game run:** Floodgate Continuity at **Waves 51–71**, ending with the Greywater core shutdown.
- **Implemented Wave 72 climax:** Blackout Cistern, an enormous melee-and-drone swarm commanded by one Swarm Warden.
- Waves 36–39 form the final gauntlet and Wave 40 now routes directly into the arena-centered Algorithm encounter.
