import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { degainer } from '../_shared/degainer.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { advanceTurn } from '../_shared/turn.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'draw') throw new Error('Ce n’est pas le moment de dégainer');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const { data: equipment } = await supabaseAdmin.from('cards_in_play').select('id, card_type, suit, value').eq('player_id', me.id);
    const dynamiteRow = equipment?.find(c => c.card_type === 'dynamite');
    const prisonRow = equipment?.find(c => c.card_type === 'prison');
    if (!dynamiteRow && !prisonRow) throw new Error('Rien à dégainer');

    if (dynamiteRow) {
      const drawn = await degainer(gameId);
      await supabaseAdmin.from('cards_in_play').delete().eq('id', dynamiteRow.id);
      const explodes = drawn.suit === 'spades' && drawn.value >= 2 && drawn.value <= 9;

      if (explodes) {
        await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'dynamite', suit: dynamiteRow.suit, value: dynamiteRow.value });
        await applyDamage(gameId, me.id, 3);
        const { data: after } = await supabaseAdmin.from('players').select('is_alive').eq('id', me.id).single();
        if (!after!.is_alive) {
          const next = await advanceTurn(gameId, me.id);
          return new Response(JSON.stringify({ ok: true, eliminatedByDynamite: true, turnEnded: true, nextPlayerId: next.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        const { data: allPlayers } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
        const alive = allPlayers!.filter(p => p.is_alive);
        const myIndex = alive.findIndex(p => p.id === me.id);
        const leftNeighbor = alive[(myIndex + 1) % alive.length];
        await supabaseAdmin.from('cards_in_play').insert({ player_id: leftNeighbor.id, card_type: 'dynamite', suit: dynamiteRow.suit, value: dynamiteRow.value });
      }
    }

    if (prisonRow) {
      const drawn = await degainer(gameId);
      await supabaseAdmin.from('cards_in_play').delete().eq('id', prisonRow.id);
      await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: 'prison', suit: prisonRow.suit, value: prisonRow.value });
      if (drawn.suit !== 'hearts') {
        const next = await advanceTurn(gameId, me.id);
        return new Response(JSON.stringify({ ok: true, skippedTurn: true, turnEnded: true, nextPlayerId: next.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ ok: true, turnEnded: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});