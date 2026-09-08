import { supabaseAdmin } from './supabaseAdmin.ts';

export async function logEvent(gameId: string, eventType: string, fields: {
  actorSeat?: number; targetSeat?: number; cardType?: string; amount?: number;
} = {}) {
  await supabaseAdmin.from('game_events').insert({
    game_id: gameId,
    event_type: eventType,
    actor_seat: fields.actorSeat ?? null,
    target_seat: fields.targetSeat ?? null,
    card_type: fields.cardType ?? null,
    amount: fields.amount ?? null,
  });
}