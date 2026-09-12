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

    const already = existingPlayers!.find(p => p.user_id === user.id);
    if (already) {
      return new Response(JSON.stringify({ ok: true, gameId: game.id, playerId: already.id, seatPosition: already.seat_position }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (game.status !== 'lobby') throw new Error('Cette partie a déjà démarré');
    if (existingPlayers!.length >= 7) throw new Error('Partie complète (7 joueurs maximum)');

    // Premier siège libre plutôt que "nombre de joueurs actuels" — nécessaire depuis qu'un joueur
    // peut quitter le lobby : sans ça, un siège déjà occupé par un rang plus élevé provoquait un
    // conflit lors d'un retour après un départ.
    const usedSeats = new Set(existingPlayers!.map(p => p.seat_position));
    let seatPosition = 0;
    while (usedSeats.has(seatPosition)) seatPosition++;

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players').insert({ game_id: game.id, user_id: user.id, seat_position: seatPosition }).select().single();
    if (playerError) throw playerError;

    return new Response(JSON.stringify({ ok: true, gameId: game.id, playerId: player.id, seatPosition: player.seat_position }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});