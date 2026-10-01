alter table public.society_service_complaints
  add column if not exists resolved_at timestamptz;

alter table public.society_service_complaints
  drop constraint if exists society_service_complaints_status_check;

alter table public.society_service_complaints
  add constraint society_service_complaints_status_check
  check (
    status in (
      'PENDING',
      'WHATSAPP_OPENED',
      'SENT',
      'NOT_REQUIRED',
      'DONE'
    )
  );
