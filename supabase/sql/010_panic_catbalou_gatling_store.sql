alter type card_type add value 'panic';
alter type card_type add value 'cat_balou';
alter type card_type add value 'gatling';
alter type card_type add value 'general_store';
alter type pending_action_type add value 'gatling_response';
alter type pending_action_type add value 'general_store';

create table general_store_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  card_type card_type not null,
  suit card_suit not null,
  value int not null
);
alter table general_store_cards enable row level security;
grant select on general_store_cards to authenticated;
create policy general_store_cards_select on general_store_cards
for select using (game_id in (select my_game_ids()));

alter table pending_targets add column order_index int not null default 0;