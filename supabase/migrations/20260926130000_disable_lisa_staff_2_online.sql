begin;

update public.salon_staff staff
set accepts_online_bookings = false,
    updated_at = now()
from public.salons salon
where salon.id = staff.salon_id
  and salon.slug = 'lisa'
  and staff.staff_key = 'staff-2';

update public.staff_services capability
set accepts_online_bookings = false,
    updated_at = now()
from public.salon_staff staff
join public.salons salon on salon.id = staff.salon_id
where capability.staff_id = staff.id
  and capability.salon_id = salon.id
  and salon.slug = 'lisa'
  and staff.staff_key = 'staff-2';

commit;
