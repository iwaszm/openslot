-- Service duration is customer-facing. booked_slots defines the relative
-- 30-minute slots that are actually occupied by an appointment.
-- Run this once in the Supabase SQL Editor.

alter table public.services
  add column if not exists short_name text,
  add column if not exists booked_slots smallint[],
  add column if not exists price_from boolean not null default false,
  add column if not exists slot_color text;

update public.services s
set
  short_name = coalesce(nullif(trim(s.short_name), ''), s.name),
  booked_slots = coalesce(
    s.booked_slots,
    array(
      select generate_series(
        1,
        greatest(1, ceil(s.duration_minutes / 30.0)::integer)
      )::smallint
    )
  ),
  slot_color = coalesce(
    s.slot_color,
    case s.category
      when 'cut' then '#90CAF9'
      when 'color' then '#CE93D8'
      when 'shape' then '#FFCC80'
      else '#A5D6A7'
    end
  );

alter table public.services
  alter column short_name set not null,
  alter column booked_slots set not null,
  alter column booked_slots drop default,
  alter column slot_color set not null;

alter table public.services
  drop constraint if exists services_booked_slots_valid;

alter table public.services
  add constraint services_booked_slots_valid check (
    cardinality(booked_slots) > 0
    and booked_slots[1] >= 1
    and booked_slots[cardinality(booked_slots)] <= ceil(duration_minutes / 30.0)::integer
  );

create or replace function public.normalize_service_booking_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.short_name := coalesce(nullif(trim(new.short_name), ''), new.name);
  new.price_from := coalesce(new.price_from, false);
  new.slot_color := coalesce(
    nullif(trim(new.slot_color), ''),
    case new.category
      when 'cut' then '#90CAF9'
      when 'color' then '#CE93D8'
      when 'shape' then '#FFCC80'
      else '#A5D6A7'
    end
  );

  if new.booked_slots is null or cardinality(new.booked_slots) = 0 then
    new.booked_slots := array(
      select generate_series(
        1,
        greatest(1, ceil(new.duration_minutes / 30.0)::integer)
      )::smallint
    );
  else
    select array_agg(slot_number order by slot_number)
      into new.booked_slots
    from (
      select distinct slot_number
      from unnest(new.booked_slots) as slot_number
    ) normalized_slots;
  end if;

  if new.booked_slots[1] < 1
    or new.booked_slots[cardinality(new.booked_slots)] > ceil(new.duration_minutes / 30.0)::integer then
    raise exception 'booked_slots must fit inside duration_minutes';
  end if;

  return new;
end;
$$;

drop trigger if exists services_normalize_booking_fields on public.services;
create trigger services_normalize_booking_fields
before insert or update on public.services
for each row execute function public.normalize_service_booking_fields();

with lisa as (
  select id from public.salons where slug = 'lisa'
)
insert into public.services (
  id, salon_id, name, short_name, duration_minutes, booked_slots,
  price, price_from, is_active, category, slot_color
)
select
  values_list.id,
  lisa.id,
  values_list.name,
  values_list.short_name,
  values_list.duration_minutes,
  values_list.booked_slots,
  values_list.price,
  values_list.price_from,
  values_list.is_active,
  values_list.category,
  values_list.slot_color
from (
  values
    ('lisa_pflegen', 'Pflegen', 'Pflegen', 30, array[1]::smallint[], 25::numeric, false, true, 'care', '#A5D6A7'),
    ('lisa_waschen_foehnen_styling', 'Waschen, Föhnen, Styling', 'WFS', 30, array[1]::smallint[], 15::numeric, false, true, 'care', '#66BB6A'),
    ('lisa_herren_haarschnitt', 'Herren Haarschnitt', 'SchnittH', 30, array[1]::smallint[], 22::numeric, false, true, 'cut', '#90CAF9'),
    ('lisa_damen_haarschnitt', 'Damen Haarschnitt', 'SchnittD', 60, array[1,2]::smallint[], 30::numeric, false, true, 'cut', '#42A5F5'),
    ('lisa_blondierung', 'Blondieren', 'Blond', 120, array[1,4]::smallint[], 45::numeric, true, true, 'color', '#F48FB1'),
    ('lisa_haarefarben', 'Haarefarben', 'Farb', 120, array[1,4]::smallint[], 30::numeric, true, true, 'color', '#CE93D8'),
    ('lisa_straehnen', 'Strähnen', 'Stra', 120, array[1,4]::smallint[], 40::numeric, true, true, 'color', '#AB47BC'),
    ('lisa_dauerwelle', 'Dauerwelle', 'Dauer', 120, array[1,4]::smallint[], 50::numeric, true, true, 'shape', '#FFCC80'),
    ('lisa_digitale_dauerwelle', 'Digitale Dauerwelle', 'DDauer', 240, array[1,2,4,5,7,8]::smallint[], 120::numeric, true, true, 'shape', '#FFA726'),
    ('lisa_lonen_dauerwelle', 'Lonen Dauerwelle', 'LDauer', 240, array[1,2,4,5,7,8]::smallint[], 120::numeric, true, true, 'shape', '#FB8C00')
) as values_list(
  id, name, short_name, duration_minutes, booked_slots,
  price, price_from, is_active, category, slot_color
)
cross join lisa
on conflict (id) do update set
  salon_id = excluded.salon_id,
  name = excluded.name,
  short_name = excluded.short_name,
  duration_minutes = excluded.duration_minutes,
  booked_slots = excluded.booked_slots,
  price = excluded.price,
  price_from = excluded.price_from,
  is_active = excluded.is_active,
  category = excluded.category,
  slot_color = excluded.slot_color;

-- Liyong keeps its current durations and prices. New fields are derived from
-- those values; its existing "ab" services are marked explicitly.
update public.services s
set
  short_name = coalesce(nullif(trim(s.short_name), ''), s.name),
  booked_slots = array(
    select generate_series(
      1,
      greatest(1, ceil(s.duration_minutes / 30.0)::integer)
    )::smallint
  ),
  price_from = s.id in (
    'liyong_damen_waschen_schneiden_foehnen_lang',
    'liyong_damen_schneiden_faerben_straehnen',
    'liyong_damen_schneiden_dauerwelle',
    'liyong_digitale_dauerwelle',
    'liyong_ionische_dauerwelle',
    'liyong_herren_schneiden_faerben_straehnen',
    'liyong_herren_schneiden_dauerwelle'
  ),
  slot_color = case s.category
    when 'cut' then '#90CAF9'
    when 'color' then '#CE93D8'
    when 'shape' then '#FFCC80'
    else '#A5D6A7'
  end
where s.salon_id = (select id from public.salons where slug = 'liyong');

alter table public.appointments
  add column if not exists occupied_slots time[];

update public.appointments a
set occupied_slots = array(
  select (
    (a.start_time at time zone 'Europe/Berlin')::time
    + make_interval(mins => slot_offset * 30)
  )::time
  from generate_series(
    0,
    greatest(
      0,
      ceil(extract(epoch from (a.end_time - a.start_time)) / 1800.0)::integer - 1
    )
  ) as slot_offset
)
where a.occupied_slots is null;

alter table public.appointments
  alter column occupied_slots set not null;

-- The former continuous-range constraint would incorrectly block the free
-- gaps of sparse services. create_public_booking serializes bookings per day.
alter table public.appointments
  drop constraint if exists prevent_double_booking;

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
    select 1
    from appointments a
    cross join unnest(a.occupied_slots) as occupied_start
    where a.salon_id = new.salon_id
      and a.appointment_date = new.block_date
      and a.status <> 'cancelled'
      and new.start_time < occupied_start + interval '30 minutes'
      and new.end_time > occupied_start
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
  v_booked_slots smallint[];
  v_occupied_slots time[];
  v_end_time time;
  v_open_time time := '10:00';
  v_close_time time := '19:00';
  v_blocked_day boolean := false;
begin
  select id into v_salon_id
  from salons
  where slug = p_salon_slug and is_active = true;

  if v_salon_id is null then
    raise exception 'Unknown salon';
  end if;

  select duration_minutes, booked_slots
    into v_duration, v_booked_slots
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
  select array_agg(
    (p_start_time + make_interval(mins => (slot_number - 1) * 30))::time
    order by slot_number
  )
  into v_occupied_slots
  from unnest(v_booked_slots) as slot_number;

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

  perform pg_advisory_xact_lock(
    hashtextextended(v_salon_id::text || ':' || p_appointment_date::text, 0)
  );

  if exists (
    select 1
    from blocked_slots b
    cross join unnest(v_occupied_slots) as occupied_start
    where b.salon_id = v_salon_id
      and b.block_date = p_appointment_date
      and occupied_start < b.end_time
      and occupied_start + interval '30 minutes' > b.start_time
  ) then
    raise exception 'Booking overlaps a blocked slot';
  end if;

  if exists (
    select 1 from appointments a
    where a.salon_id = v_salon_id
      and a.appointment_date = p_appointment_date
      and a.status <> 'cancelled'
      and a.occupied_slots && v_occupied_slots
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
    id, salon_id, customer_id, service_id, appointment_date,
    start_time, end_time, occupied_slots, status
  )
  values (
    v_appointment_id,
    v_salon_id,
    v_customer_id,
    p_service_id,
    p_appointment_date,
    (p_appointment_date::timestamp + p_start_time) at time zone 'Europe/Berlin',
    (p_appointment_date::timestamp + v_end_time) at time zone 'Europe/Berlin',
    v_occupied_slots,
    'confirmed'
  );

  return v_appointment_id;
end;
$$;

grant execute on function public.create_public_booking(text, text, date, time, text, text, text, text)
to anon, authenticated;
