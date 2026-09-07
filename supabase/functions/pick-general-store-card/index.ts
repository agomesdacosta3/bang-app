import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { pickGeneralStoreCard } from '../_shared/generalStore.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, cardId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.pending_type !== 'general_store') throw new Error('Aucun Magasin en attente');

    const { data: me } = await supabaseAdmin.from('players').select('id').eq('game_id', gameId).eq('user_id', user.id).single();
    const { data: myPending } = await supabaseAdmin.from('pending_targets').select('id').eq('game_id', gameId).eq('player_id', me!.id).eq('is_current_turn', true).maybeSingle();
    if (!myPending) throw new Error('Ce n’est pas à vous de choisir');

    await pickGeneralStoreCard(gameId, me!.id, cardId);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});