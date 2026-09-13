-- RWA Pocket-A Accounts Module
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.accounts_income_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts_expense_heads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now()
);


create table if not exists public.accounts_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_name text not null default 'RWA Pocket-A',
  account_no_last4 text,
  ifsc text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts_income_entries (
  id uuid primary key default gen_random_uuid(),
  receipt_date date not null,
  receipt_no text not null unique,
  income_head_id uuid references public.accounts_income_heads(id),
  income_head_name text not null,
  flat_id uuid,
  flat_no text,
  resident_name text,
  received_from text,
  payment_date date not null,
  maintenance_from date,
  maintenance_to date,
  payment_mode text not null check (payment_mode in ('CASH','CHEQUE','UPI')),
  cheque_no text,
  reference_no text,
  amount numeric(14,2) not null check (amount > 0),
  remarks text,
  attachment_url text,
  status text not null default 'POSTED' check (status in ('DRAFT','POSTED','VOID')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_expense_entries (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  voucher_no text not null unique,
  paid_to text not null,
  expense_head_id uuid references public.accounts_expense_heads(id),
  expense_head_name text not null,
  description text,
  payment_mode text not null check (payment_mode in ('CASH','CHEQUE','UPI')),
  cheque_no text,
  reference_no text,
  amount numeric(14,2) not null check (amount > 0),
  remarks text,
  attachment_url text,
  status text not null default 'POSTED' check (status in ('DRAFT','POSTED','VOID')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_bank_statements (
  id uuid primary key default gen_random_uuid(),
  statement_month date not null,
  file_name text not null,
  file_path text,
  file_type text,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now(),
  unique(statement_month, file_name)
);

create table if not exists public.accounts_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_statement_id uuid references public.accounts_bank_statements(id) on delete cascade,
  statement_month date not null,
  transaction_date date not null,
  description text,
  reference_no text,
  credit numeric(14,2) not null default 0 check (credit >= 0),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  balance numeric(14,2),
  reconciliation_status text not null default 'UNMATCHED' check (reconciliation_status in ('UNMATCHED','MATCHED','IGNORED')),
  matched_type text check (matched_type in ('INCOME','EXPENSE') or matched_type is null),
  matched_entry_id uuid,
  match_method text,
  created_at timestamptz not null default now(),
  check ((credit > 0 and debit = 0) or (debit > 0 and credit = 0) or (credit = 0 and debit = 0))
);

create table if not exists public.accounts_cash_bank_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  transfer_type text not null check (transfer_type in ('CASH_TO_BANK','BANK_TO_CASH')),
  amount numeric(14,2) not null check (amount > 0),
  reference_no text,
  description text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_month_closings (
  id uuid primary key default gen_random_uuid(),
  statement_month date not null unique,
  opening_cash numeric(14,2) not null default 0,
  opening_bank numeric(14,2) not null default 0,
  income_cash numeric(14,2) not null default 0,
  income_bank numeric(14,2) not null default 0,
  expense_cash numeric(14,2) not null default 0,
  expense_bank numeric(14,2) not null default 0,
  cash_deposited_to_bank numeric(14,2) not null default 0,
  cash_withdrawn_from_bank numeric(14,2) not null default 0,
  closing_cash numeric(14,2) not null default 0,
  closing_bank numeric(14,2) not null default 0,
  is_closed boolean not null default false,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_settings (
  id integer primary key default 1 check (id = 1),
  society_name text not null default 'RWA Pocket-A',
  society_subtitle text not null default 'Express View Apartment, Sector-105, Noida',
  financial_year_start_month integer not null default 4 check (financial_year_start_month between 1 and 12),
  receipt_prefix text not null default 'RCP',
  voucher_prefix text not null default 'VCH',
  enable_receipt_numbering boolean not null default true,
  enable_voucher_numbering boolean not null default true,
  allow_editing_entries boolean not null default true,
  enable_audit_log boolean not null default true,
  initial_opening_month date,
  initial_opening_cash numeric(14,2) not null default 0,
  initial_opening_bank numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.accounts_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.accounts_audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);

create or replace function public.accounts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.accounts_write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  audit_enabled boolean;
begin
  select enable_audit_log into audit_enabled from public.accounts_settings where id = 1;
  if coalesce(audit_enabled, true) = false then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    insert into public.accounts_audit_log(table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.accounts_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.accounts_audit_log(table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

-- updated_at triggers
DO $$
BEGIN
  if not exists (select 1 from pg_trigger where tgname = 'accounts_income_entries_updated_at') then
    create trigger accounts_income_entries_updated_at before update on public.accounts_income_entries for each row execute function public.accounts_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accounts_expense_entries_updated_at') then
    create trigger accounts_expense_entries_updated_at before update on public.accounts_expense_entries for each row execute function public.accounts_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accounts_cash_bank_transfers_updated_at') then
    create trigger accounts_cash_bank_transfers_updated_at before update on public.accounts_cash_bank_transfers for each row execute function public.accounts_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accounts_month_closings_updated_at') then
    create trigger accounts_month_closings_updated_at before update on public.accounts_month_closings for each row execute function public.accounts_set_updated_at();
  end if;
END $$;

-- audit triggers
DO $$
BEGIN
  if not exists (select 1 from pg_trigger where tgname = 'accounts_income_entries_audit') then
    create trigger accounts_income_entries_audit after insert or update or delete on public.accounts_income_entries for each row execute function public.accounts_write_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accounts_expense_entries_audit') then
    create trigger accounts_expense_entries_audit after insert or update or delete on public.accounts_expense_entries for each row execute function public.accounts_write_audit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'accounts_cash_bank_transfers_audit') then
    create trigger accounts_cash_bank_transfers_audit after insert or update or delete on public.accounts_cash_bank_transfers for each row execute function public.accounts_write_audit();
  end if;
END $$;

-- Seed master heads
insert into public.accounts_income_heads(name, display_order) values
  ('Maintenance Charges', 10),
  ('Car Sticker', 20),
  ('Challan', 30),
  ('Advertisement / Promotion', 40),
  ('Interest Received', 50),
  ('Other Income', 100)
on conflict (name) do nothing;

insert into public.accounts_expense_heads(name, display_order) values
  ('RWA Staff Salary', 10),
  ('Security / Guards Salary', 20),
  ('Housekeeping / Cleaning', 30),
  ('Horticulture Maintenance', 40),
  ('Electrical Maintenance', 50),
  ('Plumbing Maintenance', 60),
  ('Civil Maintenance', 70),
  ('CCTV / Camera Maintenance', 80),
  ('Water / Sewerage', 90),
  ('Garbage / Waste Disposal', 100),
  ('Bank Charges', 110),
  ('Office / Stationery', 120),
  ('Internet / Telephone', 130),
  ('Welfare / Events', 140),
  ('Vehicle / Transport', 150),
  ('Purchase of Materials', 160),
  ('Other Expense', 999)
on conflict (name) do nothing;

create index if not exists idx_accounts_income_date on public.accounts_income_entries(receipt_date);
create index if not exists idx_accounts_expense_date on public.accounts_expense_entries(expense_date);
create index if not exists idx_accounts_bank_txn_month on public.accounts_bank_transactions(statement_month, transaction_date);
create index if not exists idx_accounts_bank_txn_status on public.accounts_bank_transactions(reconciliation_status);
create index if not exists idx_accounts_transfer_date on public.accounts_cash_bank_transfers(transfer_date);

-- RLS: authenticated users can use Accounts. Tighten later if you introduce Treasurer/RWA role checks.
alter table public.accounts_income_heads enable row level security;
alter table public.accounts_expense_heads enable row level security;
alter table public.accounts_bank_accounts enable row level security;
alter table public.accounts_income_entries enable row level security;
alter table public.accounts_expense_entries enable row level security;
alter table public.accounts_bank_statements enable row level security;
alter table public.accounts_bank_transactions enable row level security;
alter table public.accounts_cash_bank_transfers enable row level security;
alter table public.accounts_month_closings enable row level security;
alter table public.accounts_settings enable row level security;
alter table public.accounts_audit_log enable row level security;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts_income_heads','accounts_expense_heads','accounts_bank_accounts','accounts_income_entries','accounts_expense_entries',
    'accounts_bank_statements','accounts_bank_transactions','accounts_cash_bank_transfers',
    'accounts_month_closings','accounts_settings','accounts_audit_log'
  ]
  LOOP
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_authenticated_all'
    ) then
      execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_authenticated_all', t);
    end if;
  END LOOP;
END $$;

-- Private storage buckets for optional supporting documents.
insert into storage.buckets(id, name, public) values ('accounts-documents', 'accounts-documents', false)
on conflict (id) do nothing;

DO $$
BEGIN
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='accounts_documents_authenticated_select') then
    create policy accounts_documents_authenticated_select on storage.objects for select to authenticated using (bucket_id='accounts-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='accounts_documents_authenticated_insert') then
    create policy accounts_documents_authenticated_insert on storage.objects for insert to authenticated with check (bucket_id='accounts-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='accounts_documents_authenticated_update') then
    create policy accounts_documents_authenticated_update on storage.objects for update to authenticated using (bucket_id='accounts-documents') with check (bucket_id='accounts-documents');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='accounts_documents_authenticated_delete') then
    create policy accounts_documents_authenticated_delete on storage.objects for delete to authenticated using (bucket_id='accounts-documents');
  end if;
END $$;
