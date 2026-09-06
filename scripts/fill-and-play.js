const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'COLLE_ICI_LA_CLE_ANON_LOCALE';
const PUBLISHABLE_KEY = 'sb_publishable_...';

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

function computeDistance(players, fromId, toId) {
  const alive = players.filter(p => p.is_alive).sort((a, b) => a.seat_position - b.seat_position);
  const fromIndex = alive.findIndex(p => p.id === fromId);
  const toIndex = alive.findIndex(p => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) return Infinity;
  const n = alive.length;
  return Math.min((toIndex - fromIndex + n) % n, (fromIndex - toIndex + n) % n);
}

// Fait répondre le bot s'il est bien la cible d'un Bang! en attente. Retourne true si une réponse a été envoyée.
async function respondIfPending(bot, gameId) {
  const { data: game } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
  if (game.pending_type !== 'bang_response') return false;

  const { data: myPending } = await bot.client.from('pending_targets').select('id').eq('game_id', gameId).eq('player_id', bot.playerId).maybeSingle();
  if (!myPending) return false;

  const { data: hand } = await bot.client.from('hand_cards').select('id, card_type').eq('player_id', bot.playerId);
  const hasMissed = hand.some(c => c.card_type === 'missed');
  const action = hasMissed ? 'missed' : 'accept_damage';
  console.log(`  → siège ${bot.seat} répond au Bang! (${action})`);
  await call('respond-bang', bot.token, { gameId, action });
  return true;
}

async function passTurn(bot, gameId, bots) {
  await call('draw-cards', bot.token, { gameId });

  const { data: allPlayers } = await bot.client.from('players').select('id, seat_position, is_alive').eq('game_id', gameId);
  const { data: hand } = await bot.client.from('hand_cards').select('id, card_type').eq('player_id', bot.playerId);

  const bangCard = hand.find(c => c.card_type === 'bang');
  if (bangCard) {
    const targets = allPlayers.filter(p => p.is_alive && p.id !== bot.playerId && computeDistance(allPlayers, bot.playerId, p.id) <= 1);
    if (targets.length > 0) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      console.log(`  → siège ${bot.seat} attaque le siège ${target.seat_position} !`);
      await call('play-bang', bot.token, { gameId, targetPlayerId: target.id });

      const targetBot = bots.find(b => b.playerId === target.id);
      if (targetBot) {
        // La cible est un bot qu'on contrôle : elle répond tout de suite, pas besoin d'attendre
        await respondIfPending(targetBot, gameId);
      } else {
        // La cible est le téléphone : on attend sa réponse, avec un filet de sécurité au bout de 25s
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const { data: g } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
          if (!g.pending_type) break;
          if (i === 25) await call('resolve-timeout', bot.token, { gameId });
        }
      }
    }
  }

  const { data: me } = await bot.client.from('players').select('life_points').eq('id', bot.playerId).single();
  const { data: freshHand } = await bot.client.from('hand_cards').select('id').eq('player_id', bot.playerId);
  const excess = freshHand.length - me.life_points;
  const cardIds = excess > 0 ? freshHand.slice(0, excess).map(c => c.id) : [];
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

  while (true) {
    const { data: game } = await bots[0].client.from('games').select('current_player_id, status, pending_type').eq('id', gameId).single();
    if (game.status === 'finished') { console.log('Partie terminée.'); return; }

    if (game.pending_type === 'bang_response') {
      // Le téléphone (ou un autre bot déjà traité) a visé un bot pendant qu'on n'était pas dans passTurn — on répond quand même
      const { data: pendingRows } = await bots[0].client.from('pending_targets').select('player_id');
      for (const row of pendingRows ?? []) {
        const bot = bots.find(b => b.playerId === row.player_id);
        if (bot) await respondIfPending(bot, gameId);
      }
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const bot = bots.find(b => b.playerId === game.current_player_id);
    if (!bot) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    console.log(`Passage du tour — siège ${bot.seat}...`);
    await passTurn(bot, gameId, bots);
  }
}

run().catch(console.error);