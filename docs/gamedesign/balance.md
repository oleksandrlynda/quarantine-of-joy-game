# Balance Targets & Calculations

Purpose: define numeric targets and simple models to keep pacing, difficulty, and economy stable across waves and bosses. Numbers align with defaults in `mechanics.md` and encounter rules in `bosses.md`.

## KPIs (launch targets)
- Average wave duration (mid‑game waves 5–12): 90–120s
- Kills per minute (KPM): 12–18 (Standard difficulty)
- Hype Meter uptime (Tier ≥1): 45–55%
- Boss encounter duration (single boss): 20–40s at waves 5–10; mixed 2‑boss: 60–80s total
- Death rate per run (Standard): median wave reached 10–14 for new players; 18–22 for skilled

## Player baseline (Rifle)
- Damage: 40 body / 100 head
- Fire cap: ~8.33 shots/s (120 ms)
- Theoretical body DPS: ~333
- Practical DPS assumption (accuracy, movement, target switch): ~50% → ~166 DPS
- Magazine: 30; reloads in gaps (economy covered below)

## Enemy intended TTK (Standard)
- Grunt 100 HP → 3 body shots (0.36–0.48s practical), 1 headshot
- Rusher 60 HP → 2 body (≈0.24–0.36s), 1 headshot
- Shooter 80 HP → 2 body (≈0.24–0.36s) if in LOS windows
- Tank 220 HP → 6 body (≈0.9–1.2s practical)
- Flyer 40 HP → 1 body (snap targets)

Notes: Above assume live fire windows and minor aim time; keep rushers lethal via density and angles, not HP spikes.

## Wave pacing model
- Size: `count = 3 + wave`
- Composition unlocks: Rusher≥3, Shooter≥4, Flyer≥5, Tank≥6 (see `enemies.md`)
- Spawn cadence: trickle spawns chunked into 3–4 bursts per wave, 1–2 enemies every 6–10s in between
- Target wave duration (Standard):
  - Waves 1–3: 45–75s (onboarding)
  - Waves 4–8: 90–120s
  - Waves 9–14: 100–130s (add density slightly)
  - Post‑14: keep within 120–150s; introduce modifiers for variety, not raw HP bloat

## Ammo economy (Rifle)
- Consumption at cap: 8.33 rps × 40 dmg = 333 dps; practical ~166 dps ⇒ ~4.15 shots/s
- Per minute fired (practical): ~250 shots → ~8.3 magazines
- Micro‑rewards rotation: magazine top‑ups ≈10% mag (Rifle +3) every tier‑up/milestone
- Drops (per kill, capped): Ammo 10–15% chance, +15–30 reserve; soft‑cap reserve 300
- Sustain goal: under average aim, player rarely hard‑starves; reserve fluctuates 90–240 in mid‑game

Recommended guardrails
- Reduce drop chance by 25% while Hype tier ≥3 to avoid runaway snowball
- During boss phases: halve reserve refresh micro‑reward (already specified)

## Health attrition
- Contact damage target: ~15 DPS if pinned; design separation and flanks to create 0.5–1.5s contact windows
- Shooter projectile: ~14 damage per hit; fire every 1.3–1.6s; dodgeable via strafes
- Medkits: 8–10% chance per kill, +20–35 HP; chant success grants brief stun to help recover
- Sustain goal: HP trends downward unless Hype uptime is maintained; no infinite face‑tank loops

## Boss balance
- Baselines (waves 5–10): 1400–1600 HP (see `bosses.md` per boss)
- Single boss TTK: 20–40s with add pressure; avoid unavoidable burst
- Add caps during boss: small adds ≤8; elites ≤3; casuals during boss ≤8 (late‑game ≤4–6 if mixed bosses)
- Mixed bosses (2‑boss launch cap): each boss HP ~70% baseline; total reward ~1.6× single boss
- Fail‑safe: if encounter >120s, trigger Phase Break (forced weakpoint window and add clear)

## Hype Meter (Combo) targets
- Thresholds: [2, 5, 9] actions to reach tiers 1–3; multipliers [×1.0, ×1.2, ×1.5, ×2.0]
- Uptime goal: 45–55% Tier ≥1 mid‑game; Tier 3 spikes but not sustained
- Micro‑rewards: min 4s between rewards; at most 1 queued; reserve refresh +100 (halved during bosses)

## Weather & modifiers impact
- Rain: −20% enemy aggro distance; net safety ↑; compensate by slightly higher spawn cadence (−5% intervals)
- Snow: −10% enemy ground speed; compensate with +1 Shooter per wave after wave 6 when Snow active
- Thunder: brief 0.15s stagger on basic enemies during flashes; ensure boss telegraphs are unaffected

## Difficulty bands (multipliers)
- Story/Easy: enemy damage ×0.75, add caps −20%, wave size −1, boss HP −20%
- Standard: baseline
- Elite: enemy damage ×1.25, add caps +20%, wave size +1, boss HP +15%, Hype decay −0.5s

## Testing seeds (for QA and tuning)
- S‑Arcade‑01: clear weather, standard arena; target KPM 15 ±3
- S‑Rain‑02: heavy rain cycle; verify Rain compensations
- S‑Boss‑03: boss‑focused run; verify 20–40s single boss TTK and Phase Break at 120s

## Change control
- All numeric edits mirrored in `mechanics.md` Tuning Constants
- Annotate balance changes with date and seed used for validation

