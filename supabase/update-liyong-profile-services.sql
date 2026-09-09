-- Update one salon profile and services from the current price list.
-- Run in Supabase SQL Editor after supabase/multi-tenant-rpc.sql.

with target_salon as (
  insert into public.salons (slug, name, address, phone, timezone, opening_hours, is_active)
  values (
    'liyong',
    'Li Yong Hair Salon',
    'Wundtstrasse 16, 14059 Berlin',
    '0176 23250573',
    'Europe/Berlin',
    '{
      "monday": "09:00-20:00",
      "tuesday": "09:00-20:00",
      "wednesday": "09:00-20:00",
      "thursday": "09:00-20:00",
      "friday": "09:00-20:00",
      "saturday": "09:00-20:00",
      "sunday": "geschlossen"
    }'::jsonb,
    true
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    address = excluded.address,
    phone = excluded.phone,
    timezone = excluded.timezone,
    opening_hours = excluded.opening_hours,
    is_active = excluded.is_active
  returning id
),
disabled_existing as (
  update public.services
  set is_active = false
  where salon_id = (select id from target_salon)
)
insert into public.services (id, salon_id, name, duration_minutes, price, is_active, category)
select service_id, (select id from target_salon), service_name, duration_minutes, price, true, category
from (
  values
    ('liyong_damen_schneiden_kurz', 'Damen - Schneiden (kurz)', 30, 20, 'cut'),
    ('liyong_damen_schneiden_lang', 'Damen - Schneiden (lang)', 30, 23, 'cut'),
    ('liyong_damen_waschen_schneiden_foehnen_kurz', 'Damen - Waschen + Schneiden + Foehnen (kurz)', 60, 25, 'cut'),
    ('liyong_damen_waschen_schneiden_foehnen_lang', 'Damen - Waschen + Schneiden + Foehnen (lang)', 60, 28, 'cut'),
    ('liyong_damen_schneiden_faerben_straehnen', 'Damen - Schneiden + Faerben / Straehnen', 90, 60, 'color'),
    ('liyong_damen_schneiden_dauerwelle', 'Damen - Schneiden + Dauerwelle', 90, 60, 'shape'),
    ('liyong_digitale_dauerwelle', 'Digitale Dauerwelle', 120, 130, 'shape'),
    ('liyong_ionische_dauerwelle', 'Ionische Dauerwelle', 120, 150, 'shape'),
    ('liyong_herren_schneiden', 'Herren - Schneiden', 30, 18, 'cut'),
    ('liyong_herren_waschen_schneiden_foehnen', 'Herren - Waschen + Schneiden + Foehnen', 30, 20, 'cut'),
    ('liyong_herren_schneiden_faerben_straehnen', 'Herren - Schneiden + Faerben / Straehnen', 90, 55, 'color'),
    ('liyong_herren_schneiden_dauerwelle', 'Herren - Schneiden + Dauerwelle', 90, 55, 'shape')
) as service_values(service_id, service_name, duration_minutes, price, category)
on conflict (id) do update
set
  salon_id = excluded.salon_id,
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  price = excluded.price,
  is_active = excluded.is_active,
  category = excluded.category;
