select count(*) as total_hand from hand_cards;
select count(*) as total_discard from discard_pile;
select count(*) as total_in_play from cards_in_play;
select jsonb_array_length(cards) as total_deck from deck_state where game_id = '506d5f5a-d658-40e1-b1ce-ac2aceed55da';