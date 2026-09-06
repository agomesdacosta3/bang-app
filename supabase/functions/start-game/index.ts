import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const ROLE_SETUP: Record<number, { outlaws: number; deputies: number }> = {
  4: { outlaws: 2, deputies: 0 }, 5: { outlaws: 2, deputies: 1 },
  6: { outlaws: 3, deputies: 1 }, 7: { outlaws: 3, deputies: 2 },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(): string[] {
  return shuffle([
    ...Array(20).fill('bang'),
    ...Array(10).fill('missed'),
    ...Array(6).fill('beer'),
    ...Array(3).fill('duel'),
    ...Array(2).fill('indians'),
  ]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const token = req.headers.get('Authorization')!.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('Non authentifié');

    const { gameId } = await req.json();
    const { data: game } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
    if (!game) throw new Error('Partie introuvable');
    if (game.status !== 'lobby') throw new Error('La partie a déjà démarré');

    const { data: players } = await supabaseAdmin.from('players').select('*').eq('game_id', gameId).order('seat_position');
    if (!players || !ROLE_SETUP[players.length]) throw new Error('Il faut entre 4 et 7 joueurs pour démarrer');
    if (!players.some(p => p.user_id === user.id)) throw new Error('Vous ne participez pas à cette partie');

    const { outlaws, deputies } = ROLE_SETUP[players.length];
    const shuffled = shuffle(players);
    const sheriff = shuffled[0];
    const renegade = shuffled[1];
    const outlawPlayers = shuffled.slice(2, 2 + outlaws);
    const deputyPlayers = shuffled.slice(2 + outlaws, 2 + outlaws + deputies);

    await supabaseAdmin.from('players').update({ is_sheriff: true, life_points: 5, max_life_points: 5 }).eq('id', sheriff.id);
    await supabaseAdmin.from('players').update({ life_points: 4, max_life_points: 4 })
      .in('id', players.filter(p => p.id !== sheriff.id).map(p => p.id));

    await supabaseAdmin.from('player_roles').insert([
      { player_id: renegade.id, role: 'renegade' },
      ...outlawPlayers.map(p => ({ player_id: p.id, role: 'outlaw' })),
      ...deputyPlayers.map(p => ({ player_id: p.id, role: 'deputy' })),
    ]);

    let deck = buildDeck();
    const handInserts: { player_id: string; card_type: string }[] = [];
    for (const p of players) {
      const handSize = p.id === sheriff.id ? 5 : 4;
      handInserts.push(...deck.slice(-handSize).map(card_type => ({ player_id: p.id, card_type })));
      deck = deck.slice(0, -handSize);
    }
    await supabaseAdmin.from('hand_cards').insert(handInserts);
    await supabaseAdmin.from('deck_state').insert({ game_id: gameId, cards: deck });

    await supabaseAdmin.from('games').update({
      status: 'in_progress', current_player_id: sheriff.id, turn_phase: 'draw', deck_remaining: deck.length,
    }).eq('id', gameId);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});