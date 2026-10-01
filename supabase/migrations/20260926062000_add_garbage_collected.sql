alter table public.society_daily_inspections
  add column if not exists garbage_collected boolean;
