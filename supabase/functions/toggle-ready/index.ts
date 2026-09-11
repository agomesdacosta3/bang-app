import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { runStartGame } from '../_shared/startGame.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (!game || game.status !== 'lobby') throw new Error('La partie n’est plus dans le lobby');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me) throw new Error('Vous ne participez pas à cette partie');

    const newReady = !me.is_ready;
    if (newReady && !me.nickname) throw new Error('Choisissez un pseudo avant de vous déclarer prêt');
    await supabaseAdmin.from('players').update({ is_ready: newReady }).eq('id', me.id);

    const { data: allPlayers } = await supabaseAdmin.from('players').select('is_ready').eq('game_id', gameId);
    const count = allPlayers?.length ?? 0;
    const allReady = count >= 4 && count <= 7 && (allPlayers ?? []).every(p => p.is_ready);

    let started = false;
    if (allReady) {
      try {
        await runStartGame(gameId);
        started = true;
      } catch {
        // Une course avec un autre joueur a peut-être déjà démarré la partie entre-temps — sans gravité.
      }
    }

    return new Response(JSON.stringify({ ok: true, isReady: newReady, started }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});