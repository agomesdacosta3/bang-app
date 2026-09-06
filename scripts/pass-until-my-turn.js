const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const GAME_ID = '094d5065-08d8-485b-9574-21cb2c89bbec';
const MY_PLAYER_ID = 'c5d3e10a-1e48-4eeb-9236-900391f8f0f8';

// Les 3 joueurs qui ont rejoint via le seed (PAS le téléphone)
const OTHER_PLAYERS = [
  { playerId: '7ed2919e-391d-4339-81f0-e18a08129e8f', token: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiI1ZDM5YzdmYi1kYmZjLTRmMzEtYTQ5NC1kZDZmYzQ2ZTdhZmMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg4NjU0NDY0LCJpYXQiOjE3ODg2NTA4NjQsImVtYWlsIjoiIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnt9LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJhbm9ueW1vdXMiLCJ0aW1lc3RhbXAiOjE3ODg2NTA4NjR9XSwic2Vzc2lvbl9pZCI6ImQwNzJkZTUyLThkNzAtNGEwYS05MGMyLWUzMzJkZDJkNzQxNCIsImlzX2Fub255bW91cyI6dHJ1ZX0.qutZjoGmCeS2nxUNeLZA3AiZD0MpyMLtn6KKqpr834K2tbCJcAbpoexxhMd-FIDt0k8VzQMGbyUKVUpmp2EYAw' },
  { playerId: '9676b434-c4ab-4e34-9c32-c6e8cfe0505a', token: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiI4YmY5NjcxZi1lOTgwLTQ5M2YtOGI4Mi0wNjU5MDM0ZTYwMGEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg4NjU0NDY0LCJpYXQiOjE3ODg2NTA4NjQsImVtYWlsIjoiIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnt9LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJhbm9ueW1vdXMiLCJ0aW1lc3RhbXAiOjE3ODg2NTA4NjR9XSwic2Vzc2lvbl9pZCI6IjljMmUzMTY4LTRkZjctNDY4NS05OWZlLTg0OWU4Zjg5ZTI1ZCIsImlzX2Fub255bW91cyI6dHJ1ZX0.T0fp0ZSKIcHuNWztL7xKmJwIZDYeQGDJ22hhxHPoPP6Yeu_oOA2lWdaXVDf4CbNMtRoI5UwRLjKc8mv0nEDKwQ' },
  { playerId: 'fb3277c6-7837-4fa6-b79e-4d21f6ffa033', token: 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiIwNjkyM2U3NS1lNDk4LTQ4NDktOGI5ZC1jZjJiYmNjY2U2OGMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg4NjU0NDY0LCJpYXQiOjE3ODg2NTA4NjQsImVtYWlsIjoiIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnt9LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJhbm9ueW1vdXMiLCJ0aW1lc3RhbXAiOjE3ODg2NTA4NjR9XSwic2Vzc2lvbl9pZCI6ImJhZWE0MDBjLWE0ZTUtNGU0ZS1iMWZjLTY5MjY4MGIyMWM0MiIsImlzX2Fub255bW91cyI6dHJ1ZX0.SiDLr_qzMpO-VUtAGXdkjNkVbi0ESXZz1vGYKWJyqqsFw-89tDpJRcFp5JCd3yFg-ZV476wMuOmcCSaqhtgQ3Q' },
];

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

async function passTurn(player) {
  await call('draw-cards', player.token, { gameId: GAME_ID });

  const { data: me } = await admin.from('players').select('life_points').eq('id', player.playerId).single();
  const { data: hand } = await admin.from('hand_cards').select('id').eq('player_id', player.playerId);
  const excess = hand.length - me.life_points;
  const cardIds = excess > 0 ? hand.slice(0, excess).map(c => c.id) : [];

  await call('discard-cards', player.token, { gameId: GAME_ID, cardIds });
}

async function run() {
  for (let i = 0; i < 20; i++) {
    const { data: game } = await admin.from('games').select('current_player_id, status').eq('id', GAME_ID).single();
    if (game.status === 'finished') { console.log('Partie terminée.'); return; }
    if (game.current_player_id === MY_PLAYER_ID) { console.log('C’est maintenant votre tour (téléphone).'); return; }

    const player = OTHER_PLAYERS.find(p => p.playerId === game.current_player_id);
    if (!player) { console.log('Joueur courant introuvable dans OTHER_PLAYERS :', game.current_player_id); return; }

    console.log(`Passage du tour pour ${player.playerId}...`);
    await passTurn(player);
  }
  console.log('Limite de 20 tours atteinte sans arriver à votre tour.');
}

run().catch(console.error);