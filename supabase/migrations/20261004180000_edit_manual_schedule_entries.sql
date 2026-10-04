-- Allow an authorized manual appointment to move across dates and staff lanes.
-- Replacement remains transactional: a conflict on the new entry restores the old entry.
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
  v_replaced_staff_id uuid;
  v_salon_slug text;
  v_duration integer := 30;
  v_booked_slots smallint[] := array[1]::smallint[];
  v_covered_end time;
  v_occupied_slots time[];
  v_open_time time;
  v_close_time time;
  v_blocked_day boolean;
begin
  select salon.slug into v_salon_slug
  from public.salons salon
  where salon.id = p_salon_id and salon.is_active;
  if v_salon_slug is null or not public.can_view_salon(p_salon_id) then
    raise exception 'Not authorized for this salon';
  end if;

  select lane.staff_id into v_staff_id
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.id = p_staff_lane_id
    and lane.salon_id = p_salon_id
    and lane.is_active
    and staff.is_active;
  if v_staff_id is null or not public.can_edit_staff_lane(p_salon_id, v_staff_id) then
    raise exception 'Unknown or unauthorized staff lane';
  end if;

  if p_service_id is not null then
    select service.duration_minutes, service.booked_slots
      into v_duration, v_booked_slots
    from public.services service
    join public.staff_services capability
      on capability.service_id = service.id
     and capability.staff_id = v_staff_id
     and capability.salon_id = p_salon_id
    where service.id = p_service_id
      and service.salon_id = p_salon_id
      and service.is_active
      and capability.is_active;
    if not found then raise exception 'Service is not enabled for this staff member'; end if;
  end if;

  select settings.open_time, settings.close_time, settings.is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.get_effective_day_settings(v_salon_slug, p_schedule_date) settings;
  if v_blocked_day then raise exception 'The whole day is blocked'; end if;
  if public.time_to_minutes(p_start_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_start_time >= v_close_time then
    raise exception 'Manual entry must start inside working hours';
  end if;

  v_covered_end := (p_start_time + make_interval(mins => v_duration))::time;
  if v_covered_end <= p_start_time then raise exception 'Manual entry must end on the same day'; end if;

  if exists (
    select 1
    from public.admin_time_blocks block
    where block.salon_id = p_salon_id
      and block.block_date = p_schedule_date
      and (block.staff_id is null or block.staff_id = v_staff_id)
      and public.time_to_minutes(p_start_time) < public.time_to_minutes(block.end_time)
      and public.time_to_minutes(v_covered_end) > public.time_to_minutes(block.start_time)
  ) then
    raise exception 'Manual entry overlaps a blocked time';
  end if;

  select array_agg(
    (p_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    order by slot_number
  ) into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

  perform pg_advisory_xact_lock(hashtextextended('admin-entry:' || p_salon_id::text, 0));

  if p_replace_entry_id is not null then
    select entry.staff_id into v_replaced_staff_id
    from public.schedule_entries entry
    where entry.id = p_replace_entry_id
      and entry.salon_id = p_salon_id
      and entry.entry_source = 'manual'
      and entry.status = 'active'
    for update;

    if v_replaced_staff_id is null
      or not public.can_edit_staff_lane(p_salon_id, v_replaced_staff_id) then
      raise exception 'Replacement entry not found or not editable';
    end if;

    update public.schedule_entries
    set status = 'cancelled', updated_at = now()
    where id = p_replace_entry_id;
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

revoke all on function public.create_admin_schedule_entry(uuid, uuid, date, time, text, uuid)
  from public, anon;
grant execute on function public.create_admin_schedule_entry(uuid, uuid, date, time, text, uuid)
  to authenticated;
