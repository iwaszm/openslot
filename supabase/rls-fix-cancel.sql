drop policy if exists "public read appointments" on public.appointments;

create policy "public read appointments"
on public.appointments for select
to anon
using (true);
