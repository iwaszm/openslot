begin;

-- These single-column relationships are fully covered by the newer
-- salon-scoped composite foreign keys. Keeping both makes PostgREST embeds
-- ambiguous (for example appointments -> customers).
alter table public.appointments
  drop constraint if exists appointments_customer_id_fkey,
  drop constraint if exists appointments_service_id_fkey;

alter table public.staff_lanes
  drop constraint if exists staff_lanes_staff_id_fkey;

alter table public.schedule_entries
  drop constraint if exists schedule_entries_staff_lane_id_fkey,
  drop constraint if exists schedule_entries_service_id_fkey;

commit;

notify pgrst, 'reload schema';
