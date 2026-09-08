# OpenSlotBerlin Homepage

Scope: the root marketing page only. Existing customer and admin pages keep their own design.

The German page addresses small Berlin businesses that need browser-based appointment management. It combines a photographic neighborhood storefront, Space Grotesk lettering, white and near-black sections, and acid-yellow accents. The primary action opens the interactive booking demonstration.

The demo uses synthetic data and local memory only, with dates relative to the current Berlin date. It never creates appointments, collects contact information, or sends email. The homepage loads no Supabase configuration or third-party resources.

Database location in Europe is a user-supplied fact, not independently verified by this change. Copy describes Turnstile without promising absolute security or blanket GDPR compliance. Consultation links use info@openslotberlin.de.

The management demo lists synthetic appointments, filters by date and status, opens details, and confirms cancellations in a dialog. Booking-demo confirmations appear in this list. Reset restores the sample appointments; reloading clears all demo changes. Both demos remain isolated from production.

Validation: local build, Playwright interaction checks and screenshots at 1440, 390, and 320 pixels. Impeccable's engine and separate reviewer were unavailable; review used the skill's in-thread fallback.
