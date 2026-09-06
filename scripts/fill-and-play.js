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

// Gère Bang!, Duel et Indiens! de façon générique. Retourne true si une réponse a été envoyée.
async function respondIfPending(bot, gameId) {
  const { data: game } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
  if (!game.pending_type) return false;

  const { data: myPending } = await bot.client.from('pending_targets').select('is_current_turn').eq('game_id', gameId).eq('player_id', bot.playerId).maybeSingle();
  if (!myPending) return false;
  if (game.pending_type === 'duel_response' && !myPending.is_current_turn) return false; // pas encore son tour dans le duel

  const { data: hand } = await bot.client.from('hand_cards').select('card_type').eq('player_id', bot.playerId);
  const defendCardType = game.pending_type === 'bang_response' ? 'missed' : 'bang';
  const canDefend = hand.some(c => c.card_type === defendCardType);
  const action = canDefend ? (game.pending_type === 'bang_response' ? 'missed' : 'discard_bang') : 'accept_damage';
  const fnName = game.pending_type === 'bang_response' ? 'respond-bang' : game.pending_type === 'duel_response' ? 'respond-duel' : 'respond-indians';

  console.log(`  → siège ${bot.seat} répond à ${game.pending_type} (${action})`);
  await call(fnName, bot.token, { gameId, action });
  return true;
}

async function passTurn(bot, gameId, bots) {
  const drawResult = await call('draw-cards', bot.token, { gameId });
  if (drawResult.skippedTurn || drawResult.eliminatedByDynamite) {
    console.log(`  → siège ${bot.seat} a vu son tour écourté (Prison/Dynamite)`);
    return;
  }

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
        await respondIfPending(targetBot, gameId);
      } else {
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

    if (['bang_response', 'duel_response', 'indians_response'].includes(game.pending_type)) {
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