# Email Notifications

Updated: 2026-10-05

OpenSlot uses Supabase Edge Functions and Resend for transactional customer email. Resend credentials and the Supabase service-role key never enter browser configuration.

## Current Events

- Booking created: German confirmation email with service, date, time, shop details, calendar attachment and a subdued cancellation text link.
- Customer cancellation: confirmation email after a valid cancellation POST.
- Owner cancellation: cancellation email after the authenticated Admin update.

The owner does not receive email; new bookings are surfaced in Admin and through optional Web Push.

## Current Flow

### Booking confirmation

1. The browser calls `create-booking`.
2. The Edge Function verifies Turnstile and calls `create_public_booking_for_staff`.
3. In the same database transaction, an appointment trigger inserts an idempotent `email_events(status='pending')` row.
4. `create-booking` invokes `send-booking-email` with the service-role credential.
5. The email function derives the event from the canonical appointment status and sends through Resend.
6. `create-booking` returns both `booking_id` and `email_status` to the browser.

The browser makes only one booking request. If immediate delivery fails, the appointment remains valid and the pending/failed outbox event remains available for retry.

### Customer cancellation

1. GET on `cancel-booking?token=...` validates the token and redirects to the public confirmation page; it does not modify data.
2. The customer confirms through a POST form.
3. `cancel-booking` updates only a currently confirmed appointment.
4. The function invokes the cancellation email and redirects to the result page.

This GET + POST design prevents mail scanners and link previews from cancelling appointments automatically.

### Owner cancellation

Admin changes the appointment state under authenticated RLS. The database transaction creates the cancellation outbox event, then the authenticated member invokes immediate delivery. If the second request fails, the cancellation remains valid and the email event remains recorded.

## Idempotency

`email_events` identifies an event by booking, event type and recipient. An already sent event is skipped. Failed events retain an error message and may be retried without intentionally duplicating successful delivery.

## Required Secrets

```text
RESEND_API_KEY
MAIL_FROM
PUBLIC_BASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The sending domain should have valid SPF, DKIM and DMARC configuration.

## Known Risks

1. There is no scheduled retry worker or alert for persistent `email_events.status IN ('pending', 'failed')`.
2. Owner cancellation still relies on an authenticated browser request for the immediate delivery attempt, although the outbox event is already durable.
3. Resend bounce status is asynchronous and cannot be used as immediate customer identity verification.

## Target Design

1. Route owner cancellation through one server-side operation, matching customer cancellation.
2. Add a retry job and operational view for pending/failed events.
3. Add structured request IDs and delivery metrics.

Email failure does not roll back an already committed appointment. The UI states that the booking exists while the email requires attention.
