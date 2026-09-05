import { supabaseAdmin } from './supabaseAdmin.ts';
import { checkVictory } from './victory.ts';

export async function applyDamageAndClearPending(gameId: string, playerId: string) {
  const { data: player } = await supabaseAdmin.from('players').select('life_points').eq('id', playerId).single();
  const newLife = player!.life_points - 1;
  const eliminated = newLife <= 0;

  await supabaseAdmin.from('players').update({ life_points: Math.max(newLife, 0), is_alive: !eliminated }).eq('id', playerId);
  if (eliminated) {
    await supabaseAdmin.from('hand_cards').delete().eq('player_id', playerId);
    await checkVictory(gameId, playerId);
  }
  await supabaseAdmin.from('games').update({
    pending_type: null, pending_initiator_id: null, pending_target_id: null, pending_expires_at: null,
  }).eq('id', gameId);
}