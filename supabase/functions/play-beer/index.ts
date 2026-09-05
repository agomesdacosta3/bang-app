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
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'play') throw new Error('Ce n’est pas le moment de jouer une carte');
    if (game.pending_type) throw new Error('Une réponse est déjà en attente');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId);
    const me = players!.find(p => p.user_id === user.id);
    if (!me) throw new Error('Vous ne participez pas à cette partie');
    if (game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const aliveCount = players!.filter(p => p.is_alive).length;
    if (aliveCount <= 2) throw new Error('La Bière n’a aucun effet à 2 joueurs ou moins');
    if (me.life_points >= me.max_life_points) throw new Error('Vous êtes déjà au maximum de points de vie');

    const { data: beerCard } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', me.id).eq('card_type', 'beer').limit(1).single();
    if (!beerCard) throw new Error('Vous n’avez pas de carte Bière en main');

    await supabaseAdmin.from('hand_cards').delete().eq('id', beerCard.id);
    await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'beer' });
    await supabaseAdmin.from('players').update({ life_points: me.life_points + 1 }).eq('id', me.id);

    return new Response(JSON.stringify({ ok: true, newLifePoints: me.life_points + 1 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});