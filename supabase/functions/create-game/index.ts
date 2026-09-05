import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0, I/1, L pour éviter les confusions à l'oral/écrit

function generateCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    let joinCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const { data: existing } = await supabaseAdmin.from('games').select('id').eq('join_code', candidate).maybeSingle();
      if (!existing) { joinCode = candidate; break; }
    }
    if (!joinCode) throw new Error('Impossible de générer un code unique, réessayez');

    const { data: game, error: gameError } = await supabaseAdmin
      .from('games').insert({ status: 'lobby', join_code: joinCode }).select().single();
    if (gameError) throw gameError;

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players').insert({ game_id: game.id, user_id: user.id, seat_position: 0 }).select().single();
    if (playerError) throw playerError;

    return new Response(JSON.stringify({ ok: true, gameId: game.id, joinCode, playerId: player.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});