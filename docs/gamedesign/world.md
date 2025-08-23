## World & Weather

### Arena
- Floor: 80×80; enclosing walls height ~6
- Obstacles: ~18 crates placed at random sizes/positions
- Collision: player movement blocked by walls/crates via bounding boxes

### Visual atmosphere
- Fog: soft pastel tones for readability
- Sky: shader‑driven dome with sun disc and halo

### Dynamic weather
Auto‑cycles every ~20–45s among:
- **Clear**: default fog and lighting
- **Rain**: denser fog, dimmer light, fast streak particle system
- **Snow**: brightened fog, gentle flakes with drift
- **Sandstorm**: swirling dust, warm tint, reduced visibility

Subtle ambient loops fade with each mode — rain patter, howling wind, and hush snow.

Rain may trigger thunder:
- Occasional lightning point‑light near the player, brief flashes tint the directional light and sky
- Procedural thunder sound after a distance‑based delay

### Weather affixes (gameplay impact)
- **Rain**: enemy detection range reduced (e.g., ~20% shorter aggro distance)
- **Snow**: enemy ground speed reduced by ~10%
- **Sandstorm**: visibility reduced by ~25%; spawn +1 melee enemy per wave
- **Thunderstorm**: brief global flash can stagger basic enemies for ~0.15s
- Future affixes to consider: strong wind alters particle drift; overcast increases spawn density slightly; fog pockets reduce visibility locally

### Arena seeds
- Deterministic arena layout via seed input/toggle
- Curated seed list for repeatable challenge runs; display seed in HUD

### Spawn visualization (deferred)
- Keep current invisible spawns; no portals/denial fields for now.


