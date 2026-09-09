import { supabaseAdmin } from './supabaseAdmin.ts';

export async function buildDistanceFlags(playerIds: string[]) {
  const { data: equipment } = await supabaseAdmin.from('cards_in_play').select('player_id, card_type').in('player_id', playerIds);
  const { data: characters } = await supabaseAdmin.from('player_characters').select('player_id, character').in('player_id', playerIds);

  const mustangIds = new Set((equipment ?? []).filter(e => e.card_type === 'mustang').map(e => e.player_id));
  const scopeIds = new Set((equipment ?? []).filter(e => e.card_type === 'scope').map(e => e.player_id));

  (characters ?? []).forEach(c => {
    if (c.character === 'paul_regret') mustangIds.add(c.player_id);
    if (c.character === 'rose_doolan') scopeIds.add(c.player_id);
  });

  return { mustangIds, scopeIds };
}