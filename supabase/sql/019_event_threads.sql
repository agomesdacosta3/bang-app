alter table game_events add column thread_id uuid;
alter table games add column pending_event_id uuid;
alter table cards_in_play add column origin_event_id uuid;