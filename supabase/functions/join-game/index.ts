import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { joinCode } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('join_code', (joinCode ?? '').toUpperCase()).maybeSingle();
    if (!game) throw new Error('Code invalide');

    const { data: existingPlayers } = await supabaseAdmin.from('players').select('*').eq('game_id', game.id).order('seat_position');

    // Un joueur déjà assis peut "rejoindre" à tout moment (reconnexion), quel que soit le statut de la partie
    const already = existingPlayers!.find(p => p.user_id === user.id);
    if (already) {
      return new Response(JSON.stringify({ ok: true, gameId: game.id, playerId: already.id, seatPosition: already.seat_position }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Un nouveau joueur, en revanche, ne peut rejoindre que si la partie n'a pas démarré
    if (game.status !== 'lobby') throw new Error('Cette partie a déjà démarré');
    if (existingPlayers!.length >= 7) throw new Error('Partie complète (7 joueurs maximum)');

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players').insert({ game_id: game.id, user_id: user.id, seat_position: existingPlayers!.length }).select().single();
    if (playerError) throw playerError;

    return new Response(JSON.stringify({ ok: true, gameId: game.id, playerId: player.id, seatPosition: player.seat_position }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});