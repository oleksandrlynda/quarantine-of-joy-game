# Weapons Progression

This document refines mechanics.md slots and offers into concrete rules, UI, and implementation steps.

## Loadout & Slots
- Slots: Primary (key 1) and Sidearm (key 2). Start kit: Pistol only; SMG granted automatically at Wave 2.
- Sidearm is permanent during a run (cannot be dropped). Primary can be swapped.

## Unlocks (persistent)
- Unlock table (saved locally):
  - SMG: reach Wave ≥2 once
  - Shotgun: reach Wave ≥3 once
  - BeamSaber: reach Wave ≥3 once
  - Minigun: reach Wave ≥4 once
  - Rifle: reach Wave ≥6 once
  - DMR: reach Wave ≥11 once

## Armory Offers (per run)
- Early script:
  - Wave 2: auto-equip SMG as first Primary.
  - Wave 3: offer Shotgun vs SMG.
  - Wave 4: offer BeamSaber.
  - Wave 6: offer Rifle vs SMG.
  - Wave 8: offer Minigun.
  - Wave 11: offer Rifle vs DMR.
  - Wave 12: offer DMR vs BeamSaber.
- Normal cadence: end of even waves ≥6 afterward (respect swap cooldown).
- Swap cooldown: accepting an offer skips the next one (no back‑to‑back swaps). Declining does not.
- Flow: present 2 random weapons from unlocked pool excluding current Primary. Choose 1 to replace Primary, or Decline.
- Decline bonus: +20% reserve to current Primary (clamped by soft cap per weapon).
- Reserve conversion on swap: newReserve = floor(0.5 × oldReserve) + defaultReserve(newWeapon). Magazine refills to full on swap.

## Sidearm Offer
- Once per run at Wave ≥15, present sidearm choices excluding the current sidearm (Pistol, Grenade, BeamSaber).
- Sidearm swaps ignore the Armory swap cooldown and grant no decline bonus.

## Weapon Crates (drops)
- Starting Wave 3: rare drop (≈5% base, pity +1%/miss, cap 1 per wave).
  Opening crate spawns a single weapon choice to replace Primary, same reserve conversion rule.
- Crate swaps ignore the Armory swap cooldown; only accepting an Armory offer delays the next one.

## Economy Rules
- Ammo pickups always add to the equipped weapon's reserve.
- Reload draws only from that reserve; never negative, clamp to mag size.
- Soft reserve caps by weapon (for future tuning): Rifle 300, SMG 360, Shotgun 60, DMR 120, Minigun 600, Pistol 120, Grenade 24.

## Boss Rewards
- On boss defeat (every 5th wave): choose one
  - Refine Primary: one of two small, weapon‑specific buffs (e.g., +5% magazine, −5% bloom, +7% falloff range).
  - New Primary: swap to a random unlocked Primary with 1.25× default reserve.
- Guardrails: no repeat refine choices consecutively; refine bonuses cap at +10% magazine / −10% bloom / +15% falloff in a run.

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
- Player starts with only a Pistol; SMG arrives at Wave 2.
- Primary changes follow offer schedule; sidearm can change once via sidearm offer.
- Reserve conversion works; decline yields +20% reserve (clamped).
- Ammo economy respects per‑weapon reserves; no negatives or overfills.

See `weapon-tiers.md` for current balance ranking of available weapons.
