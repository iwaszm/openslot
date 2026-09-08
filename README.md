# OpenSlot

OpenSlot is a lightweight appointment booking website for salon-style service businesses. It provides a public booking flow, an owner admin area, email notifications, and multi-tenant data separation through Supabase.

## Features

- German brand homepage with an isolated interactive booking demo
- Public appointment booking by service, date, and available time slot
- Salon profile display with address, phone number, and opening hours
- Owner login through Supabase Auth
- Admin view for appointments, cancellations, daily opening hours, and services
- Service management for name, duration, price, and active status
- Customer confirmation and cancellation emails through Resend
- One-click cancellation links handled by a Supabase Edge Function
- Multi-tenant database model using a salon slug and `salon_id`

## Architecture

The frontend is a static HTML/CSS/JavaScript site deployed with Cloudflare Pages. Runtime configuration is generated during the Cloudflare build from environment variables, so the local `config.js` file is not committed.

The root URL serves the brand homepage (`index.html`, `home.css`, `home.js`). Its images, font, and icons are self-hosted in `assets/home/`. The homepage demo runs entirely in memory and does not connect to Supabase or send emails. Existing `/{salon-slug}/` and `/{salon-slug}/admin/` routes remain separate.

Supabase provides:

- PostgreSQL tables for salons, services, customers, appointments, opening hours, and blocked slots
- Row Level Security policies for public booking and owner-only administration
- RPC functions for validated public booking
- Edge Functions for booking emails and cancellation links
- Auth for owner access

Resend is used for transactional customer emails.

## Project Structure

```text
/
├─ archive/             Archived customer self-management page
├─ docs/                Architecture and security notes
├─ scripts/build.js     Cloudflare Pages build script
├─ supabase/            SQL migrations and Edge Functions
├─ template/            Reference HTML templates
├─ customer.js          Public booking page logic
├─ admin.js             Admin page logic
├─ styles.css           Shared UI styles
└─ config.example.js    Local configuration example
```

## Local Development

Copy `config.example.js` to `config.js` and fill in your Supabase project URL and anon public key:

```js
window.OPENSLOT_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-anon-public-key",
};
```

Run a local static server:

```powershell
python -m http.server 5173
```

Open a salon route:

```text
http://127.0.0.1:5173/{salon-slug}/
http://127.0.0.1:5173/{salon-slug}/admin/
```

The first path segment is used as the salon slug. The frontend loads the matching salon record from Supabase and scopes all services, appointments, opening hours, and admin actions to that salon.

## Supabase Setup

For a new Supabase project, run the SQL files in this order:

```text
supabase/setup.sql
supabase/multi-tenant-rpc.sql
```

Then configure Supabase Edge Function secrets:

```text
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=Booking <booking@your-domain.example>
PUBLIC_BASE_URL=https://your-production-domain.example
TURNSTILE_SECRET_KEY=your-cloudflare-turnstile-secret-key
```

Deploy the Edge Functions:

```powershell
npx supabase functions deploy send-booking-email --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase functions deploy create-booking --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase functions deploy cancel-booking --project-ref YOUR_SUPABASE_PROJECT_REF
```

The `create-booking` and `cancel-booking` functions must allow public requests. The local `supabase/config.toml` sets `verify_jwt = false` for these functions. Public booking requests are protected by Cloudflare Turnstile before the function calls the booking RPC.

## Cloudflare Pages

Cloudflare Pages should build from GitHub with:

```text
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
```

Add these Cloudflare Pages environment variables:

```text
OPENSLOT_SUPABASE_URL=https://your-project.supabase.co
OPENSLOT_SUPABASE_ANON_KEY=your-anon-public-key
OPENSLOT_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
```

The build script creates `dist/config.js` from these variables and copies the static site into `dist/`. The generated `dist/` directory and local `config.js` are intentionally ignored by Git.

## Notes

- Do not commit production secrets.
- The Supabase anon key is public by design, but database access must be protected with RLS.
- Customer booking writes should go through the public booking RPC instead of direct table inserts.
- Owner-only data access should remain scoped by `salon_id` and Supabase Auth membership.
