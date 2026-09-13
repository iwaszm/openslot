-- Configurable employees and visual process lanes.
-- This is the first compatibility step: existing appointments still use
-- appointments.lane_key and existing manual records still use A/B/C storage.

create table if not exists public.salon_staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_key text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, staff_key)
);

create table if not exists public.staff_lanes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null references public.salon_staff(id) on delete cascade,
  lane_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, lane_key),
  unique (staff_id, sort_order)
);

create index if not exists salon_staff_schedule_idx
  on public.salon_staff (salon_id, is_active, sort_order);

create index if not exists staff_lanes_schedule_idx
  on public.staff_lanes (salon_id, staff_id, is_active, sort_order);

alter table public.salon_staff enable row level security;
alter table public.staff_lanes enable row level security;

drop policy if exists "Public can read active salon staff" on public.salon_staff;
create policy "Public can read active salon staff"
  on public.salon_staff for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.salons
      where salons.id = salon_staff.salon_id and salons.is_active = true
    )
  );

drop policy if exists "Public can read active staff lanes" on public.staff_lanes;
create policy "Public can read active staff lanes"
  on public.staff_lanes for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.salons
      where salons.id = staff_lanes.salon_id and salons.is_active = true
    )
  );

drop policy if exists "Salon members can manage salon staff" on public.salon_staff;
create policy "Salon members can manage salon staff"
  on public.salon_staff for all
  to authenticated
  using (
    exists (
      select 1 from public.salon_members
      where salon_members.user_id = auth.uid()
        and (salon_members.role = 'super_admin' or salon_members.salon_id = salon_staff.salon_id)
    )
  )
  with check (
    exists (
      select 1 from public.salon_members
      where salon_members.user_id = auth.uid()
        and (salon_members.role = 'super_admin' or salon_members.salon_id = salon_staff.salon_id)
    )
  );

drop policy if exists "Salon members can manage staff lanes" on public.staff_lanes;
create policy "Salon members can manage staff lanes"
  on public.staff_lanes for all
  to authenticated
  using (
    exists (
      select 1 from public.salon_members
      where salon_members.user_id = auth.uid()
        and (salon_members.role = 'super_admin' or salon_members.salon_id = staff_lanes.salon_id)
    )
  )
  with check (
    exists (
      select 1 from public.salon_members
      where salon_members.user_id = auth.uid()
        and (salon_members.role = 'super_admin' or salon_members.salon_id = staff_lanes.salon_id)
    )
  );

insert into public.salon_staff (salon_id, staff_key, name, sort_order, is_active)
select id, 'default', 'Mitarbeiter 1', 1, true
from public.salons
where slug in ('lisa', 'liyong')
on conflict (salon_id, staff_key) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.staff_lanes (salon_id, staff_id, lane_key, label, sort_order, is_active)
select s.id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
from public.salons s
join public.salon_staff staff on staff.salon_id = s.id and staff.staff_key = 'default'
cross join lateral (
  values ('a', 'A', 1), ('b', 'B', 2), ('c', 'C', 3)
) as lane(lane_key, label, sort_order)
where s.slug = 'lisa'
on conflict (salon_id, lane_key) do update set
  staff_id = excluded.staff_id,
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.staff_lanes (salon_id, staff_id, lane_key, label, sort_order, is_active)
select s.id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
from public.salons s
join public.salon_staff staff on staff.salon_id = s.id and staff.staff_key = 'default'
cross join lateral (
  values ('a', 'A', 1), ('b', 'B', 2)
) as lane(lane_key, label, sort_order)
where s.slug = 'liyong'
on conflict (salon_id, lane_key) do update set
  staff_id = excluded.staff_id,
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

update public.staff_lanes lanes
set is_active = false, updated_at = now()
from public.salons salons
where lanes.salon_id = salons.id
  and salons.slug = 'liyong'
  and lanes.lane_key not in ('a', 'b');
