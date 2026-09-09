import { supabaseAdmin } from './supabaseAdmin.ts';
import { drawFromDeck, DeckCard } from './deck.ts';
import { getCharacter } from './characters.ts';
import { logEvent } from './events.ts';

export async function degainer(gameId: string, playerId?: string, isFavorable?: (card: DeckCard) => boolean): Promise<DeckCard> {
  const character = playerId ? await getCharacter(playerId) : null;
  let actorSeat: number | undefined;
  if (playerId) {
    const { data: player } = await supabaseAdmin.from('players').select('seat_position').eq('id', playerId).single();
    actorSeat = player?.seat_position;
  }

  if (character === 'lucky_duke') {
    const [a, b] = await drawFromDeck(gameId, 2);
    await supabaseAdmin.from('discard_pile').insert([
      { game_id: gameId, card_type: a.type, suit: a.suit, value: a.value },
      { game_id: gameId, card_type: b.type, suit: b.suit, value: b.value },
    ]);
    const chosen = isFavorable ? (isFavorable(a) ? a : (isFavorable(b) ? b : a)) : a;
    const other = chosen === a ? b : a;
    await logEvent(gameId, 'degainer_draw', { actorSeat, drawnSuit: chosen.suit, drawnValue: chosen.value, drawnSuit2: other.suit, drawnValue2: other.value });
    return chosen;
  }

  const [drawn] = await drawFromDeck(gameId, 1);
  await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: drawn.type, suit: drawn.suit, value: drawn.value });
  await logEvent(gameId, 'degainer_draw', { actorSeat, drawnSuit: drawn.suit, drawnValue: drawn.value });
  return drawn;
}