import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamage } from '../_shared/applyDamage.ts';
import { clearPending } from '../_shared/pending.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game?.pending_type || new Date(game.pending_expires_at) > new Date()) {
      return new Response(JSON.stringify({ ok: true, resolved: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: toResolve } = await supabaseAdmin.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true);
    for (const row of toResolve ?? []) {
      await applyDamage(gameId, row.player_id);
    }
    await clearPending(gameId); // supprime aussi la ligne inactive restante d'un duel en cours

    return new Response(JSON.stringify({ ok: true, resolved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});