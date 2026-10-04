begin;

alter table public.admin_time_blocks
  add column if not exists staff_id uuid;

alter table public.admin_time_blocks
  drop constraint if exists admin_time_blocks_staff_salon_fkey,
  add constraint admin_time_blocks_staff_salon_fkey
    foreign key (staff_id, salon_id)
    references public.salon_staff(id, salon_id) on delete restrict;

alter table public.admin_time_blocks
  drop constraint if exists admin_time_blocks_no_overlap,
  drop constraint if exists admin_time_blocks_global_no_overlap,
  drop constraint if exists admin_time_blocks_staff_no_overlap;

alter table public.admin_time_blocks
  add constraint admin_time_blocks_global_no_overlap
  exclude using gist (
    salon_id with =,
    block_date with =,
    block_range with &&
  ) where (staff_id is null),
  add constraint admin_time_blocks_staff_no_overlap
  exclude using gist (
    staff_id with =,
    block_date with =,
    block_range with &&
  ) where (staff_id is not null);

create index if not exists admin_time_blocks_staff_day_idx
  on public.admin_time_blocks (staff_id, block_date, start_time)
  where staff_id is not null;

drop policy if exists "Salon members can read time blocks" on public.admin_time_blocks;
drop policy if exists "Salon members can manage time blocks" on public.admin_time_blocks;
drop policy if exists "Salon roles read time blocks" on public.admin_time_blocks;
drop policy if exists "Salon roles manage permitted time blocks" on public.admin_time_blocks;

create policy "Salon roles read time blocks"
  on public.admin_time_blocks for select to authenticated
  using (public.can_view_salon(salon_id));

create policy "Salon roles manage permitted time blocks"
  on public.admin_time_blocks for all to authenticated
  using (
    case when staff_id is null
      then public.can_manage_salon(salon_id)
      else public.can_edit_staff_lane(salon_id, staff_id)
    end
  )
  with check (
    case when staff_id is null
      then public.can_manage_salon(salon_id)
      else public.can_edit_staff_lane(salon_id, staff_id)
    end
  );

create or replace function public.assert_entry_outside_admin_time_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.entry_source in ('online', 'manual') then
    perform pg_advisory_xact_lock(
      hashtextextended(new.salon_id::text || ':' || new.schedule_date::text, 0)
    );

    if exists (
      select 1
      from public.admin_time_blocks block
      where block.salon_id = new.salon_id
        and block.block_date = new.schedule_date
        and (block.staff_id is null or block.staff_id = new.staff_id)
        and public.admin_time_block_slots(block.start_time, block.end_time) && new.occupied_slots
    ) then
      raise exception 'TIME_RANGE_BLOCKED';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.assert_appointment_outside_admin_time_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cancelled' then
    perform pg_advisory_xact_lock(
      hashtextextended(new.salon_id::text || ':' || new.appointment_date::text, 0)
    );

    if exists (
      select 1
      from public.admin_time_blocks block
      where block.salon_id = new.salon_id
        and block.block_date = new.appointment_date
        and (
          block.staff_id is null
          or exists (
            select 1
            from public.staff_lanes lane
            where lane.salon_id = new.salon_id
              and lane.lane_key = new.lane_key
              and lane.staff_id = block.staff_id
          )
        )
        and public.admin_time_block_slots(block.start_time, block.end_time) && new.occupied_slots
    ) then
      raise exception 'TIME_RANGE_BLOCKED';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.create_admin_time_block(uuid, date, time, time);
create function public.create_admin_time_block(
  p_salon_id uuid,
  p_block_date date,
  p_start_time time,
  p_end_time time,
  p_staff_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_id uuid := gen_random_uuid();
  v_salon_slug text;
  v_open_time time;
  v_close_time time;
  v_blocked_day boolean;
  v_slots time[];
begin
  select salon.slug into v_salon_slug
  from public.salons salon
  where salon.id = p_salon_id and salon.is_active;

  if v_salon_slug is null then raise exception 'SALON_NOT_FOUND'; end if;
  if p_staff_id is null then
    if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  elsif not public.can_edit_staff_lane(p_salon_id, p_staff_id) then
    raise exception 'NOT_AUTHORIZED';
  elsif not exists (
    select 1 from public.salon_staff staff
    where staff.id = p_staff_id and staff.salon_id = p_salon_id and staff.is_active
  ) then
    raise exception 'STAFF_NOT_FOUND';
  end if;

  select settings.open_time, settings.close_time, settings.is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.get_effective_day_settings(v_salon_slug, p_block_date) settings;

  if not found then raise exception 'DAY_SETTINGS_UNAVAILABLE'; end if;
  if v_blocked_day then raise exception 'DAY_ALREADY_BLOCKED'; end if;
  if p_end_time <= p_start_time
    or public.time_to_minutes(p_start_time) % 30 <> 0
    or public.time_to_minutes(p_end_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_end_time > v_close_time then
    raise exception 'INVALID_BLOCK_RANGE';
  end if;

  v_slots := public.admin_time_block_slots(p_start_time, p_end_time);
  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text || ':' || p_block_date::text, 0));

  if exists (
    select 1
    from public.schedule_entries entry
    where entry.salon_id = p_salon_id
      and entry.schedule_date = p_block_date
      and entry.status = 'active'
      and entry.entry_source in ('online', 'manual')
      and (p_staff_id is null or entry.staff_id = p_staff_id)
      and entry.occupied_slots && v_slots
  ) then
    raise exception 'OCCUPIED_SLOTS_PRESENT';
  end if;

  if exists (
    select 1
    from public.admin_time_blocks block
    where block.salon_id = p_salon_id
      and block.block_date = p_block_date
      and (p_staff_id is null or block.staff_id is null or block.staff_id = p_staff_id)
      and block.block_range && int4range(
        public.time_to_minutes(p_start_time),
        public.time_to_minutes(p_end_time),
        '[)'
      )
  ) then
    raise exception 'TIME_BLOCK_OVERLAP';
  end if;

  insert into public.admin_time_blocks (
    id, salon_id, staff_id, block_date, start_time, end_time, created_by
  ) values (
    v_block_id, p_salon_id, p_staff_id, p_block_date, p_start_time, p_end_time, auth.uid()
  );

  return v_block_id;
end;
$$;

revoke all on function public.create_admin_time_block(uuid, date, time, time, uuid) from public;
grant execute on function public.create_admin_time_block(uuid, date, time, time, uuid) to authenticated;

create or replace function public.delete_admin_time_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block public.admin_time_blocks;
begin
  select block.* into v_block
  from public.admin_time_blocks block
  where block.id = p_block_id;

  if not found then raise exception 'TIME_BLOCK_NOT_FOUND'; end if;
  if v_block.staff_id is null then
    if not public.can_manage_salon(v_block.salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  elsif not public.can_edit_staff_lane(v_block.salon_id, v_block.staff_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.admin_time_blocks where id = p_block_id;
end;
$$;

revoke all on function public.delete_admin_time_block(uuid) from public;
grant execute on function public.delete_admin_time_block(uuid) to authenticated;

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
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and lane.is_active
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
    and salon.is_active
    and block.block_date = p_appointment_date
    and block.staff_id is null
  union all
  select block.id::text || ':' || lane.id::text, staff.staff_key, lane.lane_key,
    block.start_time, block.end_time,
    public.admin_time_block_slots(block.start_time, block.end_time),
    'staff_time_block'::text
  from public.admin_time_blocks block
  join public.salons salon on salon.id = block.salon_id
  join public.salon_staff staff on staff.id = block.staff_id
  join public.staff_lanes lane on lane.staff_id = staff.id and lane.salon_id = staff.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and lane.is_active
    and block.block_date = p_appointment_date;
$$;

revoke all on function public.get_public_schedule(text, date) from public;
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
  join public.salon_staff staff on staff.id = entry.staff_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active'
  union all
  select public.admin_time_block_slots(block.start_time, block.end_time)
  from public.admin_time_blocks block
  join public.salons salon on salon.id = block.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and block.block_date = p_appointment_date
    and block.staff_id is null;
$$;

revoke all on function public.get_public_occupied_slots(text, date) from public;
grant execute on function public.get_public_occupied_slots(text, date) to anon, authenticated;

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
  v_open_time time;
  v_close_time time;
  v_blocked_day boolean;
  v_staff_lane_id uuid;
  v_lane_key text;
begin
  select salon.id, coalesce(salon.timezone, 'Europe/Berlin')
    into v_salon_id, v_timezone
  from public.salons salon
  where salon.slug = p_salon_slug and salon.is_active;
  if v_salon_id is null then raise exception 'Unknown salon'; end if;

  select service.duration_minutes, service.booked_slots
    into v_duration, v_booked_slots
  from public.services service
  where service.id = p_service_id and service.salon_id = v_salon_id and service.is_active;
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

  perform pg_advisory_xact_lock(hashtextextended(v_salon_id::text || ':' || p_appointment_date::text, 0));

  if exists (
    select 1 from public.admin_time_blocks block
    where block.salon_id = v_salon_id
      and block.block_date = p_appointment_date
      and block.staff_id is null
      and public.time_to_minutes(p_start_time) < public.time_to_minutes(block.end_time)
      and public.time_to_minutes(v_end_time) > public.time_to_minutes(block.start_time)
  ) then raise exception 'Booking overlaps a blocked time'; end if;

  select lane.id, lane.lane_key
    into v_staff_lane_id, v_lane_key
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  join public.staff_services capability
    on capability.staff_id = staff.id
   and capability.service_id = p_service_id
   and capability.salon_id = v_salon_id
  where lane.salon_id = v_salon_id
    and lane.is_active and staff.is_active and staff.accepts_online_bookings
    and capability.is_active and capability.accepts_online_bookings
    and (p_staff_key is null or staff.staff_key = p_staff_key)
    and not exists (
      select 1 from public.admin_time_blocks block
      where block.salon_id = v_salon_id
        and block.block_date = p_appointment_date
        and block.staff_id = staff.id
        and public.time_to_minutes(p_start_time) < public.time_to_minutes(block.end_time)
        and public.time_to_minutes(v_end_time) > public.time_to_minutes(block.start_time)
    )
    and not exists (
      select 1 from public.schedule_entries entry
      where entry.staff_id = staff.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and entry.occupied_slots && v_occupied_slots
    )
    and not exists (
      select 1 from public.schedule_entries entry
      where entry.staff_lane_id = lane.id
        and entry.schedule_date = p_appointment_date
        and entry.status = 'active'
        and public.time_to_minutes(p_start_time) < public.time_to_minutes(entry.covered_end)
        and public.time_to_minutes(v_end_time) > public.time_to_minutes(entry.covered_start)
    )
  order by staff.sort_order, lane.sort_order
  limit 1;
  if v_staff_lane_id is null then raise exception 'No qualified staff lane is available for this service'; end if;

  if (
    select count(*) from public.appointments appointment
    join public.customers customer on customer.id = appointment.customer_id
    where appointment.salon_id = v_salon_id
      and appointment.created_at > now() - interval '10 minutes'
      and (lower(customer.email) = lower(trim(p_email))
        or regexp_replace(customer.phone, '\s+', '', 'g') = regexp_replace(trim(p_phone), '\s+', '', 'g'))
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

revoke all on function public.create_public_booking_core(text, text, date, time, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.get_admin_day_snapshot(
  p_salon_slug text,
  p_schedule_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon_id uuid;
  v_day_settings jsonb;
begin
  select salon.id into v_salon_id
  from public.salons salon
  where salon.slug = p_salon_slug and salon.is_active;

  if v_salon_id is null then raise exception 'SALON_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_view_salon(v_salon_id) then raise exception 'SALON_ACCESS_DENIED' using errcode = '42501'; end if;

  select to_jsonb(settings) into v_day_settings
  from public.get_effective_day_settings(p_salon_slug, p_schedule_date) settings;

  return jsonb_build_object(
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', appointment.id,
        'service_id', appointment.service_id,
        'service_snapshot', appointment.service_snapshot,
        'appointment_date', appointment.appointment_date,
        'start_time', appointment.start_time,
        'end_time', appointment.end_time,
        'occupied_slots', appointment.occupied_slots,
        'lane_key', appointment.lane_key,
        'status', appointment.status,
        'customers', jsonb_build_object(
          'name', customer.name, 'phone', customer.phone,
          'email', customer.email, 'gender', customer.gender
        )
      ) order by appointment.start_time, appointment.id)
      from public.appointments appointment
      left join public.customers customer
        on customer.id = appointment.customer_id and customer.salon_id = appointment.salon_id
      where appointment.salon_id = v_salon_id and appointment.appointment_date = p_schedule_date
    ), '[]'::jsonb),
    'manual_schedule_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'staff_id', entry.staff_id,
        'staff_lane_id', entry.staff_lane_id,
        'service_id', entry.service_id,
        'service_snapshot', entry.service_snapshot,
        'entry_source', entry.entry_source,
        'schedule_date', entry.schedule_date,
        'covered_start', entry.covered_start,
        'covered_end', entry.covered_end,
        'occupied_slots', entry.occupied_slots,
        'note', entry.note,
        'staff_lanes', jsonb_build_object('lane_key', lane.lane_key)
      ) order by entry.covered_start, entry.id)
      from public.schedule_entries entry
      join public.staff_lanes lane on lane.id = entry.staff_lane_id
      where entry.salon_id = v_salon_id
        and entry.schedule_date = p_schedule_date
        and entry.status = 'active'
        and entry.entry_source <> 'online'
    ), '[]'::jsonb),
    'day_settings', coalesce(v_day_settings, '{}'::jsonb),
    'time_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', block.id,
        'staff_id', block.staff_id,
        'block_date', block.block_date,
        'start_time', block.start_time,
        'end_time', block.end_time
      ) order by block.start_time, block.id)
      from public.admin_time_blocks block
      where block.salon_id = v_salon_id and block.block_date = p_schedule_date
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_day_snapshot(text, date) from public;
grant execute on function public.get_admin_day_snapshot(text, date) to authenticated;

comment on column public.admin_time_blocks.staff_id is
  'Null blocks the entire salon; a staff ID blocks only that employee.';

commit;

notify pgrst, 'reload schema';
