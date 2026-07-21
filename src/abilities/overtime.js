export class OvertimeAbility {
  constructor() {
    this.healthCost = 15;
    this.minimumHealth = 10;
    this.staminaRestore = 70;
  }

  onFire(ctx) {
    const session = ctx?.session;
    const player = ctx?.playerController;
    if (!session || !player?.restoreStamina) return false;
    if (session.hp < this.minimumHealth + this.healthCost) return false;
    if (player.getStamina?.() >= player.staminaMax - 0.01) return false;

    const restored = player.restoreStamina(this.staminaRestore);
    if (restored <= 0) return false;
    session.adjustHealth(-this.healthCost, { minimum: this.minimumHealth });
    const position = ctx.getPlayerPosition?.(new ctx.THREE.Vector3());
    if (position) {
      ctx.effects?.spawnGroundRing?.(position, 1.8, 0xef4444);
      ctx.effects?.spawnGroundRing?.(position, 1.15, 0x38bdf8);
    }
    ctx.updateHUD?.();
    return true;
  }

  update() {}
  clearWorld() {}
  reset() {}
}
