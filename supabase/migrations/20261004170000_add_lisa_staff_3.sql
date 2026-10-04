-- Add Lisa's third calendar employee without online booking or service assignments.
-- Authentication remains intentionally unconfigured until a salon member is added later.
insert into public.salon_staff (
  salon_id,
  staff_key,
  name,
  short_name,
  display_color,
  sort_order,
  is_active,
  accepts_online_bookings
)
select
  salon.id,
  'staff-3',
  'Mitarbeiter 3',
  'M3',
  '#82D9FF',
  3,
  true,
  false
from public.salons salon
where salon.slug = 'lisa'
on conflict (salon_id, staff_key) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  display_color = excluded.display_color,
  sort_order = excluded.sort_order,
  is_active = true,
  accepts_online_bookings = false,
  updated_at = now();

select public.ensure_two_staff_lanes(staff.id)
from public.salon_staff staff
join public.salons salon on salon.id = staff.salon_id
where salon.slug = 'lisa'
  and staff.staff_key = 'staff-3';

-- No staff_services or salon_members rows are created for this employee.
