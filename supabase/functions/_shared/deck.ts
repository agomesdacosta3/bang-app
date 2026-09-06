import { supabaseAdmin } from './supabaseAdmin.ts';

export interface DeckCard { type: string; suit: string; value: number; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Retire les n cartes du dessus de la pioche partagée (remélange la défausse si besoin), sans les attribuer à personne.
export async function drawFromDeck(gameId: string, n: number): Promise<DeckCard[]> {
  const { data: deckRow } = await supabaseAdmin.from('deck_state').select('cards').eq('game_id', gameId).single();
  let deck: DeckCard[] = deckRow!.cards;

  if (deck.length < n) {
    const { data: discarded } = await supabaseAdmin.from('discard_pile').select('id, card_type, suit, value').eq('game_id', gameId);
    const reshuffled = shuffle((discarded ?? []).map(d => ({ type: d.card_type, suit: d.suit, value: d.value })));
    deck = [...reshuffled, ...deck];
    if (discarded?.length) await supabaseAdmin.from('discard_pile').delete().in('id', discarded.map(d => d.id));
  }
  if (deck.length < n) throw new Error('Plus assez de cartes, même après remélange de la défausse');

  const drawn = deck.slice(-n);
  deck = deck.slice(0, -n);
  await supabaseAdmin.from('deck_state').update({ cards: deck }).eq('game_id', gameId);
  await supabaseAdmin.from('games').update({ deck_remaining: deck.length }).eq('id', gameId);
  return drawn;
}