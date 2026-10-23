-- Sponsor acknowledgement on complaint registration only.
-- Apply manually after review. This migration does not deploy the Worker.
create table if not exists public.chatbot_sponsors (
  id integer primary key default 1 check (id = 1),
  company_name varchar(120) not null check (length(trim(company_name)) > 0),
  contact_number varchar(20) not null check (contact_number ~ '^([+])?[0-9]{10,15}$'),
  start_date date not null,
  end_date date not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint chatbot_sponsor_date_order check (end_date >= start_date)
);

alter table public.chatbot_sponsors enable row level security;
revoke all on public.chatbot_sponsors from anon;
grant select, insert, update on public.chatbot_sponsors to authenticated;

-- Read/write limited to active operational administrators, executives and supervisors.
create policy "Sponsor management read" on public.chatbot_sponsors
  for select to authenticated
  using (exists (
    select 1 from public.app_users u
    where u.auth_user_id = auth.uid() and u.active = true
      and upper(replace(u.role::text, ' ', '_')) in ('ADMIN', 'RWA_EXECUTIVE', 'SUPERVISOR')
  ));

create policy "Sponsor management insert" on public.chatbot_sponsors
  for insert to authenticated
  with check (exists (
    select 1 from public.app_users u
    where u.auth_user_id = auth.uid() and u.active = true
      and upper(replace(u.role::text, ' ', '_')) in ('ADMIN', 'RWA_EXECUTIVE', 'SUPERVISOR')
  ));

create policy "Sponsor management update" on public.chatbot_sponsors
  for update to authenticated
  using (exists (
    select 1 from public.app_users u
    where u.auth_user_id = auth.uid() and u.active = true
      and upper(replace(u.role::text, ' ', '_')) in ('ADMIN', 'RWA_EXECUTIVE', 'SUPERVISOR')
  ))
  with check (exists (
    select 1 from public.app_users u
    where u.auth_user_id = auth.uid() and u.active = true
      and upper(replace(u.role::text, ' ', '_')) in ('ADMIN', 'RWA_EXECUTIVE', 'SUPERVISOR')
  ));
