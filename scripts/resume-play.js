const { createClient } = require('@supabase/supabase-js');
const { LOCAL_URL, ANON_KEY, SERVICE_ROLE_KEY, runGameLoop, printGameSummary } = require('./bot-lib');

const GAME_ID = process.argv[2];
if (!GAME_ID) {
  console.error('Usage: node scripts/resume-play.js GAME_ID');
  process.exit(1);
}

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function reassignToFreshBot(playerId, seat) {
  const anon = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInAnonymously();
  if (error) throw error;
  const { error: updateError } = await admin.from('players').update({ user_id: data.user.id }).eq('id', playerId);
  if (updateError) throw updateError;
  console.log(`Bot repris — siège ${seat}, playerId ${playerId}`);
  return { client: anon, token: data.session.access_token, playerId, seat };
}

async function run() {
  const { data: allPlayers } = await admin.from('players').select('id, seat_position').eq('game_id', GAME_ID).order('seat_position');
  if (!allPlayers?.length) throw new Error('Partie introuvable ou sans joueurs');

  const botPlayers = allPlayers.filter(p => p.seat_position !== 0);
  const bots = [];
  for (const p of botPlayers) {
    bots.push(await reassignToFreshBot(p.id, p.seat_position));
  }

  await printGameSummary(admin, GAME_ID);
  await runGameLoop(admin, GAME_ID, bots);
}

run().catch(console.error);