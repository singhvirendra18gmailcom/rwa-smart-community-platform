-- Complaint priority metadata for WhatsApp complaint registration
-- Priority is derived in the application:
--   1 = urgent
--   2 = super senior citizen (70+) and alone
--   3 = normal
-- Existing rows remain non-urgent/non-super-senior by default.

begin;

alter table public.complaints
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgency_code text,
  add column if not exists urgency_reason text,
  add column if not exists super_senior_citizen_alone boolean not null default false;

comment on column public.complaints.is_urgent is
  'True only when the complaint matches an approved urgent condition.';

comment on column public.complaints.urgency_code is
  'Stable application code for the selected urgent reason.';

comment on column public.complaints.urgency_reason is
  'Human-readable urgent reason captured during complaint registration.';

comment on column public.complaints.super_senior_citizen_alone is
  'Resident confirmed they are age 70+ and living alone.';

create index if not exists complaints_priority_active_idx
  on public.complaints (
    is_urgent desc,
    super_senior_citizen_alone desc,
    created_at asc
  );

commit;
