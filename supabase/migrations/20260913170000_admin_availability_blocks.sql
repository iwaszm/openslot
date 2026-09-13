-- Global day and time-range availability controls for salon administrators.

create table if not exists public.admin_time_blocks (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  block_range int4range generated always as (
    int4range(public.time_to_minutes(start_time), public.time_to_minutes(end_time), '[)')
  ) stored,
  check (end_time > start_time),
  check (public.time_to_minutes(start_time) % 30 = 0),
  check (public.time_to_minutes(end_time) % 30 = 0)
);

create index if not exists admin_time_blocks_day_idx
  on public.admin_time_blocks (salon_id, block_date, start_time);

alter table public.admin_time_blocks
  drop constraint if exists admin_time_blocks_no_overlap;

alter table public.admin_time_blocks
  add constraint admin_time_blocks_no_overlap
  exclude using gist (
    salon_id with =,
    block_date with =,
    block_range with &&
  );

alter table public.admin_time_blocks enable row level security;

drop policy if exists "Salon members can read time blocks" on public.admin_time_blocks;
create policy "Salon members can read time blocks"
  on public.admin_time_blocks for select
  to authenticated
  using (
    exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = admin_time_blocks.salon_id)
    )
  );

drop policy if exists "Salon members can manage time blocks" on public.admin_time_blocks;
create policy "Salon members can manage time blocks"
  on public.admin_time_blocks for all
  to authenticated
  using (
    exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = admin_time_blocks.salon_id)
    )
  )
  with check (
    exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = admin_time_blocks.salon_id)
    )
  );

create or replace function public.admin_time_block_slots(
  p_start_time time,
  p_end_time time
)
returns time[]
language sql
immutable
strict
set search_path = public
as $$
  select coalesce(
    array_agg((p_start_time + make_interval(mins => offset_minutes))::time order by offset_minutes),
    '{}'::time[]
  )
  from generate_series(
    0,
    greatest(0, public.time_to_minutes(p_end_time) - public.time_to_minutes(p_start_time) - 30),
    30
  ) as offset_minutes;
$$;

revoke all on function public.admin_time_block_slots(time, time) from public;

create or replace function public.assert_entry_outside_admin_time_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.entry_source in ('online', 'manual') then
    perform pg_advisory_xact_lock(
      hashtextextended(new.salon_id::text || ':' || new.schedule_date::text, 0)
    );

    if exists (
      select 1
      from public.admin_time_blocks block
      where block.salon_id = new.salon_id
        and block.block_date = new.schedule_date
        and public.admin_time_block_slots(block.start_time, block.end_time) && new.occupied_slots
    ) then
      raise exception 'TIME_RANGE_BLOCKED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists schedule_entries_reject_admin_time_block on public.schedule_entries;
create trigger schedule_entries_reject_admin_time_block
before insert or update of salon_id, schedule_date, occupied_slots, entry_source, status
on public.schedule_entries
for each row execute function public.assert_entry_outside_admin_time_blocks();

create or replace function public.assert_appointment_outside_admin_time_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cancelled' then
    perform pg_advisory_xact_lock(
      hashtextextended(new.salon_id::text || ':' || new.appointment_date::text, 0)
    );

    if exists (
      select 1
      from public.admin_time_blocks block
      where block.salon_id = new.salon_id
        and block.block_date = new.appointment_date
        and public.admin_time_block_slots(block.start_time, block.end_time) && new.occupied_slots
    ) then
      raise exception 'TIME_RANGE_BLOCKED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_reject_admin_time_block on public.appointments;
create trigger appointments_reject_admin_time_block
before insert or update of salon_id, appointment_date, occupied_slots, status
on public.appointments
for each row execute function public.assert_appointment_outside_admin_time_blocks();

create or replace function public.create_admin_time_block(
  p_salon_id uuid,
  p_block_date date,
  p_start_time time,
  p_end_time time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block_id uuid := gen_random_uuid();
  v_open_time time := time '10:00';
  v_close_time time := time '18:00';
  v_blocked_day boolean := false;
  v_slots time[];
begin
  if not exists (
    select 1 from public.salon_members sm
    where sm.user_id = auth.uid()
      and (sm.role = 'super_admin' or sm.salon_id = p_salon_id)
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select settings.open_time, settings.close_time, settings.is_blocked_day
    into v_open_time, v_close_time, v_blocked_day
  from public.shop_day_settings settings
  where settings.salon_id = p_salon_id
    and settings.setting_date = p_block_date;

  if not found then
    v_close_time := case when extract(dow from p_block_date) = 6 then time '17:00' else time '18:00' end;
    v_blocked_day := extract(dow from p_block_date) = 0;
  end if;

  if v_blocked_day then raise exception 'DAY_ALREADY_BLOCKED'; end if;
  if p_end_time <= p_start_time
    or public.time_to_minutes(p_start_time) % 30 <> 0
    or public.time_to_minutes(p_end_time) % 30 <> 0
    or p_start_time < v_open_time
    or p_end_time > v_close_time then
    raise exception 'INVALID_BLOCK_RANGE';
  end if;

  v_slots := public.admin_time_block_slots(p_start_time, p_end_time);
  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text || ':' || p_block_date::text, 0));

  if exists (
    select 1
    from public.schedule_entries entry
    where entry.salon_id = p_salon_id
      and entry.schedule_date = p_block_date
      and entry.status = 'active'
      and entry.entry_source in ('online', 'manual')
      and entry.occupied_slots && v_slots
  ) then
    raise exception 'OCCUPIED_SLOTS_PRESENT';
  end if;

  if exists (
    select 1
    from public.admin_time_blocks block
    where block.salon_id = p_salon_id
      and block.block_date = p_block_date
      and block.block_range && int4range(
        public.time_to_minutes(p_start_time),
        public.time_to_minutes(p_end_time),
        '[)'
      )
  ) then
    raise exception 'TIME_BLOCK_OVERLAP';
  end if;

  insert into public.admin_time_blocks (
    id, salon_id, block_date, start_time, end_time, created_by
  ) values (
    v_block_id, p_salon_id, p_block_date, p_start_time, p_end_time, auth.uid()
  );

  return v_block_id;
end;
$$;

revoke all on function public.create_admin_time_block(uuid, date, time, time) from public;
grant execute on function public.create_admin_time_block(uuid, date, time, time) to authenticated;

create or replace function public.delete_admin_time_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.admin_time_blocks block
  where block.id = p_block_id
    and exists (
      select 1 from public.salon_members sm
      where sm.user_id = auth.uid()
        and (sm.role = 'super_admin' or sm.salon_id = block.salon_id)
    );

  if not found then raise exception 'TIME_BLOCK_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.delete_admin_time_block(uuid) from public;
grant execute on function public.delete_admin_time_block(uuid) to authenticated;

create or replace function public.set_admin_day_block(
  p_salon_id uuid,
  p_block_date date,
  p_is_blocked boolean,
  p_open_time time,
  p_close_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.salon_members sm
    where sm.user_id = auth.uid()
      and (sm.role = 'super_admin' or sm.salon_id = p_salon_id)
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_close_time <= p_open_time then raise exception 'INVALID_OPENING_HOURS'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text || ':' || p_block_date::text, 0));

  if p_is_blocked and exists (
    select 1
    from public.schedule_entries entry
    where entry.salon_id = p_salon_id
      and entry.schedule_date = p_block_date
      and entry.status = 'active'
      and entry.entry_source in ('online', 'manual')
      and cardinality(entry.occupied_slots) > 0
  ) then
    raise exception 'OCCUPIED_SLOTS_PRESENT';
  end if;

  insert into public.shop_day_settings (
    salon_id, setting_date, open_time, close_time, is_blocked_day
  ) values (
    p_salon_id, p_block_date, p_open_time, p_close_time, p_is_blocked
  )
  on conflict (salon_id, setting_date) do update set
    open_time = excluded.open_time,
    close_time = excluded.close_time,
    is_blocked_day = excluded.is_blocked_day;
end;
$$;

revoke all on function public.set_admin_day_block(uuid, date, boolean, time, time) from public;
grant execute on function public.set_admin_day_block(uuid, date, boolean, time, time) to authenticated;

create or replace function public.get_public_occupied_slots(
  p_salon_slug text,
  p_appointment_date date
)
returns table (occupied_slots time[])
language sql
stable
security definer
set search_path = public
as $$
  select entry.occupied_slots
  from public.schedule_entries entry
  join public.salons salon on salon.id = entry.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active'
  union all
  select public.admin_time_block_slots(block.start_time, block.end_time)
  from public.admin_time_blocks block
  join public.salons salon on salon.id = block.salon_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and block.block_date = p_appointment_date;
$$;

revoke execute on function public.get_public_occupied_slots(text, date) from public;
grant execute on function public.get_public_occupied_slots(text, date) to anon, authenticated;

comment on table public.admin_time_blocks is
  'Global booking closures for a salon. They affect public availability without occupying a staff lane.';
