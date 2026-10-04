alter table public.salons
  add column if not exists admin_language text not null default 'de';

alter table public.salons
  drop constraint if exists salons_admin_language_check;

alter table public.salons
  add constraint salons_admin_language_check
  check (admin_language in ('de', 'en', 'zh'));

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
      'admin_language', v_salon.admin_language,
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

drop function if exists public.update_salon_settings(uuid, text, text, text, text, text[]);

create or replace function public.update_salon_settings(
  p_salon_id uuid,
  p_name text,
  p_address text,
  p_phone text,
  p_theme_preset text,
  p_admin_language text,
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
    or p_admin_language is null or p_languages is null
    or length(trim(p_name)) < 2 or length(trim(p_name)) > 80
    or length(trim(p_address)) < 3 or length(trim(p_address)) > 160
    or length(trim(p_phone)) < 3 or length(trim(p_phone)) > 40 then
    raise exception 'INVALID_SHOP_PROFILE';
  end if;
  if p_theme_preset not in ('lime', 'pink', 'glacier') then raise exception 'INVALID_THEME'; end if;
  if p_admin_language not in ('de', 'en', 'zh') then raise exception 'INVALID_ADMIN_LANGUAGE'; end if;
  if cardinality(p_languages) <> 3
    or not ('de' = any(p_languages) and 'en' = any(p_languages) and 'zh' = any(p_languages)) then
    raise exception 'INVALID_LANGUAGES';
  end if;

  update public.salons salon
  set name = trim(p_name), address = trim(p_address), phone = trim(p_phone),
    theme_preset = p_theme_preset, admin_language = p_admin_language, languages = p_languages
  where salon.id = p_salon_id;

  if not found then raise exception 'SALON_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_salon_settings(uuid, text, text, text, text, text, text[]) from public;
grant execute on function public.update_salon_settings(uuid, text, text, text, text, text, text[]) to authenticated;

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
declare
  v_admin_language text;
begin
  select salon.admin_language into v_admin_language
  from public.salons salon
  where salon.id = p_salon_id;

  perform public.update_salon_settings(
    p_salon_id,
    p_name,
    p_address,
    p_phone,
    p_theme_preset,
    coalesce(v_admin_language, 'de'),
    p_languages
  );
end;
$$;

revoke all on function public.update_salon_settings(uuid, text, text, text, text, text[]) from public;
grant execute on function public.update_salon_settings(uuid, text, text, text, text, text[]) to authenticated;

comment on column public.salons.admin_language is
  'Preferred language for the salon administration and settings interfaces.';
