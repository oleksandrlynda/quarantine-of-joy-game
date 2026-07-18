## Enemies & AI

### Archetypes
- **Block Bot (Grunt)**: baseline melee pursuer.
  - Shape: box body + box head (separate head hit zone)
  - Health: 100 HP
  - Speed: 2.4–3.2 units/s (randomized)
  - Role: standard pressure and crowd formation

- **Rusher**: glass‑cannon charger.
  - Health: 60 HP; Speed: 3.4–4.2 units/s
  - Behavior: high priority to close distance; easier to stagger with shots

- **Tank**: slow, durable brawler.
  - Health: 220 HP; Speed: 1.6–2.0 units/s
  - Behavior: anchors waves; pushes player to relocate

- **Shooter (Ranged)**: keeps standoff distance and fires projectiles.
  - Health: 80 HP; Speed: 2.2–2.8 units/s
  - Behavior: strafes at ~12–18 units range; telegraphed shots (future system)

- **Flyer**: airborne harasser with very low HP.
  - Health: 40 HP (dies to one body shot; headshot also lethal)
  - Speed: 3.2–3.8 units/s; altitude 1.8–3.2 units; arcs/swoops
  - Behavior: dive near player and attempt touch damage; ignores ground obstacles

- **Healer (Support)**: sustains nearby enemies with a periodic AoE pulse.
  - Health: 90 HP; Speed: 2.2–2.6 units/s (keeps backline)
  - Heal aura: green ring pulse every 3.5s, radius ~6 units, heals 12 HP/s for 2s (total ~24), does not affect bosses or reduced 50% on elites.
  - Behavior: prioritizes staying behind cover and near clusters; retreats if alone; no direct damage.
  - Limits: at most 2 Healers active in early game (soft cap); pulses do not stack additively (strongest only).

- **Sniper (Marksman)**: high-damage ranged threat with long telegraph.
  - Health: 90 HP; Speed: 2.0–2.4 units/s (anchors at range 22–30 units)
  - Telegraph: red laser on player for 1.2–1.8s, lock tone on last 0.3s, then fires a fast projectile (≈60 u/s) for 60 damage; long cooldown 3.5–4.5s.
  - Behavior: repositions to maintain long sightlines; breaks aim when LOS is lost; avoids clumping with other snipers.
  - Limits: ≤1 Sniper before wave 8; ≤2 after wave 12; never more than 1 firing in the same 1s window (director staggers).

### Waves
- Initial wave size: `3 + currentWave`
- Composition scales by wave: introduces Rusher (W≥3), Shooter (W≥4), Tank (W≥6), Flyer (W≥5)
- Clearing all enemies increments the wave and immediately spawns the next
 - Healer unlocks at W≥7 (cap per notes); Sniper unlocks at W≥8 (staggered firing windows)

### Boss Waves (every 5th wave)
- Spawn a unique boss with abilities; clears gate the next set of waves.
- Examples:
  - **Broodmaker**: periodically spawns small Gruntlings (10–30 HP) near the player
  - **Volley Core**: fires radial spreads or rotating barrages at intervals
  - **Juggernaut**: armored segments; weak head/vents exposed during telegraphed windows
  - Each boss has a large health pool and telegraphs to remain fair
  
See `bosses.md` for detailed boss designs and implementation plan.

### Casual Enemies During Boss Fights (late game)
- Purpose: maintain pressure and keep target switching meaningful without overwhelming.
- Composition: mix of Grunts, a few Rushers, and occasional Shooters; Flyers used sparingly.
- Caps and pacing:
  - While a boss is active: on‑field casuals ≤ 8; spawn trickle 1–2 every 6–10s.
  - In mixed boss fights: reduce casual cap to 4–6 depending on number of bosses.
  - Pause spawns during large boss telegraphs to preserve readability.

### Boss Phases & Arena Hazards
- Multi‑phase fights: break armor, expose weak points, pattern changes per phase.
- Arena hazards (only during boss waves):
  - Storm tiles: intermittent electric floors during thunderstorms; telegraphed.
  - Rotating beams/lasers: gaps to dodge; damage encourages movement.
  - Portal geysers: temporary knock‑up columns that change positioning.

### Behavior (baseline)
- Pursue when within ~40 units (flat‑ground chase; fliers use 3D pursuit)
- Ground enemies step up obstacles up to 40% of their height (tanks 30%). They can chain-step successive rises within that limit but have no jump-assist for higher ledges.
- Deal damage when closer than ~2.1 units: ~15 DPS (continuous while in range)
- On lethal damage taken, removed from scene; progression continues

### Telegraphs & Weakpoints (evaluate)
- Consistent windups for melee and ranged attacks; visible glow on weak spots.
- Stagger windows after certain attacks or when struck at weak points.

### Scoring
- Kill: +100
- Headshot kill: +150
- Streak/combo multipliers apply (see mechanics)


