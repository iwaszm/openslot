create extension if not exists pgcrypto;

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

grant execute on function public.create_public_booking(text, date, time, text, text, text, text)
to anon, authenticated;

grant execute on function public.get_public_booking(uuid, text)
to anon, authenticated;

grant execute on function public.cancel_public_booking(uuid, text)
to anon, authenticated;
