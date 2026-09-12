import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { performDrawPhaseDegainer } from '../_shared/turnStart.ts';
import { drawFromDeck } from '../_shared/deck.ts';
import { advanceTurn } from '../_shared/turn.ts';
import { touchTurnActivity } from '../_shared/turnActivity.ts';
import { logEvent } from '../_shared/events.ts';
import { eliminatePlayerForAbandonment } from '../_shared/abandon.ts';

const TURN_TIMEOUT_MS = 60_000;
const MAX_AUTO_PASSES = 3;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();

    if (!game || game.status !== 'in_progress' || game.pending_type) {
      // Une confrontation en cours relève de resolve-timeout, pas de ce minuteur.
      return new Response(JSON.stringify({ ok: true, acted: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!game.turn_activity_at || Date.now() - new Date(game.turn_activity_at).getTime() < TURN_TIMEOUT_MS) {
      return new Response(JSON.stringify({ ok: true, acted: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: current } = await supabaseAdmin.from('players').select('*').eq('id', game.current_player_id).single();
    if (!current || !current.is_alive) {
      return new Response(JSON.stringify({ ok: true, acted: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (current.consecutive_auto_passes >= MAX_AUTO_PASSES) {
      await eliminatePlayerForAbandonment(gameId, current.id, 'inactivity');
      return new Response(JSON.stringify({ ok: true, acted: true, eliminated: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (game.turn_phase === 'draw') {
      const turnEnded = await performDrawPhaseDegainer(gameId, current.id);
      if (turnEnded) {
        await supabaseAdmin.from('players').update({ consecutive_auto_passes: current.consecutive_auto_passes + 1 }).eq('id', current.id);
        await logEvent(gameId, 'turn_auto_passed', { actorSeat: current.seat_position });
        return new Response(JSON.stringify({ ok: true, acted: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const drawn = await drawFromDeck(gameId, 2);
      await supabaseAdmin.from('hand_cards').insert(drawn.map(c => ({ player_id: current.id, card_type: c.type, suit: c.suit, value: c.value })));
      await supabaseAdmin.from('players').update({ has_played_bang_this_turn: false }).eq('id', current.id);
      await supabaseAdmin.from('games').update({ turn_phase: 'play' }).eq('id', gameId);
    }

    const { data: freshHand } = await supabaseAdmin.from('hand_cards').select('*').eq('player_id', current.id);
    const { data: freshPlayer } = await supabaseAdmin.from('players').select('life_points').eq('id', current.id).single();
    const excess = (freshHand?.length ?? 0) - freshPlayer!.life_points;
    if (excess > 0) {
      const toDiscard = freshHand!.slice(0, excess);
      await supabaseAdmin.from('hand_cards').delete().in('id', toDiscard.map(c => c.id));
      await supabaseAdmin.from('discard_pile').insert(toDiscard.map(c => ({ game_id: gameId, card_type: c.card_type, suit: c.suit, value: c.value })));
    }

    await logEvent(gameId, 'turn_auto_passed', { actorSeat: current.seat_position });
    await supabaseAdmin.from('players').update({ consecutive_auto_passes: current.consecutive_auto_passes + 1 }).eq('id', current.id);
    await advanceTurn(gameId, current.id);
    await touchTurnActivity(gameId);

    return new Response(JSON.stringify({ ok: true, acted: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});