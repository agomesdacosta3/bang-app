const { createClient } = require('@supabase/supabase-js');
const { LOCAL_URL, ANON_KEY, SERVICE_ROLE_KEY, call, runGameLoop, printGameSummary } = require('./bot-lib');

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/fill-and-play.js CODE');
  process.exit(1);
}

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
  const bots = [];
  let gameId;
  for (let i = 0; i < 3; i++) {
    const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    const joined = await call('join-game', data.session.access_token, { joinCode: JOIN_CODE });
    gameId = joined.gameId;
    bots.push({ client, token: data.session.access_token, playerId: joined.playerId, seat: joined.seatPosition });
    console.log(`Bot ${i + 1} a rejoint — siège ${joined.seatPosition}, playerId ${joined.playerId}`);
  }

  await call('start-game', bots[0].token, { gameId });
  console.log('Partie démarrée.');
  await printGameSummary(admin, gameId);

  await runGameLoop(admin, gameId, bots);
}

run().catch(console.error);