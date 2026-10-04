begin;

-- Custom categories are now validated through category_id. Keep the legacy
-- text column populated for the current production UI, but remove its old
-- four-value restriction.
alter table public.services
  drop constraint if exists services_category_check;

create or replace function public.get_settings_snapshot(p_salon_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_salon public.salons;
  v_member public.salon_members;
  v_email text;
begin
  select salon.* into v_salon
  from public.salons salon
  where salon.slug = p_salon_slug and salon.is_active;

  if not found then raise exception 'SALON_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_view_salon(v_salon.id) then
    raise exception 'SALON_ACCESS_DENIED' using errcode = '42501';
  end if;

  select member.* into v_member
  from public.salon_members member
  where member.user_id = auth.uid()
    and (member.role = 'admin' or member.salon_id = v_salon.id)
  order by case when member.salon_id = v_salon.id then 0 else 1 end
  limit 1;

  select account.email into v_email
  from auth.users account
  where account.id = auth.uid();

  return jsonb_build_object(
    'account', jsonb_build_object(
      'email', v_email,
      'role', v_member.role,
      'staff_id', v_member.staff_id
    ),
    'salon', jsonb_build_object(
      'id', v_salon.id,
      'slug', v_salon.slug,
      'name', v_salon.name,
      'address', v_salon.address,
      'phone', v_salon.phone,
      'timezone', v_salon.timezone,
      'theme_preset', v_salon.theme_preset,
      'languages', v_salon.languages,
      'holiday_region', v_salon.holiday_region,
      'block_public_holidays', v_salon.block_public_holidays
    ),
    'weekly_hours', coalesce((
      select jsonb_agg(to_jsonb(hours) order by hours.weekday)
      from public.salon_weekly_hours hours
      where hours.salon_id = v_salon.id
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', staff.id,
        'staff_key', staff.staff_key,
        'name', staff.name,
        'short_name', staff.short_name,
        'display_color', staff.display_color,
        'sort_order', staff.sort_order,
        'is_active', staff.is_active,
        'accepts_online_bookings', staff.accepts_online_bookings
      ) order by staff.sort_order, staff.id)
      from public.salon_staff staff
      where staff.salon_id = v_salon.id
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(category) order by category.sort_order, category.id)
      from public.service_categories category
      where category.salon_id = v_salon.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'name_en', service.name_en,
        'name_zh', service.name_zh,
        'short_name', service.short_name,
        'duration_minutes', service.duration_minutes,
        'booked_slots', service.booked_slots,
        'price', service.price,
        'price_from', service.price_from,
        'slot_color', service.slot_color,
        'category_id', service.category_id,
        'sort_order', service.sort_order,
        'is_active', service.is_active
      ) order by service.sort_order, service.id)
      from public.services service
      where service.salon_id = v_salon.id
    ), '[]'::jsonb),
    'staff_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', capability.staff_id,
        'service_id', capability.service_id,
        'is_active', capability.is_active,
        'accepts_online_bookings', capability.accepts_online_bookings
      ) order by capability.staff_id, capability.service_id)
      from public.staff_services capability
      where capability.salon_id = v_salon.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_settings_snapshot(text) from public;
grant execute on function public.get_settings_snapshot(text) to authenticated;

create or replace function public.update_salon_settings(
  p_salon_id uuid,
  p_name text,
  p_address text,
  p_phone text,
  p_theme_preset text,
  p_languages text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_name is null or p_address is null or p_phone is null or p_theme_preset is null
    or p_languages is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 80
    or length(trim(p_address)) < 3 or length(trim(p_address)) > 160
    or length(trim(p_phone)) < 3 or length(trim(p_phone)) > 40 then
    raise exception 'INVALID_SHOP_PROFILE';
  end if;
  if p_theme_preset not in ('lime', 'pink', 'glacier') then raise exception 'INVALID_THEME'; end if;
  if cardinality(p_languages) <> 3
    or not ('de' = any(p_languages) and 'en' = any(p_languages) and 'zh' = any(p_languages)) then
    raise exception 'INVALID_LANGUAGES';
  end if;

  update public.salons salon
  set name = trim(p_name), address = trim(p_address), phone = trim(p_phone),
    theme_preset = p_theme_preset, languages = p_languages
  where salon.id = p_salon_id;

  if not found then raise exception 'SALON_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_salon_settings(uuid, text, text, text, text, text[]) from public;
grant execute on function public.update_salon_settings(uuid, text, text, text, text, text[]) to authenticated;

create or replace function public.replace_salon_weekly_hours(
  p_salon_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'INVALID_WEEKLY_HOURS';
  end if;
  if (
    select count(distinct row_data.weekday)
    from jsonb_to_recordset(p_hours) as row_data(
      weekday smallint, open_time time, close_time time, is_closed boolean
    )
  ) <> 7 then raise exception 'INVALID_WEEKLY_HOURS'; end if;

  insert into public.salon_weekly_hours (
    salon_id, weekday, open_time, close_time, is_closed, updated_at
  )
  select
    p_salon_id,
    row_data.weekday,
    coalesce(row_data.open_time, time '10:00'),
    coalesce(row_data.close_time, time '18:00'),
    coalesce(row_data.is_closed, false),
    now()
  from jsonb_to_recordset(p_hours) as row_data(
    weekday smallint, open_time time, close_time time, is_closed boolean
  )
  on conflict (salon_id, weekday) do update set
    open_time = excluded.open_time,
    close_time = excluded.close_time,
    is_closed = excluded.is_closed,
    updated_at = now();
end;
$$;

revoke all on function public.replace_salon_weekly_hours(uuid, jsonb) from public;
grant execute on function public.replace_salon_weekly_hours(uuid, jsonb) to authenticated;

create or replace function public.update_salon_staff_profile(
  p_salon_id uuid,
  p_staff_id uuid,
  p_name text,
  p_short_name text,
  p_display_color text,
  p_sort_order integer,
  p_is_active boolean,
  p_accepts_online_bookings boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_name is null or p_short_name is null or p_display_color is null
    or p_sort_order is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 50
    or length(trim(p_short_name)) < 1 or length(trim(p_short_name)) > 12
    or p_display_color !~ '^#[0-9A-Fa-f]{6}$'
    or p_sort_order < 0
    or p_is_active is null
    or p_accepts_online_bookings is null then
    raise exception 'INVALID_STAFF_PROFILE';
  end if;

  update public.salon_staff staff
  set name = trim(p_name), short_name = trim(p_short_name),
    display_color = lower(p_display_color), sort_order = p_sort_order,
    is_active = p_is_active,
    accepts_online_bookings = p_accepts_online_bookings,
    updated_at = now()
  where staff.id = p_staff_id and staff.salon_id = p_salon_id;

  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_salon_staff_profile(uuid, uuid, text, text, text, integer, boolean, boolean) from public;
grant execute on function public.update_salon_staff_profile(uuid, uuid, text, text, text, integer, boolean, boolean) to authenticated;

create or replace function public.replace_staff_services(
  p_salon_id uuid,
  p_staff_id uuid,
  p_service_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists (
    select 1 from public.salon_staff staff
    where staff.id = p_staff_id and staff.salon_id = p_salon_id
  ) then raise exception 'STAFF_NOT_FOUND'; end if;

  if coalesce(cardinality(p_service_ids), 0) <> (
    select count(distinct requested.id)
    from unnest(coalesce(p_service_ids, '{}'::text[])) requested(id)
  ) then raise exception 'DUPLICATE_SERVICE_ASSIGNMENT'; end if;

  if exists (
    select 1 from unnest(coalesce(p_service_ids, '{}'::text[])) requested(id)
    where not exists (
      select 1 from public.services service
      where service.id = requested.id and service.salon_id = p_salon_id
    )
  ) then raise exception 'SERVICE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text || ':staff-services', 0));

  delete from public.staff_services capability
  where capability.salon_id = p_salon_id
    and capability.staff_id = p_staff_id
    and not (capability.service_id = any(coalesce(p_service_ids, '{}'::text[])));

  insert into public.staff_services (
    salon_id, staff_id, service_id, is_active, accepts_online_bookings, updated_at
  )
  select p_salon_id, p_staff_id, requested.id, true, true, now()
  from unnest(coalesce(p_service_ids, '{}'::text[])) requested(id)
  on conflict (staff_id, service_id) do update set
    is_active = true,
    updated_at = now();

  if exists (
    select 1
    from public.services service
    where service.salon_id = p_salon_id and service.is_active
      and not exists (
        select 1
        from public.staff_services capability
        join public.salon_staff staff on staff.id = capability.staff_id
        where capability.salon_id = p_salon_id
          and capability.service_id = service.id
          and capability.is_active
          and staff.is_active
      )
  ) then raise exception 'ACTIVE_SERVICE_REQUIRES_STAFF'; end if;
end;
$$;

revoke all on function public.replace_staff_services(uuid, uuid, text[]) from public;
grant execute on function public.replace_staff_services(uuid, uuid, text[]) to authenticated;

create or replace function public.save_service_category(
  p_salon_id uuid,
  p_category_id uuid,
  p_name text,
  p_name_en text,
  p_name_zh text,
  p_short_name text,
  p_is_active boolean
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
    or p_is_active is null then
    raise exception 'INVALID_CATEGORY';
  end if;

  if p_category_id is null then
    v_legacy_key := 'category_' || left(replace(v_category_id::text, '-', ''), 12);
    select coalesce(max(category.sort_order), 0) + 10 into v_sort_order
    from public.service_categories category where category.salon_id = p_salon_id;
    insert into public.service_categories (
      id, salon_id, legacy_key, name, name_en, name_zh,
      short_name, sort_order, is_active
    ) values (
      v_category_id, p_salon_id, v_legacy_key, trim(p_name),
      nullif(trim(coalesce(p_name_en, '')), ''),
      nullif(trim(coalesce(p_name_zh, '')), ''),
      trim(p_short_name), v_sort_order, p_is_active
    );
  else
    update public.service_categories category
    set name = trim(p_name),
      name_en = nullif(trim(coalesce(p_name_en, '')), ''),
      name_zh = nullif(trim(coalesce(p_name_zh, '')), ''),
      short_name = trim(p_short_name), is_active = p_is_active,
      updated_at = now()
    where category.id = p_category_id and category.salon_id = p_salon_id;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  end if;

  update public.services service
  set category_name_en = nullif(trim(coalesce(p_name_en, '')), ''),
    category_name_zh = nullif(trim(coalesce(p_name_zh, '')), '')
  where service.salon_id = p_salon_id and service.category_id = v_category_id;

  return v_category_id;
end;
$$;

revoke all on function public.save_service_category(uuid, uuid, text, text, text, text, boolean) from public;
grant execute on function public.save_service_category(uuid, uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.save_salon_service(
  p_salon_id uuid,
  p_service_id text,
  p_category_id uuid,
  p_name text,
  p_name_en text,
  p_name_zh text,
  p_short_name text,
  p_duration_minutes integer,
  p_booked_slots smallint[],
  p_price numeric,
  p_price_from boolean,
  p_slot_color text,
  p_is_active boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_id text := nullif(trim(coalesce(p_service_id, '')), '');
  v_salon_slug text;
  v_category public.service_categories;
  v_sort_order integer;
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select salon.slug into v_salon_slug from public.salons salon where salon.id = p_salon_id;
  select category.* into v_category
  from public.service_categories category
  where category.id = p_category_id and category.salon_id = p_salon_id;
  if v_salon_slug is null then raise exception 'SALON_NOT_FOUND'; end if;
  if v_category.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;

  if p_name is null or p_short_name is null or p_duration_minutes is null
    or p_booked_slots is null or p_slot_color is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 80
    or length(trim(p_short_name)) < 1 or length(trim(p_short_name)) > 12
    or length(trim(coalesce(p_name_en, ''))) > 80
    or length(trim(coalesce(p_name_zh, ''))) > 80
    or p_duration_minutes < 30 or p_duration_minutes > 480 or p_duration_minutes % 30 <> 0
    or p_price is null or p_price < 0
    or p_price_from is null
    or p_is_active is null
    or p_slot_color !~ '^#[0-9A-Fa-f]{6}$'
    or coalesce(cardinality(p_booked_slots), 0) = 0
    or p_booked_slots[1] < 1
    or p_booked_slots[cardinality(p_booked_slots)] > p_duration_minutes / 30
    or exists (
      select 1 from unnest(p_booked_slots) requested(slot_number)
      where requested.slot_number is null
    ) then
    raise exception 'INVALID_SERVICE';
  end if;
  if cardinality(p_booked_slots) <> (
    select count(distinct requested.slot_number)
    from unnest(p_booked_slots) requested(slot_number)
  ) then raise exception 'INVALID_SERVICE_SLOTS'; end if;

  if v_service_id is null then
    v_service_id := v_salon_slug || '_' || left(replace(gen_random_uuid()::text, '-', ''), 16);
    select coalesce(max(service.sort_order), 0) + 10 into v_sort_order
    from public.services service where service.salon_id = p_salon_id and service.category_id = p_category_id;
    insert into public.services (
      id, salon_id, category_id, category, name, name_en, name_zh,
      category_name_en, category_name_zh, short_name, duration_minutes,
      booked_slots, price, price_from, slot_color, sort_order, is_active
    ) values (
      v_service_id, p_salon_id, p_category_id, v_category.legacy_key,
      trim(p_name), nullif(trim(coalesce(p_name_en, '')), ''),
      nullif(trim(coalesce(p_name_zh, '')), ''), v_category.name_en,
      v_category.name_zh, trim(p_short_name), p_duration_minutes,
      p_booked_slots, p_price, p_price_from, lower(p_slot_color),
      v_sort_order, p_is_active
    );
  else
    update public.services service
    set category_id = p_category_id, category = v_category.legacy_key,
      name = trim(p_name), name_en = nullif(trim(coalesce(p_name_en, '')), ''),
      name_zh = nullif(trim(coalesce(p_name_zh, '')), ''),
      category_name_en = v_category.name_en, category_name_zh = v_category.name_zh,
      short_name = trim(p_short_name), duration_minutes = p_duration_minutes,
      booked_slots = p_booked_slots, price = p_price,
      price_from = p_price_from, slot_color = lower(p_slot_color),
      is_active = p_is_active
    where service.id = v_service_id and service.salon_id = p_salon_id;
    if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  end if;

  return v_service_id;
end;
$$;

revoke all on function public.save_salon_service(uuid, text, uuid, text, text, text, text, integer, smallint[], numeric, boolean, text, boolean) from public;
grant execute on function public.save_salon_service(uuid, text, uuid, text, text, text, text, integer, smallint[], numeric, boolean, text, boolean) to authenticated;

create or replace function public.archive_salon_service(
  p_salon_id uuid,
  p_service_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.services service set is_active = false
  where service.id = p_service_id and service.salon_id = p_salon_id;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.archive_salon_service(uuid, text) from public;
grant execute on function public.archive_salon_service(uuid, text) to authenticated;

create or replace function public.archive_service_category(
  p_salon_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_salon(p_salon_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if exists (
    select 1 from public.services service
    where service.salon_id = p_salon_id
      and service.category_id = p_category_id
      and service.is_active
  ) then raise exception 'CATEGORY_HAS_ACTIVE_SERVICES'; end if;

  update public.service_categories category set is_active = false, updated_at = now()
  where category.id = p_category_id and category.salon_id = p_salon_id;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.archive_service_category(uuid, uuid) from public;
grant execute on function public.archive_service_category(uuid, uuid) to authenticated;

create or replace function public.reorder_service_catalog(
  p_salon_id uuid,
  p_category_ids uuid[],
  p_service_ids text[]
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
    ) then raise exception 'CATALOG_ORDER_MUST_BE_COMPLETE'; end if;
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
  set sort_order = ordered.ordinality * 10
  from unnest(p_service_ids) with ordinality ordered(id, ordinality)
  where service.id = ordered.id and service.salon_id = p_salon_id;
end;
$$;

revoke all on function public.reorder_service_catalog(uuid, uuid[], text[]) from public;
grant execute on function public.reorder_service_catalog(uuid, uuid[], text[]) to authenticated;

-- Settings writes go through the audited functions above. Table reads remain
-- available under RLS for Admin and Booking pages.
revoke insert, update, delete on table public.service_categories from authenticated;
revoke insert, update, delete on table public.services from authenticated;
revoke update on table public.salon_staff from authenticated;
revoke insert, update, delete on table public.staff_services from authenticated;
revoke insert, update, delete on table public.salon_weekly_hours from authenticated;

comment on function public.get_settings_snapshot(text) is
  'Returns one salon-scoped Settings payload, including inactive configuration rows.';
comment on function public.reorder_service_catalog(uuid, uuid[], text[]) is
  'Atomically saves complete category and service ordering for one salon.';

commit;

notify pgrst, 'reload schema';
