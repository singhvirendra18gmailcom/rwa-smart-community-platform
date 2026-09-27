-- Resident complaint workflow: worker start OTP, live status, resident confirmation and rating.
-- Existing complaint rows are preserved.

alter table public.complaints
  add column if not exists work_start_otp text,
  add column if not exists otp_generated_at timestamptz,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_attempts integer not null default 0,
  add column if not exists work_started_at timestamptz,
  add column if not exists work_started_by uuid references auth.users(id),
  add column if not exists resident_confirmation boolean,
  add column if not exists resident_confirmed_at timestamptz,
  add column if not exists resident_rating smallint,
  add column if not exists rated_at timestamptz;

alter table public.complaints
  drop constraint if exists complaints_resident_rating_check;

alter table public.complaints
  add constraint complaints_resident_rating_check
  check (resident_rating is null or resident_rating between 1 and 5);

create index if not exists complaints_status_opened_at_idx
  on public.complaints(status, opened_at desc);

create index if not exists complaints_category_status_opened_at_idx
  on public.complaints(category_id, status, opened_at);

comment on column public.complaints.work_start_otp is
  'Temporary work-start OTP sent to resident when complaint is registered. Worker must verify before starting work.';
comment on column public.complaints.resident_confirmation is
  'true = resident confirmed resolved, false = resident reported not resolved, null = awaiting response.';
comment on column public.complaints.resident_rating is
  'Resident rating from 1 to 5 after confirming work is resolved.';
