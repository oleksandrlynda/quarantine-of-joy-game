# Story Documentation

This folder contains the narrative documentation for the project: high-level story goals, character and faction sheets, mission briefs, timelines, and dialogue conventions. Keep these docs spoiler-aware and focused on actionable guidance for design, art, audio, and gameplay.

## Structure
- `overview.md`: High-level premise, tone, themes, pillars, spoiler-free synopsis
- `characters.md`: Protagonists, allies, antagonists, NPC sheets
- `factions.md`: Groups/organizations, goals, conflicts, aesthetics
- `locations.md`: Key places/biomes with gameplay and art hooks
- `missions.md`: Mission/level briefs with narrative beats and gameplay goals
- `timeline.md`: Major events and act structure across the experience
- `dialogue.md`: Conventions and samples for in-game lines, barks, and briefs
- `proposals.md`: Big-ticket cinematic beats and systems to elevate epic scale
- `bible.md`: Production narrative bible—logline, pillars, world, cast, beats, tone, risks
- `store.md`: Store page copy—hook, descriptions, features, trailer outline, SEO
- `endings.md`: Detailed endings, conditions, epilogues, and stingers
- `sidequests.md`: Optional missions with narrative hooks and systemic rewards
- `codex.md`: Lore index with unlock rules and cross‑refs

## Guidelines
- Be concise, design-facing, and spoiler-aware in filenames and headings
- Use consistent terminology with `docs/gamedesign`
- Prefer bullet lists and tables over long prose for quick scanning
- Link cross-file references (e.g., character -> faction, mission -> location)
- When adding spoilers, gate them behind a clear "Spoilers" section

## Versioning
- Use semantic headers (H2/H3) and keep changes scoped
- Note breaking narrative changes in a "Changelog" section at file end

## Runtime Delivery
- `src/story-campaign.js` maps Waves 1–72 to eight campaign districts and five post-campaign chapters.
- Each district/chapter provides `arrival`, `turn`, and `resolve` beats where applicable, with scoped ambient transmissions in both `story_en.json` and `story_uk.json`.
- Ambient transmissions must declare `"pool": "ambient"` and their district id. Boss tickers are deliberately excluded from this pool.
- Runtime facts may select short memory beats after a district victory; these must remain cosmetic and must not mutate combat state.
- Post-campaign dialogue may reflect the Wave 40 `free`/`reset` ending, but may not change encounter logic or invalidate that ending.
- Wave 72 uses a four-card epilogue sequence. The run-complete callback fires only after the player acknowledges the final card.
- Source localization keys such as `#intro_01` are retained in data and stripped by the story renderer before display.
