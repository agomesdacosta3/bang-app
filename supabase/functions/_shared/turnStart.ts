import { supabaseAdmin } from './supabaseAdmin.ts';
import { degainer } from './degainer.ts';
import { applyDamage } from './applyDamage.ts';
import { advanceTurn } from './turn.ts';
import { logEvent } from './events.ts';
import { touchTurnActivity } from './turnActivity.ts';

// Gère le dégainer de Dynamite/Prison en tout début de tour.
// Retourne true si le tour s'est terminé immédiatement (explosion fatale ou Prison ratée) —
// dans ce cas le tour a déjà avancé au joueur suivant.
export async function performDrawPhaseDegainer(gameId: string, playerId: string): Promise<boolean> {
  const { data: me } = await supabaseAdmin.from('players').select('*').eq('id', playerId).single();
  const { data: equipment } = await supabaseAdmin.from('cards_in_play').select('id, card_type, suit, value, origin_event_id').eq('player_id', playerId);
  const dynamiteRow = equipment?.find(c => c.card_type === 'dynamite');
  const prisonRow = equipment?.find(c => c.card_type === 'prison');
  if (!dynamiteRow && !prisonRow) return false;

  if (dynamiteRow) {
    const threadId = dynamiteRow.origin_event_id ?? undefined;
    const drawn = await degainer(gameId, playerId, c => !(c.suit === 'spades' && c.value >= 2 && c.value <= 9), threadId);
    await supabaseAdmin.from('cards_in_play').delete().eq('id', dynamiteRow.id);
    const explodes = drawn.suit === 'spades' && drawn.value >= 2 && drawn.value <= 9;

    if (explodes) {
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'dynamite', suit: dynamiteRow.suit, value: dynamiteRow.value });
      await applyDamage(gameId, playerId, { amount: 3, threadId });
      const { data: after } = await supabaseAdmin.from('players').select('is_alive').eq('id', playerId).single();
      if (!after!.is_alive) {
        await advanceTurn(gameId, playerId);
        await touchTurnActivity(gameId);
        return true;
      }
    } else {
      const { data: allPlayers } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
      const alive = allPlayers!.filter(p => p.is_alive);
      const myIndex = alive.findIndex(p => p.id === playerId);
      const leftNeighbor = alive[(myIndex + 1) % alive.length];
      const passEventId = await logEvent(gameId, 'dynamite_passed', { actorSeat: leftNeighbor.seat_position });
      await supabaseAdmin.from('cards_in_play').insert({ player_id: leftNeighbor.id, card_type: 'dynamite', suit: dynamiteRow.suit, value: dynamiteRow.value, origin_event_id: passEventId });
    }
  }

  if (prisonRow) {
    const threadId = prisonRow.origin_event_id ?? undefined;
    const drawn = await degainer(gameId, playerId, c => c.suit === 'hearts', threadId);
    await supabaseAdmin.from('cards_in_play').delete().eq('id', prisonRow.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'prison', suit: prisonRow.suit, value: prisonRow.value });
    if (drawn.suit !== 'hearts') {
      await logEvent(gameId, 'prison_failed', { actorSeat: me!.seat_position, threadId });
      await advanceTurn(gameId, playerId);
      await touchTurnActivity(gameId);
      return true;
    }
    await logEvent(gameId, 'prison_escaped', { actorSeat: me!.seat_position, threadId });
  }

  return false;
}