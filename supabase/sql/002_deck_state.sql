create table deck_state (
  game_id uuid primary key references games(id) on delete cascade,
  cards jsonb not null
);

alter table deck_state enable row level security;
revoke all on deck_state from authenticated, anon;