import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { clearPending } from '../_shared/pending.ts';
import { pickGeneralStoreCard } from '../_shared/generalStore.ts';
import { randomSuitValue } from '../_shared/cardIdentity.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game?.pending_type || !game.pending_expires_at || new Date(game.pending_expires_at) > new Date()) {
      return new Response(JSON.stringify({ ok: true, resolved: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (game.pending_type === 'general_store') {
      const { data: current } = await supabaseAdmin.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true).single();
      await pickGeneralStoreCard(gameId, current!.player_id);
    } else if (game.pending_type === 'cat_balou_discard') {
      const { data: targetRow } = await supabaseAdmin.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true).single();
      const { data: hand } = await supabaseAdmin.from('hand_cards').select('id, card_type, suit, value').eq('player_id', targetRow!.player_id);
      const { data: equip } = await supabaseAdmin.from('cards_in_play').select('id, card_type').eq('player_id', targetRow!.player_id);
      const pool = [
        ...(hand ?? []).map(c => ({ kind: 'hand' as const, ...c })),
        ...(equip ?? []).map(c => ({ kind: 'equip' as const, ...c })),
      ];
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick.kind === 'hand') {
          await supabaseAdmin.from('hand_cards').delete().eq('id', pick.id);
          await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: pick.card_type, suit: pick.suit, value: pick.value });
        } else {
          await supabaseAdmin.from('cards_in_play').delete().eq('id', pick.id);
          const rv = randomSuitValue();
          await supabaseAdmin.from('discard_pile').insert({ game_id: gameId, card_type: pick.card_type, suit: rv.suit, value: rv.value });
        }
      }
      await clearPending(gameId);
    } else {
      const { data: toResolve } = await supabaseAdmin.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true);
      for (const row of toResolve ?? []) {
        await applyDamage(gameId, row.player_id);
      }
      await clearPending(gameId);
    }

    return new Response(JSON.stringify({ ok: true, resolved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});