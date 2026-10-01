alter table public.street_light_fault_locations
  add column if not exists faulty_count integer not null default 1
  check (faulty_count >= 1 and faulty_count <= 200);

alter table public.street_light_agency_daily_inspections
  add column if not exists complaint_status text not null default 'NOT_REQUIRED',
  add column if not exists complaint_opened_at timestamptz,
  add column if not exists complaint_sent_at timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.street_light_agency_daily_inspections
  drop constraint if exists street_light_agency_daily_inspections_complaint_status_check;

alter table public.street_light_agency_daily_inspections
  add constraint street_light_agency_daily_inspections_complaint_status_check
  check (
    complaint_status in (
      'NOT_REQUIRED',
      'PENDING',
      'WHATSAPP_OPENED',
      'SENT',
      'DONE'
    )
  );
