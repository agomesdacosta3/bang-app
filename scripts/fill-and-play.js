const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/fill-and-play.js CODE');
  process.exit(1);
}

const WEAPON_RANGES = { schofield: 2, remington: 3, carbine: 4, winchester: 5, volcanic: 1 };
function getWeaponRange(types) {
  const weapon = types.find(t => WEAPON_RANGES[t]);
  return weapon ? WEAPON_RANGES[weapon] : 1;
}

const BOT_DELAY_MS = 3000;
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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

function computeDistance(players, fromId, toId, mustangIds, scopeIds) {
  const alive = players.filter(p => p.is_alive).sort((a, b) => a.seat_position - b.seat_position);
  const fromIndex = alive.findIndex(p => p.id === fromId);
  const toIndex = alive.findIndex(p => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) return Infinity;
  const n = alive.length;
  let base = Math.min((toIndex - fromIndex + n) % n, (fromIndex - toIndex + n) % n);
  if (mustangIds.has(toId)) base += 1;
  if (scopeIds.has(fromId)) base -= 1;
  return Math.max(base, 1);
}

async function respondIfPending(bot, gameId) {
  const { data: game } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
  if (!game.pending_type || game.pending_type === 'general_store') return false;

  const { data: myPending } = await bot.client.from('pending_targets').select('is_current_turn').eq('game_id', gameId).eq('player_id', bot.playerId).maybeSingle();
  if (!myPending) return false;
  if (game.pending_type === 'duel_response' && !myPending.is_current_turn) return false;

  if (game.pending_type === 'cat_balou_discard') {
    const { data: cbHand } = await bot.client.from('hand_cards').select('id').eq('player_id', bot.playerId);
    const { data: cbEquip } = await bot.client.from('cards_in_play').select('card_type').eq('player_id', bot.playerId);
    const pool = [
      ...(cbHand ?? []).map(c => ({ kind: 'hand', id: c.id })),
      ...(cbEquip ?? []).map(c => ({ kind: 'equip', cardType: c.card_type })),
    ];
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      console.log(`  → siège ${bot.seat} choisit une carte à défausser (Coup de foudre)`);
      if (pick.kind === 'hand') {
        await call('respond-catbalou', bot.token, { gameId, handCardId: pick.id });
      } else {
        await call('respond-catbalou', bot.token, { gameId, inPlayCardType: pick.cardType });
      }
    }
    return true;
  }

  const { data: hand } = await bot.client.from('hand_cards').select('card_type').eq('player_id', bot.playerId);
  const usesMissed = game.pending_type === 'bang_response' || game.pending_type === 'gatling_response';
  const defendCardType = usesMissed ? 'missed' : 'bang';
  const canDefend = hand.some(c => c.card_type === defendCardType);
  const action = canDefend ? (usesMissed ? 'missed' : 'discard_bang') : 'accept_damage';
  const fnName = game.pending_type === 'bang_response' ? 'respond-bang'
    : game.pending_type === 'gatling_response' ? 'respond-gatling'
    : game.pending_type === 'duel_response' ? 'respond-duel'
    : 'respond-indians';

  console.log(`  → siège ${bot.seat} répond à ${game.pending_type} (${action})`);
  await call(fnName, bot.token, { gameId, action });
  return true;
}

async function passTurn(bot, gameId, bots) {
  const { data: equipment } = await bot.client.from('cards_in_play').select('card_type').eq('player_id', bot.playerId);
  if (equipment?.some(c => c.card_type === 'dynamite' || c.card_type === 'prison')) {
    const startResult = await call('resolve-start-of-turn', bot.token, { gameId });
    if (startResult.turnEnded) {
      console.log(`  → siège ${bot.seat} a vu son tour écourté (Prison/Dynamite)`);
      return;
    }
  }

  await call('draw-cards', bot.token, { gameId });

  const { data: allPlayers } = await bot.client.from('players').select('id, seat_position, is_alive').eq('game_id', gameId);
  const { data: hand } = await bot.client.from('hand_cards').select('id, card_type').eq('player_id', bot.playerId);

  const { data: allEquipment } = await bot.client.from('cards_in_play').select('player_id, card_type');
  const mustangIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'mustang').map(e => e.player_id));
  const scopeIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'scope').map(e => e.player_id));
  const myTypes = (allEquipment ?? []).filter(e => e.player_id === bot.playerId).map(e => e.card_type);
  const myWeaponRange = getWeaponRange(myTypes);

  const bangCard = hand.find(c => c.card_type === 'bang');
  if (bangCard) {
    const targets = allPlayers.filter(p => p.is_alive && p.id !== bot.playerId && computeDistance(allPlayers, bot.playerId, p.id, mustangIds, scopeIds) <= myWeaponRange);
    if (targets.length > 0) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      try {
        console.log(`  → siège ${bot.seat} attaque le siège ${target.seat_position} !`);
        await call('play-bang', bot.token, { gameId, targetPlayerId: target.id });
        await sleep(BOT_DELAY_MS);

        const targetBot = bots.find(b => b.playerId === target.id);
        if (targetBot) {
          await respondIfPending(targetBot, gameId);
          await sleep(BOT_DELAY_MS);
        } else {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const { data: g } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
            if (!g.pending_type) break;
            if (i === 25) await call('resolve-timeout', bot.token, { gameId });
          }
        }
      } catch (err) {
        console.log(`  → attaque annulée : ${err.message}`);
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

    if (['bang_response', 'duel_response', 'indians_response', 'gatling_response', 'cat_balou_discard'].includes(game.pending_type)) {
      const { data: pendingRows } = await bots[0].client.from('pending_targets').select('player_id');
      for (const row of pendingRows ?? []) {
        const bot = bots.find(b => b.playerId === row.player_id);
        if (bot) await respondIfPending(bot, gameId);
      }
      await sleep(BOT_DELAY_MS);
      continue;
    }

    if (game.pending_type === 'general_store') {
      const { data: currentRow } = await bots[0].client.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true).maybeSingle();
      const bot = bots.find(b => b.playerId === currentRow?.player_id);
      if (bot) {
        const { data: cards } = await bot.client.from('general_store_cards').select('id').eq('game_id', gameId);
        if (cards?.length) {
          const choice = cards[Math.floor(Math.random() * cards.length)];
          console.log(`  → siège ${bot.seat} choisit une carte du Magasin`);
          await call('pick-general-store-card', bot.token, { gameId, cardId: choice.id });
        }
      }
      await sleep(BOT_DELAY_MS);
      continue;
    }

    const bot = bots.find(b => b.playerId === game.current_player_id);
    if (!bot) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    console.log(`Passage du tour — siège ${bot.seat}...`);
    await passTurn(bot, gameId, bots);
    await sleep(BOT_DELAY_MS);
  }
}

run().catch(console.error);