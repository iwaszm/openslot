begin;

-- Public users only need active services. Owners can read all services in their salon.
drop policy if exists "public read services" on public.services;
drop policy if exists "Owners read salon services" on public.services;
create policy "public read active services"
  on public.services for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.salons salon
      where salon.id = services.salon_id and salon.is_active = true
    )
  );
create policy "Owners read salon services"
  on public.services for select to authenticated
  using (public.can_manage_salon(salon_id));

drop policy if exists "members delete own salon services" on public.services;
drop policy if exists "Owners delete salon services" on public.services;

-- Remove legacy direct access to booking and customer records. Public pages use
-- derived RPCs; authenticated calendar users stay scoped by salon membership.
drop policy if exists "public read appointments" on public.appointments;
drop policy if exists "members read own salon appointments" on public.appointments;
drop policy if exists "Salon roles read salon appointments" on public.appointments;
create policy "Salon roles read salon appointments"
  on public.appointments for select to authenticated
  using (public.can_view_salon(salon_id));
drop policy if exists "public create appointments" on public.appointments;
drop policy if exists "public create customers" on public.customers;
drop policy if exists "owner read customers" on public.customers;
drop policy if exists "members read own salon customers" on public.customers;
drop policy if exists "Salon roles read salon customers" on public.customers;
create policy "Salon roles read salon customers"
  on public.customers for select to authenticated
  using (public.can_view_salon(salon_id));

-- Browser clients must use the Turnstile-protected Edge Function.
revoke all on function public.create_public_booking(text, text, date, time, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking_for_staff(text, text, date, time, text, text, text, text, text) to service_role;

-- Repair denormalized lane ownership before adding cross-salon constraints.
update public.staff_lanes lane
set salon_id = staff.salon_id, updated_at = now()
from public.salon_staff staff
where staff.id = lane.staff_id and lane.salon_id <> staff.salon_id;

update public.schedule_entries entry
set salon_id = lane.salon_id, staff_id = lane.staff_id, updated_at = now()
from public.staff_lanes lane
where lane.id = entry.staff_lane_id
  and (entry.salon_id <> lane.salon_id or entry.staff_id <> lane.staff_id);

do $$
begin
  if exists (
    select 1 from public.appointments appointment
    join public.customers customer on customer.id = appointment.customer_id
    where customer.salon_id <> appointment.salon_id
  ) then raise exception 'Cross-salon appointment/customer rows must be repaired first'; end if;
  if exists (
    select 1 from public.appointments appointment
    join public.services service on service.id = appointment.service_id
    where service.salon_id <> appointment.salon_id
  ) then raise exception 'Cross-salon appointment/service rows must be repaired first'; end if;
  if exists (
    select 1 from public.schedule_entries entry
    join public.services service on service.id = entry.service_id
    where entry.service_id is not null and service.salon_id <> entry.salon_id
  ) then raise exception 'Cross-salon schedule/service rows must be repaired first'; end if;
end;
$$;

alter table public.salon_staff
  drop constraint if exists salon_staff_id_salon_key,
  add constraint salon_staff_id_salon_key unique (id, salon_id);
alter table public.staff_lanes
  drop constraint if exists staff_lanes_id_salon_staff_key,
  add constraint staff_lanes_id_salon_staff_key unique (id, salon_id, staff_id),
  drop constraint if exists staff_lanes_staff_salon_fkey,
  add constraint staff_lanes_staff_salon_fkey
    foreign key (staff_id, salon_id) references public.salon_staff(id, salon_id) on delete cascade;
alter table public.services
  drop constraint if exists services_id_salon_key,
  add constraint services_id_salon_key unique (id, salon_id);
alter table public.customers
  drop constraint if exists customers_id_salon_key,
  add constraint customers_id_salon_key unique (id, salon_id);
alter table public.appointments
  drop constraint if exists appointments_customer_salon_fkey,
  add constraint appointments_customer_salon_fkey
    foreign key (customer_id, salon_id) references public.customers(id, salon_id) on delete restrict,
  drop constraint if exists appointments_service_salon_fkey,
  add constraint appointments_service_salon_fkey
    foreign key (service_id, salon_id) references public.services(id, salon_id) on delete restrict;
alter table public.schedule_entries
  drop constraint if exists schedule_entries_lane_salon_staff_fkey,
  add constraint schedule_entries_lane_salon_staff_fkey
    foreign key (staff_lane_id, salon_id, staff_id)
    references public.staff_lanes(id, salon_id, staff_id) on delete restrict,
  drop constraint if exists schedule_entries_service_salon_fkey,
  add constraint schedule_entries_service_salon_fkey
    foreign key (service_id, salon_id) references public.services(id, salon_id) on delete restrict;

create index if not exists schedule_entries_active_staff_day_idx
  on public.schedule_entries (staff_id, schedule_date)
  where status = 'active';
create index if not exists schedule_entries_active_lane_day_idx
  on public.schedule_entries (staff_lane_id, schedule_date, covered_start, covered_end)
  where status = 'active';

create table if not exists public.salon_weekly_hours (
  salon_id uuid not null references public.salons(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  open_time time not null,
  close_time time not null,
  is_closed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (salon_id, weekday),
  check (close_time > open_time),
  check (public.time_to_minutes(open_time) % 30 = 0),
  check (public.time_to_minutes(close_time) % 30 = 0)
);

alter table public.salon_weekly_hours enable row level security;
grant select on table public.salon_weekly_hours to anon, authenticated;
grant insert, update, delete on table public.salon_weekly_hours to authenticated;
create policy "Public read weekly hours"
  on public.salon_weekly_hours for select to anon, authenticated
  using (exists (
    select 1 from public.salons salon
    where salon.id = salon_weekly_hours.salon_id and salon.is_active = true
  ));
create policy "Owners manage weekly hours"
  on public.salon_weekly_hours for all to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

insert into public.salon_weekly_hours (salon_id, weekday, open_time, close_time, is_closed)
select
  salon.id,
  day.weekday,
  case when lower(day.hours) in ('closed', 'geschlossen', '休息')
    then time '10:00' else split_part(day.hours, '-', 1)::time end,
  case when lower(day.hours) in ('closed', 'geschlossen', '休息')
    then time '18:00' else split_part(day.hours, '-', 2)::time end,
  lower(day.hours) in ('closed', 'geschlossen', '休息')
from public.salons salon
cross join lateral (
  values
    (1::smallint, coalesce(nullif(salon.opening_hours->>'monday', ''), '10:00-18:00')),
    (2::smallint, coalesce(nullif(salon.opening_hours->>'tuesday', ''), '10:00-18:00')),
    (3::smallint, coalesce(nullif(salon.opening_hours->>'wednesday', ''), '10:00-18:00')),
    (4::smallint, coalesce(nullif(salon.opening_hours->>'thursday', ''), '10:00-18:00')),
    (5::smallint, coalesce(nullif(salon.opening_hours->>'friday', ''), '10:00-18:00')),
    (6::smallint, coalesce(nullif(salon.opening_hours->>'saturday', ''), '10:00-17:00')),
    (7::smallint, coalesce(nullif(salon.opening_hours->>'sunday', ''), 'closed'))
) day(weekday, hours)
on conflict (salon_id, weekday) do nothing;

create or replace function public.sync_salon_opening_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_id uuid;
begin
  v_salon_id := case when tg_op = 'DELETE' then old.salon_id else new.salon_id end;
  update public.salons salon
  set opening_hours = coalesce((
    select jsonb_object_agg(
      case hours.weekday
        when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
        when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday' else 'sunday'
      end,
      case when hours.is_closed then 'closed'
        else to_char(hours.open_time, 'HH24:MI') || '-' || to_char(hours.close_time, 'HH24:MI') end
      order by hours.weekday
    )
    from public.salon_weekly_hours hours where hours.salon_id = v_salon_id
  ), '{}'::jsonb)
  where salon.id = v_salon_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.sync_salon_opening_hours() from public, anon, authenticated;

drop trigger if exists salon_weekly_hours_sync on public.salon_weekly_hours;
create trigger salon_weekly_hours_sync
after insert or update or delete on public.salon_weekly_hours
for each row execute function public.sync_salon_opening_hours();

update public.salons salon
set opening_hours = (
  select jsonb_object_agg(
    case hours.weekday
      when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
      when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday' else 'sunday'
    end,
    case when hours.is_closed then 'closed'
      else to_char(hours.open_time, 'HH24:MI') || '-' || to_char(hours.close_time, 'HH24:MI') end
    order by hours.weekday
  ) from public.salon_weekly_hours hours where hours.salon_id = salon.id
);

create table if not exists public.staff_services (
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null,
  service_id text not null,
  is_active boolean not null default true,
  accepts_online_bookings boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, service_id),
  foreign key (staff_id, salon_id) references public.salon_staff(id, salon_id) on delete cascade,
  foreign key (service_id, salon_id) references public.services(id, salon_id) on delete cascade
);

create index if not exists staff_services_salon_service_idx
  on public.staff_services (salon_id, service_id, staff_id)
  where is_active;
alter table public.staff_services enable row level security;
grant select, insert, update, delete on table public.staff_services to authenticated;
create policy "Owners read staff services"
  on public.staff_services for select to authenticated
  using (public.can_manage_salon(salon_id));
create policy "Owners manage staff services"
  on public.staff_services for all to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

insert into public.staff_services (salon_id, staff_id, service_id, is_active, accepts_online_bookings)
select staff.salon_id, staff.id, service.id, true, true
from public.salon_staff staff
join public.services service on service.salon_id = staff.salon_id
on conflict (staff_id, service_id) do nothing;

create or replace function public.get_public_staff_services(p_salon_slug text)
returns table (staff_key text, service_id text)
language sql
stable
security definer
set search_path = public
as $$
  select staff.staff_key, capability.service_id
  from public.staff_services capability
  join public.salon_staff staff on staff.id = capability.staff_id
  join public.services service on service.id = capability.service_id
  join public.salons salon on salon.id = capability.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and service.is_active
    and capability.is_active
    and capability.accepts_online_bookings;
$$;
revoke all on function public.get_public_staff_services(text) from public;
grant execute on function public.get_public_staff_services(text) to anon, authenticated;

create or replace function public.get_effective_day_settings(
  p_salon_slug text,
  p_setting_date date
)
returns table (
  setting_date date,
  open_time time,
  close_time time,
  is_blocked_day boolean,
  is_public_holiday boolean,
  holiday_name text,
  has_manual_override boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p_setting_date,
    coalesce(settings.open_time, weekly.open_time, '10:00'::time),
    coalesce(settings.close_time, weekly.close_time, case
      when extract(isodow from p_setting_date) = 6 then '17:00'::time else '18:00'::time end),
    case
      when settings.salon_id is not null then settings.is_blocked_day
      when coalesce(weekly.is_closed, extract(isodow from p_setting_date) = 7) then true
      when salon.block_public_holidays and holiday.holiday_date is not null then true
      else false
    end,
    holiday.holiday_date is not null,
    holiday.name,
    settings.salon_id is not null
  from public.salons salon
  left join public.salon_weekly_hours weekly
    on weekly.salon_id = salon.id and weekly.weekday = extract(isodow from p_setting_date)::integer
  left join public.shop_day_settings settings
    on settings.salon_id = salon.id and settings.setting_date = p_setting_date
  left join public.public_holidays holiday
    on holiday.region = salon.holiday_region and holiday.holiday_date = p_setting_date
  where salon.slug = p_salon_slug and salon.is_active;
$$;
revoke all on function public.get_effective_day_settings(text, date) from public;
grant execute on function public.get_effective_day_settings(text, date) to anon, authenticated;

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
    where block.salon_id = v_salon_id and block.block_date = p_appointment_date
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
  from public.salons salon where salon.id = p_salon_id and salon.is_active;
  if v_salon_slug is null or not public.can_view_salon(p_salon_id) then raise exception 'Not authorized for this salon'; end if;

  select lane.staff_id into v_staff_id
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where lane.id = p_staff_lane_id and lane.salon_id = p_salon_id and lane.is_active and staff.is_active;
  if v_staff_id is null or not public.can_edit_staff_lane(p_salon_id, v_staff_id) then raise exception 'Unknown or unauthorized staff lane'; end if;

  if p_service_id is not null then
    select service.duration_minutes, service.booked_slots into v_duration, v_booked_slots
    from public.services service
    join public.staff_services capability
      on capability.service_id = service.id and capability.staff_id = v_staff_id
    where service.id = p_service_id and service.salon_id = p_salon_id and service.is_active
      and capability.is_active;
    if not found then raise exception 'Service is not enabled for this staff member'; end if;
  end if;

  select settings.open_time, settings.close_time, settings.is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.get_effective_day_settings(v_salon_slug, p_schedule_date) settings;
  if v_blocked_day then raise exception 'The whole day is blocked'; end if;
  if public.time_to_minutes(p_start_time) % 30 <> 0 or p_start_time < v_open_time or p_start_time >= v_close_time
    then raise exception 'Manual entry must start inside working hours'; end if;

  v_covered_end := (p_start_time + make_interval(mins => v_duration))::time;
  if v_covered_end <= p_start_time then raise exception 'Manual entry must end on the same day'; end if;
  select array_agg((p_start_time + make_interval(mins => (slot_number - 1) * 30))::time order by slot_number)
    into v_occupied_slots from unnest(v_booked_slots) as slot_number;

  perform pg_advisory_xact_lock(hashtextextended(p_staff_lane_id::text || ':' || p_schedule_date::text, 0));
  if p_replace_entry_id is not null then
    update public.schedule_entries entry set status = 'cancelled', updated_at = now()
    where entry.id = p_replace_entry_id and entry.salon_id = p_salon_id
      and entry.staff_lane_id = p_staff_lane_id and entry.entry_source <> 'online' and entry.status = 'active';
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

create or replace function public.cleanup_openslot_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date_cutoff date := (now() at time zone 'Europe/Berlin')::date - 30;
  v_timestamp_cutoff timestamptz := now() - interval '30 days';
  v_customers_merged integer := 0;
  v_email_events_deleted integer := 0;
  v_appointments_deleted integer := 0;
  v_schedule_entries_deleted integer := 0;
  v_admin_time_blocks_deleted integer := 0;
  v_shop_day_settings_deleted integer := 0;
  v_orphan_customers_deleted integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('openslot-history-cleanup', 0));
  with ranked as (
    select customer.id,
      first_value(customer.id) over (partition by customer.salon_id, lower(btrim(customer.email)) order by customer.created_at desc, customer.id desc) canonical_id,
      row_number() over (partition by customer.salon_id, lower(btrim(customer.email)) order by customer.created_at desc, customer.id desc) duplicate_rank
    from public.customers customer where nullif(lower(btrim(customer.email)), '') is not null
  )
  update public.appointments appointment set customer_id = ranked.canonical_id
  from ranked where ranked.duplicate_rank > 1 and appointment.customer_id = ranked.id;

  with ranked as (
    select customer.id,
      row_number() over (partition by customer.salon_id, lower(btrim(customer.email)) order by customer.created_at desc, customer.id desc) duplicate_rank
    from public.customers customer where nullif(lower(btrim(customer.email)), '') is not null
  )
  delete from public.customers customer using ranked
  where ranked.duplicate_rank > 1 and customer.id = ranked.id;
  get diagnostics v_customers_merged = row_count;

  delete from public.email_events event where event.created_at < v_timestamp_cutoff;
  get diagnostics v_email_events_deleted = row_count;
  delete from public.appointments appointment where appointment.appointment_date < v_date_cutoff;
  get diagnostics v_appointments_deleted = row_count;
  delete from public.schedule_entries entry where entry.schedule_date < v_date_cutoff;
  get diagnostics v_schedule_entries_deleted = row_count;
  delete from public.admin_time_blocks block where block.block_date < v_date_cutoff;
  get diagnostics v_admin_time_blocks_deleted = row_count;
  delete from public.shop_day_settings setting where setting.setting_date < v_date_cutoff;
  get diagnostics v_shop_day_settings_deleted = row_count;
  delete from public.customers customer where not exists (
    select 1 from public.appointments appointment where appointment.customer_id = customer.id
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
    'orphan_customers_deleted', v_orphan_customers_deleted
  );
end;
$$;
revoke all on function public.cleanup_openslot_history() from public, anon, authenticated;

drop table if exists public.staff_slot_overrides cascade;
drop table if exists public.blocked_slots cascade;

commit;
