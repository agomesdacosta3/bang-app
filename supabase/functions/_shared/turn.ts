import { supabaseAdmin } from './supabaseAdmin.ts';

export async function advanceTurn(gameId: string, fromPlayerId: string) {
  const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
  const alive = players!.filter(p => p.is_alive);
  const currentIndex = alive.findIndex(p => p.id === fromPlayerId);
  const next = alive[(currentIndex + 1) % alive.length];
  await supabaseAdmin.from('games').update({ current_player_id: next.id, turn_phase: 'draw' }).eq('id', gameId);
  return next;
}