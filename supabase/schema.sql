create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists public.services (
  id text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10, 2) not null default 0,
  category text not null default 'care' check (category in ('cut', 'color', 'shape', 'care')),
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

alter table public.appointments
  drop constraint if exists prevent_double_booking;

alter table public.appointments
  add constraint prevent_double_booking
  exclude using gist (
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status <> 'cancelled');

insert into public.services (id, name, duration_minutes, price, category)
values
  ('damen_haarschnitt', 'Damen', 45, 25, 'cut'),
  ('herren_haarschnitt', 'Herren', 30, 20, 'cut'),
  ('waschen_foehnen_styling', 'Waschen, Fohnen, Styling', 30, 15, 'care'),
  ('haarefarben', 'Haarefarben', 90, 30, 'color'),
  ('dauerwelle', 'Dauerwelle', 120, 35, 'shape'),
  ('pflegen', 'Pflegen', 30, 25, 'care'),
  ('straehnen', 'Strahnen', 90, 40, 'color'),
  ('blondierung', 'Blondierung', 120, 45, 'color'),
  ('lonen_dauerwelle', 'Lonen Dauerwelle', 150, 120, 'shape'),
  ('digitale_dauerwelle', 'Digitale Dauerwelle', 150, 100, 'shape')
on conflict (id) do update
set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  price = excluded.price,
  category = excluded.category;

update public.services
set is_active = false
where id in ('haircut', 'color', 'perm');

alter table public.services
  add column if not exists is_active boolean not null default true;

alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "public read services" on public.services;
drop policy if exists "owner manage services" on public.services;
drop policy if exists "owner insert services" on public.services;
drop policy if exists "owner update services" on public.services;
drop policy if exists "public read appointments" on public.appointments;
drop policy if exists "public create customers" on public.customers;
drop policy if exists "owner read customers" on public.customers;
drop policy if exists "public create appointments" on public.appointments;
drop policy if exists "owner cancel appointments" on public.appointments;

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
  and category in ('cut', 'color', 'shape', 'care')
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
  and category in ('cut', 'color', 'shape', 'care')
);

create policy "public read appointments"
on public.appointments for select
to anon, authenticated
using (true);

create policy "public create customers"
on public.customers for insert
to anon, authenticated
with check (
  length(trim(name)) between 2 and 120
  and trim(name) !~ '^[0-9]+$'
  and length(phone) between 3 and 80
  and email like '%@%'
  and gender in ('male', 'female')
);

create policy "owner read customers"
on public.customers for select
to authenticated
using (true);

create policy "public create appointments"
on public.appointments for insert
to anon, authenticated
with check (
  status = 'confirmed'
  and service_id in (
    'damen_haarschnitt',
    'herren_haarschnitt',
    'waschen_foehnen_styling',
    'haarefarben',
    'dauerwelle',
    'pflegen',
    'straehnen',
    'blondierung',
    'lonen_dauerwelle',
    'digitale_dauerwelle'
  )
  and end_time > start_time
);

create policy "owner cancel appointments"
on public.appointments for update
to authenticated
using (status <> 'cancelled')
with check (status = 'cancelled');
