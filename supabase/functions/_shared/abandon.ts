import { supabaseAdmin } from './supabaseAdmin.ts';
import { applyDamage } from './applyDamage.ts';
import { clearPending } from './pending.ts';
import { advanceTurn } from './turn.ts';
import { logEvent } from './events.ts';
import { touchTurnActivity } from './turnActivity.ts';

export async function eliminatePlayerForAbandonment(gameId: string, playerId: string, reason: 'voluntary' | 'inactivity') {
  const { data: player } = await supabaseAdmin.from('players').select('*').eq('id', playerId).single();
  if (!player || !player.is_alive) return;

  const rootEventType = reason === 'voluntary' ? 'player_abandoned' : 'player_timed_out';
  const eventId = await logEvent(gameId, rootEventType, { actorSeat: player.seat_position });

  await applyDamage(gameId, playerId, { amount: player.life_points, threadId: eventId });

  const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
  if (!game || game.status === 'finished') return; // la partie peut s'être terminée par cette élimination

  if (game.current_player_id === playerId) {
    await advanceTurn(gameId, playerId);
    await touchTurnActivity(gameId);
  }

  if (game.pending_type) {
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle();
    if (myPending) {
      if (game.pending_type === 'duel_response' || game.pending_type === 'cat_balou_discard') {
        // Duel à deux ou choix individuel : sa disparition met fin à l'échange, plus personne pour y participer.
        await clearPending(gameId);
      } else if (game.pending_type === 'general_store') {
        await supabaseAdmin.from('pending_targets').delete().eq('id', myPending.id);
        const { data: remaining } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).order('order_index');
        if (!remaining || remaining.length === 0) {
          await clearPending(gameId);
        } else if (myPending.is_current_turn) {
          await supabaseAdmin.from('pending_targets').update({ is_current_turn: true }).eq('id', remaining[0].id);
          await supabaseAdmin.from('games').update({ pending_expires_at: new Date(Date.now() + 20_000).toISOString() }).eq('id', gameId);
        }
      } else {
        // bang_response, gatling_response, indians_response : simple retrait, l'échange continue pour les autres.
        await supabaseAdmin.from('pending_targets').delete().eq('id', myPending.id);
        const { data: remaining } = await supabaseAdmin.from('pending_targets').select('id').eq('game_id', gameId);
        if (!remaining || remaining.length === 0) {
          await clearPending(gameId);
        }
      }
    }
  }
}