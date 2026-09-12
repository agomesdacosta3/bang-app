alter table games add column turn_activity_at timestamptz;
alter table players add column consecutive_auto_passes int not null default 0;