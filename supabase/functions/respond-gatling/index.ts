import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { degainer } from '../_shared/degainer.ts';
import { logEvent } from '../_shared/events.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { checkSuzyLafayette } from '../_shared/characters.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, action } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'gatling_response') throw new Error('Aucun Gatling en attente');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', me!.id).maybeSingle();
    if (!myPending) throw new Error('Vous n’avez pas à répondre à ce Gatling');

    if (action === 'missed') {
      const { data: missedCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me!.id).eq('card_type', 'missed').limit(1).single();
      if (!missedCard) throw new Error('Vous n’avez pas de carte Raté!');
      await supabaseAdmin.from('hand_cards').delete().eq('id', missedCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'missed', suit: missedCard.suit, value: missedCard.value });
      await logEvent(gameId, 'missed_played', { actorSeat: me!.seat_position });
      await checkSuzyLafayette(gameId, me!.id);
    } else if (action === 'try_barrel') {
      if (myPending.barrel_tried) throw new Error('Vous avez déjà essayé la Planque pour ce tir');
      const { data: barrel } = await supabaseAdmin.from('cards_in_play').select('id').eq('player_id', me!.id).eq('card_type', 'barrel').maybeSingle();
      if (!barrel) throw new Error('Vous n’avez pas de Planque en jeu');
      await supabaseAdmin.from('pending_targets').update({ barrel_tried: true }).eq('id', myPending.id);
      const drawn = await degainer(gameId, me!.id, c => c.suit === 'hearts');
      if (drawn.suit !== 'hearts') {
        await logEvent(gameId, 'barrel_failed', { actorSeat: me!.seat_position });
        return new Response(JSON.stringify({ ok: true, barrelWorked: false, drawnSuit: drawn.suit }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await logEvent(gameId, 'barrel_used', { actorSeat: me!.seat_position });
    } else if (action === 'accept_damage') {
      await applyDamage(gameId, me!.id);
    } else {
      throw new Error('Action inconnue');
    }

    await supabaseAdmin.from('pending_targets').delete().eq('id', myPending.id);
    const { data: remaining } = await supabaseAdmin.from('pending_targets').select('id').eq('game_id', gameId);
    if (!remaining || remaining.length === 0) {
      await supabaseAdmin.from('games').update({ pending_type: null, pending_initiator_id: null, pending_expires_at: null }).eq('id', gameId);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});