import { supabaseAdmin } from './supabaseAdmin.ts';
import { drawFromDeck } from './deck.ts';
import { logEvent } from './events.ts';

export async function getCharacter(playerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('player_characters').select('character').eq('player_id', playerId).maybeSingle();
  return data?.character ?? null;
}

export async function checkSuzyLafayette(gameId: string, playerId: string, threadId?: string) {
  const { data: player } = await supabaseAdmin.from('players').select('is_alive, seat_position').eq('id', playerId).single();
  if (!player?.is_alive) return;
  const character = await getCharacter(playerId);
  if (character !== 'suzy_lafayette') return;
  const { data: hand } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', playerId);
  if (hand && hand.length === 0) {
    const [card] = await drawFromDeck(gameId, 1);
    await supabaseAdmin.from('hand_cards').insert({ player_id: playerId, card_type: card.type, suit: card.suit, value: card.value });
    await logEvent(gameId, 'suzy_lafayette_draw', { actorSeat: player.seat_position, threadId });
  }
}