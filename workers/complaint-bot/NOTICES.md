# RWA Executive notices

## Scope

Only active `app_users.role = RWA_EXECUTIVE` users can open the executive dashboard or call any notice API. Existing residents, workers and supervisors cannot send notices. No users are promoted automatically.

The first version supports approved text templates with positional BODY fields and optional static text HEADER/FOOTER. Media, buttons, named parameters and arbitrary free-form broadcasts are intentionally not offered. The Worker independently reloads Meta approval on preview, send and retry. Configured templates must accurately identify their notice purpose; Meta determines classification and charges.

Recipients are opt-in subscribers, never an automatic import of complaint numbers. Each mobile number has one current flat/tower and receives at most one copy per notice. The flat-to-tower mapping comes from the existing flats master.

## Deployment prerequisites

1. Apply the `rwa_executive_notices` SQL migration from this branch to the desired Supabase environment. Do this before assigning the new role or enabling notice dispatch. The migration is not applied automatically by Cloudflare Builds.
2. Provision the executive's individual Supabase Auth account through the existing administrative process, then add/update their app_users record with `role = RWA_EXECUTIVE` and `active = true`. Use their actual Auth UUID. This must be done by a trusted administrator, not through user-editable metadata. No public role-assignment endpoint is added.
3. Set Worker `WHATSAPP_BUSINESS_ACCOUNT_ID` (the WABA ID, distinct from phone number ID), `NOTICE_TEMPLATE_NAMES` (comma-separated allowed notice template names), and `WHATSAPP_APP_SECRET` (Meta app secret, as a Worker secret). Existing WHATSAPP_ACCESS_TOKEN needs template-read and messaging permissions. Existing phone and Supabase service credentials are reused.
4. Configure approved templates and any Meta billing needed for their delivery. Configure the Meta messages webhook with sent/delivered/read/failed statuses.
5. After testing, set `ENABLE_NOTICE_DISPATCH=true` only on the intended production Worker. Leave it unset on previews using production data. Sending and retries also require the production Worker hostname; preview aliases are rejected. If using a custom production hostname, configure NOTICE_SEND_HOST to that exact hostname. This flag controls sending, retries, subscriptions and cron queue processing.
6. Deploy the Worker version and apply the cron trigger (`wrangler triggers deploy` or deployment/settings UI). The source configuration processes up to ten queued recipients per minute; initial sending also processes one batch in the background.
7. Residents message NOTICES for instructions, explicitly send `SUBSCRIBE 36D` (their own flat), and use STOP NOTICES to withdraw consent. Publish these instructions in the existing society group. Subscription changes require a correctly signed Meta webhook; the bot does not auto-subscribe existing complaint contacts.

## UI

Select RWA Executive on the login screen and use the executive's own email/password. The executive dashboard offers Send Notice and Notice history. Pick a template, complete numbered fields, select all subscribed residents or towers/flats, preview the exact message, then confirm sending to the recipient count shown. History can be refreshed; retry applies only to known failed deliveries, with a maximum of three attempts.

## Reliability

The SQL enqueue function creates the notice and recipients in one transaction. A request UUID prevents duplicates if a browser retries the same send. Recipient count/message changes require another preview. Consent is rechecked immediately before each API send.

Queue claims are atomic with SKIP LOCKED. Once claimed, jobs are not automatically requeued after uncertain outcomes, avoiding duplicate messages when Meta accepts a request but a response is lost. Such cases are UNKNOWN; Worker termination may leave SENDING. Investigate with provider logs before any manual resend. The history distinguishes queued, sending, sent, delivered, read, failed, skipped and unknown. A provider SENT result means accepted by Meta, not delivered to the phone.

The new tables have RLS enabled with no browser grants; the authenticated Worker provides all notice data. Functions are security invoker and callable only by service_role. No resident tokens or WhatsApp credentials appear in the client.

## Validation

Run `node --test workers/complaint-bot/notices.test.js`, Worker syntax checks and `npm run build`. The migration should also be tested against a fresh PostgreSQL database before deployment. Live Meta delivery is not part of these tests and must be verified after configuration using consenting test recipients.
