# Weapons Progression

This document refines mechanics.md slots and offers into concrete rules, UI, and implementation steps.

## Loadout & Slots
- Slot 1 is the swappable Primary and Slot 2 is the permanent Pistol sidearm. Standard runs begin with Pistol only; SMG is granted automatically at Wave 2.
- Tactical packages permanently add dedicated Slot 3. The player equips either the Grenade Launcher or Dynamite in the Archive; tactical weapons never replace the Primary or Pistol.

## Unlocks (persistent)
- Unlock table (saved locally):
  - SMG: free Wave 2 grant
  - Shotgun and BeamSaber: free early Armory discoveries
  - Minigun: free mid-run Armory discovery
  - Rifle: classified at first; revealed with a temporary trial at Wave 6, then licensed in the Archive for 10 fragments
  - DMR: classified at first; revealed with a temporary trial after the Wave 10 boss, then licensed for 18 fragments
  - Grenade Launcher: classified at first; revealed with a temporary Slot 3 trial after the Wave 15 boss, then licensed with permanent Slot 3 for 50 fragments
  - Dynamite (Analog Solution): classified at first; revealed with a temporary Slot 3 trial after the Wave 20 boss, then licensed for 35 fragments

Revealed and owned are separate saved states. The Archive hides a classified weapon's identity, price, and statistics until its reveal milestone. Temporary trials do not unlock that weapon's mastery or optics.

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

## Classified Trials
- Wave 6 reveals the Rifle and allows it in that run's guided primary offer.
- Defeating the Wave 10 boss reveals the DMR and allows it in that run's following guided primary offer.
- Defeating the Wave 15 boss reveals the Grenade Launcher and immediately installs the temporary weapon in Slot 3.
- Defeating the Wave 20 boss reveals Dynamite and temporarily replaces the equipped Slot 3 tactical for its one-run trial.
- Each reveal trial happens once. After that run ends, the classified weapon requires its permanent Archive license.

## Weapon Crates (drops)
- Starting Wave 3: rare drop (≈5% base, pity +1%/miss, cap 1 per wave).
  Opening crate spawns a single weapon choice to replace Primary, same reserve conversion rule.
- Crate swaps ignore the Armory swap cooldown; only accepting an Armory offer delays the next one.

## Economy Rules
- Ammo pickups always add to the equipped weapon's reserve.
- Reload draws only from that reserve; never negative, clamp to mag size.
- Soft reserve caps by weapon (for future tuning): Rifle 300, SMG 360, Shotgun 60, DMR 120, Minigun 600, Pistol 120, Grenade 24, Dynamite 9.
- Memefragments award 1 after every two cleared waves and 2 per boss through Wave 15. Later rewards rise to 2 and 4 respectively.
- The first Wave 15 boss victory grants a one-time 5-fragment Classified Dossier. The late escalation supports the 50-fragment Grenade package without trivializing the one-time survival-pool unlocks.

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
- Owned tactical weapons share Slot 3; the Archive's equipped choice is restored at the start of a standard run.
- Reserve conversion works; decline yields +20% reserve (clamped).
- Ammo economy respects per‑weapon reserves; no negatives or overfills.

## Dynamite Playtest Route

- Open `index.html?debug=1&wave=21`, start the run, and press `5` to equip Dynamite from the debug loadout.
- Left-click throws up to three charges. Each charge explodes automatically 2.6 seconds after it leaves the hand, covering a wide 5.2-metre radius. Press `R` after the blast to load reserve charges.
- Validate three decisions: trap a spawn route, stick a moving regular enemy, and destroy a barricade or low wall with the radial blast.

## Satellite Strike Prototype Route

- Open `index.html?debug=1&wave=21`, start the run, and press `6` to equip the Satellite Designator prototype.
- Left-click paints a 6.5-metre warning zone at the crosshair. After 1.35 seconds, a vertical beam deals up to 300 damage; only one strike can be pending at a time.
- Validate target acquisition on open ground, moving packs escaping the warning, and destruction against a barricade. This prototype is intentionally absent from Archive progression until its combat identity is approved.

## Gravity Well Prototype Route

- Open `index.html?debug=1&wave=21`, start the run, and press `7` to equip Gravity Well.
- Left-click throws one containment sphere. After landing, its 8-metre field captures ground enemies, pulls flyers downward, and drags the player inward for 2.5 seconds before collapsing for up to 240 damage in a 5.5-metre radius.
- Validate runner containment, airborne capture, player counter-movement, clustered follow-up shots, boss pull immunity, and barricade destruction. Only one well may exist at a time; this prototype remains outside Archive progression until approved.

See `weapon-tiers.md` for current balance ranking of available weapons.
