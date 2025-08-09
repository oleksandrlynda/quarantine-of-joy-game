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
- Fire rate: 1 shot every ~120 ms (~500 RPM)
- Magazine: 30; Reserve: 60; `R` fills mag up to 30 from reserve
- Damage: 40 body, 100 headshot; headshots add extra score
- Visuals: tracer line + impact spark; slight enemy pushback on hit


