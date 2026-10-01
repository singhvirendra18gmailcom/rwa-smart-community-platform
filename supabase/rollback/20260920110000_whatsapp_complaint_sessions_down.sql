-- Rollback WhatsApp complaint session storage.
-- The priority-aware RPC is intentionally not reverted here because the previous
-- implementation depends on application policy; restore it from database history if needed.
drop table if exists public.whatsapp_complaint_sessions;
