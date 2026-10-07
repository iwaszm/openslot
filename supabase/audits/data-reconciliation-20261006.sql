-- Read-only verification of migration data effects in the linked project.
-- This intentionally excludes customer and authentication data.
with salon_summary as (
  select
    salon.id,
    salon.slug,
    salon.is_active,
    salon.theme_preset,
    salon.admin_language,
    salon.languages,
    count(distinct category.id) as category_count,
    count(distinct service.id) as service_count
  from public.salons salon
  left join public.service_categories category on category.salon_id = salon.id
  left join public.services service on service.salon_id = salon.id
  group by salon.id
),
staff_summary as (
  select
    salon.slug,
    staff.staff_key,
    staff.short_name,
    staff.sort_order,
    staff.is_active,
    staff.accepts_online_bookings,
    count(distinct lane.id) filter (where lane.is_active) as active_lane_count,
    count(distinct capability.service_id) filter (where capability.is_active) as active_service_count,
    count(distinct capability.service_id) filter (
      where capability.is_active and capability.accepts_online_bookings
    ) as online_service_count
  from public.salon_staff staff
  join public.salons salon on salon.id = staff.salon_id
  left join public.staff_lanes lane on lane.staff_id = staff.id
  left join public.staff_services capability on capability.staff_id = staff.id
  group by salon.slug, staff.id
),
cron_summary as (
  select jobname, schedule, command, active
  from cron.job
  where jobname in (
    'openslot-history-cleanup',
    'openslot-public-holidays-yearly'
  )
),
checks as (
  select jsonb_build_object(
    'expected_salons_present', not exists (
      select 1 from (values ('lisa'), ('demo')) expected(slug)
      where not exists (select 1 from public.salons salon where salon.slug = expected.slug)
    ),
    'legacy_liyong_absent', not exists (
      select 1 from public.salons where slug = 'liyong'
    ),
    'all_active_staff_have_two_active_lanes', not exists (
      select 1 from staff_summary where is_active and active_lane_count <> 2
    ),
    'lisa_staff_2_offline', exists (
      select 1 from staff_summary
      where slug = 'lisa' and staff_key = 'staff-2'
        and is_active and not accepts_online_bookings
    ),
    'lisa_staff_3_present_offline_unassigned', exists (
      select 1 from staff_summary
      where slug = 'lisa' and staff_key = 'staff-3'
        and is_active and not accepts_online_bookings
        and active_lane_count = 2 and active_service_count = 0
    ),
    'demo_default_and_tony_online', (
      select count(*) = 2
      from staff_summary
      where slug = 'demo' and staff_key in ('default', 'tony')
        and is_active and accepts_online_bookings and active_lane_count = 2
    ),
    'history_cleanup_cron_correct', exists (
      select 1 from cron_summary
      where jobname = 'openslot-history-cleanup'
        and schedule = '40 2 * * 0' and active
        and command like '%cleanup_openslot_history%'
    ),
    'holiday_cron_correct', exists (
      select 1 from cron_summary
      where jobname = 'openslot-public-holidays-yearly'
        and schedule = '15 2 2 1 *' and active
        and command like '%generate_berlin_public_holidays%'
    ),
    'berlin_holidays_cover_current_plus_two_years', (
      select count(distinct extract(year from holiday_date)) >= 3
      from public.public_holidays
      where region = 'DE-BE'
        and holiday_date >= date_trunc('year', current_date)::date
        and holiday_date < (date_trunc('year', current_date) + interval '3 years')::date
    )
  ) as result
)
select jsonb_build_object(
  'checks', checks.result,
  'salons', (select jsonb_agg(to_jsonb(salon_summary) - 'id' order by slug) from salon_summary),
  'staff', (select jsonb_agg(to_jsonb(staff_summary) order by slug, sort_order) from staff_summary),
  'cron_jobs', (select jsonb_agg(to_jsonb(cron_summary) order by jobname) from cron_summary)
) as reconciliation_report
from checks;
