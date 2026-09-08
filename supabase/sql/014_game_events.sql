create table game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  actor_seat int,
  target_seat int,
  card_type card_type,
  amount int
);

alter table game_events enable row level security;
grant select on game_events to authenticated;
create policy game_events_select on game_events
for select using (game_id in (select my_game_ids()));