drop table if exists public.street_light_notifications;

alter table public.street_light_agencies
  drop column if exists mobile_no,
  drop column if exists contact_name;
