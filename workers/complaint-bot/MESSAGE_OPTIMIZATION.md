# RWA Pocket-A — Bilingual, low-message WhatsApp complaint flow

## Implemented resident flow

1. Send `Hi`: one **bilingual category menu**. There is no language-selection question.
2. Select a category: new residents are asked once for their flat number; if a complaint was previously registered from the same WhatsApp mobile number, the most recently recorded valid flat is reused without a question.
3. If required by category, the bot asks only for **camera-recording date/time** or **issue type**. There is no Normal/Urgent question.
4. **Automatic registration** immediately after the last required input: for returning residents with a saved flat and a simple category, selecting the category itself registers the complaint. There is **no Register/Cancel or review question**.
5. **Residents cannot change a previously registered flat through WhatsApp.** The bot only displays the saved flat. A supervisor can update or clear the saved flat from the **Resident Flat Mapping** screen in the Supervisor dashboard or Complaint Center. If cleared, the next complaint asks the resident for their flat once.
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
- Supervisor flat update/clear uses an authenticated Worker API and the protected `whatsapp_resident_flat_mappings` table. A NULL flat overrides historical complaint flats, preventing cleared mappings from silently reappearing. Prior complaints remain unchanged.

## Expected message savings, excluding any repeated webhooks

| Scenario | Old workflow | New workflow |
|---|---|---|
| First-time plumber/electrician/sewerage resident | Language, category, flat, urgent, review, registration | Category, flat, registration (**3 outgoing messages**) |
| Returning plumber/electrician/sewerage resident | Category, flat, urgent, review, registration (language was previously remembered) | Category, registration (**2 outgoing messages**) |
| Resident confirms work is complete | Work done question, closing/rating request, rating thank-you | Work done question only |

Actual billed usage depends on Meta's message categories and delivery, not only the number of sends.

## Safe rollout for Supervisor Flat Mapping

**This new supervisor mapping feature is on a separate feature branch. It has not been deployed to production.**

- Existing live database migration for inbound webhook deduplication was applied in the previous release. This feature adds a **new, separate migration**: `supabase/migrations/20261101150000_supervisor_resident_flat_mapping.sql`.
- Apply the new migration **before** deploying the new Worker or the Supervisor UI. Do not merge an untested Worker: it reads the mapping table on every `Hi`.
- Run `node --test workers/complaint-bot/worker.optimization.test.mjs` and `npm run build` in CI.
- On staging, as a supervisor, look up a previously registered WhatsApp number; update the flat and verify the next `Hi` uses the new value.
- Clear the saved flat; confirm the next `Hi` still asks for a flat despite older complaints retaining their original flat number.
- Complete a new complaint after CLEAR; verify the freshly supplied flat becomes the saved flat for future complaints.
- Verify a non-supervisor or unauthenticated user cannot read or modify the mapping, and the UI is visible only to supervisors.
- Verify the resident's old `FLAT ...` command no longer modifies the stored flat.
- Continue to check existing category menus, immediate registration, queue position, plumber OTP and work-completion confirmation.
- Keep a Worker rollback available and confirm the GitHub/Cloudflare deployment separately.

The supervisor page makes no WhatsApp sends when a mapping is updated or cleared.

## Error handling

The dedupe claim happens before downstream processing. If an external send fails afterward, a replay of the *same* webhook ID will not automatically retry; a new resident message uses a new ID. Monitor logs for failed sends. No resident phone number or message body is stored in the dedupe table. Old entries can be pruned after a suitable retention period.
