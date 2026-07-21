# Arena Obstacles & Cover

Goals: readable cover, movement choices, replayable layouts. Keep silhouettes simple; avoid unfair blockage; respect spawn fairness.

## Types

### 1) Destructible Objects
- Variants
  - Crate (HP 100): standard wood box; small chance to drop +ammo or +med.
  - Barricade (HP 180): wider cover; no drop; slower to destroy.
  - Explosive Barrel (HP 50): on destroy → 4.2-unit falloff blast, damages enemies and player, and chains into nearby destructibles; emissive warning label intensifies after a hit.
- Rules
  - Never spawn within 2 units of player start; avoid within 1 unit of walls to prevent stuck debris.
  - Drops: ≤ 1 per 6 destructions; boss waves guarantee no drops from destructibles.
- Scoring: +10 per destroy; +25 if multi‑kill via barrel.
- Authored campaign arenas place six barrels in collider-validated combat pockets: one close pair for chain reactions and four isolated tactical opportunities. They stay clear of the player start, spawn pads, and objective routes.

### 2) Maze Segments (Dynamic Cover)
- Purpose: vary sightlines each wave; create short flanks without dead‑ends.
- Coverage cap: max 20% of map walkable area (by AABB footprint). Enforce at generation.
- Generation
  - Grid cells (e.g., 6×6); place segments along cell edges; ensure ≥1.5 units corridor width.
  - Do not completely ring the center; keep at least two opposite lanes open.
  - Reconfigure per wave seed or every N waves (N=2) to improve variety.
- Fairness
  - Preserve spawn director LOS rules; do not spawn segments within 2 units of spawn ring points.
  - Maintain at least one valid path between any two arena quadrants.

### 3) Climbable Low Platforms
- Height: 0.6–1.2 units (jumpable with current stats). Use ramps for >0.8 to ensure accessibility.
- Purpose: vantage points and micro‑routes; avoid sniper nests dominating the arena.
- Rules
  - Place near walls or crates; never in the exact center; max 6 total.
  - Top surface size: 2×2 to 4×4 units; add rail blocks on edges facing voids.

### 4) Additional Proposals
- Sliding Doors (Timed): open/close on a rhythm; telegraphed by light strips; never close on the player.
- Pop‑Up Pillars: cover that raises/lowers every ~8s; simple sine timing; keeps combat pockets dynamic.
- Glass Panels (Shatterable): clear until cracked; on shatter → turns into debris; HP 40; no drops.
- Jump Pads (Low‑Power): bounce to 1.4–1.8 height; pairs well with low platforms; subtle decal.
- Shock Tiles (Weather‑Linked): during thunderstorms, some floor tiles intermittently zap for low damage; always telegraphed.
- Goo Puddles: slow fields spawned by Broodmaker or rare arena hazard; decay over ~20s; can be cleared by shooting (few shots).

## Placement Rules
- Safe radius: keep ≥3 units clear around player spawn; ≥1.5 units around wave spawn points.
- Pathing: ensure corridors ≥1.5 units wide; no enclosed cells without exits.
- LOS fairness: avoid long parallel walls that create corner peeks with no counter‑angle.
- Performance budgets
  - Destructibles ≤ 24; Maze segments ≤ 12 edges; Platforms ≤ 6; Dynamic elements (doors/pillars) ≤ 6.
  - Single material family per type; reuse geometries; pool debris.

## Interaction Notes
- Weather
  - Rain: slightly slick surfaces on glass; purely cosmetic unless enabled by affix.
  - Snow: climbable tops accumulate frost visuals; no gameplay change.
- Boss Waves
  - Disable reconfiguration mid‑boss; lock maze layout for clarity.
  - Explosive barrels remain active; reduced barrel spawn density near boss center.
  - Normal 1.5–1.8-unit corridors are not boss routes. Provide at least 7 units of clear width for a boss-only lane and 8 units when adds share it.
  - Keep at least 3–4 units clear between the boss route and the arena boundary. A full-height cover island must leave two bypasses; each boss-capable bypass follows the same 7–8-unit rule.
  - Limit full-height cover pieces to approximately 4–6 units of continuous width. A 16-unit diagnostic wall caused Shard to press against cover for 742 consecutive ticks instead of establishing a flank.
  - Boss-wave hard-cover coverage should remain within 15–20% of traversable floor. This is a ceiling, not a target; radial-pattern bosses may require less.
  - Mirages, telegraph-only projections, and non-physical decoys must never consume navigation clearance or body-block their owner.
  - Reserve open mechanic rings before placing props: Sanitizer Nodes at radius 12, Algorithm Nodes at radius 11, Sanitizer reinforcement pockets at radius 16–19, and Hydraclone split lanes around the player.
  - Cover cannot substitute for projectile collision. Every direct-line projectile still performs a swept world test before player damage is accepted.

## Metrics & Tuning
- Corridor width target: 1.8 units (min 1.5); sightline breaks every ~10–14 units.
- Coverage measurement: sum AABB footprints; exclude overlap with walls; clamp to 20% for maze.
- Seeds: obstacle generation tied to arena seed; show seed in HUD when enabled.

## Generation Pseudocode (Deterministic)

Assume arena bounds inner rectangle at x,z ∈ [−38, 38] with walls at ±40.

Inputs: `seed`, `grid=6`, `corridorMin=1.5`, `coverageMax=0.20` (20%)

1) Init RNG(seed). Build grid cells over inner bounds.
2) Maze segments along grid edges:
   - Shuffle all edge candidates. For each edge e:
     - Compute AABB footprint of a wall segment (thickness 1, height 2–3, length cell size).
     - Check corridor Min: ensure distance to parallel segment in same row/col ≥ corridorMin.
     - Check coverage: (currentFootprint + e.footprint) / walkableArea ≤ coverageMax.
     - Check fairness: not within 2 units of spawn ring points; preserves at least two opposite lanes open.
     - If all pass, place segment; update coverage.
3) Destructibles:
   - Sample up to N=24 positions; reject if within 2 units of player start or 1 unit of walls/segments.
   - Type weights: Crate 0.6, Barricade 0.3, Barrel 0.1; enforce ≤20% barrels.
4) Climbable platforms:
   - Place up to 6 near walls/crates; size 2–4; height 0.6–1.2; ensure jumpable (ramps for >0.8).
5) Dynamic elements (optional):
   - Doors/Pillars: at most 6 total; ensure no overlap with boss hazard telegraph zones.
6) Validate:
   - Flood‑fill pathing across quadrants; ensure connectivity.
   - LOS sampling from center to corners; ensure at least 2 broken sightlines per axis.
   - If validation fails, reroll last K placements (K≤8) with same seed offset.
