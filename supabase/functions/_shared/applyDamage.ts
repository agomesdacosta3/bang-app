import { supabaseAdmin } from './supabaseAdmin.ts';
import { checkVictory } from './victory.ts';
import { logEvent } from './events.ts';

export async function applyDamage(gameId: string, playerId: string, amount = 1) {
  const { data: player } = await supabaseAdmin.from('players').select('life_points, seat_position').eq('id', playerId).single();
  const newLife = player!.life_points - amount;
  const eliminated = newLife <= 0;
  await supabaseAdmin.from('players').update({ life_points: Math.max(newLife, 0), is_alive: !eliminated }).eq('id', playerId);

  await logEvent(gameId, 'damage_taken', { actorSeat: player!.seat_position, amount });

  if (eliminated) {
    await supabaseAdmin.from('hand_cards').delete().eq('player_id', playerId);
    await logEvent(gameId, 'player_eliminated', { actorSeat: player!.seat_position });
    await checkVictory(gameId, playerId);
  }
}