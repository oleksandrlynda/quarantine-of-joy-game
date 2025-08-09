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

Rain may trigger thunder:
- Occasional lightning point‑light near the player, brief flashes tint the directional light and sky
- Procedural thunder sound after a distance‑based delay


