create type card_suit as enum ('hearts', 'diamonds', 'clubs', 'spades');

alter table hand_cards add column suit card_suit not null default 'hearts';
alter table hand_cards add column value int not null default 2;
alter table hand_cards alter column suit drop default;
alter table hand_cards alter column value drop default;

alter table discard_pile add column suit card_suit not null default 'hearts';
alter table discard_pile add column value int not null default 2;
alter table discard_pile alter column suit drop default;
alter table discard_pile alter column value drop default;