begin;

-- Keep customer lookup and daily duplicate consolidation efficient without
-- enforcing uniqueness on the existing public booking RPC.
create index if not exists customers_salon_email_normalized_idx
  on public.customers (salon_id, (lower(btrim(email))));

create or replace function public.cleanup_openslot_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $cleanup$
declare
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_date_cutoff date;
  v_timestamp_cutoff timestamptz := now() - interval '30 days';
  v_customers_merged integer := 0;
  v_email_events_deleted integer := 0;
  v_appointments_deleted integer := 0;
  v_schedule_entries_deleted integer := 0;
  v_admin_time_blocks_deleted integer := 0;
  v_shop_day_settings_deleted integer := 0;
  v_blocked_slots_deleted integer := 0;
  v_staff_slot_overrides_deleted integer := 0;
  v_orphan_customers_deleted integer := 0;
begin
  v_date_cutoff := v_today - 30;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('openslot-history-cleanup', 0)
  );

  -- Customers are shared only inside one salon. Keep the newest profile for
  -- each normalized email and move every appointment to that canonical row.
  with ranked_customers as (
    select
      customer.id,
      first_value(customer.id) over (
        partition by customer.salon_id, lower(btrim(customer.email))
        order by customer.created_at desc, customer.id desc
      ) as canonical_id,
      row_number() over (
        partition by customer.salon_id, lower(btrim(customer.email))
        order by customer.created_at desc, customer.id desc
      ) as duplicate_rank
    from public.customers customer
    where nullif(lower(btrim(customer.email)), '') is not null
  )
  update public.appointments appointment
  set customer_id = ranked.canonical_id
  from ranked_customers ranked
  where ranked.duplicate_rank > 1
    and appointment.customer_id = ranked.id;

  with ranked_customers as (
    select
      customer.id,
      row_number() over (
        partition by customer.salon_id, lower(btrim(customer.email))
        order by customer.created_at desc, customer.id desc
      ) as duplicate_rank
    from public.customers customer
    where nullif(lower(btrim(customer.email)), '') is not null
  )
  delete from public.customers customer
  using ranked_customers ranked
  where ranked.duplicate_rank > 1
    and customer.id = ranked.id;
  get diagnostics v_customers_merged = row_count;

  delete from public.email_events event
  where event.created_at < v_timestamp_cutoff;
  get diagnostics v_email_events_deleted = row_count;

  -- Deleting appointments also cascades to their online schedule entries and
  -- any remaining email events.
  delete from public.appointments appointment
  where appointment.appointment_date < v_date_cutoff;
  get diagnostics v_appointments_deleted = row_count;

  delete from public.schedule_entries entry
  where entry.schedule_date < v_date_cutoff;
  get diagnostics v_schedule_entries_deleted = row_count;

  delete from public.admin_time_blocks block
  where block.block_date < v_date_cutoff;
  get diagnostics v_admin_time_blocks_deleted = row_count;

  delete from public.shop_day_settings setting
  where setting.setting_date < v_date_cutoff;
  get diagnostics v_shop_day_settings_deleted = row_count;

  -- These tables are legacy compatibility storage. Canonical rows already
  -- live in schedule_entries, so keep the old tables empty.
  delete from public.blocked_slots;
  get diagnostics v_blocked_slots_deleted = row_count;

  delete from public.staff_slot_overrides;
  get diagnostics v_staff_slot_overrides_deleted = row_count;

  delete from public.customers customer
  where not exists (
    select 1
    from public.appointments appointment
    where appointment.customer_id = customer.id
  );
  get diagnostics v_orphan_customers_deleted = row_count;

  return jsonb_build_object(
    'date_cutoff', v_date_cutoff,
    'customers_merged', v_customers_merged,
    'email_events_deleted', v_email_events_deleted,
    'appointments_deleted', v_appointments_deleted,
    'schedule_entries_deleted', v_schedule_entries_deleted,
    'admin_time_blocks_deleted', v_admin_time_blocks_deleted,
    'shop_day_settings_deleted', v_shop_day_settings_deleted,
    'blocked_slots_deleted', v_blocked_slots_deleted,
    'staff_slot_overrides_deleted', v_staff_slot_overrides_deleted,
    'orphan_customers_deleted', v_orphan_customers_deleted
  );
end;
$cleanup$;

revoke all on function public.cleanup_openslot_history() from public;
revoke all on function public.cleanup_openslot_history() from anon;
revoke all on function public.cleanup_openslot_history() from authenticated;

create extension if not exists pg_cron;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'openslot-history-cleanup'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'openslot-history-cleanup',
    '40 2 * * 0',
    $job$select public.cleanup_openslot_history();$job$
  );
end;
$schedule$;

-- Apply the requested cleanup immediately; subsequent runs are handled by Cron.
select public.cleanup_openslot_history();

commit;
