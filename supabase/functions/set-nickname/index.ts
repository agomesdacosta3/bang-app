import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, nickname } = await req.json();
    const trimmed = (nickname ?? '').trim();
    if (trimmed.length === 0) throw new Error('Le pseudo ne peut pas être vide');
    if (trimmed.length > 20) throw new Error('Le pseudo ne peut pas dépasser 20 caractères');

    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (!game || game.status !== 'lobby') throw new Error('Les pseudos ne sont modifiables que dans le lobby');

    const { data: me } = await supabaseAdmin.from('players').select('id').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me) throw new Error('Vous ne participez pas à cette partie');

    await supabaseAdmin.from('players').update({ nickname: trimmed }).eq('id', me.id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});