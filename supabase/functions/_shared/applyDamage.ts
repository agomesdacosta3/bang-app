import { supabaseAdmin } from './supabaseAdmin.ts';
import { checkVictory } from './victory.ts';
import { logEvent } from './events.ts';
import { getCharacter } from './characters.ts';
import { drawFromDeck } from './deck.ts';

export async function applyDamage(gameId: string, playerId: string, amount = 1) {
  const { data: player } = await supabaseAdmin.from('players').select('life_points, seat_position').eq('id', playerId).single();
  const newLife = player!.life_points - amount;
  const eliminated = newLife <= 0;
  await supabaseAdmin.from('players').update({ life_points: Math.max(newLife, 0), is_alive: !eliminated }).eq('id', playerId);

  await logEvent(gameId, 'damage_taken', { actorSeat: player!.seat_position, amount });

  if (!eliminated) {
    const character = await getCharacter(playerId);
    if (character === 'bart_cassidy') {
      const [card] = await drawFromDeck(gameId, 1);
      await supabaseAdmin.from('hand_cards').insert({ player_id: playerId, card_type: card.type, suit: card.suit, value: card.value });
      await logEvent(gameId, 'bart_cassidy_draw', { actorSeat: player!.seat_position });
    }
  }

  if (eliminated) {
    await supabaseAdmin.from('hand_cards').delete().eq('player_id', playerId);

    const { data: inPlay } = await supabaseAdmin.from('cards_in_play').select('card_type, suit, value').eq('player_id', playerId);
    if (inPlay?.length) {
      await supabaseAdmin.from('discard_pile').insert(inPlay.map(c => ({ game_id: gameId, card_type: c.card_type, suit: c.suit, value: c.value })));
      await supabaseAdmin.from('cards_in_play').delete().eq('player_id', playerId);
    }

    await logEvent(gameId, 'player_eliminated', { actorSeat: player!.seat_position });
    await checkVictory(gameId, playerId);
  }
}