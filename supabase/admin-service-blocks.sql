-- Manual admin blocks and service-shaped holds.
-- Run after service-booked-slots.sql.

alter table public.blocked_slots
  add column if not exists service_id text references public.services(id) on delete set null,
  add column if not exists service_start_time time,
  add column if not exists occupied_slots time[];

update public.blocked_slots b
set
  service_start_time = coalesce(b.service_start_time, b.start_time),
  occupied_slots = coalesce(
    b.occupied_slots,
    array(
      select (b.start_time + make_interval(mins => slot_offset * 30))::time
      from generate_series(
        0,
        greatest(0, ceil(extract(epoch from (b.end_time - b.start_time)) / 1800.0)::integer - 1)
      ) as slot_offset
    )
  );

alter table public.blocked_slots
  alter column service_start_time set not null,
  alter column occupied_slots set not null;

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
  v_occupied_start time;
begin
  select open_time, close_time, is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where salon_id = new.salon_id
    and setting_date = new.block_date;

  if not found then
    v_open_time := '10:00';
    v_close_time := '19:00';
    v_blocked_day := false;
  end if;

  if v_blocked_day then
    raise exception 'The whole day is already blocked';
  end if;

  if new.occupied_slots is null or cardinality(new.occupied_slots) = 0 then
    new.occupied_slots := array[new.start_time]::time[];
  end if;

  select array_agg(slot_time order by slot_time)
    into new.occupied_slots
  from (
    select distinct slot_time
    from unnest(new.occupied_slots) as slot_time
  ) normalized_slots;

  foreach v_occupied_start in array new.occupied_slots loop
    if time_to_minutes(v_occupied_start) % 30 <> 0 then
      raise exception 'Blocked slots must use 30 minute increments';
    end if;
    if v_occupied_start < v_open_time or v_occupied_start + interval '30 minutes' > v_close_time then
      raise exception 'Blocked slot is outside working hours';
    end if;
  end loop;

  new.service_start_time := coalesce(new.service_start_time, new.occupied_slots[1]);
  new.start_time := new.occupied_slots[1];
  new.end_time := new.occupied_slots[cardinality(new.occupied_slots)] + interval '30 minutes';

  if exists (
    select 1 from blocked_slots b
    where b.salon_id = new.salon_id
      and b.block_date = new.block_date
      and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and b.occupied_slots && new.occupied_slots
  ) then
    raise exception 'Blocked slot overlaps another blocked slot';
  end if;

  if exists (
    select 1 from appointments a
    where a.salon_id = new.salon_id
      and a.appointment_date = new.block_date
      and a.status <> 'cancelled'
      and a.occupied_slots && new.occupied_slots
  ) then
    raise exception 'Blocked slot overlaps an appointment';
  end if;

  return new;
end;
$$;

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
  v_open_time time := '10:00';
  v_close_time time := '19:00';
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
    v_open_time := '10:00';
    v_close_time := '19:00';
    v_blocked_day := false;
  end if;

  if v_blocked_day then
    raise exception 'The whole day is already blocked';
  end if;

  if time_to_minutes(p_start_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_start_time + make_interval(mins => v_duration) > v_close_time then
    raise exception 'Service block is outside working hours';
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

revoke all on function public.create_admin_block(uuid, date, time, text) from public;
grant execute on function public.create_admin_block(uuid, date, time, text) to authenticated;

-- Keep public bookings compatible with sparse service-shaped admin blocks.
create or replace function public.blocked_slots_overlap(
  p_salon_id uuid,
  p_block_date date,
  p_occupied_slots time[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from blocked_slots b
    where b.salon_id = p_salon_id
      and b.block_date = p_block_date
      and b.occupied_slots && p_occupied_slots
  );
$$;

revoke all on function public.blocked_slots_overlap(uuid, date, time[]) from public;

do $$
declare
  v_function regprocedure := 'public.create_public_booking(text,text,date,time,text,text,text,text)'::regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(v_function) into v_definition;
  v_updated_definition := regexp_replace(
    v_definition,
    'if exists \(\s*select 1\s*from blocked_slots b\s*cross join unnest\(v_occupied_slots\) as occupied_start\s*where b\.salon_id = v_salon_id\s*and b\.block_date = p_appointment_date\s*and occupied_start < b\.end_time\s*and occupied_start \+ interval ''30 minutes'' > b\.start_time\s*\) then',
    'if public.blocked_slots_overlap(v_salon_id, p_appointment_date, v_occupied_slots) then',
    'n'
  );

  if v_updated_definition = v_definition then
    raise exception 'Could not update create_public_booking blocked-slot check';
  end if;

  execute v_updated_definition;
end;
$$;
