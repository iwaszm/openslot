-- Keep public availability and final booking validation on the same capacity rules.

create or replace function public.get_public_schedule(
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
  select entry.id::text, staff.staff_key, lane.lane_key,
    entry.covered_start, entry.covered_end, entry.occupied_slots, entry.entry_source
  from public.schedule_entries entry
  join public.salons salon on salon.id = entry.salon_id
  join public.salon_staff staff on staff.id = entry.staff_id
  join public.staff_lanes lane on lane.id = entry.staff_lane_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and staff.is_active = true
    and staff.accepts_online_bookings = true
    and lane.is_active = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active'
  union all
  select block.id::text, null::text, null::text,
    block.start_time, block.end_time,
    public.admin_time_block_slots(block.start_time, block.end_time),
    'time_block'::text
  from public.admin_time_blocks block
  join public.salons salon on salon.id = block.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and block.block_date = p_appointment_date;
$$;

revoke all on function public.get_public_schedule(text, date) from public;
grant execute on function public.get_public_schedule(text, date) to anon, authenticated;

create or replace function public.create_public_booking_core(
  p_salon_slug text,
  p_service_id text,
  p_appointment_date date,
  p_start_time time,
  p_gender text,
  p_name text,
  p_phone text,
  p_email text,
  p_staff_key text default null
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
  v_open_time time := '10:00';
  v_close_time time := '18:00';
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
  from public.get_effective_day_settings(p_salon_slug, p_appointment_date) settings;

  if not found then raise exception 'Day settings are unavailable'; end if;

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
  if public.time_to_minutes(p_start_time) % 30 <> 0 then raise exception 'Start time must use 30 minute increments'; end if;
  if v_end_time <= p_start_time or p_start_time < v_open_time or v_end_time > v_close_time then raise exception 'Booking is outside working hours'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_salon_id::text || ':' || p_appointment_date::text, 0)
  );

  if exists (
    select 1
    from public.admin_time_blocks block
    where block.salon_id = v_salon_id
      and block.block_date = p_appointment_date
      and public.time_to_minutes(p_start_time) < public.time_to_minutes(block.end_time)
      and public.time_to_minutes(v_end_time) > public.time_to_minutes(block.start_time)
  ) then
    raise exception 'Booking overlaps a blocked time';
  end if;

  select lane.id, lane.lane_key
    into v_staff_lane_id, v_lane_key
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.salon_id = v_salon_id
    and lane.is_active = true
    and staff.is_active = true
    and staff.accepts_online_bookings = true
    and (p_staff_key is null or staff.staff_key = p_staff_key)
    and not exists (
      select 1
      from public.schedule_entries entry
      where entry.staff_id = staff.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and entry.occupied_slots && v_occupied_slots
    )
    and not exists (
      select 1
      from public.schedule_entries entry
      where entry.staff_lane_id = lane.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and public.time_to_minutes(p_start_time) < public.time_to_minutes(entry.covered_end)
        and public.time_to_minutes(v_end_time) > public.time_to_minutes(entry.covered_start)
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
    v_appointment_id, v_salon_id, v_customer_id, p_service_id, p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone v_timezone,
    (p_appointment_date::timestamp + v_end_time) at time zone v_timezone,
    v_occupied_slots, v_lane_key, 'confirmed'
  );

  return v_appointment_id;
end;
$$;

revoke all on function public.create_public_booking_core(text, text, date, time, text, text, text, text, text) from public;

create or replace function public.create_public_booking_for_staff(
  p_salon_slug text,
  p_service_id text,
  p_appointment_date date,
  p_start_time time,
  p_gender text,
  p_name text,
  p_phone text,
  p_email text,
  p_staff_key text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_public_booking_core(
    p_salon_slug, p_service_id, p_appointment_date, p_start_time,
    p_gender, p_name, p_phone, p_email, p_staff_key
  );
$$;

revoke all on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text) from public;
grant execute on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text)
  to anon, authenticated, service_role;

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
language sql
security definer
set search_path = public
as $$
  select public.create_public_booking_core(
    p_salon_slug, p_service_id, p_appointment_date, p_start_time,
    p_gender, p_name, p_phone, p_email, null
  );
$$;

revoke all on function public.create_public_booking(text, text, date, time, text, text, text, text) from public;
grant execute on function public.create_public_booking(text, text, date, time, text, text, text, text)
  to anon, authenticated;
