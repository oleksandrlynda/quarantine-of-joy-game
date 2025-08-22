# Late-Game Modifiers (Waves 35+)

_Intent:_ add incremental, stackable perks that deepen buildcraft without trivializing enemies. Mods are small, mostly additive, and stack with **diminishing returns** plus **hard caps**.

## When & How
- **Start offering at wave 36**, then every **5 waves** (36, 40, 45, …). After 35 because last boss is defeated at 35 wave.
- Each offer = **pick 1 of 3**. Rarity weights: Common 60%, Rare 30%, Epic 10% (no Legendary at launch).
- **No duplicates** in one offer. Duplicate picks across waves are allowed but subject to diminishing returns.
- Offers are separate from weapon drops. UI mirrors weapon offer panel, labeled **“Late-Game Mod”**.

## Stacking & Caps (Global)
- Stacking rule (same stat): **first mod 100%**, **second 60%**, **third 35%**, **fourth 20%**, **fifth 10%**, further 5% each.  
  (Example: three “+10% mag” mods → 10% + 6% + 3.5% = 19.5% total before hard cap.)
- **Hard caps** by stat (cannot be exceeded by any source):
  - Weapon damage: **+30%** (per weapon)
  - Fire rate: **+25%**
  - Mag size: **+50%** or **+8 rounds** (whichever lower)
  - Reload time reduction: **−35%**
  - Spread/bloom reduction: **−30%**
  - Headshot multiplier: **+25%**
  - Effective range / falloff relief: **+30%**
  - Ammo reserve regen: **up to +1.0 ammo/s** (hitscan & bullets), **+0.15 ammo/s** (explosive single-shot)
  - Player move speed (non-sprint): **+20%**
  - Sprint burst (“Supersprint”): **+40%** speed for limited duration, with exhaustion penalties
  - Jump count: **max +1** (double-jump only)
  - Dash charges: **max +1**; dash cooldown reduction **−25%**
  - Damage reduction: **−20%** incoming (no more)
  - Lifesteal: **up to 3 HP/kill** (per second cap 6 HP)

> Design note: caps ensure late-game power rises ~15–25% per 15 waves without flattening difficulty.

---

## Mod Categories

### 1) Weapon — Core
_Apply to current primary at time of pick; persists across swaps._
- **Steady Hands**: Spread/Bloom −8% (cap −30%)
- **Counter-Recoil**: Recoil −10% (cap −30%)
- **Quick Mag**: Reload time −10% (cap −35%)
- **Extended Mag**: Mag size +10% (or +1–2 if tiny mags), hard cap +50% / +8 rounds
- **Overpressure Rounds**: Damage +6% (cap +30%)
- **Deadeye**: Headshot multiplier +10% (cap +25%)
- **Long Barrel**: Effective range / falloff relief +10% (cap +30%)
- **Ammo Siphon**: **+0.2 ammo/s** reserve regen while not firing or reloading (cap +1.0/s bullets)

#### Weapon — Archetype Tuners
- **Rifle – Pattern Forge**: Spray pattern jitter −20% (cap −30%).
- **SMG – Range Tweak**: Falloff starts +4 units (cap +10).  
- **Shotgun – Tight Choke**: Pellet spread −12% (cap −25%).  
- **Shotgun – Extra Pellets**: +1 pellet (cap +2), pellet damage unaffected.  
- **DMR – Punch-Through**: Secondary penetration damage +10% (cap +85% of base on second target).  
- **Minigun – Spool Boost**: Spin-up time −15% (cap −25%); per-shot bloom growth −10% (cap −30%).  
- **Grenade Pistol – Fragment Pack**: Blast radius +10% (cap +25%); base damage +5% (cap +20%); ammo regen capped at **+0.15/s**.

> Guardrails: Shotgun pellet count limited to **+2**; Grenade radius/DMG tightly capped to prevent room wipes.

### 2) Weapon — Utility/On-Kill
- **Head Hunter**: On headshot kill, +1 ammo to reserve (0.25s ICD).
- **Cold Barrel**: First shot after 1.5s idle: +20% damage (no crit chaining).
- **Cull**: Killing blow grants +10% move speed for 2s (ICD 3s).
- **Melee Battery (BeamSaber)**: Charged attack charge time −10% (cap −30%).

### 3) Player — Mobility
- **Double Jump**: One extra air jump (max +1).
- **Supersprint**: Hold Sprint to gain +40% speed up to 3s; then **Exhausted** (−20% speed) for 2s.  
  _Upgrades scale duration only_ (3.0→3.6→4.0s) without increasing peak speed.
- **Dash Battery**: +1 dash charge (max +1).  
- **Quick Recovery**: Dash cooldown −12% (cap −25%).  
- **Parkour**: Mantle/climb speed +20%.

### 4) Player — Sustain/Defense
- **Kinetic Weave**: −10% incoming damage (cap −20%).  
- **Adrenal Plates**: +25 max HP (cap +50% total HP).  
- **Second Wind**: On 20% HP, gain 1.5s 50% DR; ICD 90s.  
- **Close Quarters Adrenaline**: +2 HP on melee kill (cap 3; per-sec cap 6 HP).

### 5) Economy / Flow
- **Scavenger**: Ammo pickups effectiveness +15% (cap +30%).  
- **Combo Keeper**: Combo decay −20%; breaking threshold extended by 0.5s.  
- **Score Booster**: Score +10% (cap +20%).  
- **Drop Luck**: +5% chance for bonus pickup (cap +15%).

---

## Rarity & Roll Bands
- **Common**: small bumps (e.g., +5–8% damage cap, +0.2 ammo/s, −6–8% reload).
- **Rare**: mid values (+8–12% dmg, +0.3–0.5 ammo/s, −10–18% reload).
- **Epic**: near caps (+12–15% dmg, +0.6–1.0 ammo/s, −20–30% reload).
- **Conflict rules**: no offer can contain both (Damage%) and (Fire rate%) together; at most one AoE scaler in an offer.

---

## Anti-Exploit Rules
- Ammo regen **pauses while firing or reloading**; resumes after 0.4s.
- On-kill procs have **internal cooldowns** to prevent chain abuse.
- Movement buffs do **not** stack multiplicatively with base sprint; use the larger of Supersprint vs normal sprint, not both.
- Global **Power Budget**: aggregate effective DPS increase from mods is tuned to **≤ +35%** by wave 60 (not counting skill).

---

## Offer Schedule (Default)
- Wave **35**: 1 Mobility, 1 Weapon Core, 1 Economy.
- Wave **40**: 1 Weapon Core, 1 Weapon Utility, 1 Defense.
- Wave **45**: 1 Mobility, 1 Weapon Archetype, 1 Economy.
- Wave **50+**: rotate categories; guarantee **one** non-Weapon pick every two offers.

---

## UI/UX
- Reuse offer modal; header “Late-Game Mod”.
- Card shows: _icon, name, short line, stat & current total with cap_, e.g.  
  `Extended Mag  |  +10% (Total: +18% / Cap: +50%)`
- Show **cap bar** and **diminishing return** tooltip.
- Decline grants **+10% reserve** to current primary (one-time).

---

## Implementation Notes

### Data Schema (example)
```json
{
  "id": "extended_mag",
  "category": "weapon_core",
  "rarity": "rare",
  "stat": "mag_size_pct",
  "value": 0.10,
  "stacking": "diminishing_1_0_0_60_35_20_10_5",
  "cap": { "type": "minmax", "max_pct": 0.5, "max_flat": 8 },
  "conditions": ["not_explosive"],
  "icd_sec": 0
}
