const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'COLLE_ICI_LA_CLE_ANON_LOCALE';
const PUBLISHABLE_KEY = 'sb_publishable_...';

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

async function run() {
  const players = [];
  for (let i = 0; i < 4; i++) {
    const client = createClient(LOCAL_URL, ANON_KEY);
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    players.push({ userId: data.user.id, accessToken: data.session.access_token });
  }

  const created = await call('create-game', players[0].accessToken, {});
  console.log('gameId:', created.gameId, '— joinCode:', created.joinCode);

  const seated = [{ ...players[0], playerId: created.playerId, seat: 0 }];
  for (let i = 1; i < players.length; i++) {
    const joined = await call('join-game', players[i].accessToken, { joinCode: created.joinCode });
    seated.push({ ...players[i], playerId: joined.playerId, seat: joined.seatPosition });
  }

  await call('start-game', players[0].accessToken, { gameId: created.gameId });

  const client0 = createClient(LOCAL_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${players[0].accessToken}` } } });
  const { data: dbPlayers, error: dbErr } = await client0.from('players').select('id, seat_position, is_sheriff').eq('game_id', created.gameId);
  if (dbErr) throw dbErr;

  seated.forEach(p => {
    const dbP = dbPlayers.find(d => d.id === p.playerId);
    console.log(`siège ${p.seat}${dbP.is_sheriff ? ' (Shérif)' : ''} — playerId: ${p.playerId} — token: ${p.accessToken}`);
  });
}

run().catch(console.error);