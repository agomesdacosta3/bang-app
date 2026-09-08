export const WEAPON_RANGES: Record<string, number> = {
  schofield: 2, remington: 3, carbine: 4, winchester: 5, volcanic: 1,
};
export const WEAPON_TYPES = Object.keys(WEAPON_RANGES);

export function getWeaponRange(equipmentTypes: string[]): number {
  const weapon = equipmentTypes.find(t => WEAPON_TYPES.includes(t));
  return weapon ? WEAPON_RANGES[weapon] : 1; // Colt .45 par défaut
}