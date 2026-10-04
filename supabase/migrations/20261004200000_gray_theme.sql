begin;

alter table public.salons
  drop constraint if exists salons_theme_preset_check;

alter table public.salons
  add constraint salons_theme_preset_check
    check (theme_preset in ('lime', 'pink', 'glacier', 'gray'));

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
  if p_theme_preset not in ('lime', 'pink', 'glacier', 'gray') then raise exception 'INVALID_THEME'; end if;
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

commit;
