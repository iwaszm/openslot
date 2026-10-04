begin;

alter table public.service_categories
  add column if not exists accepts_online_bookings boolean not null default true;

comment on column public.service_categories.accepts_online_bookings is
  'Bulk online-booking state for the category. Saving it cascades the value to every service in the category.';

-- Reflect the migrated service state for existing categories. Categories with
-- no services retain the online default.
update public.service_categories category
set accepts_online_bookings = exists (
  select 1
  from public.services service
  where service.salon_id = category.salon_id
    and service.category_id = category.id
    and service.accepts_online_bookings
)
where exists (
  select 1
  from public.services service
  where service.salon_id = category.salon_id
    and service.category_id = category.id
);

create or replace function public.save_service_category(
  p_salon_id uuid,
  p_category_id uuid,
  p_name text,
  p_name_en text,
  p_name_zh text,
  p_short_name text,
  p_is_active boolean,
  p_accepts_online_bookings boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid := coalesce(p_category_id, gen_random_uuid());
  v_legacy_key text;
  v_sort_order integer;
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_name is null or p_short_name is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 50
    or length(trim(p_short_name)) < 1 or length(trim(p_short_name)) > 12
    or length(trim(coalesce(p_name_en, ''))) > 50
    or length(trim(coalesce(p_name_zh, ''))) > 50
    or p_is_active is null
    or p_accepts_online_bookings is null then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_category_id is null then
    v_legacy_key := 'category_' || left(replace(v_category_id::text, '-', ''), 12);
    select coalesce(max(category.sort_order), 0) + 10 into v_sort_order
    from public.service_categories category where category.salon_id = p_salon_id;
    insert into public.service_categories (
      id, salon_id, legacy_key, name, name_en, name_zh,
      short_name, sort_order, is_active, accepts_online_bookings
    ) values (
      v_category_id, p_salon_id, v_legacy_key, trim(p_name),
      nullif(trim(coalesce(p_name_en, '')), ''),
      nullif(trim(coalesce(p_name_zh, '')), ''),
      trim(p_short_name), v_sort_order, p_is_active, p_accepts_online_bookings
    );
  else
    update public.service_categories category
    set name = trim(p_name),
      name_en = nullif(trim(coalesce(p_name_en, '')), ''),
      name_zh = nullif(trim(coalesce(p_name_zh, '')), ''),
      short_name = trim(p_short_name),
      is_active = p_is_active,
      accepts_online_bookings = p_accepts_online_bookings,
      updated_at = now()
    where category.id = p_category_id and category.salon_id = p_salon_id;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  end if;

  update public.services service
  set category_name_en = nullif(trim(coalesce(p_name_en, '')), ''),
    category_name_zh = nullif(trim(coalesce(p_name_zh, '')), ''),
    accepts_online_bookings = p_accepts_online_bookings
  where service.salon_id = p_salon_id and service.category_id = v_category_id;

  return v_category_id;
end;
$$;

revoke all on function public.save_service_category(uuid, uuid, text, text, text, text, boolean, boolean) from public;
grant execute on function public.save_service_category(uuid, uuid, text, text, text, text, boolean, boolean) to authenticated;

drop policy if exists "public read active online services" on public.services;
create policy "public read active online services"
  on public.services for select to anon, authenticated
  using (
    is_active and accepts_online_bookings
    and exists (
      select 1 from public.salons salon
      where salon.id = services.salon_id and salon.is_active
    )
    and exists (
      select 1 from public.service_categories category
      where category.id = services.category_id
        and category.salon_id = services.salon_id
        and category.is_active
        and category.accepts_online_bookings
    )
  );

create or replace function public.get_public_staff_services(p_salon_slug text)
returns table (staff_key text, service_id text)
language sql
stable
security definer
set search_path = public
as $$
  select staff.staff_key, capability.service_id
  from public.staff_services capability
  join public.salon_staff staff on staff.id = capability.staff_id
  join public.services service on service.id = capability.service_id
  join public.service_categories category
    on category.id = service.category_id and category.salon_id = service.salon_id
  join public.salons salon on salon.id = capability.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and category.is_active
    and category.accepts_online_bookings
    and service.is_active
    and service.accepts_online_bookings
    and capability.is_active
    and capability.accepts_online_bookings;
$$;

revoke all on function public.get_public_staff_services(text) from public;
grant execute on function public.get_public_staff_services(text) to anon, authenticated;

create or replace function public.assert_appointment_service_accepts_online()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.services service
    join public.service_categories category
      on category.id = service.category_id and category.salon_id = service.salon_id
    where service.id = new.service_id
      and service.salon_id = new.salon_id
      and service.is_active
      and service.accepts_online_bookings
      and category.is_active
      and category.accepts_online_bookings
  ) then
    raise exception 'SERVICE_NOT_AVAILABLE_ONLINE';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
