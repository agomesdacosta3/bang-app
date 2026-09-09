const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

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

const WEAPON_RANGES = { schofield: 2, remington: 3, carbine: 4, winchester: 5, volcanic: 1 };
function getWeaponRange(types) {
  const weapon = types.find(t => WEAPON_RANGES[t]);
  return weapon ? WEAPON_RANGES[weapon] : 1;
}

const CARD_LABELS_CONSOLE = {
  bang: 'Bang!', missed: 'Raté!', beer: 'Bière', duel: 'Duel', indians: 'Indiens!',
  prison: 'Prison', dynamite: 'Dynamite', barrel: 'Planque', saloon: 'Saloon',
  stagecoach: 'Diligence', wells_fargo: 'Convoi', mustang: 'Mustang', scope: 'Lunette',
  panic: 'Braquage!', cat_balou: 'Coup de foudre', gatling: 'Gatling', general_store: 'Magasin',
  schofield: 'Schofield', remington: 'Remington', carbine: 'Carabine', winchester: 'Winchester', volcanic: 'Volcanic',
};

const CHARACTER_LABELS_CONSOLE = {
  bart_cassidy: 'Bart Cassidy', black_jack: 'Black Jack', calamity_janet: 'Calamity Janet', el_gringo: 'El Gringo',
  jesse_jones: 'Jesse Jones', jourdonnais: 'Jourdonnais', kit_carlson: 'Kit Carlson', lucky_duke: 'Lucky Duke',
  paul_regret: 'Paul Regret', pedro_ramirez: 'Pedro Ramirez', rose_doolan: 'Rose Doolan', sid_ketchum: 'Sid Ketchum',
  slab_the_killer: 'Slab le Flingueur', suzy_lafayette: 'Suzy Lafayette', vulture_sam: 'Sam le Vautour', willy_the_kid: 'Willy le Kid',
};

const ROLE_LABELS_CONSOLE = { sheriff: 'Shérif', deputy: 'Adjoint', outlaw: 'Hors-la-loi', renegade: 'Renégat' };

const SUIT_SYMBOLS_CONSOLE = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const VALUE_LABELS_CONSOLE = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function formatCard(suit, value) {
  if (!suit || !value) return '?';
  return `${VALUE_LABELS_CONSOLE[value] ?? value}${SUIT_SYMBOLS_CONSOLE[suit] ?? suit}`;
}

function formatEventConsole(e) {
  switch (e.event_type) {
    case 'bang_played': return `Siège ${e.actor_seat} tire sur Siège ${e.target_seat}`;
    case 'missed_played': return `Siège ${e.actor_seat} esquive avec Raté!`;
    case 'barrel_equipped': return `Siège ${e.actor_seat} pose une Planque`;
    case 'barrel_used': return `Siège ${e.actor_seat} esquive avec la Planque !`;
    case 'barrel_failed': return `Siège ${e.actor_seat} rate son dégainer de Planque`;
    case 'damage_taken': return `Siège ${e.actor_seat} perd ${e.amount ?? 1} point(s) de vie`;
    case 'player_eliminated': return `Siège ${e.actor_seat} est éliminé !`;
    case 'store_card_taken': return `Siège ${e.actor_seat} récupère : ${CARD_LABELS_CONSOLE[e.card_type] ?? e.card_type} (Magasin)`;
    case 'card_discarded_forced': return `Siège ${e.actor_seat} défausse : ${CARD_LABELS_CONSOLE[e.card_type] ?? e.card_type} (Coup de foudre)`;
    case 'beer_played': return `Siège ${e.actor_seat} boit une Bière (+1 PV)`;
    case 'saloon_played': return `Siège ${e.actor_seat} joue Saloon (tout le monde soigné)`;
    case 'duel_played': return `Siège ${e.actor_seat} lance un Duel contre Siège ${e.target_seat}`;
    case 'duel_bang_discarded': return `Siège ${e.actor_seat} continue le Duel avec un Bang!`;
    case 'indians_played': return `Siège ${e.actor_seat} joue Indiens!`;
    case 'indians_defended': return `Siège ${e.actor_seat} défend avec Bang! contre Indiens!`;
    case 'gatling_played': return `Siège ${e.actor_seat} joue Gatling !`;
    case 'prison_played': return `Siège ${e.actor_seat} met Siège ${e.target_seat} en Prison`;
    case 'prison_failed': return `Siège ${e.actor_seat} rate son dégainer de Prison — tour passé`;
    case 'prison_escaped': return `Siège ${e.actor_seat} s'échappe de Prison`;
    case 'dynamite_played': return `Siège ${e.actor_seat} pose une Dynamite`;
    case 'dynamite_passed': return `La Dynamite passe au Siège ${e.actor_seat}`;
    case 'weapon_equipped': return `Siège ${e.actor_seat} s'équipe : ${CARD_LABELS_CONSOLE[e.card_type] ?? e.card_type}`;
    case 'mustang_equipped': return `Siège ${e.actor_seat} pose un Mustang`;
    case 'scope_equipped': return `Siège ${e.actor_seat} pose une Lunette`;
    case 'panic_played': return `Siège ${e.actor_seat} vole ${CARD_LABELS_CONSOLE[e.card_type] ?? e.card_type} à Siège ${e.target_seat} (Braquage!)`;
    case 'catbalou_played': return `Siège ${e.actor_seat} joue Coup de foudre sur Siège ${e.target_seat}`;
    case 'general_store_played': return `Siège ${e.actor_seat} joue Magasin`;
    case 'degainer_draw':
      return e.drawn_suit_2
        ? `Siège ${e.actor_seat} dégaine (Lucky Duke) : ${formatCard(e.drawn_suit, e.drawn_value)} gardée, ${formatCard(e.drawn_suit_2, e.drawn_value_2)} écartée`
        : `Siège ${e.actor_seat} dégaine : ${formatCard(e.drawn_suit, e.drawn_value)}`;
    case 'jesse_jones_steal': return `Siège ${e.actor_seat} pioche dans la main de Siège ${e.target_seat} (Jesse Jones)`;
    case 'pedro_ramirez_discard_draw': return `Siège ${e.actor_seat} pioche depuis la défausse : ${CARD_LABELS_CONSOLE[e.card_type] ?? e.card_type} (Pedro Ramirez)`;
    case 'kit_carlson_pick': return `Siège ${e.actor_seat} choisit 2 cartes parmi 3 (Kit Carlson)`;
    case 'partial_cancel': return `Siège ${e.actor_seat} annule partiellement (${e.amount}/2) — Slab le Flingueur`;
    default: return e.event_type;
  }
}

function createEventPoller(client, gameId) {
  let lastEventAt = new Date(0).toISOString();
  return async function pollEvents() {
    const { data: events } = await client.from('game_events').select('*').eq('game_id', gameId).gt('created_at', lastEventAt).order('created_at', { ascending: true });
    for (const e of events ?? []) {
      console.log(`[Événement] ${formatEventConsole(e)}`);
      lastEventAt = e.created_at;
    }
  };
}

async function printGameSummary(admin, gameId) {
  const { data: players } = await admin.from('players').select('*').eq('game_id', gameId).order('seat_position');
  const { data: roles } = await admin.from('player_roles').select('player_id, role').in('player_id', players.map(p => p.id));
  const { data: chars } = await admin.from('player_characters').select('player_id, character').in('player_id', players.map(p => p.id));

  console.log('\n--- Composition de la partie ---');
  players.forEach(p => {
    const role = p.is_sheriff ? 'sheriff' : (roles.find(r => r.player_id === p.id)?.role ?? '???');
    const character = chars.find(c => c.player_id === p.id)?.character ?? '???';
    console.log(`Siège ${p.seat_position}${p.seat_position === 0 ? ' (humain)' : ''} — rôle: ${ROLE_LABELS_CONSOLE[role] ?? role} — personnage: ${CHARACTER_LABELS_CONSOLE[character] ?? character} — vie: ${p.life_points}/${p.max_life_points}`);
  });
  console.log('---------------------------------\n');
}

async function respondIfPending(bot, gameId, pollEvents) {
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
      if (pick.kind === 'hand') {
        await call('respond-catbalou', bot.token, { gameId, handCardId: pick.id });
      } else {
        await call('respond-catbalou', bot.token, { gameId, inPlayCardType: pick.cardType });
      }
      if (pollEvents) await pollEvents();
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

  await call(fnName, bot.token, { gameId, action });
  if (pollEvents) await pollEvents();
  return true;
}

async function passTurn(bot, gameId, bots, turnPhase) {
  if (turnPhase === 'draw') {
    const { data: equipment } = await bot.client.from('cards_in_play').select('card_type').eq('player_id', bot.playerId);
    if (equipment?.some(c => c.card_type === 'dynamite' || c.card_type === 'prison')) {
      const startResult = await call('resolve-start-of-turn', bot.token, { gameId });
      if (startResult.turnEnded) return;
    }
    await call('draw-cards', bot.token, { gameId });
  }

  const { data: allPlayers } = await bot.client.from('players').select('id, seat_position, is_alive').eq('game_id', gameId);
  const { data: hand } = await bot.client.from('hand_cards').select('id, card_type').eq('player_id', bot.playerId);

  if (bot.forcedAction) {
    const { type, targetSeat } = bot.forcedAction;
    delete bot.forcedAction;
    try {
      if (type === 'duel') {
        const target = allPlayers.find(p => p.seat_position === targetSeat);
        if (!target) throw new Error(`Aucun joueur au siège ${targetSeat}`);
        console.log(`  → siège ${bot.seat} lance un Duel sur siège ${targetSeat} (forcé)`);
        await call('play-duel', bot.token, { gameId, targetPlayerId: target.id });
      } else if (type === 'indians') {
        console.log(`  → siège ${bot.seat} joue Indiens! (forcé)`);
        await call('play-indians', bot.token, { gameId });
      }
      await sleep(BOT_DELAY_MS);
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const { data: g } = await bot.client.from('games').select('pending_type').eq('id', gameId).single();
        if (!g.pending_type) break;
        if (i === 25) await call('resolve-timeout', bot.token, { gameId });
      }
    } catch (err) {
      console.log(`  → action forcée annulée : ${err.message}`);
    }
  } else {
    const { data: allEquipment } = await bot.client.from('cards_in_play').select('player_id, card_type');
    const { data: allCharacters } = await bot.client.from('player_characters').select('player_id, character');
    const mustangIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'mustang').map(e => e.player_id));
    const scopeIds = new Set((allEquipment ?? []).filter(e => e.card_type === 'scope').map(e => e.player_id));
    (allCharacters ?? []).forEach(c => {
      if (c.character === 'paul_regret') mustangIds.add(c.player_id);
      if (c.character === 'rose_doolan') scopeIds.add(c.player_id);
    });
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
  }

  const { data: me } = await bot.client.from('players').select('life_points').eq('id', bot.playerId).single();
  const { data: freshHand } = await bot.client.from('hand_cards').select('id').eq('player_id', bot.playerId);
  const excess = freshHand.length - me.life_points;
  const cardIds = excess > 0 ? freshHand.slice(0, excess).map(c => c.id) : [];
  await call('discard-cards', bot.token, { gameId, cardIds });
}

async function runGameLoop(admin, gameId, bots) {
  const pollEvents = createEventPoller(bots[0].client, gameId);

  while (true) {
    await pollEvents();

    const { data: game } = await admin.from('games').select('current_player_id, status, pending_type, turn_phase').eq('id', gameId).single();
    if (game.status === 'finished') { await pollEvents(); console.log('Partie terminée.'); return; }

    if (['bang_response', 'duel_response', 'indians_response', 'gatling_response', 'cat_balou_discard'].includes(game.pending_type)) {
      const { data: pendingRows } = await admin.from('pending_targets').select('player_id');
      for (const row of pendingRows ?? []) {
        const bot = bots.find(b => b.playerId === row.player_id);
        if (bot) await respondIfPending(bot, gameId, pollEvents);
      }
      await sleep(BOT_DELAY_MS);
      continue;
    }

    if (game.pending_type === 'general_store') {
      const { data: currentRow } = await admin.from('pending_targets').select('player_id').eq('game_id', gameId).eq('is_current_turn', true).maybeSingle();
      const bot = bots.find(b => b.playerId === currentRow?.player_id);
      if (bot) {
        const { data: cards } = await bot.client.from('general_store_cards').select('id').eq('game_id', gameId);
        if (cards?.length) {
          const choice = cards[Math.floor(Math.random() * cards.length)];
          await call('pick-general-store-card', bot.token, { gameId, cardId: choice.id });
          await pollEvents();
        }
      }
      await sleep(BOT_DELAY_MS);
      continue;
    }

    const bot = bots.find(b => b.playerId === game.current_player_id);
    if (!bot) { await new Promise(r => setTimeout(r, 2000)); continue; }

    console.log(`Passage du tour — siège ${bot.seat}...`);
    await passTurn(bot, gameId, bots, game.turn_phase, pollEvents);
    await sleep(BOT_DELAY_MS);
  }
}

module.exports = {
  LOCAL_URL, ANON_KEY, PUBLISHABLE_KEY, SERVICE_ROLE_KEY,
  BOT_DELAY_MS, sleep, call, computeDistance, WEAPON_RANGES, getWeaponRange,
  CARD_LABELS_CONSOLE, CHARACTER_LABELS_CONSOLE, ROLE_LABELS_CONSOLE,
  formatEventConsole, createEventPoller, printGameSummary,
  respondIfPending, passTurn, runGameLoop,
};