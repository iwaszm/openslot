begin;

alter table public.schedule_entries
  add column if not exists note text;

alter table public.schedule_entries
  drop constraint if exists schedule_entries_note_length_check;

alter table public.schedule_entries
  add constraint schedule_entries_note_length_check
  check (note is null or char_length(note) <= 120);

comment on column public.schedule_entries.note is
  'Optional staff-facing note for manually created appointments. Never exposed by public schedule RPCs.';

commit;
