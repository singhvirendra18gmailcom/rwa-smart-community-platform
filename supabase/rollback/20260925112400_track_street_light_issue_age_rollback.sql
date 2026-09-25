alter table public.street_light_fault_locations
  drop column if exists issue_id;

drop table if exists public.street_light_issues;

alter table public.society_inspection_settings
  drop column if exists rwa_contact_mobile,
  drop column if exists rwa_contact_name,
  drop column if exists supervisor_contact_mobile,
  drop column if exists supervisor_contact_name;
