import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamageAndClearPending } from '../_shared/applyDamage.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, action } = await req.json(); // 'missed' | 'accept_damage'
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game?.pending_type) throw new Error('Aucune réponse en attente');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || me.id !== game.pending_target_id) throw new Error('Ce n’est pas à vous de répondre');

    if (action === 'missed') {
      const { data: missedCard } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', me.id).eq('card_type', 'missed').limit(1).single();
      if (!missedCard) throw new Error('Vous n’avez pas de carte Raté!');
      await supabaseAdmin.from('hand_cards').delete().eq('id', missedCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'missed' });
      await supabaseAdmin.from('games').update({
        pending_type: null, pending_initiator_id: null, pending_target_id: null, pending_expires_at: null,
      }).eq('id', gameId);
    } else if (action === 'accept_damage') {
      await applyDamageAndClearPending(gameId, me.id);
    } else {
      throw new Error('Action inconnue');
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});