import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { drawFromDeck } from '../_shared/deck.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logEvent } from '../_shared/events.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'play') throw new Error('Ce n’est pas le moment de jouer une carte');
    if (game.pending_type) throw new Error('Une réponse est déjà en attente');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
    const me = players!.find(p => p.user_id === user.id);
    if (!me) throw new Error('Vous ne participez pas à cette partie');
    if (game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const { data: storeCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me.id).eq('card_type', 'general_store').limit(1).single();
    if (!storeCard) throw new Error('Vous n’avez pas de carte Magasin en main');

    const alive = players!.filter(p => p.is_alive);
    const revealed = await drawFromDeck(gameId, alive.length);

    await supabaseAdmin.from('hand_cards').delete().eq('id', storeCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'general_store', suit: storeCard.suit, value: storeCard.value });
    await supabaseAdmin.from('general_store_cards').insert(revealed.map(c => ({ game_id: gameId, card_type: c.type, suit: c.suit, value: c.value })));

    const myIndex = alive.findIndex(p => p.id === me.id);
    const order = [...alive.slice(myIndex), ...alive.slice(0, myIndex)];
    await supabaseAdmin.from('pending_targets').insert(
      order.map((p, i) => ({ game_id: gameId, player_id: p.id, is_current_turn: i === 0, order_index: i }))
    );
    await supabaseAdmin.from('games').update({
      pending_type: 'general_store', pending_initiator_id: me.id, pending_expires_at: new Date(Date.now() + 20_000).toISOString(),
    }).eq('id', gameId);
    await logEvent(gameId, 'general_store_played', { actorSeat: me.seat_position });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});