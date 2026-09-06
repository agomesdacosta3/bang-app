import { supabaseAdmin } from './supabaseAdmin.ts';

export interface DrawnCard { type: string; suit: string; value: number; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Révèle la prochaine carte de la pioche partagée, la défausse, remélange si besoin. Pas encore utilisée par aucune carte pour l'instant.
export async function degainer(gameId: string): Promise<DrawnCard> {
  const { data: deckRow } = await supabaseAdmin.from('deck_state').select('cards').eq('game_id', gameId).single();
  let deck: DrawnCard[] = deckRow!.cards;

  if (deck.length === 0) {
    const { data: discarded } = await supabaseAdmin.from('discard_pile').select('id, card_type, suit, value').eq('game_id', gameId);
    deck = shuffle((discarded ?? []).map(d => ({ type: d.card_type, suit: d.suit, value: d.value })));
    if (discarded?.length) await supabaseAdmin.from('discard_pile').delete().in('id', discarded.map(d => d.id));
  }
  if (deck.length === 0) throw new Error('Plus aucune carte disponible pour dégainer');

  const drawn = deck[deck.length - 1];
  deck = deck.slice(0, -1);

  await supabaseAdmin.from('deck_state').update({ cards: deck }).eq('game_id', gameId);
  await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: drawn.type, suit: drawn.suit, value: drawn.value });
  await supabaseAdmin.from('games').update({ deck_remaining: deck.length }).eq('id', gameId);

  return drawn;
}