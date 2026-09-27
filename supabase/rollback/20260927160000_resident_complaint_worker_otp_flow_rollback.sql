-- Rollback resident complaint worker/OTP/rating workflow metadata.
drop index if exists public.complaints_category_status_opened_at_idx;
drop index if exists public.complaints_status_opened_at_idx;

alter table public.complaints
  drop constraint if exists complaints_resident_rating_check,
  drop column if exists rated_at,
  drop column if exists resident_rating,
  drop column if exists resident_confirmed_at,
  drop column if exists resident_confirmation,
  drop column if exists work_started_by,
  drop column if exists work_started_at,
  drop column if exists otp_attempts,
  drop column if exists otp_verified_at,
  drop column if exists otp_generated_at,
  drop column if exists work_start_otp;
