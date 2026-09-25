-- Return all data required to render one admin calendar day in one request.

create or replace function public.get_admin_day_snapshot(
  p_salon_slug text,
  p_schedule_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_salon_id uuid;
  v_day_settings jsonb;
begin
  select salon.id
    into v_salon_id
  from public.salons salon
  where salon.slug = p_salon_slug
    and salon.is_active = true;

  if v_salon_id is null then
    raise exception 'SALON_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_view_salon(v_salon_id) then
    raise exception 'SALON_ACCESS_DENIED' using errcode = '42501';
  end if;

  select to_jsonb(settings)
    into v_day_settings
  from public.get_effective_day_settings(p_salon_slug, p_schedule_date) settings;

  return jsonb_build_object(
    'appointments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', appointment.id,
          'service_id', appointment.service_id,
          'appointment_date', appointment.appointment_date,
          'start_time', appointment.start_time,
          'end_time', appointment.end_time,
          'occupied_slots', appointment.occupied_slots,
          'lane_key', appointment.lane_key,
          'status', appointment.status,
          'customers', jsonb_build_object(
            'name', customer.name,
            'phone', customer.phone,
            'email', customer.email,
            'gender', customer.gender
          )
        ) order by appointment.start_time, appointment.id
      )
      from public.appointments appointment
      left join public.customers customer on customer.id = appointment.customer_id
      where appointment.salon_id = v_salon_id
        and appointment.appointment_date = p_schedule_date
    ), '[]'::jsonb),
    'manual_schedule_entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'service_id', entry.service_id,
          'entry_source', entry.entry_source,
          'schedule_date', entry.schedule_date,
          'covered_start', entry.covered_start,
          'covered_end', entry.covered_end,
          'occupied_slots', entry.occupied_slots,
          'note', entry.note,
          'staff_lanes', jsonb_build_object('lane_key', lane.lane_key)
        ) order by entry.covered_start, entry.id
      )
      from public.schedule_entries entry
      join public.staff_lanes lane on lane.id = entry.staff_lane_id
      where entry.salon_id = v_salon_id
        and entry.schedule_date = p_schedule_date
        and entry.status = 'active'
        and entry.entry_source <> 'online'
    ), '[]'::jsonb),
    'day_settings', coalesce(v_day_settings, '{}'::jsonb),
    'time_blocks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', block.id,
          'block_date', block.block_date,
          'start_time', block.start_time,
          'end_time', block.end_time
        ) order by block.start_time, block.id
      )
      from public.admin_time_blocks block
      where block.salon_id = v_salon_id
        and block.block_date = p_schedule_date
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_day_snapshot(text, date) from public;
grant execute on function public.get_admin_day_snapshot(text, date) to authenticated;
