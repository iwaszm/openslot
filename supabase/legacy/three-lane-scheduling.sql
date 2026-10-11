-- One employee, three concurrent service lanes.
-- Run after service-booked-slots.sql and staff-slot-overrides.sql.

alter table public.appointments
  add column if not exists lane_key text;

alter table public.appointments
  drop constraint if exists appointments_lane_key_check;

alter table public.appointments
  add constraint appointments_lane_key_check
  check (lane_key in ('a', 'b', 'c'));

-- Keep existing bookings visually stable by assigning their complete covered
-- intervals to the first available lane in chronological order.
do $$
declare
  booking record;
  assigned_lane text;
begin
  for booking in
    select id, salon_id, appointment_date, start_time, end_time
    from public.appointments
    where status <> 'cancelled' and lane_key is null
    order by salon_id, appointment_date, start_time, end_time desc, created_at, id
  loop
    assigned_lane := null;

    if not exists (
      select 1 from public.appointments existing
      where existing.salon_id = booking.salon_id
        and existing.appointment_date = booking.appointment_date
        and existing.status <> 'cancelled'
        and existing.lane_key = 'a'
        and booking.start_time < existing.end_time
        and booking.end_time > existing.start_time
    ) then
      assigned_lane := 'a';
    elsif not exists (
      select 1 from public.appointments existing
      where existing.salon_id = booking.salon_id
        and existing.appointment_date = booking.appointment_date
        and existing.status <> 'cancelled'
        and existing.lane_key = 'b'
        and booking.start_time < existing.end_time
        and booking.end_time > existing.start_time
    ) then
      assigned_lane := 'b';
    elsif not exists (
      select 1 from public.appointments existing
      where existing.salon_id = booking.salon_id
        and existing.appointment_date = booking.appointment_date
        and existing.status <> 'cancelled'
        and existing.lane_key = 'c'
        and booking.start_time < existing.end_time
        and booking.end_time > existing.start_time
    ) then
      assigned_lane := 'c';
    end if;

    if assigned_lane is null then
      raise exception 'Existing booking % cannot fit into lanes A, B, or C', booking.id;
    end if;

    update public.appointments set lane_key = assigned_lane where id = booking.id;
  end loop;
end;
$$;

-- Cancelled rows do not consume capacity but still receive a valid lane value.
update public.appointments set lane_key = 'a' where lane_key is null;

alter table public.appointments
  alter column lane_key set default 'a',
  alter column lane_key set not null;

create index if not exists appointments_lane_schedule_idx
  on public.appointments (salon_id, appointment_date, lane_key, start_time, end_time)
  where status <> 'cancelled';

drop function if exists public.get_public_schedule(text, date);
create function public.get_public_schedule(
  p_salon_slug text,
  p_appointment_date date
)
returns table (
  record_id text,
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
  with selected_salon as (
    select id from salons where slug = p_salon_slug and is_active = true
  ),
  manual_staff_services as (
    select
      min(o.id::text) as record_id,
      case o.staff_key when 'overflow' then 'b' else 'c' end as lane_key,
      o.service_start_time as covered_start,
      (o.service_start_time + make_interval(mins => s.duration_minutes))::time as covered_end,
      array(
        select (o.service_start_time + make_interval(mins => (slot_number - 1) * 30))::time
        from unnest(s.booked_slots) as slot_number
        order by slot_number
      ) as occupied_slots,
      'manual'::text as record_kind
    from staff_slot_overrides o
    join services s on s.id = o.service_id and s.salon_id = o.salon_id
    join selected_salon salon on salon.id = o.salon_id
    where o.slot_date = p_appointment_date
      and o.service_id is not null
      and o.service_start_time is not null
    group by o.salon_id, o.staff_key, o.service_id, o.service_start_time, s.duration_minutes, s.booked_slots
  )
  select
    a.id::text,
    a.lane_key,
    (a.start_time at time zone coalesce(s.timezone, 'Europe/Berlin'))::time,
    (a.end_time at time zone coalesce(s.timezone, 'Europe/Berlin'))::time,
    a.occupied_slots,
    'appointment'::text
  from appointments a
  join salons s on s.id = a.salon_id
  where s.slug = p_salon_slug
    and s.is_active = true
    and a.appointment_date = p_appointment_date
    and a.status <> 'cancelled'

  union all

  select
    b.id::text,
    'a'::text,
    b.start_time,
    b.end_time,
    coalesce(b.occupied_slots, array[b.start_time]),
    case when b.service_id is null then 'blocked' else 'manual' end
  from blocked_slots b
  join selected_salon salon on salon.id = b.salon_id
  where b.block_date = p_appointment_date

  union all

  select * from manual_staff_services

  union all

  select
    o.id::text,
    case o.staff_key when 'overflow' then 'b' else 'c' end,
    o.start_time,
    (o.start_time + interval '30 minutes')::time,
    array[o.start_time],
    'blocked'::text
  from staff_slot_overrides o
  join selected_salon salon on salon.id = o.salon_id
  where o.slot_date = p_appointment_date
    and o.service_id is null
    and o.is_open = false

  order by 3, 2;
$$;

revoke execute on function public.get_public_schedule(text, date) from public;
grant execute on function public.get_public_schedule(text, date) to anon, authenticated;

-- Manual appointments are intentionally more flexible than public bookings.
-- A manual entry must start during working hours, but may finish after closing.
create or replace function public.assert_blocked_slot_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_time time := '10:00';
  v_close_time time := '19:00';
  v_blocked_day boolean := false;
begin
  select open_time, close_time, is_blocked_day
  into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where salon_id = new.salon_id and setting_date = new.block_date;

  if v_blocked_day then raise exception 'The whole day is already blocked'; end if;
  if time_to_minutes(new.start_time) % 30 <> 0 or time_to_minutes(new.end_time) % 30 <> 0 then
    raise exception 'Blocked slots must use 30 minute increments';
  end if;
  if new.start_time < v_open_time or new.start_time >= v_close_time then
    raise exception 'Blocked slot must start inside working hours';
  end if;
  if exists (
    select 1 from blocked_slots b
    where b.salon_id = new.salon_id and b.block_date = new.block_date
      and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and new.start_time < b.end_time and new.end_time > b.start_time
  ) then
    raise exception 'Manual entry overlaps another entry in lane A';
  end if;
  if exists (
    select 1 from appointments a
    where a.salon_id = new.salon_id and a.appointment_date = new.block_date
      and a.status <> 'cancelled' and a.lane_key = 'a'
      and new.start_time < (a.end_time at time zone 'Europe/Berlin')::time
      and new.end_time > (a.start_time at time zone 'Europe/Berlin')::time
  ) then
    raise exception 'Manual entry overlaps an appointment in lane A';
  end if;
  return new;
end;
$$;

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
  v_customer_id uuid := gen_random_uuid();
  v_appointment_id uuid := gen_random_uuid();
  v_duration integer;
  v_booked_slots smallint[];
  v_occupied_slots time[];
  v_end_time time;
  v_open_time time := '10:00';
  v_close_time time := '19:00';
  v_blocked_day boolean := false;
  v_lane_key text;
begin
  select id into v_salon_id from salons where slug = p_salon_slug and is_active = true;
  if v_salon_id is null then raise exception 'Unknown salon'; end if;

  select duration_minutes, booked_slots into v_duration, v_booked_slots
  from services
  where id = p_service_id and salon_id = v_salon_id and is_active = true;
  if v_duration is null then raise exception 'Unknown or inactive service'; end if;

  select open_time, close_time, is_blocked_day
  into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where salon_id = v_salon_id and setting_date = p_appointment_date;

  if not found then
    v_open_time := '10:00';
    v_close_time := '19:00';
    v_blocked_day := false;
  end if;

  v_end_time := (p_start_time + make_interval(mins => v_duration))::time;
  select array_agg((p_start_time + make_interval(mins => (slot_number - 1) * 30))::time order by slot_number)
  into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

  if p_appointment_date < (now() at time zone 'Europe/Berlin')::date then raise exception 'Cannot book a past date'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 50 or trim(p_name) ~ '^[0-9]+$' then raise exception 'Invalid customer name'; end if;
  if p_gender not in ('male', 'female') then raise exception 'Invalid gender'; end if;
  if length(trim(p_phone)) < 3 or length(trim(p_phone)) > 50 then raise exception 'Invalid phone'; end if;
  if length(trim(p_email)) > 50 or trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;
  if v_blocked_day then raise exception 'This day is not available'; end if;
  if time_to_minutes(p_start_time) % 30 <> 0 then raise exception 'Start time must use 30 minute increments'; end if;
  if v_end_time <= p_start_time or p_start_time < v_open_time or v_end_time > v_close_time then raise exception 'Booking is outside working hours'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text || ':' || p_appointment_date::text, 0));

  -- The employee's hands-on slots are shared globally across all three lanes.
  if exists (
    select 1 from appointments a
    where a.salon_id = v_salon_id and a.appointment_date = p_appointment_date
      and a.status <> 'cancelled' and a.occupied_slots && v_occupied_slots
  ) or exists (
    select 1 from blocked_slots b
    where b.salon_id = v_salon_id and b.block_date = p_appointment_date
      and coalesce(b.occupied_slots, array[b.start_time]) && v_occupied_slots
  ) or exists (
    select 1
    from staff_slot_overrides o
    join services s on s.id = o.service_id and s.salon_id = o.salon_id
    cross join unnest(s.booked_slots) as booked_slot
    where o.salon_id = v_salon_id and o.slot_date = p_appointment_date
      and o.service_id is not null and o.start_time = o.service_start_time
      and (o.service_start_time + make_interval(mins => (booked_slot - 1) * 30))::time = any(v_occupied_slots)
  ) or exists (
    select 1 from staff_slot_overrides o
    where o.salon_id = v_salon_id and o.slot_date = p_appointment_date
      and o.service_id is null and o.is_open = false and o.start_time = any(v_occupied_slots)
  ) then
    raise exception 'Booking overlaps an occupied slot';
  end if;

  -- The complete service duration must fit in one visual process lane.
  select candidate.lane_key into v_lane_key
  from (values ('a', 1), ('b', 2), ('c', 3)) as candidate(lane_key, priority)
  where not exists (
    select 1 from appointments a
    where a.salon_id = v_salon_id and a.appointment_date = p_appointment_date
      and a.status <> 'cancelled' and a.lane_key = candidate.lane_key
      and p_start_time < (a.end_time at time zone 'Europe/Berlin')::time
      and v_end_time > (a.start_time at time zone 'Europe/Berlin')::time
  )
  and not (
    candidate.lane_key = 'a' and exists (
      select 1 from blocked_slots b
      where b.salon_id = v_salon_id and b.block_date = p_appointment_date
        and p_start_time < b.end_time and v_end_time > b.start_time
    )
  )
  and not (
    candidate.lane_key in ('b', 'c') and exists (
      select 1 from staff_slot_overrides o
      where o.salon_id = v_salon_id and o.slot_date = p_appointment_date
        and o.staff_key = case candidate.lane_key when 'b' then 'overflow' else 'flexible' end
        and (o.service_id is not null or o.is_open = false)
        and p_start_time < o.start_time + interval '30 minutes'
        and v_end_time > o.start_time
    )
  )
  order by candidate.priority
  limit 1;

  if v_lane_key is null then raise exception 'No complete service lane is available'; end if;

  if (
    select count(*) from appointments a join customers c on c.id = a.customer_id
    where a.salon_id = v_salon_id and a.created_at > now() - interval '10 minutes'
      and (lower(c.email) = lower(trim(p_email)) or regexp_replace(c.phone, '\s+', '', 'g') = regexp_replace(trim(p_phone), '\s+', '', 'g'))
  ) >= 3 then raise exception 'Too many booking attempts'; end if;

  insert into customers (id, salon_id, name, phone, email, gender)
  values (v_customer_id, v_salon_id, trim(p_name), trim(p_phone), lower(trim(p_email)), p_gender);

  insert into appointments (
    id, salon_id, customer_id, service_id, appointment_date,
    start_time, end_time, occupied_slots, lane_key, status
  ) values (
    v_appointment_id, v_salon_id, v_customer_id, p_service_id, p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone 'Europe/Berlin',
    (p_appointment_date::timestamp + v_end_time) at time zone 'Europe/Berlin',
    v_occupied_slots, v_lane_key, 'confirmed'
  );

  return v_appointment_id;
end;
$$;

grant execute on function public.create_public_booking(text, text, date, time, text, text, text, text)
to anon, authenticated;
