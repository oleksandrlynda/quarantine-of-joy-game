## UI & HUD

### HUD elements
- HP
- Ammo/Reserve (e.g., `30/60`)
- Score
- Mute toggle
- Center crosshair

### Flow panels
- Start panel: title, feature pills, Play/Retry buttons, quick control help
- Pointer lock: entering play hides the panel; unlocking shows retry
- Game over: on 0 HP, show retry and center panel

### Hype Meter (Combo) UI
- Combo timer bar near crosshair or HUD row
- Multiplier indicator with tiered color/state
- Shader‑driven feedback: chroma/bloom pulse at tier thresholds; brief flash on headshot
- Reward pips: subtle indicators that a micro‑reward is queued/granted (with icons for heal/mag/reserve)

### Saturation Meter & Toasts
- Placement: left of HP or beneath Hype; 5 tiers (Grey→Radiant) with color‑blind safe palette.
- Tooltip: shows district %, next tier threshold, and passive buffs.
- Toasts: brief banner when tier increases; show buff summary; respects Epilepsy‑safe mode (reduced bloom).

### Crowd Chants UI
- Prompt: small banner near crosshair with call‑and‑response line; 5s timer ring.
- Meter: thin progress ring indicating success conditions (Hype hold/headshots).
- Subtitles: chant lines styled with high contrast and outline; repetition cooldown indicator.

### Boss UI
- Boss health bar at top center with name and phase pips
- Weakpoint exposure icon/indicator when a window is open
- Telegraph cues: emissive pulse on boss cores, ground decals for beams/zones
 - Echo Hydraclone: show a small counter for remaining descendants (e.g., "Descendants: x12") while boss bar persists

#### Mixed Boss UI (late game)
- Bars: stacked mini boss bars (one per boss) or a tabbed plate; highlight the currently active boss.
- Active tag: small label near the active bar, e.g., "Aggro: Sanitizer"; color‑coded per boss.
- Switching: fade out old highlight, fade in new over ~400ms; play a short stinger.
- Phase pips: each bar keeps its own pips; disabled/greyed while not active.
- Readability: compress bars to avoid overlap with Hype Meter; hide casual enemy counters during heavy telegraphs.

#### Strike Adjudicator HUD
- Strike stack icons near boss bar with tooltip: each shows current debuff (e.g., −5% move) and Hype grace reduction.
- Purge Node cleanse: show a small progress ring when interacting/aiming; on cleanse, animate strike removal.
- Verdict windup: visible bar with sector slice telegraph; color ramps to warn; subtitles for callouts.

#### Hydraclone Readability Cues
- Coherence Window tag: on-screen text "Coherence Window: 3s" when multi-tag condition is primed.
- Clone highlight: subtle outline on eligible clones during window; fades when window ends.

### Codex UX
- Unlock toasts: on first encounter/kill, show codex unlock with icon and button hint.
- Entry point: Codex button in pause panel; per-entry spoiler gating by mission progress.
- Cross-links: bosses link to factions and missions; seeds link to arenas.

### Boss Alerts Banner
- Diegetic alert ribbon; contains Accept/Defer; 5s timer; defaults to Accept (unless accessibility setting changes behavior).

### Cinematics Skip Prompt
- Hold‑to‑skip hint with progress ring; on completion, quick recap card with 2–3 lines.

### Accessibility (Narrative Feedback)

### Enemy Telegraphs (New Types)
- Healer: green circular ground ring pulses around healer; ring opacity maps to pulse strength; optional subtle “+HP” ticks on allies in ring.
- Sniper: red laser line from Sniper head to player; 1.2–1.8s dwell; last 0.3s lock tone + thicker laser; brief muzzle flash on fire; optional vignette tick.
- Saturation alt palette for color‑blind modes; reduced bloom and flash intensity slider for meme blooms.
- Chant subtitle readability: larger font option, outline thickness control.

### Settings (in‑game)
- Mouse sensitivity, audio volume, FOV slider
- Toggle head‑bob
- Epilepsy‑safe mode: disable lightning flashes and reduce shader pulses

### Audio/Music Layers
- Combat music intensity rises with streak tiers; adds percussion and bass.
- Weather‑aware layers (rain hats, thunder sub rumbles); sidechain dip on thunder.

### Seed control
- Seed entry/toggle on start panel to enable deterministic arena layout


