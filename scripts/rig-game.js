// Crée une partie de test complète à partir d'un code, applique un scénario (rôle/personnage/main)
// sur les sièges choisis, puis fait tourner la partie jusqu'à la fin.
// Usage : 1) crée une partie depuis le téléphone, note le code
//         2) édite RIG ci-dessous
//         3) node scripts/rig-game.js CODE
//
// Depuis l'introduction du système "prêt", les bots doivent désormais choisir un pseudo et se
// déclarer prêts comme le ferait un vrai joueur — la partie démarre automatiquement dès que TOI
// (siège 0) te déclares prêt en dernier sur ton téléphone. Ce script ne peut pas déclarer le
// siège 0 prêt à ta place.
//
// Seule limite : le rôle du siège qui est Shérif ne peut pas être changé.

const { createClient } = require('@supabase/supabase-js');
const { LOCAL_URL, ANON_KEY, SERVICE_ROLE_KEY, call, runGameLoop, printGameSummary } = require('./bot-lib');

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/rig-game.js CODE');
  process.exit(1);
}

// Édite ici : seat_position -> { role?, character?, hand?, inPlay?, life?, forcedAction? }
const RIG = {
  
};

const BOT_NICKNAMES = ['Bandit1', 'Bandit2', 'Bandit3'];
const CHARACTER_BASE_LIFE = { paul_regret: 3, el_gringo: 3 };
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
function randomSuitValue() {
  return { suit: SUITS[Math.floor(Math.random() * 4)], value: 2 + Math.floor(Math.random() * 13) };
}

const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function waitForGameStart(gameId) {
  return new Promise(resolve => {
    const check = setInterval(async () => {
      const { data } = await admin.from('games').select('status').eq('id', gameId).single();
      if (data?.status === 'in_progress') { clearInterval(check); resolve(); }
    }, 1000);
  });
}

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
    console.log(`Bot rejoint — siège ${joined.seatPosition}`);
  }

  for (let i = 0; i < bots.length; i++) {
    await call('set-nickname', bots[i].token, { gameId, nickname: BOT_NICKNAMES[i] ?? `Bot${i + 1}` });
    await call('toggle-ready', bots[i].token, { gameId });
    console.log(`Bot siège ${bots[i].seat} → pseudo défini et prêt`);
  }

  console.log('\nEn attente que tu choisisses un pseudo et te déclares prêt sur le téléphone...');
  await waitForGameStart(gameId);
  console.log('Partie démarrée.');

  const { data: players } = await admin.from('players').select('*').eq('game_id', gameId).order('seat_position');

  for (const [seatStr, rig] of Object.entries(RIG)) {
    const seat = parseInt(seatStr, 10);
    const player = players.find(p => p.seat_position === seat);
    if (!player) { console.log(`Aucun joueur au siège ${seat}, ignoré.`); continue; }

    if (rig.role) {
      if (player.is_sheriff) {
        console.log(`Siège ${seat} est le Shérif — rôle non modifiable, ignoré.`);
      } else {
        await admin.from('player_roles').update({ role: rig.role }).eq('player_id', player.id);
        console.log(`Siège ${seat} → rôle forcé : ${rig.role}`);
      }
    }

    if (rig.character) {
      await admin.from('player_characters').update({ character: rig.character }).eq('player_id', player.id);
      const base = CHARACTER_BASE_LIFE[rig.character] ?? 4;
      const newLife = base + (player.is_sheriff ? 1 : 0);
      await admin.from('players').update({ life_points: newLife, max_life_points: newLife }).eq('id', player.id);
      console.log(`Siège ${seat} → personnage forcé : ${rig.character} (vie ajustée à ${newLife}${player.is_sheriff ? ', dont +1 Shérif' : ''})`);
    }

    if (rig.life !== undefined) {
      await admin.from('players').update({ life_points: rig.life, max_life_points: rig.life }).eq('id', player.id);
      console.log(`Siège ${seat} → vie forcée : ${rig.life}/${rig.life}`);
    }

    if (rig.hand) {
      await admin.from('hand_cards').delete().eq('player_id', player.id);
      const cardsToInsert = rig.hand.map(item => {
        const card = typeof item === 'string' ? { type: item, ...randomSuitValue() } : item;
        return { player_id: player.id, card_type: card.type, suit: card.suit, value: card.value };
      });
      await admin.from('hand_cards').insert(cardsToInsert);
      console.log(`Siège ${seat} → main forcée : ${rig.hand.map(c => (typeof c === 'string' ? c : c.type)).join(', ')}`);
    }

    if (rig.inPlay) {
      const itemsToInsert = rig.inPlay.map(item => {
        const card = typeof item === 'string' ? { type: item, ...randomSuitValue() } : item;
        return { player_id: player.id, card_type: card.type, suit: card.suit, value: card.value };
      });
      await admin.from('cards_in_play').insert(itemsToInsert);
      console.log(`Siège ${seat} → équipement forcé (en jeu) : ${rig.inPlay.map(c => (typeof c === 'string' ? c : c.type)).join(', ')}`);
    }

    if (rig.forcedAction) {
      const bot = bots.find(b => b.seat === seat);
      if (bot) {
        bot.forcedAction = rig.forcedAction;
        console.log(`Siège ${seat} → action forcée programmée : ${rig.forcedAction.type}`);
      }
    }
  }

  console.log('Scénario appliqué.');
  await printGameSummary(admin, gameId);
  await runGameLoop(admin, gameId, bots);
}

run().catch(console.error);