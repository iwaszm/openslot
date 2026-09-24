begin;

do $$
declare
  v_salon_id uuid;
  service_row record;
  target record;
  v_new_service_id text;
begin
  select id into v_salon_id
  from public.salons
  where slug = 'liyong';

  if v_salon_id is null then
    select id into v_salon_id
    from public.salons
    where slug = 'demo';

    if v_salon_id is null then
      raise exception 'Neither salon slug liyong nor demo was found';
    end if;
  end if;

  if exists (select 1 from public.salons where slug = 'demo' and id <> v_salon_id) then
    raise exception 'Salon slug demo is already used by another salon';
  end if;

  update public.salons
  set slug = 'demo',
      name = 'OpenSlot Demo Salon',
      address = 'Musterstrasse 1, 10115 Berlin',
      phone = '030 00000000'
  where id = v_salon_id;

  update public.salon_staff
  set name = 'Linda',
      sort_order = 1,
      is_active = true,
      accepts_online_bookings = true,
      updated_at = now()
  where salon_id = v_salon_id
    and staff_key = 'default';

  if not found then
    insert into public.salon_staff (
      salon_id, staff_key, name, sort_order, is_active, accepts_online_bookings
    ) values (
      v_salon_id, 'default', 'Linda', 1, true, true
    );
  end if;

  insert into public.salon_staff (
    salon_id, staff_key, name, sort_order, is_active, accepts_online_bookings
  ) values (
    v_salon_id, 'tony', 'Tony', 2, true, true
  )
  on conflict (salon_id, staff_key) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true,
    accepts_online_bookings = true,
    updated_at = now();

  update public.salon_staff
  set is_active = false,
      accepts_online_bookings = false,
      updated_at = now()
  where salon_id = v_salon_id
    and staff_key not in ('default', 'tony');

  insert into public.staff_lanes (
    salon_id, staff_id, lane_key, label, sort_order, is_active
  )
  select v_salon_id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
  from public.salon_staff staff
  cross join lateral (
    values ('a', 'A', 1), ('b', 'B', 2)
  ) as lane(lane_key, label, sort_order)
  where staff.salon_id = v_salon_id
    and staff.staff_key = 'default'
  on conflict (salon_id, lane_key) do update set
    staff_id = excluded.staff_id,
    label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

  insert into public.staff_lanes (
    salon_id, staff_id, lane_key, label, sort_order, is_active
  )
  select v_salon_id, staff.id, lane.lane_key, lane.label, lane.sort_order, true
  from public.salon_staff staff
  cross join lateral (
    values ('c', 'C', 1), ('d', 'D', 2)
  ) as lane(lane_key, label, sort_order)
  where staff.salon_id = v_salon_id
    and staff.staff_key = 'tony'
  on conflict (salon_id, lane_key) do update set
    staff_id = excluded.staff_id,
    label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

  update public.staff_lanes
  set is_active = false,
      updated_at = now()
  where salon_id = v_salon_id
    and lane_key not in ('a', 'b', 'c', 'd');

  update public.schedule_entries entry
  set staff_id = lane.staff_id,
      updated_at = now()
  from public.staff_lanes lane
  where entry.staff_lane_id = lane.id
    and lane.salon_id = v_salon_id
    and entry.staff_id <> lane.staff_id;

  -- The admin account will be shared with prospects. Preserve appointment
  -- structure for the demo, but remove customer contact data from old records.
  update public.customers
  set name = 'Demo Kunde ' || left(replace(id::text, '-', ''), 6),
      phone = '030 00000000',
      email = 'demo+' || replace(id::text, '-', '') || '@example.invalid'
  where salon_id = v_salon_id;

  update public.email_events event
  set recipient = 'demo+' || replace(event.booking_id::text, '-', '') || '@example.invalid'
  where exists (
    select 1
    from public.appointments appointment
    where appointment.id = event.booking_id
      and appointment.salon_id = v_salon_id
  );

  for service_row in
    select *
    from public.services
    where salon_id = v_salon_id
      and id like 'liyong\_%' escape '\'
    order by id
  loop
    v_new_service_id := 'demo_' || substring(service_row.id from length('liyong_') + 1);

    if not exists (select 1 from public.services where id = v_new_service_id) then
      insert into public.services
      select (jsonb_populate_record(
        null::public.services,
        to_jsonb(service_row) || jsonb_build_object('id', v_new_service_id)
      )).*;
    end if;

    for target in
      select format('%I.%I', namespace.nspname, relation.relname) as relation_name
      from pg_attribute attribute
      join pg_class relation on relation.oid = attribute.attrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'p')
        and attribute.attname = 'service_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      execute format(
        'update %s set service_id = $1 where service_id = $2',
        target.relation_name
      ) using v_new_service_id, service_row.id;
    end loop;

    delete from public.services where id = service_row.id;
  end loop;
end;
$$;

commit;
