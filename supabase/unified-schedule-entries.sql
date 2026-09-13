-- Canonical schedule ledger for online bookings, manual appointments and blocks.
-- Run after staff-lane-configuration.sql and three-lane-scheduling.sql.

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null references public.salon_staff(id) on delete restrict,
  staff_lane_id uuid not null references public.staff_lanes(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete cascade,
  service_id text references public.services(id) on delete restrict,
  entry_source text not null check (entry_source in ('online', 'manual', 'block')),
  schedule_date date not null,
  covered_start time not null,
  covered_end time not null,
  occupied_slots time[] not null default '{}'::time[],
  status text not null default 'active' check (status in ('active', 'cancelled')),
  legacy_source text,
  legacy_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  covered_range int4range generated always as (
    int4range(time_to_minutes(covered_start), time_to_minutes(covered_end), '[)')
  ) stored,
  check (covered_end > covered_start),
  check (entry_source <> 'online' or appointment_id is not null),
  check (entry_source = 'block' or service_id is not null),
  unique (appointment_id),
  unique (legacy_source, legacy_id)
);

create index if not exists schedule_entries_day_idx
  on public.schedule_entries (salon_id, schedule_date, staff_lane_id, covered_start);

create index if not exists schedule_entries_occupied_idx
  on public.schedule_entries using gin (occupied_slots);

alter table public.schedule_entries
  drop constraint if exists schedule_entries_no_covered_overlap;

alter table public.schedule_entries
  add constraint schedule_entries_no_covered_overlap
  exclude using gist (
    staff_lane_id with =,
    schedule_date with =,
    covered_range with &&
  )
  where (status = 'active');

alter table public.schedule_entries enable row level security;

drop policy if exists "Salon members can read schedule entries" on public.schedule_entries;
create policy "Salon members can read schedule entries"
  on public.schedule_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = schedule_entries.salon_id)
    )
  );

drop policy if exists "Salon members can manage schedule entries" on public.schedule_entries;
create policy "Salon members can manage schedule entries"
  on public.schedule_entries for all
  to authenticated
  using (
    entry_source <> 'online'
    and exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = schedule_entries.salon_id)
    )
  )
  with check (
    entry_source <> 'online'
    and exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = schedule_entries.salon_id)
    )
  );

-- Existing online appointments become canonical schedule entries.
insert into public.schedule_entries (
  salon_id, staff_id, staff_lane_id, appointment_id, service_id,
  entry_source, schedule_date, covered_start, covered_end, occupied_slots,
  status, legacy_source, legacy_id, created_at, updated_at
)
select
  a.salon_id,
  lane.staff_id,
  lane.id,
  a.id,
  a.service_id,
  'online',
  a.appointment_date,
  (a.start_time at time zone coalesce(s.timezone, 'Europe/Berlin'))::time,
  (a.end_time at time zone coalesce(s.timezone, 'Europe/Berlin'))::time,
  a.occupied_slots,
  case when a.status = 'cancelled' then 'cancelled' else 'active' end,
  'appointments',
  a.id::text,
  a.created_at,
  now()
from public.appointments a
join public.salons s on s.id = a.salon_id
join public.staff_lanes lane
  on lane.salon_id = a.salon_id
 and lane.lane_key = coalesce(a.lane_key, 'a')
on conflict (appointment_id) do update set
  staff_id = excluded.staff_id,
  staff_lane_id = excluded.staff_lane_id,
  service_id = excluded.service_id,
  schedule_date = excluded.schedule_date,
  covered_start = excluded.covered_start,
  covered_end = excluded.covered_end,
  occupied_slots = excluded.occupied_slots,
  status = excluded.status,
  updated_at = now();

create or replace function public.sync_appointment_schedule_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
  v_staff_lane_id uuid;
  v_timezone text := 'Europe/Berlin';
begin
  select coalesce(s.timezone, 'Europe/Berlin') into v_timezone
  from public.salons s
  where s.id = new.salon_id;

  select lane.staff_id, lane.id into v_staff_id, v_staff_lane_id
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.salon_id = new.salon_id
    and lane.lane_key = coalesce(new.lane_key, 'a')
  order by staff.sort_order, lane.sort_order
  limit 1;

  if v_staff_lane_id is null then
    raise exception 'No active staff lane matches appointment lane %', coalesce(new.lane_key, 'a');
  end if;

  insert into public.schedule_entries (
    salon_id, staff_id, staff_lane_id, appointment_id, service_id,
    entry_source, schedule_date, covered_start, covered_end, occupied_slots,
    status, legacy_source, legacy_id, created_at, updated_at
  ) values (
    new.salon_id,
    v_staff_id,
    v_staff_lane_id,
    new.id,
    new.service_id,
    'online',
    new.appointment_date,
    (new.start_time at time zone v_timezone)::time,
    (new.end_time at time zone v_timezone)::time,
    new.occupied_slots,
    case when new.status = 'cancelled' then 'cancelled' else 'active' end,
    'appointments',
    new.id::text,
    new.created_at,
    now()
  )
  on conflict (appointment_id) do update set
    staff_id = excluded.staff_id,
    staff_lane_id = excluded.staff_lane_id,
    service_id = excluded.service_id,
    schedule_date = excluded.schedule_date,
    covered_start = excluded.covered_start,
    covered_end = excluded.covered_end,
    occupied_slots = excluded.occupied_slots,
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists appointments_sync_schedule_entry on public.appointments;
create trigger appointments_sync_schedule_entry
after insert or update of salon_id, service_id, appointment_date, start_time, end_time, occupied_slots, lane_key, status
on public.appointments
for each row execute function public.sync_appointment_schedule_entry();

-- Legacy manual entries predate lanes. Allocate each complete covered interval to
-- the first active lane that can hold it, including around migrated online rows.
do $$
declare
  legacy_entry record;
  target_lane record;
begin
  for legacy_entry in
    select
      b.*,
      coalesce(b.service_start_time, b.start_time) as covered_start,
      case
        when b.service_id is null then b.end_time
        else (
          coalesce(b.service_start_time, b.start_time)
          + make_interval(mins => service.duration_minutes)
        )::time
      end as covered_end
    from public.blocked_slots b
    left join public.services service
      on service.id = b.service_id and service.salon_id = b.salon_id
    order by b.salon_id, b.block_date, covered_start, covered_end desc, b.created_at, b.id
  loop
    select lane.id, lane.staff_id into target_lane
    from public.staff_lanes lane
    join public.salon_staff staff on staff.id = lane.staff_id
    where lane.salon_id = legacy_entry.salon_id
      and lane.is_active = true
      and staff.is_active = true
      and not exists (
        select 1
        from public.schedule_entries existing
        where existing.staff_lane_id = lane.id
          and existing.schedule_date = legacy_entry.block_date
          and existing.status = 'active'
          and existing.legacy_id <> legacy_entry.id::text
          and time_to_minutes(legacy_entry.covered_start) < time_to_minutes(existing.covered_end)
          and time_to_minutes(legacy_entry.covered_end) > time_to_minutes(existing.covered_start)
      )
    order by staff.sort_order, lane.sort_order
    limit 1;

    if target_lane.id is null then
      raise exception 'Legacy manual entry % cannot fit into an active lane', legacy_entry.id;
    end if;

    insert into public.schedule_entries (
      salon_id, staff_id, staff_lane_id, service_id, entry_source,
      schedule_date, covered_start, covered_end, occupied_slots,
      legacy_source, legacy_id, created_at, updated_at
    ) values (
      legacy_entry.salon_id,
      target_lane.staff_id,
      target_lane.id,
      legacy_entry.service_id,
      case when legacy_entry.service_id is null then 'block' else 'manual' end,
      legacy_entry.block_date,
      legacy_entry.covered_start,
      legacy_entry.covered_end,
      coalesce(legacy_entry.occupied_slots, array[legacy_entry.start_time]::time[]),
      'blocked_slots',
      legacy_entry.id::text,
      legacy_entry.created_at,
      now()
    )
    on conflict (legacy_source, legacy_id) do update set
      staff_id = excluded.staff_id,
      staff_lane_id = excluded.staff_lane_id,
      service_id = excluded.service_id,
      entry_source = excluded.entry_source,
      covered_start = excluded.covered_start,
      covered_end = excluded.covered_end,
      occupied_slots = excluded.occupied_slots,
      updated_at = now();
  end loop;
end;
$$;

-- Legacy B/C service rows are grouped back into one complete appointment.
insert into public.schedule_entries (
  salon_id, staff_id, staff_lane_id, service_id, entry_source,
  schedule_date, covered_start, covered_end, occupied_slots,
  legacy_source, legacy_id, created_at, updated_at
)
select
  o.salon_id,
  lane.staff_id,
  lane.id,
  o.service_id,
  'manual',
  o.slot_date,
  o.service_start_time,
  (o.service_start_time + make_interval(mins => service.duration_minutes))::time,
  array(
    select (o.service_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    from unnest(service.booked_slots) as slot_number
    order by slot_number
  ),
  'staff_slot_overrides',
  concat(o.staff_key, ':', o.slot_date, ':', o.service_id, ':', o.service_start_time),
  min(o.created_at),
  now()
from public.staff_slot_overrides o
join public.services service on service.id = o.service_id and service.salon_id = o.salon_id
join public.staff_lanes lane
  on lane.salon_id = o.salon_id
 and lane.lane_key = case o.staff_key when 'overflow' then 'b' else 'c' end
where o.service_id is not null and o.service_start_time is not null
group by
  o.salon_id, lane.staff_id, lane.id, o.staff_key, o.slot_date,
  o.service_id, o.service_start_time, service.duration_minutes, service.booked_slots
on conflict (legacy_source, legacy_id) do update set
  staff_id = excluded.staff_id,
  staff_lane_id = excluded.staff_lane_id,
  covered_start = excluded.covered_start,
  covered_end = excluded.covered_end,
  occupied_slots = excluded.occupied_slots,
  updated_at = now();

-- Legacy B/C explicit blocks remain individual 30-minute entries.
insert into public.schedule_entries (
  salon_id, staff_id, staff_lane_id, entry_source, schedule_date,
  covered_start, covered_end, occupied_slots,
  legacy_source, legacy_id, created_at, updated_at
)
select
  o.salon_id,
  lane.staff_id,
  lane.id,
  'block',
  o.slot_date,
  o.start_time,
  (o.start_time + interval '30 minutes')::time,
  array[o.start_time]::time[],
  'staff_slot_overrides',
  o.id::text,
  o.created_at,
  now()
from public.staff_slot_overrides o
join public.staff_lanes lane
  on lane.salon_id = o.salon_id
 and lane.lane_key = case o.staff_key when 'overflow' then 'b' else 'c' end
where o.service_id is null and o.is_open = false
on conflict (legacy_source, legacy_id) do update set
  staff_id = excluded.staff_id,
  staff_lane_id = excluded.staff_lane_id,
  covered_start = excluded.covered_start,
  covered_end = excluded.covered_end,
  occupied_slots = excluded.occupied_slots,
  updated_at = now();

drop function if exists public.create_admin_schedule_entry(uuid, uuid, date, time, text);

create or replace function public.create_admin_schedule_entry(
  p_salon_id uuid,
  p_staff_lane_id uuid,
  p_schedule_date date,
  p_start_time time,
  p_service_id text default null,
  p_replace_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid := gen_random_uuid();
  v_staff_id uuid;
  v_duration integer := 30;
  v_booked_slots smallint[] := array[1]::smallint[];
  v_covered_end time;
  v_occupied_slots time[];
  v_open_time time := time '10:00';
  v_close_time time := time '19:00';
  v_blocked_day boolean := false;
begin
  if not exists (
    select 1 from public.salon_members sm
    where sm.user_id = auth.uid()
      and (sm.role = 'super_admin' or sm.salon_id = p_salon_id)
  ) then
    raise exception 'Not authorized for this salon';
  end if;

  select lane.staff_id into v_staff_id
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.id = p_staff_lane_id
    and lane.salon_id = p_salon_id
    and lane.is_active = true
    and staff.is_active = true;

  if v_staff_id is null then raise exception 'Unknown or inactive staff lane'; end if;

  if p_service_id is not null then
    select duration_minutes, booked_slots into v_duration, v_booked_slots
    from public.services
    where id = p_service_id and salon_id = p_salon_id and is_active = true;
    if not found then raise exception 'Unknown or inactive service'; end if;
  end if;

  select open_time, close_time, is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.shop_day_settings
  where salon_id = p_salon_id and setting_date = p_schedule_date;

  if not found then
    v_open_time := time '10:00';
    v_close_time := case when extract(dow from p_schedule_date) = 6 then '17:00'::time else '18:00'::time end;
    v_blocked_day := extract(dow from p_schedule_date) = 0;
  end if;

  if v_blocked_day then raise exception 'The whole day is already blocked'; end if;
  if time_to_minutes(p_start_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_start_time >= v_close_time then
    raise exception 'Manual entry must start inside working hours';
  end if;

  v_covered_end := (p_start_time + make_interval(mins => v_duration))::time;
  if v_covered_end <= p_start_time then raise exception 'Manual entry must end on the same day'; end if;

  select array_agg(
    (p_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    order by slot_number
  ) into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

  perform pg_advisory_xact_lock(
    hashtextextended(p_staff_lane_id::text || ':' || p_schedule_date::text, 0)
  );

  if p_replace_entry_id is not null then
    update public.schedule_entries entry
    set status = 'cancelled', updated_at = now()
    where entry.id = p_replace_entry_id
      and entry.salon_id = p_salon_id
      and entry.staff_lane_id = p_staff_lane_id
      and entry.entry_source <> 'online'
      and entry.status = 'active';

    if not found then raise exception 'Replacement entry not found or not editable'; end if;
  end if;

  insert into public.schedule_entries (
    id, salon_id, staff_id, staff_lane_id, service_id, entry_source,
    schedule_date, covered_start, covered_end, occupied_slots, created_by
  ) values (
    v_entry_id, p_salon_id, v_staff_id, p_staff_lane_id, p_service_id,
    case when p_service_id is null then 'block' else 'manual' end,
    p_schedule_date, p_start_time, v_covered_end,
    coalesce(v_occupied_slots, array[p_start_time]::time[]), auth.uid()
  );

  return v_entry_id;
end;
$$;

revoke all on function public.create_admin_schedule_entry(uuid, uuid, date, time, text, uuid) from public;
grant execute on function public.create_admin_schedule_entry(uuid, uuid, date, time, text, uuid) to authenticated;

create or replace function public.cancel_admin_schedule_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.schedule_entries entry
  set status = 'cancelled', updated_at = now()
  where entry.id = p_entry_id
    and entry.entry_source <> 'online'
    and exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = entry.salon_id)
    );

  if not found then raise exception 'Schedule entry not found or not authorized'; end if;
end;
$$;

revoke all on function public.cancel_admin_schedule_entry(uuid) from public;
grant execute on function public.cancel_admin_schedule_entry(uuid) to authenticated;

comment on table public.schedule_entries is
  'Canonical schedule ledger. Covered-time overlap is prohibited within one lane; occupied-time conflicts are checked only when creating an online booking.';

alter table public.appointments
  drop constraint if exists appointments_lane_key_check;

drop function if exists public.get_public_schedule(text, date);
create function public.get_public_schedule(
  p_salon_slug text,
  p_appointment_date date
)
returns table (
  record_id text,
  staff_key text,
  lane_key text,
  covered_start time,
  covered_end time,
  occupied_slots time[],
  record_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    entry.id::text,
    staff.staff_key,
    lane.lane_key,
    entry.covered_start,
    entry.covered_end,
    entry.occupied_slots,
    entry.entry_source
  from public.schedule_entries entry
  join public.salons salon on salon.id = entry.salon_id
  join public.salon_staff staff on staff.id = entry.staff_id
  join public.staff_lanes lane on lane.id = entry.staff_lane_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and staff.is_active = true
    and lane.is_active = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active'
  order by staff.sort_order, lane.sort_order, entry.covered_start;
$$;

revoke execute on function public.get_public_schedule(text, date) from public;
grant execute on function public.get_public_schedule(text, date) to anon, authenticated;

create or replace function public.get_public_occupied_slots(
  p_salon_slug text,
  p_appointment_date date
)
returns table (occupied_slots time[])
language sql
stable
security definer
set search_path = public
as $$
  select entry.occupied_slots
  from public.schedule_entries entry
  join public.salons salon on salon.id = entry.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active';
$$;

revoke execute on function public.get_public_occupied_slots(text, date) from public;
grant execute on function public.get_public_occupied_slots(text, date) to anon, authenticated;

create or replace function public.create_public_booking(
  p_salon_slug text,
  p_service_id text,
  p_appointment_date date,
  p_start_time time,
  p_gender text,
  p_name text,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_id uuid;
  v_timezone text := 'Europe/Berlin';
  v_customer_id uuid := gen_random_uuid();
  v_appointment_id uuid := gen_random_uuid();
  v_duration integer;
  v_booked_slots smallint[];
  v_occupied_slots time[];
  v_end_time time;
  v_open_time time := time '10:00';
  v_close_time time := time '18:00';
  v_blocked_day boolean := false;
  v_staff_lane_id uuid;
  v_lane_key text;
begin
  select salon.id, coalesce(salon.timezone, 'Europe/Berlin')
    into v_salon_id, v_timezone
  from public.salons salon
  where salon.slug = p_salon_slug and salon.is_active = true;

  if v_salon_id is null then raise exception 'Unknown salon'; end if;

  select service.duration_minutes, service.booked_slots
    into v_duration, v_booked_slots
  from public.services service
  where service.id = p_service_id
    and service.salon_id = v_salon_id
    and service.is_active = true;

  if v_duration is null then raise exception 'Unknown or inactive service'; end if;

  select settings.open_time, settings.close_time, settings.is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.shop_day_settings settings
  where settings.salon_id = v_salon_id
    and settings.setting_date = p_appointment_date;

  if not found then
    v_open_time := time '10:00';
    v_close_time := case when extract(dow from p_appointment_date) = 6 then '17:00'::time else '18:00'::time end;
    v_blocked_day := extract(dow from p_appointment_date) = 0;
  end if;

  v_end_time := (p_start_time + make_interval(mins => v_duration))::time;
  select array_agg(
    (p_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    order by slot_number
  ) into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

  if p_appointment_date < (now() at time zone v_timezone)::date then raise exception 'Cannot book a past date'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 50 or trim(p_name) ~ '^[0-9]+$' then raise exception 'Invalid customer name'; end if;
  if p_gender not in ('male', 'female') then raise exception 'Invalid gender'; end if;
  if length(trim(p_phone)) < 3 or length(trim(p_phone)) > 50 then raise exception 'Invalid phone'; end if;
  if length(trim(p_email)) > 50 or trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;
  if v_blocked_day then raise exception 'This day is not available'; end if;
  if time_to_minutes(p_start_time) % 30 <> 0 then raise exception 'Start time must use 30 minute increments'; end if;
  if v_end_time <= p_start_time or p_start_time < v_open_time or v_end_time > v_close_time then raise exception 'Booking is outside working hours'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_salon_id::text || ':' || p_appointment_date::text, 0)
  );

  select lane.id, lane.lane_key
    into v_staff_lane_id, v_lane_key
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.salon_id = v_salon_id
    and lane.is_active = true
    and staff.is_active = true
    and not exists (
      select 1 from public.schedule_entries entry
      where entry.staff_lane_id = lane.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and time_to_minutes(p_start_time) < time_to_minutes(entry.covered_end)
        and time_to_minutes(v_end_time) > time_to_minutes(entry.covered_start)
    )
    and not exists (
      select 1 from public.schedule_entries entry
      where entry.staff_id = staff.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and entry.occupied_slots && v_occupied_slots
    )
  order by staff.sort_order, lane.sort_order
  limit 1;

  if v_staff_lane_id is null then raise exception 'No available staff lane for this service'; end if;

  if (
    select count(*)
    from public.appointments appointment
    join public.customers customer on customer.id = appointment.customer_id
    where appointment.salon_id = v_salon_id
      and appointment.created_at > now() - interval '10 minutes'
      and (
        lower(customer.email) = lower(trim(p_email))
        or regexp_replace(customer.phone, '\s+', '', 'g') = regexp_replace(trim(p_phone), '\s+', '', 'g')
      )
  ) >= 3 then raise exception 'Too many booking attempts'; end if;

  insert into public.customers (id, salon_id, name, phone, email, gender)
  values (v_customer_id, v_salon_id, trim(p_name), trim(p_phone), lower(trim(p_email)), p_gender);

  insert into public.appointments (
    id, salon_id, customer_id, service_id, appointment_date,
    start_time, end_time, occupied_slots, lane_key, status
  ) values (
    v_appointment_id,
    v_salon_id,
    v_customer_id,
    p_service_id,
    p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone v_timezone,
    (p_appointment_date::timestamp + v_end_time) at time zone v_timezone,
    v_occupied_slots,
    v_lane_key,
    'confirmed'
  );

  return v_appointment_id;
end;
$$;

revoke all on function public.create_public_booking(text, text, date, time, text, text, text, text) from public;
grant execute on function public.create_public_booking(text, text, date, time, text, text, text, text)
  to anon, authenticated;
