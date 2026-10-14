# Salon Images

Updated: 2026-10-14

Booking pages load public shop photos from the Supabase Storage bucket `salon-images`. Objects are grouped by shop slug and sorted by filename.

```text
salon-images/
  demo/
    01-cover.webp
    02-interior.webp
  lisa/
    01-cover.webp
    02-team.webp
```

The first image becomes the Booking cover. Clicking the cover opens the viewer; additional images can be browsed with buttons, keyboard arrows or swipe-compatible browser controls. If a shop folder is empty or Storage cannot be reached, the static `/{slug}/feature.jpg` remains the fallback.

## Create the Bucket

Apply `supabase/migrations/20261014120000_salon_images_storage.sql` in the Supabase SQL Editor. It creates a public bucket, limits files to 5 MB, permits AVIF/JPEG/PNG/WebP, and allows public listing so the Booking page can discover the current shop folder.

Alternatively, create it in **Supabase Dashboard → Storage → New bucket**:

- Name: `salon-images`
- Public bucket: enabled
- File size limit: `5 MB`
- Allowed MIME types: `image/avif,image/jpeg,image/png,image/webp`

The SQL policy from the migration is still required for anonymous folder listing.

## Upload Photos

1. Open **Storage → salon-images**.
2. Create a folder whose name exactly matches the shop slug, for example `lisa` or `demo`.
3. Upload optimized images and prefix filenames with their display order: `01-cover.webp`, `02-interior.webp`, `03-team.webp`.
4. Keep the cover near 1600–2000 px wide and normally below 800 KB. Do not upload customer photos without permission.

No database row or full public URL is required. Replacing an existing filename may remain cached by the CDN; use a new filename when an immediate visible update is required.
