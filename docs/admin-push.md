# Admin Booking Push

Updated: 2026-10-05

Installed Admin PWAs can receive a generic notification after a new online appointment is confirmed. Notifications contain no customer name, contact information, service or appointment time.

## Current Flow

1. An authenticated admin/owner/staff member presses the bell beside Buchungslog.
2. The browser requests notification permission and creates a Push API subscription.
3. The subscription is stored in `push_subscriptions` with the authenticated user and shop.
4. `create-booking` confirms an appointment, inserts a unique `booking_push_dispatches` row and loads subscriptions for that shop.
5. Membership is checked again before each delivery.
6. Expired subscriptions returning HTTP 404 or 410 are deleted.

The dispatch row prevents duplicate push delivery for the same booking. Push failures do not roll back a valid appointment.

## Setup

1. Generate one VAPID key pair:

   ```powershell
   node scripts/generate-vapid-keys.js
   ```

2. Add the public key to the Cloudflare Pages production build environment:

   ```text
   OPENSLOT_VAPID_PUBLIC_KEY
   ```

3. Add the same pair to Supabase Edge Function secrets:

   ```text
   VAPID_PUBLIC_KEY
   VAPID_PRIVATE_KEY
   ```

4. Deploy `create-booking` and trigger a new Pages build.

One shared VAPID pair is sufficient for all shops on the same service origin. Do not generate a pair for each shop.

## Device Behavior

- On iPhone/iPad, the user must install the PWA on the Home Screen and open that installed app before iOS exposes notification permission for it.
- Denied browser permission cannot always be reopened programmatically; the bell explains or retries where the platform permits it.
- Reinstalling the PWA may be necessary when the operating system retains an obsolete icon or permission association.
- A subscription is device/browser-profile specific. Enabling one phone does not enable another.

## Security and Privacy

- The private VAPID key exists only in Supabase Secrets.
- Push endpoints are accepted only for known HTTPS push-service hosts.
- The service checks current shop membership before delivery.
- Generic payloads avoid exposing personal information on a lock screen.
- PWA installation does not grant Admin access; Supabase Auth and RLS remain mandatory.

## Current Limitations

- Delivery is best effort; browsers and operating systems may delay or suppress notifications.
- There is no admin delivery dashboard or retry queue.
- Push delivery is currently enabled in the Edge Function for the explicitly deployed shop slugs. New shops require the function/build onboarding path to be generalized.
- Notifications complement the network-first schedule; they are not the source of truth.
