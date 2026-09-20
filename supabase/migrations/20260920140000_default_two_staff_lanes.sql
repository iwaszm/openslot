-- Every employee is represented by two scheduling lanes.
-- Existing lane assignments are preserved; only missing lanes are appended.

create or replace function public.ensure_two_staff_lanes(target_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_salon_id uuid;
  lane_count integer;
  next_lane_number integer;
  next_lane_key text;
begin
  select staff.salon_id
  into target_salon_id
  from public.salon_staff staff
  where staff.id = target_staff_id;

  if target_salon_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(target_salon_id::text));

  select count(*)
  into lane_count
  from public.staff_lanes lane
  where lane.staff_id = target_staff_id
    and lane.is_active;

  while lane_count < 2 loop
    select coalesce(max(ascii(lower(lane.lane_key)) - ascii('a')), -1) + 1
    into next_lane_number
    from public.staff_lanes lane
    where lane.salon_id = target_salon_id
      and lane.lane_key ~ '^[a-z]$';

    if next_lane_number > 25 then
      raise exception 'A salon cannot have more than 26 single-letter schedule lanes';
    end if;

    next_lane_key := chr(ascii('a') + next_lane_number);

    insert into public.staff_lanes (
      salon_id, staff_id, lane_key, label, sort_order, is_active
    ) values (
      target_salon_id,
      target_staff_id,
      next_lane_key,
      upper(next_lane_key),
      lane_count + 1,
      true
    );

    lane_count := lane_count + 1;
  end loop;
end;
$$;

create or replace function public.provision_default_staff_lanes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.ensure_two_staff_lanes(new.id);
  return new;
end;
$$;

drop trigger if exists provision_default_staff_lanes on public.salon_staff;
create trigger provision_default_staff_lanes
after insert on public.salon_staff
for each row execute function public.provision_default_staff_lanes();

do $$
declare
  staff_record record;
begin
  for staff_record in
    select staff.id
    from public.salon_staff staff
    where staff.is_active
    order by staff.salon_id, staff.sort_order, staff.id
  loop
    perform public.ensure_two_staff_lanes(staff_record.id);
  end loop;
end;
$$;

revoke all on function public.ensure_two_staff_lanes(uuid) from public;
revoke all on function public.provision_default_staff_lanes() from public;

comment on function public.ensure_two_staff_lanes(uuid) is
  'Preserves existing lane assignments and appends active lanes until an employee has two.';
