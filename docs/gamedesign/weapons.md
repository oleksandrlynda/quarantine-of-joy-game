# Weapons Progression Plan

This document refines mechanics.md slots and offers into concrete rules, UI, and implementation steps.

## Loadout & Slots
- Slots: Primary (key 1) and Sidearm (key 5). Start kit: Rifle + Pistol.
- Sidearm is permanent during a run (cannot be dropped). Primary can be swapped.

## Unlocks (persistent)
- Unlock table (saved locally):
  - SMG: reach Wave ≥3 once
  - Shotgun: reach Wave ≥4 once
  - DMR: reach Wave ≥6 once

## Armory Offers (per run)
- Timing: end of even waves starting at Wave 2. If you swapped on the previous offer, the next offer is skipped (no back‑to‑back swaps).
- Flow: present 2 random weapons from unlocked pool excluding current Primary. Choose 1 to replace Primary, or Decline.
- Decline bonus: +20% reserve to current Primary (clamped by soft cap per weapon).
- Reserve conversion on swap: newReserve = floor(0.5 × oldReserve) + defaultReserve(newWeapon). Magazine refills to full on swap.

## Weapon Crates (drops)
- Starting Wave 3: rare drop (≈5% base, pity +1%/miss, cap 1 per wave). Opening crate spawns a single weapon choice to replace Primary, same reserve conversion rule.

## Economy Rules
- Ammo pickups always add to the equipped weapon's reserve.
- Reload draws only from that reserve; never negative, clamp to mag size.
- Soft reserve caps by weapon (for future tuning): Rifle 300, SMG 360, Shotgun 60, DMR 120, Pistol 120.

## Boss Rewards
- On boss defeat: choose one
  - Refine Primary: one of two small, weapon‑specific buffs (e.g., +10% mag, −8% bloom, +10% falloff).
  - New Primary: swap to a random unlocked Primary with 1.25× default reserve.

## UI
- HUD shows current Primary name and ammo; offer banner: "Armory Offer (F) – Choose 1 of 2".
- Simple selection modal: weapon name + short blurb + icon.

## Implementation Steps
1) Add `Unlocks` local save and helper (check/update).
2) Add `OfferSystem` with schedule and skip logic; modal UI; integrate with `WeaponSystem.switchSlot`.
3) Implement reserve conversion and decline bonus in `WeaponSystem` (already partially present: onAmmoPickup and reload rules).
4) Add crate pickup type that triggers a single‑weapon offer.
5) Hook boss rewards: on boss death, invoke OfferSystem with special rules.

## Acceptance
- Player starts with Rifle + Pistol; only Primary changes.
- Offers appear per schedule; no back‑to‑back swaps after accepting one.
- Reserve conversion works; decline yields +20% reserve (clamped).
- Ammo economy respects per‑weapon reserves; no negatives or overfills.

# Weapons Progression

## Slots and Starting Kit
- Two slots: Primary (slot 1) and Sidearm (slot 2).
- Start each run with Rifle (Primary, key 1) + Pistol (Sidearm, key 2).
- Sidearm is permanent (cannot be dropped); Primary can be swapped.

## Unlocks (Persistent)
- Reach Wave 3 once → unlock Shotgun.
- Reach Wave 5 once → unlock SMG.
- Reach Wave 10 once → unlock DMR.
- Unlocks saved locally; future runs roll unlocked weapons in offers/drops.

## Per‑Run Acquisition
- Armory Offer after waves 2, 4, 6, 8, …
  - Present 2 random weapons from unlocked pool (excluding current Primary archetype).
  - Choose 1 to replace Primary; Decline → +ammo top‑up for current Primary (default +20% reserve, clamped by soft‑cap).
  - Guardrail: if you swapped on the previous offer, skip the next scheduled offer (no back‑to‑back swaps).
- Rare Weapon Crate (enemy drop)
  - Starts at Wave 3. Base drop ~5% per wave; pity +1%/miss; cap 1 crate per wave.
  - Opening spawns 1 weapon from unlocked pool for Primary swap (same conversion rule).

## Ammo Economy
- Reserves are per‑weapon.
- On swap: carry over floor(50% of previous Primary’s reserve) + new weapon’s default reserve.
- Ammo pickups always feed the currently equipped weapon’s reserve.

## Boss Rewards (every 5th wave)
- Choose one smaller bonus:
  - "Refine Primary" (minor per‑run buff; pick 1 of 2): +5% magazine OR −5% bloom OR +7% falloff range.
  - "New Primary" (reroll with modest reserve): one choice; initial reserve = 1.25× default.
- Guardrails: do not offer the same refine twice in a row; no stacking beyond +10% mag / −10% bloom / +15% falloff in a run.

## Input and HUD
- Keys: 1 = Primary, 2 = Sidearm.
- HUD: show Primary name + icon; Sidearm icon smaller/dimmed.
- Offer banner: “Armory Offer — press F” (compact, 10s timeout).
- Crate prompt: “Weapon Crate — press E to open.”

## Tuning Defaults
- Offer schedule: even waves starting at 2.
- Decline top‑up: +20% of current reserve (clamped by soft‑cap in `mechanics.md`).
- Swap conversion: floor(0.5 × old reserve) + new default reserve.
- Crate pity: +1%/wave without crate; reset on open; cap 1 per wave.
- Boss “New Primary” reserve: 1.25× default; “Refine” caps as above.
