import { supabaseAdmin } from './supabaseAdmin.ts';
import { drawFromDeck } from './deck.ts';

export async function degainer(gameId: string) {
  const [drawn] = await drawFromDeck(gameId, 1);
  await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: drawn.type, suit: drawn.suit, value: drawn.value });
  return drawn;
}