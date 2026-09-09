import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { clearPending } from '../_shared/pending.ts';
import { logEvent } from '../_shared/events.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { checkSuzyLafayette } from '../_shared/characters.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, handCardId, inPlayCardType } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'cat_balou_discard') throw new Error('Aucun choix de défausse en attente');

    const { data: me } = await supabaseAdmin.from('players').select('id, seat_position').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('id').eq('game_id', gameId).eq('player_id', me!.id).maybeSingle();
    if (!myPending) throw new Error('Ce n’est pas à vous de choisir');

    let discardedType = '';
    if (handCardId) {
      const { data: card } = await supabaseAdmin.from('hand_cards').select('id, card_type, suit, value').eq('id', handCardId).eq('player_id', me!.id).maybeSingle();
      if (!card) throw new Error('Cette carte ne vous appartient pas');
      await supabaseAdmin.from('hand_cards').delete().eq('id', card.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: card.card_type, suit: card.suit, value: card.value });
      discardedType = card.card_type;
    } else if (inPlayCardType) {
      const { data: eq } = await supabaseAdmin.from('cards_in_play').select('id, suit, value').eq('player_id', me!.id).eq('card_type', inPlayCardType).maybeSingle();
      if (!eq) throw new Error('Vous n’avez pas cette carte en jeu');
      await supabaseAdmin.from('cards_in_play').delete().eq('id', eq.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: inPlayCardType, suit: eq.suit, value: eq.value });
      discardedType = inPlayCardType;
    } else {
      throw new Error('Indiquez une carte à défausser');
    }

    await logEvent(gameId, 'card_discarded_forced', { actorSeat: me!.seat_position, cardType: discardedType });
    if (handCardId) await checkSuzyLafayette(gameId, me!.id);
    await clearPending(gameId);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});