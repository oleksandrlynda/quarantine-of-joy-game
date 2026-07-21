# Boss Design (Story‑Aligned)

## Cadence & Scaling
- Encounter: Every 5th wave replaces a normal wave with a boss fight.
- Health scaling: base HP × (1 + 0.25 × floor(wave/5)). Damage and add‑spawn cadence scale mildly.
- Arena: May enable temporary hazards unique to each boss phase (telegraphed and dodgeable).
 - Late waves: Mixed boss encounters unlock (see below) with strict caps and alternating attack windows.

## Core Systems
- Phases: 2–3 phases with armor breaks, behavior changes, and brief stagger windows.
- Telegraphs: Clear windups (shader glow, sound cue); weakpoints expose during windows.
- Adds: Some bosses spawn minions (Gruntlings 10–30 HP, Flyers, or Shooters) with caps.
- Weather hooks: Rain reduces vision (ranged), Snow slows ground bosses, Thunder can briefly stagger minions.
 - Hype Meter interactions: +1.0s decay grace during boss phases; reserve refresh micro‑reward halved.
 - Mixed Boss Encounters (late game):
   - Start at Wave 20: possibility of 2‑boss fights; Wave 30+: rare 3‑boss fights.
   - Alternating Aggro: only one boss is “active” at a time (10–14s window); others enter telegraph/idle phases to keep fairness.
   - Global Caps: total on‑field hostiles (bosses + adds + casuals) ≤ 24; add spawners throttle when close to cap.
   - Composition Rules: prefer complementary kits (e.g., Sanitizer + Broodmaker; Captain + Shard); avoid overlapping beam/volley spam.
   - Fail‑safe: if fight drags >120s, bosses synchronize a brief “phase break” to open DPS windows and clear some adds.

## Automated Behavior Validation

The latest full schema-v3 boss-reaction run (2026-07-19, deterministic seed `0xb055c0de`, 60 Hz simulation at 8x) completed 51 scenarios with **49 passes, 1 warning, 1 failure, no errors, and no interruptions**. A report is healthy only when every applicable scenario passes; warnings and unexercised opportunities must not be presented as healthy.

Current behavior verdicts:

| Boss | Status | Diagnostic evidence |
|---|---|---|
| Broodmaker | Healthy | Six brood bodies formed the intended screen, with a 1.0 between-boss-and-player placement ratio. |
| Commissioner Sanitizer | Needs tuning | Two beam releases dealt no direct boss damage to the stationary target; summoned Tanks dealt all 116 damage. In the cover case, movement was blocked for 31.2% of samples, primarily by Suppression Nodes. |
| Influencer Captain | Healthy | Range recovery, projectile obstruction, cover response, and phase behavior passed. |
| Algorithm Shard Avatar | Needs fix | One `shard_barrage` projectile dealt 12 damage while world LOS was blocked. The boss was movement-blocked for 68.6% of the cover case, including 742 consecutive ticks. |
| Broodmaker Prime | Healthy | Eight brood bodies formed a complete screen and ten auxiliaries remained within the encounter cap. |
| Echo Hydraclone | Healthy | Sustained melee pressure produced no boss-player body penetration; collision-safe player correction remained active. |
| Strike Adjudicator | Healthy | Three Citations created six mines, two Verdicts resolved, and no mine-owned movement block was recorded. |
| The Algorithm | Healthy | Anchor positioning, objective gates, phase changes, cover response, and recovery passed. |

Required follow-up for Shard:

- Use a radius-aware swept projectile collision test and record projectile origin, previous position, impact position, and world-path result with damage attribution.
- Mirages are deceptive visuals, not tactical body blockers. They must not trap their owner; either make them non-solid to Shard or exclude same-owner mirages from its movement solver.
- When a direct corridor remains blocked, Shard must choose and commit to a flank or stable firing anchor instead of pressing into the obstruction.
- The diagnostic must fail prolonged world/ally movement obstruction even when attack cadence continues. The 16 m-wide cover fixture exposed a 12.4-second navigation stall that the summary otherwise omitted.

Required follow-up for Sanitizer:

- Verify that a stationary target inside the 13–22 m working band can be hit by the beam sweep without relying on summoned units for all damage.
- Attribute Suppression Nodes to their boss owner in blocker telemetry and warn on sustained node obstruction.
- Preserve navigation clearance through the 12 m node ring; arena size or empty floor must not be used to hide a routing problem.

## Roster (aligned to Story)
1) Commissioner Sanitizer (BoB Warden)
- Theme: Censorship fields and cleanup beams.
- Phase 1: Suppression Nodes (3) around arena reduce player FOV and regen; destroy nodes to drop armor.
- Attack Set: Sweeping disinfectant beam (line telegraph), pulse knockback, target-reacquiring jump shockwave, elite Shooter calls.
- Phase 2: Armor off; rapid beam bursts, turret pods spawn (limited). Weakpoint: head/core vents.
- Hazards: Sanitizer tiles that intermittently sizzle; safe gaps clearly visible.

2) Influencer Militia Captain + Ad Zeppelin Support
- Theme: Monetized chaos; area denial and crowd control.
- Phase 1: Captain strafes and marks red-orange ad zones with a 1.35s shrinking-ring fuse. The SMG uses an aim-line windup followed by visible traveling fan bolts; damage occurs only when a bolt visibly connects. After 10-20 completed volley cycles, Captain launches one heavy rocket that splits into eight telegraphed clusters across a 20 m radius.
- Phase 2 (60% HP): Zeppelin arrives and the Captain gains a visible cyan shield locked at transition health. Three attached engine pods are the shield objective and their remaining count appears in the phase label.
- Mechanics: Shoot down the three cyan engine-generator pods mounted directly into the Zeppelin belly to remove the shield; destroyed generators visibly detach and fall. While generators remain, the Zeppelin performs a one-second turnaround at each arena edge rather than snapping direction. Destroying the final generator makes it immediately climb toward the nearest exit and despawn; then DPS Captain. Spawns Influencer minions.
- Hazards: Ad zones and the rare eight-cluster rocket are Captain-owned ground markers. The rocket is suppressed whenever Zeppelin support is active, and the Zeppelin adds no duplicate floor bombs, keeping the shield objective readable.

3) Broodmaker (Memetic Swarm Queen)
- Theme: Spawns small adds and saturates space.
- Phase 1: Broodlings periodically spawn near player but capped; Broodmaker relocates and burrows briefly.
- Phase 2: Spawns Flyer Brood (low HP, fast); exposes dorsal weakpoint during lay cycle.
- Hazards: Heavy Broodmaker's Phase 2 goo becomes a toxic 3.2 m field (42% slow, 6 DPS) that decays over time; shooting puddles splashes and clears faster. Light Broodmaker remains unchanged.

4) Algorithm Shard Avatar (Glitch Proxy)
- Theme: Trendstorm logic; patterns and mirrors.
- Phase 1: Rotating radial barrages with safe lanes; brief clone mirages (one is real—brighter emissive).
- Phase 2: Pattern switches on a beat; time‑dilation rings (player inside ring = slight slow‑mo buff).
- Hazards: Glitch beams orbit; ring timing telegraphed by audio.

Notes
- The Algorithm is the implemented campaign finale at Wave 40 in Server Cathedral. Its Control nodes, off-beat Paradox echoes, rotating eye beam, and add-free Coherence Collapse complete the playable boss sequence after the Strike Adjudicator at Wave 35.

5) Echo Hydraclone (Fractal Replicator)
- Theme: Algorithm glitch that fractures under sustained fire, then forks upon defeat.
- Core Mechanic: The Gen0 core sheds two Gen2 echoes at 70% and 35% HP. On death, every combat clone splits into the next generation, up to Gen3. The boss encounter, music, HUD, and rewards remain active until the complete lineage and its spawn queue are cleared.
- Generations and counts (performance‑safe):
  - Gen0 (Boss): scale 1.0, HP 12000. On death → spawns 4 Gen1 clones.
  - Gen1: scale 0.55, HP 1600. On death → spawns 3 Gen2 clones.
  - Gen2: scale 0.35, HP 650. On death → spawns 2 Gen3 clones.
  - Gen3: scale 0.22, HP 250. No further splits.
- Durability target: 36800 total lineage HP when both core fracture waves trigger, distributed across 53 enemies over the full encounter. Area damage remains the intended counterplay.
- Spawn shape: radial ring with slight height offsets; knockback pulse on split to clear space.
- Behavior: Each subsequent generation moves faster but hits lighter. The lineage surrounds the player, then commits to generation-scaled haymakers with a clear arm windup, impact beat, and recovery. Core fractures and mirror echoes use a visible two-arm replication cast; temporary echoes materialize in separated lanes before retracing the player's recent path as damaging dash attacks.
- Caps & fairness:
  - Global active clone cap: 36 (excess spawns queue and trickle in every 0.25s).
  - Score and micro‑rewards: diminishing returns by generation (see Scoring & Rewards).
  - Boss bar persists until all descendants are defeated; show a small “Descendants: xN” counter.
  - Anti‑cheese: despawn timer on Gen3 if kited too far for >20s; no spawns inside player safe radius.

6) Strike Adjudicator (Content Court)
- Theme: Moderation tribunal that issues "Strikes"; player must cleanse to avoid a Verdict.
- Phase 1 (Citations): Every ~12s, applies 1 Strike (stacking up to 3). Spawns 2 Purge Nodes; destroying a node removes 1 Strike.
  - Each active Strike mildly hampers the player (−5% move each, max −15%) and shrinks Hype grace by −0.3s each.
  - If the player reaches 3 Strikes when the next Verdict triggers, the slam deals heavy damage but also auto‑spawns extra nodes for recovery.
- Phase 2 (Verdict): Alternating sector slams (pie slices) and frontal gavel smashes with clear floor decals.
  - Purge Nodes become Bailiffs (slow movers) that attempt to body‑block; destroying them still removes Strikes.
- Stats: HP 1500 baseline; low add spawns (prefers Rushers). Weakpoint windows during post‑verdict recovery.

- Adjudicator direct damage: Citation Mines deal 30 damage in Phase 1 and 44 in Phase 2; sector Verdicts deal 42/72 normal/heavy and gavel Verdicts deal 50/82. Bailiff damage is unchanged.

## Stats (initial targets)
- HP baselines: Sanitizer 1600, Captain 1400 (+Zeppelin pods HP 250 each), Broodmaker 1500, Shard 1500.
- Damage: Avoid burst kills; design for 20–40s time‑to‑kill per boss at early tiers.
- Add caps: 8 active small adds; 3 elite adds.
 - Mixed fights: for 2‑boss, reduce each boss HP to ~70% baseline; for 3‑boss, ~55% each. Add caps reduced by 25%.

## Scoring & Rewards
- Boss kill bonus: +1000; phase breaks +150; add kills standard.
- No‑damage boss bonus: +1.25× multiplier for next wave.
- Drop: Guaranteed ammo+medkit; chance for temporary powerup.
 - Hydraclone diminishing returns: Gen0 100%, Gen1 40%, Gen2 20%, Gen3 10% of normal kill score and Hype gains (to prevent inflation).
 - Mixed fights: total reward equals ~1.6× (two bosses) or ~2.1× (three bosses) of a single boss, not linear, to respect time‑to‑kill and risk.

## UI/UX
- Boss bar at top with name and phase pips; weakpoint exposure icon when active.
- Telegraph VFX: emissive pulse color per attack type; ground decals for hazards.
- Audio motifs per boss; dynamic layers tie to phases and streaks.
 - Mixed fights: stacked mini boss bars or tabbed nameplate indicating the currently active boss; subtle “Aggro: BossName” tag.

## Boss Encounter Director (spec)
- States: Intro → AggroWindow(activeBoss 10–14s) → Switch(telegraph 4–6s) → AggroWindow(nextBoss) → … until all bosses dead.
- Global cap enforcement: total hostiles (bosses + adds + casuals) ≤ 24; add spawners throttle or pause during heavy telegraphs.
- HP scaling and caps: see Stats; also reduce add trickle by ~25% during multi‑boss.
- Fail‑safe: if encounter >120s, trigger Phase Break (all bosses expose weakpoints for 6s, clear some adds).
- Weather/modifier policy: Only LOS/visibility modifiers affect bosses directly; damage/HP modifiers do not.

### Mixed Pairing Examples
- Sanitizer + Broodmaker: beams + brood pressure; spawn Rushers only, no Flyers; alternate beam/lay cycles.
- Captain + Shard: area denial + pattern barrages; reduce volley density when Shard is active.

## Implementation Plan
- Data
  - Define `BossSpec` with name, hp, phases, spawnAdds, telegraphs, hazards.
- Code
  - Add `BossManager` (or extend `EnemyManager`) to handle boss waves: spawn boss, pause normal spawns, track HP via `root.userData.hp`, route hits, and signal next wave on death.
  - Create base class `BaseBoss` with `update(dt, ctx)`, `onHit(dmg, isWeakpoint)`, `onPhaseChange()`, `onRemoved()`.
  - Initial boss prototype: Commissioner Sanitizer (nodes + beam), minimal hazards to start. The campaign's first boss is the light Broodmaker at Relay District Wave 5.
- Hooks
  - UI: boss health bar, phase pips, boss name.
  - Effects: telegraph shaders (head/core emissive), ground decals.
  - Audio: beam windup, phase stingers.
- Milestones
  1) Sanitizer MVP (no hazards, basic beam + nodes) → 2) Add hazards and add‑spawns → 3) Captain+Zeppelin → 4) Broodmaker → 5) Shard Avatar.
