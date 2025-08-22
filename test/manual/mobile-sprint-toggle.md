# Manual Test: Mobile Sprint Toggle

## Purpose
Ensure sprinting can be locked and unlocked on mobile devices via the 🏃 button.

## Prerequisites
- Device or emulator with touch input
- Build of the game accessible via mobile browser

## Steps
1. Load the game on a mobile device or in a mobile emulator.
2. Observe the help overlay: "Move: joystick • Shoot: 🔥 • Jump: ⤴️ • Sprint: 🏃". Tap any control to dismiss it.
3. Tap the 🏃 button once.
4. Move using the joystick and confirm:
   - The 🏃 button appears darkened.
   - Player moves faster and stamina bar begins draining.
5. Tap the 🏃 button again.
6. Continue moving and confirm:
   - The 🏃 button returns to normal appearance.
   - Player returns to normal speed and stamina regenerates.
7. Repeat steps 3–6 to verify consistent toggling.

## Expected Results
- First tap locks sprinting: 'ShiftLeft' is added to player keys, the button shows active state, and stamina drains while moving.
- Second tap unlocks sprinting: 'ShiftLeft' is removed from player keys, the button reverts appearance, and stamina stops draining and regenerates.

