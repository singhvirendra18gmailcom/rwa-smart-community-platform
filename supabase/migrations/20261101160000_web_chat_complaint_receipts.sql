-- Web fallback stores an opaque, unguessable per-complaint receipt ID.
-- Existing WhatsApp complaints keep NULL and are unaffected.
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS web_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS complaints_web_request_id_uidx
  ON public.complaints (web_request_id)
  WHERE web_request_id IS NOT NULL;

COMMENT ON COLUMN public.complaints.web_request_id IS
  'Random bearer receipt ID for login-free web chatbot complaints; never expose in public listing or share URLs.';
