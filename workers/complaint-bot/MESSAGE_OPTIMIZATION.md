# WhatsApp outbound message optimization (feature branch)

## Changes

- First-time resident: send the existing English/Hindi selection prompt.
- Returning resident with a prior registered complaint: reuse their most recent saved language and immediately send the category menu (one fewer outgoing message per repeat registration).
- At category selection, `H` changes to Hindi and `E` changes to English; this is optional and returns the menu in the selected language.
- After the resident submits a 1–5 rating, save it without sending a purely ceremonial final thank-you message (one fewer outgoing message per completed rating).
- Atomically ignore redelivered incoming WhatsApp webhook message IDs, preventing duplicate replies and duplicate complaint-processing side effects. No phone numbers or message bodies are stored in the dedupe table.
- All registration confirmations, complaint number/queue position, urgency, plumber alerts/OTP, WORK_DONE requests, and reopening behavior remain intact.

## Deployment safety

**Do not deploy this Worker until the migration is applied.** The new Worker expects
`public.whatsapp_inbound_message_dedupe`.

1. Review and run `supabase/migrations/20261101070000_whatsapp_inbound_message_dedupe.sql` on the intended staging database first (never on the live database just to test).
2. Run isolated automated checks locally: `node --test workers/complaint-bot/worker.optimization.test.mjs` (Node.js 22+).
3. Test using a staging Worker with staging Supabase and WhatsApp configuration. Simulate two webhook POSTs with the same `messages[0].id`; only one outgoing reply should occur.
4. Simulate a first-time resident and a returning Hindi resident: expect `LANGUAGE` and `CATEGORY` respectively. Confirm changing language with `E`/`H`.
5. Register one test complaint and confirm the complaint number, category queue, urgent handling, and plumber OTP/alert still work. Complete, confirm, rate, and verify the database rating is stored without another WhatsApp reply.
6. Compare the total outgoing service messages per completed complaint with baseline in Meta WhatsApp Manager Insights. Check delivery status webhooks for failed sends.
7. When ready for production, apply the migration first and only then deploy the Worker. Keep the previous Worker deployment available for rollback.

## Operational notes

- Deduplication claims the WhatsApp inbound provider message ID before processing. If an outbound provider call fails after claiming an inbound ID, a replay of the *same* webhook ID will not retry it. The resident can send a new message, which has a new ID. Monitor Cloudflare Worker error logs and delivery status failures.
- Meta usage and fees are determined by actual delivered message categories. The savings here are per omitted service reply; the monthly free tier should not be assumed to guarantee continuity if billing is ineligible.
- This feature intentionally does not turn off supervisor acknowledgements, OTP messages, urgency questions, complaint registration confirmations, or resolved-status requests.
- Retain dedupe IDs long enough for delayed retries. For housekeeping, records older than 35 days may be deleted using the optional SQL in the migration.
- No production database migration, Worker deployment, or live message sends are performed by this branch alone.
