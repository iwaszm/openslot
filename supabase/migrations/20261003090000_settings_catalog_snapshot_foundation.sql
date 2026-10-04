begin;

-- Categories become salon-owned records. The legacy services.category column is
-- intentionally retained until every production surface uses category_id.
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  legacy_key text,
  name text not null,
  name_en text,
  name_zh text,
  short_name text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id),
  unique (salon_id, legacy_key)
);

alter table public.service_categories enable row level security;
grant select on table public.service_categories to anon, authenticated;
grant insert, update on table public.service_categories to authenticated;

drop policy if exists "Public read active service categories" on public.service_categories;
create policy "Public read active service categories"
  on public.service_categories for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.salons salon
      where salon.id = service_categories.salon_id and salon.is_active
    )
  );

drop policy if exists "Salon roles read service categories" on public.service_categories;
create policy "Salon roles read service categories"
  on public.service_categories for select to authenticated
  using (public.can_view_salon(salon_id));

drop policy if exists "Owners insert service categories" on public.service_categories;
create policy "Owners insert service categories"
  on public.service_categories for insert to authenticated
  with check (public.can_manage_salon(salon_id));

drop policy if exists "Owners update service categories" on public.service_categories;
create policy "Owners update service categories"
  on public.service_categories for update to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

insert into public.service_categories (
  salon_id, legacy_key, name, name_en, name_zh, short_name, sort_order
)
select
  service.salon_id,
  service.category,
  case service.category
    when 'cut' then 'Haarschnitt'
    when 'care' then 'Pflege & Styling'
    when 'color' then 'Farbe'
    when 'shape' then 'Umformung'
    else initcap(replace(service.category, '_', ' '))
  end,
  coalesce(max(service.category_name_en), case service.category
    when 'cut' then 'Haircuts'
    when 'care' then 'Care & styling'
    when 'color' then 'Color'
    when 'shape' then 'Perms'
    else initcap(replace(service.category, '_', ' '))
  end),
  coalesce(max(service.category_name_zh), case service.category
    when 'cut' then '剪发'
    when 'care' then '护理与造型'
    when 'color' then '染发'
    when 'shape' then '烫发'
    else service.category
  end),
  upper(left(service.category, 8)),
  case service.category
    when 'cut' then 10
    when 'care' then 20
    when 'color' then 30
    when 'shape' then 40
    else 100
  end
from public.services service
group by service.salon_id, service.category
on conflict (salon_id, legacy_key) do update set
  name_en = coalesce(public.service_categories.name_en, excluded.name_en),
  name_zh = coalesce(public.service_categories.name_zh, excluded.name_zh),
  updated_at = now();

alter table public.services
  add column if not exists category_id uuid,
  add column if not exists sort_order integer not null default 0;

update public.services service
set category_id = category.id
from public.service_categories category
where category.salon_id = service.salon_id
  and category.legacy_key = service.category
  and service.category_id is null;

with ranked as (
  select id, row_number() over (
    partition by salon_id, category_id
    order by id
  ) * 10 as next_sort_order
  from public.services
)
update public.services service
set sort_order = ranked.next_sort_order
from ranked
where ranked.id = service.id and service.sort_order = 0;

alter table public.services
  drop constraint if exists services_category_salon_fkey,
  add constraint services_category_salon_fkey
    foreign key (category_id, salon_id)
    references public.service_categories(id, salon_id) on delete restrict;

create index if not exists service_categories_salon_order_idx
  on public.service_categories (salon_id, is_active, sort_order, id);
create index if not exists services_salon_category_order_idx
  on public.services (salon_id, category_id, is_active, sort_order, id);

-- Authenticated salon roles need inactive catalog rows for Settings read-only
-- views. Public booking still sees active rows through the existing policy.
drop policy if exists "Owners read salon services" on public.services;
drop policy if exists "Salon roles read salon services" on public.services;
create policy "Salon roles read salon services"
  on public.services for select to authenticated
  using (public.can_view_salon(salon_id));

-- Service deletion is handled later by an explicit archival/deletion RPC.
drop policy if exists "members delete own salon services" on public.services;
drop policy if exists "Owners delete salon services" on public.services;
revoke delete on table public.services from authenticated;

alter table public.salon_staff
  add column if not exists short_name text,
  add column if not exists display_color text;

with staff_display as (
  select
    staff.id,
    coalesce(nullif(trim(staff.name), ''), staff.staff_key) as generated_short_name,
    row_number() over (
      partition by staff.salon_id order by staff.sort_order, staff.id
    ) as display_position
  from public.salon_staff staff
)
update public.salon_staff staff
set
  short_name = coalesce(nullif(trim(staff.short_name), ''), staff_display.generated_short_name),
  display_color = coalesce(nullif(trim(staff.display_color), ''), case ((staff_display.display_position - 1) % 6)
    when 0 then '#B7FF36'
    when 1 then '#FF4FB8'
    when 2 then '#82D9FF'
    when 3 then '#FFD84D'
    when 4 then '#9F8CFF'
    else '#67E8A5'
  end),
  updated_at = now()
from staff_display
where staff_display.id = staff.id;

alter table public.salon_staff
  alter column short_name set not null,
  alter column display_color set not null,
  drop constraint if exists salon_staff_display_color_check,
  add constraint salon_staff_display_color_check
    check (display_color ~ '^#[0-9A-Fa-f]{6}$');

-- Employee creation/deletion stays in Supabase administration. Settings may
-- update existing display and availability fields only.
revoke insert, delete on table public.salon_staff from authenticated;
revoke update on table public.salon_staff from authenticated;
grant select on table public.salon_staff to anon, authenticated;
grant update (
  name, short_name, display_color, sort_order, is_active,
  accepts_online_bookings, updated_at
) on table public.salon_staff to authenticated;

drop policy if exists "Salon members can manage salon staff" on public.salon_staff;
drop policy if exists "Owners can manage salon staff" on public.salon_staff;
drop policy if exists "Salon roles read salon staff" on public.salon_staff;
drop policy if exists "Owners update salon staff" on public.salon_staff;
create policy "Salon roles read salon staff"
  on public.salon_staff for select to authenticated
  using (public.can_view_salon(salon_id));
create policy "Owners update salon staff"
  on public.salon_staff for update to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

drop policy if exists "Owners read staff services" on public.staff_services;
drop policy if exists "Owners manage staff services" on public.staff_services;
drop policy if exists "Salon roles read staff services" on public.staff_services;
drop policy if exists "Owners insert staff services" on public.staff_services;
drop policy if exists "Owners update staff services" on public.staff_services;
drop policy if exists "Owners delete staff services" on public.staff_services;
create policy "Salon roles read staff services"
  on public.staff_services for select to authenticated
  using (public.can_view_salon(salon_id));
create policy "Owners insert staff services"
  on public.staff_services for insert to authenticated
  with check (public.can_manage_salon(salon_id));
create policy "Owners update staff services"
  on public.staff_services for update to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));
create policy "Owners delete staff services"
  on public.staff_services for delete to authenticated
  using (public.can_manage_salon(salon_id));

alter table public.salons
  add column if not exists theme_preset text not null default 'lime',
  add column if not exists languages text[] not null default array['de', 'en', 'zh']::text[];

alter table public.salons
  drop constraint if exists salons_theme_preset_check,
  add constraint salons_theme_preset_check
    check (theme_preset in ('lime', 'pink', 'glacier')),
  drop constraint if exists salons_languages_check,
  add constraint salons_languages_check check (
    cardinality(languages) = 3
    and languages <@ array['de', 'en', 'zh']::text[]
    and 'de' = any(languages)
    and 'en' = any(languages)
    and 'zh' = any(languages)
  );

alter table public.appointments
  add column if not exists service_snapshot jsonb;
alter table public.schedule_entries
  add column if not exists service_snapshot jsonb;

create or replace function public.build_service_snapshot(
  p_service_id text,
  p_salon_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', service.id,
    'name', service.name,
    'nameEn', service.name_en,
    'nameZh', service.name_zh,
    'shortName', service.short_name,
    'category', jsonb_build_object(
      'id', category.id,
      'legacyKey', service.category,
      'name', coalesce(category.name, service.category),
      'nameEn', coalesce(category.name_en, service.category_name_en),
      'nameZh', coalesce(category.name_zh, service.category_name_zh),
      'shortName', category.short_name
    ),
    'durationMinutes', service.duration_minutes,
    'bookedSlots', to_jsonb(service.booked_slots),
    'price', service.price,
    'priceFrom', service.price_from,
    'color', service.slot_color
  ))
  from public.services service
  left join public.service_categories category
    on category.id = service.category_id and category.salon_id = service.salon_id
  where service.id = p_service_id and service.salon_id = p_salon_id;
$$;

revoke all on function public.build_service_snapshot(text, uuid) from public, anon, authenticated;

update public.appointments appointment
set service_snapshot = public.build_service_snapshot(appointment.service_id, appointment.salon_id)
where appointment.service_snapshot is null;

update public.schedule_entries entry
set service_snapshot = public.build_service_snapshot(entry.service_id, entry.salon_id)
where entry.service_id is not null and entry.service_snapshot is null;

create or replace function public.freeze_service_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.service_id is distinct from old.service_id
     or new.salon_id is distinct from old.salon_id then
    new.service_snapshot := case
      when new.service_id is null then null
      else public.build_service_snapshot(new.service_id, new.salon_id)
    end;
  else
    new.service_snapshot := old.service_snapshot;
  end if;

  if new.service_id is not null and new.service_snapshot is null then
    raise exception 'Service snapshot could not be created';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_service_snapshot() from public, anon, authenticated;

drop trigger if exists appointments_freeze_service_snapshot on public.appointments;
create trigger appointments_freeze_service_snapshot
before insert or update of salon_id, service_id, service_snapshot on public.appointments
for each row execute function public.freeze_service_snapshot();

drop trigger if exists schedule_entries_freeze_service_snapshot on public.schedule_entries;
create trigger schedule_entries_freeze_service_snapshot
before insert or update of salon_id, service_id, service_snapshot on public.schedule_entries
for each row execute function public.freeze_service_snapshot();

comment on table public.service_categories is
  'Salon-owned service categories used for translated labels and stable ordering.';
comment on column public.services.category_id is
  'New category relation. services.category remains during the production UI transition.';
comment on column public.appointments.service_snapshot is
  'Immutable customer-facing service data captured when the appointment is created.';
comment on column public.schedule_entries.service_snapshot is
  'Immutable calendar-facing service data captured when the entry is created.';

commit;
