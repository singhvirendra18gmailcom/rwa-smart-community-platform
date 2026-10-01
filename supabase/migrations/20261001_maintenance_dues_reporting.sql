-- Maintenance dues / defaulter reporting
-- Run once in Supabase SQL Editor before using the Maintenance Dues screen.

create table if not exists public.accounts_maintenance_rates (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  notes text,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_maintenance_rates_month_start_check
    check (effective_from = date_trunc('month', effective_from)::date)
);

create index if not exists idx_accounts_maintenance_rates_effective
  on public.accounts_maintenance_rates(effective_from);

create index if not exists idx_accounts_income_flat
  on public.accounts_income_entries(flat_no);

create index if not exists idx_accounts_income_maintenance_period
  on public.accounts_income_entries(maintenance_from, maintenance_to);

alter table public.accounts_maintenance_rates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'accounts_maintenance_rates'
      and policyname = 'accounts_maintenance_rates_authenticated_all'
  ) then
    create policy accounts_maintenance_rates_authenticated_all
      on public.accounts_maintenance_rates
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'accounts_maintenance_rates_updated_at'
  ) then
    create trigger accounts_maintenance_rates_updated_at
      before update on public.accounts_maintenance_rates
      for each row
      execute function public.accounts_set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'accounts_maintenance_rates_audit'
  ) then
    create trigger accounts_maintenance_rates_audit
      after insert or update or delete on public.accounts_maintenance_rates
      for each row
      execute function public.accounts_write_audit();
  end if;
end $$;
