# v0.1 Stabilization QA Plan

This document defines the stabilization contract for the current v0.1 browser build before larger feature work continues. The goal is to prove that the documented core loop is stable through a layered test strategy: fast unit tests, stubbed integration tests, static resource checks, and an optional browser smoke checklist.

## Product contracts for v0.1

- **Start and onboarding**: a run starts with the pistol-only courier kit; clearing Wave 1 auto-equips the SMG as the first primary while preserving Pistol as the sidearm.
- **Core loop**: lock mouse, move, shoot, survive a wave, receive guided progression, repeat until downed.
- **Run state**: HP, score, best score, combo tier/timer, game-over state, wave hooks, pickups, reset, and emergency ammo behavior remain deterministic and testable through `GameSession`.
- **Deterministic seedability**: gameplay systems that affect drops, progression choices, enemy spawn fallback, and boss timing accept injected RNGs and can be tested with sequence RNGs.
- **Persistence safety**: storage reads/writes tolerate missing, invalid, or throwing `localStorage` and preserve default object shapes.
- **Static entrypoints**: browser entrypoints, local assets, source imports, and level JSON files are checked before runtime smoke testing.

## Test levels

### 1. Unit tests

These tests should stay fast, deterministic, and runnable via `npm test`.

| Contract | Current coverage | Notes / gaps |
| --- | --- | --- |
| Seeded RNG helpers are deterministic and range helpers obey bounds. | `test/rng.test.js` | Covered. |
| Weapon ammo, fire delay, reload, reserve additions, and reset behavior work. | `test/weapon.test.js` | Covered for base `Weapon`. |
| Weapon-system onboarding starts pistol-only, Wave 2 grants SMG, slots preserve sidearm, and primary swap carryover is correct. | `test/weapon-system.test.js` | Covered. |
| Player stamina drains/regenerates and recoil settles. | `test/player.test.js` | Covered with minimal Three.js and DOM stubs. |
| Pickup economy covers wave reset, caps, pity, multi-drop, magnet pickup, and reset cleanup. | `test/pickups.test.js` | Covered. |
| Progression unlock persistence, deterministic offer selection, sidearm filtering, and decline ammo rewards. | `test/progression.test.js` | Covered. |
| Safe storage adapter handles missing/invalid/throwing storage and default merges. | `test/storage.test.js` | Covered. |
| Music primitives and library structure remain valid. | `test/music.test.js`, `test/musicLibrary.test.js` | Covered. |
| Pathfinding handles obstacles, caching, waypoints, and empty paths. | `test/path.test.js` | Covered. |

### 2. Stubbed integration tests

These tests use local stubs for browser, Three.js, scenes, and systems to verify behavior across module boundaries without launching the game.

| Contract | Current coverage | Notes / gaps |
| --- | --- | --- |
| Session damage, game-over, reset, pickup routing, wave hooks, and emergency ammo eligibility. | `test/game-state.test.js` | Covered. |
| Enemy manager spawn-area collision, custom spawn filtering, candidate preference, collider refresh, wave hooks, and reset cleanup. | `test/enemy-manager.test.js` | Covered. |
| Enemy spawn fallback is reproducible with injected RNG. | `test/enemy-spawn.test.js` | Covered. |
| Wave start and completion bookkeeping, achievement events, session wave hooks, HUD refresh, and wave toast notifications. | `test/wave-flow.test.js` | Covered through `src/game/wave-flow.js`; full browser offer-modal flow remains a manual smoke item. |
| Score/combo updates across lethal and non-lethal combat results, including headshots, combo multipliers, and weapon-specific reward values. | `test/combat-scoring.test.js` | Covered through `src/game/combat-scoring.js`; direct browser weapon-fire smoke remains manual. |

### 3. Static resource tests

These tests prevent broken deploys and invalid content references.

| Contract | Current coverage | Notes / gaps |
| --- | --- | --- |
| `index.html`, `editor.html`, `music_player.html`, and `test-*.html` reference existing local scripts, CSS, icons, levels, and assets. | `test/static-entrypoints.test.js` | Covered statically. |
| DOM IDs used by `src/main.js` exist in `index.html`, except explicit optional IDs. | `test/static-entrypoints.test.js` | Covered. |
| Local imports from `src/**/*.js` resolve after stripping cache-busting query strings such as `?v=2`. | `test/static-entrypoints.test.js` | Covered. |
| `assets/levels/*.json` parse and expose expected top-level structures. | `test/static-entrypoints.test.js` | Covered. |
| Network-style resource smoke for `index.html` core assets. | `test/resource-check.js`, run via `npm run resource-check` | Covered for `index.html`; static test covers broader HTML set. |
| i18n key availability between source usage and `i18n/*.json`. | Missing: add `test/i18n-keys.test.js`. | Should validate keys used through `t('...')`, `data-i18n`, and story files exist for supported locales. |

### 4. Optional browser smoke/manual checklist

Run this checklist before tagging a stabilized v0.1 build or before large gameplay changes. Use a local server such as `python -m http.server 8080` and test in a modern desktop browser.

- [ ] Load `index.html` without console errors.
- [ ] Start a run from the start panel.
- [ ] Confirm Wave 1 starts pistol-only.
- [ ] Move with `WASD`, sprint with `Shift`, jump with `Space`, crouch with `C`.
- [ ] Fire the pistol, reload, and observe ammo/HUD updates.
- [ ] Clear Wave 1 and confirm Wave 2 auto-equips SMG while preserving Pistol as sidearm.
- [ ] Switch between primary and sidearm with `1` and `2`.
- [ ] Collect an ammo pickup and a medkit; confirm HUD changes and pickup removal.
- [ ] Exhaust non-pistol ammo and confirm emergency ammo assistance can spawn when eligible.
- [ ] Take lethal damage, confirm game-over/start panel appears, then restart/reset.
- [ ] Open `music_player.html`, play/stop a track, adjust volume, and confirm no console errors.
- [ ] Open `editor.html` and confirm editor boot does not throw.
- [ ] Open `test-enemies.html`, `test-fight.html`, and `test-weather.html` if touching enemies, bosses, or weather.

## Stabilization gate

A change is acceptable for v0.1 stabilization when:

1. `npm test` passes.
2. `npm run lint` passes.
3. `npm run resource-check` passes.
4. Any changed product contract is reflected in `docs/gamedesign/*.md` or this QA plan.
5. For perceptible browser-facing changes, the manual smoke checklist sections relevant to the change are completed and notes are added to the PR.

## Missing tests to prioritize next

- `test/i18n-keys.test.js`: verify source and HTML localization keys exist in `i18n/en.json`, `i18n/uk.json`, and story locale files.
- Extend `test/wave-flow.test.js`: add offer pause/resume and next-wave continuation coverage if those paths move out of the browser-only main loop.
- Extend `test/combat-scoring.test.js`: add direct weapon/enemy-manager stubs when weapon hit resolution is further centralized.
