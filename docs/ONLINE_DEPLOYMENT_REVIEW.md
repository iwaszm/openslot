# OpenSlot Production Review

Review date: 2026-10-05

## Current Decision

The application now has production Supabase adapters for Booking, Admin and Settings and can continue controlled production use. The previous conclusion that Settings was only a `localStorage` prototype is obsolete.

The remaining risk is concentrated in operational consistency, email orchestration, missing automated tests and shop-specific build wiring. UI completeness is no longer the main blocker.

## Verified in the Repository

- `npm run build` succeeds when required public build variables are provided.
- Booking writes go through `create-booking` and Turnstile before the transaction RPC.
- Customer cancellation uses a GET confirmation redirect followed by POST mutation.
- Admin and Settings use Supabase Auth, membership roles, RLS and authorized RPCs.
- Settings includes employee, catalog, opening-hours, account, language and theme workflows.
- Admin PWA navigation is network-first and does not cache business API responses.
- Push subscriptions and dispatch deduplication exist.
- Migrations cover multi-staff scheduling, snapshots, holidays, Settings, role scoping, service states, automatic staff balancing, manual appointment editing, back-office language and themes.

These checks describe repository code. They do not prove that the production Supabase schema, function versions and secrets exactly match the repository.

## Open Findings

### P1: Reconcile production schema and migration history

Several migrations were executed manually through the SQL editor. Successful SQL execution does not guarantee that Supabase migration history records the same state.

Required work:

1. Back up production schema/data and record deployed Edge Function versions.
2. Compare the linked database schema and migration list with `supabase/migrations/`.
3. Create a staging project and run the full migration chain from an empty database.
4. Run database lint and resolve remaining errors/warnings.
5. Adopt `supabase/migrations/` as the only forward schema history.

### P1: Complete email retry operations

Booking creation now writes a pending email event in the appointment transaction, and `create-booking` performs the immediate server-side delivery attempt. The mail function derives the event from appointment state and rejects anonymous callers.

Remaining work:

- Add a scheduled retry worker for pending/failed email events.
- Add monitoring and an operational view for delivery failures.
- Consolidate owner cancellation and immediate delivery behind one server-side operation.

### P1: Add automated test gates

There are currently no repository tests or GitHub Actions workflows. Minimum coverage should include:

- Unit tests for covered-time and occupied-time calculations.
- RPC integration tests for two-lane assignment and concurrent booking.
- RLS tests for anon, staff, owner and platform administrator.
- Playwright flows for Booking, Admin, Settings, cancellation and responsive views.
- CI build and test checks on every push.

### P2: Harden public functions

- Validate Turnstile hostname and action, not only `success`.
- Add IP/window rate limiting in addition to email/phone limits.
- Replace raw database errors with stable public error codes and request IDs.
- Review whether wildcard CORS is still necessary for each function.
- Add cancellation attempt and privileged action audit records.

### P2: Remove shop-specific deployment wiring

The database is multi-tenant, but `scripts/build.js`, redirects, route folders and PWA assets still enumerate individual shops. This is acceptable for the current small deployment but does not support self-service onboarding.

### P2: Reduce frontend concentration

`admin.js` and `customer.js` contain domain logic, repositories and rendering in large files. New development should extract pure scheduling logic first, then repositories and views, while retaining the shared UI model.

### P2: Refresh or retire historical SQL entry points

The repository contains both timestamped migrations and older top-level SQL setup files. New deployments should use migrations only. Legacy SQL should be clearly marked historical or moved to an archive to avoid applying incompatible setup paths.

## Release Checklist

### Database

- [ ] Restorable production backup exists.
- [ ] Linked schema and migration history match the repository.
- [ ] Empty staging project applies all migrations successfully.
- [ ] Database lint has no errors.
- [ ] RLS role tests pass.
- [ ] Concurrent booking tests pass.

### Functions and communication

- [ ] Current Edge Functions are deployed from the matching commit.
- [ ] Function secrets are present and scoped correctly.
- [ ] Turnstile production hostname is allowed.
- [ ] Confirmation and cancellation emails send once.
- [ ] Failed email and push events are observable.
- [ ] Cancellation GET does not modify appointment state.

### Frontend

- [ ] Cloudflare Preview passes Booking/Admin/Settings smoke tests.
- [ ] Owner and staff permissions behave differently as intended.
- [ ] Mobile and desktop schedules render correctly.
- [ ] Theme and back-office language persist across reloads.
- [ ] PWA update and offline states are verified.
- [ ] Previous Pages deployment ID is recorded for frontend rollback.

## Recommended Work Order

1. Commit the current documentation baseline.
2. Reconcile production Supabase schema and migrations.
3. Deploy the email outbox migration/functions and add retry monitoring; harden Turnstile checks.
4. Add scheduling/RLS tests and CI.
5. Generalize shop onboarding and split the large controllers.
6. Only then add reminder emails, analytics, absence management or payment/deposit features.
