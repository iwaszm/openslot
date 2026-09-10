-- Restrict appointment details to salon members. Public booking pages receive
-- only the occupied 30-minute slots needed to calculate availability.

create or replace function public.get_public_occupied_slots(
  p_salon_slug text,
  p_appointment_date date
)
returns table (occupied_slots time[])
language sql
stable
security definer
set search_path = ''
as $$
  select a.occupied_slots
  from public.appointments a
  join public.salons s on s.id = a.salon_id
  where s.slug = p_salon_slug
    and s.is_active = true
    and a.appointment_date = p_appointment_date
    and a.status <> 'cancelled';
$$;

revoke execute on function public.get_public_occupied_slots(text, date) from public;
grant execute on function public.get_public_occupied_slots(text, date) to anon, authenticated;

alter table public.appointments enable row level security;

drop policy if exists "public read appointments" on public.appointments;
drop policy if exists "members read own salon appointments" on public.appointments;
create policy "members read own salon appointments"
on public.appointments for select
to authenticated
using (
  exists (
    select 1
    from public.salon_members sm
    where sm.user_id = (select auth.uid())
      and (sm.role = 'super_admin' or sm.salon_id = appointments.salon_id)
  )
);
