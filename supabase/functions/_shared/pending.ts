import { supabaseAdmin } from './supabaseAdmin.ts';

export async function startPending(
  gameId: string,
  initiatorId: string,
  type: string,
  targets: { playerId: string; isCurrentTurn: boolean; cancelsNeeded?: number }[],
  timeoutMs = 20000,
  pendingEventId?: string
) {
  await supabaseAdmin.from('pending_targets').insert(
    targets.map(t => ({ game_id: gameId, player_id: t.playerId, is_current_turn: t.isCurrentTurn, cancels_needed: t.cancelsNeeded ?? 1 }))
  );
  await supabaseAdmin.from('games').update({
    pending_type: type,
    pending_initiator_id: initiatorId,
    pending_expires_at: new Date(Date.now() + timeoutMs).toISOString(),
    pending_event_id: pendingEventId ?? null,
  }).eq('id', gameId);
}

export async function clearPending(gameId: string) {
  await supabaseAdmin.from('pending_targets').delete().eq('game_id', gameId);
  await supabaseAdmin.from('games').update({
    pending_type: null, pending_initiator_id: null, pending_expires_at: null, pending_event_id: null,
    turn_activity_at: new Date().toISOString(),
  }).eq('id', gameId);
}