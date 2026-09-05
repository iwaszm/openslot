-- OpenSlot Supabase setup
-- Run this file in Supabase SQL Editor for a fresh project or to repair an existing MVP database.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.services (
  id text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10, 2) not null default 0,
  is_active boolean not null default true
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  gender text not null check (gender in ('male', 'female')),
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id text not null references public.services(id) on delete restrict,
  appointment_date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  cancellation_token text not null default encode(gen_random_bytes(24), 'hex'),
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'owner')),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

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

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null check (event_type in ('booking_created_customer', 'booking_created_owner', 'booking_cancelled_customer', 'booking_cancelled_owner')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  resend_email_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (booking_id, event_type, recipient)
);

alter table public.email_events
  drop constraint if exists email_events_event_type_check;

alter table public.email_events
  add constraint email_events_event_type_check
  check (event_type in ('booking_created_customer', 'booking_created_owner', 'booking_cancelled_customer', 'booking_cancelled_owner'));

alter table public.services
  add column if not exists is_active boolean not null default true;

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

alter table public.appointments
  drop constraint if exists prevent_double_booking;

alter table public.appointments
  add constraint prevent_double_booking
  exclude using gist (
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status <> 'cancelled');

create index if not exists appointments_date_idx
on public.appointments (appointment_date, start_time);

create index if not exists blocked_slots_date_idx
on public.blocked_slots (block_date, start_time);

create index if not exists email_events_booking_idx
on public.email_events (booking_id, event_type, status);

insert into public.services (id, name, duration_minutes, price, is_active)
values
  ('damen_haarschnitt', 'Damen', 45, 25, true),
  ('herren_haarschnitt', 'Herren', 30, 20, true),
  ('waschen_foehnen_styling', 'Waschen, Fohnen, Styling', 30, 15, true),
  ('haarefarben', 'Haarefarben', 90, 30, true),
  ('dauerwelle', 'Dauerwelle', 120, 35, true),
  ('pflegen', 'Pflegen', 30, 25, true),
  ('straehnen', 'Strahnen', 90, 40, true),
  ('blondierung', 'Blondierung', 120, 45, true),
  ('lonen_dauerwelle', 'Lonen Dauerwelle', 150, 120, true),
  ('digitale_dauerwelle', 'Digitale Dauerwelle', 150, 100, true)
on conflict (id) do update
set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  price = excluded.price,
  is_active = excluded.is_active;

update public.services
set is_active = false
where id in ('haircut', 'color', 'perm');

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

  if (
    select count(*)
    from appointments a
    join customers c on c.id = a.customer_id
    where lower(c.email) = lower(trim(p_email))
      and a.created_at > now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Too many booking attempts for this email';
  end if;

  if (
    select count(*)
    from appointments a
    join customers c on c.id = a.customer_id
    where c.phone = trim(p_phone)
      and a.created_at > now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Too many booking attempts for this phone';
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

create or replace function public.get_public_booking(
  p_booking_id uuid,
  p_email text
)
returns table (
  booking_id uuid,
  service_name text,
  appointment_date date,
  start_time timestamptz,
  end_time timestamptz,
  customer_name text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id as booking_id,
    s.name as service_name,
    a.appointment_date,
    a.start_time,
    a.end_time,
    c.name as customer_name,
    a.status
  from appointments a
  join customers c on c.id = a.customer_id
  join services s on s.id = a.service_id
  where a.id = p_booking_id
    and lower(c.email) = lower(trim(p_email))
  limit 1
$$;

create or replace function public.cancel_public_booking(
  p_booking_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update appointments a
  set
    status = 'cancelled',
    cancelled_by = 'customer',
    cancelled_at = now()
  from customers c
  where a.customer_id = c.id
    and a.id = p_booking_id
    and lower(c.email) = lower(trim(p_email))
    and a.status <> 'cancelled';

  if not found then
    raise exception 'Booking not found or already cancelled';
  end if;
end;
$$;

alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.shop_day_settings enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.email_events enable row level security;

drop policy if exists "public read services" on public.services;
drop policy if exists "owner manage services" on public.services;
drop policy if exists "owner insert services" on public.services;
drop policy if exists "owner update services" on public.services;
drop policy if exists "public read appointments" on public.appointments;
drop policy if exists "public create customers" on public.customers;
drop policy if exists "owner read customers" on public.customers;
drop policy if exists "public create appointments" on public.appointments;
drop policy if exists "public cancel appointments" on public.appointments;
drop policy if exists "owner cancel appointments" on public.appointments;
drop policy if exists "public read day settings" on public.shop_day_settings;
drop policy if exists "owner manage day settings" on public.shop_day_settings;
drop policy if exists "public read blocked slots" on public.blocked_slots;
drop policy if exists "owner manage blocked slots" on public.blocked_slots;
drop policy if exists "owner read email events" on public.email_events;

create policy "public read services"
on public.services for select
to anon, authenticated
using (true);

create policy "owner insert services"
on public.services for insert
to authenticated
with check (
  length(trim(name)) between 1 and 80
  and duration_minutes between 30 and 240
  and duration_minutes % 30 = 0
  and price between 0 and 999
);

create policy "owner update services"
on public.services for update
to authenticated
using (true)
with check (
  length(trim(name)) between 1 and 80
  and duration_minutes between 30 and 240
  and duration_minutes % 30 = 0
  and price between 0 and 999
);

create policy "public read appointments"
on public.appointments for select
to anon, authenticated
using (true);

create policy "owner read customers"
on public.customers for select
to authenticated
using (true);

create policy "owner cancel appointments"
on public.appointments for update
to authenticated
using (status <> 'cancelled')
with check (status = 'cancelled');

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

create policy "owner read email events"
on public.email_events for select
to authenticated
using (true);

grant execute on function public.create_public_booking(text, date, time, text, text, text, text)
to anon, authenticated;

grant execute on function public.get_public_booking(uuid, text)
to anon, authenticated;

grant execute on function public.cancel_public_booking(uuid, text)
to anon, authenticated;
