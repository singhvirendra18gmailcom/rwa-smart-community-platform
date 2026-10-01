-- Rollback for complaint priority metadata migration.
-- WARNING: running this intentionally removes the new metadata columns
-- and any values stored in them.

begin;

drop index if exists public.complaints_priority_active_idx;

alter table public.complaints
  drop column if exists urgency_reason,
  drop column if exists urgency_code,
  drop column if exists super_senior_citizen_alone,
  drop column if exists is_urgent;

commit;
