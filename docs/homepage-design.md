# OpenSlot Homepage

Updated: 2026-10-05

The root page presents OpenSlot as a browser-based appointment system for local service businesses. It is separate from tenant Booking, Admin and Settings routes.

## Visual Direction

- Berlin storefront photography rather than abstract illustration.
- Space Grotesk display typography with a restrained black/white layout and fluorescent accent.
- Responsive device previews and motion demonstrating Booking and Admin workflows.
- Direct navigation to the interactive demo and contact channel.

Assets are stored under `home/assets/` with source and license notes. The Cloudflare build publishes them under `/assets/home/` and publishes `home/index.html` at `/`.

## Product Demonstration

The homepage demonstration is explanatory UI, not the production tenant application. It must not collect customer information, create Supabase rows, send email or reuse authenticated Admin state.

The deployable demo shop lives on its own `/demo/`, `/demo/admin/` and `/demo/settings/` routes and uses Supabase. Do not confuse that environment with homepage animations or with the isolated `template/` UI prototype.

## Content Constraints

- Do not promise absolute protection, uninterrupted delivery or blanket GDPR compliance.
- State capabilities in terms of current product behavior.
- Do not expose real customer, employee or shop credentials.
- Keep individual production-shop names out of general product copy.
- Keep support links and legal/privacy navigation functional.

## Validation

Before release, verify the built `dist/` version at desktop and narrow mobile widths, including reduced-motion behavior, image loading, device-preview clipping, navigation and the German copy.
