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

    const { gameId, keepIndices } = await req.json(); // ex: [0, 2]
    if (!Array.isArray(keepIndices) || keepIndices.length !== 2 || new Set(keepIndices).size !== 2 || keepIndices.some((i: number) => i < 0 || i > 2)) {
      throw new Error('Choix invalide, indiquez exactement 2 indices distincts entre 0 et 2');
    }

    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'draw') throw new Error('Ce n’est pas la phase de pioche');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const character = await getCharacter(me.id);
    if (character !== 'kit_carlson') throw new Error('Cette action est réservée à Kit Carlson');

    const { data: deckRow } = await supabaseAdmin.from('deck_state').select('cards').eq('game_id', gameId).single();
    const deck: { type: string; suit: string; value: number }[] = deckRow!.cards;
    if (deck.length < 3) throw new Error('Pas assez de cartes dans la pioche pour cette capacité');

    const topThree = deck.slice(-3);
    const discardIndex = [0, 1, 2].find(i => !keepIndices.includes(i))!;
    const kept = keepIndices.map((i: number) => topThree[i]);
    const putBack = topThree[discardIndex];
    const newDeck = [...deck.slice(0, -3), putBack];

    await supabaseAdmin.from('hand_cards').insert(kept.map(c => ({ player_id: me.id, card_type: c.type, suit: c.suit, value: c.value })));
    await supabaseAdmin.from('deck_state').update({ cards: newDeck }).eq('game_id', gameId);

    await logEvent(gameId, 'kit_carlson_pick', { actorSeat: me.seat_position });
    await supabaseAdmin.from('players').update({ has_played_bang_this_turn: false }).eq('id', me.id);
    await supabaseAdmin.from('games').update({ turn_phase: 'play' }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});