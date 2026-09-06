do $$
declare
  t text;
begin
  foreach t in array array['games', 'players', 'hand_cards', 'discard_pile', 'pending_targets', 'cards_in_play'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;