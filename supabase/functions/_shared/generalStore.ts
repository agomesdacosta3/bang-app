import { supabaseAdmin } from './supabaseAdmin.ts';
import { logEvent } from './events.ts';

export async function pickGeneralStoreCard(gameId: string, playerId: string, cardId?: string) {
  let card;
  if (cardId) {
    const { data } = await supabaseAdmin.from('general_store_cards').select('*').eq('id', cardId).eq('game_id', gameId).maybeSingle();
    card = data;
  } else {
    const { data: cards } = await supabaseAdmin.from('general_store_cards').select('*').eq('game_id', gameId);
    card = cards && cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
  }
  if (!card) throw new Error('Cette carte n’est plus disponible');

  await supabaseAdmin.from('general_store_cards').delete().eq('id', card.id);
  await supabaseAdmin.from('hand_cards').insert({ player_id: playerId, card_type: card.card_type, suit: card.suit, value: card.value });
  await supabaseAdmin.from('pending_targets').delete().eq('game_id', gameId).eq('player_id', playerId);

  const { data: player } = await supabaseAdmin.from('players').select('seat_position').eq('id', playerId).single();
  await logEvent(gameId, 'store_card_taken', { actorSeat: player!.seat_position, cardType: card.card_type });

  const { data: remaining } = await supabaseAdmin.from('pending_targets').select('*').eq('game_id', gameId).order('order_index');
  if (!remaining || remaining.length === 0) {
    await supabaseAdmin.from('games').update({ pending_type: null, pending_initiator_id: null, pending_expires_at: null }).eq('id', gameId);
  } else {
    await supabaseAdmin.from('pending_targets').update({ is_current_turn: true }).eq('id', remaining[0].id);
    await supabaseAdmin.from('games').update({ pending_expires_at: new Date(Date.now() + 20_000).toISOString() }).eq('id', gameId);
  }
}