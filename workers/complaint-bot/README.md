# RWA Pocket-A Complaint Bot

Cloudflare Worker for the RWA Pocket-A WhatsApp complaint service.

## Local/source-controlled deployment

From this directory:

```bash
npx wrangler deploy
```

Cloudflare production secrets must be configured separately and must **not** be committed:

- `WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The Worker supports English/Hindi complaint registration and the six RWA complaint categories.
