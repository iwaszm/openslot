alter table public.services
  add column if not exists is_active boolean not null default true;

update public.services
set is_active = true
where is_active is null;

drop policy if exists "public read services" on public.services;
drop policy if exists "owner manage services" on public.services;
drop policy if exists "owner insert services" on public.services;
drop policy if exists "owner update services" on public.services;

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

grant execute on function public.create_public_booking(text, date, time, text, text, text, text)
to anon, authenticated;
