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

## Roster (aligned to Story)
1) Commissioner Sanitizer (BoB Warden)
- Theme: Censorship fields and cleanup beams.
- Phase 1: Suppression Nodes (3) around arena reduce player FOV and regen; destroy nodes to drop armor.
- Attack Set: Sweeping disinfectant beam (line telegraph), pulse knockback, elite Shooter calls.
- Phase 2: Armor off; rapid beam bursts, turret pods spawn (limited). Weakpoint: head/core vents.
- Hazards: Sanitizer tiles that intermittently sizzle; safe gaps clearly visible.

2) Influencer Militia Captain + Ad Zeppelin Support
- Theme: Monetized chaos; area denial and crowd control.
- Phase 1: Captain strafes and marks ad zones; standing zones spawn ad‑traps (slow, then pop). Volley cones.
- Phase 2: Zeppelin arrives: periodic carpet‑style bomb runs; Captain gains shield while Zeppelin active.
- Mechanics: Shoot down Zeppelin pods to remove shield; then DPS Captain. Spawns Influencer minions.
- Hazards: Moving billboard walls (telegraphed path) that reconfigure cover once per phase.

3) Broodmaker (Memetic Swarm Queen)
- Theme: Spawns small adds and saturates space.
- Phase 1: Broodlings periodically spawn near player but capped; Broodmaker relocates and burrows briefly.
- Phase 2: Spawns Flyer Brood (low HP, fast); exposes dorsal weakpoint during lay cycle.
- Hazards: Goo puddles (slow fields) that decay over time; shooting puddles splashes and clears faster.

4) Algorithm Shard Avatar (Glitch Proxy)
- Theme: Trendstorm logic; patterns and mirrors.
- Phase 1: Rotating radial barrages with safe lanes; brief clone mirages (one is real—brighter emissive).
- Phase 2: Pattern switches on a beat; time‑dilation rings (player inside ring = slight slow‑mo buff).
- Hazards: Glitch beams orbit; ring timing telegraphed by audio.

Notes
- Later campaign boss “The Algorithm” proper is reserved for story; arcade uses this Shard variant.

5) Echo Hydraclone (Fractal Replicator)
- Theme: Algorithm glitch that forks upon defeat; fractal replication.
- Core Mechanic: On death, splits into smaller clones up to 3 generations, then ends.
- Generations and counts (performance‑safe):
  - Gen0 (Boss): scale 1.0, HP 1400. On death → spawns 6 Gen1 clones.
  - Gen1: scale 0.55, HP 120. On death → spawns 5 Gen2 clones.
  - Gen2: scale 0.35, HP 50. On death → spawns 4 Gen3 clones.
  - Gen3: scale 0.22, HP 20. No further splits.
- Spawn shape: radial ring with slight height offsets; knockback pulse on split to clear space.
- Behavior: Each subsequent generation moves faster but hits lighter. Swarm bias toward surrounding the player; basic melee contact damage only.
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
  - Implement first boss: Commissioner Sanitizer (nodes + beam), minimal hazards to start.
- Hooks
  - UI: boss health bar, phase pips, boss name.
  - Effects: telegraph shaders (head/core emissive), ground decals.
  - Audio: beam windup, phase stingers.
- Milestones
  1) Sanitizer MVP (no hazards, basic beam + nodes) → 2) Add hazards and add‑spawns → 3) Captain+Zeppelin → 4) Broodmaker → 5) Shard Avatar.
