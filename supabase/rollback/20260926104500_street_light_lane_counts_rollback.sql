alter table public.street_light_agency_daily_inspections
  drop constraint if exists street_light_agency_daily_inspections_complaint_status_check;

alter table public.street_light_agency_daily_inspections
  drop column if exists complaint_status,
  drop column if exists complaint_opened_at,
  drop column if exists complaint_sent_at,
  drop column if exists resolved_at;

alter table public.street_light_fault_locations
  drop column if exists faulty_count;
