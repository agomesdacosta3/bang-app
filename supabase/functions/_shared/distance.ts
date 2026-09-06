export interface SeatedPlayer { id: string; seat_position: number; is_alive: boolean; }
export interface EquipmentFlags { mustangIds: Set<string>; scopeIds: Set<string>; }

export function computeDistance(players: SeatedPlayer[], fromId: string, toId: string, equipment?: EquipmentFlags): number {
  const alive = players.filter(p => p.is_alive).sort((a, b) => a.seat_position - b.seat_position);
  const fromIndex = alive.findIndex(p => p.id === fromId);
  const toIndex = alive.findIndex(p => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) throw new Error('Joueur introuvable ou éliminé');
  const n = alive.length;
  let base = Math.min((toIndex - fromIndex + n) % n, (fromIndex - toIndex + n) % n);
  if (equipment) {
    if (equipment.mustangIds.has(toId)) base += 1;
    if (equipment.scopeIds.has(fromId)) base -= 1;
  }
  return Math.max(base, 1);
}