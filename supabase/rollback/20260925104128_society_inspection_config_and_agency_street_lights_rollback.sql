-- Roll back only the new Society Inspection configuration / agency street-light model.
-- Existing tower, park and legacy street-light tables are intentionally untouched.
drop table if exists public.street_light_fault_locations;
drop table if exists public.street_light_agency_daily_inspections;
drop table if exists public.street_light_agencies;
drop table if exists public.society_inspection_settings;
