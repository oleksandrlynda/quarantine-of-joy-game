# Weapons Progression

This document refines mechanics.md slots and offers into concrete rules, UI, and implementation steps.

## Loadout & Slots
- Slot 1 is the swappable Primary and Slot 2 is the permanent Pistol sidearm. Standard runs begin with Pistol only; SMG is granted automatically at Wave 2.
- The classified Grenade Launcher permanently adds dedicated Slot 3. Dynamite, Gravity Well, Satellite Strike, and Punchline Rush occupy the separate equipped Q ability slot and never replace a weapon.

## Unlocks (persistent)
- Unlock table (saved locally):
  - SMG: free Wave 2 grant
  - Shotgun and BeamSaber: free early Armory discoveries
  - Minigun: free mid-run Armory discovery
  - Rifle: classified at first; revealed at Wave 6, then licensed in the Archive for 10 fragments
  - DMR: classified at first; revealed after the Wave 10 boss, then licensed for 18 fragments
  - Grenade Launcher: classified at first; revealed with a temporary Slot 3 trial after the Wave 15 boss, then licensed with permanent Slot 3 for 50 fragments

Revealed and owned are separate saved states. The Archive hides a classified weapon's identity, price, and statistics until its reveal milestone. Revealed primary weapons cannot enter Armory offers until permanently licensed, and do not unlock mastery or optics.

## Armory Offers (per run)
- Early script:
  - Wave 2: auto-equip SMG as first Primary.
  - Wave 3: offer Shotgun vs SMG.
  - Wave 4: offer BeamSaber.
  - Wave 6: offer Rifle vs SMG when Rifle is licensed; otherwise use the eligible unlocked pool.
  - Wave 8: offer Minigun.
  - Wave 11: offer Rifle vs DMR when licensed; otherwise use the eligible unlocked pool.
  - Wave 12: offer DMR vs BeamSaber when DMR is licensed; otherwise use the eligible unlocked pool.
- Normal cadence: end of even waves ≥6 afterward (respect swap cooldown).
- Swap cooldown: accepting an offer skips the next one (no back‑to‑back swaps). Declining does not.
- Flow: present 2 random weapons from unlocked pool excluding current Primary. Choose 1 to replace Primary, or Decline.
- Decline bonus: +20% reserve to current Primary, clamped by its hard reserve limit.
- A newly swapped primary begins at its full hard reserve limit. Legacy half-reserve carry is also clamped to that limit and cannot create over-cap ammunition. Magazine refills to full on swap.

## Classified Reveals
- Wave 6 reveals the Rifle for purchase; it does not enter primary offers until licensed.
- Defeating the Wave 10 boss reveals the DMR for purchase; it does not enter primary offers until licensed.
- Defeating the Wave 15 boss reveals the Grenade Launcher and immediately installs the temporary weapon in Slot 3.
- The Grenade trial happens once. After that run ends, it requires its permanent Archive license.

## Weapon Crates (drops)
- Starting Wave 3: rare drop (≈5% base, pity +1%/miss, cap 1 per wave).
  Opening crate spawns a single weapon choice to replace Primary, same reserve conversion rule.
- Crate swaps ignore the Armory swap cooldown; only accepting an Armory offer delays the next one.

## Economy Rules
- Ammo pickups always add to the equipped weapon's reserve.
- Reload draws only from that reserve; never negative, clamp to mag size.
- The unupgraded hard reserve limits are Pistol 50, SMG 108, Rifle 64, Shotgun 24, DMR 36, Minigun 360, and Grenade 8. Beam Saber has no reserve. Ammo pickups and other reserve rewards report only the amount accepted below that cap. Minigun ammo pickups use a dedicated 4.0x heavy-weapon multiplier.
- Deep Reserves costs 3 fragments to unlock with a two-rank run cap; one 3-fragment Archive upgrade raises its cap to four. Each selected run rank adds 30% of unupgraded base reserve (130% / 160% / 190% / 220%). Weapon-specific mastered starting reserve remains additive.
- Background Sync costs 6 fragments to unlock as a one-rank run mutation. Once selected, it restores 5% of unupgraded base reserve every 10 active seconds while the primary is below half total ammo. Pistol, Grenade, and Beam Saber are excluded, and Deep Reserves does not increase the regeneration rate.
- Ordinary enemy-dropped ammo expires after 30 active gameplay seconds and fades during its final 8 seconds. Boss and supply ammunition retains the standard 75-second collection window.
- Memefragments award 1 after every two cleared waves and 2 per boss through Wave 15. Later rewards rise to 2 and 4 respectively.
- The first Wave 15 boss victory grants a one-time 5-fragment Classified Dossier. First clears of Waves 30, 45, and 60 grant additional one-time 5-fragment Archive Caches.

## Boss Rewards
- On boss defeat (every 5th wave): choose one
  - Refine Primary: one of two small, weapon‑specific buffs (e.g., +5% magazine, −5% bloom, +7% falloff range).
  - New Primary: swap to a random unlocked Primary with 1.25× default reserve.
- Guardrails: no repeat refine choices consecutively; refine bonuses cap at +10% magazine / −10% bloom / +15% falloff in a run.

## UI
- HUD shows current Primary name and ammo; offer banner: "Armory Offer (F) – Choose 1 of 2".
- Simple selection modal: weapon name + short blurb + icon.

### Scoped zoom feedback
- On desktop, purchased optics let right-click toggle scoped zoom for the owned Rifle or DMR; a second right-click returns to normal view. Trial weapons do not qualify for optics purchases.
- Magnification: Rifle 1.5×; DMR 3×. Other weapons retain their existing alternate-fire behavior.
- Zoom uses a glass-tinted, circular focus treatment with a sharp center and softly feathered peripheral blur. Rifle begins with 3px peripheral blur; DMR begins with 6px.
- After 30 seconds of uninterrupted zoom, tunnel vision builds over 12 seconds: the focus circle contracts and peripheral blur intensifies (Rifle to 16px, DMR to 20px). The exterior remains only lightly tinted rather than blacked out.
- Zooming out, changing weapons, or resetting a run clears the focus effect and its timer. The HUD, crosshair, and hitmarker remain above the visual effect for readability.

## Implementation Steps
1) Add `Unlocks` local save and helper (check/update).
2) Add `OfferSystem` with schedule and skip logic; modal UI; integrate with `WeaponSystem.switchSlot`.
3) Implement reserve conversion and decline bonus in `WeaponSystem` (already partially present: onAmmoPickup and reload rules).
4) Add crate pickup type that triggers a single‑weapon offer.
5) Hook boss rewards: on boss death, invoke OfferSystem with special rules.

## Acceptance
- Player starts with only a Pistol; SMG arrives at Wave 2.
- Primary changes follow the offer schedule; the Pistol remains in Slot 2.
- Classified cards hide weapon identity until their milestone, reveal only once, and distinguish a temporary trial from permanent ownership.
- An owned Grenade Launcher is restored in Slot 3 at the start of every standard run; a trial Grenade Launcher disappears on restart or death.
- The Archive restores one equipped Q ability at the start of a standard run.
- Reserve conversion works; decline yields +20% reserve (clamped).
- Ammo economy respects per‑weapon reserves; no negatives or overfills.

## Q Ability Playtest Routes

- Use `index.html?debug=1&shop=1` to reveal the Archive with a non-persistent 300-fragment test wallet. Use `credits=200` through `credits=400` to request an exact balance; values outside that range are clamped. Debug purchases and equipment disappear on reload and never overwrite the real save.
- Debug selection does not require a wave override and never changes Archive ownership. Use `index.html?debug=1&skill=dynamite`, `skill=gravity-well`, `skill=satellite-strike`, `skill=punchline-rush`, `skill=supply-drop`, `skill=overtime`, or `skill=engagement-bait`, then start the run and press `Q`.
- The equivalent explicit selector accepts `dynamite`, `gravity_well`, `satellite_strike`, `punchline_rush`, `supply_drop`, `overtime`, or `engagement_bait`. Boolean aliases include `dynamite=1`, `gravityWell=1`, `satellite=1`, `rush=1`, `supply=1`, `overtime=1`, and `bait=1`.
- Dynamite Grade I costs 28 fragments and stores two charges at 108 damage and 3.1 m radius. Grade II costs 40 more fragments and restores three charges at 150 damage and 5.2 m radius. Every charge regenerates sequentially in 35 seconds.
- Each bundle explodes automatically 2.6 seconds after it leaves the hand. Grade I uses 108 base damage and a focused 3.1-metre radius; Grade II uses 150 damage and a 5.2-metre radius.
- Validate three decisions: trap a spawn route, stick a moving regular enemy, and destroy a barricade or low wall with the radial blast.

- Add `wave=21` to any route when a late-wave combat pack is useful; ability selection itself works at Wave 1.
- Gravity Well costs 55 fragments because its 8-metre capture field combines the strongest crowd control with a damaging collapse. Satellite Strike costs 42 and deals 50% damage to the active boss. Dynamite Grade I costs 28, its Grade II upgrade costs 40, and Punchline Rush costs 10.
- Supply Drop costs 15 and recharges in 60 seconds. Its delivery takes 7 seconds; the 20-HP crate is a solid obstacle for up to 30 seconds and drops two ammo pickups plus one medkit only when destroyed. Overtime costs 15 and recharges in 12 seconds; Engagement Bait costs 15 and recharges in 45 seconds.
- Satellite Strike recharges in 42 seconds. Punchline Rush uses `ability=punchline_rush`, recharges in 17 seconds, and no longer consumes stamina.

See `weapon-tiers.md` for current balance ranking of available weapons.
