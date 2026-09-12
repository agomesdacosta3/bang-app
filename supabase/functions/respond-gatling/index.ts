import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { degainer } from '../_shared/degainer.ts';
import { logEvent } from '../_shared/events.ts';
import { checkSuzyLafayette, getCharacter } from '../_shared/characters.ts';
import { getMaxBarrelTries } from '../_shared/barrel.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { clearPending } from '../_shared/pending.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, action, cardType } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'gatling_response') throw new Error('Aucun Gatling en attente');
    const threadId = game.pending_event_id ?? undefined;

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', me!.id).maybeSingle();
    if (!myPending) throw new Error('Vous n’avez pas à répondre à ce Gatling');

    if (action === 'missed') {
      const character = await getCharacter(me!.id);
      const useBang = cardType === 'bang' && character === 'calamity_janet';
      const searchType = useBang ? 'bang' : 'missed';
      const { data: card } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me!.id).eq('card_type', searchType).limit(1).single();
      if (!card) throw new Error(useBang ? 'Vous n’avez pas de carte Bang!' : 'Vous n’avez pas de carte Raté!');
      await supabaseAdmin.from('hand_cards').delete().eq('id', card.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: searchType, suit: card.suit, value: card.value });
      await logEvent(gameId, 'missed_played', { actorSeat: me!.seat_position, threadId });
      await checkSuzyLafayette(gameId, me!.id, threadId);
    } else if (action === 'try_barrel') {
      const maxTries = await getMaxBarrelTries(me!.id);
      if (maxTries === 0) throw new Error('Vous n’avez pas de Planque en jeu');
      if (myPending.barrel_tries_used >= maxTries) throw new Error('Vous avez déjà utilisé tous vos essais de Planque pour ce tir');
      await supabaseAdmin.from('pending_targets').update({ barrel_tries_used: myPending.barrel_tries_used + 1 }).eq('id', myPending.id);
      const drawn = await degainer(gameId, me!.id, c => c.suit === 'hearts', threadId);
      if (drawn.suit !== 'hearts') {
        await logEvent(gameId, 'barrel_failed', { actorSeat: me!.seat_position, threadId });
        return new Response(JSON.stringify({ ok: true, barrelWorked: false, drawnSuit: drawn.suit }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await logEvent(gameId, 'barrel_used', { actorSeat: me!.seat_position, threadId });
    } else if (action === 'drink_beer') {
      const { data: allPlayers } = await supabaseAdmin.from('players').select('is_alive').eq('game_id', gameId);
      const aliveCount = (allPlayers ?? []).filter(p => p.is_alive).length;
      if (aliveCount <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
      if (me!.life_points > 1) throw new Error('Cette option n’est possible que si le tir est mortel (dernier point de vie)');
      const { data: beerCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me!.id).eq('card_type', 'beer').limit(1).single();
      if (!beerCard) throw new Error('Vous n’avez pas de carte Bière');
      await supabaseAdmin.from('hand_cards').delete().eq('id', beerCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'beer', suit: beerCard.suit, value: beerCard.value });
      await supabaseAdmin.from('players').update({ life_points: 1 }).eq('id', me!.id);
      await logEvent(gameId, 'beer_saved_from_death', { actorSeat: me!.seat_position, threadId });
      await checkSuzyLafayette(gameId, me!.id, threadId);
    } else if (action === 'accept_damage') {
      await applyDamage(gameId, me!.id, { causedByPlayerId: game.pending_initiator_id ?? undefined, threadId });
    } else {
      throw new Error('Action inconnue');
    }

    await supabaseAdmin.from('pending_targets').delete().eq('id', myPending.id);
    const { data: remaining } = await supabaseAdmin.from('pending_targets').select('id').eq('game_id', gameId);
    if (!remaining || remaining.length === 0) {
      await clearPending(gameId);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});