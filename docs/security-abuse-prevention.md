# Security and Abuse Prevention

Updated: 2026-10-05

## Security Boundaries

- The Supabase anon key is public and is not a secret.
- RLS, authorized RPCs and Edge Function validation protect data.
- The service-role key, Resend key, Turnstile secret and private VAPID key exist only in Supabase Secrets.
- URL paths, hidden buttons, PWA installation and client-side checks do not grant authorization.

## Implemented Controls

- Public booking goes through `create-booking`, not a direct browser insert.
- Cloudflare Turnstile is required before the booking RPC.
- Payload fields are validated again in the Edge Function and database.
- The database performs final availability and concurrency checks.
- Booking frequency is limited by repeated email/phone activity in the RPC.
- Admin uses Supabase Auth and shop membership roles.
- Staff writes are scoped to their own employee area; owner and platform admin have broader roles.
- Customer cancellation uses a random 48-hex-character token.
- Cancellation GET only opens confirmation; POST performs the state change.
- Email events and push dispatches have idempotency records.
- Push payloads contain no customer personal data.
- Business API responses are not stored in the PWA cache.
- Historical personal and scheduling data is cleaned by a weekly retention job.

## Remaining Risks

### Public booking abuse

Turnstile reduces automation but is not a complete rate limiter. Attackers can rotate email, phone and IP values. Add a server-side IP/window counter and monitor abnormal booking velocity.

Turnstile verification currently checks success but should also enforce the production hostname and a dedicated action value.

### Email delivery operations

Anonymous callers cannot select or trigger email events. Booking creation uses a service-role call, while authenticated shop members may request delivery for an appointment in their shop. The event type is derived from appointment state. A background retry worker and failure alerting are still required.

### Error disclosure

Some Edge Functions return raw exception messages. Log full errors internally with a request ID and return stable public codes such as validation failure, conflict, unavailable or internal error.

### CORS

Wildcard CORS does not create authorization by itself, but unnecessary origins increase the callable browser surface. Restrict origins where practical while retaining database/RPC enforcement against direct scripts.

### Account security

- Use unique owner/staff passwords and remove temporary preset passwords after handover.
- Consider MFA when Supabase Auth and the daily workflow support it without excessive friction.
- Review inactive users, memberships and push subscriptions periodically.
- Cloudflare Access may be appropriate for a platform-only administration route, but adding a second daily login to every shop PWA should be weighed against usability.

## Monitoring

At minimum, monitor:

- booking creation failures and conflict rates;
- unusually high bookings by IP, email or phone window;
- repeated Turnstile failures;
- `email_events` in `pending` or `failed` state;
- push delivery failures and stale subscriptions;
- repeated login failures;
- privileged Settings and schedule changes;
- retention Cron failures.

## Incident Response

1. Disable the affected Edge Function or route at Cloudflare/Supabase if abuse is active.
2. Preserve logs and identify affected shop, users and appointment IDs.
3. Rotate only the compromised secret; public anon keys normally do not require rotation.
4. Revoke affected sessions and memberships where account access is involved.
5. Restore service using a forward fix and verify RLS before reopening writes.
6. Notify affected users when legally or operationally required.

## Next Security Work

1. Email retry worker and delivery monitoring.
2. Stable public errors and structured internal logs.
3. Turnstile hostname/action validation.
4. IP/window rate limiting.
5. Automated RLS and concurrent-booking tests.
6. Audit logging for cancellations, blocks and Settings changes.
