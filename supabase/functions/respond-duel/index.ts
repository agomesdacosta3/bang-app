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

    const { gameId, action } = await req.json(); // 'discard_bang' | 'accept_damage'
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'duel_response') throw new Error('Aucun Duel en attente');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).eq('player_id', me!.id).eq('is_current_turn', true).maybeSingle();
    if (!myPending) throw new Error('Ce n’est pas à vous de répondre au Duel');

    if (action === 'discard_bang') {
      const { data: bangCard } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', me!.id).eq('card_type', 'bang').limit(1).single();
      if (!bangCard) throw new Error('Vous n’avez pas de carte Bang! pour continuer le Duel');
      await supabaseAdmin.from('hand_cards').delete().eq('id', bangCard.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'bang' });

      const { data: opponent } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).neq('player_id', me!.id).single();
      await supabaseAdmin.from('pending_targets').update({ is_current_turn: false }).eq('id', myPending.id);
      await supabaseAdmin.from('pending_targets').update({ is_current_turn: true }).eq('id', opponent!.id);
      await supabaseAdmin.from('games').update({ pending_expires_at: new Date(Date.now() + 20_000).toISOString() }).eq('id', gameId);
    } else if (action === 'accept_damage') {
      await applyDamage(gameId, me!.id);
      await clearPending(gameId);
    } else {
      throw new Error('Action inconnue');
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});