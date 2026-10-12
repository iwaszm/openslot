-- Preserve the language selected when a customer submits a booking so that
-- confirmation and later cancellation emails use the same language.

alter table public.appointments
  add column if not exists customer_language text;

update public.appointments
set customer_language = 'de'
where customer_language is null
   or customer_language not in ('de', 'en', 'zh');

alter table public.appointments
  alter column customer_language set default 'de',
  alter column customer_language set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_customer_language_check'
  ) then
    alter table public.appointments
      add constraint appointments_customer_language_check
      check (customer_language in ('de', 'en', 'zh'));
  end if;
end
$$;

comment on column public.appointments.customer_language is
  'Customer-facing language snapshot used for booking lifecycle emails.';
