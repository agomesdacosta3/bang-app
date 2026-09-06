const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/fill-and-play.js CODE');
  process.exit(1);
}

async function call(fn, token, body) {
  const res = await fetch(`${LOCAL_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${fn} a échoué: ${JSON.stringify(data)}`);
  return data;
}

async function makeBot() {
  const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return { client, token: data.session.access_token };
}

async function passTurn(bot, gameId) {
  await call('draw-cards', bot.token, { gameId });

  const { data: me } = await bot.client.from('players').select('life_points').eq('id', bot.playerId).single();
  const { data: hand } = await bot.client.from('hand_cards').select('id').eq('player_id', bot.playerId);
  const excess = hand.length - me.life_points;
  const cardIds = excess > 0 ? hand.slice(0, excess).map(c => c.id) : [];

  await call('discard-cards', bot.token, { gameId, cardIds });
}

async function run() {
  const bots = [];
  let gameId;
  for (let i = 0; i < 3; i++) {
    const bot = await makeBot();
    const joined = await call('join-game', bot.token, { joinCode: JOIN_CODE });
    gameId = joined.gameId;
    bots.push({ ...bot, playerId: joined.playerId, seat: joined.seatPosition });
    console.log(`Bot ${i + 1} a rejoint — siège ${joined.seatPosition}, playerId ${joined.playerId}`);
  }

  await call('start-game', bots[0].token, { gameId });
  console.log('Partie démarrée.\n');

  for (let i = 0; i < 20; i++) {
    const { data: game } = await bots[0].client.from('games').select('current_player_id, status').eq('id', gameId).single();
    if (game.status === 'finished') { console.log('Partie terminée.'); return; }

    const bot = bots.find(b => b.playerId === game.current_player_id);
    if (!bot) { console.log('C’est le tour du téléphone — go !'); return; }

    console.log(`Passage du tour — siège ${bot.seat}...`);
    await passTurn(bot, gameId);
  }
  console.log('Limite de 20 tours atteinte sans arriver à votre tour.');
}

run().catch(console.error);