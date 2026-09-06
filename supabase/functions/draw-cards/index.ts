import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { degainer } from '../_shared/degainer.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { advanceTurn } from '../_shared/turn.ts';

interface DeckCard { type: string; suit: string; value: number; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game || game.status !== 'in_progress' || game.turn_phase !== 'draw') throw new Error('Ce n’est pas la phase de pioche');

    const { data: me } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).eq('user_id', user.id).single();
    if (!me || game.current_player_id !== me.id) throw new Error('Ce n’est pas votre tour');

    const { data: equipment } = await supabaseAdmin.from('cards_in_play').select('card_type').eq('player_id', me.id);
    const hasDynamite = equipment?.some(c => c.card_type === 'dynamite');
    const hasPrison = equipment?.some(c => c.card_type === 'prison');

    if (hasDynamite) {
      const drawn = await degainer(gameId);
      await supabaseAdmin.from('cards_in_play').delete().eq('player_id', me.id).eq('card_type', 'dynamite');
      const explodes = drawn.suit === 'spades' && drawn.value >= 2 && drawn.value <= 9;

      if (explodes) {
        await applyDamage(gameId, me.id, 3);
        const { data: after } = await supabaseAdmin.from('players').select('is_alive').eq('id', me.id).single();
        if (!after!.is_alive) {
          const next = await advanceTurn(gameId, me.id);
          return new Response(JSON.stringify({ ok: true, eliminatedByDynamite: true, nextPlayerId: next.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        const { data: allPlayers } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
        const alive = allPlayers!.filter(p => p.is_alive);
        const myIndex = alive.findIndex(p => p.id === me.id);
        const leftNeighbor = alive[(myIndex + 1) % alive.length];
        await supabaseAdmin.from('cards_in_play').insert({ player_id: leftNeighbor.id, card_type: 'dynamite' });
      }
    }

    if (hasPrison) {
      const drawn = await degainer(gameId);
      await supabaseAdmin.from('cards_in_play').delete().eq('player_id', me.id).eq('card_type', 'prison');
      if (drawn.suit !== 'hearts') {
        const next = await advanceTurn(gameId, me.id);
        return new Response(JSON.stringify({ ok: true, skippedTurn: true, nextPlayerId: next.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { data: deckRow } = await supabaseAdmin.from('deck_state').select('cards').eq('game_id', gameId).single();
    let deck: DeckCard[] = deckRow!.cards;

    if (deck.length < 2) {
      const { data: discarded } = await supabaseAdmin.from('discard_pile').select('id, card_type, suit, value').eq('game_id', gameId);
      const reshuffled = shuffle((discarded ?? []).map(d => ({ type: d.card_type, suit: d.suit, value: d.value })));
      deck = [...reshuffled, ...deck];
      if (discarded?.length) await supabaseAdmin.from('discard_pile').delete().in('id', discarded.map(d => d.id));
    }
    if (deck.length < 2) throw new Error('Plus assez de cartes, même après remélange de la défausse');

    const drawn2 = deck.slice(-2);
    deck = deck.slice(0, -2);

    await supabaseAdmin.from('hand_cards').insert(drawn2.map(c => ({ player_id: me.id, card_type: c.type, suit: c.suit, value: c.value })));
    await supabaseAdmin.from('deck_state').update({ cards: deck }).eq('game_id', gameId);
    await supabaseAdmin.from('players').update({ has_played_bang_this_turn: false }).eq('id', me.id);
    await supabaseAdmin.from('games').update({ turn_phase: 'play', deck_remaining: deck.length }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true, drawn: drawn2.map(c => c.type) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});