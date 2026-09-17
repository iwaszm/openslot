# Li Yong booking push

The Li Yong admin PWA can send a generic notification when `create-booking` confirms a new online appointment. No customer name, contact information, or appointment details are included in the push request or notification. Other salons are unaffected.

## Setup

1. In the Supabase SQL Editor, run `supabase/migrations/20260917120000_liyong_push_subscriptions.sql` once. The subscription table stores browser push endpoints under the user's salon membership and RLS. A separate dispatch table prevents duplicate notifications for the same booking.
2. Run `node scripts/generate-vapid-keys.js` locally. Keep the private key out of Git. Generate the pair only once; rotating it invalidates existing browser subscriptions until users enable notifications again.
3. Add `OPENSLOT_VAPID_PUBLIC_KEY` to the Cloudflare Pages production build environment, using the generated public key. Trigger a new Pages build.
4. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as Supabase Edge Function secrets, using the same pair. Redeploy `create-booking`. Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY` remain required.
5. Open `/liyong/admin/` on the owner's device, log in, and select **Benachrichtigungen aktivieren**. Accept the browser's notification permission. On iPhone/iPad, first add the PWA to the Home Screen and open it from there.
6. Create a real test appointment through `/liyong/` and confirm that the device receives **Neue Online-Buchung**. Tapping it should open the Li Yong admin page.

Push is optional: booking still succeeds if delivery fails. The Edge Function logs failed sends and removes endpoints rejected as expired. The subscription is device-specific and remains active after signing out until **Benachrichtigungen deaktivieren** is selected on that device; notifications contain no booking details. Browser/OS notification settings can also block delivery.
