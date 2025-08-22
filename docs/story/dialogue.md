# Dialogue Conventions

## Formatting
- Speaker in ALL CAPS; actions in [brackets]
- Tags: `@bark`, `@brief`, `@mid`, `@fail`, `@exfil`, `@fun`

## Samples
MOD: City says laughter is a hazard. Let’s be hazardous. @brief
COURIER: Copy. Delivering joy, express shipping. @brief
GLITCHCAT: Warning: incoming meh. Applying spice. @bark
SANITIZER: Citizens: unauthorized mirth will be contained. @mid
BRANDFATHER: Smile wider—now buy it. @mid
ALGORITHM: Directive conflict: entertain vs suppress. Request resolution. @mid

[alarms rising]
COURIER: They muted the city. We’ll unmute it together. @bark
MOD: Node ahead—break it before they break our signal. @bark
GLITCHCAT: Dropping a punchline in three… two… meow. @fun

[Hydraclone encounter]
GLITCHCAT: Echo Hydraclone detected. Descendants counter live. Keep the tree pruned. @mid
MOD: Don’t get surrounded—break the core before it blooms. @bark
COURIER: One head becomes two? Good. Twice the audience. @fun

[Content Court]
ADJUDICATOR: Citation. Citation. Verdict pending. @mid
MOD: Purge Nodes up—clear your Strikes or that gavel will hurt. @bark
COURIER: Hung jury incoming. Someone start a chant. @fun

[Broodmaker]
GLITCHCAT: Brood pits detected. Puddles are gross—and explosive. @mid
MOD: Burn the goo, break the cycle. @bark
COURIER: Swarm’s got rhythm. Let’s change the beat. @fun

[failure]
SANITIZER: Laughter terminated. Resume productivity. @fail
COURIER: Okay, that joke didn’t land. Next take—louder. @fail

[exfil]
MOD: The crowd’s with us. Pull out before BoB regroups. @exfil
COURIER: Save your breath. We’ll need it for cheering. @exfil

## Alt Line Banks
- Low Health:
  - COURIER: I’m one bad punchline from blackout. @bark
  - MOD: Med station pinged—move! @bark
  - GLITCHCAT: Vitality meme needed. Applying cat tax. @fun
- Combo Up (Hype 3+):
  - COURIER: Feel that? The city’s laughing with us. @bark
  - MOD: Color wave incoming—ride it! @bark
  - GLITCHCAT: Saturation at thicc. Science term. @fun
- Objective Captured:
  - COURIER: Mic is ours. Speak freely. @bark
  - MOD: Clean handoff—next node marked. @brief
- Hydraclone Descendants Update:
  - GLITCHCAT: Descendants: {X}. Keep pruning. @mid
  - MOD: Cap is 36. Don’t feed the forest. @bark
  - COURIER: Less echo, more chorus. @fun

## Notes
- Keep lines short, readable over combat, and redundant with HUD cues
- Provide alternates for high‑repetition triggers (reloads, low health, objective captures)

## Localization Hooks
- Tag every string with `#loc_key` appended at the end of the line.
  - Format: `#<beat_id>_nn` where `beat_id` matches the narrative key and `nn` is a two‑digit index (e.g., `#boss_5_start_01`).
- Mark non‑translatable wordplay with `@nt` and provide at least one localized alt line.
- Counts: provide ≥2 alternates for barks; ≥1 alternate for event lines; VO sheets include speaker, timing, and trigger.
- Formatting: avoid embedding numbers; use placeholders (e.g., `{value}`) for dynamic content.

## VO Bank Targets (per language)
- Combat barks (per speaker): 10–12 per category to avoid fatigue
  - Low Health: 8–10
  - Combo Up (Hype 3+): 8–10
  - Objective Captured: 6–8
  - Hydraclone Descendants Update: 6–8
  - Content Court (Strikes/Cleanse): 8–10
  - Boss Intros/Outros (each boss): 6–8 intro, 4–6 outro
- Neutral chatter (hub/city): 12–16 lines per major district
- Localization: provide 2 alt lines for region‑specific idioms; avoid untranslatable puns in critical callouts

