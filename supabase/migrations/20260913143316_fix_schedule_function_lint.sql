begin;

drop function if exists public.create_public_booking(text, date, time, text, text, text, text);

create or replace function public.create_admin_block(
  p_salon_id uuid,
  p_block_date date,
  p_start_time time,
  p_service_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_id uuid := gen_random_uuid();
  v_duration integer := 30;
  v_booked_slots smallint[] := array[1]::smallint[];
  v_occupied_slots time[];
  v_open_time time := time '10:00';
  v_close_time time := time '19:00';
  v_blocked_day boolean := false;
begin
  if not exists (
    select 1 from salon_members sm
    where sm.user_id = auth.uid()
      and (sm.role = 'super_admin' or sm.salon_id = p_salon_id)
  ) then
    raise exception 'Not authorized for this salon';
  end if;

  if p_service_id is not null then
    select duration_minutes, booked_slots
      into v_duration, v_booked_slots
    from services
    where id = p_service_id
      and salon_id = p_salon_id
      and is_active = true;

    if not found then
      raise exception 'Unknown or inactive service';
    end if;
  end if;

  select array_agg(
    (p_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    order by slot_number
  )
  into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

  select open_time, close_time, is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where salon_id = p_salon_id
    and setting_date = p_block_date;

  if not found then
    v_open_time := time '10:00';
    v_close_time := time '19:00';
    v_blocked_day := false;
  end if;

  if v_blocked_day then
    raise exception 'The whole day is already blocked';
  end if;

  if time_to_minutes(p_start_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_start_time >= v_close_time then
    raise exception 'Service block must start inside working hours';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_salon_id::text || ':' || p_block_date::text, 0)
  );

  insert into blocked_slots (
    id, salon_id, block_date, start_time, end_time, reason,
    service_id, service_start_time, occupied_slots
  )
  values (
    v_block_id,
    p_salon_id,
    p_block_date,
    v_occupied_slots[1],
    v_occupied_slots[cardinality(v_occupied_slots)] + interval '30 minutes',
    '',
    p_service_id,
    p_start_time,
    v_occupied_slots
  );

  return v_block_id;
end;
$$;

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

commit;
