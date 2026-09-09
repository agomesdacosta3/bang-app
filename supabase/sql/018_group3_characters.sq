alter table pending_targets add column cancels_needed int not null default 1;
alter table pending_targets add column cancels_achieved int not null default 0;
alter table pending_targets add column barrel_tries_used int not null default 0;
alter table pending_targets drop column barrel_tried;