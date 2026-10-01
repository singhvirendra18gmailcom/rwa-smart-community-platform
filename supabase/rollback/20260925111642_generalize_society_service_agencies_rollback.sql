delete from public.society_service_agencies
where agency_code in (
  'PARK_PLUS',
  'MYGATE',
  'CAMERA_AMC',
  'LED_AMC',
  'SEWERAGE',
  'HORTICULTURE',
  'PARK_MAINTENANCE',
  'AUTHORITY_SWEEPING'
);

alter table public.society_service_agencies
  drop column if exists notes,
  drop column if exists service_label,
  drop column if exists service_type;

alter table public.society_service_agencies
  rename to street_light_agencies;
