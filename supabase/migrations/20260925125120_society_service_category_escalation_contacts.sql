create table if not exists public.society_service_categories (
  service_type text primary key,
  service_label text not null,
  supervisor_name text,
  supervisor_mobile text,
  rwa_name text,
  rwa_mobile text,
  display_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.society_service_categories (
  service_type,
  service_label,
  display_order,
  active
)
select
  service_type,
  min(coalesce(service_label, service_type)),
  min(display_order),
  true
from public.society_service_agencies
where service_type is not null
group by service_type
on conflict (service_type) do update
set service_label = excluded.service_label,
    display_order = least(public.society_service_categories.display_order, excluded.display_order),
    updated_at = now();

insert into public.society_service_categories (
  service_type,
  service_label,
  display_order,
  active
)
values ('OTHER', 'Other', 999, true)
on conflict (service_type) do nothing;

update public.society_service_categories c
set supervisor_name = coalesce(c.supervisor_name, s.supervisor_contact_name),
    supervisor_mobile = coalesce(c.supervisor_mobile, s.supervisor_contact_mobile),
    rwa_name = coalesce(c.rwa_name, s.rwa_contact_name),
    rwa_mobile = coalesce(c.rwa_mobile, s.rwa_contact_mobile),
    updated_at = now()
from public.society_inspection_settings s
where c.service_type = 'STREET_LIGHT'
  and s.id = 1;

alter table public.society_service_categories enable row level security;

grant select, insert, update on public.society_service_categories to authenticated;

create policy "Authenticated users can read service categories"
  on public.society_service_categories
  for select to authenticated
  using (true);

create policy "Authenticated users can insert service categories"
  on public.society_service_categories
  for insert to authenticated
  with check (true);

create policy "Authenticated users can update service categories"
  on public.society_service_categories
  for update to authenticated
  using (true)
  with check (true);
