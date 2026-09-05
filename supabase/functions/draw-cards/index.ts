import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'draw') throw new Error('Ce n’est pas la phase de pioche');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const { data: deckRow } = await supabaseAdmin.from('deck_state').select('cards').eq('game_id', gameId).single();
    let deck: string[] = deckRow!.cards;

    if (deck.length < 2) {
      const { data: discarded } = await supabaseAdmin.from('discard_pile').select('id, card_type').eq('game_id', gameId);
      deck = [...shuffle((discarded ?? []).map(d => d.card_type)), ...deck];
      if (discarded?.length) await supabaseAdmin.from('discard_pile').delete().in('id', discarded.map(d => d.id));
    }
    if (deck.length < 2) throw new Error('Plus assez de cartes, même après remélange de la défausse');

    const drawn = deck.slice(-2);
    deck = deck.slice(0, -2);

    await supabaseAdmin.from('hand_cards').insert(drawn.map(card_type => ({ player_id: me.id, card_type })));
    await supabaseAdmin.from('deck_state').update({ cards: deck }).eq('game_id', gameId);
    await supabaseAdmin.from('players').update({ has_played_bang_this_turn: false }).eq('id', me.id);
    await supabaseAdmin.from('games').update({ turn_phase: 'play', deck_remaining: deck.length }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true, drawn }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});