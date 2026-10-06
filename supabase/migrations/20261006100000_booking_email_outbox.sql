-- Keep customer email work in the same transaction as the appointment state.
-- Delivery remains asynchronous/best-effort, but a pending event can be retried.

create or replace function public.enqueue_booking_customer_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient text;
  v_event_type text;
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    v_event_type := 'booking_created_customer';
  elsif tg_op = 'UPDATE'
    and old.status is distinct from new.status
    and new.status = 'cancelled' then
    v_event_type := 'booking_cancelled_customer';
  else
    return new;
  end if;

  select customer.email
    into v_recipient
  from public.customers customer
  where customer.id = new.customer_id
    and customer.salon_id = new.salon_id;

  if nullif(trim(v_recipient), '') is null then
    raise exception 'Booking customer email is unavailable';
  end if;

  insert into public.email_events (
    booking_id,
    event_type,
    recipient,
    status
  ) values (
    new.id,
    v_event_type,
    lower(trim(v_recipient)),
    'pending'
  )
  on conflict (booking_id, event_type, recipient) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_booking_customer_email() from public, anon, authenticated;

drop trigger if exists appointments_enqueue_customer_email on public.appointments;
create trigger appointments_enqueue_customer_email
after insert or update of status on public.appointments
for each row execute function public.enqueue_booking_customer_email();

comment on function public.enqueue_booking_customer_email() is
  'Creates an idempotent pending customer email event in the appointment transaction.';
