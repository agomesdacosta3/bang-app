import { supabaseAdmin } from './supabaseAdmin.ts';
import { checkVictory } from './victory.ts';
import { logEvent } from './events.ts';
import { getCharacter, checkSuzyLafayette } from './characters.ts';
import { drawFromDeck } from './deck.ts';

export async function applyDamage(gameId: string, playerId: string, options: {
  amount?: number; causedByPlayerId?: string; threadId?: string;
} = {}) {
  const { amount = 1, causedByPlayerId, threadId } = options;

  const { data: player } = await supabaseAdmin.from('players').select('life_points, seat_position').eq('id', playerId).single();
  const newLife = player!.life_points - amount;
  const eliminated = newLife <= 0;
  await supabaseAdmin.from('players').update({ life_points: Math.max(newLife, 0), is_alive: !eliminated }).eq('id', playerId);

  await logEvent(gameId, 'damage_taken', { actorSeat: player!.seat_position, amount, threadId });

  if (causedByPlayerId && causedByPlayerId !== playerId) {
    const victimCharacter = await getCharacter(playerId);
    if (victimCharacter === 'el_gringo') {
      let stolenCount = 0;
      for (let i = 0; i < amount; i++) {
        const { data: attackerHand } = await supabaseAdmin.from('hand_cards').select('id').eq('player_id', causedByPlayerId);
        if (!attackerHand?.length) break;
        const stolen = attackerHand[Math.floor(Math.random() * attackerHand.length)];
        await supabaseAdmin.from('hand_cards').update({ player_id: playerId }).eq('id', stolen.id);
        stolenCount++;
      }
      if (stolenCount > 0) {
        const { data: attacker } = await supabaseAdmin.from('players').select('seat_position').eq('id', causedByPlayerId).single();
        await logEvent(gameId, 'el_gringo_steal', { actorSeat: player!.seat_position, targetSeat: attacker?.seat_position, amount: stolenCount, threadId });
        await checkSuzyLafayette(gameId, causedByPlayerId, threadId);
      }
    }
  }

  if (!eliminated) {
    const character = await getCharacter(playerId);
    if (character === 'bart_cassidy') {
      const [card] = await drawFromDeck(gameId, 1);
      await supabaseAdmin.from('hand_cards').insert({ player_id: playerId, card_type: card.type, suit: card.suit, value: card.value });
      await logEvent(gameId, 'bart_cassidy_draw', { actorSeat: player!.seat_position, threadId });
    }
  }

  if (eliminated) {
    const { data: allPlayers } = await supabaseAdmin.from('players').select('id, is_alive').eq('game_id', gameId);
    const aliveOtherIds = (allPlayers ?? []).filter(p => p.is_alive && p.id !== playerId).map(p => p.id);
    const { data: chars } = aliveOtherIds.length
      ? await supabaseAdmin.from('player_characters').select('player_id, character').in('player_id', aliveOtherIds)
      : { data: [] };
    const sam = chars?.find(c => c.character === 'vulture_sam');

    const { data: handCards } = await supabaseAdmin.from('hand_cards').select('id, card_type, suit, value').eq('player_id', playerId);
    const { data: inPlayCards } = await supabaseAdmin.from('cards_in_play').select('card_type, suit, value').eq('player_id', playerId);

    if (sam) {
      const allTaken = [...(handCards ?? []), ...(inPlayCards ?? [])];
      if (allTaken.length) {
        await supabaseAdmin.from('hand_cards').insert(allTaken.map(c => ({ player_id: sam.player_id, card_type: c.card_type, suit: c.suit, value: c.value })));
        const { data: samPlayer } = await supabaseAdmin.from('players').select('seat_position').eq('id', sam.player_id).single();
        await logEvent(gameId, 'vulture_sam_loot', { actorSeat: samPlayer?.seat_position, targetSeat: player!.seat_position, amount: allTaken.length, threadId });
      }
      await supabaseAdmin.from('hand_cards').delete().eq('player_id', playerId);
      await supabaseAdmin.from('cards_in_play').delete().eq('player_id', playerId);
    } else {
      await supabaseAdmin.from('hand_cards').delete().eq('player_id', playerId);
      if (inPlayCards?.length) {
        await supabaseAdmin.from('discard_pile').insert(inPlayCards.map(c => ({ game_id: gameId, card_type: c.card_type, suit: c.suit, value: c.value })));
        await supabaseAdmin.from('cards_in_play').delete().eq('player_id', playerId);
      }
    }

    await logEvent(gameId, 'player_eliminated', { actorSeat: player!.seat_position, threadId });
    await checkVictory(gameId, playerId);
  }
}