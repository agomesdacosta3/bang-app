import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { clearPending } from '../_shared/pending.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, action } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'bang_response') throw new Error('Aucune réponse à un Bang! en attente');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', me!.id).maybeSingle();
    if (!myPending) throw new Error('Ce n’est pas à vous de répondre');

    if (action === 'missed') {
      const { data: missedCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me!.id).eq('card_type', 'missed').limit(1).single();
      if (!missedCard) throw new Error('Vous n’avez pas de carte Raté!');
      await supabaseAdmin.from('hand_cards').delete().eq('id', missedCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'missed', suit: missedCard.suit, value: missedCard.value });
    } else if (action === 'accept_damage') {
      await applyDamage(gameId, me!.id);
    } else {
      throw new Error('Action inconnue');
    }

    await clearPending(gameId);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});