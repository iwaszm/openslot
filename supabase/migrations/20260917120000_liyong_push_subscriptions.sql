begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint ~ '^https://'),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_salon_idx
  on public.push_subscriptions (salon_id);

create table if not exists public.booking_push_dispatches (
  booking_id uuid primary key references public.appointments(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

alter table public.booking_push_dispatches enable row level security;
revoke all on public.booking_push_dispatches from public;
revoke all on public.booking_push_dispatches from anon;
revoke all on public.booking_push_dispatches from authenticated;
grant insert on public.booking_push_dispatches to service_role;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public;
revoke all on public.push_subscriptions from anon;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, delete on public.push_subscriptions to service_role;

drop policy if exists "members read own push subscriptions" on public.push_subscriptions;
create policy "members read own push subscriptions"
on public.push_subscriptions for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.salon_members member
    where member.user_id = (select auth.uid())
      and (member.role = 'super_admin' or member.salon_id = push_subscriptions.salon_id)
  )
);

drop policy if exists "members add own push subscriptions" on public.push_subscriptions;
create policy "members add own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.salon_members member
    where member.user_id = (select auth.uid())
      and (member.role = 'super_admin' or member.salon_id = push_subscriptions.salon_id)
  )
);

drop policy if exists "members remove own push subscriptions" on public.push_subscriptions;
create policy "members remove own push subscriptions"
on public.push_subscriptions for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.salon_members member
    where member.user_id = (select auth.uid())
      and (member.role = 'super_admin' or member.salon_id = push_subscriptions.salon_id)
  )
);

commit;
