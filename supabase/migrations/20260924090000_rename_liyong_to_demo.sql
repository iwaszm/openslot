begin;

do $$
declare
  v_salon_id uuid;
  service_row record;
  target record;
  v_new_service_id text;
begin
  select id into v_salon_id
  from public.salons
  where slug = 'liyong';

  if v_salon_id is null then
    select id into v_salon_id
    from public.salons
    where slug = 'demo';

    if v_salon_id is null then
      raise exception 'Neither salon slug liyong nor demo was found';
    end if;
  end if;

  if exists (select 1 from public.salons where slug = 'demo' and id <> v_salon_id) then
    raise exception 'Salon slug demo is already used by another salon';
  end if;

  update public.salons
  set slug = 'demo',
      name = 'OpenSlot Demo Salon',
      address = 'Musterstrasse 1, 10115 Berlin',
      phone = '030 00000000'
  where id = v_salon_id;

  update public.salon_staff
  set name = 'Linda',
      sort_order = 1,
      is_active = true,
      accepts_online_bookings = true,
      updated_at = now()
  where salon_id = v_salon_id
    and staff_key = 'default';

  if not found then
    insert into public.salon_staff (
      salon_id, staff_key, name, sort_order, is_active, accepts_online_bookings
    ) values (
      v_salon_id, 'default', 'Linda', 1, true, true
    );
  end if;

  insert into public.salon_staff (
    salon_id, staff_key, name, sort_order, is_active, accepts_online_bookings
  ) values (
    v_salon_id, 'tony', 'Tony', 2, true, true
  )
  on conflict (salon_id, staff_key) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true,
    accepts_online_bookings = true,
    updated_at = now();

  update public.salon_staff
  set is_active = false,
      accepts_online_bookings = false,
      updated_at = now()
  where salon_id = v_salon_id
    and staff_key not in ('default', 'tony');

  insert into public.staff_lanes (
    salon_id, staff_id, lane_key, label, sort_order, is_active
  )
  select v_salon_id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
  from public.salon_staff staff
  cross join lateral (
    values ('a', 'A', 1), ('b', 'B', 2)
  ) as lane(lane_key, label, sort_order)
  where staff.salon_id = v_salon_id
    and staff.staff_key = 'default'
  on conflict (salon_id, lane_key) do update set
    staff_id = excluded.staff_id,
    label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

  insert into public.staff_lanes (
    salon_id, staff_id, lane_key, label, sort_order, is_active
  )
  select v_salon_id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
  from public.salon_staff staff
  cross join lateral (
    values ('c', 'C', 1), ('d', 'D', 2)
  ) as lane(lane_key, label, sort_order)
  where staff.salon_id = v_salon_id
    and staff.staff_key = 'tony'
  on conflict (salon_id, lane_key) do update set
    staff_id = excluded.staff_id,
    label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

  update public.staff_lanes
  set is_active = false,
      updated_at = now()
  where salon_id = v_salon_id
    and lane_key not in ('a', 'b', 'c', 'd');

  update public.schedule_entries entry
  set staff_id = lane.staff_id,
      updated_at = now()
  from public.staff_lanes lane
  where entry.staff_lane_id = lane.id
    and lane.salon_id = v_salon_id
    and entry.staff_id <> lane.staff_id;

  -- The admin account will be shared with prospects. Preserve appointment
  -- structure for the demo, but remove customer contact data from old records.
  update public.customers
  set name = 'Demo Kunde ' || left(replace(id::text, '-', ''), 6),
      phone = '030 00000000',
      email = 'demo+' || replace(id::text, '-', '') || '@example.invalid'
  where salon_id = v_salon_id;

  update public.email_events event
  set recipient = 'demo+' || replace(event.booking_id::text, '-', '') || '@example.invalid'
  where exists (
    select 1
    from public.appointments appointment
    where appointment.id = event.booking_id
      and appointment.salon_id = v_salon_id
  );

  for service_row in
    select *
    from public.services
    where salon_id = v_salon_id
      and id like 'liyong\_%' escape '\'
    order by id
  loop
    v_new_service_id := 'demo_' || substring(service_row.id from length('liyong_') + 1);

    if not exists (select 1 from public.services where id = v_new_service_id) then
      insert into public.services
      select (jsonb_populate_record(
        null::public.services,
        to_jsonb(service_row) || jsonb_build_object('id', v_new_service_id)
      )).*;
    end if;

    for target in
      select format('%I.%I', namespace.nspname, relation.relname) as relation_name
      from pg_attribute attribute
      join pg_class relation on relation.oid = attribute.attrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'p')
        and attribute.attname = 'service_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      execute format(
        'update %s set service_id = $1 where service_id = $2',
        target.relation_name
      ) using v_new_service_id, service_row.id;
    end loop;

    delete from public.services where id = service_row.id;
  end loop;
end;
$$;

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
    v_appointment_id, v_salon_id, v_customer_id, p_service_id, p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone v_timezone,
    (p_appointment_date::timestamp + v_end_time) at time zone v_timezone,
    v_occupied_slots, v_lane_key, 'confirmed'
  );

  return v_appointment_id;
end;
$$;

revoke all on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text) from public;
grant execute on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text)
  to anon, authenticated, service_role;

commit;
