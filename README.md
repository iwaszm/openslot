# OpenSlot

OpenSlot is a multi-tenant appointment booking system for service businesses. Each shop receives a public booking page, a protected daily schedule, and an owner settings area under its own URL slug.

## Features

- Public booking in German, English, and Chinese
- Configurable services, categories, prices, durations, and occupied time slots
- Dynamic employee selection and server-side automatic assignment
- Multi-employee daily scheduling with two parallel lanes per employee
- Platform administrator, shop owner, and staff permissions
- Shop settings for services, employees, opening hours, language, and theme
- Installable admin PWA with network-first updates and booking push notifications
- Confirmation and cancellation emails through Resend
- Cloudflare Turnstile protection for booking and admin sign-in
- Public-holiday blocking and scheduled historical-data cleanup

## Architecture

The frontend is framework-free HTML, CSS, and JavaScript deployed as static output on Cloudflare Pages. All shop routes use the same shared Booking, Admin, and Settings code. Shop-specific differences come from the URL slug, static media, PWA metadata, and Supabase data.

Supabase provides PostgreSQL storage, Auth, Row Level Security, transactional RPC functions, scheduled jobs, and Edge Functions. Resend handles transactional email. Cloudflare Pages hosts the site, Turnstile protects public actions, and Web Push notifies subscribed admin devices about new bookings.

The local `template/` application is an isolated UI prototype. It uses synthetic data and `localStorage`, does not connect to Supabase, and must not be used as a production data layer.

## Main Routes

```text
/{shop-slug}/             Public booking
/{shop-slug}/admin/       Protected schedule and booking log
/{shop-slug}/settings/    Account and shop settings
/template/                Local UI prototype
```

## Project Structure

```text
/
├─ assets/                Shared static assets
├─ demo/                  Demo shop shell and PWA metadata
├─ home/                  Public product homepage
├─ info/                  Local project notes; excluded from deployment
├─ scripts/build.js       Cloudflare Pages build script
├─ supabase/              SQL migrations and Edge Functions
├─ template/              Isolated localStorage UI prototype
├─ shared/                Settings UI, repository adapters, and back-office i18n
├─ customer.js            Shared public booking controller
├─ admin.js               Shared schedule controller
└─ styles.css             Shared Booking and Admin styles
```

## Local Development

Copy `config.example.js` to `config.js` and provide the public Supabase and Cloudflare keys:

```js
window.OPENSLOT_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-public-key",
};
```

Build the same output used by Cloudflare Pages:

```powershell
$env:OPENSLOT_SUPABASE_URL="https://your-project.supabase.co"
$env:OPENSLOT_SUPABASE_ANON_KEY="your-anon-public-key"
$env:OPENSLOT_TURNSTILE_SITE_KEY="your-turnstile-site-key"
$env:OPENSLOT_VAPID_PUBLIC_KEY="your-vapid-public-key"
npm run build
```

Serve `dist/` with any static HTTP server, then open one of the routes above. Do not open the files directly because service workers, modules, and path routing require HTTP.

## Deployment

Cloudflare Pages configuration:

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
```

Cloudflare Pages production variables:

```text
OPENSLOT_SUPABASE_URL
OPENSLOT_SUPABASE_ANON_KEY
OPENSLOT_TURNSTILE_SITE_KEY
OPENSLOT_VAPID_PUBLIC_KEY
```

Supabase Edge Function secrets:

```text
RESEND_API_KEY
MAIL_FROM
PUBLIC_BASE_URL
TURNSTILE_SECRET_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

Public booking depends on these Edge Functions:

```text
create-booking
send-booking-email
cancel-booking
```

Database changes are versioned in `supabase/migrations/`. Apply pending migrations before deploying frontend code that depends on new tables, columns, or RPC signatures.

## Database Operations

With Docker Desktop running and the repository linked to Supabase, create a timestamped logical backup with:

```powershell
npm run backup:supabase
```

Backups are written to `info/backup/`, which is excluded from Git. They contain customer and authentication data and must be stored as sensitive files.

Run the read-only schema audits in `supabase/audits/` when reconciling a linked project. The transactional demo scheduling regression suite can be run with:

```powershell
npm run test:db:linked
```

## Security

- Never commit service-role keys, private VAPID keys, Resend keys, or other production secrets.
- The Supabase anon key is public by design; Row Level Security and RPC authorization are the security boundary.
- Booking writes go through the validated `create-booking` Edge Function and database RPC.
- Admin access is scoped by authenticated shop membership and role, not by URL secrecy.
- Appointment, customer, authentication, and settings responses are not stored in the PWA cache.
