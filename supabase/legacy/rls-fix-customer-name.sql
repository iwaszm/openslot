drop policy if exists "public create customers" on public.customers;

create policy "public create customers"
on public.customers for insert
to anon
with check (
  length(trim(name)) between 2 and 120
  and trim(name) !~ '^[0-9]+$'
  and length(phone) between 3 and 80
  and email like '%@%'
  and gender in ('male', 'female')
);
