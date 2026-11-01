-- Deduplicate WhatsApp Cloud API inbound message webhooks before any side effects.
-- Apply this migration BEFORE deploying the optimized Cloudflare Worker.
-- Meta may retry identical message IDs; only the first insert should succeed.
create table if not exists public.whatsapp_inbound_message_dedupe (
  message_id text primary key check (length(message_id) between 1 and 255),
  received_at timestamptz not null default now()
);

comment on table public.whatsapp_inbound_message_dedupe is
  'Inbound WhatsApp provider message IDs used for atomic delivery deduplication. No phone numbers or message bodies are stored.';

alter table public.whatsapp_inbound_message_dedupe enable row level security;

-- Only the Cloudflare Worker using the Supabase service-role credential may claim IDs.
revoke all on table public.whatsapp_inbound_message_dedupe from anon, authenticated;
grant select, insert on table public.whatsapp_inbound_message_dedupe to service_role;

-- Optional maintenance, run manually when needed (not during a live incident):
-- delete from public.whatsapp_inbound_message_dedupe
-- where received_at < now() - interval '35 days';
