# RWA Pocket-A — Bilingual, low-message WhatsApp complaint flow

## Implemented resident flow

1. Send `Hi`: one **bilingual category menu**. There is no language-selection question.
2. Select a category: new residents are asked once for their flat number; if a complaint was previously registered from the same WhatsApp mobile number, the most recently recorded valid flat is reused without a question.
3. If required by category, the bot asks only for **camera-recording date/time** or **issue type**. There is no Normal/Urgent question.
4. **Automatic registration** immediately after the last required input: for returning residents with a saved flat and a simple category, selecting the category itself registers the complaint. There is **no Register/Cancel or review question**.
5. Residents who need to use a different flat can send **`FLAT 36-D` before choosing the category**; this is optional and changes only the next complaint. The category menu shows the saved flat and that command.
6. The registration acknowledgement includes the complaint number, bilingual category, flat, queue position, and **plumber OTP when applicable**.
7. On plumber/supervisor work completion, send one bilingual **Is your problem resolved? 1 Yes / 2 No** message.
8. Resident selects **1**: the complaint closes **silently**. There is no rating request and no closing thank-you.
9. Resident selects **2**: the complaint reopens and receives a short bilingual reopen acknowledgement.

### Other notifications

- Supervisor acknowledgement, supervisor resolved/reopen instructions, invalid input, cancel, and non-text notices are bilingual.
- The plumber's operational notification remains available.
- Existing records and OTP validation are unaffected. Database schema retains legacy `preferred_language` and rating fields for compatibility; newly registered complaints store `preferred_language='EN'` only as a legacy value while actual replies are bilingual.
- New complaints default to `is_urgent=false`. The urgency question has been intentionally removed. Residents are instructed in the main menu to call society security/supervisor directly for immediate emergencies. **This change removes resident-selected urgent prioritization from the chatbot**; RWA should decide how to flag urgent cases through its staff workflow separately.
- The same inbound provider message ID is atomically claimed before processing, preventing duplicate chatbot replies on webhook redelivery.

## Expected message savings, excluding any repeated webhooks

| Scenario | Old workflow | New workflow |
|---|---|---|
| First-time plumber/electrician/sewerage resident | Language, category, flat, urgent, review, registration | Category, flat, registration (**3 outgoing messages**) |
| Returning plumber/electrician/sewerage resident | Category, flat, urgent, review, registration (language was previously remembered) | Category, registration (**2 outgoing messages**) |
| Resident confirms work is complete | Work done question, closing/rating request, rating thank-you | Work done question only |

Actual billed usage depends on Meta's message categories and delivery, not only the number of sends.

## Safe rollout

**No Cloudflare production deployment and no Supabase schema changes are included in this implementation.**

The existing branch's inbound-message deduplication still requires
`supabase/migrations/20261101070000_whatsapp_inbound_message_dedupe.sql`.
The SQL migration must be run on the relevant environment **before** the optimized Worker is deployed.

1. Test in isolated staging using `node --test workers/complaint-bot/worker.optimization.test.mjs`.
2. Apply the dedupe migration to staging; configure the staging Worker to use separate Supabase/WhatsApp test credentials.
3. Confirm bilingual category menu and flat-number reuse. Verify automatic registration after category selection for a returning resident; use `FLAT 36-D` before selecting a category to correct the saved flat.
4. Confirm immediate registration on the final required input for each category; verify no review/confirmation prompt, and ensure queue position, plumber OTP, and plumber notification still work.
5. Confirm both work-completion responses: **1 closes without another send**, and **2 reopens**.
6. Verify no urgent or rating prompts, no decorative thank-you, and duplicate incoming message IDs produce only one response.
7. Review service-delivery events, and only then apply the migration and deploy to production, keeping a rollback available.

## Error handling

The dedupe claim happens before downstream processing. If an external send fails afterward, a replay of the *same* webhook ID will not automatically retry; a new resident message uses a new ID. Monitor logs for failed sends. No resident phone number or message body is stored in the dedupe table. Old entries can be pruned after a suitable retention period.
