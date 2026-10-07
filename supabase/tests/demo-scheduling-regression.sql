-- Transactional regression tests for the production scheduling model.
-- The demo salon is used as realistic fixture data. Every write is rolled back.

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'TEST_FAILED: %', message;
  end if;
end;
$$;

do $$
declare
  v_salon_id uuid;
  v_service_id text;
  v_service_name text;
  v_date date;
  v_covered_date date;
  v_blocked_date date;
  v_open time;
  v_close time;
  v_start time;
  v_covered_start time;
  v_covered_end time;
  v_candidate date;
  v_blocked boolean;
  v_appointment_1 uuid;
  v_appointment_2 uuid;
  v_failed boolean;
  v_staff_count integer;
  v_event_count integer;
  v_snapshot jsonb;
  v_lane_ids uuid[];
begin
  select salon.id into strict v_salon_id
  from public.salons salon
  where salon.slug = 'demo' and salon.is_active;

  select service.id, service.name
    into strict v_service_id, v_service_name
  from public.services service
  join public.service_categories category
    on category.id = service.category_id and category.salon_id = service.salon_id
  join public.staff_services capability
    on capability.salon_id = service.salon_id and capability.service_id = service.id
  join public.salon_staff staff on staff.id = capability.staff_id
  where service.salon_id = v_salon_id
    and service.is_active and service.accepts_online_bookings
    and category.is_active and category.accepts_online_bookings
    and capability.is_active and capability.accepts_online_bookings
    and staff.is_active and staff.accepts_online_bookings
    and service.duration_minutes = 30
  group by service.id, service.name, service.sort_order
  having count(distinct staff.id) >= 2
  order by service.sort_order, service.id
  limit 1;

  -- Find three clean open days well outside the normal demo horizon.
  for v_candidate in
    select day::date
    from generate_series(current_date + 400, current_date + 520, interval '1 day') day
    order by day
  loop
    select settings.open_time, settings.close_time, settings.is_blocked_day
      into v_open, v_close, v_blocked
    from public.get_effective_day_settings('demo', v_candidate) settings;

    if coalesce(v_blocked, true)
       or v_open is null
       or v_close is null
       or public.time_to_minutes(v_close) - public.time_to_minutes(v_open) < 150
       or exists (
         select 1 from public.schedule_entries entry
         where entry.salon_id = v_salon_id and entry.schedule_date = v_candidate
       )
       or exists (
         select 1 from public.admin_time_blocks block
         where block.salon_id = v_salon_id and block.block_date = v_candidate
       ) then
      continue;
    end if;

    if v_date is null then
      v_date := v_candidate;
      v_start := (
        time '00:00' +
        (ceil(public.time_to_minutes(v_open)::numeric / 30) * 30)::integer * interval '1 minute'
      )::time;
    elsif v_covered_date is null then
      v_covered_date := v_candidate;
    elsif v_blocked_date is null then
      v_blocked_date := v_candidate;
      exit;
    end if;
  end loop;

  perform pg_temp.assert_true(
    v_date is not null and v_covered_date is not null and v_blocked_date is not null,
    'three clean future demo dates are required'
  );

  -- Two unspecified bookings at the same time must be balanced across the two
  -- qualified online employees. A third booking must be rejected.
  v_appointment_1 := public.create_public_booking_core(
    'demo', v_service_id, v_date, v_start, 'female',
    'Regression One', '+490000000001', 'regression-one@example.invalid', null
  );
  v_appointment_2 := public.create_public_booking_core(
    'demo', v_service_id, v_date, v_start, 'male',
    'Regression Two', '+490000000002', 'regression-two@example.invalid', null
  );

  select count(distinct entry.staff_id)
    into v_staff_count
  from public.schedule_entries entry
  where entry.appointment_id in (v_appointment_1, v_appointment_2)
    and entry.status = 'active';
  perform pg_temp.assert_true(v_staff_count = 2, 'same-time bookings were not split across employees');

  v_failed := false;
  begin
    perform public.create_public_booking_core(
      'demo', v_service_id, v_date, v_start, 'female',
      'Regression Three', '+490000000003', 'regression-three@example.invalid', null
    );
  exception when others then
    v_failed := sqlerrm like '%No qualified staff lane%';
  end;
  perform pg_temp.assert_true(v_failed, 'third same-time booking should be rejected');

  -- Appointment creation must atomically freeze the service and enqueue one email.
  select appointment.service_snapshot
    into v_snapshot
  from public.appointments appointment
  where appointment.id = v_appointment_1;
  perform pg_temp.assert_true(
    v_snapshot->>'name' = v_service_name,
    'appointment service snapshot was not created'
  );

  select count(*) into v_event_count
  from public.email_events event
  where event.booking_id = v_appointment_1
    and event.event_type = 'booking_created_customer'
    and event.status = 'pending';
  perform pg_temp.assert_true(v_event_count = 1, 'booking confirmation outbox event is missing or duplicated');

  update public.services set name = name || ' TEST' where id = v_service_id;
  perform pg_temp.assert_true(
    (select service_snapshot->>'name' from public.appointments where id = v_appointment_1) = v_service_name,
    'an existing appointment snapshot changed with the service catalog'
  );

  update public.appointments set status = 'cancelled' where id = v_appointment_1;
  update public.appointments set status = 'cancelled' where id = v_appointment_1;
  select count(*) into v_event_count
  from public.email_events event
  where event.booking_id = v_appointment_1
    and event.event_type = 'booking_cancelled_customer';
  perform pg_temp.assert_true(v_event_count = 1, 'cancellation outbox event is missing or duplicated');

  -- Both lanes covered at the requested time must reject a booking even when
  -- the requested occupied slot itself is not marked occupied.
  select array_agg(lane.id order by lane.sort_order)
    into v_lane_ids
  from public.staff_lanes lane
  join public.salon_staff staff on staff.id = lane.staff_id
  where staff.salon_id = v_salon_id
    and staff.staff_key = 'default'
    and staff.is_active and staff.accepts_online_bookings
    and lane.is_active;
  perform pg_temp.assert_true(cardinality(v_lane_ids) = 2, 'demo default employee must have two active lanes');

  select settings.open_time into v_open
  from public.get_effective_day_settings('demo', v_covered_date) settings;
  v_covered_start := (
    time '00:00' +
    (ceil(public.time_to_minutes(v_open)::numeric / 30) * 30)::integer * interval '1 minute'
  )::time;
  v_start := (v_covered_start + interval '30 minutes')::time;
  v_covered_end := (v_covered_start + interval '120 minutes')::time;

  insert into public.schedule_entries (
    salon_id, staff_id, staff_lane_id, service_id, entry_source,
    schedule_date, covered_start, covered_end, occupied_slots
  )
  select
    v_salon_id, lane.staff_id, lane.id, v_service_id, 'manual',
    v_covered_date, v_covered_start, v_covered_end,
    array[v_covered_start, (v_covered_start + interval '90 minutes')::time]
  from public.staff_lanes lane
  where lane.id = any(v_lane_ids);

  v_failed := false;
  begin
    perform public.create_public_booking_core(
      'demo', v_service_id, v_covered_date, v_start, 'female',
      'Covered Regression', '+490000000004', 'covered-regression@example.invalid', 'default'
    );
  exception when others then
    v_failed := sqlerrm like '%No qualified staff lane%';
  end;
  perform pg_temp.assert_true(v_failed, 'two covered lanes should reject the middle slot');

  -- A global time block must reject every employee.
  select settings.open_time into v_open
  from public.get_effective_day_settings('demo', v_blocked_date) settings;
  v_start := (
    time '00:00' +
    (ceil(public.time_to_minutes(v_open)::numeric / 30) * 30)::integer * interval '1 minute'
  )::time;
  insert into public.admin_time_blocks (
    salon_id, staff_id, block_date, start_time, end_time
  ) values (
    v_salon_id, null, v_blocked_date, v_start, (v_start + interval '30 minutes')::time
  );

  v_failed := false;
  begin
    perform public.create_public_booking_core(
      'demo', v_service_id, v_blocked_date, v_start, 'male',
      'Block Regression', '+490000000005', 'block-regression@example.invalid', null
    );
  exception when others then
    v_failed := sqlerrm like '%blocked time%';
  end;
  perform pg_temp.assert_true(v_failed, 'global time block should reject public booking');

  raise notice 'PASS: demo scheduling regression suite';
end;
$$;

rollback;
