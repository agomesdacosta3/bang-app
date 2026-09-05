import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId, cardIds } = await req.json(); // cardIds: string[], peut être vide
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'play') throw new Error('Ce n’est pas la phase de défausse');
    if (game.pending_type) throw new Error('Une réponse est en attente, impossible de terminer le tour');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
    const me = players!.find(p => p.user_id === user.id);
    if (!me || game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const { data: hand } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', me.id);
    if (hand!.length - cardIds.length > me.life_points) throw new Error(`Vous devez défausser jusqu’à ${me.life_points} carte(s) en main`);

    if (cardIds.length) {
      const toDiscard = hand!.filter(h => cardIds.includes(h.id));
      if (toDiscard.length !== cardIds.length) throw new Error('Une des cartes indiquées ne vous appartient pas');
      const { data: discardedCards } = await supabaseAdmin.from('hand_cards').select('id, card_type').in('id', cardIds);
      await supabaseAdmin.from('hand_cards').delete().in('id', cardIds);
      await supabaseAdmin.from('discard_pile').insert(discardedCards!.map(c => ({ game_id: gameId, card_type: c.card_type })));
    }

    const alive = players!.filter(p => p.is_alive).sort((a, b) => a.seat_position - b.seat_position);
    const next = alive[(alive.findIndex(p => p.id === me.id) + 1) % alive.length];

    await supabaseAdmin.from('games').update({ current_player_id: next.id, turn_phase: 'draw' }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true, nextPlayerId: next.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});