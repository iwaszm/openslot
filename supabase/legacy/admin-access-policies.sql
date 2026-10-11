-- Two-level administration:
--   super_admin: manages every salon
--   owner/manager: manages only salons listed in salon_members

alter table public.salon_members enable row level security;

drop policy if exists "authenticated read salon memberships" on public.salon_members;
drop policy if exists "users read own salon memberships" on public.salon_members;
create policy "users read own salon memberships"
on public.salon_members for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "owner read customers" on public.customers;
drop policy if exists "members read own salon customers" on public.customers;
create policy "members read own salon customers"
on public.customers for select
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = customers.salon_id)
  )
);

drop policy if exists "owner cancel appointments" on public.appointments;
drop policy if exists "members update own salon appointments" on public.appointments;
create policy "members update own salon appointments"
on public.appointments for update
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = appointments.salon_id)
  )
)
with check (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = appointments.salon_id)
  )
);

drop policy if exists "owner manage day settings" on public.shop_day_settings;
drop policy if exists "members manage own salon day settings" on public.shop_day_settings;
create policy "members manage own salon day settings"
on public.shop_day_settings for all
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = shop_day_settings.salon_id)
  )
)
with check (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = shop_day_settings.salon_id)
  )
);

drop policy if exists "owner manage blocked slots" on public.blocked_slots;
drop policy if exists "members manage own salon blocked slots" on public.blocked_slots;
create policy "members manage own salon blocked slots"
on public.blocked_slots for all
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = blocked_slots.salon_id)
  )
)
with check (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = blocked_slots.salon_id)
  )
);

-- Services are maintained in the Supabase dashboard, but browser-side writes
-- are still scoped here in case service editing returns later.
drop policy if exists "owner insert services" on public.services;
drop policy if exists "owner update services" on public.services;
drop policy if exists "members insert own salon services" on public.services;
drop policy if exists "members update own salon services" on public.services;
drop policy if exists "members delete own salon services" on public.services;

create policy "members insert own salon services"
on public.services for insert
to authenticated
with check (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = services.salon_id)
  )
);

create policy "members update own salon services"
on public.services for update
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = services.salon_id)
  )
)
with check (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = services.salon_id)
  )
);

create policy "members delete own salon services"
on public.services for delete
to authenticated
using (
  exists (
    select 1 from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = services.salon_id)
  )
);

-- Create both Auth users first, then replace the placeholder emails below.
-- A super_admin needs only one membership row because that role is global.
--
-- insert into public.salon_members (salon_id, user_id, role)
-- select s.id, u.id, 'super_admin'
-- from public.salons s cross join auth.users u
-- where s.slug = 'lisa' and lower(u.email) = lower('YOUR_ADMIN_EMAIL')
-- on conflict (salon_id, user_id) do update set role = excluded.role;
--
-- insert into public.salon_members (salon_id, user_id, role)
-- select s.id, u.id, 'owner'
-- from public.salons s cross join auth.users u
-- where s.slug = 'lisa' and lower(u.email) = lower('LISA_OWNER_EMAIL')
-- on conflict (salon_id, user_id) do update set role = excluded.role;
