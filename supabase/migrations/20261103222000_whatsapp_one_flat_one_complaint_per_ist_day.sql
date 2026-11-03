-- One WhatsApp-origin complaint per flat per Asia/Kolkata calendar day.
-- Existing duplicate rows are retained; this checks NEW inserts/flat changes only.
-- WEB complaints remain unrestricted by this rule.
--
-- Use a transaction-scoped advisory lock to prevent two concurrent Workers
-- from passing an application-only "already exists?" check simultaneously.
-- Common separators and spaces are ignored in the canonical flat key,
-- e.g. 36-D, 36 D and 36D are treated as one flat.

CREATE OR REPLACE FUNCTION public.rwa_guard_whatsapp_flat_daily_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  flat_key text;
  local_day date;
BEGIN
  IF NEW.source <> 'WHATSAPP' THEN
    RETURN NEW;
  END IF;

  flat_key := regexp_replace(upper(coalesce(NEW.flat_no, '')), '[^A-Z0-9]', '', 'g');
  local_day := (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date;

  -- All operations for this flat and IST day serialize on the same key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('rwa_whatsapp_daily:' || flat_key || ':' || local_day::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.complaints AS c
    WHERE c.source = 'WHATSAPP'
      AND c.id IS DISTINCT FROM NEW.id
      AND regexp_replace(upper(c.flat_no), '[^A-Z0-9]', '', 'g') = flat_key
      AND (c.created_at AT TIME ZONE 'Asia/Kolkata')::date = local_day
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'RWA_WHATSAPP_DAILY_FLAT_LIMIT',
      CONSTRAINT = 'rwa_whatsapp_daily_flat_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rwa_whatsapp_daily_flat_limit ON public.complaints;

CREATE TRIGGER rwa_whatsapp_daily_flat_limit
BEFORE INSERT OR UPDATE OF source, flat_no, created_at
ON public.complaints
FOR EACH ROW
EXECUTE FUNCTION public.rwa_guard_whatsapp_flat_daily_complaint();
