-- Public salon photos are grouped by shop slug, for example:
-- salon-images/demo/01-cover.webp
-- salon-images/lisa/01-cover.webp

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'salon-images',
  'salon-images',
  true,
  5242880,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can list salon images" on storage.objects;
create policy "Public can list salon images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'salon-images');
