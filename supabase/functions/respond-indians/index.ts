import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { logEvent } from '../_shared/events.ts';
import { checkSuzyLafayette, getCharacter } from '../_shared/characters.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, action, cardType } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'indians_response') throw new Error('Aucun Indiens! en attente');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', me!.id).maybeSingle();
    if (!myPending) throw new Error('Vous n’avez pas à répondre à cet Indiens!');

    if (action === 'discard_bang') {
      const character = await getCharacter(me!.id);
      const useMissed = cardType === 'missed' && character === 'calamity_janet';
      const searchType = useMissed ? 'missed' : 'bang';

      const { data: bangCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me!.id).eq('card_type', searchType).limit(1).single();
      if (!bangCard) throw new Error(useMissed ? 'Vous n’avez pas de carte Raté!' : 'Vous n’avez pas de carte Bang!');
      await supabaseAdmin.from('hand_cards').delete().eq('id', bangCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: searchType, suit: bangCard.suit, value: bangCard.value });
      await logEvent(gameId, 'indians_defended', { actorSeat: me!.seat_position });
      await checkSuzyLafayette(gameId, me!.id);
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
      await logEvent(gameId, 'beer_saved_from_death', { actorSeat: me!.seat_position });
      await checkSuzyLafayette(gameId, me!.id);
    } else if (action === 'accept_damage') {
      await applyDamage(gameId, me!.id, 1, game.pending_initiator_id);
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