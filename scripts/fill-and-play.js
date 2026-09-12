const { createClient } = require('@supabase/supabase-js');
const { LOCAL_URL, ANON_KEY, SERVICE_ROLE_KEY, call, runGameLoop, printGameSummary } = require('./bot-lib');

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/fill-and-play.js CODE');
  process.exit(1);
}

const TOTAL_PLAYERS = 4; // ajustable entre 4 et 7 — complète le lobby existant jusqu'à ce total

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
  const bots = [];
  let gameId;

  const firstClient = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: firstAuth, error: firstAuthError } = await firstClient.auth.signInAnonymously();
  if (firstAuthError) throw firstAuthError;
  const firstJoined = await call('join-game', firstAuth.session.access_token, { joinCode: JOIN_CODE });
  gameId = firstJoined.gameId;
  bots.push({ client: firstClient, token: firstAuth.session.access_token, playerId: firstJoined.playerId, seat: firstJoined.seatPosition });
  console.log(`Bot rejoint — siège ${firstJoined.seatPosition}`);

  const { data: currentPlayers } = await admin.from('players').select('id').eq('game_id', gameId);
  const botsNeeded = Math.max(0, TOTAL_PLAYERS - (currentPlayers?.length ?? 1));

  for (let i = 0; i < botsNeeded; i++) {
    const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    const joined = await call('join-game', data.session.access_token, { joinCode: JOIN_CODE });
    bots.push({ client, token: data.session.access_token, playerId: joined.playerId, seat: joined.seatPosition });
    console.log(`Bot rejoint — siège ${joined.seatPosition}`);
  }

  await call('start-game', bots[0].token, { gameId });
  console.log('Partie démarrée.');
  await printGameSummary(admin, gameId);

  await runGameLoop(admin, gameId, bots);
}

run().catch(console.error);