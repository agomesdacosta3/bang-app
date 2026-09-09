import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { startPending } from '../_shared/pending.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logEvent } from '../_shared/events.ts';
import { checkSuzyLafayette } from '../_shared/characters.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, targetPlayerId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'play') throw new Error('Ce n’est pas le moment de jouer une carte');
    if (game.pending_type) throw new Error('Une réponse est déjà en attente');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId);
    const me = players!.find(p => p.user_id === user.id);
    if (!me) throw new Error('Vous ne participez pas à cette partie');
    if (game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const target = players!.find(p => p.id === targetPlayerId);
    if (!target?.is_alive || target.id === me.id) throw new Error('Cible invalide');

    const { data: duelCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me.id).eq('card_type', 'duel').limit(1).single();
    if (!duelCard) throw new Error('Vous n’avez pas de carte Duel en main');

    await supabaseAdmin.from('hand_cards').delete().eq('id', duelCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'duel', suit: duelCard.suit, value: duelCard.value });

    await startPending(gameId, me.id, 'duel_response', [
      { playerId: target.id, isCurrentTurn: true },
      { playerId: me.id, isCurrentTurn: false },
    ]);
    await logEvent(gameId, 'duel_played', { actorSeat: me.seat_position, targetSeat: target.seat_position });
    await checkSuzyLafayette(gameId, me.id);
    
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});