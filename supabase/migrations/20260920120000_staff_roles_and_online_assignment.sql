-- Unify salon access and scheduling identities without exposing auth users publicly.
-- salon_members remains the authorization table; salon_staff remains the schedule resource.

begin;

alter table public.salon_staff
  add column if not exists accepts_online_bookings boolean not null default true;

alter table public.salon_members
  add column if not exists staff_id uuid references public.salon_staff(id) on delete set null;

alter table public.salon_members
  drop constraint if exists salon_members_role_check,
  drop constraint if exists salon_members_staff_link_check;

update public.salon_members set role = 'admin' where role = 'super_admin';
update public.salon_members set role = 'owner' where role = 'manager';

alter table public.salon_members
  add constraint salon_members_role_check check (role in ('admin', 'owner', 'staff')),
  add constraint salon_members_staff_link_check check (role <> 'staff' or staff_id is not null);

-- Keep legacy salon-scoped functions working during the transition by giving each
-- global admin a row for every existing salon. New policies use is_openslot_admin().
insert into public.salon_members (salon_id, user_id, role)
select salon.id, admin_user.user_id, 'admin'
from public.salons salon
cross join (
  select distinct user_id from public.salon_members where role = 'admin'
) admin_user
on conflict (salon_id, user_id) do update set role = 'admin', staff_id = null;

create unique index if not exists salon_members_staff_identity_idx
  on public.salon_members (staff_id)
  where staff_id is not null;

create index if not exists salon_members_user_access_idx
  on public.salon_members (user_id, salon_id, role);

create or replace function public.is_openslot_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salon_members member
    where member.user_id = auth.uid() and member.role = 'admin'
  );
$$;

create or replace function public.can_view_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salon_members member
    where member.user_id = auth.uid()
      and (member.role = 'admin' or member.salon_id = p_salon_id)
  );
$$;

create or replace function public.can_manage_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salon_members member
    where member.user_id = auth.uid()
      and (member.role = 'admin' or (member.role = 'owner' and member.salon_id = p_salon_id))
  );
$$;

create or replace function public.can_edit_staff_lane(p_salon_id uuid, p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.salon_members member
    where member.user_id = auth.uid()
      and (
        member.role = 'admin'
        or (member.role = 'owner' and member.salon_id = p_salon_id)
        or (member.role = 'staff' and member.salon_id = p_salon_id and member.staff_id = p_staff_id)
      )
  );
$$;

revoke all on function public.is_openslot_admin() from public;
revoke all on function public.can_view_salon(uuid) from public;
revoke all on function public.can_manage_salon(uuid) from public;
revoke all on function public.can_edit_staff_lane(uuid, uuid) from public;
grant execute on function public.is_openslot_admin() to authenticated;
grant execute on function public.can_view_salon(uuid) to authenticated;
grant execute on function public.can_manage_salon(uuid) to authenticated;
grant execute on function public.can_edit_staff_lane(uuid, uuid) to authenticated;

-- Lisa: employee 1 owns A/B and accepts online bookings. Employee 2 owns C/D
-- and is calendar-only until online booking is explicitly enabled.
insert into public.salon_staff (
  salon_id, staff_key, name, sort_order, is_active, accepts_online_bookings
)
select salon.id, 'staff-2', 'Mitarbeiter 2', 2, true, false
from public.salons salon
where salon.slug = 'lisa'
on conflict (salon_id, staff_key) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true,
  accepts_online_bookings = false,
  updated_at = now();

update public.salon_staff staff
set sort_order = 1, is_active = true, accepts_online_bookings = true, updated_at = now()
from public.salons salon
where staff.salon_id = salon.id
  and salon.slug = 'lisa'
  and staff.staff_key = 'default';

insert into public.staff_lanes (
  salon_id, staff_id, lane_key, label, sort_order, is_active
)
select salon.id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
from public.salons salon
join public.salon_staff staff
  on staff.salon_id = salon.id and staff.staff_key = 'default'
cross join lateral (values ('a', 'A', 1), ('b', 'B', 2)) lane(lane_key, label, sort_order)
where salon.slug = 'lisa'
on conflict (salon_id, lane_key) do update set
  staff_id = excluded.staff_id,
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.staff_lanes (
  salon_id, staff_id, lane_key, label, sort_order, is_active
)
select salon.id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
from public.salons salon
join public.salon_staff staff
  on staff.salon_id = salon.id and staff.staff_key = 'staff-2'
cross join lateral (values ('c', 'C', 1), ('d', 'D', 2)) lane(lane_key, label, sort_order)
where salon.slug = 'lisa'
on conflict (salon_id, lane_key) do update set
  staff_id = excluded.staff_id,
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- Keep the denormalized schedule_entries.staff_id consistent after lane C moves.
update public.schedule_entries entry
set staff_id = lane.staff_id, updated_at = now()
from public.staff_lanes lane
join public.salons salon on salon.id = lane.salon_id
where entry.staff_lane_id = lane.id
  and entry.staff_id <> lane.staff_id
  and salon.slug = 'lisa';

-- Membership rows are private. Public scheduling reads only the safe staff profile.
drop policy if exists "authenticated read salon memberships" on public.salon_members;
drop policy if exists "users read own salon memberships" on public.salon_members;
create policy "users read own salon memberships"
  on public.salon_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Public can read active salon staff" on public.salon_staff;
create policy "Public can read active salon staff"
  on public.salon_staff for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.salons salon
      where salon.id = salon_staff.salon_id and salon.is_active = true
    )
  );

drop policy if exists "Salon members can manage salon staff" on public.salon_staff;
drop policy if exists "Owners can manage salon staff" on public.salon_staff;
create policy "Owners can manage salon staff"
  on public.salon_staff for all to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

drop policy if exists "Salon members can manage staff lanes" on public.staff_lanes;
drop policy if exists "Owners can manage staff lanes" on public.staff_lanes;
create policy "Owners can manage staff lanes"
  on public.staff_lanes for all to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

drop policy if exists "Salon members can read schedule entries" on public.schedule_entries;
drop policy if exists "Salon roles can read schedule entries" on public.schedule_entries;
create policy "Salon roles can read schedule entries"
  on public.schedule_entries for select to authenticated
  using (public.can_view_salon(salon_id));

drop policy if exists "Salon members can manage schedule entries" on public.schedule_entries;
drop policy if exists "Salon roles can manage permitted schedule entries" on public.schedule_entries;
create policy "Salon roles can manage permitted schedule entries"
  on public.schedule_entries for all to authenticated
  using (
    entry_source <> 'online'
    and public.can_edit_staff_lane(salon_id, staff_id)
  )
  with check (
    entry_source <> 'online'
    and public.can_edit_staff_lane(salon_id, staff_id)
  );

-- Security-definer scheduling RPCs bypass RLS. This trigger applies the same
-- lane ownership rule to their manual/block inserts and updates.
create or replace function public.enforce_schedule_entry_staff_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.schedule_entries;
begin
  if tg_op = 'DELETE' then
    v_entry := old;
  else
    v_entry := new;
  end if;
  if auth.uid() is not null
     and v_entry.entry_source <> 'online'
     and not public.can_edit_staff_lane(v_entry.salon_id, v_entry.staff_id) then
    raise exception 'Not authorized for this staff lane';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists schedule_entries_staff_access_guard on public.schedule_entries;
create trigger schedule_entries_staff_access_guard
before insert or update or delete on public.schedule_entries
for each row execute function public.enforce_schedule_entry_staff_access();

-- Calendar users can see customer details for their salon. Appointment changes are
-- restricted to owners/admins, or to the staff member assigned by schedule_entries.
drop policy if exists "members read own salon customers" on public.customers;
drop policy if exists "Salon roles read salon customers" on public.customers;
create policy "Salon roles read salon customers"
  on public.customers for select to authenticated
  using (public.can_view_salon(salon_id));

drop policy if exists "members update own salon appointments" on public.appointments;
drop policy if exists "Salon roles update permitted appointments" on public.appointments;
create policy "Salon roles update permitted appointments"
  on public.appointments for update to authenticated
  using (
    public.can_manage_salon(salon_id)
    or exists (
      select 1 from public.schedule_entries entry
      where entry.appointment_id = appointments.id
        and public.can_edit_staff_lane(entry.salon_id, entry.staff_id)
    )
  )
  with check (
    public.can_manage_salon(salon_id)
    or exists (
      select 1 from public.schedule_entries entry
      where entry.appointment_id = appointments.id
        and public.can_edit_staff_lane(entry.salon_id, entry.staff_id)
    )
  );

-- Shop configuration remains owner/admin only.
drop policy if exists "members manage own salon day settings" on public.shop_day_settings;
drop policy if exists "Owners manage salon day settings" on public.shop_day_settings;
create policy "Owners manage salon day settings"
  on public.shop_day_settings for all to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));

drop policy if exists "members insert own salon services" on public.services;
drop policy if exists "members update own salon services" on public.services;
drop policy if exists "members delete own salon services" on public.services;
drop policy if exists "Owners insert salon services" on public.services;
drop policy if exists "Owners update salon services" on public.services;
drop policy if exists "Owners delete salon services" on public.services;
create policy "Owners insert salon services"
  on public.services for insert to authenticated
  with check (public.can_manage_salon(salon_id));
create policy "Owners update salon services"
  on public.services for update to authenticated
  using (public.can_manage_salon(salon_id))
  with check (public.can_manage_salon(salon_id));
create policy "Owners delete salon services"
  on public.services for delete to authenticated
  using (public.can_manage_salon(salon_id));

-- Public availability ignores staff members who do not accept online bookings.
create or replace function public.get_public_schedule(
  p_salon_slug text,
  p_appointment_date date
)
returns table (
  record_id text,
  staff_key text,
  lane_key text,
  covered_start time,
  covered_end time,
  occupied_slots time[],
  record_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  select entry.id::text, staff.staff_key, lane.lane_key,
    entry.covered_start, entry.covered_end, entry.occupied_slots, entry.entry_source
  from public.schedule_entries entry
  join public.salons salon on salon.id = entry.salon_id
  join public.salon_staff staff on staff.id = entry.staff_id
  join public.staff_lanes lane on lane.id = entry.staff_lane_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and staff.is_active = true
    and staff.accepts_online_bookings = true
    and lane.is_active = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active'
  order by staff.sort_order, lane.sort_order, entry.covered_start;
$$;

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
  join public.salon_staff staff on staff.id = entry.staff_id
  where salon.slug = p_salon_slug
    and salon.is_active = true
    and staff.is_active = true
    and staff.accepts_online_bookings = true
    and entry.schedule_date = p_appointment_date
    and entry.status = 'active';
$$;

-- Patch the current booking RPC in place so its lane search only considers online staff.
-- This keeps the deployed signature and all existing validation unchanged.
do $$
declare
  v_function regprocedure := to_regprocedure(
    'public.create_public_booking(text,text,date,time without time zone,text,text,text,text)'
  );
  v_definition text;
  v_search text := 'and staff.is_active = true' || chr(10) || '    and not exists (';
  v_replacement text := 'and staff.is_active = true' || chr(10)
    || '    and staff.accepts_online_bookings = true' || chr(10) || '    and not exists (';
begin
  if v_function is null then
    raise exception 'create_public_booking RPC was not found; run unified-schedule-entries.sql first';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  if position('staff.accepts_online_bookings = true' in v_definition) = 0 then
    if position(v_search in v_definition) = 0 then
      raise exception 'create_public_booking lane query has an unexpected shape';
    end if;
    execute replace(v_definition, v_search, v_replacement);
  end if;
end;
$$;

comment on column public.salon_staff.accepts_online_bookings is
  'When false, the employee remains visible to authenticated calendar users but is excluded from public availability and automatic online assignment.';
comment on column public.salon_members.staff_id is
  'Links a staff-role login to its scheduling identity. Required for role=staff; null for admin/owner.';

commit;

-- Verify after execution. A staff login can be linked later after creating its Auth user:
-- update public.salon_members member
-- set role = 'staff', staff_id = staff.id
-- from public.salon_staff staff
-- join public.salons salon on salon.id = staff.salon_id
-- where member.user_id = (select id from auth.users where lower(email) = lower('STAFF_EMAIL'))
--   and member.salon_id = salon.id and salon.slug = 'lisa' and staff.staff_key = 'staff-2';
