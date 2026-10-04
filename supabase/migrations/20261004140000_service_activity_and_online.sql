begin;

-- A service can remain available for manual scheduling while being hidden from
-- and rejected by the public booking flow.
alter table public.services
  add column if not exists accepts_online_bookings boolean not null default true;

comment on column public.services.accepts_online_bookings is
  'True when customers may book this active service online. False keeps it available for manual scheduling only.';

-- Before this migration is_active=false represented an offline-only service in
-- Settings. Preserve that intent, then reserve is_active for archiving.
update public.services
set accepts_online_bookings = false
where is_active = false;

update public.services
set is_active = true
where is_active = false;

drop policy if exists "public read active services" on public.services;
drop policy if exists "public read active online services" on public.services;
create policy "public read active online services"
  on public.services for select to anon, authenticated
  using (
    is_active and accepts_online_bookings and exists (
      select 1 from public.salons salon
      where salon.id = services.salon_id and salon.is_active = true
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
  join public.salons salon on salon.id = capability.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active
    and staff.is_active
    and staff.accepts_online_bookings
    and service.is_active
    and service.accepts_online_bookings
    and capability.is_active
    and capability.accepts_online_bookings;
$$;

revoke all on function public.get_public_staff_services(text) from public;
grant execute on function public.get_public_staff_services(text) to anon, authenticated;

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
        'is_active', service.is_active,
        'accepts_online_bookings', service.accepts_online_bookings
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
  p_is_active boolean,
  p_accepts_online_bookings boolean
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
    or p_accepts_online_bookings is null
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
      booked_slots, price, price_from, slot_color, sort_order, is_active,
      accepts_online_bookings
    ) values (
      v_service_id, p_salon_id, p_category_id, v_category.legacy_key,
      trim(p_name), nullif(trim(coalesce(p_name_en, '')), ''),
      nullif(trim(coalesce(p_name_zh, '')), ''), v_category.name_en,
      v_category.name_zh, trim(p_short_name), p_duration_minutes,
      p_booked_slots, p_price, p_price_from, lower(p_slot_color),
      v_sort_order, p_is_active, p_accepts_online_bookings
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
      is_active = p_is_active,
      accepts_online_bookings = p_accepts_online_bookings
    where service.id = v_service_id and service.salon_id = p_salon_id;
    if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  end if;

  return v_service_id;
end;
$$;

revoke all on function public.save_salon_service(uuid, text, uuid, text, text, text, text, integer, smallint[], numeric, boolean, text, boolean, boolean) from public;
grant execute on function public.save_salon_service(uuid, text, uuid, text, text, text, text, integer, smallint[], numeric, boolean, text, boolean, boolean) to authenticated;

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
    where service.id = new.service_id
      and service.salon_id = new.salon_id
      and service.is_active
      and service.accepts_online_bookings
  ) then
    raise exception 'SERVICE_NOT_AVAILABLE_ONLINE';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_require_online_service on public.appointments;
create trigger appointments_require_online_service
before insert on public.appointments
for each row execute function public.assert_appointment_service_accepts_online();

notify pgrst, 'reload schema';

commit;
