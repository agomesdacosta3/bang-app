import { supabaseAdmin } from './supabaseAdmin.ts';
import { getCharacter } from './characters.ts';

export async function getMaxBarrelTries(playerId: string): Promise<number> {
  const character = await getCharacter(playerId);
  const { data: barrel } = await supabaseAdmin.from('cards_in_play').select('id').eq('player_id', playerId).eq('card_type', 'barrel').maybeSingle();
  return (character === 'jourdonnais' ? 1 : 0) + (barrel ? 1 : 0);
}