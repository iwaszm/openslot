drop policy if exists "public read services" on public.services;
drop policy if exists "public read appointments" on public.appointments;
drop policy if exists "public create customers" on public.customers;
drop policy if exists "owner read customers" on public.customers;
drop policy if exists "public create appointments" on public.appointments;
drop policy if exists "public cancel appointments" on public.appointments;
drop policy if exists "owner cancel appointments" on public.appointments;

create policy "public read services"
on public.services for select
to anon, authenticated
using (true);

create policy "public read appointments"
on public.appointments for select
to anon, authenticated
using (true);

create policy "owner read customers"
on public.customers for select
to authenticated
using (true);

create policy "owner cancel appointments"
on public.appointments for update
to authenticated
using (status <> 'cancelled')
with check (status = 'cancelled');
