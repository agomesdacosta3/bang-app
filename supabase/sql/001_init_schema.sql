-- Enums
create type game_status as enum ('lobby', 'in_progress', 'finished');
create type turn_phase as enum ('draw', 'play', 'discard');
create type player_role as enum ('deputy', 'outlaw', 'renegade');
create type winner_team as enum ('sheriff', 'outlaws', 'renegade');
create type card_type as enum ('bang', 'missed', 'beer');
create type pending_action_type as enum ('bang_response');

-- Tables
create table games (
  id uuid primary key default gen_random_uuid(),
  status game_status not null default 'lobby',
  current_player_id uuid,
  turn_phase turn_phase,
  pending_type pending_action_type,
  pending_initiator_id uuid,
  pending_target_id uuid,
  pending_expires_at timestamptz,
  deck_remaining int not null default 0,
  winner_team winner_team,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  seat_position int not null,
  is_sheriff boolean not null default false,
  life_points int,          -- nullable : assigné seulement par start-game
  max_life_points int,      -- nullable : assigné seulement par start-game
  is_alive boolean not null default true,
  has_played_bang_this_turn boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (game_id, seat_position),
  unique (game_id, user_id)
);

alter table games
  add constraint games_current_player_fk foreign key (current_player_id) references players(id),
  add constraint games_pending_initiator_fk foreign key (pending_initiator_id) references players(id),
  add constraint games_pending_target_fk foreign key (pending_target_id) references players(id);

create table player_roles (
  player_id uuid primary key references players(id) on delete cascade,
  role player_role not null
);

create table hand_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  card_type card_type not null,
  created_at timestamptz not null default now()
);

create table discard_pile (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  card_type card_type not null,
  discarded_at timestamptz not null default now()
);

create view hand_counts as
  select player_id, count(*) as count from hand_cards group by player_id;

-- RLS
alter table games enable row level security;
alter table players enable row level security;
alter table player_roles enable row level security;
alter table hand_cards enable row level security;
alter table discard_pile enable row level security;

revoke insert, update, delete on games, players, player_roles, hand_cards, discard_pile from authenticated, anon;
grant select on games, players, player_roles, hand_cards, discard_pile, hand_counts to authenticated;

create policy games_select on games
for select using (exists (select 1 from players p where p.game_id = games.id and p.user_id = auth.uid()));

create policy players_select on players
for select using (exists (select 1 from players self where self.game_id = players.game_id and self.user_id = auth.uid()));

create policy player_roles_select on player_roles
for select using (
  exists (
    select 1 from players target
    join players self on self.game_id = target.game_id
    where target.id = player_roles.player_id
      and self.user_id = auth.uid()
      and (target.user_id = auth.uid() or target.is_alive = false)
  )
);

create policy hand_cards_select_own on hand_cards
for select using (exists (select 1 from players p where p.id = hand_cards.player_id and p.user_id = auth.uid()));

create policy discard_pile_select on discard_pile
for select using (exists (select 1 from players p where p.game_id = discard_pile.game_id and p.user_id = auth.uid()));