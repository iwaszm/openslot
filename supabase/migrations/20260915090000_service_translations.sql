begin;

alter table public.services
  add column if not exists name_en text,
  add column if not exists name_zh text,
  add column if not exists category_name_en text,
  add column if not exists category_name_zh text;

do $$
declare
  target record;
begin
  if exists (select 1 from public.services where id = 'lisa_lonen_dauerwelle') then
    if not exists (select 1 from public.services where id = 'lisa_ionen_dauerwelle') then
      insert into public.services
      select (jsonb_populate_record(
        null::public.services,
        to_jsonb(source_service) || jsonb_build_object('id', 'lisa_ionen_dauerwelle')
      )).*
      from public.services source_service
      where source_service.id = 'lisa_lonen_dauerwelle';
    end if;

    for target in
      select format('%I.%I', namespace.nspname, relation.relname) as relation_name
      from pg_attribute attribute
      join pg_class relation on relation.oid = attribute.attrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'p')
        and attribute.attname = 'service_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      execute format(
        'update %s set service_id = $1 where service_id = $2',
        target.relation_name
      ) using 'lisa_ionen_dauerwelle', 'lisa_lonen_dauerwelle';
    end loop;

    delete from public.services where id = 'lisa_lonen_dauerwelle';
  end if;

  update public.services
  set name = 'Ionen Dauerwelle', short_name = 'IDauer'
  where id = 'lisa_ionen_dauerwelle';
end;
$$;

update public.services
set
  category_name_en = coalesce(category_name_en, case category
    when 'cut' then 'Haircuts'
    when 'care' then 'Care & styling'
    when 'color' then 'Color'
    when 'shape' then 'Perms'
  end),
  category_name_zh = coalesce(category_name_zh, case category
    when 'cut' then '剪发'
    when 'care' then '护理与造型'
    when 'color' then '染发'
    when 'shape' then '烫发'
  end);

update public.services service
set
  name_en = coalesce(service.name_en, translation.name_en),
  name_zh = coalesce(service.name_zh, translation.name_zh)
from (values
  ('lisa_damen_haarschnitt', 'Ladies haircut', '女士剪发'),
  ('lisa_herren_haarschnitt', 'Men''s haircut', '男士剪发'),
  ('lisa_waschen_foehnen_styling', 'Wash, blow-dry & styling', '洗发、吹风与造型'),
  ('lisa_haarefarben', 'Hair coloring', '染发'),
  ('lisa_straehnen', 'Highlights', '挑染'),
  ('lisa_blondierung', 'Bleaching', '漂发'),
  ('lisa_dauerwelle', 'Perm', '烫发'),
  ('lisa_digitale_dauerwelle', 'Digital perm', '数码烫'),
  ('lisa_ionen_dauerwelle', 'Ionic perm', '离子烫'),
  ('lisa_pflegen', 'Hair care', '护理'),
  ('liyong_damen_schneiden_kurz', 'Ladies haircut (short)', '女士短发剪发'),
  ('liyong_damen_schneiden_lang', 'Ladies haircut (long)', '女士长发剪发'),
  ('liyong_damen_waschen_schneiden_foehnen_kurz', 'Ladies wash, cut & blow-dry (short)', '女士短发洗剪吹'),
  ('liyong_damen_waschen_schneiden_foehnen_lang', 'Ladies wash, cut & blow-dry (long)', '女士长发洗剪吹'),
  ('liyong_damen_schneiden_faerben_straehnen', 'Ladies cut & color / highlights', '女士剪发与染发 / 挑染'),
  ('liyong_damen_schneiden_dauerwelle', 'Ladies cut & perm', '女士剪发与烫发'),
  ('liyong_digitale_dauerwelle', 'Digital perm', '数码烫'),
  ('liyong_ionische_dauerwelle', 'Ionic perm', '离子烫'),
  ('liyong_herren_schneiden', 'Men''s haircut', '男士剪发'),
  ('liyong_herren_waschen_schneiden_foehnen', 'Men''s wash, cut & blow-dry', '男士洗剪吹'),
  ('liyong_herren_schneiden_faerben_straehnen', 'Men''s cut & color / highlights', '男士剪发与染发 / 挑染'),
  ('liyong_herren_schneiden_dauerwelle', 'Men''s cut & perm', '男士剪发与烫发')
) as translation(id, name_en, name_zh)
where service.id = translation.id;

comment on column public.services.name_en is 'Customer-facing English service name.';
comment on column public.services.name_zh is 'Customer-facing Chinese service name.';
comment on column public.services.category_name_en is 'Customer-facing English category label.';
comment on column public.services.category_name_zh is 'Customer-facing Chinese category label.';

commit;
