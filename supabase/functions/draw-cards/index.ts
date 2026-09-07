import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { drawFromDeck } from '../_shared/deck.ts';

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

    const { data: equipment } = await supabaseAdmin.from('cards_in_play').select('card_type').eq('player_id', me.id);
    if (equipment?.some(c => c.card_type === 'dynamite' || c.card_type === 'prison')) {
      throw new Error('Vous devez d’abord dégainer');
    }

    const drawn2 = await drawFromDeck(gameId, 2);
    await supabaseAdmin.from('hand_cards').insert(drawn2.map(c => ({ player_id: me.id, card_type: c.type, suit: c.suit, value: c.value })));
    await supabaseAdmin.from('players').update({ has_played_bang_this_turn: false }).eq('id', me.id);
    await supabaseAdmin.from('games').update({ turn_phase: 'play' }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true, drawn: drawn2.map(c => c.type) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});