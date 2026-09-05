const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function seed() {
  const players = [];
  for (let seat = 0; seat < 4; seat++) {
    const client = createClient(LOCAL_URL, ANON_KEY);
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    players.push({ userId: data.user.id, accessToken: data.session.access_token, seat });
  }

  const { data: game, error: gameError } = await admin.from('games').insert({ status: 'lobby' }).select().single();
  if (gameError) throw gameError;

  for (const p of players) {
    const { error } = await admin.from('players').insert({ game_id: game.id, user_id: p.userId, seat_position: p.seat });
    if (error) throw error;
  }

  const startRes = await fetch(`${LOCAL_URL}/functions/v1/start-game`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${players[0].accessToken}`, apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: game.id }),
  });
  const startBody = await startRes.json();
  if (!startRes.ok) throw new Error(`start-game a échoué: ${JSON.stringify(startBody)}`);

  const { data: dbPlayers } = await admin.from('players').select('id, seat_position, is_sheriff').eq('game_id', game.id);

  console.log('gameId:', game.id);
  players.forEach(p => {
    const dbP = dbPlayers.find(d => d.seat_position === p.seat);
    console.log(`siège ${p.seat}${dbP.is_sheriff ? ' (Shérif)' : ''} — playerId: ${dbP.id} — token: ${p.accessToken}`);
  });
}

seed().catch(console.error);