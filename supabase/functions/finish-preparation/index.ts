import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: players } = await supabaseAdmin.from('players').select('user_id').eq('game_id', gameId);
    if (!players?.some(p => p.user_id === user.id)) throw new Error('Vous ne participez pas à cette partie');

    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (game?.status === 'preparing') {
      await supabaseAdmin.from('games').update({ status: 'in_progress' }).eq('id', gameId);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});