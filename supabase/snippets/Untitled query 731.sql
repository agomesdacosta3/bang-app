create or replace function my_game_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select game_id from players where user_id = auth.uid()
$$;

drop policy players_select on players;
create policy players_select on players
for select using (game_id in (select my_game_ids()));