import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { startPending } from '../_shared/pending.ts';
import { logEvent } from '../_shared/events.ts';
import { checkSuzyLafayette } from '../_shared/characters.ts';
import { corsHeaders } from '../_shared/cors.ts';

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

    const { data: cbCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me.id).eq('card_type', 'cat_balou').limit(1).single();
    if (!cbCard) throw new Error('Vous n’avez pas de carte Coup de foudre en main');

    const { data: targetHand } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', target.id);
    const { data: targetEquipment } = await supabaseAdmin.from('cards_in_play').select('id').eq('player_id', target.id);
    if (!targetHand?.length && !targetEquipment?.length) throw new Error('Ce joueur n’a aucune carte à défausser');

    await supabaseAdmin.from('hand_cards').delete().eq('id', cbCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'cat_balou', suit: cbCard.suit, value: cbCard.value });

    const eventId = await logEvent(gameId, 'catbalou_played', { actorSeat: me.seat_position, targetSeat: target.seat_position });
    await startPending(gameId, me.id, 'cat_balou_discard', [{ playerId: target.id, isCurrentTurn: true }], 20000, eventId);
    await checkSuzyLafayette(gameId, me.id, eventId);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});