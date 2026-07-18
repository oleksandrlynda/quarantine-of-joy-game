function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function capacity(value, fallback) {
  return Math.max(1, finite(value, fallback));
}

export function getPlayerHudStats(session, player) {
  const maxHp = capacity(session?.maxHp, 100);
  const maxArmor = Math.max(0, finite(session?.maxArmor));
  const maxStamina = capacity(player?.staminaMax, 100);
  const staminaValue = typeof player?.getStamina === 'function'
    ? player.getStamina()
    : player?.stamina;
  const hp = Math.max(0, Math.min(maxHp, finite(session?.hp, maxHp)));
  const armor = Math.max(0, Math.min(maxArmor, finite(session?.armor)));
  const stamina = Math.max(0, Math.min(maxStamina, finite(staminaValue, maxStamina)));

  return {
    hp,
    maxHp,
    armor,
    maxArmor,
    stamina,
    maxStamina,
    stamina01: stamina / maxStamina
  };
}
