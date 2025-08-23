## Core Mechanics

### Controls
- Move: `WASD`
- Aim: mouse
- Shoot: left click
- Reload: `R`
- Sprint: `Shift`
- Crouch: `Ctrl`
- Jump: `Space`
- Pause: `P`

### Core loop
1. Lock the mouse, start in the arena with a rifle.
2. Move, kite, and shoot to survive the current wave.
3. Manage ammo (30‑round mag, 60 reserve). Reload between gaps.
4. Clear all enemies to trigger the next wave. Repeat until downed.

### Player movement
- Base speed: 6 units/s; Sprint x1.6; Crouch x0.55
- Jump impulse: 7; Gravity: 20
- Camera FOV animates 75 → 82 while sprinting
- Collision vs. arena walls and crates; grounded detection allows jumping

### Combat (hitscan rifle)
- Fire mode: semi‑auto (one bullet per click)
- Fire rate cap: ~120 ms per shot (~500 RPM)
- Magazine: 30; Reserve: 60; `R` fills mag up to 30 from reserve
- Damage: 40 body, 100 headshot; headshots add extra score
- Visuals: tracer line + impact spark; slight enemy pushback on hit

### Weapons (planned variants)
- **SMG**: automatic, high ROF, lower per‑shot damage, strong recoil bloom
- **Shotgun**: pellet burst, heavy close‑range damage, severe falloff
- **DMR**: semi‑auto, slower ROF, high accuracy and damage per shot

### Pickups & drops
- Enemy drops with capped rates and soft pity timer
  - Ammo pack: restores 15–30 reserve ammo (10–15% drop chance, capped per wave)
  - Medkit: restores 20–35 HP (8–10% drop chance, capped per wave)
- Magnet radius: small auto‑pickup when within ~1.2 units
- Drop beacon VFX for visibility
- Tank enemies always drop 3–4 random pickups, ignoring caps

### Hype Meter (Combo)
- Base scoring: +100 kill, +150 headshot kill
- Time‑decay multiplier: actions refresh a short combo timer (e.g., 3–4s)
- Streak tiers: x1.2, x1.5, x2.0… unlock by sustained eliminations/accuracy
- End‑wave bonus: accuracy and remaining HP boost final tally

### Combo‑driven micro‑rewards
Small, frequent bonuses awarded at combo tier‑ups and periodic milestones to keep momentum.

- Triggers
  - Tier‑Up: On reaching a new combo tier (e.g., Tier 1 → 2 → 3 → …).
  - Milestones: Every N kills within a tier without dropping combo (default N=5).
- Reward Cycle (rotating so it stays readable and fair)
  1) Heal: add +5 HP initially; scales with progression (see scaling below).
  2) Magazine top‑up: add ammo directly to current magazine (amount depends on weapon).
  3) Reserve refresh: +100 reserve ammo (clamped by a soft cap).
- Scaling Modes
  - Linear (default): Heal amount increases stepwise every few rewards.
    - Sequence (example): +5, +5, +10, +10, +15, +15 … (cap at 100 HP).
  - Exponential (experimental): Heal grows slowly with tier index i: \(heal(i) = 5\cdot \lceil 1.5^{\lfloor i/3\rfloor} \rceil\), clamped to +25.
  - Reserve refresh remains fixed (+100) for predictability.
  - Magazine top‑up is per‑weapon (see table below).
- Per‑weapon magazine top‑up mapping
  - Rifle (baseline): +3
  - SMG: +5
  - Shotgun: +1 shell
  - DMR: +2
  - Future weapons: specify case‑by‑case; maintain roughly 10% of mag size as top‑up.
- Cooldowns & Limits
  - Minimum 4s between rewards; queue at most 1 pending reward if multiple triggers overlap.
  - No reward if HP already full for a Heal cycle; auto‑skip to next reward type.
  - Reserve soft cap to avoid hoarding (e.g., 300 for baseline rifle); excess is discarded.
- Anti‑exploit rules
  - Triggers only on valid enemy kills (no props), once per kill.
  - Taking damage does not cancel earned rewards, but dropping combo resets progress toward the next milestone.
  - Multi‑kill within 0.5s counts as multiple actions but yields at most one reward (respects cooldown).
- End‑wave conversion
  - When a wave ends, remaining combo time converts to a small score bonus, not a reward, to preserve pacing.

### Streak visuals (shader VFX)
- Subtle screen‑edge chroma pulse and bloom at higher tiers
- Tracer tint shifts with multiplier; headshot adds brief white flash
- Optional enemy outline glow shader during max streak tier

## Advanced Movement

### Stamina
- Sprint and jump consume stamina; stamina regenerates when not sprinting/jumping.
- Baseline: 100 stamina. Sprint cost ~12/s; Jump cost ~15; Regen 18/s after 0.5s delay.
- Low‑stamina penalties: reduced sprint speed; cannot jump below 15 stamina.

### Dash
- Short forward dash with ~0.25s duration and small iframes vs. touch damage.
- Cooldown: 6s; costs 35 stamina; cannot dash while airborne right after jumping.
- Input: double‑tap direction or a bound key (to be decided in settings).

### Slide
- Tap crouch while sprinting to slide; duration ~0.6s; lowers height; friction decays speed.
- Costs 20 stamina; short cooldown 2s to prevent spam.

### Air control
- Mild air‑accelerate to adjust trajectory mid‑air; capped to prevent bunny‑hop exploits.

## Wave Modifiers (between waves)
- After clearing a wave, present 2 random modifiers; pick 1 to apply for the next wave only.
- Examples:
  - Fragile Flyers: flyers −30% HP, +10% spawn rate
  - Thick Fog: fog density up; enemy aggro range −20%
  - Double Drops: +50% pickup drop chance, capped
  - Heavy Armor: tanks +20% HP, −10% speed
- Modifiers synergize with current weather affixes where applicable; sandstorm affix can amplify dust‑centric modifiers.

## Powerups (timed)
- Drop from enemies or appear as rare spawns. Duration 10–20s, one active at a time.
- Adrenaline: +20% move speed, −20% recoil/bloom, stamina regen +50%.
- Focus: brief 20% time dilation on each kill (cooldown 5s between procs).
- Overload: in rain/thunder, shots chain small lightning to nearby enemies.

## Scoring Depth & Leaderboards
- Precision ring bonus: rewards center‑mass/head proximity at range.
- Distance bonus: long‑range eliminations grant extra points.
- No‑damage wave bonus: survive a wave without taking damage for a multiplier.
- Daily Seeded Challenge: a daily seed with fixed modifiers; local leaderboard by score.

## Weapon Feel (juice)
- Recoil pattern tuning and camera view‑kick per shot.
- Micro FOV kick and quick recovery; muzzle flash; pooled impact decals.
- Crosshair bloom that scales with movement, fire rate, and SMG spray.

---

## Tuning Constants (Defaults)

Hype Meter
- Decay time: 3.5s base; +1.0s grace during boss phases
- Tier thresholds (actions to reach): [2, 5, 9]
- Multipliers by tier: [x1.0, x1.2, x1.5, x2.0]
- Milestone interval: 5 kills within current tier

Micro‑Rewards
- Rotation: Heal → Mag Top‑Up → Reserve Refresh (repeat)
- Heal scaling (linear): +5, +5, +10, +10, +15… (cap +25 per reward; never exceed 100 HP)
- Mag top‑ups: ≈10% of mag (Rifle +3, SMG +5, Shotgun +1 shell, DMR +2)
- Reserve refresh: +100; soft‑cap 300 (rifle baseline); excess discarded
- Cooldown: ≥4s between rewards; at most 1 queued
- Boss override: reserve refresh halved; decay grace applies

Boss Interactions
- Hype Meter grace: +1.0s during boss phases; reduced by Strike stacks (Adjudicator) −0.3s per stack.
- Rewards: guaranteed boss drop (medkit+ammo), powerup chance unchanged; micro‑rewards reserve refresh halved during boss phases.
- Mixed fights: non‑linear score reward scaling (≈1.6× for two bosses, ≈2.1× for three) to respect longer TTK and risk.

Combat Baselines
- Rifle: 30 mag, 60 reserve, 40 body / 100 headshot, ~500 RPM cap
- Enemy contact DPS: ~15 DPS; Shooter projectile: ~14 dmg
 - Healer aura: radius 6u; pulse every 3.5s; heals 12 HP/s for 2s; no boss heal; elites 50% effectiveness; strongest pulse only
 - Sniper shot: 60 dmg; laser telegraph 1.2–1.8s with 0.3s lock tone; projectile ~60 u/s; cooldown 3.5–4.5s; director staggers snipers

Wave & Spawn
- Wave size: 3 + currentWave
- Spawn min distance: 12 units; LOS bias to out‑of‑sight/occluded spots; ring preference edge→mid, legacy fallback

Weapons & Inputs
- Slots: Primary (1) and Sidearm (2); start kit Rifle + Pistol
- Offers: even waves starting at 2; no back‑to‑back swaps if you swapped last offer
- Swap conversion: floor(0.5 × old reserve) + new default reserve; decline top‑up +20% reserve (clamped)
- Boss weapon rewards: smaller bonuses — Refine (+5% mag / −5% bloom / +7% falloff, capped per run) or New Primary (1.25× reserve)

---

## Saturation System (Narrative Integration)
- Concept: district/world saturation reflects reclaimed joy; persists across sessions.
- Tiers & thresholds: T0 Grey (0%), T1 Hinted (15%), T2 Bloom (35%), T3 Vivid (60%), T4 Radiant (85%).
- Per‑tier buffs (lightweight):
  - T1: +2% Hype decay grace; T2: +5% pickup magnet radius; T3: +5% Hype multiplier effectiveness; T4: +1 free revive per run (Arcade only).
- Decay rules: no decay mid‑run; between runs, districts lose at most one tier per day if untouched.
- Persistence: save per district {tier, progress%}; global average used for title‑screen ambience.
- Interactions: Hype gains contribute +progress (capped per run); boss kills add bonus progress.

## Crowd Momentum & Chants
- Crowd spawns: when Saturation ≥ T2 and Hype ≥ Tier 2, spawn ambient crowd nodes at arena edges (cosmetic unless chant triggers).
- Chant windows: every 60–90s while Hype ≥ Tier 2; prompt lasts 5s.
- Success condition: maintain Hype above current tier for the window or land X headshots (X=3) within the window.
- Effects (on success): brief stun pulse on basic enemies (0.6s), +5% score for 10s, cosmetic crowd VO line; 45s cooldown.
- Anti‑repetition: do not trigger the same chant type twice in a row; at most 3 chants per 10 minutes.

## Optional Boss Alerts (Flow)
- Timing: 30s before a scheduled boss wave, show an Alert to opt in now or defer 1 wave.
- Accept: enter boss encounter next wave; Defer: increase next non‑boss wave size by +20% and improve drop rates slightly.
- Timeout: default to Accept on timer end (5s) unless Epilepsy‑safe mode forces Defer.

## Cinematics: Triggers & Skips
- Triggers: first district reclaimed (T2), first boss intro/outro, finale broadcast.
- Skips: hold‑to‑skip (1.5s) with confirmation; on skip, show a recap card (2–3 lines) and any rewards earned.
- Replay: unlocked cinematics viewable from Codex.

## Progression Persistence (Narrative)
- Save: {districtSaturation[], sidequestFlags, endingState}.
- Post‑game gates: certain events require Radiant (T4) in at least N districts or a specific endingState.
- Daily reset: none; only slow decay and new Daily Seed.

## Localization Requirements (Narrative)
- All narrative text tagged with #loc_key; non‑translatable jokes flagged with @nt and supplied with alt lines.
- Provide at least 2 alternates for high‑frequency barks and 1 alt for event VO lines.


