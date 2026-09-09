import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const ROLE_SETUP: Record<number, { outlaws: number; deputies: number }> = {
  4: { outlaws: 2, deputies: 0 }, 5: { outlaws: 2, deputies: 1 },
  6: { outlaws: 3, deputies: 1 }, 7: { outlaws: 3, deputies: 2 },
};

const ALL_CHARACTERS = [
  'bart_cassidy', 'black_jack', 'calamity_janet', 'el_gringo', 'jesse_jones',
  'jourdonnais', 'kit_carlson', 'lucky_duke', 'paul_regret', 'pedro_ramirez',
  'rose_doolan', 'sid_ketchum', 'slab_the_killer', 'suzy_lafayette', 'vulture_sam', 'willy_the_kid',
];
const CHARACTER_BASE_LIFE: Record<string, number> = { paul_regret: 3, el_gringo: 3 };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomCard(type: string) {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { type, suit: suits[Math.floor(Math.random() * 4)], value: 2 + Math.floor(Math.random() * 13) };
}

function buildDeck(): { type: string; suit: string; value: number }[] {
  const deck: { type: string; suit: string; value: number }[] = [
    { type: 'missed', suit: 'spades', value: 2 }, { type: 'missed', suit: 'spades', value: 3 },
    { type: 'missed', suit: 'spades', value: 4 }, { type: 'missed', suit: 'spades', value: 5 },
    { type: 'missed', suit: 'spades', value: 6 }, { type: 'missed', suit: 'spades', value: 7 },
    { type: 'missed', suit: 'spades', value: 8 }, { type: 'missed', suit: 'clubs', value: 14 },
    { type: 'missed', suit: 'clubs', value: 10 }, { type: 'missed', suit: 'clubs', value: 12 },
    { type: 'missed', suit: 'clubs', value: 11 }, { type: 'missed', suit: 'clubs', value: 13 },
    { type: 'general_store', suit: 'spades', value: 12 }, { type: 'general_store', suit: 'clubs', value: 9 },
    { type: 'cat_balou', suit: 'hearts', value: 13 }, { type: 'cat_balou', suit: 'diamonds', value: 9 },
    { type: 'cat_balou', suit: 'diamonds', value: 10 }, { type: 'cat_balou', suit: 'diamonds', value: 11 },
    { type: 'beer', suit: 'hearts', value: 6 }, { type: 'beer', suit: 'hearts', value: 7 },
    { type: 'beer', suit: 'hearts', value: 8 }, { type: 'beer', suit: 'hearts', value: 9 },
    { type: 'beer', suit: 'hearts', value: 10 }, { type: 'beer', suit: 'hearts', value: 11 },
    { type: 'gatling', suit: 'hearts', value: 10 },
    { type: 'saloon', suit: 'hearts', value: 5 },
    { type: 'stagecoach', suit: 'hearts', value: 3 },
    { type: 'wells_fargo', suit: 'spades', value: 9 }, { type: 'wells_fargo', suit: 'spades', value: 9 },
    { type: 'duel', suit: 'diamonds', value: 12 }, { type: 'duel', suit: 'spades', value: 11 }, { type: 'duel', suit: 'clubs', value: 8 },
    { type: 'indians', suit: 'diamonds', value: 14 }, { type: 'indians', suit: 'diamonds', value: 13 },
    { type: 'panic', suit: 'hearts', value: 14 }, { type: 'panic', suit: 'hearts', value: 11 },
    { type: 'panic', suit: 'hearts', value: 12 }, { type: 'panic', suit: 'diamonds', value: 8 },
    { type: 'bang', suit: 'spades', value: 14 }, { type: 'bang', suit: 'hearts', value: 14 },
    { type: 'bang', suit: 'hearts', value: 12 }, { type: 'bang', suit: 'hearts', value: 13 },
    { type: 'bang', suit: 'clubs', value: 2 }, { type: 'bang', suit: 'clubs', value: 3 },
    { type: 'bang', suit: 'clubs', value: 4 }, { type: 'bang', suit: 'clubs', value: 5 },
    { type: 'bang', suit: 'clubs', value: 6 }, { type: 'bang', suit: 'clubs', value: 7 },
    { type: 'bang', suit: 'clubs', value: 8 }, { type: 'bang', suit: 'clubs', value: 9 },
    { type: 'bang', suit: 'diamonds', value: 2 }, { type: 'bang', suit: 'diamonds', value: 3 },
    { type: 'bang', suit: 'diamonds', value: 4 }, { type: 'bang', suit: 'diamonds', value: 5 },
    { type: 'bang', suit: 'diamonds', value: 6 }, { type: 'bang', suit: 'diamonds', value: 7 },
    { type: 'bang', suit: 'diamonds', value: 8 }, { type: 'bang', suit: 'diamonds', value: 9 },
    { type: 'bang', suit: 'diamonds', value: 10 }, { type: 'bang', suit: 'diamonds', value: 11 },
    { type: 'bang', suit: 'diamonds', value: 12 }, { type: 'bang', suit: 'diamonds', value: 13 },
    { type: 'bang', suit: 'diamonds', value: 14 },
    { type: 'dynamite', suit: 'hearts', value: 2 },
    { type: 'prison', suit: 'hearts', value: 4 }, { type: 'prison', suit: 'spades', value: 11 }, { type: 'prison', suit: 'spades', value: 10 },
    { type: 'scope', suit: 'spades', value: 14 },
    { type: 'mustang', suit: 'hearts', value: 8 }, { type: 'mustang', suit: 'hearts', value: 9 },
    { type: 'barrel', suit: 'spades', value: 13 }, { type: 'barrel', suit: 'spades', value: 12 },
    { type: 'winchester', suit: 'spades', value: 8 },
    { type: 'carbine', suit: 'clubs', value: 14 },
    { type: 'remington', suit: 'clubs', value: 13 },
    { type: 'schofield', suit: 'spades', value: 13 }, { type: 'schofield', suit: 'clubs', value: 11 }, { type: 'schofield', suit: 'clubs', value: 12 },
    { type: 'volcanic', suit: 'spades', value: 10 }, { type: 'volcanic', suit: 'clubs', value: 10 },
  ];
  return shuffle(deck);
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
    const shuffledPlayers = shuffle(players);
    const sheriff = shuffledPlayers[0];
    const renegade = shuffledPlayers[1];
    const outlawPlayers = shuffledPlayers.slice(2, 2 + outlaws);
    const deputyPlayers = shuffledPlayers.slice(2 + outlaws, 2 + outlaws + deputies);

    await supabaseAdmin.from('player_roles').insert([
      { player_id: renegade.id, role: 'renegade' },
      ...outlawPlayers.map(p => ({ player_id: p.id, role: 'outlaw' })),
      ...deputyPlayers.map(p => ({ player_id: p.id, role: 'deputy' })),
    ]);

    // Personnages : un par joueur, tirés au hasard parmi les 16, révélés à tous dès le départ
    const shuffledCharacters = shuffle(ALL_CHARACTERS).slice(0, players.length);
    const characterByPlayer = new Map(players.map((p, i) => [p.id, shuffledCharacters[i]]));

    await supabaseAdmin.from('player_characters').insert(
      players.map(p => ({ player_id: p.id, character: characterByPlayer.get(p.id) }))
    );

    // Vie et taille de main initiale : base du personnage (4 par défaut) + 1 pour le Shérif
    let deck = buildDeck();
    const handInserts: { player_id: string; card_type: string; suit: string; value: number }[] = [];

    for (const p of players) {
      const character = characterByPlayer.get(p.id)!;
      const base = CHARACTER_BASE_LIFE[character] ?? 4;
      const life = base + (p.id === sheriff.id ? 1 : 0);

      await supabaseAdmin.from('players').update({
        is_sheriff: p.id === sheriff.id, life_points: life, max_life_points: life,
      }).eq('id', p.id);

      const dealt = deck.slice(-life);
      deck = deck.slice(0, -life);
      handInserts.push(...dealt.map(c => ({ player_id: p.id, card_type: c.type, suit: c.suit, value: c.value })));
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