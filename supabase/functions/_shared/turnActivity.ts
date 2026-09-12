import { supabaseAdmin } from './supabaseAdmin.ts';

export async function touchTurnActivity(gameId: string) {
  await supabaseAdmin.from('games').update({ turn_activity_at: new Date().toISOString() }).eq('id', gameId);
}