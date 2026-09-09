// Crée une partie de test complète à partir d'un code, applique un scénario (rôle/personnage/main)
// sur les sièges choisis, puis fait tourner la partie jusqu'à la fin.
// Usage : 1) crée une partie depuis le téléphone, note le code
//         2) édite RIG ci-dessous
//         3) node scripts/rig-game.js CODE
//
// Seule limite : le rôle du siège qui est Shérif ne peut pas être changé (voir explication dans la conversation) —
// tout le reste (personnage sur n'importe quel siège y compris le tien et le Shérif, rôle sur n'importe quel
// siège non-Shérif y compris le tien, main de n'importe quel siège) est librement modifiable.

// hand : liste de card_type, ou d'objets { type, suit, value } pour une carte précise
// inPlay : pareil, mais pose directement la carte "en jeu" (cards_in_play) plutôt qu'en main —
//          utile pour placer Prison/Dynamite/Planque/Mustang/Lunette/armes déjà en place au démarrage

const { createClient } = require('@supabase/supabase-js');
const { LOCAL_URL, ANON_KEY, SERVICE_ROLE_KEY, call, runGameLoop, printGameSummary } = require('./bot-lib');

const JOIN_CODE = process.argv[2];
if (!JOIN_CODE) {
  console.error('Usage: node scripts/rig-game.js CODE');
  process.exit(1);
}

// Édite ici : seat_position -> { role?, character?, hand? }
// role : 'deputy' | 'outlaw' | 'renegade' (sans effet si ce siège est le Shérif — voir limite ci-dessus)
// character : bart_cassidy, black_jack, calamity_janet, el_gringo, jesse_jones, jourdonnais,
//             kit_carlson, lucky_duke, paul_regret, pedro_ramirez, rose_doolan, sid_ketchum,
//             slab_the_killer, suzy_lafayette, vulture_sam, willy_the_kid
// hand : liste de card_type, ou d'objets { type, suit, value } pour une carte précise

const RIG = { 0: { character: 'kit_carlson' } };

const CHARACTER_BASE_LIFE = { paul_regret: 3, el_gringo: 3 };
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
function randomSuitValue() {
  return { suit: SUITS[Math.floor(Math.random() * 4)], value: 2 + Math.floor(Math.random() * 13) };
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
    console.log(`Bot rejoint — siège ${joined.seatPosition}`);
  }

  await call('start-game', bots[0].token, { gameId });
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
  }

  console.log('Scénario appliqué.');
  await printGameSummary(admin, gameId);
  await runGameLoop(admin, gameId, bots);
}

run().catch(console.error);