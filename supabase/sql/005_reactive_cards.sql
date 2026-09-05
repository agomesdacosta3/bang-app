alter type card_type add value 'duel';
alter type card_type add value 'indians';
alter type pending_action_type add value 'duel_response';
alter type pending_action_type add value 'indians_response';

create table pending_targets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  is_current_turn boolean not null default true,
  unique (game_id, player_id)
);

alter table pending_targets enable row level security;
revoke all on pending_targets from authenticated, anon;
grant select on pending_targets to authenticated;
create policy pending_targets_select on pending_targets
for select using (game_id in (select my_game_ids()));

alter table games drop constraint games_pending_target_fk;
alter table games drop column pending_target_id;