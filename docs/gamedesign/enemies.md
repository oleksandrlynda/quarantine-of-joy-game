## Enemies & AI

### Block bots
- Shape: box body + box head (head is a distinct hit zone)
- Health: 100 HP
- Speed: 2.4–3.2 units/s (randomized per spawn)
- Spawn: random positions across roughly a 60×60 interior region

### Waves
- Initial wave size: `3 + currentWave`
- Clearing all enemies increments the wave and immediately spawns the next

### Behavior
- Pursue the player when within ~40 units (flat‑ground chase)
- Deal damage when closer than ~2.1 units: ~15 DPS (continuous while in range)
- On lethal damage taken, removed from scene; progression continues

### Scoring
- Kill: +100
- Headshot kill: +150


