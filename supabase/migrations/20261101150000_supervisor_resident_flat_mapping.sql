-- Explicit, supervisor-managed flat number per WhatsApp mobile.
-- A NULL flat_no is a deliberate CLEAR override: the Worker must not
-- repopulate the old flat from historical complaints until a new complaint
-- supplies a new flat number.
CREATE TABLE IF NOT EXISTS public.whatsapp_resident_flat_mappings (
  mobile_no text PRIMARY KEY
    CHECK (mobile_no ~ '^91[6-9][0-9]{9}$'),
  flat_no varchar(25),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT whatsapp_flat_mappings_valid_flat
    CHECK (
      flat_no IS NULL OR
      (length(trim(flat_no)) BETWEEN 2 AND 25 AND
       upper(trim(flat_no)) NOT IN ('COMMON AREA','UNKNOWN','N/A','NA','NONE','NOT GIVEN'))
    )
);

COMMENT ON TABLE public.whatsapp_resident_flat_mappings IS
  'Supervisor-managed WhatsApp mobile to flat mapping. NULL means explicitly cleared, so history must not restore the old flat.';

ALTER TABLE public.whatsapp_resident_flat_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_resident_flat_mappings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_resident_flat_mappings TO service_role;

CREATE INDEX IF NOT EXISTS whatsapp_resident_flat_mappings_updated_at_idx
  ON public.whatsapp_resident_flat_mappings (updated_at DESC);
