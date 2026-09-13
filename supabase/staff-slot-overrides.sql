create table if not exists public.staff_slot_overrides (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_key text not null check (staff_key in ('overflow', 'flexible')),
  slot_date date not null,
  start_time time not null,
  service_id text,
  service_start_time time,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, staff_key, slot_date, start_time)
);

create index if not exists staff_slot_overrides_schedule_idx
  on public.staff_slot_overrides (salon_id, staff_key, slot_date, start_time);

alter table public.staff_slot_overrides enable row level security;

drop policy if exists "Salon members can manage staff slot overrides" on public.staff_slot_overrides;
create policy "Salon members can manage staff slot overrides"
  on public.staff_slot_overrides
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.salon_members
      where salon_members.salon_id = staff_slot_overrides.salon_id
        and salon_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.salon_members
      where salon_members.salon_id = staff_slot_overrides.salon_id
        and salon_members.user_id = auth.uid()
    )
  );
