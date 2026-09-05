import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { applyDamageAndClearPending } from '../_shared/applyDamage.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game?.pending_type || new Date(game.pending_expires_at) > new Date()) {
      return new Response(JSON.stringify({ ok: true, resolved: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    await applyDamageAndClearPending(gameId, game.pending_target_id);
    return new Response(JSON.stringify({ ok: true, resolved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});