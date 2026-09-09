import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getCharacter } from '../_shared/characters.ts';
import { logEvent } from '../_shared/events.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, cardIds } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress') throw new Error('La partie n’est pas en cours');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || !me.is_alive) throw new Error('Vous ne pouvez pas utiliser cette capacité');

    const character = await getCharacter(me.id);
    if (character !== 'sid_ketchum') throw new Error('Cette capacité est réservée à Sid Ketchum');
    if (me.life_points >= me.max_life_points) throw new Error('Vous êtes déjà au maximum de points de vie');

    const { data: fullHand } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', me.id);
    if (!fullHand || fullHand.length < 2) throw new Error('Vous n’avez pas assez de cartes en main pour cette capacité');

    if (!Array.isArray(cardIds) || cardIds.length !== 2) throw new Error('Indiquez exactement 2 cartes à défausser');

    const { data: cards } = await supabaseAdmin.from('hand_cards').select('id, card_type, suit, value').in('id', cardIds).eq('player_id', me.id);
    if (!cards || cards.length !== 2) throw new Error('Une des cartes indiquées ne vous appartient pas');

    await supabaseAdmin.from('hand_cards').delete().in('id', cardIds);
    await supabaseAdmin.from('discard_pile').insert(cards.map(c => ({ game_id: gameId, card_type: c.card_type, suit: c.suit, value: c.value })));
    await supabaseAdmin.from('players').update({ life_points: me.life_points + 1 }).eq('id', me.id);
    await logEvent(gameId, 'sid_ketchum_heal', { actorSeat: me.seat_position });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});