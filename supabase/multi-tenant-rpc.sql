-- Multi-tenant migration for OpenSlot.
-- Run after supabase/setup.sql. Safe to rerun.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  address text not null default '',
  phone text not null default '',
  timezone text not null default 'Europe/Berlin',
  opening_hours jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.salons (slug, name, address, phone, opening_hours)
values
  (
    'lisa',
    'Lisa Hair Salon',
    'Niebuhrstrasse 66, 10629 Berlin',
    '0176 41164231',
    '{
      "monday": "10:00-18:00",
      "tuesday": "10:00-18:00",
      "wednesday": "10:00-18:00",
      "thursday": "10:00-18:00",
      "friday": "10:00-18:00",
      "saturday": "10:00-17:00",
      "sunday": "geschlossen"
    }'::jsonb
  ),
  (
    'liyong',
    'Li Yong Hair Salon',
    '',
    '',
    '{
      "monday": "10:00-18:00",
      "tuesday": "10:00-18:00",
      "wednesday": "10:00-18:00",
      "thursday": "10:00-18:00",
      "friday": "10:00-18:00",
      "saturday": "10:00-17:00",
      "sunday": "geschlossen"
    }'::jsonb
  )
on conflict (slug) do nothing;

create table if not exists public.salon_members (
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'super_admin')),
  created_at timestamptz not null default now(),
  primary key (salon_id, user_id)
);

alter table public.salons enable row level security;
alter table public.salon_members enable row level security;

drop policy if exists "public read salons" on public.salons;
drop policy if exists "authenticated read salon memberships" on public.salon_members;

create policy "public read salons"
on public.salons for select
to anon, authenticated
using (is_active = true);

create policy "authenticated read salon memberships"
on public.salon_members for select
to authenticated
using (user_id = auth.uid());

alter table public.services
  add column if not exists salon_id uuid references public.salons(id);

alter table public.customers
  add column if not exists salon_id uuid references public.salons(id);

alter table public.appointments
  add column if not exists salon_id uuid references public.salons(id),
  add column if not exists cancellation_token text;

alter table public.shop_day_settings
  add column if not exists salon_id uuid references public.salons(id);

alter table public.blocked_slots
  add column if not exists salon_id uuid references public.salons(id);

update public.services
set salon_id = (select id from public.salons where slug = 'lisa')
where salon_id is null;

update public.customers
set salon_id = (select id from public.salons where slug = 'lisa')
where salon_id is null;

update public.appointments
set
  salon_id = (select id from public.salons where slug = 'lisa'),
  cancellation_token = coalesce(cancellation_token, encode(gen_random_bytes(24), 'hex'))
where salon_id is null
   or cancellation_token is null;

update public.shop_day_settings
set salon_id = (select id from public.salons where slug = 'lisa')
where salon_id is null;

update public.blocked_slots
set salon_id = (select id from public.salons where slug = 'lisa')
where salon_id is null;

alter table public.services
  alter column salon_id set not null;

alter table public.customers
  alter column salon_id set not null;

alter table public.appointments
  alter column salon_id set not null,
  alter column cancellation_token set default encode(gen_random_bytes(24), 'hex'),
  alter column cancellation_token set not null;

alter table public.shop_day_settings
  alter column salon_id set not null;

alter table public.blocked_slots
  alter column salon_id set not null;

create unique index if not exists appointments_cancellation_token_key
on public.appointments (cancellation_token);

create index if not exists services_salon_idx
on public.services (salon_id, is_active);

create index if not exists customers_salon_idx
on public.customers (salon_id);

create index if not exists appointments_salon_date_idx
on public.appointments (salon_id, appointment_date, start_time);

create index if not exists shop_day_settings_salon_date_idx
on public.shop_day_settings (salon_id, setting_date);

create index if not exists blocked_slots_salon_date_idx
on public.blocked_slots (salon_id, block_date, start_time);

alter table public.shop_day_settings
  drop constraint if exists shop_day_settings_pkey;

alter table public.shop_day_settings
  add constraint shop_day_settings_pkey primary key (salon_id, setting_date);

alter table public.appointments
  drop constraint if exists prevent_double_booking;

alter table public.appointments
  add constraint prevent_double_booking
  exclude using gist (
    salon_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status <> 'cancelled');

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
    where salon_id = new.salon_id
      and appointment_date = new.setting_date
      and status <> 'cancelled'
  ) then
    raise exception 'Cannot block a day that already has appointments';
  end if;

  if exists (
    select 1 from appointments
    where salon_id = new.salon_id
      and appointment_date = new.setting_date
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

  if time_to_minutes(new.start_time) % 30 <> 0 or time_to_minutes(new.end_time) % 30 <> 0 then
    raise exception 'Blocked slots must use 30 minute increments';
  end if;

  if new.start_time < v_open_time or new.end_time > v_close_time then
    raise exception 'Blocked slot is outside working hours';
  end if;

  if exists (
    select 1 from blocked_slots
    where salon_id = new.salon_id
      and block_date = new.block_date
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and new.start_time < end_time
      and new.end_time > start_time
  ) then
    raise exception 'Blocked slot overlaps another blocked slot';
  end if;

  if exists (
    select 1 from appointments
    where salon_id = new.salon_id
      and appointment_date = new.block_date
      and status <> 'cancelled'
      and new.start_time < (end_time at time zone 'Europe/Berlin')::time
      and new.end_time > (start_time at time zone 'Europe/Berlin')::time
  ) then
    raise exception 'Blocked slot overlaps an appointment';
  end if;

  return new;
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
  v_customer_id uuid := gen_random_uuid();
  v_appointment_id uuid := gen_random_uuid();
  v_duration integer;
  v_end_time time;
  v_open_time time := '10:00';
  v_close_time time := '19:00';
  v_blocked_day boolean := false;
begin
  select id
    into v_salon_id
  from salons
  where slug = p_salon_slug
    and is_active = true;

  if v_salon_id is null then
    raise exception 'Unknown salon';
  end if;

  select duration_minutes
    into v_duration
  from services
  where id = p_service_id
    and salon_id = v_salon_id
    and is_active = true;

  if v_duration is null then
    raise exception 'Unknown or inactive service';
  end if;

  select open_time, close_time, is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from shop_day_settings
  where salon_id = v_salon_id
    and setting_date = p_appointment_date;

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
    where salon_id = v_salon_id
      and block_date = p_appointment_date
      and p_start_time < end_time
      and v_end_time > start_time
  ) then
    raise exception 'Booking overlaps a blocked slot';
  end if;

  if exists (
    select 1 from appointments
    where salon_id = v_salon_id
      and appointment_date = p_appointment_date
      and status <> 'cancelled'
      and p_start_time < (end_time at time zone 'Europe/Berlin')::time
      and v_end_time > (start_time at time zone 'Europe/Berlin')::time
  ) then
    raise exception 'Booking overlaps an existing appointment';
  end if;

  if (
    select count(*)
    from appointments a
    join customers c on c.id = a.customer_id
    where a.salon_id = v_salon_id
      and a.created_at > now() - interval '10 minutes'
      and (
        lower(c.email) = lower(trim(p_email))
        or regexp_replace(c.phone, '\s+', '', 'g') = regexp_replace(trim(p_phone), '\s+', '', 'g')
      )
  ) >= 3 then
    raise exception 'Too many booking attempts';
  end if;

  insert into customers (id, salon_id, name, phone, email, gender)
  values (v_customer_id, v_salon_id, trim(p_name), trim(p_phone), lower(trim(p_email)), p_gender);

  insert into appointments (
    id,
    salon_id,
    customer_id,
    service_id,
    appointment_date,
    start_time,
    end_time,
    status
  )
  values (
    v_appointment_id,
    v_salon_id,
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

grant execute on function public.create_public_booking(text, text, date, time, text, text, text, text)
to anon, authenticated;
