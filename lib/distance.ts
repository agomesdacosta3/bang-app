export interface SeatedPlayer { id: string; seat_position: number; is_alive: boolean; }

export function computeDistance(players: SeatedPlayer[], fromId: string, toId: string): number {
  const alive = players.filter(p => p.is_alive).sort((a, b) => a.seat_position - b.seat_position);
  const fromIndex = alive.findIndex(p => p.id === fromId);
  const toIndex = alive.findIndex(p => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) return Infinity;
  const n = alive.length;
  return Math.min((toIndex - fromIndex + n) % n, (fromIndex - toIndex + n) % n);
}