-- Add service categories and prefix service ids per salon.
-- Run after supabase/multi-tenant-rpc.sql.

begin;

alter table public.services
  add column if not exists category text;

update public.services
set category = case
  when lower(name) similar to '%(dauerwelle|welle|perm)%' then 'shape'
  when lower(name) similar to '%(farbe|farben|faerben|straehne|strahnen|straehnen|blond)%' then 'color'
  when lower(name) similar to '%(schnitt|schneiden|haarschnitt)%' then 'cut'
  else 'care'
end
where category is null
  or category not in ('cut', 'color', 'shape', 'care');

-- Remove inactive legacy duplicates that have never been booked.
delete from public.services s
where s.id in ('color', 'custom_1788361392742')
  and s.is_active = false
  and not exists (
    select 1
    from public.appointments a
    where a.service_id = s.id
  );

create temp table _service_id_map on commit drop as
select
  s.id as old_id,
  concat(slug.slug, '_', s.id) as new_id
from public.services s
join public.salons slug on slug.id = s.salon_id
where slug.slug in ('lisa', 'liyong')
  and s.id not like 'lisa\_%' escape '\'
  and s.id not like 'liyong\_%' escape '\';

insert into public.services (id, salon_id, name, duration_minutes, price, is_active, category)
select
  m.new_id,
  s.salon_id,
  s.name,
  s.duration_minutes,
  s.price,
  s.is_active,
  s.category
from _service_id_map m
join public.services s on s.id = m.old_id
where not exists (
  select 1
  from public.services existing
  where existing.id = m.new_id
);

update public.appointments a
set service_id = m.new_id
from _service_id_map m
where a.service_id = m.old_id;

delete from public.services s
using _service_id_map m
where s.id = m.old_id;

alter table public.services
  alter column category set default 'care';

update public.services
set category = 'care'
where category is null
  or category not in ('cut', 'color', 'shape', 'care');

alter table public.services
  alter column category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_category_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_category_check
      check (category in ('cut', 'color', 'shape', 'care'));
  end if;
end $$;

commit;

select
  salons.slug,
  services.category,
  count(*) as service_count
from public.services
join public.salons on salons.id = services.salon_id
where salons.slug in ('lisa', 'liyong')
group by salons.slug, services.category
order by salons.slug, services.category;
