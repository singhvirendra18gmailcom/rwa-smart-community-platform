alter table public.street_light_agencies
  rename to society_service_agencies;

alter table public.society_service_agencies
  add column if not exists service_type text not null default 'STREET_LIGHT',
  add column if not exists service_label text,
  add column if not exists notes text;

update public.society_service_agencies
set service_type = 'STREET_LIGHT',
    service_label = coalesce(service_label, 'Street Lights')
where agency_code in ('UPPCL','TATA');

insert into public.society_service_agencies
  (agency_code, agency_name, service_type, service_label, display_order, active)
values
  ('PARK_PLUS', 'Park+', 'ENTRY_EXIT_BARRIER', 'Entry / Exit Gate Barrier', 10, true),
  ('MYGATE', 'MyGate App', 'MYGATE_APP', 'MyGate App', 20, true),
  ('CAMERA_AMC', 'Camera AMC', 'CAMERA_AMC', 'CCTV / Camera AMC', 30, true),
  ('LED_AMC', 'LED AMC', 'LED_AMC', 'LED Screen AMC', 40, true),
  ('SEWERAGE', 'Sewerage', 'SEWERAGE', 'Sewerage', 50, true),
  ('HORTICULTURE', 'Horticulture', 'HORTICULTURE', 'Horticulture', 60, true),
  ('PARK_MAINTENANCE', 'Park Maintenance', 'PARK_MAINTENANCE', 'Park Maintenance', 70, true),
  ('AUTHORITY_SWEEPING', 'Authority Sweeping', 'AUTHORITY_SWEEPING', 'Authority Sweeping', 80, true)
on conflict (agency_code) do update
set agency_name = excluded.agency_name,
    service_type = excluded.service_type,
    service_label = excluded.service_label,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();
