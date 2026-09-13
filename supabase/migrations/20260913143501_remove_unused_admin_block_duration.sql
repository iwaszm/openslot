begin;

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
    select booked_slots
      into v_booked_slots
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

commit;
