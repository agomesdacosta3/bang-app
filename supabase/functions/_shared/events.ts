import { supabaseAdmin } from './supabaseAdmin.ts';

export async function logEvent(gameId: string, eventType: string, fields: {
  actorSeat?: number; targetSeat?: number; cardType?: string; amount?: number;
  drawnSuit?: string; drawnValue?: number; drawnSuit2?: string; drawnValue2?: number;
} = {}) {
  await supabaseAdmin.from('game_events').insert({
    game_id: gameId,
    event_type: eventType,
    actor_seat: fields.actorSeat ?? null,
    target_seat: fields.targetSeat ?? null,
    card_type: fields.cardType ?? null,
    amount: fields.amount ?? null,
    drawn_suit: fields.drawnSuit ?? null,
    drawn_value: fields.drawnValue ?? null,
    drawn_suit_2: fields.drawnSuit2 ?? null,
    drawn_value_2: fields.drawnValue2 ?? null,
  });
}