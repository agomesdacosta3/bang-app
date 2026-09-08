import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { computeDistance } from '../_shared/distance.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, targetPlayerId, source, cardType } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'play') throw new Error('Ce n’est pas le moment de jouer une carte');
    if (game.pending_type) throw new Error('Une réponse est déjà en attente');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId);
    const me = players!.find(p => p.user_id === user.id);
    if (!me) throw new Error('Vous ne participez pas à cette partie');
    if (game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const target = players!.find(p => p.id === targetPlayerId);
    if (!target?.is_alive || target.id === me.id) throw new Error('Cible invalide');

    const { data: allEquipment } = await supabaseAdmin.from('cards_in_play').select('player_id, card_type').in('player_id', players!.map(p => p.id));
    const mustangIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'mustang').map(e => e.player_id));
    const scopeIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'scope').map(e => e.player_id));
    const distance = computeDistance(players!, me.id, target.id, { mustangIds, scopeIds });
    if (distance > 1) throw new Error(`Hors de portée (distance ${distance}, Braquage = distance 1)`);

    const { data: panicCard } = await supabaseAdmin.from('hand_cards').select('id, suit, value').eq('player_id', me.id).eq('card_type', 'panic').limit(1).single();
    if (!panicCard) throw new Error('Vous n’avez pas de carte Braquage! en main');

    let stolenCardType = '';
    if (source === 'hand') {
      const { data: targetHand } = await supabaseAdmin.from('hand_cards').select('id, card_type').eq('player_id', target.id);
      if (!targetHand?.length) throw new Error('Ce joueur n’a aucune carte en main');
      const stolen = targetHand[Math.floor(Math.random() * targetHand.length)];
      await supabaseAdmin.from('hand_cards').update({ player_id: me.id }).eq('id', stolen.id);
      stolenCardType = stolen.card_type;
    } else if (source === 'in_play') {
      const { data: eq } = await supabaseAdmin.from('cards_in_play').select('id, suit, value').eq('player_id', target.id).eq('card_type', cardType).maybeSingle();
      if (!eq) throw new Error('Ce joueur n’a pas cette carte en jeu');
      await supabaseAdmin.from('cards_in_play').delete().eq('id', eq.id);
      await supabaseAdmin.from('hand_cards').insert({ player_id: me.id, card_type: cardType, suit: eq.suit, value: eq.value });
      stolenCardType = cardType;
    } else {
      throw new Error('Source invalide');
    }

    await supabaseAdmin.from('hand_cards').delete().eq('id', panicCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'panic', suit: panicCard.suit, value: panicCard.value });

    return new Response(JSON.stringify({ ok: true, stolenCardType }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});