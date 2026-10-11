create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.shop_day_settings (
  setting_date date primary key,
  open_time time not null default '10:00',
  close_time time not null default '19:00',
  is_blocked_day boolean not null default false,
  updated_at timestamptz not null default now(),
  check (close_time > open_time)
);

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text check (cancelled_by in ('customer', 'owner')),
  add column if not exists cancellation_token text;

update public.appointments
set cancellation_token = encode(gen_random_bytes(24), 'hex')
where cancellation_token is null;

alter table public.appointments
  alter column cancellation_token set default encode(gen_random_bytes(24), 'hex'),
  alter column cancellation_token set not null;

create unique index if not exists appointments_cancellation_token_key
on public.appointments (cancellation_token);

create index if not exists blocked_slots_date_idx
on public.blocked_slots (block_date, start_time);

create or replace function public.time_to_minutes(p_time time)
returns integer
language sql
immutable
as $$
  select (extract(hour from p_time)::integer * 60) + extract(minute from p_time)::integer
$$;

create or replace function public.assert_day_settings_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if time_to_minutes(new.open_time) % 30 <> 0 or time_to_minutes(new.close_time) % 30 <> 0 then
    raise exception 'Working hours must use 30 minute increments';
  end if;

  if new.is_blocked_day and exists (
    select 1 from appointments
    where appointment_date = new.setting_date
      and status <> 'cancelled'
  ) then
    raise exception 'Cannot block a day that already has appointments';
  end if;

  if exists (
    select 1 from appointments
    where appointment_date = new.setting_date
      and status <> 'cancelled'
      and (
        (start_time at time zone 'Europe/Berlin')::time < new.open_time
        or (end_time at time zone 'Europe/Berlin')::time > new.close_time
      )
  ) then
    raise exception 'Working hours conflict with existing appointments';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shop_day_settings_validate on public.shop_day_settings;
create trigger shop_day_settings_validate
before insert or update on public.shop_day_settings
for each row execute function public.assert_day_settings_valid();

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
  where setting_date = new.block_date;

  if not found then
    v_open_time := '10:00';
    v_close_time := '19:00';
    v_blocked_day := false;
  end if;

  if v_blocked_day then
    raise exception 'The whole day is already blocked';
  end if;

  if time_to_minutes(new.start_time) % 30 <> 0 or time_to_minutes(new.end_time) % 30 <> 0 then
    raise exception 'Blocked slots must use 30 minute increments';
  end if;

  if new.start_time < v_open_time or new.end_time > v_close_time then
    raise exception 'Blocked slot is outside working hours';
  end if;

  if exists (
    select 1 from blocked_slots
    where block_date = new.block_date
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and new.start_time < end_time
      and new.end_time > start_time
  ) then
    raise exception 'Blocked slot overlaps another blocked slot';
  end if;

  if exists (
    select 1 from appointments
    where appointment_date = new.block_date
      and status <> 'cancelled'
      and new.start_time < (end_time at time zone 'Europe/Berlin')::time
      and new.end_time > (start_time at time zone 'Europe/Berlin')::time
  ) then
    raise exception 'Blocked slot conflicts with existing appointments';
  end if;

  return new;
end;
$$;

drop trigger if exists blocked_slots_validate on public.blocked_slots;
create trigger blocked_slots_validate
before insert or update on public.blocked_slots
for each row execute function public.assert_blocked_slot_valid();

create or replace function public.create_public_booking(
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
  v_customer_id uuid := gen_random_uuid();
  v_appointment_id uuid := gen_random_uuid();
  v_duration integer;
  v_end_time time;
  v_open_time time := '10:00';
  v_close_time time := '19:00';
  v_blocked_day boolean := false;
begin
  select duration_minutes
    into v_duration
  from services
  where id = p_service_id
    and is_active = true;

  if v_duration is null then
    raise exception 'Unknown or inactive service';
  end if;

  select open_time, close_time, is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where setting_date = p_appointment_date;

  if not found then
    v_open_time := '10:00';
    v_close_time := '19:00';
    v_blocked_day := false;
  end if;

  v_end_time := p_start_time + make_interval(mins => v_duration);

  if p_appointment_date < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Cannot book a past date';
  end if;

  if length(trim(p_name)) < 2 or length(trim(p_name)) > 120 or trim(p_name) ~ '^[0-9]+$' then
    raise exception 'Invalid customer name';
  end if;

  if p_gender not in ('male', 'female') then
    raise exception 'Invalid gender';
  end if;

  if length(trim(p_phone)) < 3 or length(trim(p_phone)) > 80 then
    raise exception 'Invalid phone';
  end if;

  if trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;

  if v_blocked_day then
    raise exception 'This day is not available';
  end if;

  if time_to_minutes(p_start_time) % 30 <> 0 then
    raise exception 'Start time must use 30 minute increments';
  end if;

  if v_end_time <= p_start_time or p_start_time < v_open_time or v_end_time > v_close_time then
    raise exception 'Booking is outside working hours';
  end if;

  if exists (
    select 1 from blocked_slots
    where block_date = p_appointment_date
      and p_start_time < end_time
      and v_end_time > start_time
  ) then
    raise exception 'Booking overlaps a blocked slot';
  end if;

  if exists (
    select 1 from appointments
    where appointment_date = p_appointment_date
      and status <> 'cancelled'
      and p_start_time < (end_time at time zone 'Europe/Berlin')::time
      and v_end_time > (start_time at time zone 'Europe/Berlin')::time
  ) then
    raise exception 'Booking overlaps an existing appointment';
  end if;

  insert into customers (id, name, phone, email, gender)
  values (v_customer_id, trim(p_name), trim(p_phone), lower(trim(p_email)), p_gender);

  insert into appointments (
    id,
    customer_id,
    service_id,
    appointment_date,
    start_time,
    end_time,
    status
  )
  values (
    v_appointment_id,
    v_customer_id,
    p_service_id,
    p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone 'Europe/Berlin',
    (p_appointment_date::timestamp + v_end_time) at time zone 'Europe/Berlin',
    'confirmed'
  );

  return v_appointment_id;
end;
$$;

alter table public.shop_day_settings enable row level security;
alter table public.blocked_slots enable row level security;

drop policy if exists "public create customers" on public.customers;
drop policy if exists "public create appointments" on public.appointments;
drop policy if exists "public read day settings" on public.shop_day_settings;
drop policy if exists "owner manage day settings" on public.shop_day_settings;
drop policy if exists "public read blocked slots" on public.blocked_slots;
drop policy if exists "owner manage blocked slots" on public.blocked_slots;

create policy "public read day settings"
on public.shop_day_settings for select
to anon, authenticated
using (true);

create policy "owner manage day settings"
on public.shop_day_settings for all
to authenticated
using (true)
with check (true);

create policy "public read blocked slots"
on public.blocked_slots for select
to anon, authenticated
using (true);

create policy "owner manage blocked slots"
on public.blocked_slots for all
to authenticated
using (true)
with check (true);

grant execute on function public.create_public_booking(text, date, time, text, text, text, text)
to anon, authenticated;
