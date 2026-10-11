-- Optional seed: copy Lisa's active/inactive services to Li Yong.
-- Run this only when Li Yong should start with the same service list as Lisa.

insert into public.services (
  id,
  salon_id,
  name,
  duration_minutes,
  price,
  is_active,
  category
)
select
  'liyong_' || regexp_replace(lsv.id, '^lisa_', ''),
  ly.id,
  lsv.name,
  lsv.duration_minutes,
  lsv.price,
  lsv.is_active,
  lsv.category
from public.services lsv
join public.salons lisa on lisa.id = lsv.salon_id and lisa.slug = 'lisa'
join public.salons ly on ly.slug = 'liyong'
where not exists (
  select 1
  from public.services existing
  where existing.salon_id = ly.id
    and existing.id = 'liyong_' || regexp_replace(lsv.id, '^lisa_', '')
);
