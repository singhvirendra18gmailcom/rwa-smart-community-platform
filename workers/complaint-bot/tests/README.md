# Sponsor branding simulated tests

Run from the repository root:

```bash
node --test workers/complaint-bot/tests/sponsor-branding.test.mjs
```

Requires Node.js 20 or newer. Tests import the **actual feature-branch Worker source** and simulate a resident sending **1** at the complaint confirmation step. All calls to Supabase and Meta WhatsApp Graph API are intercepted in memory; no real complaints or WhatsApp messages are created. No credentials or Cloudflare deployment are required.

Scenarios: English, Hindi, expired sponsor, disabled sponsor, and sponsor-database failure.

**Scope:** This validates the registration confirmation integration. It does not replace a full conversation-flow test, staging WhatsApp test, or live delivery verification. Do not run `wrangler deploy` with the production Worker configuration for staging.
