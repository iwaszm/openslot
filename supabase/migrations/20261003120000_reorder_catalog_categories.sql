begin;

drop function if exists public.reorder_service_catalog(uuid, uuid[], text[]);

create function public.reorder_service_catalog(
  p_salon_id uuid,
  p_category_ids uuid[],
  p_service_ids text[],
  p_service_category_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if coalesce(cardinality(p_category_ids), 0) <> (
      select count(*) from public.service_categories category where category.salon_id = p_salon_id
    )
    or coalesce(cardinality(p_service_ids), 0) <> (
      select count(*) from public.services service where service.salon_id = p_salon_id
    )
    or cardinality(p_service_ids) <> cardinality(p_service_category_ids) then
    raise exception 'CATALOG_ORDER_MUST_BE_COMPLETE';
  end if;
  if cardinality(p_category_ids) <> (
      select count(distinct requested.id) from unnest(p_category_ids) requested(id)
    )
    or cardinality(p_service_ids) <> (
      select count(distinct requested.id) from unnest(p_service_ids) requested(id)
    ) then raise exception 'CATALOG_ORDER_CONTAINS_DUPLICATES'; end if;
  if exists (
      select 1 from unnest(p_category_ids) requested(id)
      where not exists (
        select 1 from public.service_categories category
        where category.id = requested.id and category.salon_id = p_salon_id
      )
    ) or exists (
      select 1
      from unnest(p_service_category_ids) requested(id)
      where not exists (
        select 1 from public.service_categories category
        where category.id = requested.id and category.salon_id = p_salon_id
      )
    ) or exists (
      select 1 from unnest(p_service_ids) requested(id)
      where not exists (
        select 1 from public.services service
        where service.id = requested.id and service.salon_id = p_salon_id
      )
    ) then raise exception 'CATALOG_ORDER_CONTAINS_FOREIGN_ITEMS'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text || ':catalog-order', 0));

  update public.service_categories category
  set sort_order = ordered.ordinality * 10, updated_at = now()
  from unnest(p_category_ids) with ordinality ordered(id, ordinality)
  where category.id = ordered.id and category.salon_id = p_salon_id;

  update public.services service
  set category_id = ordered.category_id,
    category = category.legacy_key,
    category_name_en = category.name_en,
    category_name_zh = category.name_zh,
    sort_order = ordered.ordinality * 10
  from unnest(p_service_ids, p_service_category_ids)
    with ordinality ordered(id, category_id, ordinality)
  join public.service_categories category
    on category.id = ordered.category_id and category.salon_id = p_salon_id
  where service.id = ordered.id and service.salon_id = p_salon_id;
end;
$$;

revoke all on function public.reorder_service_catalog(uuid, uuid[], text[], uuid[]) from public;
grant execute on function public.reorder_service_catalog(uuid, uuid[], text[], uuid[]) to authenticated;

comment on function public.reorder_service_catalog(uuid, uuid[], text[], uuid[]) is
  'Atomically saves category order, service order, and service category moves.';

commit;

notify pgrst, 'reload schema';
