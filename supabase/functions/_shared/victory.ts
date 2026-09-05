import { supabaseAdmin } from './supabaseAdmin.ts';

export async function checkVictory(gameId: string, eliminatedPlayerId: string) {
  const { data: players } = await supabaseAdmin.from('players').select('id, is_sheriff, is_alive').eq('game_id', gameId);
  const { data: roles } = await supabaseAdmin.from('player_roles').select('player_id, role').in('player_id', players!.map(p => p.id));
  const roleOf = (id: string) => players!.find(p => p.id === id)?.is_sheriff ? 'sheriff' : roles!.find(r => r.player_id === id)?.role;
  const eliminated = players!.find(p => p.id === eliminatedPlayerId);
  const aliveIds = players!.filter(p => p.is_alive).map(p => p.id);
  let winner: 'sheriff' | 'outlaws' | 'renegade' | null = null;

  if (eliminated?.is_sheriff) {
    const aliveRoles = aliveIds.map(roleOf);
    winner = (aliveRoles.length === 1 && aliveRoles[0] === 'renegade') ? 'renegade' : 'outlaws';
  } else {
    const remainingThreats = aliveIds.filter(id => ['outlaw', 'renegade'].includes(roleOf(id) as string));
    if (remainingThreats.length === 0) winner = 'sheriff';
  }

  if (winner) await supabaseAdmin.from('games').update({ status: 'finished', winner_team: winner }).eq('id', gameId);
  return winner;
}