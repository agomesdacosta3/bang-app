import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computeDistance } from '../_shared/distance.ts';
import { getWeaponRange } from '../_shared/weapons.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { startPending } from '../_shared/pending.ts';
import { logEvent } from '../_shared/events.ts';
import { buildDistanceFlags } from '../_shared/distanceFlags.ts';
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

    const { data: allEquipment } = await supabaseAdmin.from('cards_in_play').select('player_id, card_type').in('player_id', players!.map(p => p.id));
    const myEquipmentTypes = (allEquipment ?? []).filter(e => e.player_id === me.id).map(e => e.card_type);
    const hasVolcanic = myEquipmentTypes.includes('volcanic');

    if (!hasVolcanic && me.has_played_bang_this_turn) throw new Error('Une seule carte Bang! par tour');

    const target = players!.find(p => p.id === targetPlayerId);
    if (!target?.is_alive) throw new Error('Cible invalide');

    const { mustangIds, scopeIds } = await buildDistanceFlags(players!.map(p => p.id));
    const distance = computeDistance(players!, me.id, target.id, { mustangIds, scopeIds });
    const weaponRange = getWeaponRange(myEquipmentTypes);
    if (distance > weaponRange) throw new Error(`Hors de portée (distance ${distance}, votre arme porte à ${weaponRange})`);

    const { data: bangCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me.id).eq('card_type', 'bang').limit(1).single();
    if (!bangCard) throw new Error('Vous n’avez pas de carte Bang! en main');

    await supabaseAdmin.from('hand_cards').delete().eq('id', bangCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'bang', suit: bangCard.suit, value: bangCard.value });
    await supabaseAdmin.from('players').update({ has_played_bang_this_turn: true }).eq('id', me.id);
    await startPending(gameId, me.id, 'bang_response', [{ playerId: target.id, isCurrentTurn: true }]);
    await logEvent(gameId, 'bang_played', { actorSeat: me.seat_position, targetSeat: target.seat_position });
    await checkSuzyLafayette(gameId, me.id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});