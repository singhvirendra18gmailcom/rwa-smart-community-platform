# RWA Pocket-A — public web complaint chat (WhatsApp fallback)

## Purpose

A login-free, bilingual, mobile-first chat interface. Residents can raise complaints without WhatsApp or a Supabase account. It uses **the same `public.complaints` table and supervisor/plumber work queues** as the existing WhatsApp bot. The main authenticated supervisor dashboard is unchanged.

**Page path:** `/?view=complaint-chat` on the Cloudflare Pages frontend. The public route is handled before `App.jsx`, so a resident never sees the login screen.

## Resident flow (matches current WhatsApp chatbot)

1. Open the link. The app displays the bilingual category menu with WhatsApp-style bubbles and quick-reply tiles.
2. Choose Plumber, Electrician, Sewerage, Camera Recording, Horticulture, Housekeeping, or Other. Street Light is disabled, matching the existing bot.
3. Enter flat once (subsequent visits on the **same browser** remember it).
4. For camera recording: supply date/time. For horticulture or housekeeping: choose an issue type. Otherwise no extra issue prompt.
5. Enter a contact phone once (the web app cannot read a WhatsApp sender's phone). This is **not** login, OTP, or phone verification; it must not be treated as proof of identity. Saved in the browser only after registration.
6. **Automatic registration** after the final required answer, pending Cloudflare Turnstile browser verification. No Register/Cancel, Normal/Urgent, language, or rating questions.
7. The receipt shows complaint number, queue position and a plumber work-start OTP if applicable. Residents can check the last complaint's status on the same browser using an unguessable receipt ID; when work is done, they can answer Yes/No there.
8. No WhatsApp API call is made for web registration or web work-completed notifications. Staff continue to process the complaint in the existing dashboard. Thus a Meta outage does not prevent web registration or web confirmation.

The footer credits RWA Pocket-A. There is no resident ability to update the verified WhatsApp flat mapping. The web browser caches its own flat and phone, not the protected supervisor-managed phone-to-flat mapping.

## Security and limitations

- The browser **never receives** a Supabase service key.
- Public registration requires a valid Cloudflare Turnstile token verified **server-side** and an explicit allowed hostname list. When config is absent, the API **fails closed**.
- A contact mobile number is required to help staff follow up; this number is **not verified**. Web complaints are tagged `source=WEB`. These numbers are excluded from WhatsApp-bot remembered-flat history to prevent anonymous spoofing of WhatsApp flats.
- Staff Web complaints do not trigger WhatsApp "Work Done" messages. The public web ticket is used for resident confirmation.
- Additional throttle: 3 web complaints per contact number per 30 minutes. Set a Cloudflare WAF/rate limiting rule for `POST /api/web-complaints/register` before public launch; phone-only limits do not stop attackers rotating phone numbers.
- Ticket is a random v4 UUID stored in this browser's localStorage, used as a private bearer receipt. Losing browser data means losing passwordless access to that ticket. Do not share it or embed it in public links.
- No anonymous Supabase table access, no freeform SQL, no public bulk complaint listing, and no mutation of previous WhatsApp records.
- The web chat is a fallback for **Meta/WhatsApp outages**, not for outages of Cloudflare Workers, the Pages site or Supabase.
- The browser remembers the last complaint only. Use the Complaint Center to locate historical complaints.

## Required deployment setup — do NOT merge to production until done

1. Apply `supabase/migrations/20261101160000_web_chat_complaint_receipts.sql` to staging first, and confirm the unique `web_request_id` column/index.
2. Deploy the modified Worker **to staging** with isolated Supabase credentials.
3. Configure the **staging Worker secrets/vars**: `WEB_TURNSTILE_SECRET_KEY` and `WEB_TURNSTILE_HOSTNAMES` (comma-separated exact allowed frontend hostnames; no `https://`).
4. Create a Cloudflare Turnstile site key restricted to the intended staging and production web domains. Configure staging **Cloudflare Pages build-time env**: `VITE_WEB_TURNSTILE_SITE_KEY` and `VITE_WEB_COMPLAINT_API_BASE_URL` (staging Worker URL).
5. Branch previews intentionally default to **no public API** to prevent test complaints from entering the production queue.
6. In staging: send a first-time plumber complaint, confirm the ticket/OTP/queue, test repeat registration in the same browser, all seven categories, camera date/time and issue subcategories, Turnstile error/expiry, and duplicate submission retry.
7. Verify supervisor and plumber apps display and process web complaints, and the web "Check status" + Yes/No confirmation works **without** WhatsApp.
8. Verify rate limits, unauthorized access, and frontend build + Worker automated tests.
9. Only then configure production Turnstile and Pages variables, apply the DB migration to production and merge. Validate Cloudflare Builds deployments separately.

## Tests

- Existing webhook tests: `node --test workers/complaint-bot/worker.optimization.test.mjs`
- New isolated web API tests: `node --test workers/complaint-bot/worker.web-chat.test.mjs`
- Frontend: `npm ci && npm run build`

All automated API tests use synthetic numbers and mock Supabase, Meta and Turnstile; no real messages or production records are created.
