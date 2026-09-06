alter type card_type add value 'barrel';
alter type card_type add value 'prison';
alter type card_type add value 'dynamite';

create table cards_in_play (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  card_type card_type not null,
  unique (player_id, card_type)
);

alter table cards_in_play enable row level security;
revoke all on cards_in_play from authenticated, anon;
grant select on cards_in_play to authenticated;
create policy cards_in_play_select on cards_in_play
for select using (
  exists (select 1 from players p where p.id = cards_in_play.player_id and p.game_id in (select my_game_ids()))
);