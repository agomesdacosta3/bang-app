create type character_name as enum (
  'bart_cassidy', 'black_jack', 'calamity_janet', 'el_gringo', 'jesse_jones',
  'jourdonnais', 'kit_carlson', 'lucky_duke', 'paul_regret', 'pedro_ramirez',
  'rose_doolan', 'sid_ketchum', 'slab_the_killer', 'suzy_lafayette', 'vulture_sam', 'willy_the_kid'
);

create table player_characters (
  player_id uuid primary key references players(id) on delete cascade,
  character character_name not null
);

alter table player_characters enable row level security;
grant select on player_characters to authenticated;
create policy player_characters_select on player_characters
for select using (
  exists (select 1 from players p where p.id = player_characters.player_id and p.game_id in (select my_game_ids()))
);